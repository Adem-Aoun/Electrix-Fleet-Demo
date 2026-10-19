'use strict';

const widgetEmpty = msg => `<div class="widget-empty">${esc(msg)}</div>`;
const deriveConnectivityStatus = device => {
  if (device.lwt === 'offline') return 'offline';
  const staleAfterSeconds = (device.config.heartbeat_period_ms / 1000) * 2;
  return device.last_seen_s > staleAfterSeconds ? 'warn' : 'online';
};
function renderFirstRun() {
  const connectionError = mqtt.connectionError();
  if (connectionError) {
    return `
      <div class="overview-dashboard">
        <header class="overview-heading">
          <div><div class="overview-eyebrow">BACKEND CONNECTION</div><h1>Devices are not loading</h1>
            <p>The dashboard could not read fleet data from <span class="mono">${esc(BACKEND_URL)}</span>.</p>
            <p class="inline-error">${esc(connectionError)}</p>
          </div>
        </header>
        <section class="overview-panel"><h2>Check the connection</h2>
          <p class="muted">On iPhone, localhost refers to the phone. Open this dashboard using the computer's LAN address, and make sure port 8000 is reachable on that network.</p>
          <button class="btn" id="backendRetry">${icon('refresh-cw')}Retry</button>
        </section>
      </div>`;
  }
  const hasSites = SITES.length > 0;
  return `
    <div class="overview-dashboard">
      <header class="overview-heading">
        <div>
          <div class="overview-eyebrow">WELCOME</div>
          <h1>Set up your fleet</h1>
          <p>No devices are connected yet. Start by naming a site, then power on your first device.</p>
        </div>
      </header>

      <section class="overview-panel">
        <div class="overview-section-heading">
          <div><span class="overview-section-kicker">STEP 1</span><h2>Sites</h2></div>
          <span class="overview-section-count">${SITES.length}</span>
        </div>
        ${hasSites
          ? `<div class="first-run-sites">${SITES.map(s => `
              <div class="first-run-site">
                <span>${esc(s.name)}</span>
                <span class="muted">${esc(s.id)}</span>
              </div>`).join('')}</div>`
          : '<div class="empty">No sites defined yet. Add one to get started.</div>'}
        <div class="config-row" style="margin-top:14px;gap:8px;">
          <input type="text" id="firstSiteName" placeholder="Site name (e.g. Warehouse B)"
                 style="flex:1;min-width:0;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
          <button class="btn primary" id="firstSiteAdd">${icon('plus')}Add site</button>
        </div>
      </section>

      <section class="overview-panel">
        <div class="overview-section-heading">
          <div><span class="overview-section-kicker">STEP 2</span><h2>Power on a device</h2></div>
        </div>
        <p class="muted" style="margin:0;font-size:12.5px;line-height:1.55;">
          Power up an Electrix device. It will publish a retained
          <span class="mono">who_am_i</span> message to the broker. This page will
          notify you within a few seconds of the device appearing.
        </p>
        <div class="muted" style="margin-top:12px;font-size:11.5px;">
          Backend: <span class="mono" style="color:var(--content);">${esc(BACKEND_URL)}</span>
        </div>
      </section>
    </div>`;
}

function wireFirstRun() {
  $('#backendRetry')?.addEventListener('click', () => mqtt.refresh());
  $('#firstSiteAdd')?.addEventListener('click', async () => {
    const raw = $('#firstSiteName').value.trim();
    if (!raw) return;
    const id = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id) { toast('Invalid name', { type: 'error' }); return; }
    if (SITES.some(s => s.id === id)) { toast('Site already exists', { type: 'warn' }); return; }
    try {
      await mqtt.createSite(raw);
      toast('Site added', { msg: raw, type: 'ok' });
      renderMain();
    } catch (error) {
      toast('Site could not be added', { msg: error.message, type: 'error' });
    }
  });
}

function renderDashboard(main) {
  if (DEVICES.length === 0) {
    main.innerHTML = renderFirstRun();
    refreshIcons(main);
    wireFirstRun();
    return;
  }

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
  const recentCommands = mqtt.recentCommands();

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
            <div><span class="overview-section-kicker">FLEET LOG</span><h2>Recent commands</h2></div>
          </div>
          ${recentCommands.length ? `<div class="overview-activity-list">${recentCommands.slice(0, 6).map((command, index) => {
            const device = deviceById(command.device_id);
            const outcome = command.status === 'ok' ? 'Succeeded' : command.status === 'pending' ? 'Pending' : command.status === 'timeout' ? 'Timed out' : 'Failed';
            const action = command.actuator === 'system'
              ? (command.topic || '').split('/').at(-1) || 'system command'
              : `${command.actuator} ${command.value ? 'ON' : 'OFF'}`;
            return `<div class="overview-activity-item">
              <span class="overview-activity-marker ${index === 0 ? 'latest' : ''}"></span>
              <span class="overview-activity-text"><strong>${esc(action)}</strong> · ${esc(device?.name || command.device_id)} · ${command.connected ? 'Connected' : 'Offline'} · by ${esc(command.actor || 'system')} · ${outcome}</span>
              <time>${esc(fmtAgo(Math.max(0, Math.floor((Date.now() - command.issued_at) / 1000))))}</time>
            </div>`;
          }).join('')}</div>` : widgetEmpty('No commands recorded yet')}
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
      <footer class="overview-footer">${icon('radio-tower')}${DEVICES.filter(device => device.lwt === 'online').length} connected to backend · ${DEVICES.length} known devices</footer>
    </div>`;
  refreshIcons(main);
}
