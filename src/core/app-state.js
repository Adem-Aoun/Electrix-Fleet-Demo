'use strict';

const AUDIT = [];
function can(action) {
  const role = state.user?.role || 'viewer';
  if (role === 'admin') return true;
  if (role === 'operator') return ['toggle','ack','clear','shelve','rename','automate'].includes(action);
  return false;
}
function audit(action, target, details = '') {
  AUDIT.unshift({ ts: Date.now(), user: state.user?.username || 'system', action, target, details });
  if (AUDIT.length > 200) AUDIT.pop();
}
const isFavorite = id => state.favorites.includes(id);
function toggleFavorite(id) {
  const i = state.favorites.indexOf(id);
  if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(id);
  lsSet('electrix_favorites', state.favorites);
}

const TOAST_ICON = { ok:'check-circle', error:'x-circle', warn:'alert-triangle', info:'info' };
function toast(title, { msg = '', type = 'info', timeout = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="ti">${icon(TOAST_ICON[type] || 'info')}</div>
    <div class="tb"><div class="ttl">${esc(title)}</div>${msg ? `<div class="msg">${esc(msg)}</div>` : ''}</div>
    <button class="tx" aria-label="Dismiss">${icon('x')}</button>`;
  const kill = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 180); };
  el.querySelector('.tx').onclick = kill;
  $('#toastStack').appendChild(el);
  refreshIcons(el);
  if (timeout) setTimeout(kill, timeout);
  return { close: kill };
}

function confirmModal({ title, message, confirmText = 'Confirm', danger = false, requireText = null, extraHtml = '' }) {
  return new Promise(resolve => {
    const root = $('#modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>
      <div class="m-msg">${esc(message)}</div>
      ${extraHtml}
      ${requireText ? `<div class="m-extra"><label class="field-label">Type <span class="mono" style="color:var(--alarm)">${esc(requireText)}</span> to confirm</label><input type="text" id="mConfirmInput" autocomplete="off" autocapitalize="off"></div>` : ''}
      <div class="btn-row">
        <button class="btn" data-act="cancel">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok" ${requireText ? 'disabled' : ''}>${esc(confirmText)}</button>
      </div>
    </div>`;
    root.appendChild(wrap);
    refreshIcons(wrap);
    const input = wrap.querySelector('#mConfirmInput');
    const okBtn = wrap.querySelector('[data-act="ok"]');
    if (input) input.addEventListener('input', () => { okBtn.disabled = input.value.trim() !== requireText; });
    const close = val => { wrap.remove(); resolve(val); };
    wrap.querySelector('[data-act="cancel"]').onclick = () => close(null);
    okBtn.onclick = () => close(true);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(null); });
    const onKey = e => {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); }
      if (e.key === 'Enter' && !okBtn.disabled) { document.removeEventListener('keydown', onKey); close(true); }
    };
    document.addEventListener('keydown', onKey);
    setTimeout(() => (input || okBtn).focus(), 40);
  });
}
function openSheet({ title, bodyHtml, onMount }) {
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    ${title ? `<h3>${esc(title)}</h3>` : ''}
    <div>${bodyHtml}</div>
  </div>`;
  root.appendChild(wrap);
  refreshIcons(wrap);
  const close = val => { wrap.remove(); return val; };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(null); });
  const onKey = e => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); } };
  document.addEventListener('keydown', onKey);
  onMount?.(wrap, close);
}
function openShortcuts() {
  const rows = [
    ['Command palette', ['Ctrl','K']],
    ['Toggle sidebar', ['Ctrl','\\']],
    ['Show this help', ['?']],
    ['Developer mode', ['D']],
    ['Toggle theme', ['T']],
    ['Topic inspector', ['I']],
    ['Close drawer / modal', ['Esc']],
  ];
  openSheet({
    title: 'Keyboard shortcuts',
    bodyHtml: `<div>${rows.map(([l,k]) => `<div class="shortcut-row"><span>${esc(l)}</span><span>${k.map(x => `<span class="kbd">${esc(x)}</span>`).join(' ')}</span></div>`).join('')}</div>
      <div class="btn-row"><button class="btn primary" data-act="ok">Got it</button></div>`,
    onMount: (wrap, close) => { wrap.querySelector('[data-act="ok"]').onclick = () => close(); }
  });
}
function openMobileMoreSheet() {
  const items = [
    { icon:'activity',     label:'Telemetry',       route:'#/telemetry' },
    { icon:'upload-cloud', label:'Firmware / OTA',  route:'#/ota' },
    { icon:'link-2',       label:'Interlocks',      route:'#/interlocks' },
  ];
  if (state.user?.role === 'admin') items.push({ icon:'settings', label:'Settings', route:'#/settings' });
  const rowStyle = 'display:flex;align-items:center;gap:14px;padding:14px 12px;border:none;background:none;width:100%;text-align:left;font-size:14px;color:var(--content);cursor:pointer;border-radius:8px;min-height:52px;';
  openSheet({
    title: 'More',
    bodyHtml: `<div style="display:grid;gap:2px;">
      ${items.map(i => `<button data-sheet-nav="${i.route}" style="${rowStyle}">${icon(i.icon)}<span>${esc(i.label)}</span></button>`).join('')}
      <button data-sheet-action="palette" style="${rowStyle}">${icon('command')}<span>Command palette</span></button>
      <button data-sheet-action="toggle-theme" style="${rowStyle}">${icon('sun-moon')}<span>Toggle theme</span></button>
      <button data-sheet-action="toggle-dev" style="${rowStyle}">${icon('code-2')}<span>Developer mode ${state.devMode ? '· on' : ''}</span></button>
      <button data-sheet-action="help" style="${rowStyle}">${icon('help-circle')}<span>Keyboard shortcuts</span></button>
      <button data-sheet-action="logout" style="${rowStyle}color:var(--alarm);">${icon('log-out')}<span>Sign out</span></button>
    </div>`,
    onMount: (wrap, close) => {
      wrap.querySelectorAll('[data-sheet-nav]').forEach(b => b.addEventListener('click', () => { close(); nav(b.dataset.sheetNav); }));
      wrap.querySelectorAll('[data-sheet-action]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.sheetAction; close();
        if (a === 'palette') openPalette();
        else if (a === 'toggle-theme') $('#themeBtn').click();
        else if (a === 'toggle-dev') $('#devModeBtn').click();
        else if (a === 'help') openShortcuts();
        else if (a === 'logout') $('#logoutBtn').click();
      }));
    }
  });
}
function openMobileSiteSheet() {
  const counts = {};
  DEVICES.forEach(d => counts[d.site_id] = (counts[d.site_id] || 0) + 1);
  const btnStyle = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 12px;border:none;background:none;width:100%;text-align:left;font-size:15px;color:var(--content);cursor:pointer;border-radius:8px;min-height:52px;';
  openSheet({
    title: 'Sites & sort',
    bodyHtml: `<div>
      <button data-sheet-site="all" style="${btnStyle}${state.selectedSite === 'all' ? 'color:var(--accent);font-weight:600;' : ''}"><span>All sites</span><span class="site-count">${DEVICES.length}</span></button>
      ${SITES.map(s => `<button data-sheet-site="${s.id}" style="${btnStyle}${state.selectedSite === s.id ? 'color:var(--accent);font-weight:600;' : ''}"><span>${esc(s.name)}</span><span class="site-count">${counts[s.id] || 0}</span></button>`).join('')}
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <label class="field-label" style="display:block;font-size:11.5px;color:var(--content-faint);margin-bottom:6px;">Sort by</label>
        <select id="mobileSortSel" style="width:100%;font-size:16px;padding:11px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);">
          <option value="site" ${state.sortBy==='site'?'selected':''}>Site</option>
          <option value="name" ${state.sortBy==='name'?'selected':''}>Name</option>
          <option value="status" ${state.sortBy==='status'?'selected':''}>Status</option>
          <option value="last_seen" ${state.sortBy==='last_seen'?'selected':''}>Last seen</option>
          <option value="favorite" ${state.sortBy==='favorite'?'selected':''}>Favorites first</option>
        </select>
      </div>
    </div>`,
    onMount: (wrap, close) => {
      wrap.querySelectorAll('[data-sheet-site]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.sheetSite;
        state.selectedSite = id; lsSet('electrix_site', id); close();
        nav(id === 'all' ? '#/devices' : `#/devices/${id}`);
      }));
      const sel = wrap.querySelector('#mobileSortSel');
      sel.addEventListener('change', () => {
        state.sortBy = sel.value; lsSet('electrix_sort', state.sortBy);
        if (state.view === 'devices') renderDeviceGrid();
        close();
      });
    }
  });
}

