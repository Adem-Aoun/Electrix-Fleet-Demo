'use strict';

function renderDevices(main) {
  renderSitesAside();
  main.innerHTML = `
    <div class="main-head">
      <h1 id="mainTitle">${state.selectedSite === 'all' ? 'All sites' : esc(siteName(state.selectedSite))}</h1>
      <div class="main-head-actions">
        <span class="count" id="mainCount"></span>
        ${isMobile() ? `<button class="btn sm" id="mobileSiteFilter">${icon('filter')}<span>Sites</span></button>` : ''}
        <button class="btn sm ${state.bulkMode ? 'active' : ''}" id="bulkToggle">${state.bulkMode ? 'Done' : 'Select'}</button>
      </div>
    </div>
    <div class="grid" id="grid"></div>`;
  renderDeviceGrid();
  $('#bulkToggle').addEventListener('click', () => {
    state.bulkMode = !state.bulkMode;
    if (!state.bulkMode) state.bulkSelected.clear();
    renderMain();
  });
  const msf = $('#mobileSiteFilter'); if (msf) msf.addEventListener('click', openMobileSiteSheet);
}
function renderSitesAside() {
  const list = $('#siteList'); if (!list) return;
  const counts = {};
  DEVICES.forEach(d => counts[d.site_id] = (counts[d.site_id] || 0) + 1);
  const row = (id, name, count) =>
    `<button class="site-item ${state.selectedSite === id ? 'selected' : ''}" data-site="${id}">
      <span>${esc(name)}</span><span class="site-count">${count}</span></button>`;
  list.innerHTML = row('all','All sites',DEVICES.length) + SITES.map(s => row(s.id, s.name, counts[s.id] || 0)).join('');
  list.querySelectorAll('.site-item').forEach(el => el.addEventListener('click', () => {
    state.selectedSite = el.dataset.site;
    nav(el.dataset.site === 'all' ? '#/devices' : `#/devices/${el.dataset.site}`);
  }));
  const sel = $('#sortSel'); if (sel) sel.value = state.sortBy;
}
function visibleDevices() {
  let list = DEVICES.slice();
  if (state.selectedSite !== 'all') list = list.filter(d => d.site_id === state.selectedSite);
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.device_id.toLowerCase().includes(q) ||
      siteName(d.site_id).toLowerCase().includes(q) ||
      d.capabilities.some(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    );
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
      default: return siteName(a.site_id).localeCompare(siteName(b.site_id)) || a.name.localeCompare(b.name);
    }
  });
  return list;
}
function renderDeviceGrid() {
  const grid = $('#grid'); if (!grid) return;
  const list = visibleDevices();
  $('#mainCount').textContent = list.length + (list.length === 1 ? ' device' : ' devices');
  if (!list.length) {
    grid.innerHTML = `<div class="empty">No devices match.<div class="cta"><button class="btn" data-nav="#/devices">Clear filter</button></div></div>`;
    refreshIcons(grid); return;
  }
  grid.innerHTML = list.map(d => {
    const st = deriveStatus(d), cls = statusClass(st);
    const caps = d.capabilities.slice(0, 4).map(c =>
      `<span class="cap-chip ${c.kind === 'relay' && c.value ? 'on' : ''}">${icon(capIcon(c.kind))}${esc(c.label)}</span>`).join('');
    const alarms = ALARMS.filter(a => a.device_id === d.device_id && !a.cleared);
    const fav = isFavorite(d.device_id);
    const selected = state.bulkSelected.has(d.device_id);
    return `<div class="card ${cls} ${selected ? 'selected' : ''}" data-device="${d.device_id}">
      <div class="sel-check" data-sel-device="${d.device_id}">${icon('check')}</div>
      <button class="fav-btn ${fav ? 'on' : ''}" data-fav="${d.device_id}" title="${fav ? 'Remove' : 'Add'} favorite">${icon('star')}</button>
      <div class="card-top">
        <div style="min-width:0;flex:1;display:flex;gap:9px;align-items:flex-start;">
          <span class="cap-icon" style="width:28px;height:28px;background:var(--surface-2);">${icon(deviceTypeIcon(d.device_type))}</span>
          <div style="min-width:0;">
            <div class="card-name">${esc(d.name)}</div>
            <div class="card-site">${esc(siteName(d.site_id))}</div>
          </div>
        </div>
        <div class="card-right">
          ${alarms.length ? `<span class="alarm-sev sev-${alarms[0].priority === 'critical' ? 'critical' : alarms[0].priority === 'low' ? 'info' : 'warn'}" style="margin-top:0;">${alarms.length}</span>` : ''}
          ${freshnessHTML(d)}
        </div>
      </div>
      <div class="card-caps">${caps}</div>
      <div class="card-meta">
        <span class="mono">${d.device_id}</span>
        <span>${st === 'offline' ? 'offline ' + fmtAgo(d.last_seen_s) : 'seen ' + fmtAgo(d.last_seen_s)}</span>
      </div>
    </div>`;
  }).join('');
  refreshIcons(grid);
}

