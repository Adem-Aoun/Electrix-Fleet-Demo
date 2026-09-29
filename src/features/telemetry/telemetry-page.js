'use strict';

function renderTelemetry(main) {
  const sensors = new Set();
  Object.keys(TELEMETRY).forEach(k => sensors.add(k.split('/')[1]));
  const range = telemetryRange(), { start, end, windowMs, selected } = range;
  let keys = Object.keys(TELEMETRY);
  if (state.teleDevice !== 'all') keys = keys.filter(k => k.startsWith(state.teleDevice + '/'));
  if (state.teleSensor !== 'all') keys = keys.filter(k => k.split('/')[1] === state.teleSensor);
  const mode = state.teleMode;
  const severity = { alarm:6, offline:5, warn:4, stale:3, 'no-data':2, ok:1 };
  const healthDevices = DEVICES.filter(device => state.teleDevice === 'all' || device.device_id === state.teleDevice)
    .map(device => ({ device, keys:Object.keys(TELEMETRY).filter(key => key.startsWith(device.device_id + '/')), status:telemetryDeviceStatus(device) }))
    .sort((a, b) => state.teleSort === 'alphabetical'
      ? a.device.name.localeCompare(b.device.name)
      : (severity[b.status] || 0) - (severity[a.status] || 0) || a.device.name.localeCompare(b.device.name));
  const problemDevices = healthDevices.filter(item => item.status !== 'ok');
  const attentionCount = problemDevices.length;
  const offlineCount = healthDevices.filter(item => item.status === 'offline').length;
  const noDataCount = healthDevices.filter(item => item.status === 'no-data').length;
  const focusKey = keys.includes(state.teleFocusKey) ? state.teleFocusKey : keys[0] || null;
  if (mode === 'charts') state.teleFocusKey = focusKey;
  const chartKeys = mode === 'charts' && focusKey ? [focusKey] : [];
  const summaryCard = (label, value, detail, status = '') => `<div class="tele-summary-card ${status}"><span class="label">${label}</span><span class="value">${value}<span class="detail">${detail}</span></span></div>`;
  const renderAttentionRow = ({ device, keys:deviceKeys, status }) => {
    const visibleKeys = state.teleSensor === 'all' ? deviceKeys : deviceKeys.filter(key => key.split('/')[1] === state.teleSensor);
    const flagged = visibleKeys.filter(key => ['alarm','warn','stale','offline','no-data'].includes(telemetryStatus(key, device))).length;
    return `<button type="button" class="tele-overview-device status-${status}" data-health-device="${device.device_id}" aria-label="View charts for ${esc(device.name)}, ${esc(telemetryStatusLabel(status))}">
      <span><span class="device-name"><span class="status-dot ${statusClass(status === 'ok' ? 'online' : status === 'no-data' || status === 'stale' ? 'warn' : status)}"></span><span>${esc(device.name)}</span></span>
        <span class="device-meta">${esc(siteName(device.site_id))} · seen ${esc(fmtAgo(device.last_seen_s))}</span></span>
      <span class="signal-summary"><span class="signal-chip status-${status}">${esc(telemetryStatusLabel(status))}</span><span class="signal-chip">${flagged} flagged / ${visibleKeys.length} signals</span></span>
      <span class="device-action">View charts ${icon('arrow-right')}</span>
    </button>`;
  };
  const visibleProblems = problemDevices.slice(0, 3), remainingProblems = problemDevices.slice(3);
  main.innerHTML = `
    <div class="main-head">
      <h1>Telemetry</h1>
      <div class="main-head-actions"><span class="count">${keys.length} signals</span></div>
    </div>
    ${renderTelemetryTabs(mode)}
    ${mode === 'overview' ? `
      <div class="tele-summary-grid">
        ${summaryCard('Needs attention', attentionCount, 'devices', attentionCount ? 'status-alarm' : '')}
        ${summaryCard('Offline', offlineCount, 'devices', offlineCount ? 'status-offline' : '')}
        ${summaryCard('No signal data', noDataCount, 'devices', noDataCount ? 'status-warn' : '')}
        ${summaryCard('Signals', keys.length, 'shown')}
      </div>
      <section aria-label="Devices needing attention">
        <div class="widget-head"><h3>${icon('activity')}Needs attention</h3><span class="count">${problemDevices.length}</span></div>
        <div class="tele-overview-devices">
          ${problemDevices.length ? visibleProblems.map(renderAttentionRow).join('') : '<div class="empty">All devices are reporting normally.</div>'}
          ${remainingProblems.length ? `<details class="tele-more-devices"><summary>Show ${remainingProblems.length} more device${remainingProblems.length === 1 ? '' : 's'}</summary><div class="tele-overview-devices">${remainingProblems.map(renderAttentionRow).join('')}</div></details>` : ''}
        </div>
      </section>
      <div class="tele-chart-tools">
        <div><label for="teleDev">Device</label><select id="teleDev"><option value="all">All devices</option>
          ${DEVICES.map(device => `<option value="${device.device_id}" ${state.teleDevice === device.device_id ? 'selected' : ''}>${esc(device.name)}</option>`).join('')}
        </select></div>
        <div><label for="teleSen">Signal type</label><select id="teleSen"><option value="all">All signals</option>
          ${[...sensors].sort().map(sensor => `<option value="${sensor}" ${state.teleSensor === sensor ? 'selected' : ''}>${esc(sensor)}</option>`).join('')}
        </select></div>
        <div><label for="teleSort">Order</label><select id="teleSort">
          <option value="anomaly" ${state.teleSort !== 'alphabetical' ? 'selected' : ''}>Needs attention first</option>
          <option value="alphabetical" ${state.teleSort === 'alphabetical' ? 'selected' : ''}>Alphabetical</option>
        </select></div>
      </div>
      <div class="widget-head"><h3>${icon('gauge')}Signals</h3><span class="count">${keys.length}</span></div>
      ${renderTelemetryGaugeGrid(keys)}
    ` : `
      <div class="tele-chart-tools">
        <div><label for="teleDev">Device</label><select id="teleDev"><option value="all">All devices</option>
          ${DEVICES.map(device => `<option value="${device.device_id}" ${state.teleDevice === device.device_id ? 'selected' : ''}>${esc(device.name)}</option>`).join('')}
        </select></div>
        <div><label for="teleSen">Signal type</label><select id="teleSen"><option value="all">All signals</option>
          ${[...sensors].sort().map(sensor => `<option value="${sensor}" ${state.teleSensor === sensor ? 'selected' : ''}>${esc(sensor)}</option>`).join('')}
        </select></div>
        <div class="tele-tool-signal"><label for="teleMetric">Signal</label><select id="teleMetric" ${keys.length ? '' : 'disabled'}>
          ${keys.map(key => `<option value="${esc(key)}" ${key === focusKey ? 'selected' : ''}>${esc(deviceById(key.split('/')[0])?.name || key.split('/')[0])} · ${esc(key.split('/')[1])}</option>`).join('')}
        </select></div>
        <div><label for="teleWin">Time range</label>${telemetryWindowSelect('teleWin')}</div>
        <button class="btn sm" id="teleExport" ${focusKey ? '' : 'disabled'}>${icon('download')}Export CSV</button>
        ${selected ? '<button class="btn sm" id="teleClearSelection">Clear selection</button>' : ''}
      </div>
      ${focusKey ? renderTelemetryMetricDetails(focusKey, start, end) : '<div class="empty">No signals match these filters.</div>'}
      ${renderTelemetryStack(chartKeys, start, windowMs)}
      ${focusKey ? '<p class="tele-selection-status">Drag across the chart to inspect a sample or select a time range. Use Pin value or Δ/Δt on the chart to compare or view rate of change.</p>' : ''}
    `}`;
  refreshIcons(main);
  $('#teleDev')?.addEventListener('change', e => { state.teleDevice = e.target.value; state.teleFocusKey = null; renderMain(); });
  $('#teleSen')?.addEventListener('change', e => { state.teleSensor = e.target.value; state.teleFocusKey = null; renderMain(); });
  $('#teleWin')?.addEventListener('change', e => { state.teleWindow = e.target.value; clearTeleSelection(); });
  $('#teleMetric')?.addEventListener('change', e => { state.teleFocusKey = e.target.value; renderMain(); });
  $('#teleSort')?.addEventListener('change', e => {
    state.teleSort = e.target.value;
    lsSet('electrix_tele_sort', state.teleSort);
    renderMain();
  });
  $('#teleClearSelection')?.addEventListener('click', clearTeleSelection);
  $('#teleExport')?.addEventListener('click', () => {
    if (focusKey) exportTelemetryCSV([focusKey], windowMs, start, end);
  });
  if (mode === 'charts' && chartKeys.length) wireTelemetryStack(main, chartKeys, start, windowMs);
}
function wireDeviceTelemetry(main, d) {
  const range = telemetryRange(), keys = Object.keys(TELEMETRY).filter(key => key.startsWith(d.device_id + '/'));
  main.querySelector('#deviceTeleMetric')?.addEventListener('change', event => { state.teleFocusKey = event.target.value; renderMain(); });
  main.querySelector('#deviceTeleWindow')?.addEventListener('change', event => {
    state.teleWindow = event.target.value;
    clearTeleSelection();
  });
  main.querySelectorAll('[data-clear-tele-selection]').forEach(button => button.addEventListener('click', clearTeleSelection));
  main.querySelector('#deviceTeleExport')?.addEventListener('click', () => {
    const key = keys.includes(state.teleFocusKey) ? state.teleFocusKey : keys[0];
    if (key) exportTelemetryCSV([key], range.windowMs, range.start, range.end);
  });
  if (state.deviceTeleMode === 'charts') {
    const focusKey = keys.includes(state.teleFocusKey) ? state.teleFocusKey : keys[0];
    if (focusKey) wireTelemetryStack(main, [focusKey], range.start, range.windowMs);
  }
}
function wireTelemetryStack(root, keys, start, windowMs) {
  const stack = root.querySelector('#teleStack');
  if (!stack) return;
  const cursor = stack.querySelector('#teleCursor'), selection = stack.querySelector('#teleSelection'), tip = stack.querySelector('#teleEventTip');
  const end = start + windowMs, events = telemetryEvents(start, end), renderedSeries = new Map();
  keys.forEach(key => {
    const s = TELEMETRY[key], raw = s.history.filter(point => point.t >= start && point.t <= end);
    renderedSeries.set(key, state.teleRateOfChange[key] ? raw.slice(1).flatMap((point, i) => {
      const previous = raw[i], elapsed = (point.t - previous.t) / 1000;
      return elapsed > 0 ? [{ t:point.t, v:(point.v - previous.v) / elapsed }] : [];
    }) : raw);
  });
  stack.querySelectorAll('[data-rate-series]').forEach(button => button.addEventListener('click', () => toggleTeleRateOfChange(button.dataset.rateSeries)));
  stack.querySelectorAll('[data-pin-series]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.pinSeries;
    if (state.telePinned[key] != null) delete state.telePinned[key];
    else {
      const data = renderedSeries.get(key) || [];
      if (!data.length) return;
      const target = state.teleCursorTime ?? data.at(-1).t;
      const point = data.reduce((best, item) => !best || Math.abs(item.t - target) < Math.abs(best.t - target) ? item : best, null);
      state.telePinned[key] = point.t;
    }
    lsSet('electrix_tele_pinned', state.telePinned);
    renderMain();
  }));
  let selectionDrag = null;
  const chartPosition = clientX => {
    const chartRect = stack.querySelector('.ts-chart')?.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    if (!chartRect) return null;
    const plotLeft = chartRect.left + chartRect.width * (34 / 640);
    const plotRight = chartRect.left + chartRect.width * (628 / 640);
    const x = Math.max(plotLeft, Math.min(plotRight, clientX));
    const ratio = (x - plotLeft) / Math.max(1, plotRight - plotLeft);
    return { x, relativeX:x - stackRect.left, time:start + ratio * windowMs };
  };
  const updateCursor = e => {
    const position = chartPosition(e.clientX);
    if (!position || !renderedSeries.size) return;
    const targetTime = position.time;
    let snappedTime = targetTime, closestDistance = Infinity;
    renderedSeries.forEach(data => data.forEach(point => {
      const distance = Math.abs(point.t - targetTime);
      if (distance < closestDistance) { closestDistance = distance; snappedTime = point.t; }
    }));
    state.teleCursorTime = snappedTime;
    cursor.style.left = `${position.relativeX}px`;
    cursor.style.display = 'block';
    renderedSeries.forEach((data, key) => {
      const point = data.reduce((best, item) => !best || Math.abs(item.t - snappedTime) < Math.abs(best.t - snappedTime) ? item : best, null);
      const readout = [...stack.querySelectorAll('[data-cursor-readout]')].find(el => el.dataset.cursorReadout === key);
      const unit = state.teleRateOfChange[key] ? `${TELEMETRY[key].unit}/s` : TELEMETRY[key].unit;
      if (readout) readout.textContent = point ? `${point.v.toFixed(2)} ${unit}` : '';
    });
  };
  stack.addEventListener('pointermove', updateCursor);
  stack.addEventListener('pointerdown', e => {
    if (!e.target.closest('.ts-chart') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const point = chartPosition(e.clientX);
    if (!point) return;
    selectionDrag = { x:point.relativeX, time:point.time };
    telemetryPointerActive = true;
    stack.setPointerCapture(e.pointerId);
    selection.style.left = `${point.relativeX}px`;
    selection.style.width = '0px';
    selection.style.display = 'block';
  });
  stack.addEventListener('pointermove', e => {
    if (!selectionDrag) return;
    const point = chartPosition(e.clientX);
    if (!point) return;
    selection.style.left = `${Math.min(selectionDrag.x, point.relativeX)}px`;
    selection.style.width = `${Math.abs(point.relativeX - selectionDrag.x)}px`;
  });
  stack.addEventListener('pointerup', e => {
    if (!selectionDrag) return;
    const point = chartPosition(e.clientX), begin = selectionDrag;
    selectionDrag = null;
    telemetryPointerActive = false;
    if (point && Math.abs(point.relativeX - begin.x) >= 5 && Math.abs(point.time - begin.time) >= 1000) {
      setTeleSelection({ start:Math.min(begin.time, point.time), end:Math.max(begin.time, point.time) });
    } else selection.style.display = 'none';
  });
  stack.addEventListener('pointercancel', () => {
    selectionDrag = null;
    telemetryPointerActive = false;
    selection.style.display = 'none';
  });
  stack.addEventListener('pointerleave', () => {
    cursor.style.display = 'none';
    stack.querySelectorAll('[data-cursor-readout]').forEach(el => { el.textContent = ''; });
    tip.style.display = 'none';
  });
  stack.querySelectorAll('[data-tele-event]').forEach(marker => {
    marker.addEventListener('pointerenter', e => {
      const event = TELEMETRY_EVENTS.get(marker.dataset.teleEvent);
      if (!event) return;
      tip.textContent = `${event.label} · ${fmtClock(event.ts)} · ${deviceById(event.device_id)?.name || event.device_id}`;
      tip.style.display = 'block';
      tip.style.left = `${Math.min(e.clientX + 10, innerWidth - tip.offsetWidth - 8)}px`;
      tip.style.top = `${Math.max(8, e.clientY - 30)}px`;
    });
    marker.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
    marker.addEventListener('click', () => navigateTelemetryEvent(TELEMETRY_EVENTS.get(marker.dataset.teleEvent)));
  });
}
const TELEMETRY_EVENTS = new Map();
function telemetryEvents(start, end) {
  const events = [];
  const add = event => { if (event.ts >= start && event.ts <= end) events.push(event); };
  ALARMS.forEach(a => {
    if (!a.since) return;
    add({ id:`alarm-${a.id}`, type:'alarm', label:'Alarm', device_id:a.device_id, ts:Date.now() - a.since * 1000 });
  });
  COMMAND_HISTORY.forEach(c => add({ id:`command-${c.request_id}`, type:'command', label:'Command', device_id:c.device_id, ts:c.ts }));
  LWT_LOG.forEach((entry, i) => add({ id:`lwt-${i}`, type:'lwt', label:`LWT ${entry.lwt}`, device_id:entry.device_id, ts:entry.ts }));
  AUDIT.filter(entry => entry.action === 'device.config_set').forEach((entry, i) =>
    add({ id:`config-${i}-${entry.ts}`, type:'config', label:'Config write', device_id:entry.target, ts:entry.ts }));
  TELEMETRY_EVENTS.clear();
  events.forEach(event => TELEMETRY_EVENTS.set(event.id, event));
  return events;
}
function navigateTelemetryEvent(event) {
  if (!event) return;
  if (event.type === 'alarm') {
    state.alarmFilter = 'active';
    state.alarmDeviceFilter = event.device_id;
    nav(`#/alarms/${event.device_id}`);
  } else {
    const tab = event.type === 'command' ? 'commands' : event.type === 'config' ? 'config' : 'diagnostics';
    nav(`#/device/${event.device_id}/${tab}`);
  }
}
function toggleTeleRateOfChange(key) {
  state.teleRateOfChange[key] = !state.teleRateOfChange[key];
  lsSet('electrix_tele_rate_of_change', state.teleRateOfChange);
  renderMain();
}
function setTeleSelection(range) {
  state.teleSelection = range;
  lsSet('electrix_tele_selection', range);
  renderMain();
}
function clearTeleSelection() {
  state.teleSelection = null;
  lsSet('electrix_tele_selection', null);
  renderMain();
}
function telemetryChart(key, data, threshold, events, start, windowMs, offline, pinnedTime = null) {
  const s = TELEMETRY[key], width = 640, height = 128;
  const padL = 34, padR = 12, padT = 8, padB = 18;
  const plotW = width - padL - padR, plotH = height - padT - padB, bottom = padT + plotH;
  const end = start + windowMs;
  const xAt = ts => padL + Math.max(0, Math.min(1, (ts - start) / windowMs)) * plotW;
  if (!data.length) return '<div class="empty">No telemetry in this window.</div>';
  const values = data.map(point => point.v);
  const lo = Math.min(...values, threshold ?? Infinity), hi = Math.max(...values, threshold ?? -Infinity);
  const pad = (hi - lo) * 0.12 || 1, yLo = lo - pad, yHi = hi + pad, yRange = yHi - yLo || 1;
  const yAt = value => padT + plotH - (value - yLo) / yRange * plotH;
  const pinnedPoint = pinnedTime == null ? null : data.reduce((best, point) =>
    !best || Math.abs(point.t - pinnedTime) < Math.abs(best.t - pinnedTime) ? point : best, null);
  const pinnedLine = pinnedPoint
    ? `<line class="tele-pin-line" x1="${padL}" y1="${yAt(pinnedPoint.v).toFixed(1)}" x2="${width-padR}" y2="${yAt(pinnedPoint.v).toFixed(1)}"/>`
    : '';
  const maxGap = Math.max(1, s.window_s * 2) * 1000;
  const ticks = [0,1,2,3,4].map(i => {
    const y = padT + plotH * i / 4, value = yHi - yRange * i / 4;
    return `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}"/><text class="chart-axis" x="${padL-5}" y="${y+3}" text-anchor="end">${value.toFixed(1)}</text>`;
  }).join('');
  const gaps = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].t - data[i-1].t > maxGap) {
      const x1 = xAt(data[i-1].t), x2 = xAt(data[i].t);
      gaps.push(`<rect class="chart-gap" x="${x1.toFixed(1)}" y="${padT}" width="${Math.max(1,x2-x1).toFixed(1)}" height="${plotH}"/>`);
    }
  }
  if (offline && data.length && data.at(-1).t < end) {
    const x1 = xAt(data.at(-1).t), x2 = xAt(end);
    gaps.push(`<rect class="chart-gap" x="${x1.toFixed(1)}" y="${padT}" width="${Math.max(1,x2-x1).toFixed(1)}" height="${plotH}"/>`);
  }
  const lines = [], areas = [];
  let path = '';
  for (let i = 0; i < data.length; i++) {
    const point = data[i], x = xAt(point.t), y = yAt(point.v);
    if (i === 0 || point.t - data[i-1].t > maxGap) {
      if (path) lines.push(`<path class="chart-line" d="${path}"/>`);
      path = `M${x.toFixed(1)},${y.toFixed(1)}`;
    } else {
      path += ` L${x.toFixed(1)},${y.toFixed(1)}`;
      if (threshold != null) {
        const value = (point.v + data[i-1].v) / 2;
        const lowThreshold = s.unit === '%';
        const cls = lowThreshold
          ? value <= threshold ? 'alarm' : value <= threshold * 1.25 ? 'warn' : ''
          : value >= threshold ? 'alarm' : value >= threshold * 0.9 ? 'warn' : '';
        if (cls) {
          const x0 = xAt(data[i-1].t), y0 = yAt(data[i-1].v);
          areas.push(`<path class="chart-area-${cls}" d="M${x0.toFixed(1)},${bottom} L${x0.toFixed(1)},${y0.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)} L${x.toFixed(1)},${bottom} Z"/>`);
        }
      }
    }
  }
  if (path) lines.push(`<path class="chart-line" d="${path}"/>`);
  const visibleEvents = events.filter(event => event.ts >= start && event.ts <= end);
  const eventLines = visibleEvents.map(event => {
    const x = xAt(event.ts), cls = `chart-event-${event.type}`;
    return `<line class="chart-event ${cls}" x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${bottom}"/>`;
  }).join('');
  const markers = visibleEvents.map(event => {
    const left = (xAt(event.ts) / width * 100).toFixed(3);
    const label = `${event.label} at ${fmtClock(event.ts)}`;
    return `<button class="tele-event-marker ${event.type}" type="button" data-tele-event="${esc(event.id)}" style="left:${left}%" aria-label="${esc(label)}"></button>`;
  }).join('');
  return `<div class="ts-chart-wrap">
    <svg class="ts-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="${esc(key)}">
      <g class="chart-grid">${ticks}</g>${gaps.join('')}${areas.join('')}${eventLines}
      ${threshold != null ? `<line class="chart-th" x1="${padL}" y1="${yAt(threshold).toFixed(1)}" x2="${width-padR}" y2="${yAt(threshold).toFixed(1)}"/>` : ''}
      ${lines.join('')}${pinnedLine}
    </svg><div class="tele-event-markers">${markers}</div>
  </div>`;
}
function exportTelemetryCSV(keys, windowMs, start = Date.now() - windowMs, end = Date.now()) {
  if (!keys.length) { toast('Nothing to export', { type:'info' }); return; }
  const rows = [['timestamp_iso','device_id','sensor','value','unit'].join(',')];
  keys.forEach(k => {
    const [devId, sensor] = k.split('/');
    const s = TELEMETRY[k];
    s.history.filter(p => p.t >= start && p.t <= end).forEach(p => {
      rows.push([new Date(p.t).toISOString(), devId, sensor, p.v, s.unit].join(','));
    });
  });
  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `electrix-telemetry-${Date.now()}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exported', { msg:`${rows.length - 1} rows`, type:'ok' });
}