function openPalette() {
  if (state.paletteOpen) return;
  state.paletteOpen = true; state.paletteQuery = ''; state.paletteSel = 0;
  const root = $('#paletteRoot');
  root.innerHTML = `<div class="palette-backdrop" id="paletteBackdrop">
    <div class="palette" role="dialog" aria-modal="true">
      <input id="paletteInput" placeholder="Search Electrix Command…" autocomplete="off" spellcheck="false" autocapitalize="off">
      <div class="palette-list" id="paletteList"></div>
    </div></div>`;
  const close = () => { root.innerHTML = ''; state.paletteOpen = false; };
  $('#paletteBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'paletteBackdrop') close(); });
  const inp = $('#paletteInput');
  inp.addEventListener('input', () => { state.paletteQuery = inp.value; state.paletteSel = 0; renderPaletteResults(close); });
  inp.addEventListener('keydown', e => {
    const items = paletteItems();
    if (e.key === 'ArrowDown') { state.paletteSel = Math.min(items.length - 1, state.paletteSel + 1); renderPaletteResults(close); e.preventDefault(); }
    if (e.key === 'ArrowUp')   { state.paletteSel = Math.max(0, state.paletteSel - 1); renderPaletteResults(close); e.preventDefault(); }
    if (e.key === 'Enter')     { const it = items[state.paletteSel]; if (it) { close(); it.run(); } }
    if (e.key === 'Escape')    { close(); }
  });
  renderPaletteResults(close);
  setTimeout(() => inp.focus(), 30);
}
function paletteItems() {
  const q = state.paletteQuery.trim().toLowerCase();
  const items = [
    { group:'Go to', icon:'layout-dashboard', label:'Dashboard', run: () => location.hash = '#/dashboard' },
    { group:'Go to', icon:'plug',             label:'Devices',   run: () => location.hash = '#/devices' },
    { group:'Go to', icon:'activity',         label:'Telemetry', run: () => location.hash = '#/telemetry' },
    { group:'Go to', icon:'alert-triangle',   label:'Alarms',    run: () => location.hash = '#/alarms' },
    { group:'Go to', icon:'zap',              label:'Automation',run: () => location.hash = '#/automation' },
    { group:'Go to', icon:'upload-cloud',     label:'OTA',       run: () => location.hash = '#/ota' },
    { group:'Go to', icon:'link-2',           label:'Interlocks',run: () => location.hash = '#/interlocks' },
  ];
  if (state.user?.role === 'admin') items.push({ group:'Go to', icon:'settings', label:'Settings', run: () => location.hash = '#/settings' });
  items.push({ group:'Actions', icon:'panel-left-close', label:'Toggle sidebar', run: () => toggleSidebar() });
  items.push({ group:'Actions', icon:'sun-moon', label:'Toggle theme', run: () => $('#themeBtn').click() });
  items.push({ group:'Actions', icon:'code-2',   label:'Toggle developer mode', run: () => $('#devModeBtn').click() });
  items.push({ group:'Actions', icon:'terminal', label:'Toggle topic inspector', run: () => toggleInspector() });
  items.push({ group:'Actions', icon:'log-out',  label:'Sign out', run: () => logout() });
  SCHEDULES.forEach(s => items.push({ group:'Schedules', icon:'clock', label:s.name, meta:s.time, run: () => location.hash = '#/automation' }));
  SCENES.forEach(s => items.push({ group:'Scenes', icon:s.icon && !/[^\x00-\x7F]/.test(s.icon) ? s.icon : 'sparkles', label:s.name, meta:`${s.actions.length} actions`, run: () => runScene(s) }));
  SITES.forEach(s => items.push({ group:'Sites', icon:'map-pin', label:s.name, meta:s.id, run: () => location.hash = `#/devices/${s.id}` }));
  DEVICES.forEach(d => items.push({ group:isFavorite(d.device_id) ? '★ Favorites' : 'Devices', icon:'plug', label:d.name, meta:d.device_id, run: () => location.hash = deviceRoute(d.device_id) }));
  if (!q) return items;
  return items.filter(i => (i.label + ' ' + (i.meta || '')).toLowerCase().includes(q));
}
function renderPaletteResults(close) {
  const items = paletteItems();
  if (state.paletteSel >= items.length) state.paletteSel = Math.max(0, items.length - 1);
  const list = $('#paletteList');
  if (!items.length) { list.innerHTML = `<div class="palette-empty">No matches.</div>`; return; }
  const groups = {};
  items.forEach((it, i) => { (groups[it.group] ||= []).push({ ...it, i }); });
  list.innerHTML = Object.entries(groups).map(([g, arr]) =>
    `<div class="palette-group">${esc(g)}</div>` +
    arr.map(it => `<div class="palette-item ${it.i === state.paletteSel ? 'sel' : ''}" data-idx="${it.i}">
      <span class="pi-icon">${icon(it.icon)}</span><span>${esc(it.label)}</span>
      ${it.meta ? `<span class="pi-meta">${esc(it.meta)}</span>` : ''}
    </div>`).join('')
  ).join('');
  refreshIcons(list);
  list.querySelectorAll('.palette-item').forEach(el => {
    el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const index = +el.dataset.idx;
      if (state.paletteSel === index) return;
      state.paletteSel = index;
      list.querySelectorAll('.palette-item').forEach(item => item.classList.toggle('sel', +item.dataset.idx === index));
    });
    el.addEventListener('click', () => { const it = items[+el.dataset.idx]; close(); it.run(); });
  });
}

