'use strict';

function renderAutomation(main) {
  const tab = state.autoTab;
  main.innerHTML = `
    <div class="main-head">
      <h1>Automation</h1>
      <div class="main-head-actions"><span class="count">${SCHEDULES.filter(s => s.enabled).length} on · ${SCENES.filter(s => s.enabled).length} scenes</span></div>
    </div>
    <div class="not-live">
      <div class="nl-icon">${icon('alert-triangle')}</div>
      <div class="nl-body">
        <b>Demo data</b>
        The on-device automation component (<span class="mono">components/automation/</span>)
        hasn't shipped. Schedules and scenes below are simulated for layout review.
      </div>
    </div>
    <div class="automation-tabs">
      <button class="tab ${tab === 'schedules' ? 'active' : ''}" data-auto-tab="schedules" type="button">${icon('clock')}Schedules (${SCHEDULES.length})</button>
      <button class="tab ${tab === 'scenes' ? 'active' : ''}" data-auto-tab="scenes" type="button">${icon('wand-2')}Scenes (${SCENES.length})</button>
    </div>
    <div id="autoBody">${tab === 'schedules' ? renderSchedules() : renderScenes()}</div>`;
  refreshIcons(main);
  $$('[data-auto-tab]').forEach(b => b.addEventListener('click', () => {
    state.autoTab = b.dataset.autoTab; renderAutomation(main);
  }));
  if (tab === 'schedules') {
    $('#newScheduleBtn')?.addEventListener('click', () => openScheduleEditor());
    $$('[data-sched-toggle]').forEach(el => el.addEventListener('click', () => {
      const s = SCHEDULES.find(x => x.id === el.dataset.schedToggle); if (!s) return;
      s.enabled = !s.enabled; saveSchedules();
      audit('schedule.toggle', s.id, s.enabled ? 'enabled' : 'disabled');
      renderAutomation(main);
    }));
    $$('[data-sched-edit]').forEach(el => el.addEventListener('click', () => openScheduleEditor(el.dataset.schedEdit)));
    $$('[data-sched-delete]').forEach(el => el.addEventListener('click', async () => {
      const s = SCHEDULES.find(x => x.id === el.dataset.schedDelete); if (!s) return;
      const ok = await confirmModal({ title:'Delete schedule?', message:`"${s.name}" will be removed.`, confirmText:'Delete', danger:true });
      if (!ok) return;
      SCHEDULES.splice(SCHEDULES.indexOf(s), 1); saveSchedules();
      audit('schedule.delete', s.id); toast('Schedule deleted', { type:'info' });
      renderAutomation(main);
    }));
    $$('[data-sched-run]').forEach(el => el.addEventListener('click', () => {
      const s = SCHEDULES.find(x => x.id === el.dataset.schedRun);
      if (s) runSchedule(s, { manual:true });
    }));
  } else {
    $('#newSceneBtn')?.addEventListener('click', () => openSceneEditor());
    $$('[data-scene-run]').forEach(el => el.addEventListener('click', () => {
      const s = SCENES.find(x => x.id === el.dataset.sceneRun);
      if (s) runScene(s);
    }));
    $$('[data-scene-edit]').forEach(el => el.addEventListener('click', () => openSceneEditor(el.dataset.sceneEdit)));
    $$('[data-scene-delete]').forEach(el => el.addEventListener('click', async () => {
      const s = SCENES.find(x => x.id === el.dataset.sceneDelete); if (!s) return;
      const ok = await confirmModal({ title:'Delete scene?', message:`"${s.name}" will be removed.`, confirmText:'Delete', danger:true });
      if (!ok) return;
      SCENES.splice(SCENES.indexOf(s), 1); saveScenes();
      audit('scene.delete', s.id); toast('Scene deleted', { type:'info' });
      renderAutomation(main);
    }));
    $$('[data-scene-toggle]').forEach(el => el.addEventListener('click', () => {
      const s = SCENES.find(x => x.id === el.dataset.sceneToggle); if (!s) return;
      s.enabled = !s.enabled; saveScenes();
      audit('scene.toggle', s.id, s.enabled ? 'enabled' : 'disabled');
      renderAutomation(main);
    }));
  }
}
function renderSchedules() {
  const canEdit = can('automate');
  return `
    <div class="main-head" style="margin-bottom:10px;">
      <h1 style="font-size:14px;">Schedules</h1>
      <button class="btn primary" id="newScheduleBtn" ${canEdit ? '' : 'disabled'}>${icon('plus')}New</button>
    </div>
    <div>
      ${SCHEDULES.length ? SCHEDULES.map(s => {
        const d = deviceById(s.device_id);
        const c = d?.capabilities.find(x => x.id === s.capability);
        const daysStr = s.days.length === 7 ? 'every day' : s.days.map(i => DAYS[i]).join(' ');
        return `<div class="auto-card ${s.enabled ? 'enabled' : 'disabled'}">
          <button class="toggle-small ${s.enabled ? 'on' : ''}" data-sched-toggle="${s.id}" aria-pressed="${s.enabled}"></button>
          <div class="ac-body">
            <div class="ac-name">${icon('clock')}${esc(s.name)}</div>
            <div class="ac-detail">
              <span class="kw">AT</span> <span class="v">${esc(s.time)}</span> · ${esc(daysStr)}<br>
              <span class="kw">DO</span> ${esc(d?.name || s.device_id)}.<span class="v">${esc(c?.label || s.capability)}</span>
              <span class="op">=</span> <span class="v">${s.value ? 'on' : 'off'}</span>
            </div>
            <div class="ac-meta">${s.last_run ? `last ${fmtAgo(Math.floor((Date.now() - s.last_run) / 1000))}` : 'never run'}</div>
          </div>
          <div class="ac-actions">
            <button class="btn sm" data-sched-run="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('play')}Run</button>
            <button class="btn sm" data-sched-edit="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('pencil')}Edit</button>
            <button class="btn sm danger" data-sched-delete="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('trash-2')}</button>
          </div>
        </div>`;
      }).join('') : '<div class="empty">No schedules yet.</div>'}
    </div>`;
}
function renderScenes() {
  const canEdit = can('automate');
  return `
    <div class="main-head" style="margin-bottom:10px;">
      <h1 style="font-size:14px;">Scenes</h1>
      <button class="btn primary" id="newSceneBtn" ${canEdit ? '' : 'disabled'}>${icon('plus')}New</button>
    </div>
    <div>
      ${SCENES.length ? SCENES.map(s => {
        const actionLines = s.actions.map(a => {
          const d = deviceById(a.device_id);
          const c = d?.capabilities.find(x => x.id === a.capability);
          return `<div class="scene-action-row">
            <span class="dot ${a.value ? 'on' : 'off'}"></span>
            <span class="dev">${esc(d?.name || a.device_id)}</span>
            <span>· ${esc(c?.label || a.capability)}</span>
            <span style="margin-left:auto;color:${a.value ? 'var(--ok)' : 'var(--offline)'};">${a.value ? 'on' : 'off'}</span>
          </div>`;
        }).join('');
        return `<div class="auto-card ${s.enabled ? 'enabled' : 'disabled'}">
          <button class="toggle-small ${s.enabled ? 'on' : ''}" data-scene-toggle="${s.id}" aria-pressed="${s.enabled}"></button>
          <div class="ac-body">
            <div class="ac-name">${sceneIconHTML(s.icon)}${esc(s.name)}</div>
            <div class="ac-meta">${s.actions.length} action${s.actions.length === 1 ? '' : 's'}</div>
            <div class="scene-actions-list">${actionLines || '<div style="font-size:11.5px;color:var(--content-faint);">No actions.</div>'}</div>
          </div>
          <div class="ac-actions">
            <button class="btn sm primary" data-scene-run="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('play')}Run</button>
            <button class="btn sm" data-scene-edit="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('pencil')}Edit</button>
            <button class="btn sm danger" data-scene-delete="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('trash-2')}</button>
          </div>
        </div>`;
      }).join('') : '<div class="empty">No scenes yet.</div>'}
    </div>`;
}
async function runSchedule(s, { manual = false } = {}) {
  if (!manual && !s.enabled) return;
  const d = deviceById(s.device_id);
  const c = d?.capabilities.find(x => x.id === s.capability);
  if (!d || !c) { audit('schedule.fail', s.id, 'missing'); if (manual) toast('Cannot run', { type:'error' }); return; }
  s.last_run = Date.now(); saveSchedules();
  const r = await executeAction(s.device_id, s.capability, s.value, 'schedule');
  if (r.ok) {
    audit('schedule.run', s.id, `${d.name}/${c.label}`);
    ACTIVITY.unshift({ t:0, text:`schedule "${s.name}" ran` });
    toast(manual ? 'Schedule ran' : 'Schedule fired', { msg:`${s.name} → ${c.label}`, type:'ok' });
  } else {
    audit('schedule.fail', s.id, r.reason);
    toast('Schedule failed', { msg:`${s.name}: ${r.reason}`, type:'error' });
  }
  renderMain();
}
async function runScene(s) {
  if (!s.enabled) { toast('Scene disabled', { msg:s.name, type:'warn' }); return; }
  if (!can('automate')) { toast('Permission denied', { type:'error' }); return; }
  let ok = 0, fail = 0;
  for (const a of s.actions) {
    const r = await executeAction(a.device_id, a.capability, a.value, 'scene');
    if (r.ok) ok++; else fail++;
  }
  audit('scene.run', s.id, `${ok} ok, ${fail} failed`);
  ACTIVITY.unshift({ t:0, text:`${state.user.username} ran scene "${s.name}"` });
  toast('Scene ran', { msg:`${s.name} — ${ok} applied${fail ? `, ${fail} blocked` : ''}`, type: fail ? 'warn' : 'ok' });
  renderMain();
}
function setCapabilityValue(capability, value) {
  if (!Object.is(capability.value, value)) {
    capability.value = value;
    capability.since = Date.now();
  }
}
async function executeAction(device_id, capability_id, value, source = 'system') {
  const d = deviceById(device_id); if (!d) return { ok:false, reason:'device not found' };
  const c = d.capabilities.find(x => x.id === capability_id); if (!c) return { ok:false, reason:'capability not found' };
  const block = isBlocked(device_id, capability_id);
  if (block) return { ok:false, reason:'interlock: ' + block.rule.name };
  if (d.lwt !== 'online') return { ok:false, reason:'device offline' };
  const requestId = uid();
  try {
    await mqtt.publish(`electrix/${device_id}/cmd/${capability_id}/set`, { value, request_id: requestId, source }, { qos:2 });
    setTimeout(() => { mqtt.inject(`electrix/${device_id}/ack/${requestId}`, { status:'ok', echoed_value:value }); }, 200);
    await waitForAck(requestId, 4000);
    setCapabilityValue(c, value);
    COMMAND_HISTORY.unshift({ ts:Date.now(), device_id, actuator:capability_id, value, request_id:requestId, status:'ok', source });
    if (COMMAND_HISTORY.length > 100) COMMAND_HISTORY.pop();
    return { ok:true };
  } catch (e) {
    COMMAND_HISTORY.unshift({ ts:Date.now(), device_id, actuator:capability_id, value, request_id:requestId, status:'error', source });
    return { ok:false, reason:e.message || 'ack timeout' };
  }
}
function openScheduleEditor(scheduleId = null) {
  const s = scheduleId ? SCHEDULES.find(x => x.id === scheduleId) : null;
  const allCaps = [];
  DEVICES.forEach(d => d.capabilities.forEach(c => { if (c.kind === 'relay') allCaps.push({ d, c }); }));
  const capOptions = (selDev, selCap) =>
    allCaps.map(({ d, c }) => `<option value="${d.device_id}|${c.id}" ${d.device_id === selDev && c.id === selCap ? 'selected' : ''}>${esc(d.name)} · ${esc(c.label)}</option>`).join('');
  const days = s?.days || [1,2,3,4,5];
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <h3>${s ? 'Edit schedule' : 'New schedule'}</h3>
    <div class="m-row"><label class="field-label">Name</label><input type="text" id="schName" value="${esc(s?.name || '')}" placeholder="Garden pump off at night"></div>
    <div class="m-row"><label class="field-label">When</label>
      <input type="time" id="schTime" value="${esc(s?.time || '22:00')}">
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:10px;" id="schDays">
        ${DAYS.map((dn, i) => `<button type="button" class="d" data-day="${i}" style="font-size:11px;padding:6px 9px;border-radius:4px;background:${days.includes(i) ? 'var(--accent)' : 'var(--surface-2)'};color:${days.includes(i) ? 'var(--accent-fg)' : 'var(--content-faint)'};border:1px solid var(--border);cursor:pointer;min-width:40px;">${dn}</button>`).join('')}
      </div>
    </div>
    <div class="m-row"><label class="field-label">Action</label>
      <select id="schDevice" style="margin-bottom:8px;">${capOptions(s?.device_id, s?.capability)}</select>
      <select id="schValue">
        <option value="true" ${s?.value === true ? 'selected' : ''}>Turn ON</option>
        <option value="false" ${s?.value === false ? 'selected' : ''}>Turn OFF</option>
      </select>
    </div>
    <div class="btn-row">
      <button class="btn" data-act="cancel">Cancel</button>
      <button class="btn primary" data-act="ok">Save</button>
    </div>
  </div>`;
  root.appendChild(wrap);
  refreshIcons(wrap);
  const selectedDays = new Set(days);
  wrap.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
    const i = parseInt(b.dataset.day, 10);
    if (selectedDays.has(i)) selectedDays.delete(i); else selectedDays.add(i);
    const on = selectedDays.has(i);
    b.style.background = on ? 'var(--accent)' : 'var(--surface-2)';
    b.style.color = on ? 'var(--accent-fg)' : 'var(--content-faint)';
  }));
  const close = val => { wrap.remove(); return val; };
  wrap.querySelector('[data-act="cancel"]').onclick = () => close(null);
  wrap.querySelector('[data-act="ok"]').onclick = () => {
    const name = wrap.querySelector('#schName').value.trim();
    if (!name) { toast('Name required', { type:'error' }); return; }
    if (selectedDays.size === 0) { toast('Pick at least one day', { type:'error' }); return; }
    const time = wrap.querySelector('#schTime').value;
    if (!time) { toast('Time required', { type:'error' }); return; }
    const [devId, capId] = wrap.querySelector('#schDevice').value.split('|');
    const val = wrap.querySelector('#schValue').value === 'true';
    const payload = { name, time, days:[...selectedDays].sort(), device_id:devId, capability:capId, value:val, enabled:s?.enabled ?? true, last_run:s?.last_run ?? null };
    if (s) { Object.assign(s, payload); audit('schedule.edit', s.id, name); }
    else { SCHEDULES.push({ id:uid(), ...payload }); audit('schedule.create', name); }
    saveSchedules();
    toast(s ? 'Schedule updated' : 'Schedule created', { msg:name, type:'ok' });
    close(true); renderMain();
  };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(null); });
}
function openSceneEditor(sceneId = null) {
  const s = sceneId ? SCENES.find(x => x.id === sceneId) : null;
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <h3>${s ? 'Edit scene' : 'New scene'}</h3>
    <div class="m-row"><label class="field-label">Name</label><input type="text" id="scnName" value="${esc(s?.name || '')}" placeholder="Evening mode"></div>
    <div class="m-row"><label class="field-label">Icon</label>
      <div class="icon-picker" id="scnIcons">
        ${SCENE_ICONS.map(ic => `<button type="button" class="${(s?.icon || 'sparkles') === ic ? 'sel' : ''}" data-icon="${ic}" title="${ic}">${icon(ic)}</button>`).join('')}
      </div>
    </div>
    <div class="m-row"><label class="field-label">Actions</label>
      <div id="scnActions" style="display:grid;gap:8px;"></div>
      <button class="btn sm" id="scnAddAction" style="margin-top:8px;">${icon('plus')}Add action</button>
    </div>
    <div class="btn-row">
      <button class="btn" data-act="cancel">Cancel</button>
      <button class="btn primary" data-act="ok">Save</button>
    </div>
  </div>`;
  root.appendChild(wrap);
  refreshIcons(wrap);
  let selectedIcon = s?.icon || 'sparkles';
  if (/[^\x00-\x7F]/.test(selectedIcon)) selectedIcon = 'sparkles';
  wrap.querySelectorAll('[data-icon]').forEach(b => b.addEventListener('click', () => {
    selectedIcon = b.dataset.icon;
    wrap.querySelectorAll('[data-icon]').forEach(x => x.classList.toggle('sel', x === b));
  }));
  const allCaps = [];
  DEVICES.forEach(d => d.capabilities.forEach(c => { if (c.kind === 'relay') allCaps.push({ d, c }); }));
  let actions = (s?.actions || []).map(a => ({ ...a }));
  function renderActions() {
    const list = wrap.querySelector('#scnActions');
    if (!actions.length) { list.innerHTML = '<div style="font-size:12px;color:var(--content-faint);padding:6px;">No actions yet.</div>'; return; }
    list.innerHTML = actions.map((a, i) => `
      <div style="display:flex;gap:6px;align-items:center;">
        <select data-action-dev="${i}" style="flex:2;">
          ${allCaps.map(({ d, c }) => `<option value="${d.device_id}|${c.id}" ${d.device_id === a.device_id && c.id === a.capability ? 'selected' : ''}>${esc(d.name)} · ${esc(c.label)}</option>`).join('')}
        </select>
        <select data-action-val="${i}" style="flex:1;">
          <option value="true" ${a.value === true ? 'selected' : ''}>ON</option>
          <option value="false" ${a.value === false ? 'selected' : ''}>OFF</option>
        </select>
        <button class="btn sm danger" data-action-del="${i}" type="button">${icon('x')}</button>
      </div>
    `).join('');
    refreshIcons(list);
    list.querySelectorAll('[data-action-dev]').forEach(el => el.addEventListener('change', () => {
      const [dev, cap] = el.value.split('|');
      actions[+el.dataset.actionDev].device_id = dev;
      actions[+el.dataset.actionDev].capability = cap;
    }));
    list.querySelectorAll('[data-action-val]').forEach(el => el.addEventListener('change', () => {
      actions[+el.dataset.actionVal].value = el.value === 'true';
    }));
    list.querySelectorAll('[data-action-del]').forEach(el => el.addEventListener('click', () => {
      actions.splice(+el.dataset.actionDel, 1); renderActions();
    }));
  }
  renderActions();
  wrap.querySelector('#scnAddAction').addEventListener('click', () => {
    if (!allCaps.length) { toast('No relays available', { type:'error' }); return; }
    actions.push({ device_id:allCaps[0].d.device_id, capability:allCaps[0].c.id, value:true });
    renderActions();
  });
  const close = val => { wrap.remove(); return val; };
  wrap.querySelector('[data-act="cancel"]').onclick = () => close(null);
  wrap.querySelector('[data-act="ok"]').onclick = () => {
    const name = wrap.querySelector('#scnName').value.trim();
    if (!name) { toast('Name required', { type:'error' }); return; }
    if (!actions.length) { toast('Add at least one action', { type:'error' }); return; }
    const payload = { name, icon:selectedIcon, actions:actions.slice(), enabled:s?.enabled ?? true };
    if (s) { Object.assign(s, payload); audit('scene.edit', s.id, name); }
    else { SCENES.push({ id:uid(), ...payload }); audit('scene.create', name); }
    saveScenes();
    toast(s ? 'Scene updated' : 'Scene created', { msg:name, type:'ok' });
    close(true); renderMain();
  };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(null); });
}