const DEVICE_TABS = [
  { id:'overview',    label:'Overview',    icon:'gauge' },
  { id:'telemetry',   label:'Telemetry',   icon:'activity' },
  { id:'commands',    label:'Activity',     icon:'terminal-square' },
  { id:'config',      label:'Config',      icon:'settings-2' },
  { id:'events',      label:'Events',       icon:'list' },
  { id:'diagnostics', label:'Diagnostics', icon:'stethoscope' },
];
function renderDevicePage(main) {
  const d = deviceById(state.openDeviceId);
  if (!d) { main.innerHTML = `<div class="empty">Device not found.<div class="cta"><button class="btn" data-nav="#/devices">Back</button></div></div>`; refreshIcons(main); return; }
  const st = deriveStatus(d), cls = statusClass(st);
  const editable = can('rename'), controllable = can('toggle');
  main.innerHTML = `
    <div class="dev-page-head">
      <div>
        <h1 class="dev-page-title">
          <span class="cap-icon" style="width:32px;height:32px;background:var(--surface-2);">${icon(deviceTypeIcon(d.device_type))}</span>
          <span>${esc(d.name)}</span>
          <span class="status-dot ${cls}"></span>
          <button class="fav-btn ${isFavorite(d.device_id) ? 'on' : ''}" data-fav="${d.device_id}" style="position:static;display:inline-flex;vertical-align:middle;">${icon('star')}</button>
        </h1>
        <div class="dev-page-sub">
          <span>${esc(siteName(d.site_id))}</span>
          <span>·</span>
          <span class="mono">${d.device_id}</span>
          <span>·</span>
          <span>fw ${esc(d.fw_version)}</span>
          <span>·</span>
          <span id="deviceSeenTicker" style="color:${deviceFreshnessTextColor(d)}">seen ${fmtAgo(d.last_seen_s)}</span>
          ${freshnessHTML(d)}
        </div>
      </div>
      <div class="dev-page-actions">
        <button class="btn" data-act="reboot" ${can('toggle') ? '' : 'disabled'}>${icon('rotate-cw')}<span>Reboot</span></button>
        <button class="btn" data-act="query-state" ${can('toggle') ? '' : 'disabled'}>${icon('refresh-cw')}<span>Query</span></button>
        <button class="btn danger" data-act="factory-reset" ${can('toggle') ? '' : 'disabled'}>${icon('trash-2')}<span>Reset</span></button>
      </div>
    </div>
    <div class="tabs" id="deviceTabs">
      ${DEVICE_TABS.map(t => `<button class="tab ${state.deviceTab === t.id ? 'active' : ''}" data-devtab="${t.id}" type="button">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}
    </div>
    <div id="devTabBody">${renderDeviceTab(d, state.deviceTab, { editable, controllable })}</div>`;
  refreshIcons(main);
  if (state.deviceTab === 'telemetry') wireDeviceTelemetry(main, d);
}
function renderDeviceTab(d, tab, opts) {
  if (tab === 'overview') return renderDevOverview(d, opts);
  if (tab === 'telemetry') return renderDevTelemetry(d);
  if (tab === 'commands') return renderDevCommands(d, opts);
  if (tab === 'config') return renderDevConfig(d, opts);
  if (tab === 'events') return renderDevEvents(d);
  if (tab === 'diagnostics') return renderDevDiagnostics(d);
  return '';
}
function siblingConfigMode(d, key) {
  const values = DEVICES.filter(other => other.device_type === d.device_type).map(other => other.config[key]);
  const counts = new Map();
  values.forEach(value => {
    const encoded = JSON.stringify(value);
    counts.set(encoded, { value, count:(counts.get(encoded)?.count || 0) + 1 });
  });
  return [...counts.values()].sort((a,b) => b.count-a.count)[0]?.value;
}
function deviceSuggestions(d) {
  const suggestions = [];
  const unack = ALARMS.filter(a => a.device_id === d.device_id && a.state === 'UNACK_ALARM' && !a.cleared);
  if (unack.length) suggestions.push({
    icon:'alert-triangle', text:`${unack.length} unacknowledged alarm${unack.length === 1 ? '' : 's'} — ack to silence repeat notification`,
    action:'review-alarms', label:'Review',
  });
  d.capabilities.filter(c => c.kind === 'relay' && c.value === true && Date.now() - c.since > 3 * 60 * 60 * 1000).forEach(c => {
    suggestions.push({ icon:'clock', text:`${c.label} on for 3h — add an auto-off?`, action:'automation', label:'Automate' });
  });
  d.capabilities.filter(c => c.kind === 'relay' && (c.label === c.id || /^relay\\d+$/.test(c.label))).forEach(c => {
    suggestions.push({ icon:'tag', text:`${c.id} has no label`, action:'rename-capability', capability:c.id, label:'Rename' });
  });
  ['sensor_publish_period_ms','heartbeat_period_ms','feature_agg_telemetry_enabled','feature_threshold_events_enabled'].forEach(key => {
    const modal = siblingConfigMode(d, key);
    if (modal !== undefined && d.config[key] !== modal) {
      suggestions.push({
        icon:'server', text:`${key} is ${String(d.config[key])}; siblings use ${String(modal)}`,
        action:'match-config', configKey:key, label:'Match siblings',
      });
    }
  });
  const heartbeatSeconds = d.config.heartbeat_period_ms / 1000;
  if (d.lwt === 'online' && d.last_seen_s > heartbeatSeconds * 2) {
    suggestions.push({
      icon:'wifi-off', text:`last seen ${fmtAgo(d.last_seen_s)}, expected every ${fmtAgo(heartbeatSeconds)}`,
      action:'diagnostics', label:'Diagnose',
    });
  }
  const versionParts = version => String(version).split('.').map(part => Number.parseInt(part, 10) || 0);
  const compareVersion = (a, b) => {
    const av = versionParts(a), bv = versionParts(b);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      if ((av[i] || 0) !== (bv[i] || 0)) return (av[i] || 0) - (bv[i] || 0);
    }
    return 0;
  };
  const fleetVersion = DEVICES.map(device => device.fw_version).sort(compareVersion).at(-1);
  if (fleetVersion && compareVersion(d.fw_version, fleetVersion) < 0) {
    suggestions.push({ icon:'upload-cloud', text:`fw ${d.fw_version} · fleet at ${fleetVersion}`, action:'ota', label:'View OTA' });
  }
  return suggestions;
}
function renderDeviceSuggestions(d) {
  const suggestions = deviceSuggestions(d);
  return `<div class="panel device-suggestions">
    <h4>${icon('lightbulb')}Suggestions</h4>
    ${suggestions.length ? suggestions.map(s => `<div class="suggestion-row">
      <span class="sg-icon">${icon(s.icon)}</span><span class="sg-text">${esc(s.text)}</span>
      <span class="sg-action"><button class="btn sm" type="button" data-suggestion="${s.action}" ${s.capability ? `data-capability="${esc(s.capability)}"` : ''} ${s.configKey ? `data-config-key="${esc(s.configKey)}"` : ''} ${(['match-config'].includes(s.action) && !can('rename')) || (s.action === 'rename-capability' && !can('rename')) ? 'disabled' : ''}>${esc(s.label)}</button></span>
    </div>`).join('') : '<div class="empty">No suggestions.</div>'}
  </div>`;
}
function toggleDeviceReference(deviceId, group) {
  const key = `${deviceId}/${group}`;
  state.deviceReferenceOpen[key] = !state.deviceReferenceOpen[key];
  lsSet('electrix_device_reference_open', state.deviceReferenceOpen);
  renderMain();
}
function renderDeviceReferences(d) {
  const schedules = SCHEDULES.filter(item => item.device_id === d.device_id);
  const scenes = SCENES.filter(item => item.actions.some(action => action.device_id === d.device_id));
  const rules = INTERLOCKS.filter(rule => rule.when.device_id === d.device_id || rule.then.device_id === d.device_id);
  if (!schedules.length && !scenes.length && !rules.length) {
    return `<div class="panel device-references"><h4>${icon('corner-up-right')}Referenced by</h4>
      <div class="reference-empty">Not referenced by any schedule, scene, or interlock.</div></div>`;
  }
  const groups = [
    { id:'schedules', label:'Schedules', items:schedules, href:'#/automation' },
    { id:'scenes', label:'Scenes', items:scenes, href:'#/automation' },
    { id:'interlocks', label:'Interlocks', items:rules, href:'#/interlocks' },
  ];
  return `<div class="panel device-references"><h4>${icon('corner-up-right')}Referenced by</h4>
    ${groups.map(group => {
      const key = `${d.device_id}/${group.id}`, open = !!state.deviceReferenceOpen[key];
      return `<div class="device-reference-group">
        <button class="device-reference-toggle" type="button" data-device-reference="${group.id}" data-device-id="${d.device_id}" aria-expanded="${open}">
          <span class="label">${group.label}</span><span class="mono">${group.items.length}</span>${icon(open ? 'chevron-up' : 'chevron-down')}
        </button>
        ${open && group.items.length ? `<div class="device-reference-items">${group.items.map(item => `<a href="${group.href}" data-nav="${group.href}">${icon('arrow-up-right')}<span>${esc(item.name)}</span></a>`).join('')}</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}
function renderDevOverview(d, { editable, controllable }) {
  const caps = d.capabilities.map(c => {
    const isRelay = c.kind === 'relay';
    const block = isBlocked(d.device_id, c.id);
    const toggleHtml = isRelay
      ? `<button class="toggle ${c.value ? 'on' : ''} ${c.pending ? 'pending' : ''}"
          data-toggle-device="${d.device_id}" data-toggle-cap="${c.id}"
          ${controllable && c.online && !block ? '' : 'disabled'}
          aria-pressed="${c.value}"
          title="${block ? 'Blocked: ' + esc(block.rule.name) : ''}"></button>`
      : `<span class="mono" style="font-size:12px;color:var(--content-dim);">${esc(c.value)}</span>`;
    let devHtml = '';
    if (state.devMode) {
      const stateTopic = `electrix/${d.device_id}/state/${c.id}`;
      const cmdTopic = `electrix/${d.device_id}/cmd/${c.id}/set`;
      const payload = isRelay ? `{"value": ${c.value}, "source": "device"}` : `{"value": "${c.value}"}`;
      devHtml = `<div class="devpanel">
        <button class="copy-btn" data-copy="${esc(stateTopic)}">${icon('copy')}copy</button>
<span class="k">state</span>: ${stateTopic} <span class="qos-badge">QoS1·retained</span>
${isRelay ? `<span class="k">cmd/set</span>: ${cmdTopic} <span class="qos-badge">QoS2</span>` : ''}
<span class="k">payload</span>: ${esc(payload)}</div>`;
    }
    return `<div class="cap-row">
      <div class="cap-icon">${icon(capIcon(c.kind))}</div>
      <div class="cap-info">
        <input class="cap-label-edit" value="${esc(c.label)}" data-cap-id="${c.id}" ${editable ? '' : 'disabled'}>
        <div class="cap-id mono">${c.id}</div>
        ${block ? `<div style="font-size:10.5px;color:var(--alarm);margin-top:3px;display:flex;align-items:center;gap:4px;">${icon('ban')}blocked: ${esc(block.rule.name)}</div>` : ''}
        ${devHtml}
      </div>${toggleHtml}
    </div>`;
  }).join('') || '<div class="empty">No capabilities.</div>';
  let identity = '';
  if (state.devMode) {
    const whoPayload = JSON.stringify({
      device_type: d.device_type, hw_rev: d.hw_rev, fw_version: d.fw_version, mac: d.mac,
      capabilities: d.capabilities.map(c => `${c.kind}:${c.id}`),
    }, null, 2);
    identity = `<div class="panel" style="grid-column:1/-1">
      <h4>${icon('fingerprint')}Identity (who_am_i)</h4>
      <div class="devpanel"><button class="copy-btn" data-copy="electrix/${d.device_id}/who_am_i">${icon('copy')}</button>
<span class="k">topic</span>: electrix/${d.device_id}/who_am_i <span class="qos-badge">retained</span>
${esc(whoPayload)}</div>
    </div>`;
  }
  return `<div class="dev-grid">
    ${renderDeviceSuggestions(d)}
    <div class="panel"><h4>${icon('toggle-right')}Capabilities</h4>${caps}</div>
    <div class="panel"><h4>${icon('info')}Status</h4>
      <dl class="kv">
        <dt>LWT</dt><dd>${d.lwt}</dd>
        <dt>Last heartbeat</dt><dd>${fmtAgo(d.last_seen_s)}</dd>
        <dt>Heartbeat period</dt><dd>${d.config.heartbeat_period_ms} ms</dd>
        <dt>Firmware</dt><dd>${d.fw_version}</dd>
        <dt>HW rev</dt><dd>${d.hw_rev}</dd>
        <dt>MAC</dt><dd>${d.mac}</dd>
      </dl>
    </div>
    ${renderDeviceReferences(d)}
    ${identity}
  </div>`;
}