function applySidebarState() {
  const rail = $('#navRail');
  if (!rail) return;
  const collapsed = !!state.sidebarCollapsed;
  rail.classList.toggle('collapsed', collapsed);
  const btn = $('#railToggle');
  if (btn) {
    btn.innerHTML = icon(collapsed ? 'panel-left-open' : 'panel-left-close');
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.setAttribute('title', (collapsed ? 'Expand' : 'Collapse') + ' sidebar (⌘\\)');
    refreshIcons(btn);
  }
}
function toggleSidebar() {
  if (isMobile()) return;
  state.sidebarCollapsed = !state.sidebarCollapsed;
  lsSet('electrix_sidebar_collapsed', state.sidebarCollapsed);
  audit('sidebar.toggle', state.sidebarCollapsed ? 'collapsed' : 'expanded');
  applySidebarState();
}

function renderAlarmPill() {
  const pill = $('#alarmPill');
  const pop = $('#alarmPopover');
  const list = $('#alarmPopoverList');
  if (!pill) return;
  const unack = activeAlarms().filter(a => a.state === 'UNACK_ALARM');
  if (!unack.length) {
    pill.classList.add('empty');
    pill.setAttribute('aria-hidden', 'true');
    if (pop) pop.classList.remove('open');
    pill.setAttribute('aria-expanded', 'false');
    return;
  }
  pill.classList.remove('empty');
  pill.removeAttribute('aria-hidden');
  const c = pill.querySelector('.count');
  if (c) c.textContent = unack.length;
  if (list) {
    list.innerHTML = unack.slice(0, 5).map(a => {
      const d = deviceById(a.device_id);
      const sevCls = a.priority === 'critical' ? 'critical' : a.priority === 'low' ? 'info' : 'warn';
      return `<div class="alarm-popover-row" data-alarm-jump="${a.id}">
        <span class="alarm-sev sev-${sevCls}" style="margin-top:0;">${a.priority}</span>
        <div style="flex:1;min-width:0;">
          <div class="msg">${esc(a.msg)}</div>
          <div class="meta">${esc(d?.name || a.device_id)} · ${fmtSince(a.since)}</div>
        </div>
      </div>`;
    }).join('');
  }
  refreshIcons(pop);
}
function toggleAlarmPopover() {
  const pill = $('#alarmPill');
  const pop = $('#alarmPopover');
  if (!pill || !pop || pill.classList.contains('empty')) return;
  const open = !pop.classList.contains('open');
  pop.classList.toggle('open', open);
  pill.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeAlarmPopover() {
  const pop = $('#alarmPopover');
  const pill = $('#alarmPill');
  if (pop) pop.classList.remove('open');
  if (pill) pill.setAttribute('aria-expanded', 'false');
}

function attemptLogin() {
  const u = $('#loginUser').value.trim(), p = $('#loginPass').value;
  const m = USERS.find(x => x.username === u && x.password === p);
  if (!m) { $('#loginError').style.display = 'block'; return; }
  $('#loginError').style.display = 'none';
  state.user = { username:m.username, role:m.role, display:m.display };
  lsSet('electrix_user', state.user);
  audit('login', state.user.username);
  enterApp();
}
function logout() {
  audit('logout', state.user?.username);
  state.user = null; lsSet('electrix_user', null);
  $('#shell').classList.remove('active');
  $('#loginScreen').style.display = 'flex';
  location.hash = '';
}
function enterApp() {
  $('#loginScreen').style.display = 'none';
  $('#shell').classList.add('active');
  const chip = $('#userChip');
  if (chip) chip.textContent = state.user.display.charAt(0).toUpperCase();
  const nameEl = $('#railUserName');
  const roleEl = $('#railUserRole');
  if (nameEl) nameEl.textContent = state.user.display;
  if (roleEl) roleEl.textContent = ROLE_LABEL[state.user.role];
  $$('[data-route="#/settings"]').forEach(el => el.style.display = state.user.role === 'admin' ? '' : 'none');
  applyTheme(localStorage.getItem('electrix_theme') || null, false);
  applySidebarState();
  $('#devModeBtn').classList.toggle('active', state.devMode);
  // FIX: do NOT auto-open the inspector on login. It stays closed until the
  // user explicitly opens it via the toolbar button, the palette, or the I key.
  // (Previously it would appear whenever devMode was persisted as true.)
  if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
  applyRoute();
  refreshIcons();
}

function applyRoute() {
  const h = (location.hash || '#/dashboard').slice(2);
  const parts = h.split('/');
  const [seg, param, sub] = parts;
  if (seg === 'sites' && parts[2] === 'devices') {
    const siteId = param, deviceId = parts[3], device = deviceById(deviceId);
    if (device && device.site_id === siteId) {
      state.view = 'device';
      state.openDeviceId = deviceId;
      state.deviceTab = parts[4] === 'interlocks' ? 'overview' : parts[4] || 'overview';
      state.selectedSite = siteId;
    } else {
      state.view = 'devices';
      state.selectedSite = SITES.some(site => site.id === siteId) ? siteId : 'all';
    }
  } else {
    state.view = seg || 'dashboard';
    if (state.view === 'devices') state.selectedSite = param || 'all';
    if (state.view === 'device')  {
      state.openDeviceId = param;
      state.deviceTab = sub === 'interlocks' ? 'overview' : sub || 'overview';
      if (sub === 'interlocks' && param) history.replaceState(null, '', `#/device/${encodeURIComponent(param)}/overview`);
    }
  }
  if (state.view === 'alarms') state.alarmDeviceFilter = param || null;
  if (state.view === 'settings' && state.user?.role !== 'admin') state.view = 'dashboard';
  const target = state.view === 'device' ? 'devices' : state.view;
  $$('.navbtn[data-route], .bottom-nav button[data-route]').forEach(b => {
    const r = b.dataset.route.slice(2).split('/')[0];
    b.classList.toggle('active', r === target);
  });
  const devicesView = state.view === 'devices';
  $('#sitesAside').style.display = devicesView ? '' : 'none';
  $('#searchWrap').style.display = devicesView ? '' : 'none';
  if (state.view !== 'dashboard') state.widgetReorderMode = false;
  closeAlarmPopover();
  renderBreadcrumbs();
  renderAlarmBadge();
  renderMain();
}
function nav(hash) {
  if (location.hash === hash) applyRoute();
  else location.hash = hash;
}
function deviceRoute(deviceId, tab = 'overview') {
  const device = deviceById(deviceId);
  if (!device) return `#/device/${deviceId}${tab === 'overview' ? '' : `/${tab}`}`;
  return `#/sites/${device.site_id}/devices/${device.device_id}${tab === 'overview' ? '' : `/${tab}`}`;
}
function renderBreadcrumbs() {
  const bc = $('#breadcrumbs');
  if (state.view === 'dashboard') { bc.innerHTML = ''; return; }
  const parts = [`<a href="#/dashboard">Electrix</a>`];
  if (state.view === 'devices') {
    parts.push(`<span class="sep">/</span><a href="#/devices">Devices</a>`);
    if (state.selectedSite !== 'all') parts.push(`<span class="sep">/</span><span class="cur">${esc(siteName(state.selectedSite))}</span>`);
  } else if (state.view === 'device') {
    const d = deviceById(state.openDeviceId);
    if (d) {
      parts.push(`<span class="sep">/</span><a href="#/devices">Devices</a>`);
      parts.push(`<span class="sep">/</span><a href="#/devices/${d.site_id}">${esc(siteName(d.site_id))}</a>`);
      parts.push(`<span class="sep">/</span><span class="cur">${esc(d.name)}</span>`);
    }
  } else {
    const label = { telemetry:'Telemetry', alarms:'Alarms', automation:'Automation', ota:'Firmware / OTA', interlocks:'Interlocks', settings:'Settings' }[state.view] || state.view;
    parts.push(`<span class="sep">/</span><span class="cur">${esc(label)}</span>`);
  }
  bc.innerHTML = parts.join('');
}

let tickCount = 0, lastScheduleMinute = -1, telemetryPointerActive = false;
function deviceFreshnessTextColor(d) {
  const heartbeat = d.config.heartbeat_period_ms / 1000;
  if (d.lwt === 'offline' || d.last_seen_s > heartbeat * 3) return 'var(--alarm)';
  if (d.last_seen_s >= heartbeat * 2) return 'var(--warn)';
  return 'var(--content-dim)';
}
function updateDeviceSeenTicker() {
  if (state.view !== 'device') return;
  const d = deviceById(state.openDeviceId), label = $('#deviceSeenTicker');
  if (!d || !label) return;
  label.textContent = `seen ${fmtAgo(d.last_seen_s)}`;
  label.style.color = deviceFreshnessTextColor(d);
}
function startTick() {
  setInterval(() => {
    tickCount++;
    DEVICES.forEach(d => {
      if (d.lwt === 'online') {
        d.last_seen_s += 1;
        const hbS = d.config.heartbeat_period_ms / 1000;
        if (d.last_seen_s > hbS * 3.5) {
          mqtt.inject(`electrix/${d.device_id}/status/lwt`, 'offline');
          toast('Device offline', { msg:d.name, type:'warn', timeout:4500 });
          audit('lwt', d.device_id, 'marked offline');
        }
      } else if (d.last_seen_s < 86400) {
        d.last_seen_s += 1;
      }
    });
    if (tickCount % 2 === 0) {
      Object.entries(TELEMETRY).forEach(([key, s]) => {
        const [deviceId] = key.split('/');
        const d = deviceById(deviceId);
        if (!d || d.lwt !== 'online') return;
        const last = s.history[s.history.length - 1].v;
        const base = s.history.slice(0, 20).reduce((a, b) => a + b.v, 0) / Math.min(20, s.history.length);
        const jitter = (Math.random() - 0.5) * 0.6;
        const pull = (base - last) * 0.15;
        const v = +Math.max(0, last + jitter + pull).toFixed(2);
        s.history.push({ t: Date.now(), v });
        if (s.history.length > 240) s.history.shift();
      });
    }
    try { tickSchedules(); } catch {}
    if (tickCount % 2 === 0) { try { tickInterlocks(); } catch {} }
    if (tickCount % 2 === 0) {
      const ae = document.activeElement;
      const inForm = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT');
      const selectingTelemetry = (state.view === 'telemetry' || (state.view === 'device' && state.deviceTab === 'telemetry')) && telemetryPointerActive;
      if (!inForm && !selectingTelemetry) renderMain(true);
    }
  }, 1000);
}
function tickSchedules() {
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  if (minute === lastScheduleMinute) return;
  lastScheduleMinute = minute;
  const day = now.getDay();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  SCHEDULES.forEach(s => {
    if (!s.enabled || !s.days.includes(day) || s.time !== timeStr) return;
    if (s.last_run && Date.now() - s.last_run < 60_000) return;
    runSchedule(s);
  });
}

const siteName = id => SITES.find(s => s.id === id)?.name || id;
const deviceById = id => DEVICES.find(d => d.device_id === id);
const priorityRank = p => ({ critical:0, high:1, medium:2, low:3 })[p] ?? 9;
const deviceHasAlarm = d => ALARMS.some(a => a.device_id === d.device_id && !a.cleared);
const isShelved = a => a.shelved_until && a.shelved_until > Date.now();
const activeAlarms = () => ALARMS.filter(a => !a.cleared && !isShelved(a))
  .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.since - b.since);
