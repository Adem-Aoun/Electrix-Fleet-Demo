'use strict';

function renderTelemetryTabs(mode) {
  return `<div class="tele-tabs" role="tablist" aria-label="Telemetry view">
    <button type="button" role="tab" data-tele-view="overview" aria-selected="${mode === 'overview'}" aria-pressed="${mode === 'overview'}">${icon('gauge')}Overview</button>
    <button type="button" role="tab" data-tele-view="charts" aria-selected="${mode === 'charts'}" aria-pressed="${mode === 'charts'}">${icon('activity')}Charts</button>
  </div>`;
}
function telemetryDeviceStatus(device, keys = Object.keys(TELEMETRY).filter(key => key.startsWith(device.device_id + '/'))) {
  if (device.lwt === 'offline') return 'offline';
  if (!keys.length) return 'no-data';
  if (deriveStatus(device) === 'alarm') return 'alarm';
  const statuses = keys.map(key => telemetryStatus(key, device));
  if (statuses.includes('alarm')) return 'alarm';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('stale')) return 'stale';
  if (deriveStatus(device) === 'warn') return 'warn';
  return 'ok';
}
function telemetryStatusLabel(status) {
  return ({ ok:'Normal', warn:'Warning', alarm:'Alarm', offline:'Offline', stale:'Stale', 'no-data':'No data' })[status] || status;
}
function renderTelemetryGaugeGrid(keys) {
  if (!keys.length) return '<div class="empty">No telemetry signals match these filters.</div>';
  return `<div class="tele-gauges">${keys.map(key => telemetryGauge(key)).join('')}</div>`;
}
function renderDevTelemetry(d) {
  const keys = Object.keys(TELEMETRY).filter(key => key.startsWith(d.device_id + '/'));
  if (!keys.length) return `<div class="empty">No telemetry series.</div>`;
  const mode = state.deviceTeleMode, range = telemetryRange();
  const focusKey = keys.includes(state.teleFocusKey) ? state.teleFocusKey : keys[0];
  if (mode === 'charts') state.teleFocusKey = focusKey;
  const focused = TELEMETRY[focusKey], focusedValue = focused?.history.at(-1);
  const chartKeys = mode === 'charts' ? [focusKey] : [];
  return `<div class="tele-device-view">
    ${renderTelemetryTabs(mode)}
    ${mode === 'overview' ? `
      <div class="tele-device-meta">
        <span>Device <span class="mono">${esc(telemetryStatusLabel(telemetryDeviceStatus(d, keys)))}</span></span>
        <span>Sampling <span class="mono">${d.config.sensor_publish_period_ms} ms</span></span>
        <span>Heartbeat <span class="mono">${d.config.heartbeat_period_ms} ms</span></span>
        <span>LWT <span class="mono">${esc(d.lwt)}</span></span>
        <span>Seen <span class="mono">${esc(fmtAgo(d.last_seen_s))}</span></span>
      </div>
      ${renderTelemetryGaugeGrid(keys)}
    ` : `
      <div class="tele-chart-tools">
        <div><label for="deviceTeleMetric">Signal</label><select id="deviceTeleMetric">
          ${keys.map(key => `<option value="${esc(key)}" ${key === focusKey ? 'selected' : ''}>${esc(key.split('/')[1])}</option>`).join('')}
        </select></div>
        <div><label for="deviceTeleWindow">Time range</label>${telemetryWindowSelect('deviceTeleWindow')}</div>
        <button class="btn sm" id="deviceTeleExport">${icon('download')}Export CSV</button>
        ${range.selected ? '<button class="btn sm" data-clear-tele-selection>Clear selection</button>' : ''}
        <span class="tele-selection-status">${range.selected ? 'Selected range' : 'Drag across the chart to inspect or select a range'}</span>
      </div>
      ${focused ? renderTelemetryMetricDetails(focusKey, range.start, range.end) : ''}
      ${renderTelemetryStack(chartKeys, range.start, range.windowMs)}
      <div class="tele-config-context">
        <span>Sample period <span class="mono">${d.config.sensor_publish_period_ms} ms</span></span>
        <span>Heartbeat period <span class="mono">${d.config.heartbeat_period_ms} ms</span></span>
        <span>LWT <span class="mono">${esc(d.lwt)}</span></span>
        <span>Last heartbeat <span class="mono">${esc(fmtAgo(d.last_seen_s))}</span></span>
      </div>
    `}
  </div>`;
}

