'use strict';

function renderDevices(main) {
  renderSitesAside();

  const unassigned = DEVICES.filter(d => !d.site_id);
  const showingUnassigned = state.selectedSite === '__unassigned__';

  main.innerHTML = `
    <div class="main-head">
      <h1 id="mainTitle">${state.selectedSite === 'all'
        ? 'All sites'
        : showingUnassigned
          ? 'Unassigned devices'
          : esc(siteName(state.selectedSite))}</h1>
      <div class="main-head-actions">
        <span class="count" id="mainCount"></span>
        ${isMobile() ? `<button class="btn sm" id="mobileSiteFilter">${icon('filter')}<span>Sites</span></button>` : ''}
        <button class="btn sm" id="deviceViewToggle">${state.deviceView === 'grid' ? icon('list') + 'List' : icon('grid-2x2') + 'Grid'}</button>
        <button class="btn sm ${state.bulkMode ? 'active' : ''}" id="bulkToggle">${state.bulkMode ? 'Done' : 'Select'}</button>
      </div>
    </div>

    ${unassigned.length && !showingUnassigned ? `
      <div class="unassigned-banner">
        ${icon('alert-triangle')}
        <div>
          <strong>${unassigned.length} unassigned device${unassigned.length === 1 ? '' : 's'}</strong>
          <span>New devices aren't grouped under a site until you assign them.</span>
        </div>
        <button class="btn sm" id="showUnassignedBtn" type="button">Show only</button>
        <button class="btn sm primary" id="assignNextBtn" type="button">Assign next</button>
      </div>` : ''}

    <div class="grid" id="grid"></div>`;

  renderDeviceGrid();

  $('#bulkToggle')?.addEventListener('click', () => {
    state.bulkMode = !state.bulkMode;
    if (!state.bulkMode) state.bulkSelected.clear();
    renderMain();
  });
  $('#deviceViewToggle')?.addEventListener('click', () => {
    state.deviceView = state.deviceView === 'grid' ? 'list' : 'grid';
    renderMain();
  });
  $('#mobileSiteFilter')?.addEventListener('click', openMobileSiteSheet);

  $('#showUnassignedBtn')?.addEventListener('click', () => {
    state.selectedSite = '__unassigned__';
    lsSet('electrix_site', state.selectedSite);
    if (location.hash === '#/devices') renderMain();
    else location.hash = '#/devices';
  });
  $('#assignNextBtn')?.addEventListener('click', () => {
    const first = unassigned[0];
    if (first) openDeviceOnboarding(first);
  });
}

function renderSitesAside() {
  const list = $('#siteList'); if (!list) return;

  const counts = {};
  DEVICES.forEach(d => {
    if (d.site_id) counts[d.site_id] = (counts[d.site_id] || 0) + 1;
  });
  const unassignedCount = DEVICES.filter(d => !d.site_id).length;

  const row = (id, name, count, extraCls = '') =>
    `<button class="site-item ${state.selectedSite === id ? 'selected' : ''} ${extraCls}" data-site="${id}" type="button">
      <span>${esc(name)}</span><span class="site-count">${count}</span>
    </button>`;

  list.innerHTML =
    row('all', 'All sites', DEVICES.length) +
    (unassignedCount
      ? row('__unassigned__', 'Unassigned', unassignedCount, 'unassigned-row')
      : '') +
    SITES.map(s => row(s.id, s.name, counts[s.id] || 0)).join('');

  list.querySelectorAll('.site-item').forEach(el => el.addEventListener('click', () => {
    state.selectedSite = el.dataset.site;
    lsSet('electrix_site', state.selectedSite);
    if (el.dataset.site === 'all') {
      nav('#/devices');
    } else if (el.dataset.site === '__unassigned__') {
      if (location.hash === '#/devices') renderMain();
      else location.hash = '#/devices';
    } else {
      nav(`#/devices/${el.dataset.site}`);
    }
  }));

  const sel = $('#sortSel'); if (sel) sel.value = state.sortBy;
}

