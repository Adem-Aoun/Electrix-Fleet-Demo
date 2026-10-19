'use strict';

let users = [];
let auditLog = [];
let settingsSites = [];

function userRows() {
  return users.map(user => `
    <div class="config-row" style="padding:10px 0;border-bottom:1px solid var(--border);gap:8px">
      <span style="flex:1;min-width:0"><strong>${esc(user.display)}</strong><span class="mono" style="color:var(--content-faint);font-size:11px">@${esc(user.username)}</span></span>
      <span class="mono" style="font-size:11px;color:var(--content-faint)">${ROLE_LABEL[user.role] || user.role}</span>
      ${user.username !== state.user.username ? `<button class="btn sm danger" data-delete-user="${esc(user.username)}">Delete</button>` : ''}
    </div>`).join('');
}

function siteRows(sites = settingsSites) {
  return sites.map(site => {
    const count = DEVICES.filter(device => device.site_id === site.id).length;
    return `<div class="config-row" style="padding:10px 0;border-bottom:1px solid var(--border);gap:8px">
      <span style="flex:1;min-width:0"><strong>${esc(site.name)}</strong><span class="mono" style="color:var(--content-faint);font-size:11px">${esc(site.id)}</span></span>
      <span class="mono" style="font-size:11px;color:var(--content-faint)">${count} device${count === 1 ? '' : 's'}</span>
      <button class="btn sm danger" data-delete-site="${esc(site.id)}" aria-label="Delete ${esc(site.name)}">${icon('trash-2')}</button>
    </div>`;
  }).join('');
}

function auditRows() {
  return auditLog.slice(0, 50).map(entry => `
    <div class="log-row">
      <span class="ts">${fmtClock(entry.created_at)}</span>
      <span class="lv info">${esc(entry.action)}</span>
      <span>${esc(entry.target)}${entry.details ? ' — ' + esc(entry.details) : ''}<span class="mono" style="color:var(--content-faint)">@${esc(entry.actor)}</span></span>
    </div>`).join('') || '<div style="color:var(--content-faint);padding:8px">No entries yet.</div>';
}

async function loadSettingsData() {
  const status = $('#settingsLoadStatus');
  if (status) status.innerHTML = '<span>Loading settings…</span>';
  try {
    const [userData, auditData, siteData] = await Promise.all([
      mqtt.listUsers(), mqtt.getAuditLog(), mqtt.refreshSites(),
    ]);
    users = userData;
    auditLog = auditData;
    if (!$('#userList')) return;
    const freshSites = siteData.map(site => ({ id: site.id, name: site.name }));
    settingsSites = freshSites;
    SITES.splice(0, SITES.length, ...freshSites);
    $('#userList').innerHTML = userRows();
    $('#siteSettingsList').innerHTML = siteRows(freshSites);
    $('#auditLog').innerHTML = auditRows();
    refreshIcons($('#siteSettingsList'));
    if (status) status.innerHTML = '';
  } catch (error) {
    if (status) status.innerHTML = `<div class="inline-error" role="alert">Settings could not load: ${esc(error.message)} <button class="btn sm" id="settingsRetry">Retry</button></div>`;
    $('#settingsRetry')?.addEventListener('click', loadSettingsData, { once: true });
  }
}