function telemetryRange() {
  const windowMs = { '1m':60_000, '5m':300_000, '15m':900_000, '1h':3_600_000 }[state.teleWindow] || 300_000;
  const selected = state.teleSelection && Number.isFinite(state.teleSelection.start) && Number.isFinite(state.teleSelection.end)
    ? state.teleSelection : null;
  const start = selected ? Math.min(selected.start, selected.end) : Date.now() - windowMs;
  const end = selected ? Math.max(selected.start, selected.end) : Date.now();
  return { start, end, windowMs:Math.max(1000, end - start), selected };
}
function telemetryWindowSelect(id) {
  return `<select id="${id}" aria-label="Telemetry time window">
    <option value="1m" ${state.teleWindow === '1m' ? 'selected' : ''}>Last 1 min</option>
    <option value="5m" ${state.teleWindow === '5m' ? 'selected' : ''}>Last 5 min</option>
    <option value="15m" ${state.teleWindow === '15m' ? 'selected' : ''}>Last 15 min</option>
    <option value="1h" ${state.teleWindow === '1h' ? 'selected' : ''}>Last 1 hour</option>
  </select>`;
}
function telemetryStatus(key, d = deviceById(key.split('/')[0])) {
  if (!d || d.lwt === 'offline') return 'offline';
  const series = TELEMETRY[key], latest = series?.history.at(-1), value = latest?.v;
  if (!latest) return 'no-data';
  if (Date.now() - latest.t > Math.max(10, series.window_s * 3) * 1000) return 'stale';
  if (series?.threshold != null && value != null) {
    const lowThreshold = series.unit === '%';
    if (lowThreshold && value <= series.threshold) return 'alarm';
    if (!lowThreshold && value >= series.threshold) return 'alarm';
    if (lowThreshold && value <= series.threshold * 1.25) return 'warn';
    if (!lowThreshold && value >= series.threshold * 0.8) return 'warn';
  }
  return deriveStatus(d) === 'warn' ? 'warn' : 'ok';
}
function telemetryGauge(key, compact = false) {
  const series = TELEMETRY[key], value = series?.history.at(-1)?.v;
  if (!series || value == null) return '';
  const unit = series.unit, percent = unit === '%';
  const threshold = series.threshold;
  const maxValue = percent ? 100 : threshold != null ? Math.max(threshold * 1.25, value * 1.05, 1) : Math.max(value * 1.2, 1);
  const fraction = Math.max(0, Math.min(1, value / maxValue));
  const status = telemetryStatus(key), statusClassName = `status-${status}`;
  if (compact) {
    const circumference = 2 * Math.PI * 16, offset = circumference * (1 - fraction);
    return `<span class="ts-gauge ${statusClassName}" role="img" aria-label="${value.toFixed(2)} ${esc(unit)}">
      <svg viewBox="0 0 40 40" aria-hidden="true"><circle class="track" cx="20" cy="20" r="16"/>
        <circle class="fill" cx="20" cy="20" r="16" transform="rotate(-90 20 20)" stroke-dasharray="${(circumference * fraction).toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="0"/></svg>
      <span class="ts-gauge-value">${value.toFixed(1)}</span></span>`;
  }
  const d = deviceById(key.split('/')[0]), circumference = percent ? Math.PI * 46 : 2 * Math.PI * 46;
  const arcPath = percent ? 'M14 60 A46 46 0 0 1 106 60' : null;
  const track = percent
    ? `<path class="track" d="${arcPath}"/>`
    : `<circle class="track" cx="60" cy="60" r="46"/>`;
  const fill = percent
    ? `<path class="fill" d="${arcPath}" stroke-dasharray="${(circumference * fraction).toFixed(2)} ${circumference.toFixed(2)}"/>`
    : `<circle class="fill" cx="60" cy="60" r="46" transform="rotate(-90 60 60)" stroke-dasharray="${(circumference * fraction).toFixed(2)} ${circumference.toFixed(2)}"/>`;
  let tick = '';
  if (threshold != null) {
    const thresholdFraction = Math.max(0, Math.min(1, threshold / maxValue));
    const angle = percent ? Math.PI * (1 - thresholdFraction) : (thresholdFraction * 2 - 0.5) * Math.PI;
    const cx = 60 + 46 * Math.cos(angle), cy = 60 - 46 * Math.sin(angle);
    const dx = Math.cos(angle) * 5, dy = Math.sin(angle) * 5;
    tick = `<line class="threshold-tick" x1="${(cx-dx).toFixed(1)}" y1="${(cy-dy).toFixed(1)}" x2="${(cx+dx).toFixed(1)}" y2="${(cy+dy).toFixed(1)}"/>`;
  }
  const shown = percent ? value.toFixed(0) : value.toFixed(1);
  const thresholdText = threshold == null ? 'No threshold configured' : `${lowThresholdLabel(unit)} ${threshold}${unit}`;
  return `<button type="button" class="tele-gauge-card ${statusClassName}" data-gauge-key="${esc(key)}" aria-pressed="${state.teleFocusKey === key}" aria-label="Open ${esc(d?.name || key.split('/')[0])} ${esc(key.split('/')[1])} chart, current value ${shown} ${esc(unit)}, ${esc(telemetryStatusLabel(status))}">
    <span class="tele-gauge-head"><span class="tele-gauge-label">${esc(key.split('/')[1])}</span><span class="tele-gauge-status">${esc(telemetryStatusLabel(status))}</span></span>
    <span class="tele-gauge-main">
      <span class="tele-gauge-wrap ${percent ? 'half' : ''}" aria-hidden="true"><svg class="tele-gauge-svg" viewBox="${percent ? '0 0 120 72' : '0 0 120 120'}">${track}${fill}${tick}</svg></span>
      <span class="tele-gauge-copy"><span class="tele-gauge-value">${shown}<span class="unit">${esc(unit)}</span></span>
        <span class="tele-gauge-device">${esc(d?.name || key.split('/')[0])}</span><span class="tele-gauge-threshold">${esc(thresholdText)}</span></span>
    </span>
    <span class="tele-gauge-footer"><span>View chart &amp; details</span>${icon('arrow-up-right')}</span>
  </button>`;
}
function lowThresholdLabel(unit) { return unit === '%' ? 'Low limit ' : 'Limit '; }
function renderTelemetryMetricDetails(key, start, end) {
  const series = TELEMETRY[key], device = deviceById(key.split('/')[0]);
  if (!series) return '';
  const points = series.history.filter(point => point.t >= start && point.t <= end);
  const values = points.map(point => point.v);
  const min = values.length ? Math.min(...values) : null, max = values.length ? Math.max(...values) : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const latest = series.history.at(-1), status = telemetryStatus(key, device), rateMode = !!state.teleRateOfChange[key];
  const stat = (label, value) => `<div class="tele-chart-stat"><span class="label">${label}</span><span class="value">${value}</span></div>`;
  return `<section class="tele-chart-detail" aria-label="Signal details">
    <div class="tele-chart-detail-head"><div><div class="tele-chart-detail-title">${esc(device?.name || key.split('/')[0])} · ${esc(key.split('/')[1])}</div>
      <div class="tele-chart-detail-sub">${esc(telemetryStatusLabel(status))}${latest ? ` · sampled ${esc(fmtAgo(Math.max(0, Math.floor((Date.now() - latest.t) / 1000))))}` : ' · No samples in history'}</div></div>
      <div class="tele-chart-detail-current"><span class="label">Current value</span>${latest ? `${latest.v.toFixed(2)}<span class="unit"> ${esc(series.unit)}</span>` : '—'}</div>
    </div>
    <div class="tele-chart-stats">${stat('Minimum', min == null ? '—' : `${min.toFixed(2)} ${series.unit}`)}${stat('Average', average == null ? '—' : `${average.toFixed(2)} ${series.unit}`)}${stat('Maximum', max == null ? '—' : `${max.toFixed(2)} ${series.unit}`)}${stat('Samples', String(points.length))}${stat('Threshold', series.threshold == null ? '—' : `${series.threshold} ${series.unit}`)}</div>
    ${rateMode ? `<div class="tele-chart-detail-note">The chart shows rate of change (${esc(series.unit)}/s); the summary statistics above remain in the original ${esc(series.unit)} values.</div>` : ''}
  </section>`;
}
function renderTelemetryStack(keys, start, windowMs) {
  const end = start + windowMs, events = telemetryEvents(start, end), byDevice = new Map();
  keys.forEach(key => {
    const deviceId = key.split('/')[0];
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, []);
    byDevice.get(deviceId).push(key);
  });
  let groups = [...byDevice.entries()];
  const deviceSortName = ([id, deviceKeys]) => deviceById(id)?.name || deviceKeys[0] || id;
  if (state.teleSort === 'alphabetical') {
    groups.sort((a, b) => deviceSortName(a).localeCompare(deviceSortName(b)));
    groups.forEach(([, deviceKeys]) => deviceKeys.sort((a, b) => a.split('/')[1].localeCompare(b.split('/')[1])));
  } else if (state.teleSort === 'anomaly') {
    const severity = status => ({ alarm:4, offline:3, warn:2, ok:1 })[status] || 0;
    const risk = ([id, deviceKeys]) => Math.max(...deviceKeys.map(key => severity(telemetryStatus(key))), 0);
    groups.sort((a, b) => risk(b) - risk(a) || deviceSortName(a).localeCompare(deviceSortName(b)));
  } else groups.sort((a, b) => deviceSortName(a).localeCompare(deviceSortName(b)));
  groups.forEach(([, deviceKeys]) => {
    if (state.teleSort !== 'anomaly') deviceKeys.sort((a, b) => a.split('/')[1].localeCompare(b.split('/')[1]));
    else deviceKeys.sort((a, b) => {
      const severity = status => ({ alarm:4, offline:3, warn:2, ok:1 })[status] || 0;
      return severity(telemetryStatus(b)) - severity(telemetryStatus(a)) || a.localeCompare(b);
    });
  });
  const contents = groups.map(([deviceId, deviceKeys]) => {
    const d = deviceById(deviceId), deviceStatus = d ? telemetryDeviceStatus(d, deviceKeys) : 'offline';
    const series = deviceKeys.map(key => {
      const s = TELEMETRY[key], sensor = key.split('/')[1], raw = s.history.filter(p => p.t >= start && p.t <= end);
      const rate = !!state.teleRateOfChange[key];
      const data = rate ? raw.slice(1).flatMap((point, i) => {
        const previous = raw[i], elapsed = (point.t - previous.t) / 1000;
        return elapsed > 0 ? [{ t:point.t, v:(point.v - previous.v) / elapsed }] : [];
      }) : raw;
      const last = data.at(-1)?.v, unit = rate ? `${s.unit}/s` : s.unit;
      const status = telemetryStatus(key), threshold = rate ? null : s.threshold;
      const eventsForDevice = events.filter(event => event.device_id === deviceId);
      return `<article class="tele-chart-panel status-${status}" data-series-key="${esc(key)}">
        <div class="tele-chart-head">
          <span class="tele-chart-status status-${status}">${esc(telemetryStatusLabel(status))}</span>
          <span class="label">${esc(sensor)}</span><span class="id">${esc(s.unit)}</span>
          <button class="ts-toggle" type="button" data-pin-series="${esc(key)}" aria-pressed="${state.telePinned[key] != null}" title="Pin a horizontal value cursor">${state.telePinned[key] != null ? 'Unpin' : 'Pin value'}</button>
          <button class="ts-toggle" type="button" data-rate-series="${esc(key)}" aria-pressed="${rate}" aria-label="Toggle rate of change">${rate ? 'Δ/Δt' : 'value'}</button>
          <span class="reading">${last == null ? '—' : `${last.toFixed(2)} ${esc(unit)}`}</span>
          <span class="ts-cursor-value" data-cursor-readout="${esc(key)}"></span>
        </div>
        ${telemetryChart(key, data, threshold, eventsForDevice, start, windowMs, d?.lwt === 'offline', state.telePinned[key])}
      </article>`;
    }).join('');
    return `<section class="tele-group">
      <header class="tele-group-head"><span class="status-dot ${statusClass(deviceStatus === 'no-data' || deviceStatus === 'stale' ? 'warn' : deviceStatus === 'ok' ? 'online' : deviceStatus)}"></span>
        <span class="tg-name">${esc(d?.name || deviceId)}</span><span class="tg-status">${esc(telemetryStatusLabel(deviceStatus))}</span>
        <span class="tg-meta mono">${esc(deviceId)} · seen ${esc(d ? fmtAgo(d.last_seen_s) : 'unknown')}</span>
      </header>
      <div class="tele-chart-stack">${series}</div>
    </section>`;
  }).join('');
  return `<div class="tele-stack" id="teleStack" data-window-start="${start}" data-window-ms="${windowMs}">
    <div class="tele-cursor" id="teleCursor" aria-hidden="true"></div>
    <div class="tele-selection" id="teleSelection" aria-hidden="true"></div>
    <div class="tele-event-tip" id="teleEventTip" role="status"></div>
    ${contents || '<div class="empty">No telemetry series match.</div>'}
    <div class="tele-time-axis"><span>${fmtDateTime(start)}</span><span>${fmtDateTime(end)}</span></div>
  </div>`;
}
