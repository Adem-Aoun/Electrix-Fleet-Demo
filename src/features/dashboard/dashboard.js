'use strict';

const ANN_TYPE_ICON = {
  relay_stuck:'alert-octagon', low_battery:'battery-warning',
  device_offline:'wifi-off', threshold:'trending-up',
  over_temp:'thermometer-sun', water_leak:'droplets',
};
function renderAnnunciator() {
  const types = {};
  ALARMS.filter(a => !a.cleared).forEach(a => {
    const t = types[a.type] ||= { count:0, unacked:0, priority:'low' };
    t.count++;
    if (a.state === 'UNACK_ALARM') t.unacked++;
    if (priorityRank(a.priority) < priorityRank(t.priority)) t.priority = a.priority;
  });
  const known = ['relay_stuck','low_battery','device_offline','threshold','over_temp','water_leak'];
  return `<div class="annunciator">${known.map(t => {
    const info = types[t] || { count:0, unacked:0, priority:'low' };
    const stateCls = info.count === 0 ? 'st-normal' : (info.priority === 'critical' ? 'st-critical' : 'st-warn');
    const cls = [stateCls, state.alarmTypeFilter === t ? 'selected-type' : ''].filter(Boolean).join(' ');
    return `<div class="ann-tile ${cls}" data-ann-type="${t}">
      <div class="ann-label">${icon(ANN_TYPE_ICON[t] || 'alert-circle')}<span>${t.replace(/_/g,' ')}</span></div>
      <div class="ann-count">${info.count}</div>
    </div>`;
  }).join('')}</div>`;
}
function wrow({ lead='', label='', sub='', meta='', value='', valueClass='', act='', isLast=false }) {
  const subHtml = sub ? ` <span class="wsub">· ${sub}</span>` : '';
  return `<div class="wrow" style="${isLast ? 'border-bottom:none;' : ''}">
    ${lead}
    <span class="wl">${label}${subHtml}</span>
    ${meta ? `<span class="wm">${meta}</span>` : ''}
    ${value ? `<span class="wv ${valueClass}">${value}</span>` : ''}
    ${act}
  </div>`;
}
const widgetEmpty = msg => `<div class="widget-empty">${esc(msg)}</div>`;

const WIDGET_DEFS = {
  fleet_status: { title:'Fleet Status', icon:'server', render: () => {
    const online = DEVICES.filter(d => deriveStatus(d) === 'online').length;
    const warn = DEVICES.filter(d => deriveStatus(d) === 'warn').length;
    const alarm = DEVICES.filter(d => deriveStatus(d) === 'alarm').length;
    const offline = DEVICES.filter(d => deriveStatus(d) === 'offline').length;
    return `<div class="widget-big-num">${DEVICES.length}<span class="suffix">devices</span></div>
      <div class="widget-stat-grid">
        <div class="widget-stat ok"><span class="n">${online}</span><span class="l">online</span></div>
        <div class="widget-stat alarm"><span class="n">${alarm}</span><span class="l">alarm</span></div>
        ${warn ? `<div class="widget-stat warn"><span class="n">${warn}</span><span class="l">warn</span></div>` : ''}
        <div class="widget-stat offline"><span class="n">${offline}</span><span class="l">off</span></div>
      </div>`;
  }},
  active_alarms: { title:'Active Alarms', icon:'alert-triangle', render: () => {
    const list = activeAlarms().slice(0, 4);
    if (!list.length) return widgetEmpty('No active alarms');
    return list.map((a, i) =>
      wrow({
        lead: `<span class="wchip sev-${a.priority === 'critical' ? 'critical' : a.priority === 'low' ? 'info' : 'warn'}">${a.priority}</span>`,
        label: esc(a.msg),
        act: a.state === 'UNACK_ALARM' ? `<span class="wdot alarm" title="unacknowledged" style="margin-left:auto;"></span>` : '',
        isLast: i === list.length - 1,
      })
    ).join('') + `<div style="margin-top:12px;"><button class="btn sm" data-nav="#/alarms" style="width:100%;">${icon('arrow-right')}View all</button></div>`;
  }},
  quick_controls: { title:'Quick Controls', icon:'sliders-horizontal', render: () => {
    const relays = [];
    DEVICES.forEach(d => { if (d.lwt !== 'online') return; d.capabilities.forEach(c => { if (c.kind === 'relay' && c.online) relays.push({ d, c }); }); });
    if (!relays.length) return widgetEmpty('No controllable relays online');
    const shown = relays.slice(0, 5);
    return shown.map(({ d, c }, i) =>
      wrow({
        label: esc(c.label),
        sub: esc(d.name),
        act: `<button class="toggle ${c.value ? 'on' : ''} ${c.pending ? 'pending' : ''}" data-toggle-device="${d.device_id}" data-toggle-cap="${c.id}" ${can('toggle') ? '' : 'disabled'} aria-pressed="${c.value}" style="margin-left:auto;"></button>`,
        isLast: i === shown.length - 1,
      })
    ).join('');
  }},
  recent_activity: { title:'Recent Activity', icon:'history', render: () => {
    const list = ACTIVITY.slice(0, 5);
    if (!list.length) return widgetEmpty('No recent activity');
    return list.map((a, i) => wrow({ label: esc(a.text), meta: fmtAgo(a.t), isLast: i === list.length - 1 })).join('');
  }},
  site_overview: { title:'Site Overview', icon:'map', render: () => {
    if (!SITES.length) return widgetEmpty('No sites configured');
    return SITES.map((s, i) => {
      const n = DEVICES.filter(d => d.site_id === s.id).length;
      const alarms = DEVICES.filter(d => d.site_id === s.id && deviceHasAlarm(d)).length;
      const offline = DEVICES.filter(d => d.site_id === s.id && d.lwt === 'offline').length;
      const parts = [`${n} dev`];
      if (alarms) parts.push(`<span style="color:var(--alarm)">${alarms} alarm</span>`);
      if (offline) parts.push(`<span style="color:var(--warn)">${offline} off</span>`);
      return `<div class="wrow" data-nav="#/devices/${s.id}" style="cursor:pointer;${i === SITES.length - 1 ? 'border-bottom:none;' : ''}">
        <span class="wl">${esc(s.name)}</span>
        <span class="wm">${parts.join(' · ')}</span>
      </div>`;
    }).join('');
  }},
};

