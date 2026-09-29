'use strict';

const COMMAND_HISTORY = [];
function renderDevCommands(d, { controllable }) {
  const cmds = COMMAND_HISTORY.filter(c => c.device_id === d.device_id);
  const relays = d.capabilities.filter(c => c.kind === 'relay');
  return `<div class="panel" style="margin-bottom:14px">
    <h4>${icon('send')}Send command</h4>
    ${relays.length ? relays.map(c => {
      const block = isBlocked(d.device_id, c.id);
      return `<div class="cap-row">
        <div class="cap-icon">${icon('power')}</div>
        <div class="cap-info">
          <div style="font-weight:600;font-size:13px;">${esc(c.label)}</div>
          <div class="cap-id mono">${c.id} · ${c.online ? 'online' : 'offline'}</div>
          ${block ? `<div style="font-size:10.5px;color:var(--alarm);margin-top:3px;">${icon('ban')} blocked: ${esc(block.rule.name)}</div>` : ''}
        </div>
        <button class="btn" data-cmd-set="${c.id}" data-cmd-val="on"  ${controllable && c.online && !block ? '' : 'disabled'}>${icon('power')}<span>ON</span></button>
        <button class="btn" data-cmd-set="${c.id}" data-cmd-val="off" ${controllable && c.online && !block ? '' : 'disabled'}>${icon('power-off')}<span>OFF</span></button>
      </div>`;
    }).join('') : '<div class="empty">No actuators.</div>'}
  </div>
  <div class="panel"><h4>${icon('history')}Activity</h4>
    ${cmds.length ? `<div class="log-view">${cmds.map(c => `<div class="log-row command-log-row">
        <span class="ts">${fmtClock(c.ts)}</span>
        <span class="source-chip" title="${esc(c.source || 'system')}">${({ schedule:'[S]', scene:'[C]', interlock:'[I]', human:'[U]', system:'[Y]' })[c.source || 'system']}</span>
        <span class="lv ${c.status === 'ok' ? 'info' : 'error'}">${c.status}</span>
        <span>cmd/${esc(c.actuator)}/set=${esc(String(c.value))}</span>
      </div>`).join('')}</div>` : '<div class="empty">No commands yet.</div>'}
  </div>`;
}
function renderDevConfig(d, { editable }) {
  const c = d.config, dis = editable ? '' : 'disabled';
  const defaults = CONFIG_DEFAULTS[d.device_type] || {};
  const fields = [
    { key:'sensor_publish_period_ms', name:'Sensor publish period', step:'100', unit:'ms', type:'number' },
    { key:'heartbeat_period_ms', name:'Heartbeat period', step:'1000', unit:'ms', type:'number' },
    { key:'feature_agg_telemetry_enabled', name:'Aggregated telemetry', type:'checkbox' },
    { key:'feature_threshold_events_enabled', name:'Threshold events', type:'checkbox' },
  ];
  const rows = fields.map(field => {
    const value = c[field.key], defaultValue = defaults[field.key];
    const changed = defaultValue !== undefined && value !== defaultValue;
    const control = field.type === 'checkbox'
      ? `<span class="config-diff-value"><input type="checkbox" data-cfg="${field.key}" ${value ? 'checked' : ''} ${dis}><span class="mono">${String(value)}</span></span>`
      : `<span class="config-diff-value"><input type="number" data-cfg="${field.key}" value="${esc(String(value))}" step="${field.step}" ${dis} inputmode="numeric"><span class="unit">${field.unit}</span></span>`;
    return `<div class="config-diff-row ${changed ? 'changed' : ''}">
      <span class="config-diff-name">${esc(field.name)}</span>
      <div class="config-diff-editor">${control}${changed ? `<span class="config-diff-default">· default <span class="mono">${esc(String(defaultValue))}${field.unit || ''}</span></span>` : ''}</div>
    </div>`;
  }).join('');
  return `<div class="panel">
    <h4>${icon('settings-2')}config/set</h4>
    <div class="config-form">
      ${rows}
      ${editable ? `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;"><button class="btn primary" data-act="save-config">${icon('save')}Save</button><button class="btn" data-act="load-config">${icon('refresh-cw')}Reload</button></div>`
        : `<div class="perm-note">${icon('lock')}<span>Sign in as operator or admin to edit config.</span></div>`}
    </div>
    ${state.devMode ? `<h4 style="margin-top:16px">${icon('file-code')}config/current</h4>
      <div class="devpanel"><button class="copy-btn" data-copy="electrix/${d.device_id}/config/current">${icon('copy')}</button>
electrix/${d.device_id}/config/current
${esc(JSON.stringify(c, null, 2))}</div>` : ''}
  </div>`;
}
function renderDevEvents(d) {
  const events = ALARMS.filter(a => a.device_id === d.device_id);
  return `<div class="panel">
    <h4>${icon('list')}Event stream</h4>
    ${events.length ? events.map(a => `<div class="alarm-item sev-${a.priority === 'critical' ? 'critical' : a.priority === 'low' ? 'info' : 'warn'}">
      <span class="alarm-sev sev-${a.priority === 'critical' ? 'critical' : a.priority === 'low' ? 'info' : 'warn'}">${a.priority}</span>
      <div class="alarm-body">
        <div class="alarm-msg">${esc(a.msg)}${a.latched ? '<span class="latch-tag">latched</span>' : ''}${isShelved(a) ? '<span class="shelve-tag">shelved</span>' : ''}<span class="state-chip st-${a.state === 'UNACK_ALARM' ? 'unack' : a.state === 'ACK_ALARM' ? 'ack' : 'rtn'}">${a.state}</span></div>
        <div class="alarm-meta">${esc(a.code)} · ${fmtSince(a.since)}</div>
        ${a.note ? `<div class="alarm-note">“${esc(a.note)}”</div>` : ''}
      </div>
    </div>`).join('') : '<div class="empty">No events.</div>'}
  </div>`;
}
function renderDevDiagnostics(d) {
  const sample = [
    { ts: Date.now() - 40000, lv:'debug', msg:'heartbeat published, rssi=-58' },
    { ts: Date.now() - 30000, lv:'info',  msg:'config/get served, params=4' },
    { ts: Date.now() - 22000, lv:'info',  msg:'telemetry/current → 2.41 A' },
    { ts: Date.now() - 12000, lv:'warn',  msg:'mqtt reconnect attempt #1' },
    { ts: Date.now() - 4000,  lv:'info',  msg:'mqtt reconnected' },
  ];
  return `<div class="panel">
    <h4>${icon('stethoscope')}diag/log (QoS0)</h4>
    <div class="log-view">${sample.map(l => `<div class="log-row">
      <span class="ts">${fmtClock(l.ts)}</span><span class="lv ${l.lv}">${l.lv}</span><span>${esc(l.msg)}</span>
    </div>`).join('')}</div>
    ${state.devMode ? `<div style="margin-top:12px;"><button class="btn sm" data-act="toggle-inspector">${icon('terminal')}Open inspector</button></div>` : ''}
  </div>`;
}
