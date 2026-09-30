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
const widgetEmpty = msg => `<div class="widget-empty">${esc(msg)}</div>`;
const deriveConnectivityStatus = device => {
  if (device.lwt === 'offline') return 'offline';
  const staleAfterSeconds = (device.config.heartbeat_period_ms / 1000) * 2;
  return device.last_seen_s > staleAfterSeconds ? 'warn' : 'online';
};

function renderDashboard(main) {
  const counts = { online:0, warn:0, offline:0 };
  DEVICES.forEach(device => counts[deriveConnectivityStatus(device)]++);

  const alarms = activeAlarms();
  const alarmDeviceIds = new Set(alarms.map(alarm => alarm.device_id));
  const attentionDevices = DEVICES.filter(device =>
    alarmDeviceIds.has(device.device_id) || ['warn','offline'].includes(deriveStatus(device))
  );
  const attention = alarms.slice(0, 4).map(alarm => {
    const device = deviceById(alarm.device_id);
    return {
      id: device?.device_id || alarm.id,
      title: device?.name || alarm.msg,
      detail: alarm.msg,
      site: device ? siteName(device.site_id) : '',
      status: alarm.priority,
      age: alarm.type === 'device_offline' && device
        ? fmtAgo(device.last_seen_s)
        : alarm.since > 0 ? fmtAgo(alarm.since) : 'Duration unknown',
      route: device ? deviceRoute(device.device_id) : '#/alarms',
      alarm,
    };
  });
  DEVICES.filter(device =>
    ['warn','offline'].includes(deriveStatus(device)) && !alarmDeviceIds.has(device.device_id)
  ).forEach(device => attention.push({
    id: device.device_id,
    title: device.name,
    detail: device.lwt === 'offline' ? `Offline · last seen ${fmtAgo(device.last_seen_s)}` : `Heartbeat overdue · last seen ${fmtAgo(device.last_seen_s)}`,
    site: siteName(device.site_id),
    status: deriveStatus(device),
    age: fmtAgo(device.last_seen_s),
    route: deviceRoute(device.device_id),
  }));

  const siteRows = SITES.map(site => {
    const devices = DEVICES.filter(device => device.site_id === site.id);
    const siteCounts = { online:0, warn:0, alarm:0, offline:0 };
    devices.forEach(device => siteCounts[deriveConnectivityStatus(device)]++);
    const siteDeviceIds = new Set(devices.map(device => device.device_id));
    siteCounts.alarm = new Set(alarms.filter(alarm => siteDeviceIds.has(alarm.device_id)).map(alarm => alarm.device_id)).size;
    return `<button class="overview-site" data-nav="#/devices/${site.id}">
      <span class="overview-site-head"><span class="overview-site-name">${esc(site.name)}</span><span class="overview-site-count">${devices.length} ${devices.length === 1 ? 'device' : 'devices'}</span></span>
      <span class="overview-site-status">
        ${siteCounts.online ? `<span class="status-ok">${siteCounts.online} online</span>` : ''}
        ${siteCounts.warn ? `<span class="status-warn">${siteCounts.warn} warning</span>` : ''}
        ${siteCounts.alarm ? `<span class="status-alarm">${siteCounts.alarm} alarm</span>` : ''}
        ${siteCounts.offline ? `<span class="status-offline">${siteCounts.offline} offline</span>` : ''}
      </span>
      <span class="overview-site-arrow">${icon('arrow-up-right')}</span>
    </button>`;
  }).join('');

  const relays = DEVICES.flatMap(device => device.lwt === 'online'
    ? device.capabilities.filter(capability => capability.kind === 'relay' && capability.online).map(capability => ({ device, capability }))
    : []
  ).slice(0, 4);
  const activity = ACTIVITY.slice(0, 4);

  main.innerHTML = `
    <div class="overview-dashboard">
      <header class="overview-heading">
        <div>
          <div class="overview-eyebrow">FLEET COMMAND</div>
          <h1>Overview</h1>
          <p>Current health and the issues that need your attention.</p>
        </div>
        <button class="btn sm overview-all-devices" data-nav="#/devices">${icon('layout-grid')}All devices</button>
      </header>

      <section class="overview-health" aria-label="Fleet health">
        <div class="overview-health-intro">
          <span class="overview-health-label">Fleet health</span>
          <strong>${DEVICES.length}<span> devices</span></strong>
          <span class="overview-health-caption">${counts.online} online · ${attentionDevices.length} need attention</span>
        </div>
        <div class="overview-health-metrics">
          <div class="overview-metric metric-online"><span class="overview-metric-dot"></span><span class="overview-metric-value">${counts.online}</span><span class="overview-metric-label">Online</span></div>
          <div class="overview-metric metric-warning"><span class="overview-metric-dot"></span><span class="overview-metric-value">${counts.warn}</span><span class="overview-metric-label">Warning</span></div>
          <div class="overview-metric metric-offline"><span class="overview-metric-dot"></span><span class="overview-metric-value">${counts.offline}</span><span class="overview-metric-label">Offline</span></div>
          <button class="overview-metric metric-alarms" data-nav="#/alarms"><span class="overview-metric-dot"></span><span class="overview-metric-value">${alarms.length}</span><span class="overview-metric-label">Active alarms</span></button>
        </div>
      </section>

      <div class="overview-primary-grid">
        <section class="overview-panel overview-attention-panel">
          <div class="overview-section-heading">
            <div><span class="overview-section-kicker">PRIORITY</span><h2>Needs attention</h2></div>
            <span class="overview-section-count ${attention.length ? 'has-issues' : ''}">${attention.length}</span>
          </div>
          ${attention.length ? `<div class="overview-attention-list">${attention.slice(0, 5).map(item => `
            <article class="overview-attention-item">
              <span class="overview-attention-icon ${item.status === 'critical' ? 'tone-critical' : ['high','medium','alarm','offline'].includes(item.status) ? 'tone-alarm' : 'tone-warning'}">${icon(item.status === 'offline' ? 'wifi-off' : item.status === 'warn' ? 'clock-3' : 'alert-triangle')}</span>
              <div class="overview-attention-copy">
                <div class="overview-attention-title">${esc(item.title)}</div>
                <div class="overview-attention-detail">${esc(item.detail)}</div>
                <div class="overview-attention-meta">${esc(item.site)}<span>·</span>${esc(item.age)}</div>
              </div>
              <div class="overview-attention-actions">
                ${item.alarm?.state === 'UNACK_ALARM' && can('ack') ? `<button class="btn sm" data-alarm-ack="${esc(item.alarm.id)}">Acknowledge</button>` : ''}
                <button class="btn sm overview-open-action" data-nav="${esc(item.route)}">${icon('arrow-up-right')}<span>Open</span></button>
              </div>
            </article>`).join('')}</div>${attention.length > 5 ? `<div class="overview-more-issues">+ ${attention.length - 5} more affected ${attention.length - 5 === 1 ? 'device' : 'devices'} <button data-nav="#/devices">View all devices</button></div>` : ''}` : `<div class="overview-clear-state">${icon('circle-check')}<div><strong>All clear</strong><span>No active alarms or devices needing attention.</span></div></div>`}
          <button class="overview-section-link" data-nav="#/alarms">View alarm center ${icon('arrow-right')}</button>
        </section>

        <section class="overview-panel overview-sites-panel">
          <div class="overview-section-heading">
            <div><span class="overview-section-kicker">LOCATIONS</span><h2>Sites</h2></div>
            <span class="overview-section-count">${SITES.length}</span>
          </div>
          <div class="overview-sites-list">${siteRows || widgetEmpty('No sites configured')}</div>
        </section>
      </div>

      <div class="overview-secondary-grid">
        <section class="overview-panel">
          <div class="overview-section-heading">
            <div><span class="overview-section-kicker">FLEET LOG</span><h2>Recent activity</h2></div>
          </div>
          ${activity.length ? `<div class="overview-activity-list">${activity.map((entry, index) => `
            <div class="overview-activity-item"><span class="overview-activity-marker ${index === 0 ? 'latest' : ''}"></span><span class="overview-activity-text">${esc(entry.text)}</span><time>${esc(fmtAgo(entry.t))}</time></div>`).join('')}</div>` : widgetEmpty('No recent activity')}
        </section>
        <section class="overview-panel">
          <div class="overview-section-heading">
            <div><span class="overview-section-kicker">AT A GLANCE</span><h2>Quick controls</h2></div>
            <span class="overview-section-note">${relays.length} available</span>
          </div>
          ${relays.length ? `<div class="overview-controls-list">${relays.map(({ device, capability }) => `
            <div class="overview-control">
              <span class="overview-control-icon">${icon('power')}</span>
              <span class="overview-control-copy"><strong>${esc(capability.label)}</strong><small>${esc(device.name)}</small></span>
              <button class="toggle ${capability.value ? 'on' : ''} ${capability.pending ? 'pending' : ''}" data-toggle-device="${device.device_id}" data-toggle-cap="${capability.id}" ${can('toggle') ? '' : 'disabled'} aria-label="${capability.value ? 'Turn off' : 'Turn on'} ${esc(capability.label)}" aria-pressed="${capability.value}"></button>
            </div>`).join('')}</div>` : widgetEmpty('No controllable relays online')}
        </section>
      </div>
      <footer class="overview-footer">${icon('radio-tower')}Demo fleet data · refreshes as device state changes</footer>
    </div>`;
  refreshIcons(main);
}