function renderDashboard(main) {
  const mobile = isMobile();
  const reorderMode = state.widgetReorderMode;
  main.innerHTML = `
    <div class="main-head">
      <h1>Overview</h1>
      <div class="main-head-actions">
        <span class="count">${mobile ? (reorderMode ? 'Use arrows to reorder' : 'Tap a widget to drill in') : 'Drag to reorder'}</span>
        ${mobile ? `<button class="btn sm ${reorderMode ? 'active' : ''}" id="reorderToggle" aria-pressed="${reorderMode}">
          ${icon(reorderMode ? 'check' : 'arrow-up-down')}<span>${reorderMode ? 'Done' : 'Reorder'}</span>
        </button>` : ''}
      </div>
    </div>
    ${renderAnnunciator()}
    <div class="widget-grid" id="widgetGrid"></div>`;
  const grid = $('#widgetGrid');
  const total = state.widgetLayout.length;
  state.widgetLayout.forEach((id, idx) => {
    const def = WIDGET_DEFS[id]; if (!def) return;
    const el = document.createElement('div');
    el.className = 'widget';
    el.draggable = !mobile && !reorderMode;
    el.dataset.widgetId = id;
    const headRight = reorderMode
      ? `<div class="widget-move">
          <button class="move-btn" data-move-up="${esc(id)}" ${idx === 0 ? 'disabled' : ''} aria-label="Move ${esc(def.title)} up" title="Move up">${icon('chevron-up')}</button>
          <button class="move-btn" data-move-down="${esc(id)}" ${idx === total - 1 ? 'disabled' : ''} aria-label="Move ${esc(def.title)} down" title="Move down">${icon('chevron-down')}</button>
        </div>`
      : (!mobile ? `<span class="drag-handle" title="Drag to reorder">${icon('grip-vertical')}</span>` : '');
    el.innerHTML = `<div class="widget-head">
        <h3>${icon(def.icon || 'square')}<span>${esc(def.title)}</span></h3>
        ${headRight}
      </div>
      <div class="widget-body">${def.render()}</div>`;
    grid.appendChild(el);
  });
  refreshIcons(grid);
  if (!mobile && !reorderMode) wireWidgetDrag(grid);
  const rt = $('#reorderToggle');
  if (rt) rt.addEventListener('click', () => {
    state.widgetReorderMode = !state.widgetReorderMode;
    renderDashboard(main);
  });
}
function wireWidgetDrag(grid) {
  let dragSrc = null;
  grid.querySelectorAll('.widget').forEach(w => {
    w.addEventListener('dragstart', e => { dragSrc = w; e.dataTransfer.effectAllowed = 'move'; });
    w.addEventListener('dragover', e => { e.preventDefault(); if (w !== dragSrc) w.classList.add('drag-over'); });
    w.addEventListener('dragleave', () => w.classList.remove('drag-over'));
    w.addEventListener('drop', e => {
      e.preventDefault(); w.classList.remove('drag-over');
      if (!dragSrc || w === dragSrc) return;
      const from = state.widgetLayout.indexOf(dragSrc.dataset.widgetId);
      const to = state.widgetLayout.indexOf(w.dataset.widgetId);
      state.widgetLayout.splice(to, 0, state.widgetLayout.splice(from, 1)[0]);
      lsSet('electrix_widget_layout', state.widgetLayout);
      renderDashboard($('#mainContent'));
    });
  });
}
function moveWidget(id, dir) {
  const idx = state.widgetLayout.indexOf(id);
  if (idx < 0) return;
  const to = dir === 'up' ? idx - 1 : idx + 1;
  if (to < 0 || to >= state.widgetLayout.length) return;
  state.widgetLayout.splice(to, 0, state.widgetLayout.splice(idx, 1)[0]);
  lsSet('electrix_widget_layout', state.widgetLayout);
  audit('widget.move', id, dir);
  const main = $('#mainContent');
  renderDashboard(main);
  requestAnimationFrame(() => {
    const sel = dir === 'up' ? `[data-move-up="${id}"]` : `[data-move-down="${id}"]`;
    const btn = document.querySelector(sel);
    if (btn) btn.focus();
  });
}
