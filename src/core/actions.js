  await mqtt.refreshSnapshot();
'use strict';

async function toggleActuator(deviceId, actuatorId) {
  if (!can('toggle')) { toast('Permission denied', { type:'error' }); return; }
  const d = deviceById(deviceId); if (!d) return;
  const c = d.capabilities.find(x => x.id === actuatorId); if (!c) return;
  const block = typeof isBlocked === 'function' ? isBlocked(deviceId, actuatorId) : null;
  if (block) {
    toast('Automation rule blocked', { msg:`${block.rule.name}`, type:'error' });
    return;
  }
  if (!c.online || d.lwt !== 'online') { toast('Device offline', { type:'error' }); return; }
  const newValue = !c.value;
  c.pending = true; renderMain();
  const requestId = uid();
  try {
    await mqtt.publish(`electrix/${d.device_id}/cmd/${actuatorId}/set`, { value:newValue, request_id:requestId, source:'human' }, { qos:2 });
    await waitForAck(requestId, 5000);
    setCapabilityValue(c, newValue); c.pending = false;
    COMMAND_HISTORY.unshift({ ts:Date.now(), device_id:deviceId, actuator:actuatorId, value:newValue, request_id:requestId, status:'ok', source:'human' });
    if (COMMAND_HISTORY.length > 100) COMMAND_HISTORY.pop();
    toast('Applied', { msg:`${c.label} → ${newValue ? 'ON' : 'OFF'}`, type:'ok' });
  } catch (e) {
    c.pending = false;
    COMMAND_HISTORY.unshift({ ts:Date.now(), device_id:deviceId, actuator:actuatorId, value:newValue, request_id:requestId, status:'error', source:'human' });
    if (COMMAND_HISTORY.length > 100) COMMAND_HISTORY.pop();
    toast('Command failed', { msg:e.message || 'no ack', type:'error' });
  }
  renderMain();
}

async function ackAlarm(id) {
  if (!can('ack')) { toast('Permission denied', { type:'error' }); return; }
  const a = ALARMS.find(x => x.id === id); if (!a) return;
  const ok = await confirmModal({
    title:'Acknowledge alarm',
    message:'Silences repeat notification.',
    confirmText:'Acknowledge',
  });
  if (!ok) return;
  try {
    await mqtt.acknowledgeAlarm(a.device_id, a.type);
  } catch (e) {
    toast('Acknowledgement failed', { msg:e.message || 'Device did not accept the request', type:'error' });
    return;
  }
  audit('alarm.ack', a.code, `sent by ${state.user.username}`);
  toast('Acknowledgement sent', { msg:`${a.code}; waiting for device state`, type:'ok' });
  renderMain();
}

async function rebootDevice(d) {
  if (!can('toggle')) return;
  const ok = await confirmModal({ title:'Reboot device?', message:`${d.name} will restart.`, confirmText:'Reboot' });
  if (!ok) return;
  try {
    const result = await mqtt.rebootDevice(d.device_id);
    audit('device.reboot', d.device_id, result.request_id);
    toast('Reboot requested', { msg:d.name, type:'ok' });
  } catch (e) {
    toast('Reboot failed', { msg:e.message || 'unknown error', type:'error', timeout: 6000 });
  }
}

async function factoryReset(d) {
  if (!can('toggle')) return;
  const ok = await confirmModal({
    title:'Factory reset',
    message:`Wipes configuration and credentials on ${d.name}.`,
    confirmText:'Factory reset', danger:true,
    requireText: d.device_id.slice(-6),
  });
  if (!ok) return;
  try {
    const result = await mqtt.factoryResetDevice(d.device_id, d.device_id.slice(-6));
    audit('device.factory_reset', d.device_id, result.request_id);
    toast('Factory reset requested', { msg:d.name, type:'warn' });
  } catch (e) {
    toast('Factory reset failed', { msg:e.message || 'unknown error', type:'error', timeout: 6000 });
  }
}

async function queryState(d) {
  try {
    await mqtt.refreshSnapshot();
    audit('device.state_refresh', d.device_id);
    toast('Latest state refreshed', { msg:'Loaded the most recent state stored by the backend.', type:'info' });
  } catch (e) {
    toast('Refresh failed', { msg:e.message || 'Backend request failed', type:'error' });
  }
}

