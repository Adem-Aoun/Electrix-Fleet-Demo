'use strict';

/* =====================================================================
 * Automation Task — Ladder Editor, Runtime, Diagnostics
 * Industrial-style ladder programming for the Electrix fleet dashboard.
 *
 * Terminology used in the UI:
 *   Automation Task · Ladder Editor · Rung · Contact · Coil · Timer ·
 *   Counter · Comparator · Tag · Variable · Simulation · Diagnostics.
 * ===================================================================== */

const AUTOMATION_SIM = {
  running: false,
  startedAt: 0,
  cycles: 0,
  scanMs: 12,
  handle: null,
  forceTags: {},
};

const TAG_TYPES = ['BOOL', 'INT', 'DINT', 'UINT', 'REAL', 'TIME'];
const COMPARATOR_OPS = ['==', '!=', '>', '<', '>=', '<='];

/* ============================= Helpers ============================= */

function currentTask() {
  if (!LADDER_RULES.length) return null;
  let t = LADDER_RULES.find(x => x.id === state.autoTaskId);
  if (!t) { t = LADDER_RULES[0]; state.autoTaskId = t.id; }
  return t;
}
function taskTags(task) { if (!task.tags) task.tags = []; return task.tags; }
function findTag(task, name) { return taskTags(task).find(t => t.name === name) || null; }

function tagCurrentValue(task, name) {
  const t = findTag(task, name);
  if (!t) return undefined;
  if (Object.prototype.hasOwnProperty.call(AUTOMATION_SIM.forceTags, name)) {
    return AUTOMATION_SIM.forceTags[name];
  }
  if (t.bind === 'device' && t.device_id && t.capability) {
    const d = deviceById(t.device_id);
    const c = d?.capabilities.find(x => x.id === t.capability);
    return c ? c.value : undefined;
  }
  if (t.bind === 'telemetry' && t.telemetry_key) {
    const s = TELEMETRY[t.telemetry_key];
    return s ? s.history.at(-1)?.v : undefined;
  }
  return t.value;
}

function tagWrite(task, name, value) {
  const t = findTag(task, name);
  if (!t) return false;
  if (t.bind === 'device' && t.device_id && t.capability) {
    const d = deviceById(t.device_id);
    const c = d?.capabilities.find(x => x.id === t.capability);
    if (!c) return false;
    if (c.kind === 'relay') setCapabilityValue(c, !!value);
    else c.value = value;
    return true;
  }
  t.value = value;
  return true;
}

function operandValue(task, ref) {
  if (ref == null || ref === '') return undefined;
  if (typeof ref === 'number') return ref;
  if (/^-?\d+(\.\d+)?$/.test(String(ref))) return Number(ref);
  return tagCurrentValue(task, ref);
}

/* ========================= Element evaluation ====================== */

function evalContact(el, task) {
  const v = tagCurrentValue(task, el.tag);
  if (v === undefined) return { state: false, error: `Tag "${el.tag}" is not defined` };
  const b = v === true || v === 'on' || (typeof v === 'number' && v !== 0);
  return { state: el.variant === 'nc' ? !b : b };
}

function evalComparator(el, task) {
  const a = operandValue(task, el.tagA);
  const b = operandValue(task, el.tagB);
  if (a === undefined) return { state: false, error: `Left operand "${el.tagA}" is not defined` };
  if (b === undefined) return { state: false, error: `Right operand "${el.tagB}" is not defined` };
  const na = Number(a), nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) {
    return { state: false, error: 'Comparator operands must be numeric' };
  }
  switch (el.op) {
    case '==': return { state: na === nb };
    case '!=': return { state: na !== nb };
    case '>':  return { state: na >  nb };
    case '<':  return { state: na <  nb };
    case '>=': return { state: na >= nb };
    case '<=': return { state: na <= nb };
  }
  return { state: false, error: `Unknown comparator "${el.op}"` };
}

function evalTimer(el, task, enable, now) {
  const r = el._rt || (el._rt = { startedAt: 0, elapsed: 0, q: false, prevEnable: false });
  const preset = Math.max(0, Number(el.preset) || 0) * 1000;
  let q = false;
  if (el.variant === 'ton') {
    if (enable) {
      if (!r.prevEnable) r.startedAt = now;
      r.elapsed = now - r.startedAt;
      q = r.elapsed >= preset;
    } else {
      r.startedAt = 0; r.elapsed = 0;
    }
  } else if (el.variant === 'tof') {
    if (enable) { r.startedAt = 0; r.elapsed = 0; q = true; }
    else {
      if (r.prevEnable) r.startedAt = now;
      r.elapsed = r.startedAt ? now - r.startedAt : 0;
      q = r.startedAt ? r.elapsed < preset : false;
    }
  } else if (el.variant === 'tp') {
    if (enable && !r.prevEnable && !r.startedAt) { r.startedAt = now; r.elapsed = 0; }
    if (r.startedAt) {
      r.elapsed = now - r.startedAt;
      q = r.elapsed < preset;
      if (r.elapsed >= preset) r.startedAt = 0;
    }
  }
  r.prevEnable = enable;
  r.q = q;
  return q;
}

function evalCounter(el, task, enable, now) {
  const r = el._rt || (el._rt = { current: 0, q: false, prevEnable: false });
  const preset = Math.max(0, Number(el.preset) || 0);
  const rising = enable && !r.prevEnable;
  if (el.resetTag) {
    const rv = tagCurrentValue(task, el.resetTag);
    if (rv) r.current = 0;
  }
  if (el.variant === 'ctu') { if (rising) r.current += 1; }
  else if (el.variant === 'ctd') { if (rising) r.current = Math.max(0, r.current - 1); }
  else if (el.variant === 'ctud') { if (rising) r.current += 1; }
  r.q = el.variant === 'ctd' ? r.current <= 0 : r.current >= preset;
  r.prevEnable = enable;
  return r.q;
}

function evalCoil(el, task, state) {
  if (el.variant === 'normal') tagWrite(task, el.tag, !!state);
  else if (el.variant === 'set') { if (state) tagWrite(task, el.tag, true); }
  else if (el.variant === 'reset') { if (state) tagWrite(task, el.tag, false); }
}

function evalRung(rung, task, now) {
  let state = true;
  let error = null;
  rung.elements.forEach(el => {
    let res;
    if (el.type === 'contact') res = evalContact(el, task);
    else if (el.type === 'comparator') res = evalComparator(el, task);
    else if (el.type === 'timer') res = { state: evalTimer(el, task, state, now) };
    else if (el.type === 'counter') res = { state: evalCounter(el, task, state, now) };
    else if (el.type === 'coil') { evalCoil(el, task, state); res = { state }; }
    else res = { state: false, error: 'Unknown element type' };
    el._state = res.state;
    el._error = res.error || null;
    if (res.error && !error) error = res.error;
    if (el.type !== 'coil') state = state && res.state;
  });
  rung._state = state;
  rung._error = error;
  return state;
}

/* ========================== Simulation ============================= */

function tickLadderRules() {
  if (!AUTOMATION_SIM.running) return;
  const now = Date.now();
  const t0 = performance.now();
  LADDER_RULES.forEach(task => {
    if (!task.enabled) return;
    task.rungs.forEach(rung => {
      if (!rung.enabled) return;
      evalRung(rung, task, now);
    });
  });
  AUTOMATION_SIM.cycles++;
  AUTOMATION_SIM.scanMs = Math.max(1, Math.round(performance.now() - t0));
}

function startAutomationSim() {
  if (AUTOMATION_SIM.running) return;
  AUTOMATION_SIM.running = true;
  AUTOMATION_SIM.startedAt = Date.now();
  AUTOMATION_SIM.cycles = 0;
  if (AUTOMATION_SIM.handle) clearInterval(AUTOMATION_SIM.handle);
  AUTOMATION_SIM.handle = setInterval(() => {
    tickLadderRules();
    if (state.view === 'automation') refreshLadderIndicators();
  }, 120);
  audit('automation.sim.start', currentTask()?.id || '');
  toast('Simulation started', { msg: 'Automation Task is executing', type: 'ok' });
  renderMain();
}
function stopAutomationSim() {
  if (!AUTOMATION_SIM.running) return;
  AUTOMATION_SIM.running = false;
  if (AUTOMATION_SIM.handle) { clearInterval(AUTOMATION_SIM.handle); AUTOMATION_SIM.handle = null; }
  audit('automation.sim.stop', currentTask()?.id || '');
  toast('Simulation stopped', { type: 'info' });
  renderMain();
}
function resetAutomationSim() {
  LADDER_RULES.forEach(task => {
    task.rungs.forEach(rung => rung.elements.forEach(el => {
      el._rt = null; el._state = null; el._error = null;
    }));
    task.rungs.forEach(rung => { rung._state = null; rung._error = null; });
  });
  AUTOMATION_SIM.cycles = 0;
  AUTOMATION_SIM.forceTags = {};
  toast('Simulation reset', { type: 'info' });
  renderMain();
}

