'use strict';

function applyTheme(theme, persist = true) {
  const root = document.documentElement;
  if (theme) root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  const isDark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const btn = $('#themeBtn');
  if (btn) { btn.innerHTML = icon(isDark ? 'sun' : 'moon'); refreshIcons(btn); }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark ? '#14171C' : '#E9EBEF');
  if (persist) localStorage.setItem('electrix_theme', theme || '');
}

const TI_ROWS = [];
const TI_MAX = 300;
function toggleInspector(force) {
  const el = $('#topicInspector');
  const open = typeof force === 'boolean' ? force : !el.classList.contains('open');
  el.classList.toggle('open', open);
  document.body.classList.toggle('has-inspector', open);
  state.inspectorOpen = open;
  audit('inspector.toggle', open ? 'opened' : 'closed');
}
function openInspector(force) { toggleInspector(force); }
function logTraffic(dir, topic, payload, opts) {
  const row = { ts:Date.now(), dir, topic, payload, opts };
  TI_ROWS.unshift(row);
  if (TI_ROWS.length > TI_MAX) TI_ROWS.pop();
  const body = $('#tiBody'); if (!body) return;
  if (TI_ROWS.length === 1) body.innerHTML = '';
  const el = document.createElement('div');
  el.className = `ti-row dir-${dir}`;
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const optStr = opts && (opts.qos != null || opts.retain) ? `<span class="ti-opts">QoS${opts.qos ?? 0}${opts.retain ? '·retained' : ''}</span>` : '';
  el.innerHTML = `<span class="ti-ts">${fmtClock(row.ts)}</span>
    <span class="ti-dir">${dir === 'in' ? '↓' : '↑'}</span>
    <span class="ti-line"><span class="ti-topic">${esc(topic)}</span> ${optStr}<span class="ti-payload"> ${esc(payloadStr)}</span></span>`;
  body.prepend(el);
  while (body.children.length > TI_MAX) body.lastChild.remove();
  const stats = $('#tiStats'); if (stats) stats.textContent = `${TI_ROWS.length} messages`;
}

