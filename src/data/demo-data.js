'use strict';

const USERS = [
  { username:'admin',    password:'admin123',    role:'admin',    display:'Admin' },
  { username:'operator', password:'operator123', role:'operator', display:'Operator' },
  { username:'viewer',   password:'viewer123',   role:'viewer',   display:'Viewer' },
];
const ROLE_LABEL = { admin:'Admin', operator:'Operator', viewer:'Viewer' };
const SITES = [
  { id:'villa-nord',  name:'Villa Nord' },
  { id:'warehouse-b', name:'Warehouse B' },
  { id:'office-hq',   name:'Office HQ' },
];
const DEVICES = [
  { device_id:'f42dc971c624', site_id:'villa-nord', name:'Living Room Controller', device_type:'relay-4ch', hw_rev:'rev-b', fw_version:'1.2.0', mac:'f4:2d:c9:71:c6:24', lwt:'online', last_seen_s:8,
    config:{ sensor_publish_period_ms:1000, heartbeat_period_ms:30000, feature_agg_telemetry_enabled:true, feature_threshold_events_enabled:true },
    capabilities:[
      { id:'relay0', kind:'relay', label:'Ceiling Light', value:true,  online:true },
      { id:'relay1', kind:'relay', label:'Floor Lamp',    value:false, online:true },
      { id:'relay2', kind:'relay', label:'relay2',        value:false, online:true },
      { id:'relay3', kind:'relay', label:'Garden Pump',   value:true,  online:true },
    ]},
  { device_id:'a13bd220e901', site_id:'villa-nord', name:'Garage Controller', device_type:'relay-2ch', hw_rev:'rev-a', fw_version:'1.1.4', mac:'a1:3b:d2:20:e9:01', lwt:'offline', last_seen_s:7380,
    config:{ sensor_publish_period_ms:1000, heartbeat_period_ms:30000, feature_agg_telemetry_enabled:false, feature_threshold_events_enabled:false },
    capabilities:[
      { id:'relay0', kind:'relay', label:'Garage Door', value:false, online:false },
      { id:'relay1', kind:'relay', label:'relay1',      value:false, online:false },
    ]},
  { device_id:'88c4a01f3d7e', site_id:'warehouse-b', name:'Loading Dock Panel', device_type:'relay-4ch', hw_rev:'rev-b', fw_version:'1.2.0', mac:'88:c4:a0:1f:3d:7e', lwt:'online', last_seen_s:3,
    config:{ sensor_publish_period_ms:500, heartbeat_period_ms:15000, feature_agg_telemetry_enabled:true, feature_threshold_events_enabled:true },
    capabilities:[
      { id:'relay0', kind:'relay', label:'Dock Door A', value:true, online:true },
      { id:'relay1', kind:'relay', label:'Conveyor',    value:true, online:true },
    ]},
  { device_id:'55e9012bca44', site_id:'warehouse-b', name:'Cold Storage Monitor', device_type:'sensor-pir', hw_rev:'rev-a', fw_version:'0.9.1', mac:'55:e9:01:2b:ca:44', lwt:'online', last_seen_s:21,
    config:{ sensor_publish_period_ms:5000, heartbeat_period_ms:30000, feature_agg_telemetry_enabled:true, feature_threshold_events_enabled:true },
    capabilities:[ { id:'pir0', kind:'sensor', label:'Bay 3 Motion', value:'clear', online:true } ]},
  { device_id:'2f0b7a5df318', site_id:'office-hq', name:'Reception Lighting', device_type:'relay-2ch', hw_rev:'rev-b', fw_version:'1.2.0', mac:'2f:0b:7a:5d:f3:18', lwt:'online', last_seen_s:15,
    config:{ sensor_publish_period_ms:1000, heartbeat_period_ms:30000, feature_agg_telemetry_enabled:true, feature_threshold_events_enabled:true },
    capabilities:[
      { id:'relay0', kind:'relay', label:'Front Desk', value:true,  online:true },
      { id:'relay1', kind:'relay', label:'relay1',     value:false, online:true },
    ]},
  { device_id:'9d1c44e0ab27', site_id:'office-hq', name:'Server Room Sensor', device_type:'sensor-pir', hw_rev:'rev-a', fw_version:'0.9.1', mac:'9d:1c:44:e0:ab:27', lwt:'online', last_seen_s:4,
    config:{ sensor_publish_period_ms:5000, heartbeat_period_ms:30000, feature_agg_telemetry_enabled:true, feature_threshold_events_enabled:true },
    capabilities:[ { id:'pir0', kind:'sensor', label:'Server Room Motion', value:'clear', online:true } ]},
];
DEVICES.forEach(d => d.capabilities.forEach(c => {
  if (!Number.isFinite(c.since)) c.since = Date.now() - (c.value === true ? 4 * 60 * 60 * 1000 : 0);
}));
const CONFIG_DEFAULTS = {
  'relay-4ch': {
    sensor_publish_period_ms:1000, heartbeat_period_ms:30000,
    feature_agg_telemetry_enabled:true, feature_threshold_events_enabled:true,
  },
  'relay-2ch': {
    sensor_publish_period_ms:1000, heartbeat_period_ms:30000,
    feature_agg_telemetry_enabled:true, feature_threshold_events_enabled:true,
  },
  'sensor-pir': {
    sensor_publish_period_ms:5000, heartbeat_period_ms:30000,
    feature_agg_telemetry_enabled:true, feature_threshold_events_enabled:true,
  },
};
const ALARMS = [
  { id:'a1', device_id:'88c4a01f3d7e', type:'relay_stuck', priority:'critical', state:'UNACK_ALARM', code:'FEEDBACK_MISMATCH', msg:'Conveyor — feedback mismatch, possible stuck contact', since:210, latched:true, acked:false, ack_by:null, cleared:false, note:null, shelved_until:null },
  { id:'a2', device_id:'55e9012bca44', type:'low_battery', priority:'high', state:'ACK_ALARM', code:'LOW_BATTERY', msg:'Cold Storage Monitor — backup battery below 15%', since:5400, latched:false, acked:true, ack_by:'operator', cleared:false, note:'Replacement ordered', shelved_until:null },
  { id:'a3', device_id:'a13bd220e901', type:'device_offline', priority:'medium', state:'UNACK_ALARM', code:'MQTT_UNREACHABLE', msg:'Garage Controller — offline for over 2 hours', since:0, latched:false, acked:false, ack_by:null, cleared:false, note:null, shelved_until:null },
  { id:'a4', device_id:'f42dc971c624', type:'threshold', priority:'low', state:'RTN_UNACK', code:'THRESHOLD_EVENT', msg:'Garden Pump — runtime exceeded 2h continuous', since:900, latched:false, acked:true, ack_by:'admin', cleared:true, note:null, shelved_until:null },
];
const TELEMETRY = {};
const LWT_LOG = [];
function seedSeries(key, { unit, base, noise, threshold = null, window_s = 2, points = 120 }) {
  const now = Date.now(), history = [];
  for (let i = points; i >= 0; i--) history.push({ t: now - i * window_s * 1000, v: +(base + (Math.random() - 0.5) * noise).toFixed(2) });
  TELEMETRY[key] = { unit, threshold, window_s, history };
}
DEVICES.forEach(d => {
  const baseCurrent = d.lwt === 'offline' ? 0 : (d.device_type.includes('relay') ? 1.5 + Math.random() * 2.5 : 0.3 + Math.random() * 0.6);
  seedSeries(`${d.device_id}/current`, { unit:'A', base: baseCurrent, noise: 0.5, threshold: 6 });
  seedSeries(`${d.device_id}/power`,   { unit:'W', base: baseCurrent * 230, noise: 40, threshold: 1500 });
  if (d.device_type.includes('sensor')) {
    seedSeries(`${d.device_id}/temp`,    { unit:'°C', base: 22 + Math.random() * 3, noise: 0.8, threshold: 35 });
    seedSeries(`${d.device_id}/battery`, { unit:'%',  base: d.device_id === '55e9012bca44' ? 12 + Math.random() * 2 : 82 - Math.random() * 15, noise: 0.4, threshold: 15 });
  }
});
const ACTIVITY = [
  { t: 40,   text: 'admin toggled Front Desk → on' },
  { t: 300,  text: 'operator acknowledged LOW_BATTERY' },
  { t: 900,  text: 'Living Room Controller published config/current' },
  { t: 2100, text: 'Garage Controller went offline (LWT)' },
  { t: 5400, text: 'alarm raised: LOW_BATTERY' },
];
const DEFAULT_SCHEDULES = [
  { id:'sch1', name:'Garden pump off at night', enabled:true, device_id:'f42dc971c624', capability:'relay3', value:false, time:'22:00', days:[0,1,2,3,4,5,6], last_run:null },
  { id:'sch2', name:'Reception lights on at 07:30', enabled:true, device_id:'2f0b7a5df318', capability:'relay0', value:true, time:'07:30', days:[1,2,3,4,5], last_run:null },
];
const DEFAULT_SCENES = [
  { id:'sc1', name:'Evening mode', icon:'moon', enabled:true, actions:[
    { device_id:'f42dc971c624', capability:'relay0', value:true },
    { device_id:'f42dc971c624', capability:'relay1', value:true },
    { device_id:'2f0b7a5df318', capability:'relay0', value:false },
  ]},
  { id:'sc2', name:'Away mode', icon:'door-closed', enabled:true, actions:[
    { device_id:'f42dc971c624', capability:'relay0', value:false },
    { device_id:'f42dc971c624', capability:'relay1', value:false },
    { device_id:'f42dc971c624', capability:'relay3', value:false },
    { device_id:'2f0b7a5df318', capability:'relay0', value:false },
  ]},
];
let SCHEDULES = lsGet('electrix_schedules', DEFAULT_SCHEDULES);
let SCENES = lsGet('electrix_scenes', DEFAULT_SCENES);
const saveSchedules = () => lsSet('electrix_schedules', SCHEDULES);
const saveScenes = () => lsSet('electrix_scenes', SCENES);
const SCENE_ICONS = ['sparkles','moon','sun','sunset','door-closed','home','building-2','lock','unlock','zap','droplet','flame'];
const sceneIconHTML = name => {
  if (!name) return icon('sparkles');
  if (/[^\x00-\x7F]/.test(name) && name.length <= 3) return `<span>${esc(name)}</span>`;
  return icon(name);
};

const DEFAULT_LAYOUT = ['fleet_status','active_alarms','quick_controls','recent_activity','site_overview'];
let state = {
  user: lsGet('electrix_user', null),
  view: 'dashboard',
  deviceTab: 'overview',
  selectedSite: lsGet('electrix_site', 'all'),
  sortBy: lsGet('electrix_sort', 'site'),
  search: '',
  devMode: lsGet('electrix_devmode', false),
  sidebarCollapsed: lsGet('electrix_sidebar_collapsed', false),
  drawerDeviceId: null,
  openDeviceId: null,
  widgetLayout: lsGet('electrix_widget_layout', DEFAULT_LAYOUT.slice()),
  widgetReorderMode: false,
  alarmFilter: 'active',
  alarmDeviceFilter: null,
  alarmPriorityFilter: 'all',
  alarmTypeFilter: 'all',
  favorites: lsGet('electrix_favorites', []),
  bulkMode: false,
  bulkSelected: new Set(),
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
  deviceReferenceOpen: lsGet('electrix_device_reference_open', {}),
  autoTab: 'schedules',
  inspectorOpen: false,
  paletteOpen: false, paletteQuery: '', paletteSel: 0,
};
