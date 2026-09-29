'use strict';

document.addEventListener('click', e => {
  const t = e.target;
  const telemetryView = t.closest('[data-tele-view]');
  if (telemetryView) {
    const modeKey = state.view === 'device' ? 'deviceTeleMode' : 'teleMode';
    state[modeKey] = telemetryView.dataset.teleView;
    if (state[modeKey] === 'charts' && !state.teleFocusKey) {
      state.teleFocusKey = state.view === 'device'
        ? Object.keys(TELEMETRY).find(key => key.startsWith(state.openDeviceId + '/')) || null
        : Object.keys(TELEMETRY).find(key => state.teleDevice === 'all' || key.startsWith(state.teleDevice + '/')) || null;
    }
    renderMain();
    return;
  }
  const gauge = t.closest('[data-gauge-key]');
  if (gauge) {
    state.teleFocusKey = gauge.dataset.gaugeKey;
    state[state.view === 'device' ? 'deviceTeleMode' : 'teleMode'] = 'charts';
    renderMain();
    return;
  }
  const healthDevice = t.closest('[data-health-device]');
  if (healthDevice) {
    state.teleDevice = healthDevice.dataset.healthDevice;
    state.teleSensor = 'all';
    state.teleFocusKey = Object.keys(TELEMETRY).find(key =>
      key.startsWith(state.teleDevice + '/') && ['alarm','warn','stale','offline'].includes(telemetryStatus(key))
    ) || Object.keys(TELEMETRY).find(key => key.startsWith(state.teleDevice + '/')) || null;
    state.teleMode = 'charts';
    renderMain();
    return;
  }
  const suggestion = t.closest('[data-suggestion]');
  if (suggestion) {
    const d = deviceById(state.openDeviceId);
    if (!d || suggestion.disabled) return;
    const action = suggestion.dataset.suggestion;
    if (action === 'review-alarms') {
      state.alarmFilter = 'active'; state.alarmPriorityFilter = 'all'; state.alarmTypeFilter = 'all';
      nav(`#/alarms/${d.device_id}`);
    } else if (action === 'automation') nav('#/automation');
    else if (action === 'rename-capability') {
      const input = document.querySelector(`.cap-label-edit[data-cap-id="${CSS.escape(suggestion.dataset.capability)}"]`);
      input?.focus(); input?.select();
    } else if (action === 'match-config') matchSiblingConfig(d, suggestion.dataset.configKey);
    else if (action === 'diagnostics') nav(`#/device/${d.device_id}/diagnostics`);
    else if (action === 'ota') nav('#/ota');
    return;
  }
  const reference = t.closest('[data-device-reference]');
  if (reference) {
    toggleDeviceReference(reference.dataset.deviceId, reference.dataset.deviceReference);
    return;
  }
  if (t.closest('[data-clear-alarm-device]')) {
    state.alarmDeviceFilter = null;
    nav('#/alarms');
    return;
  }
  const cp = t.closest('[data-copy]');
  if (cp) { e.preventDefault(); copyText(cp.dataset.copy); return; }

  const pill = t.closest('#alarmPill');
  if (pill) { e.preventDefault(); toggleAlarmPopover(); return; }
  if (t.closest('#alarmPopoverClose')) { closeAlarmPopover(); return; }
  const jump = t.closest('[data-alarm-jump]');
  if (jump) {
    const a = ALARMS.find(x => x.id === jump.dataset.alarmJump);
    if (a) { state.alarmTypeFilter = a.type; state.alarmFilter = 'active'; state.alarmPriorityFilter = 'all'; }
    closeAlarmPopover();
    nav('#/alarms');
    return;
  }
  if (!t.closest('.alarm-pill-wrap')) closeAlarmPopover();

  if (t.closest('#railToggle')) { toggleSidebar(); return; }

  const tab = t.closest('[data-devtab]');
  if (tab) {
    e.preventDefault();
    state.deviceTab = tab.dataset.devtab;
    const targetHash = `#/device/${state.openDeviceId}/${state.deviceTab}`;
    if (location.hash === targetHash) renderMain();
    else location.hash = targetHash;
    return;
  }
  const fav = t.closest('[data-fav]');
  if (fav) { e.stopPropagation(); toggleFavorite(fav.dataset.fav); renderMain(); return; }
  const chk = t.closest('[data-sel-device]');
  if (chk) {
    e.stopPropagation();
    const id = chk.dataset.selDevice;
    if (state.bulkSelected.has(id)) state.bulkSelected.delete(id); else state.bulkSelected.add(id);
    renderMain(); return;
  }
  const routeEl = t.closest('[data-route]');
  if (routeEl) { e.preventDefault(); nav(routeEl.dataset.route); return; }
  const drawerNav = t.closest('#drawer [data-nav]');
  if (drawerNav) {
    e.preventDefault();
    const route = drawerNav.dataset.nav;
    if (isMobile()) closeDrawer();
    nav(route);
    return;
  }
  const navEl = t.closest('[data-nav]');
  if (navEl) { e.preventDefault(); nav(navEl.dataset.nav); return; }
  const siteEl = t.closest('[data-site]');
  if (siteEl) {
    state.selectedSite = siteEl.dataset.site;
    const h = siteEl.dataset.site === 'all' ? '#/devices' : `#/devices/${siteEl.dataset.site}`;
    if (location.hash === h) renderMain(); else location.hash = h;
    return;
  }
  const toggle = t.closest('[data-toggle-device]');
  if (toggle && !toggle.disabled) { e.stopPropagation(); toggleActuator(toggle.dataset.toggleDevice, toggle.dataset.toggleCap); return; }
  const ack = t.closest('[data-alarm-ack]'); if (ack) { ackAlarm(ack.dataset.alarmAck); return; }
  const shv = t.closest('[data-alarm-shelve]'); if (shv) { shelveAlarm(shv.dataset.alarmShelve); return; }
  const usv = t.closest('[data-alarm-unshelve]'); if (usv) { unshelveAlarm(usv.dataset.alarmUnshelve); return; }
  const ann = t.closest('[data-ann-type]');
  if (ann) {
    const type = ann.dataset.annType;
    state.alarmTypeFilter = (state.alarmTypeFilter === type) ? 'all' : type;
    state.alarmFilter = 'active';
    state.alarmPriorityFilter = 'all';
    nav('#/alarms');
    return;
  }
  const card = t.closest('.card[data-device]');
  if (card && !t.closest('button') && !t.closest('input')) {
    if (state.bulkMode) {
      const id = card.dataset.device;
      if (state.bulkSelected.has(id)) state.bulkSelected.delete(id); else state.bulkSelected.add(id);
      renderMain();
    } else openDrawer(card.dataset.device);
    return;
  }
  const af = t.closest('[data-alarm-filter]');
  if (af) { state.alarmFilter = af.dataset.alarmFilter; renderMain(); return; }
  if (state.view === 'device' && state.openDeviceId) {
    const d = deviceById(state.openDeviceId);
    if (d) {
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'reboot') { rebootDevice(d); return; }
        if (a === 'factory-reset') { factoryReset(d); return; }
        if (a === 'query-state') { queryState(d); return; }
        if (a === 'save-config') { saveConfig(d); return; }
        if (a === 'load-config') { toast('Reloaded from device', { type:'info' }); return; }
        if (a === 'toggle-inspector') { toggleInspector(); return; }
      }
      const cmd = t.closest('[data-cmd-set]');
      if (cmd) {
        const c = d.capabilities.find(x => x.id === cmd.dataset.cmdSet);
        if (c) {
          const want = cmd.dataset.cmdVal === 'on';
          if (c.value === want) { toast('Already in that state', { type:'info', timeout:1500 }); return; }
          toggleActuator(d.device_id, c.id);
        }
        return;
      }
    }
  }
  const bulk = t.closest('[data-bulk]');
  if (bulk) {
    const action = bulk.dataset.bulk;
    if (action === 'exit') { state.bulkMode = false; state.bulkSelected.clear(); renderMain(); return; }
    if (action === 'clear') { state.bulkSelected.clear(); renderMain(); return; }
    if (!state.bulkSelected.size) { toast('Select devices first', { type:'info' }); return; }
    if (action === 'fav') {
      state.bulkSelected.forEach(id => { if (!isFavorite(id)) state.favorites.push(id); });
      lsSet('electrix_favorites', state.favorites);
      audit('bulk.favorite', [...state.bulkSelected].join(','));
      toast('Favorites updated', { msg:`${state.bulkSelected.size} devices`, type:'ok' });
      renderMain(); return;
    }
    if (action === 'on' || action === 'off') {
      const want = action === 'on';
      const targets = [];
      state.bulkSelected.forEach(id => {
        const d = deviceById(id); if (!d) return;
        d.capabilities.forEach(c => { if (c.kind === 'relay' && c.value !== want) targets.push({ d, c }); });
      });
      if (!targets.length) { toast('Nothing to change', { type:'info' }); return; }
      (async () => {
        let ok = 0, fail = 0;
        for (const { d, c } of targets) {
          const r = await executeAction(d.device_id, c.id, want, 'human');
          if (r.ok) ok++; else fail++;
        }
        audit('bulk.' + action, [...state.bulkSelected].join(','), `${ok} ok, ${fail} failed`);
        toast(`Bulk ${action}`, { msg:`${ok} applied${fail ? `, ${fail} blocked` : ''}`, type: fail ? 'warn' : 'ok' });
        renderMain();
      })();
      return;
    }
  }
  if (state.drawerDeviceId) {
    const d = deviceById(state.drawerDeviceId);
    if (d) {
      const act = t.closest('[data-act]');
      if (act) {
        if (act.dataset.act === 'query-state') { queryState(d); return; }
        if (act.dataset.act === 'reboot') { rebootDevice(d); return; }
      }
    }
  }
});
document.addEventListener('change', e => {
  const inp = e.target;
  if (inp.matches && inp.matches('.cap-label-edit[data-cap-id]')) {
    const devId = state.view === 'device' ? state.openDeviceId : state.drawerDeviceId;
    const d = deviceById(devId); if (!d) return;
    const c = d.capabilities.find(x => x.id === inp.dataset.capId);
    if (c) { c.label = inp.value.trim() || c.id; audit('device.rename_cap', `${d.device_id}/${c.id}`, c.label); }
  }
});