function boot() {
  refreshIcons();
  $('#loginBtn').addEventListener('click', attemptLogin);
  $('#loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
  $('#logoutBtn').addEventListener('click', async () => {
    const ok = await confirmModal({ title:'Sign out?', message:'You will need to sign in again.', confirmText:'Sign out' });
    if (ok) logout();
  });
  $('#paletteBtn').addEventListener('click', openPalette);
  $('#helpBtn').addEventListener('click', openShortcuts);
  $('#mobileMenuBtn').addEventListener('click', openMobileMoreSheet);
  $('#bottomMoreBtn').addEventListener('click', openMobileMoreSheet);
  const railToggle = $('#railToggle');
  if (railToggle) railToggle.addEventListener('click', toggleSidebar);
  $('#devModeBtn').addEventListener('click', () => {
    state.devMode = !state.devMode;
    lsSet('electrix_devmode', state.devMode);
    $('#devModeBtn').classList.toggle('active', state.devMode);
    if (!state.devMode) toggleInspector(false);
    renderMain();
  });
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
  $('#userChip').addEventListener('click', () => {
    if (!state.user) return;
    toast(state.user.display, { msg:`Role: ${ROLE_LABEL[state.user.role]}`, type:'info', timeout:2500 });
  });
  const searchEl = $('#search');
  if (searchEl) searchEl.addEventListener('input', e => { state.search = e.target.value; if (state.view === 'devices') renderDeviceGrid(); });
  const sortEl = $('#sortSel');
  if (sortEl) sortEl.addEventListener('change', e => { state.sortBy = e.target.value; lsSet('electrix_sort', state.sortBy); if (state.view === 'devices') renderDeviceGrid(); });
  $('#overlay').addEventListener('click', closeDrawer);
  $('#tiClose').addEventListener('click', () => toggleInspector(false));
  $('#tiClear').addEventListener('click', () => { TI_ROWS.length = 0; $('#tiBody').innerHTML = '<div class="ti-empty">No MQTT traffic yet.</div>'; $('#tiStats').textContent = '0 messages'; });
  window.addEventListener('hashchange', applyRoute);
  let tX = 0, tY = 0, tracking = false;
  document.addEventListener('touchstart', e => {
    if (!state.drawerDeviceId) return;
    const t0 = e.touches[0];
    tX = t0.clientX; tY = t0.clientY; tracking = true;
  }, { passive:true });
  document.addEventListener('touchmove', e => {
    if (!tracking || !state.drawerDeviceId) return;
    const t0 = e.touches[0];
    const dx = t0.clientX - tX, dy = Math.abs(t0.clientY - tY);
    if (dy > 40) { tracking = false; return; }
    if (dx > 80) { tracking = false; closeDrawer(); }
  }, { passive:true });
  document.addEventListener('touchend', () => { tracking = false; }, { passive:true });
  let gPrefix = false, gTimer = null;
  document.addEventListener('keydown', e => {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash')) { e.preventDefault(); toggleSidebar(); return; }
    if (typing) return;
    if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
    if (e.key === 'Escape') {
      if ($('#alarmPopover')?.classList.contains('open')) { closeAlarmPopover(); return; }
      if (state.widgetReorderMode) { state.widgetReorderMode = false; renderMain(); return; }
      closeDrawer(); return;
    }
    if (e.key === 'd' || e.key === 'D') { $('#devModeBtn').click(); return; }
    if (e.key === 't' || e.key === 'T') { $('#themeBtn').click(); return; }
    if (e.key === 'i' || e.key === 'I') { toggleInspector(); return; }
    if (e.key === 'g' || e.key === 'G') { gPrefix = true; clearTimeout(gTimer); gTimer = setTimeout(() => gPrefix = false, 900); return; }
    if (gPrefix) {
      const map = { d:'#/dashboard', v:'#/devices', a:'#/alarms', t:'#/telemetry', u:'#/automation', o:'#/ota', i:'#/interlocks', s:'#/settings' };
      const h = map[e.key.toLowerCase()];
      if (h) { e.preventDefault(); nav(h); gPrefix = false; clearTimeout(gTimer); }
    }
  });
  mqtt.on('connected', () => {
    const pill = $('#wsPill');
    pill.classList.remove('down');
    pill.setAttribute('aria-label', 'Broker status: connected');
    $('#wsLabel').textContent = 'connected';
  });
  mqtt.on('disconnected', () => {
    const pill = $('#wsPill');
    pill.classList.add('down');
    pill.setAttribute('aria-label', 'Broker status: disconnected');
    $('#wsLabel').textContent = 'disconnected';
  });
  mqtt.on('message', (topic, payload, opts) => logTraffic('in', topic, payload, opts));
  const origPublish = mqtt.publish;
  mqtt.publish = async (topic, payload, opts) => {
    logTraffic('out', topic, payload, opts);
    return origPublish.call(mqtt, topic, payload, opts);
  };
  mqtt.subscribe('electrix/#', (topic, payload) => {
    if (topic.endsWith('/status/lwt')) {
      const id = topic.split('/')[1];
      const d = deviceById(id);
      if (d) {
        const wasOnline = d.lwt === 'online';
        d.lwt = payload === 'offline' ? 'offline' : 'online';
        LWT_LOG.unshift({ ts:Date.now(), device_id:id, lwt:d.lwt });
        if (LWT_LOG.length > 200) LWT_LOG.pop();
        if (wasOnline && d.lwt === 'offline') ACTIVITY.unshift({ t:0, text:`${d.name} went offline` });
      }
    }
  });
  mqtt.connect();
  startTick();
  if (state.user) enterApp();
  else applyTheme(localStorage.getItem('electrix_theme') || null, false);
}
boot();