function renderSettings(main) {
  if (state.user?.role !== 'admin') {
    main.innerHTML = `<div class="main-head"><h1>Settings</h1></div><div class="perm-note">${icon('lock')}<span>Sign in as admin.</span></div>`;
    refreshIcons(main);
    return;
  }
  main.innerHTML = `
    <div class="main-head"><h1>Settings</h1></div>
    <div style="max-width:720px">
      <div id="settingsLoadStatus" aria-live="polite"></div>
      <div class="panel language-settings" style="margin-bottom:14px">
        <h4>${icon('languages')}Language</h4>
        <div class="config-row"><label for="languageSelect">Choose interface language</label><select id="languageSelect" style="min-width:160px;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px">${LANGUAGES.map(language => `<option value="${language.code}" ${getLanguage() === language.code ? 'selected' : ''}>${language.name}</option>`).join('')}</select></div>
      </div>
      <div class="panel" style="margin-bottom:14px">
        <h4>${icon('users')}Users</h4><div id="userList" class="settings-data-list"></div>
        <div class="config-row" style="margin-top:12px;gap:8px">
          <input type="text" id="newUserName" placeholder="Username" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px">
          <select id="newUserRole" style="padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px"><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select>
          <input type="password" id="newUserPassword" placeholder="Password" style="width:160px;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px">
          <button class="btn" id="addUserBtn">${icon('plus')}Add</button>
        </div>
      </div>
      <div class="panel" style="margin-bottom:14px">
        <h4>${icon('map-pin')}Sites</h4><div id="siteSettingsList" class="settings-data-list"></div>
        <div class="config-row" style="margin-top:12px;gap:8px"><input type="text" id="newSiteName" placeholder="New site name" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px"><button class="btn" id="addSiteBtn">${icon('plus')}Add</button></div>
      </div>
      <div class="panel" style="margin-bottom:14px">
        <h4>${icon('database-backup')}Backup</h4><div class="config-row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="exportBtn" style="flex:1">${icon('download')}Export</button><button class="btn" id="importBtn" style="flex:1">${icon('upload')}Import</button><input type="file" id="importInput" accept="application/json" style="display:none"></div>
      </div>
      <div class="panel"><h4>${icon('scroll-text')}Audit log</h4><div class="log-view" id="auditLog"></div></div>
    </div>`;
  refreshIcons(main);
  loadSettingsData();
  $('#languageSelect').addEventListener('change', event => { setLanguage(event.target.value); renderMain(); translateNode(document.body); });
  $('#addUserBtn').addEventListener('click', async () => {
    const username = $('#newUserName').value.trim().toLowerCase();
    const password = $('#newUserPassword').value;
    const role = $('#newUserRole').value;
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) { toast('Username must be 3-32 letters, numbers, dots, dashes, or underscores', { type: 'error' }); return; }
    if (password.length < 8) { toast('Password must be at least 8 characters', { type: 'error' }); return; }
    try {
      await mqtt.createUser({ username, password, role, display: username });
      $('#newUserName').value = ''; $('#newUserPassword').value = '';
      await loadSettingsData();
      toast('User added', { msg: `${username} (${role})`, type: 'ok' });
    } catch (error) { toast('User add failed', { msg: error.message, type: 'error' }); }
  });
  $('#addSiteBtn').addEventListener('click', async () => {
    const raw = $('#newSiteName').value.trim();
    const id = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id || settingsSites.some(site => site.id === id)) { toast('Invalid or duplicate site', { type: 'error' }); return; }
    try { await mqtt.createSite(raw); $('#newSiteName').value = ''; await loadSettingsData(); toast('Site added', { msg: raw, type: 'ok' }); }
    catch (error) { toast('Site add failed', { msg: error.message, type: 'error' }); }
  });
  $('#siteSettingsList').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-site]');
    if (!button) return;
    const siteId = button.dataset.deleteSite;
    const site = settingsSites.find(item => item.id === siteId);
    if (!await confirmModal({ title: 'Delete site?', message: `Delete ${site?.name || siteId} and unassign its devices?`, danger: true, confirmText: 'Delete' })) return;
    try {
      await mqtt.deleteSite(siteId);
      await loadSettingsData();
      toast('Site deleted', { type: 'ok' });
    } catch (error) { toast('Site delete failed', { msg: error.message, type: 'error' }); }
  });
  $('#userList').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-user]');
    if (!button) return;
    const username = button.dataset.deleteUser;
    if (!await confirmModal({ title: 'Delete user?', message: `Delete ${username}? This cannot be undone.`, danger: true, confirmText: 'Delete' })) return;
    try { await mqtt.deleteUser(username); await loadSettingsData(); toast('User deleted', { type: 'ok' }); }
    catch (error) { toast('User delete failed', { msg: error.message, type: 'error' }); }
  });
  $('#exportBtn').addEventListener('click', () => {
    const backup = { exported_at: new Date().toISOString(), version: 3, automationTasks: LADDER_RULES, scenes: SCENES, favorites: state.favorites, widgetLayout: state.widgetLayout, devMode: state.devMode };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `electrix-backup-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href); toast('Backup exported', { type: 'ok' });
  });
  $('#importBtn').addEventListener('click', () => $('#importInput').click());
  $('#importInput').addEventListener('change', event => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data.automationTasks)) { LADDER_RULES = data.automationTasks; saveLadderRules(); }
        if (Array.isArray(data.scenes)) { SCENES = data.scenes; saveScenes(); }
        if (Array.isArray(data.favorites)) { state.favorites = data.favorites; lsSet('electrix_favorites', state.favorites); }
        if (Array.isArray(data.widgetLayout)) { state.widgetLayout = data.widgetLayout; lsSet('electrix_widget_layout', state.widgetLayout); }
        if (typeof data.devMode === 'boolean') { state.devMode = data.devMode; lsSet('electrix_devmode', state.devMode); }
        toast('Backup restored', { type: 'ok' }); renderMain();
      } catch { toast('Import failed', { msg: 'Invalid JSON', type: 'error' }); }
    };
    reader.readAsText(file); event.target.value = '';
  });
}