'use strict';

if (window.__electrix_events_bound) {
  console.warn('[events] duplicate load detected — skipping');
  throw new Error('[events] already loaded');
}
window.__electrix_events_bound = true;

document.addEventListener('click', e => {
  const t = e.target;

  // ---- Device onboarding (before card click) ------------------------
  const assignBtn = t.closest('[data-assign-device]');
  if (assignBtn) {
    e.stopPropagation();
    openDeviceOnboarding(assignBtn.dataset.assignDevice);
    return;
  }
  const reassign = t.closest('[data-reassign-device]');
  if (reassign) {
    e.preventDefault();
    openDeviceOnboarding(reassign.dataset.reassignDevice);
    return;
  }

  // ---- Card click ---------------------------------------------------
  const card = t.closest('.card[data-device]');
  if (card && !t.closest('button') && !t.closest('input')) {
    if (state.bulkMode) {
      const id = card.dataset.device;
      if (state.bulkSelected.has(id)) state.bulkSelected.delete(id); else state.bulkSelected.add(id);
      renderMain();
    } else openDrawer(card.dataset.device);
    return;
  }

  // ---- Tabs, nav, favourites ---------------------------------------
  const tab = t.closest('[data-devtab]');
  if (tab) {
    e.preventDefault();
    state.deviceTab = tab.dataset.devtab;
    const targetHash = deviceRoute(state.openDeviceId, state.deviceTab);
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
  const navEl = t.closest('[data-nav]');
  if (navEl) { e.preventDefault(); nav(navEl.dataset.nav); return; }
  const drawerNav = t.closest('#drawer [data-nav]');
  if (drawerNav) {
    e.preventDefault();
    const route = drawerNav.dataset.nav;
    if (isMobile()) closeDrawer();
    nav(route);
    return;
  }
  const siteEl = t.closest('[data-site]');
  if (siteEl) {
    state.selectedSite = siteEl.dataset.site;
    if (siteEl.dataset.site === 'all') nav('#/devices');
    else if (siteEl.dataset.site === '__unassigned__') {
      if (location.hash === '#/devices') renderMain();
      else location.hash = '#/devices';
    } else {
      nav(`#/devices/${siteEl.dataset.site}`);
    }
    return;
  }

  // ---- Actuator toggles ---------------------------------------------
  const toggle = t.closest('[data-toggle-device]');
  if (toggle && !toggle.disabled) { e.stopPropagation(); toggleActuator(toggle.dataset.toggleDevice, toggle.dataset.toggleCap); return; }

  // ---- Alarm actions ------------------------------------------------
  const ack = t.closest('[data-alarm-ack]'); if (ack) { ackAlarm(ack.dataset.alarmAck); return; }
  const shv = t.closest('[data-alarm-shelve]'); if (shv) { shelveAlarm(shv.dataset.alarmShelve); return; }
  const usv = t.closest('[data-alarm-unshelve]'); if (usv) { unshelveAlarm(usv.dataset.alarmUnshelve); return; }
  const af = t.closest('[data-alarm-filter]');
  if (af) { state.alarmFilter = af.dataset.alarmFilter; renderMain(); return; }

  // ---- Device-page actions ------------------------------------------
  if (state.view === 'device' && state.openDeviceId) {
    const d = deviceById(state.openDeviceId);
    if (d) {
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'reboot') { rebootDevice(d); return; }
        if (a === 'factory-reset') { factoryReset(d); return; }
        if (a === 'query-state') { queryState(d); return; }
        if (a === 'device-commands-refresh') { loadDeviceCommands(d.device_id); return; }
        if (a === 'device-events-load-more') {
          loadDeviceEvents(d.device_id, deviceEventsCache(d.device_id).oldestId);
          return;
        }
        if (a === 'device-events-filter') { setDeviceEventsFilter(d.device_id, act.dataset.filter || ''); return; }
        if (a === 'device-diagnostics-refresh') { loadDeviceDiagnostics(d.device_id); return; }
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