/* ===================== In-place indicator updates ================== */

function refreshLadderIndicators() {
  const task = currentTask();
  if (!task) return;
  const canvas = document.querySelector('.lad-canvas');
  if (!canvas) return;
  task.rungs.forEach(rung => {
    const rungEl = canvas.querySelector(`[data-rung-id="${rung.id}"]`);
    if (!rungEl) return;
    rungEl.classList.toggle('has-error', !!rung._error);
    rungEl.classList.toggle('energized', !!rung._state);
    rung.elements.forEach(el => {
      const elEl = rungEl.querySelector(`[data-el-id="${el.id}"]`);
      if (!elEl) return;
      elEl.classList.toggle('energized', !!el._state);
      elEl.classList.toggle('inactive', !el._state);
      elEl.classList.toggle('error', !!el._error);
      const meta = elEl.querySelector('.lad-el-meta');
      if (meta) {
        if (el.type === 'timer' && el._rt) {
          meta.textContent = `${(el._rt.elapsed / 1000).toFixed(1)} / ${el.preset}s`;
        } else if (el.type === 'counter' && el._rt) {
          meta.textContent = `${el._rt.current} / ${el.preset}`;
        }
      }
    });
  });
  const status = document.querySelector('.auto-sim-status');
  if (status) {
    status.textContent = AUTOMATION_SIM.running
      ? `RUNNING · ${AUTOMATION_SIM.cycles} cycles · scan ${AUTOMATION_SIM.scanMs}ms`
      : 'STOPPED';
    status.classList.toggle('running', AUTOMATION_SIM.running);
  }
  updateSimWatch(task);
}

function updateSimWatch(task) {
  const panel = document.querySelector('.lad-watch-list');
  if (!panel) return;
  taskTags(task).forEach(t => {
    const row = panel.querySelector(`[data-watch-tag="${CSS.escape(t.name)}"]`);
    if (!row) return;
    const v = tagCurrentValue(task, t.name);
    const valEl = row.querySelector('.lad-watch-value');
    if (valEl) {
      valEl.textContent = v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(2) : String(v));
      valEl.classList.toggle('bool-true', v === true);
      valEl.classList.toggle('bool-false', v === false);
    }
  });
}

/* ========================== Main render ============================ */