function openDrawer(deviceId) {
  state.drawerDeviceId = deviceId;
  renderDrawer();
  $('#overlay').classList.add('open');
  $('#drawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  $('#overlay').classList.remove('open');
  $('#drawer').classList.remove('open');
  state.drawerDeviceId = null;
  document.body.style.overflow = '';
}
function renderDrawer() {
  const d = deviceById(state.drawerDeviceId);
  const drawer = $('#drawer');
  if (!d) { drawer.innerHTML = ''; return; }
  const st = deriveStatus(d), cls = statusClass(st);
  const editable = can('rename'), controllable = can('toggle');
  const caps = d.capabilities.map(c => {
    const isRelay = c.kind === 'relay';
    const block = typeof isBlocked === 'function' ? isBlocked(d.device_id, c.id) : null;
    const toggle = isRelay
      ? `<button class="toggle ${c.value ? 'on' : ''} ${c.pending ? 'pending' : ''}" data-toggle-device="${d.device_id}" data-toggle-cap="${c.id}" ${controllable && c.online && !block ? '' : 'disabled'}></button>`
      : `<span class="mono" style="font-size:12px;color:var(--content-dim);">${esc(c.value)}</span>`;
    return `<div class="cap-row"><div class="cap-icon">${icon(capIcon(c.kind))}</div>
      <div class="cap-info"><input class="cap-label-edit" value="${esc(c.label)}" data-cap-id="${c.id}" ${editable ? '' : 'disabled'}>
      <div class="cap-id mono">${c.id}</div></div>${toggle}</div>`;
  }).join('');
  drawer.innerHTML = `<div class="drawer-head">
    <div style="flex:1;min-width:0;display:flex;gap:10px;align-items:flex-start;">
      <span class="cap-icon" style="width:36px;height:36px;background:var(--surface-2);">${icon(deviceTypeIcon(d.device_type))}</span>
      <div style="min-width:0;">
        <div style="font-size:17px;font-weight:700;">${esc(d.name)}</div>
        <div class="drawer-sub"><span class="status-dot ${cls}" style="margin-right:6px;"></span>${esc(siteName(d.site_id) || 'Unassigned')} · <span class="mono">${d.device_id}</span></div>
      </div>
    </div>
    <button class="drawer-close" id="drawerClose" aria-label="Close">${icon('x')}</button>
  </div>
  <div class="drawer-body">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
      ${freshnessHTML(d)}
      <span style="font-size:12px;color:var(--content-dim);">seen ${fmtAgo(d.last_seen_s)}</span>
    </div>
    <div class="section-title">Capabilities</div>${caps}
    <div class="section-title">Quick actions</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn" data-nav="${deviceRoute(d.device_id)}">${icon('external-link')}Open</button>
      <button class="btn" data-act="query-state">${icon('refresh-cw')}Refresh</button>
      <button class="btn danger" data-act="reboot" ${controllable ? '' : 'disabled'}>${icon('rotate-cw')}Reboot</button>
    </div>
  </div>`;
  refreshIcons(drawer);
  $('#drawerClose')?.addEventListener('click', closeDrawer);
}

// ---------------------------------------------------------------------------
// Device onboarding — assign a newly discovered device to a site.
// ---------------------------------------------------------------------------

async function openDeviceOnboarding(deviceOrId) {
  const device = typeof deviceOrId === 'string'
    ? deviceById(deviceOrId)
    : deviceOrId;

  if (!device) {
    toast('Device not found', { type: 'error' });
    return;
  }

  // Refresh the site list, but never block the modal on it.
  try { await mqtt.refreshSites(); } catch (e) { /* ignore */ }

  const siteRows = (SITES || []).map(s =>
    `<option value="${esc(s.id)}" ${device.site_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`
  ).join('');

  const capSummary = (device.capabilities || []).map(c =>
    `<span class="auto-tag-type" style="margin-right:4px;">${esc(c.kind)}:${esc(c.id)}</span>`
  ).join('') || '<span style="color:var(--content-faint)">none reported yet</span>';

  openSheet({
    title: device.site_id ? 'Change site' : 'Assign device to a site',
    bodyHtml: `
      <div class="m-row">
        <div style="display:flex;gap:12px;align-items:center;padding:12px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);">
          <span class="cap-icon" style="width:40px;height:40px;background:var(--surface);">${icon(deviceTypeIcon(device.device_type))}</span>
          <div style="min-width:0;">
            <div style="font-weight:600;font-size:14px;">${esc(device.name || device.device_id)}</div>
            <div class="mono" style="font-size:11px;color:var(--content-faint);">${esc(device.device_id)}</div>
          </div>
        </div>
      </div>

      <div class="m-row">
        <label class="field-label">Reported capabilities</label>
        <div style="line-height:1.9;">${capSummary}</div>
      </div>

      <div class="m-row">
        <label class="field-label">Site</label>
        <select id="onboardSite" style="width:100%;padding:11px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
          <option value="">— Unassigned —</option>
          ${siteRows}
          <option value="__new__">+ Create new site…</option>
        </select>
      </div>

      <div class="m-row" id="onboardNewSiteRow" style="display:none;">
        <label class="field-label">New site name</label>
        <input type="text" id="onboardNewSiteName" placeholder="e.g. Warehouse C"
               style="width:100%;padding:11px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
      </div>

      <div class="btn-row">
        <button class="btn" id="onboardCancel" type="button">Cancel</button>
        <button class="btn primary" id="onboardSave" type="button">${icon('check')}Assign</button>
      </div>`,
    onMount: (wrap, close) => {
      const select   = wrap.querySelector('#onboardSite');
      const newRow   = wrap.querySelector('#onboardNewSiteRow');
      const newInput = wrap.querySelector('#onboardNewSiteName');

      if (device.site_id) select.value = device.site_id;

      select.addEventListener('change', () => {
        const isNew = select.value === '__new__';
        newRow.style.display = isNew ? '' : 'none';
        if (isNew) setTimeout(() => newInput.focus(), 30);
      });

      wrap.querySelector('#onboardCancel').addEventListener('click', () => close());

      wrap.querySelector('#onboardSave').addEventListener('click', async () => {
        const val = select.value;
        const btn = wrap.querySelector('#onboardSave');
        btn.disabled = true;

        try {
          let siteId = val;

          if (val === '__new__') {
            const name = newInput.value.trim();
            if (!name) {
              toast('New site name required', { type: 'error' });
              btn.disabled = false;
              return;
            }
            const site = await mqtt.createSite(name);
            siteId = site.id;
          } else if (val === '') {
            siteId = null;
          }

          await mqtt.assignDeviceSite(device.device_id, siteId);

          const siteLabel = siteId ? (SITES.find(s => s.id === siteId)?.name || siteId) : 'Unassigned';
          audit('device.assign_site', device.device_id, siteLabel);
          toast('Device assigned', { msg: `${device.device_id} → ${siteLabel}`, type: 'ok' });
          close(true);

          try { renderMain(); } catch (e) { console.error('[onboarding] renderMain failed:', e); }
        } catch (err) {
          console.error('[onboarding] assign failed:', err);
          toast('Assign failed', { msg: err.message || 'unknown error', type: 'error' });
          btn.disabled = false;
        }
      });
    },
  });
}