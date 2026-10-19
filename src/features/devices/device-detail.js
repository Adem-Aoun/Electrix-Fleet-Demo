'use strict';

const DEVICE_TABS = [
  { id:'overview',    label:'Overview',    icon:'gauge' },
  { id:'io',          label:'I/O',         icon:'sliders' },
  { id:'telemetry',   label:'Telemetry',   icon:'activity' },
  { id:'automation',  label:'Automation',  icon:'zap' },
  { id:'commands',    label:'Activity',    icon:'terminal-square' },
  { id:'config',      label:'Config',      icon:'settings-2' },
  { id:'events',      label:'Events',      icon:'list' },
  { id:'alarms',      label:'Alarms',      icon:'alert-triangle' },
  { id:'diagnostics', label:'Diagnostics', icon:'stethoscope' },
];

function renderDevicePage(main) {
  const d = deviceById(state.openDeviceId);
  if (!d) {
    main.innerHTML = `<div class="empty">Device not found.<div class="cta"><button class="btn" data-nav="#/devices">Back</button></div></div>`;
    refreshIcons(main);
    return;
  }
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
          <button class="site-chip" data-reassign-device="${d.device_id}" type="button" title="Change site">
            ${icon('map-pin')}
            <span>${d.site_id ? esc(siteName(d.site_id)) : 'Unassigned'}</span>
            ${icon('pencil')}
          </button>
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
        <button class="btn" data-act="query-state">${icon('refresh-cw')}<span>Refresh</span></button>
        <button class="btn danger" data-act="factory-reset" ${can('toggle') ? '' : 'disabled'}>${icon('trash-2')}<span>Reset</span></button>
      </div>
    </div>
    <div class="tabs" id="deviceTabs">
      ${DEVICE_TABS.map(t => `<button class="tab ${state.deviceTab === t.id ? 'active' : ''}" data-devtab="${t.id}" type="button">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}
    </div>
    <div id="devTabBody">${renderDeviceTab(d, state.deviceTab, { editable, controllable })}</div>`;
  refreshIcons(main);
  if (state.deviceTab === 'telemetry'  && typeof wireDeviceTelemetry === 'function') wireDeviceTelemetry(main, d);
  if (state.deviceTab === 'automation' && typeof wireLadderControls   === 'function') wireLadderControls(main);
  if (state.deviceTab === 'config'     && typeof wireDevConfig        === 'function') wireDevConfig(d);
  if (state.deviceTab === 'commands' && !deviceCommandsCache(d.device_id).items.length && !deviceCommandsCache(d.device_id).loading) {
    loadDeviceCommands(d.device_id);
  }
  if (state.deviceTab === 'events' && !deviceEventsCache(d.device_id).items.length && !deviceEventsCache(d.device_id).loading) {
    loadDeviceEvents(d.device_id);
  }
  if (state.deviceTab === 'diagnostics' && !deviceDiagnosticsCache(d.device_id).data && !deviceDiagnosticsCache(d.device_id).loading) {
    loadDeviceDiagnostics(d.device_id);
  }
}

function renderDeviceTab(d, tab, opts) {
  if (tab === 'overview') return renderDevOverview(d, opts);
  if (tab === 'io') return renderDevIO(d, opts);
  if (tab === 'telemetry' && typeof renderDevTelemetry === 'function') return renderDevTelemetry(d);
  if (tab === 'automation' && typeof renderDeviceAutomation === 'function') return renderDeviceAutomation(d);
  if (tab === 'config') return renderDevConfig(d, opts);
  if (tab === 'commands' && typeof renderDevCommands === 'function') return renderDevCommands(d, opts);
  if (tab === 'events') return renderDevEvents(d);
  if (tab === 'alarms') return renderDevAlarms(d);
  if (tab === 'diagnostics') return renderDevDiagnostics(d);
  return `<div class="empty">${esc(tab)} tab not implemented yet.</div>`;
}

function deviceCommandsCache(deviceId) {
  const cache = state.deviceCommands[deviceId] || {
    items: [],
    loading: false,
    error: '',
  };
  state.deviceCommands[deviceId] = cache;
  return cache;
}

function deviceEventsCache(deviceId) {
  const cache = state.deviceEvents[deviceId] || {
    items: [],
    oldestId: null,
    loading: false,
    error: '',
    filter: '',
  };
  state.deviceEvents[deviceId] = cache;
  return cache;
}

function deviceDiagnosticsCache(deviceId) {
  const cache = state.deviceDiagnostics[deviceId] || {
    data: null,
    loading: false,
    error: '',
  };
  state.deviceDiagnostics[deviceId] = cache;
  return cache;
}

function formatEventTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString();
}

function renderEventPayload(payload) {
  if (payload === null || payload === undefined) return '—';
  if (typeof payload === 'string') return esc(payload);
  return esc(JSON.stringify(payload, null, 2));
}

function renderCommandAckPayload(payload) {
  if (payload === null || payload === undefined) return '—';
  if (typeof payload === 'string') return esc(payload);
  return esc(JSON.stringify(payload, null, 2));
}

function renderDevCommands(d) {
  const cache = deviceCommandsCache(d.device_id);
  const rows = cache.items.map(command => {
    const status = command.status === 'ok' ? 'ok' : command.status === 'timeout' ? 'timeout' : command.status === 'error' ? 'error' : 'pending';
    const statusClass = status === 'ok' ? 'st-ok' : status === 'pending' ? 'st-warn' : 'st-alarm';
    return `<tr>
      <td><span class="mono">${esc(command.request_id)}</span></td>
      <td>${esc(command.actuator)}</td>
      <td><span class="mono">${command.value ? 'ON' : 'OFF'}</span></td>
      <td>${formatEventTime(command.issued_at)}</td>
      <td>${esc(command.actor || 'system')}</td>
      <td>${command.resolved_at ? formatEventTime(command.resolved_at) : '<span class="mono">pending</span>'}</td>
      <td><span class="state-chip ${statusClass}">${esc(status)}</span></td>
      <td><pre class="event-payload">${renderCommandAckPayload(command.ack_payload)}</pre></td>
    </tr>`;
  }).join('');
  return `<div class="device-tab-content">
    <div class="tab-toolbar">
      <span class="micro-label">${cache.items.length} command${cache.items.length === 1 ? '' : 's'} · newest first</span>
      <button class="btn sm" data-act="device-commands-refresh" ${cache.loading ? 'disabled' : ''}>
        ${icon('refresh-cw')} Refresh
      </button>
    </div>
    ${cache.error ? `<div class="inline-error">${esc(cache.error)}</div>` : ''}
    ${rows ? `<div class="table-wrap command-history-table"><table class="data-table"><thead><tr><th>Request ID</th><th>Actuator</th><th>Value</th><th>Issued</th><th>Issued by</th><th>Acked</th><th>Status</th><th>Ack payload</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">No command history yet.</div>'}
    ${cache.loading ? '<div class="empty">Loading command history…</div>' : ''}
  </div>`;
}

async function loadDeviceCommands(deviceId) {
  const cache = deviceCommandsCache(deviceId);
  if (cache.loading) return;
  cache.loading = true;
  cache.error = '';
  renderMain();
  try {
    cache.items = await mqtt.deviceCommands(deviceId, 100);
  } catch (e) {
    cache.error = e.message || 'Unable to load command history';
  } finally {
    cache.loading = false;
    renderMain();
  }
}

function renderDevEvents(d) {
  const cache = deviceEventsCache(d.device_id);
  const rows = cache.items.map(ev => `
    <tr>
      <td><span class="mono">${ev.id || '—'}</span></td>
      <td>${formatEventTime(ev.received_at)}</td>
      <td><span class="mono">${esc(ev.topic_tail)}</span></td>
      <td><pre class="event-payload">${renderEventPayload(ev.payload)}</pre></td>
    </tr>`).join('');
  const filters = ['','state','config','alarm','mqtt','lwt','ack'].map(f => `
    <button class="chip ${cache.filter === f ? 'active' : ''}"
      data-act="device-events-filter" data-filter="${esc(f)}" type="button">${f || 'All'}</button>`).join('');
  return `<div class="device-tab-content">
    <div class="tab-toolbar">
      <div class="filter-chips">${filters}</div>
      <button class="btn sm" data-act="device-events-load-more" ${cache.loading || !cache.items.length ? 'disabled' : ''}>
        ${icon('refresh-cw')} Load older
      </button>
    </div>
    ${cache.error ? `<div class="inline-error">${esc(cache.error)}</div>` : ''}
    ${rows ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Time</th><th>Topic</th><th>Payload</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">No events received.</div>'}
    ${cache.loading ? '<div class="empty">Loading older events…</div>' : ''}
  </div>`;
}

async function loadDeviceEvents(deviceId, beforeId = null) {
  const cache = deviceEventsCache(deviceId);
  if (cache.loading) return;
  cache.loading = true;
  cache.error = '';
  renderMain();
  try {
    const result = await mqtt.deviceEvents(deviceId, 200, beforeId, cache.filter);
    const items = result || [];
    cache.items = beforeId === null ? items : cache.items.concat(items);
    cache.oldestId = items.length ? items[items.length - 1].id : cache.oldestId;
    cache.loading = false;
    renderMain();
  } catch (e) {
    cache.loading = false;
    cache.error = e.message || 'Unable to load events';
    renderMain();
  }
}

function setDeviceEventsFilter(deviceId, filter) {
  const cache = deviceEventsCache(deviceId);
  cache.filter = filter;
  cache.items = [];
  cache.oldestId = null;
  loadDeviceEvents(deviceId, null);
}

function renderDevAlarms(d) {
  const alarms = ALARMS.filter(a => a.device_id === d.device_id);
  const active = alarms.filter(a => !a.cleared && !isShelved(a));
  const shelved = alarms.filter(a => !a.cleared && isShelved(a));
  const history = alarms.filter(a => a.cleared);
  const canAct = can('ack') || can('clear') || can('shelve');
  const rows = alarms.map(a => {
    const shelvedAlarm = isShelved(a);
    const severity = a.priority === 'critical' ? 'critical' : a.priority === 'low' ? 'info' : 'warn';
    const stateClass = a.state === 'UNACK_ALARM' ? 'unack' : a.state === 'ACK_ALARM' ? 'ack' : 'rtn';
    const deviceContext = deviceById(a.device_id)
      ? `<a href="${deviceRoute(a.device_id)}" data-nav="${deviceRoute(a.device_id)}">${esc(deviceById(a.device_id).name)}</a>`
      : esc(a.device_id);
    return `<div class="alarm-item sev-${severity} ${shelvedAlarm ? 'shelved' : ''}">
      <span class="alarm-sev sev-${severity}">${esc(a.priority)}</span>
      <div class="alarm-body">
        <div class="alarm-msg">${esc(a.msg)}<span class="state-chip st-${stateClass}">${esc(a.state)}</span>${shelvedAlarm ? `<span class="shelve-tag">${fmtAgo(Math.floor((a.shelved_until - Date.now()) / 1000))} left</span>` : ''}</div>
        <div class="alarm-meta">${esc(a.code)} · ${deviceContext} · ${fmtSince(a.since)}${a.acked ? ' · acknowledged' : ''}</div>
        ${a.note ? `<div class="alarm-note">“${esc(a.note)}”</div>` : ''}
      </div>
      ${canAct && !a.cleared ? `<div class="alarm-actions">
        ${a.state === 'UNACK_ALARM' && can('ack') ? `<button class="btn sm" data-alarm-ack="${a.id}">${icon('check')}Ack</button>` : ''}
        ${can('shelve') ? `<button class="btn sm" data-alarm-${shelvedAlarm ? 'unshelve' : 'shelve'}="${a.id}">${icon(shelvedAlarm ? 'archive-restore' : 'archive')}${shelvedAlarm ? 'Unshelve' : 'Shelve'}</button>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
  return `<div class="device-tab-content">
    <div class="tab-toolbar">
      <span class="micro-label">${alarms.length} alarm${alarms.length === 1 ? '' : 's'} for ${esc(d.name)}</span>
      <span class="micro-label">${active.length} active · ${shelved.length} shelved · ${history.length} history</span>
    </div>
    ${rows ? `<div class="device-alarm-list">${rows}</div>` : '<div class="empty">No alarms received for this device.</div>'}
  </div>`;
}

function diagnosticsIssueList(diagnostics) {
  const flags = diagnostics.flags || [];
  const issues = [];
  if (flags.includes('no_heartbeat')) issues.push({ name:'No heartbeat', detail:'Last heartbeat is older than 3× the configured period.' });
  if (flags.includes('wifi_rssi_low')) issues.push({ name:'Weak Wi-Fi signal', detail:`RSSI is ${diagnostics.rssi_dbm ?? 'unknown'} dBm.` });
  if (flags.includes('mqtt_flapping')) issues.push({ name:'MQTT flapping', detail:`Reconnect count is ${diagnostics.reconnect_count}.` });
  if (flags.includes('config_stale')) issues.push({ name:'Config stale', detail:'Configuration is older than 7 days.' });
  return issues;
}

function renderDevDiagnostics(d) {
  const cache = deviceDiagnosticsCache(d.device_id);
  const data = cache.data;
  const issues = data ? diagnosticsIssueList(data) : [];
  const rows = data ? [
    ['LWT', data.lwt],
    ['Last seen', data.last_seen_ms_ago < 1000 ? 'now' : `${data.last_seen_ms_ago} ms ago`],
    ['Heartbeat period', `${data.heartbeat_period_ms} ms`],
    ['Reconnect count', data.reconnect_count],
    ['Free heap', `${data.free_heap} bytes`],
    ['Min free heap', `${data.min_free_heap} bytes`],
    ['Uptime', `${data.uptime_s} s`],
    ['Firmware', data.fw_version],
    ['Hardware revision', data.hw_rev],
    ['Site', data.site_id || 'Unassigned'],
    ['Config version', data.config_version],
    ['Schema version', data.schema_version],
    ['State topics', data.state_topic_count],
    ['Active alarms', data.alarm_active_count],
    ['Last event', data.last_event_at_ms ? `at ${new Date(data.last_event_at_ms).toLocaleString()}` : 'none'],
  ].map(([label, value]) => `<div class="diagnostic-row"><span>${esc(label)}</span><strong class="mono">${esc(String(value))}</strong></div>`).join('') : '';
  return `<div class="device-tab-content">
    <div class="tab-toolbar"><span class="micro-label">Current device snapshot</span><button class="btn sm" data-act="device-diagnostics-refresh" ${cache.loading ? 'disabled' : ''}>${icon('refresh-cw')} Refresh</button></div>
    ${cache.error ? `<div class="inline-error">${esc(cache.error)}</div>` : ''}
    ${data ? `<div class="dev-grid"><div class="panel"><h4>${icon('activity')}Runtime</h4><div class="diagnostic-list">${rows}</div></div><div class="panel"><h4>${icon('shield-alert')}Health checks</h4><div class="diagnostic-issues">${issues.length ? issues.map(i => `<div><strong>${esc(i.name)}</strong><span>${esc(i.detail)}</span></div>`).join('') : '<div class="empty">No issues detected.</div>'}</div></div></div>` : '<div class="empty">' + (cache.loading ? 'Loading diagnostics…' : 'Diagnostics unavailable.') + '</div>'}
  </div>`;
}

async function loadDeviceDiagnostics(deviceId) {
  const cache = deviceDiagnosticsCache(deviceId);
  if (cache.loading) return;
  cache.loading = true;
  cache.error = '';
  renderMain();
  try {
    cache.data = await mqtt.deviceDiagnostics(deviceId);
    cache.loading = false;
    renderMain();
  } catch (e) {
    cache.loading = false;
    cache.error = e.message || 'Unable to load diagnostics';
    renderMain();
  }
}

function renderDevOverview(d, { editable, controllable }) {
  const caps = d.capabilities.map(c => {
    const isRelay = c.kind === 'relay';
    const block = typeof isBlocked === 'function' ? isBlocked(d.device_id, c.id) : null;
    const toggleHtml = isRelay
      ? `<button class="toggle ${c.value ? 'on' : ''} ${c.pending ? 'pending' : ''}"
          data-toggle-device="${d.device_id}" data-toggle-cap="${c.id}"
          ${controllable && c.online && !block ? '' : 'disabled'}
          aria-pressed="${c.value}"
          title="${block ? 'Blocked: ' + esc(block.rule.name) : ''}"></button>`
      : `<span class="mono" style="font-size:12px;color:var(--content-dim);">${esc(c.value)}</span>`;
    return `<div class="cap-row">
      <div class="cap-icon">${icon(capIcon(c.kind))}</div>
      <div class="cap-info">
        <input class="cap-label-edit" value="${esc(c.label)}" data-cap-id="${c.id}" ${editable ? '' : 'disabled'}>
        <div class="cap-id mono">${c.id}</div>
        ${block ? `<div style="font-size:10.5px;color:var(--alarm);margin-top:3px;display:flex;align-items:center;gap:4px;">${icon('ban')}blocked: ${esc(block.rule.name)}</div>` : ''}
      </div>${toggleHtml}
    </div>`;
  }).join('') || '<div class="empty">No capabilities.</div>';

  return `<div class="dev-grid">
    <div class="panel"><h4>${icon('toggle-right')}Capabilities</h4>${caps}</div>
    <div class="panel"><h4>${icon('info')}Status</h4>
      <dl class="kv">
        <dt>LWT</dt><dd>${d.lwt}</dd>
        <dt>Last heartbeat</dt><dd>${fmtAgo(d.last_seen_s)}</dd>
        <dt>Heartbeat period</dt><dd>${d.config.heartbeat_period_ms} ms</dd>
        <dt>Firmware</dt><dd>${d.fw_version}</dd>
        <dt>HW rev</dt><dd>${d.hw_rev}</dd>
        <dt>MAC</dt><dd>${d.mac}</dd>
        <dt>Site</dt><dd>${d.site_id ? esc(siteName(d.site_id)) : '<span style="color:var(--warn)">Unassigned</span>'}</dd>
      </dl>
    </div>
  </div>`;
}

function renderDevIO(d, { controllable }) {
  const inputs = d.capabilities.filter(c => c.kind === 'sensor');
  const outputs = d.capabilities.filter(c => ['relay', 'led', 'buzzer'].includes(c.kind));
  const inputCards = inputs.map(c => {
    const isBoolean = typeof c.value === 'boolean';
    const value = isBoolean ? (c.value ? 'ON' : 'OFF') : (c.value === null || c.value === undefined || c.value === '' ? '—' : String(c.value));
    const online = c.online && d.lwt === 'online';
    return `<article class="io-card io-input ${online ? '' : 'offline'}">
      <div class="io-card-top">
        <span class="io-card-icon">${icon(capIcon(c.kind))}</span>
        <span class="io-live ${online ? 'live' : ''}">${online ? 'LIVE' : 'OFFLINE'}</span>
      </div>
      <div class="io-card-label">${esc(c.label)}</div>
      <div class="io-card-value ${isBoolean ? 'boolean' : ''}">${esc(value)}</div>
      <div class="io-card-id mono">${esc(c.id)}</div>
    </article>`;
  }).join('');
  const outputCards = outputs.map(c => {
    const block = typeof isBlocked === 'function' ? isBlocked(d.device_id, c.id) : null;
    const enabled = controllable && c.online && d.lwt === 'online' && !block;
    return `<article class="io-card io-output ${c.value ? 'on' : ''} ${c.pending ? 'pending' : ''}">
      <div class="io-card-top">
        <span class="io-card-icon">${icon(capIcon(c.kind))}</span>
        <span class="io-state ${c.value ? 'on' : ''}">${c.pending ? 'PENDING' : c.value ? 'ON' : 'OFF'}</span>
      </div>
      <div class="io-card-label">${esc(c.label)}</div>
      <button class="io-toggle ${c.value ? 'on' : ''}" type="button"
        data-toggle-device="${d.device_id}" data-toggle-cap="${c.id}"
        ${enabled ? '' : 'disabled'} aria-pressed="${c.value}"
        title="${block ? 'Blocked: ' + esc(block.rule.name) : c.online ? 'Toggle output' : 'Device offline'}">
        ${c.pending ? 'Working…' : c.value ? 'Turn off' : 'Turn on'}
      </button>
      <div class="io-card-id mono">${esc(c.id)}</div>
    </article>`;
  }).join('');
  return `<div class="device-tab-content io-panel">
    <div class="io-heading">
      <div>
        <span class="micro-label">Control panel</span>
        <h3>${esc(d.name)}</h3>
      </div>
      <div class="io-device-status"><span class="status-dot ${statusClass(deriveStatus(d))}"></span>${esc(d.lwt)} · ${inputs.length} input${inputs.length === 1 ? '' : 's'} · ${outputs.length} output${outputs.length === 1 ? '' : 's'}</div>
    </div>
    <section class="io-section">
      <div class="io-section-title"><span>${icon('radio')}Inputs</span><small>Live indicators</small></div>
      <div class="io-grid">${inputCards || '<div class="empty">No inputs reported.</div>'}</div>
    </section>
    <section class="io-section">
      <div class="io-section-title"><span>${icon('toggle-right')}Outputs</span><small>Instant control</small></div>
      <div class="io-grid">${outputCards || '<div class="empty">No outputs reported.</div>'}</div>
    </section>
  </div>`;
}

// ---------------------------------------------------------------------------
// Config tab
//
// Reads the current config from the retained config/current topic (which
// the adapter stashes on dev.latest_state) and builds a form. On save it
// posts to the backend's /devices/:id/config endpoint, which forwards to
// the firmware's config/set and blocks on config/ack.
//
// Two kinds of rows:
//   - Global fields (timing + flags) — single fields, always editable.
//   - Per-capability rows — one row per sensor / actuator the device
//     reports. Any existing config entry for that id is merged in.
// ---------------------------------------------------------------------------

function renderDevConfig(d, opts) {
  const editable = can('rename');
  const cfg = (d.latest_state && d.latest_state['config/current']) || {};

  const sensors   = d.capabilities.filter(c => c.kind === 'sensor');
  const actuators = d.capabilities.filter(c => ['relay', 'led', 'buzzer'].includes(c.kind));

  const sensorRows = sensors.map(cap => {
    const ex = (cfg.sensors || []).find(s => s.sensor_id === cap.id) || {};
    const dis = editable ? '' : 'disabled';
    return `<tr data-sensor="${esc(cap.id)}">
      <td><span class="mono">${esc(cap.id)}</span></td>
      <td><input type="text"   data-field="label"              value="${esc(ex.label || '')}" placeholder="${esc(cap.label || cap.id)}" ${dis}></td>
      <td><input type="number" data-field="threshold_low"      value="${esc(String(ex.threshold_low ?? 0))}"   step="any" ${dis}></td>
      <td><input type="number" data-field="threshold_high"     value="${esc(String(ex.threshold_high ?? 100))}" step="any" ${dis}></td>
      <td><input type="number" data-field="calibration_offset" value="${esc(String(ex.calibration_offset ?? 0))}" step="any" ${dis}></td>
      <td style="text-align:center"><input type="checkbox" data-field="threshold_enabled" ${ex.threshold_enabled ? 'checked' : ''} ${dis}></td>
      <td style="text-align:center"><input type="checkbox" data-field="publish_enabled"   ${ex.publish_enabled !== false ? 'checked' : ''} ${dis}></td>
    </tr>`;
  }).join('');

  const actuatorRows = actuators.map(cap => {
    const ex = (cfg.actuators || []).find(a => a.actuator_id === cap.id) || {};
    const dis = editable ? '' : 'disabled';
    return `<tr data-actuator="${esc(cap.id)}">
      <td><span class="mono">${esc(cap.id)}</span> <span class="auto-tag-type">${esc(cap.kind)}</span></td>
      <td><input type="text" data-field="label" value="${esc(ex.label || '')}" placeholder="${esc(cap.label || cap.id)}" ${dis}></td>
    </tr>`;
  }).join('');

  const dis = editable ? '' : 'disabled';

  return `<div class="config-panel">
    <div class="panel">
      <h4>${icon('settings-2')}Timing</h4>
      <div class="config-row">
        <label for="cfgSensorPeriod">Sensor publish period</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" id="cfgSensorPeriod" min="100" max="3600000"
                 value="${esc(String(cfg.sensor_publish_period_ms ?? 1000))}" ${dis}>
          <span class="unit">ms</span>
        </div>
      </div>
      <div class="config-row">
        <label for="cfgHeartbeat">Heartbeat period</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" id="cfgHeartbeat" min="1000" max="3600000"
                 value="${esc(String(cfg.heartbeat_period_ms ?? 30000))}" ${dis}>
          <span class="unit">ms</span>
        </div>
      </div>
    </div>

    <div class="panel">
      <h4>${icon('flag')}Feature flags</h4>
      <label class="checkrow">
        <input type="checkbox" id="cfgAggTelemetry"
               ${cfg.feature_agg_telemetry_enabled !== false ? 'checked' : ''} ${dis}>
        Aggregated telemetry
      </label>
      <label class="checkrow">
        <input type="checkbox" id="cfgThresholdEvents"
               ${cfg.feature_threshold_events_enabled !== false ? 'checked' : ''} ${dis}>
        Threshold events
      </label>
    </div>

    ${sensors.length ? `<div class="panel">
      <h4>${icon('radio')}Sensors</h4>
      <div class="config-table-wrap">
        <table class="config-table">
          <thead><tr>
            <th>ID</th><th>Label</th><th>Low</th><th>High</th><th>Offset</th>
            <th title="Threshold enabled">Thr</th>
            <th title="Publish enabled">Pub</th>
          </tr></thead>
          <tbody>${sensorRows}</tbody>
        </table>
      </div>
    </div>` : ''}

    ${actuators.length ? `<div class="panel">
      <h4>${icon('toggle-right')}Actuators</h4>
      <div class="config-table-wrap">
        <table class="config-table">
          <thead><tr><th>ID</th><th>Label</th></tr></thead>
          <tbody>${actuatorRows}</tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="panel config-actions">
      <div class="config-version">
        <span>config_version</span>
        <span class="mono">${esc(String(cfg.config_version ?? '—'))}</span>
        <span style="margin-left:12px">schema</span>
        <span class="mono">${esc(String(cfg.schema_version ?? '—'))}</span>
      </div>
      <div class="config-buttons">
        <button class="btn" id="cfgReload" type="button">${icon('refresh-cw')}Reload</button>
        <button class="btn primary" id="cfgSave" type="button" ${editable ? '' : 'disabled'}>
          ${icon('save')}Save &amp; apply
        </button>
      </div>
    </div>
  </div>`;
}

function wireDevConfig(d) {
  $('#cfgReload')?.addEventListener('click', () => {
    toast('Reloaded from device', { type: 'info', timeout: 1500 });
    renderMain();
  });

  $('#cfgSave')?.addEventListener('click', async () => {
    const btn = $('#cfgSave');
    if (btn.disabled) return;

    // Build the config payload from the form. Everything is included
    // explicitly, so the firmware's apply_json_config sees the full set
    // and can validate with full_replace semantics (arrays are
    // wholesale-replaced when present, single fields overwritten).
    const cfg = {
      sensor_publish_period_ms: parseInt($('#cfgSensorPeriod')?.value, 10),
      heartbeat_period_ms:      parseInt($('#cfgHeartbeat')?.value, 10),
      feature_agg_telemetry_enabled:    !!$('#cfgAggTelemetry')?.checked,
      feature_threshold_events_enabled: !!$('#cfgThresholdEvents')?.checked,
      sensors: [],
      actuators: [],
    };

    document.querySelectorAll('tr[data-sensor]').forEach(tr => {
      const get = f => tr.querySelector(`[data-field="${f}"]`);
      cfg.sensors.push({
        sensor_id:          tr.dataset.sensor,
        label:              get('label')?.value || '',
        threshold_low:      parseFloat(get('threshold_low')?.value)  || 0,
        threshold_high:     parseFloat(get('threshold_high')?.value) || 0,
        calibration_offset: parseFloat(get('calibration_offset')?.value) || 0,
        threshold_enabled:  !!get('threshold_enabled')?.checked,
        publish_enabled:    !!get('publish_enabled')?.checked,
      });
    });

    document.querySelectorAll('tr[data-actuator]').forEach(tr => {
      cfg.actuators.push({
        actuator_id: tr.dataset.actuator,
        label:       tr.querySelector('[data-field="label"]')?.value || '',
      });
    });

    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Saving…';

    try {
      const ack = await mqtt.saveConfig(d.device_id, cfg);
      audit('device.config_set', d.device_id, `v${ack.applied_version ?? '?'}`);
      toast('Config saved', {
        msg: `${d.device_id} · applied version ${ack.applied_version ?? '?'}`,
        type: 'ok',
      });
    } catch (e) {
      toast('Config save failed', { msg: e.message || 'unknown error', type: 'error', timeout: 6000 });
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
      refreshIcons(btn);
      // Give the adapter one poll cycle to pick up the new
      // config/current, then re-render.
      setTimeout(() => {
        if (state.view === 'device' && state.deviceTab === 'config') renderMain();
      }, 2400);
    }
  });
}