function renderAutomation(main) {
  const tab = state.autoTab || 'ladder';
  const task = currentTask();
  const tabs = [
    { id: 'ladder', label: 'Ladder Editor', icon: 'git-branch' },
    { id: 'tags', label: 'Tags', icon: 'tag' },
    { id: 'diagnostics', label: 'Diagnostics', icon: 'shield-alert' },
    { id: 'scenes', label: 'Scenes', icon: 'wand-2' },
  ];
  const issueCount = task ? diagnoseTask(task).filter(d => d.severity !== 'info').length : 0;

  main.innerHTML = `
    <div class="auto-page">
      <header class="auto-head">
        <div class="auto-head-left">
          <div class="auto-eyebrow">AUTOMATION TASK</div>
          <h1>${task ? esc(task.name) : 'Automation Task'}</h1>
          <p class="auto-sub">Industrial ladder task configuration and execution.</p>
        </div>
        <div class="auto-head-right">
          ${LADDER_RULES.length ? `<label class="auto-task-picker"><span>Task</span>
            <select id="autoTaskSelect">${LADDER_RULES.map(t => `<option value="${t.id}" ${t.id === task?.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          </label>` : ''}
          <button class="btn" id="autoNewTaskBtn">${icon('plus')}New Task</button>
          ${task ? `<button class="btn" id="autoEditTaskBtn">${icon('pencil')}Task Info</button>` : ''}
        </div>
      </header>

      <div class="auto-tabs" role="tablist">
        ${tabs.map(t => `
          <button type="button" role="tab" class="auto-tab ${tab === t.id ? 'active' : ''}" data-auto-tab="${t.id}" aria-selected="${tab === t.id}">
            ${icon(t.icon)}<span>${t.label}</span>
            ${t.id === 'diagnostics' && issueCount ? `<span class="auto-tab-badge">${issueCount}</span>` : ''}
          </button>`).join('')}
      </div>

      <div class="auto-body" id="autoBody">
        ${!task ? `<div class="empty">No Automation Tasks yet.<div class="cta"><button class="btn primary" id="autoCreateFirst">Create Automation Task</button></div></div>` : renderAutoTab(tab, task)}
      </div>
    </div>`;
  refreshIcons(main);
  wireAutoHeader(task);
  if (task) wireAutoTab(tab, task);
}

function renderAutoTab(tab, task) {
  if (tab === 'tags') return renderTagPanel(task);
  if (tab === 'diagnostics') return renderDiagnosticsPanel(task);
  if (tab === 'scenes') return renderScenes();
  return renderLadderEditor(task);
}

function wireAutoHeader(task) {
  $('#autoTaskSelect')?.addEventListener('change', e => {
    state.autoTaskId = e.target.value;
    state.autoActiveRungId = null;
    state.autoSelectedElId = null;
    lsSet('electrix_auto_task', state.autoTaskId);
    renderMain();
  });
  $('#autoNewTaskBtn')?.addEventListener('click', () => openTaskEditor());
  $('#autoEditTaskBtn')?.addEventListener('click', () => openTaskEditor(task.id));
  $('#autoCreateFirst')?.addEventListener('click', () => openTaskEditor());
}

function wireAutoTab(tab, task) {
  $$('[data-auto-tab]').forEach(b => b.addEventListener('click', () => {
    state.autoTab = b.dataset.autoTab;
    renderMain();
  }));
  if (tab === 'ladder') wireLadderEditor(task);
  if (tab === 'tags') wireTagPanel(task);
}

/* ===================== Ladder Editor — rendering =================== */

function renderLadderEditor(task) {
  return `
    <div class="lad-toolbar">
      <div class="lad-toolbar-left">
        <button class="btn primary" id="ladAddRung">${icon('plus')}New Rung</button>
        <button class="btn" id="ladStartSim" ${AUTOMATION_SIM.running ? 'disabled' : ''}>${icon('play')}Start Simulation</button>
        <button class="btn" id="ladStopSim" ${!AUTOMATION_SIM.running ? 'disabled' : ''}>${icon('square')}Stop</button>
        <button class="btn" id="ladResetSim">${icon('rotate-ccw')}Reset</button>
      </div>
      <div class="lad-toolbar-right">
        <span class="auto-sim-status ${AUTOMATION_SIM.running ? 'running' : ''}">
          ${AUTOMATION_SIM.running ? `RUNNING · ${AUTOMATION_SIM.cycles} cycles · scan ${AUTOMATION_SIM.scanMs}ms` : 'STOPPED'}
        </span>
      </div>
    </div>

    <div class="lad-workspace">
      <aside class="lad-palette" aria-label="Element palette">
        <div class="lad-palette-group">
          <h5>Contacts</h5>
          <button class="lad-palette-item" data-add-el="contact" data-variant="no">
            ${ladContactSym(false)}<span>Normally Open</span><code>--| |--</code>
          </button>
          <button class="lad-palette-item" data-add-el="contact" data-variant="nc">
            ${ladContactSym(true)}<span>Normally Closed</span><code>--|/|--</code>
          </button>
        </div>
        <div class="lad-palette-group">
          <h5>Coils</h5>
          <button class="lad-palette-item" data-add-el="coil" data-variant="normal">
            ${ladCoilSym('normal')}<span>Coil</span><code>--( )--</code>
          </button>
          <button class="lad-palette-item" data-add-el="coil" data-variant="set">
            ${ladCoilSym('set')}<span>Set Coil</span><code>--(S)--</code>
          </button>
          <button class="lad-palette-item" data-add-el="coil" data-variant="reset">
            ${ladCoilSym('reset')}<span>Reset Coil</span><code>--(R)--</code>
          </button>
        </div>
        <div class="lad-palette-group">
          <h5>Comparators</h5>
          <div class="lad-palette-grid">
            ${COMPARATOR_OPS.map(op => `
              <button class="lad-palette-chip" data-add-el="comparator" data-variant="${op}">
                <code>${op}</code>
              </button>`).join('')}
          </div>
        </div>
        <div class="lad-palette-group">
          <h5>Timers</h5>
          <button class="lad-palette-item" data-add-el="timer" data-variant="ton">
            ${ladBlockSym('TON', 'On-delay')}<span>TON</span>
          </button>
          <button class="lad-palette-item" data-add-el="timer" data-variant="tof">
            ${ladBlockSym('TOF', 'Off-delay')}<span>TOF</span>
          </button>
          <button class="lad-palette-item" data-add-el="timer" data-variant="tp">
            ${ladBlockSym('TP', 'Pulse')}<span>TP</span>
          </button>
        </div>
        <div class="lad-palette-group">
          <h5>Counters</h5>
          <button class="lad-palette-item" data-add-el="counter" data-variant="ctu">
            ${ladBlockSym('CTU', 'Count Up')}<span>CTU</span>
          </button>
          <button class="lad-palette-item" data-add-el="counter" data-variant="ctd">
            ${ladBlockSym('CTD', 'Count Down')}<span>CTD</span>
          </button>
          <button class="lad-palette-item" data-add-el="counter" data-variant="ctud">
            ${ladBlockSym('CTUD', 'Up/Down')}<span>CTUD</span>
          </button>
        </div>
      </aside>

      <div class="lad-canvas" id="ladCanvas">
        ${task.rungs.length
          ? task.rungs.map((rung, i) => renderLadRung(rung, i, task)).join('')
          : `<div class="lad-empty">No rungs yet. Add the first rung to begin the Automation Task.</div>`}
        <button class="lad-add-rung" id="ladAddRungBottom">${icon('plus')}New rung</button>
      </div>

      <aside class="lad-watch">
        <div class="lad-watch-head">
          <span>Tag Watch</span>
          <span class="mono">${taskTags(task).length}</span>
        </div>
        <div class="lad-watch-list">
          ${taskTags(task).map(t => {
            const v = tagCurrentValue(task, t.name);
            const cls = v === true ? 'bool-true' : v === false ? 'bool-false' : '';
            return `<div class="lad-watch-row" data-watch-tag="${esc(t.name)}">
              <span class="lad-watch-name" title="${esc(t.name)}">${esc(t.name)}</span>
              <span class="lad-watch-type">${esc(t.type)}</span>
              <span class="lad-watch-value ${cls}">${v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(2) : String(v))}</span>
            </div>`;
          }).join('') || '<div class="lad-watch-empty">No tags defined.</div>'}
        </div>
      </aside>
    </div>`;
}

function renderLadRung(rung, index, task) {
  const cls = [
    'lad-rung',
    rung.enabled ? '' : 'disabled',
    rung._error ? 'has-error' : '',
    rung._state ? 'energized' : '',
    state.autoActiveRungId === rung.id ? 'active' : '',
  ].filter(Boolean).join(' ');
  return `
    <section class="${cls}" data-rung-id="${esc(rung.id)}">
      <header class="lad-rung-head">
        <button class="lad-rung-num" data-rung-select="${esc(rung.id)}" title="Select rung">${String(index + 1).padStart(2, '0')}</button>
        <input class="lad-rung-comment" data-rung-comment="${esc(rung.id)}"
               value="${esc(rung.comment || '')}" placeholder="Rung comment…" />
        <span class="lad-rung-state mono">${rung.enabled ? (rung._state ? 'TRUE' : 'FALSE') : 'DISABLED'}</span>
        <div class="lad-rung-tools">
          <button class="lad-tool" data-rung-toggle="${esc(rung.id)}" title="${rung.enabled ? 'Disable rung' : 'Enable rung'}">${icon(rung.enabled ? 'toggle-right' : 'toggle-left')}</button>
          <button class="lad-tool" data-rung-up="${esc(rung.id)}" title="Move up">${icon('arrow-up')}</button>
          <button class="lad-tool" data-rung-down="${esc(rung.id)}" title="Move down">${icon('arrow-down')}</button>
          <button class="lad-tool danger" data-rung-delete="${esc(rung.id)}" title="Delete rung">${icon('trash-2')}</button>
        </div>
      </header>
      <div class="lad-rung-body">
        <span class="lad-rail" aria-hidden="true"></span>
        <div class="lad-wire" data-rung-wire="${esc(rung.id)}">
          ${rung.elements.length
            ? rung.elements.map(el => renderLadElement(el, rung, task)).join('')
            : '<span class="lad-wire-empty">Empty rung — add a contact or a coil.</span>'}
          <button class="lad-add-el" data-rung-add="${esc(rung.id)}" title="Add element">${icon('plus')}</button>
        </div>
        <span class="lad-rail" aria-hidden="true"></span>
      </div>
      ${rung._error ? `<div class="lad-rung-error">${icon('alert-triangle')}${esc(rung._error)}</div>` : ''}
    </section>`;
}

function renderLadElement(el, rung, task) {
  const cls = [
    'lad-el',
    `lad-el-${el.type}`,
    el.variant ? `lad-el-var-${el.variant}` : '',
    state.autoSelectedElId === el.id ? 'selected' : '',
    el._state ? 'energized' : 'inactive',
    el._error ? 'error' : '',
  ].filter(Boolean).join(' ');

  let sym = '', label = '', meta = '';
  if (el.type === 'contact') {
    sym = ladContactSym(el.variant === 'nc');
    label = el.tag || '—';
  } else if (el.type === 'coil') {
    sym = ladCoilSym(el.variant);
    label = el.tag || '—';
  } else if (el.type === 'comparator') {
    sym = ladCompareSym(el.op);
    label = `${el.tagA || '?'} ${el.op} ${el.tagB || '?'}`;
  } else if (el.type === 'timer') {
    sym = ladBlockSym(el.variant.toUpperCase(), el.name || 'Timer');
    label = el.name || 'Timer';
    meta = el._rt ? `${(el._rt.elapsed / 1000).toFixed(1)} / ${el.preset}s` : `PT=${el.preset}s`;
  } else if (el.type === 'counter') {
    sym = ladBlockSym(el.variant.toUpperCase(), el.name || 'Counter');
    label = el.name || 'Counter';
    meta = el._rt ? `${el._rt.current} / ${el.preset}` : `PV=${el.preset}`;
  }

  return `
    <div class="${cls}" data-el-id="${esc(el.id)}" tabindex="0" role="button"
         aria-label="${esc(label)}">
      ${sym}
      ${label ? `<span class="lad-taglabel">${esc(label)}</span>` : ''}
      ${meta ? `<span class="lad-el-meta mono">${esc(meta)}</span>` : ''}
    </div>`;
}

/* ===================== Ladder symbols (SVG) ======================= */

function ladContactSym(nc) {
  return `<svg class="lad-sym" viewBox="0 0 72 36" aria-hidden="true">
    <line class="w" x1="0" y1="18" x2="22" y2="18"/>
    <line class="w" x1="50" y1="18" x2="72" y2="18"/>
    <line class="b" x1="22" y1="6" x2="22" y2="30"/>
    <line class="b" x1="50" y1="6" x2="50" y2="30"/>
    ${nc ? `<line class="s" x1="17" y1="31" x2="55" y2="5"/>` : ''}
  </svg>`;
}

function ladCoilSym(variant) {
  const lbl = variant === 'set' ? 'S' : variant === 'reset' ? 'R' : '';
  return `<svg class="lad-sym" viewBox="0 0 72 36" aria-hidden="true">
    <line class="w" x1="0" y1="18" x2="22" y2="18"/>
    <line class="w" x1="50" y1="18" x2="72" y2="18"/>
    <path class="b" d="M22 6 Q13 18 22 30" fill="none"/>
    <path class="b" d="M50 6 Q59 18 50 30" fill="none"/>
    ${lbl ? `<text class="t" x="36" y="22" text-anchor="middle">${lbl}</text>` : ''}
  </svg>`;
}

function ladCompareSym(op) {
  return `<svg class="lad-sym lad-sym-block" viewBox="0 0 90 44" aria-hidden="true">
    <line class="w" x1="0" y1="22" x2="8" y2="22"/>
    <rect class="r" x="8" y="6" width="74" height="32" rx="2"/>
    <text class="t-top" x="45" y="27" text-anchor="middle">${esc(op)}</text>
    <line class="w" x1="82" y1="22" x2="90" y2="22"/>
  </svg>`;
}

function ladBlockSym(top, name) {
  return `<svg class="lad-sym lad-sym-block" viewBox="0 0 100 44" aria-hidden="true">
    <line class="w" x1="0" y1="22" x2="8" y2="22"/>
    <rect class="r" x="8" y="4" width="84" height="36" rx="2"/>
    <text class="t-top" x="50" y="18" text-anchor="middle">${esc(top)}</text>
    <text class="t-mid" x="50" y="32" text-anchor="middle">${esc(name)}</text>
    <line class="w" x1="92" y1="22" x2="100" y2="22"/>
  </svg>`;
}

/* ==================== Ladder Editor — wiring ====================== */

function wireLadderEditor(task) {
  $('#ladAddRung')?.addEventListener('click', () => addRung(task));
  $('#ladAddRungBottom')?.addEventListener('click', () => addRung(task));
  $('#ladStartSim')?.addEventListener('click', startAutomationSim);
  $('#ladStopSim')?.addEventListener('click', stopAutomationSim);
  $('#ladResetSim')?.addEventListener('click', resetAutomationSim);

  $$('.lad-palette-item, .lad-palette-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.addEl;
      const variant = btn.dataset.variant;
      const rungId = state.autoActiveRungId || task.rungs.at(-1)?.id;
      if (!rungId) { toast('Create a rung first', { type: 'info' }); return; }
      addElementToRung(task, rungId, type, variant);
    });
  });

  $$('[data-rung-select]').forEach(btn => btn.addEventListener('click', () => {
    state.autoActiveRungId = btn.dataset.rungSelect;
    renderMain();
  }));
  $$('[data-rung-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const rung = task.rungs.find(r => r.id === btn.dataset.rungToggle);
    if (!rung) return;
    rung.enabled = !rung.enabled;
    saveLadderRules();
    audit('automation.rung.toggle', rung.id, rung.enabled ? 'enabled' : 'disabled');
    renderMain();
  }));
  $$('[data-rung-up]').forEach(btn => btn.addEventListener('click', () => moveRung(task, btn.dataset.rungUp, -1)));
  $$('[data-rung-down]').forEach(btn => btn.addEventListener('click', () => moveRung(task, btn.dataset.rungDown, +1)));
  $$('[data-rung-delete]').forEach(btn => btn.addEventListener('click', async () => {
    const rung = task.rungs.find(r => r.id === btn.dataset.rungDelete);
    if (!rung) return;
    const ok = await confirmModal({
      title: 'Delete rung?',
      message: `Rung ${task.rungs.indexOf(rung) + 1} and its ${rung.elements.length} element(s) will be removed.`,
      confirmText: 'Delete', danger: true,
    });
    if (!ok) return;
    task.rungs.splice(task.rungs.indexOf(rung), 1);
    saveLadderRules();
    audit('automation.rung.delete', rung.id);
    renderMain();
  }));
  $$('[data-rung-add]').forEach(btn => btn.addEventListener('click', () => {
    state.autoActiveRungId = btn.dataset.rungAdd;
    openElementTypePicker(task, btn.dataset.rungAdd);
  }));
  $$('[data-rung-comment]').forEach(inp => inp.addEventListener('change', () => {
    const rung = task.rungs.find(r => r.id === inp.dataset.rungComment);
    if (!rung) return;
    rung.comment = inp.value;
    saveLadderRules();
  }));
  $$('.lad-el').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      state.autoSelectedElId = el.dataset.elId;
      const rung = task.rungs.find(r => r.elements.some(x => x.id === el.dataset.elId));
      if (rung) state.autoActiveRungId = rung.id;
      openElementEditor(task, rung?.id, el.dataset.elId);
    });
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      state.autoSelectedElId = el.dataset.elId;
      openElementContextMenu(task, el.dataset.elId, e.clientX, e.clientY);
    });
  });
}

/* ==================== Rung and element operations ================== */

function addRung(task) {
  const rung = {
    id: uid(),
    number: task.rungs.length + 1,
    comment: '',
    enabled: true,
    elements: [],
  };
  task.rungs.push(rung);
  state.autoActiveRungId = rung.id;
  saveLadderRules();
  audit('automation.rung.create', task.id, `rung ${rung.number}`);
  renderMain();
}

function moveRung(task, rungId, delta) {
  const i = task.rungs.findIndex(r => r.id === rungId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= task.rungs.length) return;
  const [r] = task.rungs.splice(i, 1);
  task.rungs.splice(j, 0, r);
  saveLadderRules();
  renderMain();
}

function defaultElement(type, variant, task) {
  const boolTag = taskTags(task).find(t => t.type === 'BOOL')?.name || '';
  const numTag = taskTags(task).find(t => t.type !== 'BOOL')?.name || '';
  const base = { id: uid(), type, variant };
  if (type === 'contact') return { ...base, tag: boolTag };
  if (type === 'coil') return { ...base, tag: boolTag };
  if (type === 'comparator') return { ...base, op: variant, tagA: numTag, tagB: '0' };
  if (type === 'timer') return { ...base, name: `T_${(task.tags?.length || 0) + 1}`, preset: 5, unit: 's' };
  if (type === 'counter') return { ...base, name: `C_${(task.tags?.length || 0) + 1}`, preset: 10, resetTag: '' };
  return base;
}

function addElementToRung(task, rungId, type, variant) {
  const rung = task.rungs.find(r => r.id === rungId);
  if (!rung) return;
  const el = defaultElement(type, variant, task);
  const coilIdx = rung.elements.findIndex(e => e.type === 'coil');
  if (coilIdx >= 0 && type !== 'coil') rung.elements.splice(coilIdx, 0, el);
  else rung.elements.push(el);
  state.autoSelectedElId = el.id;
  saveLadderRules();
  audit('automation.el.add', `${rungId}/${el.id}`, `${type}:${variant}`);
  renderMain();
  openElementEditor(task, rungId, el.id);
}

function openElementTypePicker(task, rungId) {
  const rows = [
    ['contact', 'no', 'Normally Open Contact'],
    ['contact', 'nc', 'Normally Closed Contact'],
    ['coil', 'normal', 'Coil'],
    ['coil', 'set', 'Set Coil'],
    ['coil', 'reset', 'Reset Coil'],
    ['comparator', '>', 'Comparator'],
    ['timer', 'ton', 'TON — On-delay Timer'],
    ['timer', 'tof', 'TOF — Off-delay Timer'],
    ['timer', 'tp', 'TP — Pulse Timer'],
    ['counter', 'ctu', 'CTU — Count Up'],
    ['counter', 'ctd', 'CTD — Count Down'],
    ['counter', 'ctud', 'CTUD — Count Up/Down'],
  ];
  const btnStyle = 'display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);background:var(--surface);border-radius:6px;cursor:pointer;text-align:left;width:100%;';
  openSheet({
    title: 'Insert element',
    bodyHtml: `<div style="display:grid;gap:6px;">
      ${rows.map(([t, v, l]) => `<button style="${btnStyle}" data-insert-type="${t}" data-insert-variant="${v}">${icon('plus')}<span>${l}</span></button>`).join('')}
    </div>`,
    onMount: (wrap, close) => {
      wrap.querySelectorAll('[data-insert-type]').forEach(b => b.addEventListener('click', () => {
        close();
        addElementToRung(task, rungId, b.dataset.insertType, b.dataset.insertVariant);
      }));
    },
  });
}

function openElementContextMenu(task, elId, x, y) {
  const rung = task.rungs.find(r => r.elements.some(e => e.id === elId));
  if (!rung) return;
  const idx = rung.elements.findIndex(e => e.id === elId);
  const root = document.createElement('div');
  root.className = 'lad-ctx';
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  root.innerHTML = `
    <button data-ctx="edit">${icon('pencil')}Edit</button>
    <button data-ctx="duplicate">${icon('copy')}Duplicate</button>
    <button data-ctx="left" ${idx === 0 ? 'disabled' : ''}>${icon('arrow-left')}Move left</button>
    <button data-ctx="right" ${idx === rung.elements.length - 1 ? 'disabled' : ''}>${icon('arrow-right')}Move right</button>
    <button data-ctx="delete" class="danger">${icon('trash-2')}Delete</button>`;
  document.body.appendChild(root);
  const kill = () => root.remove();
  setTimeout(() => document.addEventListener('click', kill, { once: true }), 0);
  root.querySelector('[data-ctx="edit"]').addEventListener('click', () => { kill(); openElementEditor(task, rung.id, elId); });
  root.querySelector('[data-ctx="duplicate"]').addEventListener('click', () => {
    kill();
    const el = rung.elements[idx];
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = uid(); copy._rt = null;
    rung.elements.splice(idx + 1, 0, copy);
    saveLadderRules(); renderMain();
  });
  root.querySelector('[data-ctx="left"]').addEventListener('click', () => {
    kill();
    if (idx === 0) return;
    const [e] = rung.elements.splice(idx, 1);
    rung.elements.splice(idx - 1, 0, e);
    saveLadderRules(); renderMain();
  });
  root.querySelector('[data-ctx="right"]').addEventListener('click', () => {
    kill();
    if (idx >= rung.elements.length - 1) return;
    const [e] = rung.elements.splice(idx, 1);
    rung.elements.splice(idx + 1, 0, e);
    saveLadderRules(); renderMain();
  });
  root.querySelector('[data-ctx="delete"]').addEventListener('click', () => {
    kill();
    rung.elements.splice(idx, 1);
    saveLadderRules(); renderMain();
  });
}

/* ======================= Element editor modal ===================== */

function openElementEditor(task, rungId, elId) {
  const rung = task.rungs.find(r => r.id === rungId);
  if (!rung) return;
  const el = rung.elements.find(e => e.id === elId);
  if (!el) return;

  let bodyHtml = '';
  if (el.type === 'contact' || el.type === 'coil') {
    const boolTags = taskTags(task).filter(t => t.type === 'BOOL');
    bodyHtml = `
      <div class="m-row"><label class="field-label">Tag (BOOL)</label>
        <select id="elTag">${boolTags.map(t => `<option value="${esc(t.name)}" ${t.name === el.tag ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      </div>
      ${el.type === 'coil' ? `<div class="m-row"><label class="field-label">Coil type</label>
        <select id="elVariant">
          <option value="normal" ${el.variant === 'normal' ? 'selected' : ''}>Coil — write state</option>
          <option value="set" ${el.variant === 'set' ? 'selected' : ''}>Set Coil — latch true</option>
          <option value="reset" ${el.variant === 'reset' ? 'selected' : ''}>Reset Coil — latch false</option>
        </select></div>` : `<div class="m-row"><label class="field-label">Contact type</label>
        <select id="elVariant">
          <option value="no" ${el.variant === 'no' ? 'selected' : ''}>Normally Open</option>
          <option value="nc" ${el.variant === 'nc' ? 'selected' : ''}>Normally Closed</option>
        </select></div>`}`;
  } else if (el.type === 'comparator') {
    const numTags = taskTags(task).filter(t => t.type !== 'BOOL');
    bodyHtml = `
      <div class="m-row"><label class="field-label">Operator</label>
        <select id="elOp">${COMPARATOR_OPS.map(o => `<option value="${o}" ${o === el.op ? 'selected' : ''}>${o}</option>`).join('')}</select>
      </div>
      <div class="m-row"><label class="field-label">Left operand</label>
        <select id="elA">${numTags.map(t => `<option value="${esc(t.name)}" ${t.name === el.tagA ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      </div>
      <div class="m-row"><label class="field-label">Right operand (tag name or number)</label>
        <input type="text" id="elB" value="${esc(el.tagB ?? '')}" placeholder="20.0 or Tank_Level">
      </div>`;
  } else if (el.type === 'timer') {
    bodyHtml = `
      <div class="m-row"><label class="field-label">Timer type</label>
        <select id="elVariant">
          <option value="ton" ${el.variant === 'ton' ? 'selected' : ''}>TON — On-delay</option>
          <option value="tof" ${el.variant === 'tof' ? 'selected' : ''}>TOF — Off-delay</option>
          <option value="tp"  ${el.variant === 'tp'  ? 'selected' : ''}>TP — Pulse</option>
        </select></div>
      <div class="m-row"><label class="field-label">Timer name</label>
        <input type="text" id="elName" value="${esc(el.name || '')}" placeholder="T_PumpStart"></div>
      <div class="m-row"><label class="field-label">Preset time (PT, seconds)</label>
        <input type="number" min="0" step="0.1" id="elPreset" value="${esc(String(el.preset ?? 5))}"></div>`;
  } else if (el.type === 'counter') {
    const boolTags = taskTags(task).filter(t => t.type === 'BOOL');
    bodyHtml = `
      <div class="m-row"><label class="field-label">Counter type</label>
        <select id="elVariant">
          <option value="ctu"  ${el.variant === 'ctu'  ? 'selected' : ''}>CTU — Count Up</option>
          <option value="ctd"  ${el.variant === 'ctd'  ? 'selected' : ''}>CTD — Count Down</option>
          <option value="ctud" ${el.variant === 'ctud' ? 'selected' : ''}>CTUD — Count Up/Down</option>
        </select></div>
      <div class="m-row"><label class="field-label">Counter name</label>
        <input type="text" id="elName" value="${esc(el.name || '')}" placeholder="C_Cycles"></div>
      <div class="m-row"><label class="field-label">Preset value (PV)</label>
        <input type="number" min="0" step="1" id="elPreset" value="${esc(String(el.preset ?? 10))}"></div>
      <div class="m-row"><label class="field-label">Reset tag (BOOL, optional)</label>
        <select id="elReset"><option value="">— none —</option>${boolTags.map(t => `<option value="${esc(t.name)}" ${t.name === el.resetTag ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>`;
  }

  openSheet({
    title: `Edit element — ${el.type.charAt(0).toUpperCase() + el.type.slice(1)}`,
    bodyHtml: `${bodyHtml}
      <div class="btn-row">
        <button class="btn danger" id="elDelete">${icon('trash-2')}Delete</button>
        <button class="btn" id="elCancel">Cancel</button>
        <button class="btn primary" id="elSave">${icon('save')}Apply</button>
      </div>`,
    onMount: (wrap, close) => {
      wrap.querySelector('#elCancel').addEventListener('click', () => close());
      wrap.querySelector('#elSave').addEventListener('click', () => {
        const v = id => wrap.querySelector(id)?.value;
        if (el.type === 'contact' || el.type === 'coil') {
          el.tag = v('#elTag');
          el.variant = v('#elVariant');
        } else if (el.type === 'comparator') {
          el.op = v('#elOp');
          el.tagA = v('#elA');
          el.tagB = v('#elB');
        } else if (el.type === 'timer') {
          el.variant = v('#elVariant');
          el.name = v('#elName');
          el.preset = Number(v('#elPreset')) || 0;
          el._rt = null;
        } else if (el.type === 'counter') {
          el.variant = v('#elVariant');
          el.name = v('#elName');
          el.preset = Number(v('#elPreset')) || 0;
          el.resetTag = v('#elReset');
          el._rt = null;
        }
        saveLadderRules();
        audit('automation.el.edit', el.id, el.type);
        close();
        renderMain();
      });
      wrap.querySelector('#elDelete').addEventListener('click', async () => {
        close();
        const ok = await confirmModal({
          title: 'Delete element?', message: 'This element will be removed from the rung.',
          confirmText: 'Delete', danger: true,
        });
        if (!ok) return;
        rung.elements.splice(rung.elements.indexOf(el), 1);
        saveLadderRules();
        renderMain();
      });
    },
  });
}

/* ========================= Task editor modal ====================== */

function openTaskEditor(taskId = null) {
  const task = taskId ? LADDER_RULES.find(t => t.id === taskId) : null;
  const isNew = !task;
  openSheet({
    title: isNew ? 'New Automation Task' : 'Automation Task Information',
    bodyHtml: `
      <div class="m-row"><label class="field-label">Task name</label>
        <input type="text" id="taskName" value="${esc(task?.name || '')}" placeholder="Pump Control"></div>
      <div class="m-row"><label class="field-label">Description</label>
        <textarea id="taskDesc" rows="3" placeholder="What this Automation Task does…">${esc(task?.description || '')}</textarea></div>
      <div class="m-row"><label class="checkrow"><input type="checkbox" id="taskEnabled" ${task?.enabled === false ? '' : 'checked'}> Task enabled</label></div>
      <div class="btn-row">
        ${!isNew ? `<button class="btn danger" id="taskDelete">${icon('trash-2')}Delete</button>` : ''}
        <button class="btn" id="taskCancel">Cancel</button>
        <button class="btn primary" id="taskSave">${icon('save')}${isNew ? 'Create' : 'Save'}</button>
      </div>`,
    onMount: (wrap, close) => {
      wrap.querySelector('#taskCancel').addEventListener('click', () => close());
      wrap.querySelector('#taskSave').addEventListener('click', () => {
        const name = wrap.querySelector('#taskName').value.trim();
        if (!name) { toast('Task name required', { type: 'error' }); return; }
        const payload = {
          name,
          description: wrap.querySelector('#taskDesc').value.trim(),
          enabled: wrap.querySelector('#taskEnabled').checked,
        };
        if (isNew) {
          const newTask = {
            id: uid(),
            author: state.user?.username || 'system',
            created_at: Date.now(),
            tags: [],
            rungs: [],
            ...payload,
          };
          LADDER_RULES.push(newTask);
          state.autoTaskId = newTask.id;
          lsSet('electrix_auto_task', newTask.id);
          audit('automation.task.create', newTask.id, name);
          toast('Automation Task created', { msg: name, type: 'ok' });
        } else {
          Object.assign(task, payload);
          audit('automation.task.edit', task.id, name);
          toast('Automation Task updated', { msg: name, type: 'ok' });
        }
        saveLadderRules();
        close();
        renderMain();
      });
      wrap.querySelector('#taskDelete')?.addEventListener('click', async () => {
        close();
        const ok = await confirmModal({
          title: 'Delete Automation Task?',
          message: `"${task.name}" and all of its rungs and tags will be removed.`,
          confirmText: 'Delete', danger: true,
        });
        if (!ok) return;
        LADDER_RULES.splice(LADDER_RULES.indexOf(task), 1);
        state.autoTaskId = LADDER_RULES[0]?.id || null;
        lsSet('electrix_auto_task', state.autoTaskId);
        audit('automation.task.delete', task.id);
        saveLadderRules();
        renderMain();
      });
    },
  });
}

/* ========================== Tags panel ============================ */

function renderTagPanel(task) {
  const tags = taskTags(task);
  return `
    <div class="auto-tags">
      <div class="auto-tags-head">
        <div>
          <h2>Variables / Tags</h2>
          <p>Each element references a tag bound to a device capability, telemetry signal, or virtual value.</p>
        </div>
        <div class="auto-tags-actions">
          <button class="btn" id="tagAutoPopulate">${icon('wand-2')}Auto-populate from devices</button>
          <button class="btn primary" id="tagAdd">${icon('plus')}Add Tag</button>
        </div>
      </div>
      <div class="auto-tag-table-wrap">
        <table class="auto-tag-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Binding</th><th>Current value</th><th></th></tr>
          </thead>
          <tbody>
            ${tags.length ? tags.map(t => {
              const v = tagCurrentValue(task, t.name);
              const bindLabel = t.bind === 'device'
                ? `${deviceById(t.device_id)?.name || t.device_id} · ${t.capability}`
                : t.bind === 'telemetry'
                  ? t.telemetry_key
                  : 'virtual';
              return `<tr>
                <td><span class="mono">${esc(t.name)}</span></td>
                <td><span class="auto-tag-type">${esc(t.type)}</span></td>
                <td class="auto-tag-bind">${esc(bindLabel)}</td>
                <td class="mono">${v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(2) : String(v))}</td>
                <td class="auto-tag-row-actions">
                  <button class="lad-tool" data-tag-edit="${esc(t.name)}" title="Edit">${icon('pencil')}</button>
                  <button class="lad-tool danger" data-tag-delete="${esc(t.name)}" title="Delete">${icon('trash-2')}</button>
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="5" class="empty">No tags yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function wireTagPanel(task) {
  $('#tagAdd')?.addEventListener('click', () => openTagEditor(task));
  $('#tagAutoPopulate')?.addEventListener('click', () => autoPopulateTags(task));
  $$('[data-tag-edit]').forEach(b => b.addEventListener('click', () => openTagEditor(task, b.dataset.tagEdit)));
  $$('[data-tag-delete]').forEach(b => b.addEventListener('click', async () => {
    const name = b.dataset.tagDelete;
    const ok = await confirmModal({
      title: 'Delete tag?',
      message: `Tag "${name}" and every element referencing it will keep running with an unresolved tag.`,
      confirmText: 'Delete', danger: true,
    });
    if (!ok) return;
    task.tags = taskTags(task).filter(t => t.name !== name);
    saveLadderRules();
    renderMain();
  }));
}

function autoPopulateTags(task) {
  const seen = new Set(taskTags(task).map(t => t.name));
  let added = 0;
  DEVICES.forEach(d => {
    d.capabilities.forEach(c => {
      const name = `${d.name.replace(/[^A-Za-z0-9_]/g, '_')}_${c.id}`;
      if (seen.has(name)) return;
      seen.add(name);
      taskTags(task).push({
        name,
        type: c.kind === 'relay' ? 'BOOL' : 'REAL',
        bind: 'device',
        device_id: d.device_id,
        capability: c.id,
      });
      added++;
    });
  });
  if (added) {
    saveLadderRules();
    toast('Tags added', { msg: `${added} tags from device capabilities`, type: 'ok' });
    renderMain();
  } else toast('No new tags to add', { type: 'info' });
}

function openTagEditor(task, tagName = null) {
  const existing = tagName ? findTag(task, tagName) : null;
  const isNew = !existing;
  const allDevices = DEVICES;
  const telemetryKeys = Object.keys(TELEMETRY);

  openSheet({
    title: isNew ? 'New Tag' : `Edit Tag — ${existing.name}`,
    bodyHtml: `
      <div class="m-row"><label class="field-label">Name</label>
        <input type="text" id="tagNameInp" value="${esc(existing?.name || '')}" placeholder="Motor_Run"></div>
      <div class="m-row"><label class="field-label">Data type</label>
        <select id="tagType">${TAG_TYPES.map(t => `<option value="${t}" ${t === (existing?.type || 'BOOL') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="m-row"><label class="field-label">Binding</label>
        <select id="tagBind">
          <option value="device" ${(existing?.bind || 'device') === 'device' ? 'selected' : ''}>Device capability</option>
          <option value="telemetry" ${existing?.bind === 'telemetry' ? 'selected' : ''}>Telemetry signal</option>
          <option value="virtual" ${existing?.bind === 'virtual' ? 'selected' : ''}>Virtual value</option>
        </select></div>
      <div class="m-row" id="tagBindDeviceRow"><label class="field-label">Device capability</label>
        <select id="tagCap">
          ${allDevices.flatMap(d => d.capabilities.map(c => {
            const val = `${d.device_id}|${c.id}`;
            const cur = existing?.device_id === d.device_id && existing?.capability === c.id ? 'selected' : '';
            return `<option value="${val}" ${cur}>${esc(d.name)} · ${esc(c.label)} (${c.kind})</option>`;
          })).join('')}
        </select></div>
      <div class="m-row" id="tagBindTelemetryRow"><label class="field-label">Telemetry signal</label>
        <select id="tagTele">
          ${telemetryKeys.map(k => `<option value="${esc(k)}" ${existing?.telemetry_key === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}
        </select></div>
      <div class="m-row" id="tagVirtualRow"><label class="field-label">Virtual value</label>
        <input type="text" id="tagVirtual" value="${esc(String(existing?.value ?? 0))}"></div>
      <div class="btn-row">
        <button class="btn" id="tagCancel">Cancel</button>
        <button class="btn primary" id="tagSave">${icon('save')}${isNew ? 'Create' : 'Save'}</button>
      </div>`,
    onMount: (wrap, close) => {
      const sync = () => {
        const bind = wrap.querySelector('#tagBind').value;
        wrap.querySelector('#tagBindDeviceRow').style.display = bind === 'device' ? '' : 'none';
        wrap.querySelector('#tagBindTelemetryRow').style.display = bind === 'telemetry' ? '' : 'none';
        wrap.querySelector('#tagVirtualRow').style.display = bind === 'virtual' ? '' : 'none';
      };
      wrap.querySelector('#tagBind').addEventListener('change', sync);
      sync();
      wrap.querySelector('#tagCancel').addEventListener('click', () => close());
      wrap.querySelector('#tagSave').addEventListener('click', () => {
        const name = wrap.querySelector('#tagNameInp').value.trim();
        if (!name) { toast('Tag name required', { type: 'error' }); return; }
        const dup = taskTags(task).find(t => t.name === name && t !== existing);
        if (dup) { toast('Duplicate tag name', { type: 'error' }); return; }
        const bind = wrap.querySelector('#tagBind').value;
        const payload = {
          name,
          type: wrap.querySelector('#tagType').value,
          bind,
        };
        if (bind === 'device') {
          const [dev, cap] = wrap.querySelector('#tagCap').value.split('|');
          payload.device_id = dev;
          payload.capability = cap;
        } else if (bind === 'telemetry') {
          payload.telemetry_key = wrap.querySelector('#tagTele').value;
        } else {
          const raw = wrap.querySelector('#tagVirtual').value;
          payload.value = payload.type === 'BOOL' ? raw === 'true' : Number(raw) || 0;
        }
        if (existing) {
          const i = taskTags(task).indexOf(existing);
          taskTags(task)[i] = { ...existing, ...payload };
        } else {
          taskTags(task).push(payload);
        }
        saveLadderRules();
        audit('automation.tag.save', name, payload.type);
        close();
        renderMain();
      });
    },
  });
}

/* ======================== Diagnostics panel ====================== */

function diagnoseTask(task) {
  const issues = [];
  const seen = new Map();
  taskTags(task).forEach(t => {
    if (seen.has(t.name)) {
      issues.push({ severity: 'error', code: 'DUP_TAG', msg: `Duplicate tag name "${t.name}"`, target: t.name });
    }
    seen.set(t.name, t);
  });
  task.rungs.forEach((rung, i) => {
    if (!rung.elements.length) {
      issues.push({ severity: 'warning', code: 'EMPTY_RUNG', msg: `Rung ${i + 1} is empty`, target: rung.id });
      return;
    }
    if (!rung.elements.some(e => e.type === 'coil')) {
      issues.push({ severity: 'warning', code: 'NO_COIL', msg: `Rung ${i + 1} has no output coil`, target: rung.id });
    }
    rung.elements.forEach(el => {
      if (el.type === 'contact' || el.type === 'coil') {
        const t = findTag(task, el.tag);
        if (!t) issues.push({ severity: 'error', code: 'MISSING_TAG', msg: `Rung ${i + 1}: tag "${el.tag || '—'}" is not defined`, target: el.id });
        else if (t.type !== 'BOOL') issues.push({ severity: 'error', code: 'BAD_TYPE', msg: `Rung ${i + 1}: ${el.type} "${el.tag}" must be BOOL`, target: el.id });
      }
      if (el.type === 'comparator') {
        [el.tagA, el.tagB].forEach((ref, side) => {
          if (!ref) return;
          const isLiteral = /^-?\d+(\.\d+)?$/.test(String(ref));
          if (isLiteral) return;
          const t = findTag(task, ref);
          if (!t) issues.push({ severity: 'error', code: 'MISSING_TAG', msg: `Rung ${i + 1}: comparator ${side === 0 ? 'left' : 'right'} operand "${ref}" is not defined`, target: el.id });
          else if (t.type === 'BOOL') issues.push({ severity: 'warning', code: 'BAD_TYPE', msg: `Rung ${i + 1}: comparator references BOOL tag "${ref}"`, target: el.id });
        });
      }
      if (el.type === 'timer') {
        if (!(Number(el.preset) > 0)) issues.push({ severity: 'error', code: 'BAD_TIMER', msg: `Rung ${i + 1}: timer "${el.name}" must have PT > 0`, target: el.id });
        if (!el.name) issues.push({ severity: 'warning', code: 'BAD_TIMER', msg: `Rung ${i + 1}: timer has no name`, target: el.id });
      }
      if (el.type === 'counter') {
        if (!(Number(el.preset) >= 0)) issues.push({ severity: 'error', code: 'BAD_COUNTER', msg: `Rung ${i + 1}: counter "${el.name}" preset is invalid`, target: el.id });
      }
    });
  });
  return issues;
}

function renderDiagnosticsPanel(task) {
  const issues = diagnoseTask(task);
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const severityLabel = { error: 'Error', warning: 'Warning', info: 'Info' };
  const row = i => `<div class="auto-diag-row sev-${i.severity}">
      <span class="auto-diag-sev">${severityLabel[i.severity]}</span>
      <span class="auto-diag-code mono">${esc(i.code)}</span>
      <span class="auto-diag-msg">${esc(i.msg)}</span>
    </div>`;
  return `
    <div class="auto-diag">
      <div class="auto-diag-head">
        <div>
          <h2>Diagnostics</h2>
          <p>Automated checks of the current Automation Task.</p>
        </div>
        <div class="auto-diag-summary">
          <span class="diag-pill error">${errors.length} errors</span>
          <span class="diag-pill warning">${warnings.length} warnings</span>
        </div>
      </div>
      <section class="auto-diag-section">
        <h3>Errors</h3>
        ${errors.length ? errors.map(row).join('') : '<div class="empty">No errors detected.</div>'}
      </section>
      <section class="auto-diag-section">
        <h3>Warnings</h3>
        ${warnings.length ? warnings.map(row).join('') : '<div class="empty">No warnings detected.</div>'}
      </section>
    </div>`;
}

/* ======================= Device automation view =================== */

function ladderRuleUsesDevice(rule, deviceId) {
  return (rule.tags || []).some(t => t.device_id === deviceId) ||
    (rule.rungs || []).some(rung => rung.elements.some(el => {
      if (el.device_id === deviceId) return true;
      const tag = findTag(rule, el.tag) || findTag(rule, el.tagA) || findTag(rule, el.tagB);
      return tag?.device_id === deviceId;
    }));
}

function renderDeviceAutomation(d) {
  const tasks = LADDER_RULES.filter(t => ladderRuleUsesDevice(t, d.device_id));
  const scenes = SCENES.filter(s => s.actions.some(a => a.device_id === d.device_id));
  return `<div class="device-automation">
    <div class="panel ladder-device-panel">
      <div class="panel-head"><h4>${icon('git-branch')}Automation Tasks · ${esc(d.name)}</h4>
        <button class="btn sm" data-nav="#/automation">Open Ladder Editor</button></div>
      <p class="device-automation-help">Each Automation Task references this device through its tags.</p>
      ${tasks.length
        ? tasks.map(t => `<div class="device-auto-row">
            <span class="status-dot ${t.enabled ? 'online' : 'offline'}"></span>
            <div><strong>${esc(t.name)}</strong>
              <small>Automation Task · ${t.rungs.length} rung${t.rungs.length === 1 ? '' : 's'} · ${taskTags(t).length} tag${taskTags(t).length === 1 ? '' : 's'}</small></div>
          </div>`).join('')
        : '<div class="empty">No Automation Tasks reference this device.</div>'}
    </div>
    <div class="panel">
      <div class="panel-head"><h4>${icon('wand-2')}Scenes</h4><button class="btn sm" data-nav="#/automation">Manage automation</button></div>
      ${scenes.length
        ? scenes.map(s => `<div class="device-auto-row">
            <span class="status-dot ${s.enabled ? 'online' : 'offline'}"></span>
            <div><strong>${esc(s.name)}</strong><small>Scene · ${s.actions.length} action${s.actions.length === 1 ? '' : 's'}</small></div>
          </div>`).join('')
        : '<div class="empty">No scenes include this device.</div>'}
    </div>
  </div>`;
}

/* ==================== Command execution plumbing ================== */

function setCapabilityValue(capability, value) {
  if (!Object.is(capability.value, value)) {
    capability.value = value;
    capability.since = Date.now();
  }
}

async function executeAction(device_id, capability_id, value, source = 'system') {
  const d = deviceById(device_id); if (!d) return { ok: false, reason: 'device not found' };
  const c = d.capabilities.find(x => x.id === capability_id); if (!c) return { ok: false, reason: 'capability not found' };
  const block = isBlocked(device_id, capability_id);
  if (block) return { ok: false, reason: 'automation rule: ' + block.rule.name };
  if (d.lwt !== 'online') return { ok: false, reason: 'device offline' };
  const requestId = uid();
  try {
    await mqtt.publish(`electrix/${device_id}/cmd/${capability_id}/set`, { value, request_id: requestId, source }, { qos: 2 });
    setTimeout(() => { mqtt.inject(`electrix/${device_id}/ack/${requestId}`, { status: 'ok', echoed_value: value }); }, 200);
    await waitForAck(requestId, 4000);
    setCapabilityValue(c, value);
    COMMAND_HISTORY.unshift({ ts: Date.now(), device_id, actuator: capability_id, value, request_id: requestId, status: 'ok', source });
    if (COMMAND_HISTORY.length > 100) COMMAND_HISTORY.pop();
    return { ok: true };
  } catch (e) {
    COMMAND_HISTORY.unshift({ ts: Date.now(), device_id, actuator: capability_id, value, request_id: requestId, status: 'error', source });
    return { ok: false, reason: e.message || 'ack timeout' };
  }
}

/* ============================== Scenes =========================== */

function renderScenes() {
  const canEdit = can('automate');
  return `
    <div class="auto-scenes">
      <div class="auto-scenes-head">
        <div><h2>Scenes</h2><p>Grouped actions across devices, independent of Automation Task logic.</p></div>
        <button class="btn primary" id="newSceneBtn" ${canEdit ? '' : 'disabled'}>${icon('plus')}New Scene</button>
      </div>
      <div>
        ${SCENES.length
          ? SCENES.map(s => {
              const actionLines = s.actions.map(a => {
                const d = deviceById(a.device_id);
                const c = d?.capabilities.find(x => x.id === a.capability);
                return `<div class="scene-action-row">
                  <span class="dot ${a.value ? 'on' : 'off'}"></span>
                  <span class="dev">${esc(d?.name || a.device_id)}</span>
                  <span>· ${esc(c?.label || a.capability)}</span>
                  <span style="margin-left:auto;color:${a.value ? 'var(--ok)' : 'var(--offline)'};">${a.value ? 'on' : 'off'}</span>
                </div>`;
              }).join('');
              return `<div class="auto-card ${s.enabled ? 'enabled' : 'disabled'}">
                <button class="toggle-small ${s.enabled ? 'on' : ''}" data-scene-toggle="${s.id}" aria-pressed="${s.enabled}"></button>
                <div class="ac-body">
                  <div class="ac-name">${sceneIconHTML(s.icon)}${esc(s.name)}</div>
                  <div class="ac-meta">${s.actions.length} action${s.actions.length === 1 ? '' : 's'}</div>
                  <div class="scene-actions-list">${actionLines || '<div style="font-size:11.5px;color:var(--content-faint);">No actions.</div>'}</div>
                </div>
                <div class="ac-actions">
                  <button class="btn sm primary" data-scene-run="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('play')}Run</button>
                  <button class="btn sm" data-scene-edit="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('pencil')}Edit</button>
                  <button class="btn sm danger" data-scene-delete="${s.id}" ${canEdit ? '' : 'disabled'}>${icon('trash-2')}</button>
                </div>
              </div>`;
            }).join('')
          : '<div class="empty">No scenes yet.</div>'}
      </div>
    </div>`;
}

// Scene wiring (kept from existing implementation, unchanged behavior)
document.addEventListener('click', e => {
  if (state.view !== 'automation' || state.autoTab !== 'scenes') return;
  const run = e.target.closest('[data-scene-run]');
  if (run) { const s = SCENES.find(x => x.id === run.dataset.sceneRun); if (s) runScene(s); return; }
  const edit = e.target.closest('[data-scene-edit]');
  if (edit) { openSceneEditor(edit.dataset.sceneEdit); return; }
  const del = e.target.closest('[data-scene-delete]');
  if (del) {
    (async () => {
      const s = SCENES.find(x => x.id === del.dataset.sceneDelete); if (!s) return;
      const ok = await confirmModal({ title: 'Delete scene?', message: `"${s.name}" will be removed.`, confirmText: 'Delete', danger: true });
      if (!ok) return;
      SCENES.splice(SCENES.indexOf(s), 1); saveScenes();
      audit('scene.delete', s.id); toast('Scene deleted', { type: 'info' });
      renderMain();
    })();
    return;
  }
  const tog = e.target.closest('[data-scene-toggle]');
  if (tog) {
    const s = SCENES.find(x => x.id === tog.dataset.sceneToggle); if (!s) return;
    s.enabled = !s.enabled; saveScenes();
    audit('scene.toggle', s.id, s.enabled ? 'enabled' : 'disabled');
    renderMain();
    return;
  }
  if (e.target.closest('#newSceneBtn')) { openSceneEditor(); return; }
});

async function runScene(s) {
  if (!s.enabled) { toast('Scene disabled', { msg: s.name, type: 'warn' }); return; }
  if (!can('automate')) { toast('Permission denied', { type: 'error' }); return; }
  let ok = 0, fail = 0;
  for (const a of s.actions) {
    const r = await executeAction(a.device_id, a.capability, a.value, 'scene');
    if (r.ok) ok++; else fail++;
  }
  audit('scene.run', s.id, `${ok} ok, ${fail} failed`);
  ACTIVITY.unshift({ t: 0, text: `${state.user.username} ran scene "${s.name}"` });
  toast('Scene ran', { msg: `${s.name} — ${ok} applied${fail ? `, ${fail} blocked` : ''}`, type: fail ? 'warn' : 'ok' });
  renderMain();
}

function openSceneEditor(sceneId = null) {
  const s = sceneId ? SCENES.find(x => x.id === sceneId) : null;
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <h3>${s ? 'Edit scene' : 'New scene'}</h3>
    <div class="m-row"><label class="field-label">Name</label><input type="text" id="scnName" value="${esc(s?.name || '')}" placeholder="Evening mode"></div>
    <div class="m-row"><label class="field-label">Icon</label>
      <div class="icon-picker" id="scnIcons">
        ${SCENE_ICONS.map(ic => `<button type="button" class="${(s?.icon || 'sparkles') === ic ? 'sel' : ''}" data-icon="${ic}" title="${ic}">${icon(ic)}</button>`).join('')}
      </div>
    </div>
    <div class="m-row"><label class="field-label">Actions</label>
      <div id="scnActions" style="display:grid;gap:8px;"></div>
      <button class="btn sm" id="scnAddAction" style="margin-top:8px;">${icon('plus')}Add action</button>
    </div>
    <div class="btn-row">
      <button class="btn" data-act="cancel">Cancel</button>
      <button class="btn primary" data-act="ok">Save</button>
    </div>
  </div>`;
  root.appendChild(wrap);
  refreshIcons(wrap);
  let selectedIcon = s?.icon || 'sparkles';
  if (/[^\x00-\x7F]/.test(selectedIcon)) selectedIcon = 'sparkles';
  wrap.querySelectorAll('[data-icon]').forEach(b => b.addEventListener('click', () => {
    selectedIcon = b.dataset.icon;
    wrap.querySelectorAll('[data-icon]').forEach(x => x.classList.toggle('sel', x === b));
  }));
  const allCaps = [];
  DEVICES.forEach(d => d.capabilities.forEach(c => { if (c.kind === 'relay') allCaps.push({ d, c }); }));
  let actions = (s?.actions || []).map(a => ({ ...a }));
  function renderActions() {
    const list = wrap.querySelector('#scnActions');
    if (!actions.length) { list.innerHTML = '<div style="font-size:12px;color:var(--content-faint);padding:6px;">No actions yet.</div>'; return; }
    list.innerHTML = actions.map((a, i) => `
      <div style="display:flex;gap:6px;align-items:center;">
        <select data-action-dev="${i}" style="flex:2;">
          ${allCaps.map(({ d, c }) => `<option value="${d.device_id}|${c.id}" ${d.device_id === a.device_id && c.id === a.capability ? 'selected' : ''}>${esc(d.name)} · ${esc(c.label)}</option>`).join('')}
        </select>
        <select data-action-val="${i}" style="flex:1;">
          <option value="true" ${a.value === true ? 'selected' : ''}>ON</option>
          <option value="false" ${a.value === false ? 'selected' : ''}>OFF</option>
        </select>
        <button class="btn sm danger" data-action-del="${i}" type="button">${icon('x')}</button>
      </div>
    `).join('');
    refreshIcons(list);
    list.querySelectorAll('[data-action-dev]').forEach(el => el.addEventListener('change', () => {
      const [dev, cap] = el.value.split('|');
      actions[+el.dataset.actionDev].device_id = dev;
      actions[+el.dataset.actionDev].capability = cap;
    }));
    list.querySelectorAll('[data-action-val]').forEach(el => el.addEventListener('change', () => {
      actions[+el.dataset.actionVal].value = el.value === 'true';
    }));
    list.querySelectorAll('[data-action-del]').forEach(el => el.addEventListener('click', () => {
      actions.splice(+el.dataset.actionDel, 1); renderActions();
    }));
  }
  renderActions();
  wrap.querySelector('#scnAddAction').addEventListener('click', () => {
    if (!allCaps.length) { toast('No relays available', { type: 'error' }); return; }
    actions.push({ device_id: allCaps[0].d.device_id, capability: allCaps[0].c.id, value: true });
    renderActions();
  });
  const close = val => { wrap.remove(); return val; };
  wrap.querySelector('[data-act="cancel"]').onclick = () => close(null);
  wrap.querySelector('[data-act="ok"]').onclick = () => {
    const name = wrap.querySelector('#scnName').value.trim();
    if (!name) { toast('Name required', { type: 'error' }); return; }
    if (!actions.length) { toast('Add at least one action', { type: 'error' }); return; }
    const payload = { name, icon: selectedIcon, actions: actions.slice(), enabled: s?.enabled ?? true };
    if (s) { Object.assign(s, payload); audit('scene.edit', s.id, name); }
    else { SCENES.push({ id: uid(), ...payload }); audit('scene.create', name); }
    saveScenes();
    toast(s ? 'Scene updated' : 'Scene created', { msg: name, type: 'ok' });
    close(true); renderMain();
  };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(null); });
}