'use strict';

// ---------------------------------------------------------------------
// Static configuration — real, not demo.
// ---------------------------------------------------------------------

const ROLE_LABEL = { admin: 'Admin', operator: 'Operator', viewer: 'Viewer' };

// Sites start empty. The user creates them in the onboarding modal or in
// Settings. The backend adapter hydrates this array from GET /sites on
// every page load. SITES must be `let` (not `const`) because the adapter
// reassigns nothing but the array is mutated in place — either works, but
// `let` matches DEVICES for consistency.
let SITES = lsGet('electrix_sites', []);

// ---------------------------------------------------------------------
// Runtime data — populated by the backend adapter (mqtt-simulator.js).
// All of these start empty. The adapter mutates them in place; nothing
// else populates them.
// ---------------------------------------------------------------------

const DEVICES        = [];
const ALARMS         = [];
const ACTIVITY       = [];
const TELEMETRY      = {};
const LWT_LOG        = [];
const COMMAND_HISTORY = [];

// Automation tasks and scenes: user-created content, persisted in the
// browser until a backend takes over.
let SCHEDULES = lsGet('electrix_schedules', []);
const saveSchedules = () => lsSet('electrix_schedules', SCHEDULES);

let SCENES = lsGet('electrix_scenes', []);
const saveScenes = () => lsSet('electrix_scenes', SCENES);

// ---------------------------------------------------------------------
// Automation Task storage — user-created, persisted.
// ---------------------------------------------------------------------

const AUTOMATION_TASKS_VERSION = 2;

let LADDER_RULES = (() => {
  const stored = lsGet('electrix_automation_tasks', null);
  if (stored && stored.version === AUTOMATION_TASKS_VERSION && Array.isArray(stored.tasks)) {
    return stored.tasks;
  }
  return [];
})();
const saveLadderRules = () => lsSet('electrix_automation_tasks', { version: AUTOMATION_TASKS_VERSION, tasks: LADDER_RULES });

const SCENE_ICONS = ['sparkles', 'moon', 'sun', 'sunset', 'door-closed', 'home', 'building-2', 'lock', 'unlock', 'zap', 'droplet', 'flame'];
const sceneIconHTML = name => {
  if (!name) return icon('sparkles');
  if (/[^\x00-\x7F]/.test(name) && name.length <= 3) return `<span>${esc(name)}</span>`;
  return icon(name);
};

const DEFAULT_LAYOUT = ['fleet_status', 'active_alarms', 'quick_controls', 'recent_activity', 'site_overview'];

// ---------------------------------------------------------------------
// Application state — the single global shared by every feature file.
//
// This MUST be a complete object. Every field referenced anywhere in the
// codebase has to be defined here, even if only to hold a default. A
// missing field is not "undefined" — it's a runtime crash the moment any
// render function touches it.
// ---------------------------------------------------------------------

let state = {
  // ---- auth ----
  user: lsGet('electrix_user', null),
  language: lsGet('electrix_language', 'en'),

  // ---- routing ----
  view: 'dashboard',
  deviceTab: 'overview',
  selectedSite: lsGet('electrix_site', 'all'),
  sortBy: lsGet('electrix_sort', 'site'),
  search: '',

  // ---- ui ----
  devMode: lsGet('electrix_devmode', false),
  sidebarCollapsed: lsGet('electrix_sidebar_collapsed', false),
  drawerDeviceId: null,
  openDeviceId: null,
  widgetLayout: lsGet('electrix_widget_layout', DEFAULT_LAYOUT.slice()),
  widgetReorderMode: false,

  // ---- alarms ----
  alarmFilter: 'active',
  alarmDeviceFilter: null,
  alarmPriorityFilter: 'all',
  alarmTypeFilter: 'all',

  // ---- devices list ----
  favorites: lsGet('electrix_favorites', []),
  bulkMode: false,
  bulkSelected: new Set(),
  deviceView: 'grid',

  // ---- telemetry ----
  teleDevice: 'all',
  teleSensor: 'all',
  teleMode: 'overview',
  deviceTeleMode: 'overview',
  teleFocusKey: null,
  teleWindow: '5m',
  teleSort: lsGet('electrix_tele_sort', 'device'),
  teleRateOfChange: lsGet('electrix_tele_rate_of_change', {}),
  teleSelection: lsGet('electrix_tele_selection', null),
  telePinned: lsGet('electrix_tele_pinned', {}),
  teleCursorTime: null,

  // ---- device detail ----
  deviceReferenceOpen: lsGet('electrix_device_reference_open', {}),
  deviceCommands: {},
  deviceEvents: {},
  deviceDiagnostics: {},

  // ---- automation task editor ----
  autoTaskId: lsGet('electrix_auto_task', null),
  autoTab: 'ladder',
  autoActiveRungId: null,
  autoSelectedElId: null,
  autoClipboard: null,

  // ---- inspector / palette ----
  inspectorOpen: false,
  paletteOpen: false,
  paletteQuery: '',
  paletteSel: 0,
};