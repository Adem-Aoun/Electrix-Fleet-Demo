'use strict';

let DASH_USERS = USERS.map(u => ({ username:u.username, role:u.role, display:u.display }));
function renderSettings(main) {
  if (state.user?.role !== 'admin') {
    main.innerHTML = `<div class="main-head"><h1>Settings</h1></div>
      <div class="perm-note">${icon('lock')}<span>Sign in as admin.</span></div>`;
    refreshIcons(main); return;
  }
  main.innerHTML = `
    <div class="main-head"><h1>Settings</h1></div>
    <div style="max-width:720px;">
      <div class="panel" style="margin-bottom:14px;">
        <h4>${icon('users')}Users</h4>
        <div id="userList"></div>
        <div class="config-row" style="margin-top:12px;gap:8px;">
          <input type="text" id="newUserName" placeholder="Username" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
          <select id="newUserRole" style="padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
            <option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option>
          </select>
          <button class="btn" id="addUserBtn">${icon('plus')}Add</button>
        </div>
      </div>
      <div class="panel" style="margin-bottom:14px;">
        <h4>${icon('map-pin')}Sites</h4>
        <div id="siteSettingsList"></div>
        <div class="config-row" style="margin-top:12px;gap:8px;">
          <input type="text" id="newSiteName" placeholder="New site name" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
          <button class="btn" id="addSiteBtn">${icon('plus')}Add</button>
        </div>
      </div>
      <div class="panel" style="margin-bottom:14px;">
        <h4>${icon('server')}Broker</h4>
        <div class="config-row"><span>URI</span><span class="mono" style="font-size:12px;">mqtt://192.168.100.227:1883</span></div>
        <div class="config-row"><span>TLS</span><span class="mono" style="font-size:12px;color:var(--content-faint);">disabled</span></div>
        <div class="config-row"><span>Client ID</span><span class="mono" style="font-size:12px;">electrix-dash-${uid()}</span></div>
      </div>
      <div class="panel" style="margin-bottom:14px;">
        <h4>${icon('database-backup')}Backup</h4>
        <div class="config-row" style="gap:8px;flex-wrap:wrap;">
          <button class="btn" id="exportBtn" style="flex:1;">${icon('download')}Export</button>
          <button class="btn" id="importBtn" style="flex:1;">${icon('upload')}Import</button>
          <input type="file" id="importInput" accept="application/json" style="display:none;">
        </div>
      </div>
      <div class="panel">
        <h4>${icon('scroll-text')}Audit log</h4>
        <div class="log-view">${AUDIT.slice(0, 50).map(a => `<div class="log-row">
          <span class="ts">${fmtClock(a.ts)}</span>
          <span class="lv info">${esc(a.action)}</span>
          <span>${esc(a.target)}${a.details ? ' — ' + esc(a.details) : ''} <span class="mono" style="color:var(--content-faint)">@${esc(a.user)}</span></span>
        </div>`).join('') || '<div style="color:var(--content-faint);padding:8px;">No entries yet.</div>'}</div>
      </div>
    </div>`;
  refreshIcons(main);
  renderUserList(); renderSiteSettingsList();
  $('#addUserBtn').addEventListener('click', () => {
    const name = $('#newUserName').value.trim(); if (!name) return;
    const role = $('#newUserRole').value;
    DASH_USERS.push({ username:name, role, display:name });
    audit('user.add', name, role);
    $('#newUserName').value = ''; renderUserList();
    toast('User added', { msg:`${name} (${role})`, type:'ok' });
  });
  $('#addSiteBtn').addEventListener('click', () => {
    const raw = $('#newSiteName').value.trim(); if (!raw) return;
    const id = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id || SITES.some(s => s.id === id)) { toast('Invalid or duplicate site', { type:'error' }); return; }
    SITES.push({ id, name:raw });
    audit('site.add', id, raw);
    $('#newSiteName').value = ''; renderSiteSettingsList();
    toast('Site added', { msg:raw, type:'ok' });
  });
  $('#exportBtn').addEventListener('click', () => {
    const backup = { exported_at:new Date().toISOString(), version:1, schedules:SCHEDULES, scenes:SCENES, favorites:state.favorites, widgetLayout:state.widgetLayout, devMode:state.devMode };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `electrix-backup-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('Backup exported', { type:'ok' });
  });
  $('#importBtn').addEventListener('click', () => $('#importInput').click());
  $('#importInput').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data.schedules)) { SCHEDULES = data.schedules; saveSchedules(); }
        if (Array.isArray(data.scenes)) { SCENES = data.scenes; saveScenes(); }
        if (Array.isArray(data.favorites)) { state.favorites = data.favorites; lsSet('electrix_favorites', state.favorites); }
        if (Array.isArray(data.widgetLayout)) { state.widgetLayout = data.widgetLayout; lsSet('electrix_widget_layout', state.widgetLayout); }
        if (typeof data.devMode === 'boolean') { state.devMode = data.devMode; lsSet('electrix_devmode', state.devMode); }
        toast('Backup restored', { type:'ok' }); renderMain();
      } catch { toast('Import failed', { msg:'Invalid JSON', type:'error' }); }
    };
    reader.readAsText(file); e.target.value = '';
  });
}
function renderUserList() {
  $('#userList').innerHTML = DASH_USERS.map(u => `<div class="config-row" style="padding:10px 0;border-bottom:1px solid var(--border);">
    <span>${esc(u.display)} <span class="mono" style="color:var(--content-faint);font-size:11px;">@${esc(u.username)}</span></span>
    <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border);color:${u.role === 'admin' ? 'var(--accent)' : 'var(--content-dim)'};">${ROLE_LABEL[u.role]}</span>
  </div>`).join('');
}
function renderSiteSettingsList() {
  $('#siteSettingsList').innerHTML = SITES.map(s => {
    const n = DEVICES.filter(d => d.site_id === s.id).length;
    return `<div class="config-row" style="padding:10px 0;border-bottom:1px solid var(--border);">
      <span>${esc(s.name)}</span>
      <span class="mono" style="font-size:11px;color:var(--content-faint);">${s.id} · ${n} device${n === 1 ? '' : 's'}</span>
    </div>`;
  }).join('');
}
