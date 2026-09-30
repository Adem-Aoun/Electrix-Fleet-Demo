'use strict';

async function toggleActuator(deviceId, actuatorId) {
  if (!can('toggle')) { toast('Permission denied', { type:'error' }); return; }
  const d = deviceById(deviceId); if (!d) return;
  const c = d.capabilities.find(x => x.id === actuatorId); if (!c) return;
  const block = isBlocked(deviceId, actuatorId);
  if (block) {
    const w = block.rule.when, condDev = deviceById(w.device_id);
    toast('Automation rule blocked', { msg:`${block.rule.name} — ${condDev?.name || w.device_id} is ${w.value}`, type:'error', timeout:5200 });
    audit('automation.block', `${deviceId}/${actuatorId}`, block.rule.id);
    return;
  }
  if (!c.online || d.lwt !== 'online') { toast('Device offline', { type:'error' }); return; }
  const newValue = !c.value;
  c.pending = true; renderMain();
  const requestId = uid();
  const t = toast('Sending…', { msg:`cmd/${actuatorId}/set`, type:'info', timeout:0 });
  try {
    await mqtt.publish(`electrix/${d.device_id}/cmd/${actuatorId}/set`, { value:newValue, request_id:requestId, source:'human' }, { qos:2 });
    setTimeout(() => { mqtt.inject(`electrix/${d.device_id}/ack/${requestId}`, { status:'ok', echoed_value:newValue }); }, 350 + Math.random() * 400);
    await waitForAck(requestId, 5000);
    setCapabilityValue(c, newValue); c.pending = false;
    COMMAND_HISTORY.unshift({ ts:Date.now(), device_id:deviceId, actuator:actuatorId, value:newValue, request_id:requestId, status:'ok', source:'human' });
    if (COMMAND_HISTORY.length > 100) COMMAND_HISTORY.pop();
    audit('toggle', `${d.device_id}/${actuatorId}`, `→ ${newValue}`);
    ACTIVITY.unshift({ t:0, text:`${state.user.username} toggled ${c.label}` });
    t.close();
    toast('Applied', { msg:`${c.label} → ${newValue ? 'ON' : 'OFF'}`, type:'ok' });
  } catch (e) {
    c.pending = false;
    COMMAND_HISTORY.unshift({ ts:Date.now(), device_id:deviceId, actuator:actuatorId, value:newValue, request_id:requestId, status:'error', source:'human' });
    if (COMMAND_HISTORY.length > 100) COMMAND_HISTORY.pop();
    t.close();
    toast('Command failed', { msg:e.message || 'no ack', type:'error' });
  }
  renderMain();
}
async function ackAlarm(id) {
  if (!can('ack')) { toast('Permission denied', { type:'error' }); return; }
  const a = ALARMS.find(x => x.id === id); if (!a) return;
  const ok = await confirmModal({
    title:'Acknowledge alarm',
    message:'Silences repeat notification. State stays UNACK_ALARM until the device transitions it.',
    confirmText:'Acknowledge',
    extraHtml:`<div class="m-extra"><label class="field-label">Operator note (optional)</label><textarea id="ackNote" rows="3" placeholder="Investigating…"></textarea></div>`,
  });
  if (!ok) return;
  const note = $('#ackNote')?.value.trim() || '';
  a.acked = true; a.ack_by = state.user.username; if (note) a.note = note;
  audit('alarm.ack', a.code, `by ${state.user.username}`);
  ACTIVITY.unshift({ t:0, text:`${state.user.username} acknowledged ${a.code}` });
  toast('Alarm acknowledged', { msg:a.code, type:'ok' });
  renderMain();
}
async function shelveAlarm(id) {
  if (!can('shelve')) { toast('Permission denied', { type:'error' }); return; }
  const a = ALARMS.find(x => x.id === id); if (!a) return;
  const ok = await confirmModal({
    title:'Shelve alarm', message:'Suppresses notifications for 1 hour.',
    confirmText:'Shelve for 1h',
    extraHtml:`<div class="m-extra"><label class="field-label">Reason (required)</label><input type="text" id="shelveReason" placeholder="Planned maintenance"></div>`,
  });
  if (!ok) return;
  const reason = $('#shelveReason')?.value.trim();
  if (!reason) { toast('Reason required', { type:'error' }); return; }
  a.shelved_until = Date.now() + 3600_000;
  a.note = (a.note ? a.note + ' · ' : '') + `Shelved: ${reason}`;
  audit('alarm.shelve', a.code, reason);
  toast('Alarm shelved for 1h', { msg:a.code, type:'warn' });
  renderMain();
}
async function unshelveAlarm(id) {
  const a = ALARMS.find(x => x.id === id); if (!a) return;
  a.shelved_until = null; audit('alarm.unshelve', a.code);
  toast('Alarm unshelved', { type:'info' });
  renderMain();
}
async function rebootDevice(d) {
  if (!can('toggle')) return;
  const ok = await confirmModal({
    title:'Reboot device?', message:`${d.name} will restart.`,
    confirmText:'Reboot',
    extraHtml:`<div class="m-extra"><label class="field-label">Delay (seconds)</label><input type="number" inputmode="numeric" id="rebootDelay" value="5" style="width:100px"></div>`,
  });
  if (!ok) return;
  const delay = parseInt($('#rebootDelay')?.value, 10) || 5;
  const requestId = uid();
  toast('Reboot queued', { msg:`${d.name} · in ${delay}s`, type:'info' });
  await mqtt.publish(`electrix/${d.device_id}/cmd/system/reboot`, { request_id:requestId, delay_s:delay }, { qos:2 });
  audit('device.reboot', d.device_id, `delay=${delay}s`);
  setTimeout(() => { d.last_seen_s = 0; d.lwt = 'online'; renderMain(); toast('Device back online', { msg:d.name, type:'ok' }); }, delay * 1000 + 800);
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
  const requestId = uid();
  await mqtt.publish(`electrix/${d.device_id}/cmd/system/factory_reset`, { request_id:requestId, confirm_token:'X' }, { qos:2 });
  audit('device.factory_reset', d.device_id);
  toast('Factory reset sent', { msg:d.name, type:'warn' });
}
async function queryState(d) {
  const requestId = uid();
  toast('Querying state…', { type:'info', timeout:1500 });
  await mqtt.publish(`electrix/${d.device_id}/cmd/system/get`, { request_id:requestId }, { qos:1 });
  audit('device.query_state', d.device_id);
  setTimeout(() => {
    d.capabilities.forEach(c => { if (c.kind === 'relay') setCapabilityValue(c, Math.random() > 0.5); });
    renderMain();
    toast('State refreshed', { msg:`${d.capabilities.length} capabilities`, type:'ok' });
  }, 500);
}
async function saveConfig(d) {
  if (!can('rename')) return;
  const inputs = $$('[data-cfg]');
  const next = { ...d.config };
  inputs.forEach(inp => {
    const key = inp.dataset.cfg;
    next[key] = inp.type === 'checkbox' ? inp.checked : (parseInt(inp.value, 10) || d.config[key]);
  });
  const requestId = uid();
  await mqtt.publish(`electrix/${d.device_id}/config/set`, { ...next, request_id:requestId }, { qos:1 });
  d.config = next;
  audit('device.config_set', d.device_id, JSON.stringify(next));
  toast('Config saved', { msg:`${d.name} · ${Object.keys(next).length} params`, type:'ok' });
  renderMain();
}
async function matchSiblingConfig(d, key) {
  const allowed = new Set(['sensor_publish_period_ms','heartbeat_period_ms','feature_agg_telemetry_enabled','feature_threshold_events_enabled']);
  if (!allowed.has(key) || !can('rename')) { toast('Permission denied', { type:'error' }); return; }
  const value = siblingConfigMode(d, key);
  if (value === undefined) { toast('No sibling value available', { type:'error' }); return; }
  const next = { ...d.config, [key]:value }, requestId = uid();
  try {
    await mqtt.publish(`electrix/${d.device_id}/config/set`, { ...next, request_id:requestId }, { qos:1 });
    d.config = next;
    audit('device.config_set', d.device_id, JSON.stringify(next));
    toast('Config matched', { msg:`${key} · ${String(value)}`, type:'ok' });
    renderMain();
  } catch (error) {
    toast('Config update failed', { msg:error.message || 'publish failed', type:'error' });
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
    const block = isBlocked(d.device_id, c.id);
    const toggle = isRelay
      ? `<button class="toggle ${c.value ? 'on' : ''} ${c.pending ? 'pending' : ''}" data-toggle-device="${d.device_id}" data-toggle-cap="${c.id}" ${controllable && c.online && !block ? '' : 'disabled'}></button>`
      : `<span class="mono" style="font-size:12px;color:var(--content-dim);">${esc(c.value)}</span>`;
    return `<div class="cap-row"><div class="cap-icon">${icon(capIcon(c.kind))}</div>
      <div class="cap-info"><input class="cap-label-edit" value="${esc(c.label)}" data-cap-id="${c.id}" ${editable ? '' : 'disabled'}>
      <div class="cap-id mono">${c.id}</div>
      ${block ? `<div style="font-size:10.5px;color:var(--alarm);margin-top:3px;">${icon('ban')} ${esc(block.rule.name)}</div>` : ''}</div>${toggle}</div>`;
  }).join('');
  const currentKey = `${d.device_id}/current`;
  drawer.innerHTML = `<div class="drawer-head">
    <div style="flex:1;min-width:0;display:flex;gap:10px;align-items:flex-start;">
      <span class="cap-icon" style="width:36px;height:36px;background:var(--surface-2);">${icon(deviceTypeIcon(d.device_type))}</span>
      <div style="min-width:0;">
        <div style="font-size:17px;font-weight:700;">${esc(d.name)}</div>
        <div class="drawer-sub"><span class="status-dot ${cls}" style="margin-right:6px;"></span>${esc(siteName(d.site_id))} · <span class="mono">${d.device_id}</span></div>
      </div>
    </div>
    <button class="drawer-close" id="drawerClose" aria-label="Close">${icon('x')}</button>
  </div>
  <div class="drawer-body">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
      ${freshnessHTML(d)}
      <span style="font-size:12px;color:var(--content-dim);">seen ${fmtAgo(d.last_seen_s)}</span>
      <span class="mono" style="font-size:11px;color:var(--content-faint);margin-left:auto;display:inline-flex;align-items:center;gap:5px;">${icon('zap')}${TELEMETRY[currentKey]?.history.at(-1)?.v ?? '—'} A</span>
    </div>
    <div class="section-title">Capabilities</div>${caps}
    <div class="section-title">Quick actions</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn" data-nav="${deviceRoute(d.device_id)}">${icon('external-link')}Open</button>
      <button class="btn" data-act="query-state" ${controllable ? '' : 'disabled'}>${icon('refresh-cw')}Query</button>
      <button class="btn danger" data-act="reboot" ${controllable ? '' : 'disabled'}>${icon('rotate-cw')}Reboot</button>
    </div>
  </div>`;
  refreshIcons(drawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
}