function deriveStatus(d) {
  if (deviceHasAlarm(d)) return 'alarm';
  if (d.lwt === 'offline') return 'offline';
  const hbS = d.config.heartbeat_period_ms / 1000;
  if (d.last_seen_s > hbS * 2) return 'warn';
  return 'online';
}
const statusClass = s => ({ online:'st-ok', warn:'st-warn', alarm:'st-alarm', offline:'st-offline' })[s] || 'st-offline';
function freshnessPct(d) {
  const hbS = d.config.heartbeat_period_ms / 1000;
  if (d.lwt === 'offline') return 0;
  return Math.max(0, Math.min(1, 1 - d.last_seen_s / (hbS * 2)));
}
function freshnessHTML(d) {
  const p = freshnessPct(d);
  const cls = p > 0.5 ? '' : p > 0 ? 'stale' : 'dead';
  return `<div class="freshness ${cls}" style="--p:${p.toFixed(2)}" title="Freshness ${(p*100).toFixed(0)}%"></div>`;
}
const capIcon = kind => kind === 'relay' ? 'power' : kind === 'sensor' ? 'radio' : 'cpu';
function deviceTypeIcon(type) {
  if (!type) return 'cpu';
  if (type.startsWith('relay')) return 'plug';
  if (type.startsWith('sensor-pir')) return 'radar';
  if (type.startsWith('sensor')) return 'radio';
  if (type.includes('light')) return 'lightbulb';
  if (type.includes('garage') || type.includes('door')) return 'door-open';
  if (type.includes('pump') || type.includes('valve')) return 'droplet';
  if (type.includes('hvac') || type.includes('fan')) return 'fan';
  return 'cpu';
}
const fmtSince = s => s === 0 ? 'unknown' : fmtAgo(s);
function lineChart(key, { height = 180, width = 640, windowMs = null } = {}) {
  const s = TELEMETRY[key];
  if (!s || !s.history.length) return '<div class="empty">No telemetry yet.</div>';
  let data = s.history.slice(-140);
  if (windowMs) {
    const cutoff = Date.now() - windowMs;
    const filtered = data.filter(p => p.t >= cutoff);
    if (filtered.length >= 2) data = filtered;
  }
  if (data.length < 2) return '<div class="empty">Not enough data in range.</div>';
  const vals = data.map(p => p.v);
  const lo = Math.min(...vals, s.threshold ?? Infinity);
  const hi = Math.max(...vals, s.threshold ?? -Infinity);
  const pad = (hi - lo) * 0.1 || 1;
  const yLo = lo - pad, yHi = hi + pad;
  const yRange = yHi - yLo;
  const padL = 34, padR = 12, padT = 12, padB = 22;
  const W = width - padL - padR, H = height - padT - padB;
  const step = W / Math.max(1, data.length - 1);
  const pts = data.map((p, i) => [padL + i*step, padT + H - ((p.v - yLo)/yRange)*H]);
  const linePath = pts.map((p, i) => (i === 0 ? `M${p[0].toFixed(1)},${p[1].toFixed(1)}` : `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)).join(' ');
  const areaPath = `${linePath} L${pts[pts.length-1][0].toFixed(1)},${padT+H} L${pts[0][0].toFixed(1)},${padT+H} Z`;
  const thY = s.threshold != null ? padT + H - ((s.threshold - yLo)/yRange)*H : null;
  const ticks = [0,1,2,3,4].map(i => {
    const v = yLo + (yRange*i)/4;
    const y = padT + H - (i/4)*H;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL+W}" y2="${y.toFixed(1)}"/>
            <text x="${padL-6}" y="${(y+3).toFixed(1)}" text-anchor="end" class="chart-axis">${v.toFixed(1)}</text>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <g class="chart-grid">${ticks}</g>
    ${thY != null ? `<line class="chart-th" x1="${padL}" y1="${thY.toFixed(1)}" x2="${padL+W}" y2="${thY.toFixed(1)}"/>
      <text class="chart-th-label" x="${padL+W-4}" y="${(thY-4).toFixed(1)}" text-anchor="end">threshold ${s.threshold}${s.unit}</text>` : ''}
    <path class="chart-area" d="${areaPath}"/>
    <path class="chart-line" d="${linePath}"/>
    <text class="chart-axis" x="${padL}" y="${height-4}" text-anchor="start">${fmtDateTime(data[0].t)}</text>
    <text class="chart-axis" x="${padL+W}" y="${height-4}" text-anchor="end">${fmtDateTime(data[data.length-1].t)}</text>
  </svg>`;
}

function renderMain(isTick = false) {
  renderAlarmBadge();
  updateBulkBar();
  const main = $('#mainContent');
  const scrollTop = main.scrollTop;
  if (state.view === 'dashboard') renderDashboard(main);
  else if (state.view === 'devices') renderDevices(main);
  else if (state.view === 'device') renderDevicePage(main);
  else if (state.view === 'telemetry') renderTelemetry(main);
  else if (state.view === 'alarms') renderAlarms(main);
  else if (state.view === 'automation') renderAutomation(main);
  else if (state.view === 'ota') renderOTA(main);
  else if (state.view === 'interlocks') renderInterlocks(main);
  else if (state.view === 'settings') renderSettings(main);
  if (isTick) main.scrollTop = scrollTop;
  refreshIcons(main);
}
function renderAlarmBadge() {
  const n = activeAlarms().filter(a => a.state === 'UNACK_ALARM').length;
  ['#alarmBadge', '#alarmBadgeM'].forEach(sel => {
    const b = $(sel); if (!b) return;
    b.textContent = n;
    b.style.display = n > 0 ? 'flex' : 'none';
  });
  renderAlarmPill();
}
function updateBulkBar() {
  const bar = $('#bulkBar'); if (!bar) return;
  const n = state.bulkSelected.size;
  $('#bulkCount').textContent = n;
  bar.classList.toggle('show', state.bulkMode);
  document.body.classList.toggle('bulk-mode', state.bulkMode);
}
