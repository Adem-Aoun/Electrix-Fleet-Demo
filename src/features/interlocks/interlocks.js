'use strict';

const INTERLOCKS = [
  { id:'il1', name:'Conveyor stop on open dock door', enabled:true, priority:100, site_id:null,
    when:{ device_id:'88c4a01f3d7e', capability:'relay0', operator:'==', value:'on' },
    then:{ action:'block', device_id:'88c4a01f3d7e', capability:'relay1' },
    created_by:'admin', created_at: Date.now() - 86400_000 * 12 },
  { id:'il2', name:'Garden pump off when garage offline', enabled:false, priority:50, site_id:'villa-nord',
    when:{ device_id:'a13bd220e901', capability:'relay0', operator:'==', value:'off' },
    then:{ action:'block', device_id:'f42dc971c624', capability:'relay3' },
    created_by:'operator', created_at: Date.now() - 86400_000 * 3 },
];
function evaluateInterlocks() {
  const blocks = {};
  INTERLOCKS.filter(r => r.enabled).forEach(rule => {
    const condDev = deviceById(rule.when.device_id); if (!condDev) return;
    const condCap = condDev.capabilities.find(c => c.id === rule.when.capability); if (!condCap) return;
    if (String(condCap.value) !== String(rule.when.value)) return;
    if (rule.then.action === 'block') {
      const key = `${rule.then.device_id}/${rule.then.capability}`;
      if (!blocks[key] || blocks[key].rule.priority < rule.priority) blocks[key] = { rule };
    }
  });
  return blocks;
}
let CURRENT_BLOCKS = evaluateInterlocks();
const isBlocked = (deviceId, capId) => CURRENT_BLOCKS[`${deviceId}/${capId}`] || null;
function tickInterlocks() {
  const next = evaluateInterlocks();
  const beforeKeys = new Set(Object.keys(CURRENT_BLOCKS));
  Object.keys(next).forEach(k => {
    if (!beforeKeys.has(k)) {
      const r = next[k].rule;
      toast('Interlock active', { msg:`${r.name}`, type:'warn', timeout:5000 });
    }
  });
  CURRENT_BLOCKS = next;
}
function renderInterlocks(main) {
  const active = INTERLOCKS.filter(r => r.enabled);
  const violations = Object.entries(CURRENT_BLOCKS);
  main.innerHTML = `
    <div class="main-head">
      <h1>Interlocks</h1>
      <div class="main-head-actions"><span class="count">${active.length} enabled · ${violations.length} blocks</span></div>
    </div>
    <div class="not-live">
      <div class="nl-icon">${icon('alert-triangle')}</div>
      <div class="nl-body">
        <b>Demo data</b>
        Interlocks run <em>on-device</em> in <span class="mono">components/automation/</span>,
        which has not shipped in firmware yet.
      </div>
    </div>
    <div class="violations-panel ${violations.length ? '' : 'empty'}">
      <h4 style="margin:0 0 8px;font-size:11.5px;color:var(--content-faint);text-transform:uppercase;letter-spacing:.4px;display:flex;align-items:center;gap:6px;">${icon('shield-alert')}Live violations</h4>
      ${violations.length
        ? violations.map(([key, { rule }]) => {
            const [devId, capId] = key.split('/');
            const dev = deviceById(devId);
            const cap = dev?.capabilities.find(c => c.id === capId);
            return `<div class="violation-row">
              <span class="blocked-chip">${icon('ban')}blocked</span>
              <span style="flex:1;min-width:0;"><b>${esc(dev?.name || devId)}</b> · ${esc(cap?.label || capId)}</span>
              <span style="font-size:11px;color:var(--content-dim);">${esc(rule.name)}</span>
            </div>`;
          }).join('')
        : '<div style="font-size:12.5px;color:var(--content-faint);padding:6px 0;">No blocks active.</div>'}
    </div>
    <div class="main-head" style="margin-bottom:10px;">
      <h1 style="font-size:14px;">Rules</h1>
      <button class="btn primary" id="addRuleBtn" ${can('toggle') ? '' : 'disabled'}>${icon('plus')}New rule</button>
    </div>
    <div id="ruleList">
      ${INTERLOCKS.length ? INTERLOCKS.map(renderRuleCard).join('') : '<div class="empty">No rules defined yet.</div>'}
    </div>
    <div id="ruleEditorRoot"></div>`;
  refreshIcons(main);
  $$('[data-rule-toggle]').forEach(el => el.addEventListener('click', () => {
    const r = INTERLOCKS.find(x => x.id === el.dataset.ruleToggle); if (!r) return;
    r.enabled = !r.enabled; audit('interlock.toggle', r.id, r.enabled ? 'enabled' : 'disabled');
    CURRENT_BLOCKS = evaluateInterlocks(); renderMain();
  }));
  $$('[data-rule-edit]').forEach(el => el.addEventListener('click', () => openRuleEditor(el.dataset.ruleEdit)));
  $$('[data-rule-delete]').forEach(el => el.addEventListener('click', async () => {
    const r = INTERLOCKS.find(x => x.id === el.dataset.ruleDelete); if (!r) return;
    const ok = await confirmModal({ title:'Delete rule?', message:`"${r.name}" will be removed.`, confirmText:'Delete', danger:true });
    if (!ok) return;
    INTERLOCKS.splice(INTERLOCKS.indexOf(r), 1); audit('interlock.delete', r.id);
    CURRENT_BLOCKS = evaluateInterlocks(); toast('Rule deleted', { type:'info' }); renderMain();
  }));
  $('#addRuleBtn').addEventListener('click', () => openRuleEditor());
}
function renderRuleCard(r) {
  const condDev = deviceById(r.when.device_id);
  const condCap = condDev?.capabilities.find(c => c.id === r.when.capability);
  const actDev = deviceById(r.then.device_id);
  const actCap = actDev?.capabilities.find(c => c.id === r.then.capability);
  const violated = CURRENT_BLOCKS[`${r.then.device_id}/${r.then.capability}`]?.rule.id === r.id;
  return `<div class="rule-card ${r.enabled ? 'enabled' : ''} ${violated ? 'violated' : ''}">
    <button class="toggle-small ${r.enabled ? 'on' : ''}" data-rule-toggle="${r.id}" aria-pressed="${r.enabled}"></button>
    <div class="rc-body">
      <div class="rc-name">${icon('link-2')}${esc(r.name)} ${violated ? `<span class="blocked-chip">${icon('ban')}active</span>` : ''}</div>
      <div class="rc-expr">
        <span class="kw">WHEN</span> ${esc(condDev?.name || r.when.device_id)}.<span class="v">${esc(condCap?.label || r.when.capability)}</span>
        <span class="op">${r.when.operator}</span> <span class="v">${esc(String(r.when.value))}</span><br>
        <span class="kw">THEN</span> ${r.then.action === 'block' ? 'block' : esc(r.then.action)}
        ${esc(actDev?.name || r.then.device_id)}.<span class="v">${esc(actCap?.label || r.then.capability)}</span>
      </div>
      <div class="rc-meta">prio ${r.priority} · ${r.site_id ? 'site: ' + esc(siteName(r.site_id)) : 'global'} · ${esc(r.created_by)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      <button class="btn sm" data-rule-edit="${r.id}" ${can('toggle') ? '' : 'disabled'}>${icon('pencil')}Edit</button>
      <button class="btn sm danger" data-rule-delete="${r.id}" ${can('toggle') ? '' : 'disabled'}>${icon('trash-2')}</button>
    </div>
  </div>`;
}
function openRuleEditor(ruleId = null, scopedDeviceId = null) {
  if (!can('toggle')) { toast('Permission denied', { type:'error' }); return; }
  const r = ruleId ? INTERLOCKS.find(x => x.id === ruleId) : null;
  const inlineRoot = $('#ruleEditorRoot');
  const modalMode = !!scopedDeviceId || !inlineRoot;
  let wrap = null;
  let root = inlineRoot;
  if (modalMode) {
    wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${r ? 'Edit rule' : 'New rule'}</h3><div class="rule-editor-form"></div></div>`;
    $('#modalRoot').appendChild(wrap);
    root = wrap.querySelector('.rule-editor-form');
    wrap.addEventListener('mousedown', event => { if (event.target === wrap) wrap.remove(); });
    wrap.addEventListener('keydown', event => { if (event.key === 'Escape') wrap.remove(); });
  }
  const allCaps = [];
  DEVICES.filter(d => !scopedDeviceId || d.device_id === scopedDeviceId)
    .forEach(d => d.capabilities.forEach(c => allCaps.push({ d, c })));
  const capOptions = (selDev, selCap) =>
    allCaps.map(({ d, c }) => `<option value="${d.device_id}|${c.id}" ${d.device_id === selDev && c.id === selCap ? 'selected' : ''}>${esc(d.name)} · ${esc(c.label)}</option>`).join('');
  const defaultDeviceId = scopedDeviceId || allCaps[0]?.d.device_id;
  root.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:12px;">
    ${modalMode ? '' : `<div style="font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:7px;">${icon('link-2')}${r ? 'Edit rule' : 'New rule'}</div>`}
    <div class="config-row" style="margin-bottom:10px;"><span style="min-width:60px;font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:700;">NAME</span><input type="text" id="ruleName" value="${esc(r?.name || '')}" placeholder="Rule name" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;"></div>
    <div class="config-row" style="margin-bottom:10px;"><span style="min-width:60px;font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:700;">WHEN</span><select id="ruleWhen" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">${capOptions(r?.when.device_id || defaultDeviceId, r?.when.capability || allCaps[0]?.c.id)}</select></div>
    <div class="config-row" style="margin-bottom:10px;"><span style="min-width:60px;"></span>
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;">
        <select id="ruleOp" style="width:110px;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
          <option value="==" ${r?.when.operator === '==' ? 'selected' : ''}>is</option>
          <option value="!=" ${r?.when.operator === '!=' ? 'selected' : ''}>is not</option>
        </select>
        <input type="text" id="ruleVal" value="${esc(r ? String(r.when.value) : 'on')}" placeholder="value" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
      </div>
    </div>
    <div class="config-row" style="margin-bottom:10px;"><span style="min-width:60px;font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:700;">THEN</span>
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;">
        <select id="ruleAct" style="width:100px;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
          <option value="block">block</option>
        </select>
        <select id="ruleThen" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">${capOptions(r?.then.device_id || defaultDeviceId, r?.then.capability || allCaps[0]?.c.id)}</select>
      </div>
    </div>
    <div class="config-row" style="margin-bottom:10px;"><span style="min-width:60px;font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:700;">PRIO</span>
      <div style="display:flex;gap:8px;flex:1;flex-wrap:wrap;">
        <input type="number" inputmode="numeric" id="rulePrio" value="${r?.priority ?? 50}" style="width:100px;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
        <select id="ruleSite" style="flex:1;min-width:0;padding:10px;border-radius:5px;border:1px solid var(--border);background:var(--surface-2);font-size:14px;">
          <option value="">Global</option>
          ${SITES.map(s => `<option value="${s.id}" ${r?.site_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap;">
      <button class="btn" id="ruleCancel" style="flex:1;">Cancel</button>
      <button class="btn primary" id="ruleSave" style="flex:1;">${icon('save')}Save</button>
    </div>
  </div>`;
  refreshIcons(root);
  root.querySelector('#ruleCancel').addEventListener('click', () => { if (wrap) wrap.remove(); else root.innerHTML = ''; });
  root.querySelector('#ruleSave').addEventListener('click', () => {
    const name = root.querySelector('#ruleName').value.trim();
    if (!name) { toast('Name required', { type:'error' }); return; }
    const [whenDev, whenCap] = root.querySelector('#ruleWhen').value.split('|');
    const [thenDev, thenCap] = root.querySelector('#ruleThen').value.split('|');
    const payload = {
      name,
      when: { device_id:whenDev, capability:whenCap, operator:root.querySelector('#ruleOp').value, value:root.querySelector('#ruleVal').value.trim() },
      then: { action:root.querySelector('#ruleAct').value, device_id:thenDev, capability:thenCap },
      priority: parseInt(root.querySelector('#rulePrio').value, 10) || 50,
      site_id: root.querySelector('#ruleSite').value || null,
      enabled: r?.enabled ?? true,
      created_by: r?.created_by || state.user.username,
      created_at: r?.created_at || Date.now(),
    };
    if (r) { Object.assign(r, payload); audit('interlock.edit', r.id, name); }
    else { INTERLOCKS.push({ id:uid(), ...payload }); audit('interlock.create', name); }
    CURRENT_BLOCKS = evaluateInterlocks();
    toast(r ? 'Rule updated' : 'Rule created', { msg:name, type:'ok' });
    if (wrap) wrap.remove();
    renderMain();
  });
}
