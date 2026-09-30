'use strict';

function renderAlarms(main) {
  const byDevice = a => !state.alarmDeviceFilter || a.device_id === state.alarmDeviceFilter;
  const active = activeAlarms().filter(byDevice);
  const history = ALARMS.filter(a => a.cleared && byDevice(a)).sort((a, b) => b.since - a.since);
  const shelved = ALARMS.filter(a => !a.cleared && isShelved(a) && byDevice(a));
  main.innerHTML = `
    <div class="main-head">
      <h1>Alarms</h1>
      <div class="main-head-actions"><span class="count">${active.length} active${shelved.length ? ` · ${shelved.length} shelved` : ''}${state.alarmDeviceFilter ? ` · ${esc(deviceById(state.alarmDeviceFilter)?.name || state.alarmDeviceFilter)}` : ''}</span>
        ${state.alarmDeviceFilter ? `<button class="btn sm" data-clear-alarm-device>Clear device filter</button>` : ''}</div>
    </div>
    ${renderAnnunciator()}
    <div class="filter-chips" id="alarmFilters">
      <button class="chip ${state.alarmFilter === 'active' ? 'active' : ''}" data-alarm-filter="active">${icon('alert-triangle')}Active <span class="n">${active.length}</span></button>
      <button class="chip ${state.alarmFilter === 'shelved' ? 'active' : ''}" data-alarm-filter="shelved">${icon('archive')}Shelved <span class="n">${shelved.length}</span></button>
      <button class="chip ${state.alarmFilter === 'history' ? 'active' : ''}" data-alarm-filter="history">${icon('history')}History <span class="n">${history.length}</span></button>
      ${state.alarmTypeFilter !== 'all' ? `<span class="type-filter-tag" style="font-size:10.5px;color:var(--accent);border:1px solid var(--accent);padding:2px 8px;border-radius:10px;background:color-mix(in srgb,var(--accent) 12%,transparent);display:inline-flex;align-items:center;gap:6px;">type: ${esc(state.alarmTypeFilter)} <button class="btn sm" data-clear-type style="padding:2px 5px;font-size:10px;">${icon('x')}</button></span>` : ''}
      <select class="sortsel" id="alarmPriorityFilter" style="width:auto;margin:0;padding:8px 10px;font-size:12px;">
        <option value="all">All priorities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </div>
    <div id="alarmList"></div>`;
  renderAlarmList();
  refreshIcons(main);
  $$('#alarmFilters [data-alarm-filter]').forEach(b => b.addEventListener('click', () => {
    state.alarmFilter = b.dataset.alarmFilter; renderAlarms(main);
  }));
  $('#alarmPriorityFilter').value = state.alarmPriorityFilter;
  $('#alarmPriorityFilter').addEventListener('change', e => { state.alarmPriorityFilter = e.target.value; renderAlarmList(); });
  $('#alarmFilters [data-clear-type]')?.addEventListener('click', () => { state.alarmTypeFilter = 'all'; renderMain(); });
}
function renderAlarmList() {
  const el = $('#alarmList'); if (!el) return;
  let list;
  if (state.alarmFilter === 'active') list = activeAlarms();
  else if (state.alarmFilter === 'shelved') list = ALARMS.filter(a => !a.cleared && isShelved(a));
  else list = ALARMS.filter(a => a.cleared).sort((a, b) => b.since - a.since);
  if (state.alarmPriorityFilter !== 'all') list = list.filter(a => a.priority === state.alarmPriorityFilter);
  if (state.alarmTypeFilter !== 'all') list = list.filter(a => a.type === state.alarmTypeFilter);
  if (state.alarmDeviceFilter) list = list.filter(a => a.device_id === state.alarmDeviceFilter);
  if (!list.length) {
    el.innerHTML = `<div class="empty">${state.alarmFilter === 'active' ? 'No active alarms.' : 'Nothing here yet.'}</div>`;
    return;
  }
  const canAct = can('ack') || can('clear');
  el.innerHTML = list.map(a => {
    const d = deviceById(a.device_id), shelved = isShelved(a);
    const sevCls = a.priority === 'critical' ? 'critical' : a.priority === 'low' ? 'info' : 'warn';
    const stateCls = a.state === 'UNACK_ALARM' ? 'unack' : a.state === 'ACK_ALARM' ? 'ack' : 'rtn';
    const deviceRouteHash = d ? deviceRoute(d.device_id) : null;
    const deviceContext = d
      ? `<a href="${deviceRouteHash}" data-nav="${deviceRouteHash}">${esc(d.site_id)} → ${esc(d.name)}</a>`
      : esc(a.device_id);
    return `<div class="alarm-item sev-${sevCls} ${shelved ? 'shelved' : ''}">
      <span class="alarm-sev sev-${sevCls}">${a.priority}</span>
      <div class="alarm-body">
        <div class="alarm-msg">${esc(a.msg)}
          ${a.latched ? '<span class="latch-tag">latched</span>' : ''}
          <span class="state-chip st-${stateCls}">${a.state}</span>
          ${shelved ? `<span class="shelve-tag">${fmtAgo(Math.floor((a.shelved_until - Date.now()) / 1000))} left</span>` : ''}
        </div>
        <div class="alarm-meta">${esc(a.code)} · ${deviceContext} · since ${fmtSince(a.since)}${a.acked ? ' · acked' : ''}</div>
        ${a.note ? `<div class="alarm-note">“${esc(a.note)}”</div>` : ''}
      </div>
      ${state.alarmFilter !== 'history' && canAct ? `<div class="alarm-actions">
        ${a.state === 'UNACK_ALARM' ? `<button class="btn sm" data-alarm-ack="${a.id}">${icon('check')}<span>Ack</span></button>` : ''}
        ${!shelved ? `<button class="btn sm" data-alarm-shelve="${a.id}">${icon('archive')}<span>Shelve</span></button>` : `<button class="btn sm" data-alarm-unshelve="${a.id}">${icon('archive-restore')}<span>Unshelve</span></button>`}
      </div>` : ''}
    </div>`;
  }).join('');
  refreshIcons(el);
}