function visibleDevices() {
  let list = DEVICES.slice();

  // Handle the pseudo-site first, then real sites.
  if (state.selectedSite === '__unassigned__') {
    list = list.filter(d => !d.site_id);
  } else if (state.selectedSite !== 'all') {
    list = list.filter(d => d.site_id === state.selectedSite);
  }

  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(d => {
      const site = siteName(d.site_id) || '';
      return d.name.toLowerCase().includes(q) ||
        d.device_id.toLowerCase().includes(q) ||
        site.toLowerCase().includes(q) ||
        d.capabilities.some(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    });
  }

  const rank = { alarm:0, warn:1, online:2, offline:3 };
  list.sort((a, b) => {
    if (state.sortBy === 'favorite') {
      const fav = (isFavorite(b.device_id) ? 1 : 0) - (isFavorite(a.device_id) ? 1 : 0);
      if (fav) return fav;
    }
    switch (state.sortBy) {
      case 'name': return a.name.localeCompare(b.name);
      case 'status': return (rank[deriveStatus(a)] ?? 9) - (rank[deriveStatus(b)] ?? 9) || a.name.localeCompare(b.name);
      case 'last_seen': return a.last_seen_s - b.last_seen_s;
      default: {
        const sa = siteName(a.site_id) || '\uffff';
        const sb = siteName(b.site_id) || '\uffff';
        return sa.localeCompare(sb) || a.name.localeCompare(b.name);
      }
    }
  });
  return list;
}

function renderDeviceGrid() {
  const grid = $('#grid'); if (!grid) return;
  const list = visibleDevices();
  const countEl = $('#mainCount');
  if (countEl) countEl.textContent = list.length + (list.length === 1 ? ' device' : ' devices');

  if (!list.length) {
    grid.innerHTML = `<div class="empty">No devices match.<div class="cta"><button class="btn" data-nav="#/devices">Clear filter</button></div></div>`;
    refreshIcons(grid); return;
  }

  grid.classList.toggle('list-view', state.deviceView === 'list');
  grid.innerHTML = list.map(d => {
    const st = deriveStatus(d), cls = statusClass(st);
    const displayStatus = d.lwt === 'offline' ? 'offline' : st === 'alarm' ? 'warn' : st;
    const alarms = ALARMS.filter(a => a.device_id === d.device_id && !a.cleared);
    const selected = state.bulkSelected.has(d.device_id);
    const siteLabel = d.site_id ? siteName(d.site_id) : null;

    return `<div class="card ${cls} ${selected ? 'selected' : ''}" data-device="${d.device_id}">
      <div class="sel-check" data-sel-device="${d.device_id}">${icon('check')}</div>
      <div class="card-top">
        <div style="min-width:0;flex:1;display:flex;gap:9px;align-items:flex-start;">
          <span class="cap-icon" style="width:28px;height:28px;background:var(--surface-2);">${icon(deviceTypeIcon(d.device_type))}</span>
          <div style="min-width:0;">
            <div class="card-name">${esc(d.name)}</div>
            <div class="card-site">
              ${siteLabel
                ? `<span class="site-badge">${icon('map-pin')}${esc(siteLabel)}</span>`
                : `<span class="site-badge unassigned">${icon('alert-circle')}Unassigned</span>`}
            </div>
          </div>
        </div>
        <div class="card-right">
          <span class="device-status status-${displayStatus === 'warn' ? 'warn' : displayStatus}">${displayStatus === 'warn' ? 'Warning' : displayStatus === 'offline' ? 'Offline' : 'Online'}</span>
        </div>
      </div>
      ${alarms.length ? `<div class="card-alarm-row"><span class="alarm-label ${alarms.some(a => a.priority === 'critical') ? 'critical' : ''}">${alarms.length} alarm${alarms.length === 1 ? '' : 's'}</span><button class="card-alarm-action" data-nav="#/alarms/${d.device_id}">View alarm${alarms.length === 1 ? '' : 's'} ${icon('arrow-up-right')}</button></div>` : ''}
      <div class="card-meta">
        <span class="mono card-id">${d.device_id}</span>
        <span>${st === 'offline' ? 'offline ' + fmtAgo(d.last_seen_s) : 'seen ' + fmtAgo(d.last_seen_s)}</span>
      </div>
      ${!d.site_id ? `<button class="card-assign-btn" data-assign-device="${d.device_id}" type="button">${icon('map-pin')}Assign to a site</button>` : ''}
      <span class="card-open">Open device ${icon('arrow-up-right')}</span>
    </div>`;
  }).join('');
  refreshIcons(grid);

  grid.querySelectorAll('[data-assign-device]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDeviceOnboarding(btn.dataset.assignDevice);
    });
  });
}