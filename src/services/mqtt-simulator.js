'use strict';

if (window.__mqtt_adapter_installed) {
  console.warn('[mqtt-adapter] duplicate load detected — using existing instance');
  throw new Error('[mqtt-adapter] already loaded');
}
window.__mqtt_adapter_installed = true;

const configuredBackendUrl = localStorage.getItem('electrix_backend_url') || 'http://localhost:8000';
const BACKEND_URL = (() => {
  try {
    const url = new URL(configuredBackendUrl);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)
        && !['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
      url.hostname = location.hostname;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return configuredBackendUrl.replace(/\/$/, '');
  }
})();
const USE_DEMO    = localStorage.getItem('electrix_use_demo') === '1';

const apiRequest = async (path, options = {}) => {
  const token = localStorage.getItem('electrix_token');
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    const message = typeof detail === 'string' ? detail
      : detail?.error || detail?.message || (detail ? JSON.stringify(detail) : data.error) || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
};

const mqtt = (() => {
  const subs = [];
  const listeners = { connected: [], disconnected: [], message: [], 'new-device': [] };
  const pendingAcks = new Map();
  const seenDeviceIds = new Set();
  const lastEventId = new Map();   // device_id → highest event.id we've processed
  let connected = false;
  let connectionError = '';
  let recentCommands = [];
  let lastCommandPoll = 0;
  let pollHandle = null;
  let firstSnapshot = true;

  const emit = (ev, ...a) => (listeners[ev] || []).forEach(cb => cb(...a));

  const topicMatch = (pattern, topic) => {
    const p = pattern.split('/');
    const t = topic.split('/');
    for (let i = 0; i < p.length; i++) {
      if (p[i] === '#') return true;
      if (p[i] === '+') continue;
      if (p[i] !== t[i]) return false;
    }
    return p.length === t.length;
  };

  const fanout = (topic, payload, opts = {}) =>
    subs.forEach(s => { if (topicMatch(s.pattern, topic)) s.cb(topic, payload, opts); });

  subs.push({ pattern: 'electrix/#', cb: topic => {
    const m = topic.match(/\/ack\/([^/]+)$/);
    if (!m) return;
    const cb = pendingAcks.get(m[1]);
    if (cb) { pendingAcks.delete(m[1]); cb(payload); }
  }});

  // -------------------------------------------------------------------
  // Demo-data clearing — once.
  // -------------------------------------------------------------------
  function clearDemoFixtures() {
    if (typeof DEVICES  !== 'undefined' && Array.isArray(DEVICES))  DEVICES.length  = 0;
    if (typeof ALARMS   !== 'undefined' && Array.isArray(ALARMS))   ALARMS.length   = 0;
    if (typeof ACTIVITY !== 'undefined' && Array.isArray(ACTIVITY)) ACTIVITY.length = 0;
    if (typeof LWT_LOG  !== 'undefined' && Array.isArray(LWT_LOG))  LWT_LOG.length  = 0;
    if (typeof TELEMETRY !== 'undefined' && TELEMETRY) {
      for (const k of Object.keys(TELEMETRY)) delete TELEMETRY[k];
    }
    console.info('[mqtt-adapter] demo fixtures cleared');
  }

  async function hydrateSites() {
    const sites = await apiRequest('/sites', { cache: 'no-store' });
    if (typeof SITES !== 'undefined' && Array.isArray(SITES)) {
      SITES.length = 0;
      sites.forEach(s => SITES.push({ id: s.id, name: s.name }));
    }
    return sites;
  }

  // -------------------------------------------------------------------
  // Device hydration (unchanged).
  // -------------------------------------------------------------------
  function hydrateDevice(d) {
    let dev = DEVICES.find(x => x.device_id === d.device_id);
    if (!dev) {
      dev = {
        device_id: d.device_id,
        site_id: d.site_id || null,
        name: d.device_type ? `${d.device_type} ${d.device_id.slice(-4)}` : d.device_id,
        device_type: d.device_type || 'generic',
        hw_rev: d.hw_rev || 'unknown',
        fw_version: d.fw_version || '0.0.0',
        mac: d.mac || d.device_id,
        lwt: 'offline',
        last_seen_s: 0,
        first_seen_ms: d.first_seen || Date.now(),
        config: {
          sensor_publish_period_ms: 1000,
          heartbeat_period_ms: 30000,
          feature_agg_telemetry_enabled: true,
          feature_threshold_events_enabled: true,
        },
        capabilities: [],
      };
      DEVICES.push(dev);
    }

    dev.site_id      = d.site_id;
    dev.device_type  = d.device_type || dev.device_type;
    dev.hw_rev       = d.hw_rev      || dev.hw_rev;
    dev.fw_version   = d.fw_version  || dev.fw_version;
    dev.mac          = d.mac         || dev.mac;
    dev.first_seen_ms = d.first_seen || dev.first_seen_ms;
    dev.last_seen_s  = Math.max(0, Math.floor((Date.now() - (d.last_seen || Date.now())) / 1000));

    const lwt = d.latest_state['status/lwt'];
    dev.lwt = lwt === 'offline' || dev.last_seen_s > 60 ? 'offline' : 'online';

    const caps = new Map();
    for (const [tail, payload] of Object.entries(d.latest_state)) {
      const stateMatch = tail.match(/^state\/(.+)$/);
      if (stateMatch) {
        const id = stateMatch[1];
        const cls = (payload && payload.class) || 'relay';
        caps.set(id, {
          id, kind: cls, label: id,
          value: !!(payload && payload.value),
          online: true,
          since: Date.now() - 3600000,
        });
        continue;
      }
      const teleMatch = tail.match(/^telemetry\/(.+)\/raw$/);
      if (teleMatch) {
        const id = teleMatch[1];
        caps.set(id, {
          id, kind: 'sensor', label: id,
          value: payload && payload.value,
          online: true,
        });
      }
    }
    for (const [id, cap] of caps.entries()) {
      const existing = dev.capabilities.find(c => c.id === id);
      if (existing) cap.label = existing.label;
    }
    dev.capabilities = [...caps.values()];
    dev.latest_state = d.latest_state;

  }

  // -------------------------------------------------------------------
  // ALARM hydration — new.
  //
  // Two sources:
  //   1. latest_state["alarm/{type}/state"] — retained, current state.
  //   2. recent_events["alarm/{type}/event"] — the transition history.
  //
  // The backend stores events newest-first. We process oldest-first so
  // that a raise→ack→clear sequence ends up as "cleared" in the frontend.
  // -------------------------------------------------------------------

  function hydrateAlarms(d) {
    // 1. Current state from retained topic.
    for (const [tail, payload] of Object.entries(d.latest_state)) {
      const m = tail.match(/^alarm\/([^/]+)\/state$/);
      if (!m) continue;
      const type = m[1];
      const id = `${d.device_id}/${type}`;

      let a = ALARMS.find(x => x.id === id);
      if (!a) {
        a = {
          id,
          device_id: d.device_id,
          type,
          code: type.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
          priority: 'medium',
          state: 'NORM',
          msg: '',
          since: 0,
          latched: false,
          acked: false,
          ack_by: null,
          cleared: true,
          note: null,
          shelved_until: null,
        };
        ALARMS.push(a);
      }

      a.priority   = payload.priority || a.priority;
      a.state      = payload.state    || a.state;
      a.msg        = payload.msg      || payload.description || a.msg;
      a.latched    = payload.latch === 'requires_clear';
      a.acked      = !!payload.acked_by;
      a.ack_by     = payload.acked_by || null;
      a.cleared    = (payload.state === 'NORM');
      // `since` is epoch ms (or 0). The frontend expects seconds-ago.
      a.since      = payload.since
        ? Math.max(0, Math.floor((Date.now() - payload.since) / 1000))
        : 0;
    }

    // 2. Transition events — run oldest-first so the last writer wins.
    const events = (d.recent_events || [])
      .slice()
      .sort((a, b) => a.received_at - b.received_at);

    const latestProcessed = lastEventId.get(d.device_id) || 0;
    let highest = latestProcessed;

    for (const ev of events) {
      if (ev.id && ev.id <= latestProcessed) continue;
      if (ev.id && ev.id > highest) highest = ev.id;

      const m = ev.topic_tail.match(/^alarm\/([^/]+)\/event$/);
      if (!m) continue;

      const type = m[1];
      const id = `${d.device_id}/${type}`;
      const p = ev.payload || {};

      let a = ALARMS.find(x => x.id === id);
      if (!a) {
        a = {
          id,
          device_id: d.device_id,
          type,
          code: type.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
          priority: p.priority || 'medium',
          state: p.state || 'NORM',
          msg: p.msg || '',
          since: 0,
          latched: false,
          acked: false,
          ack_by: null,
          cleared: true,
          note: null,
          shelved_until: null,
        };
        ALARMS.push(a);
      }

      if (p.priority) a.priority = p.priority;
      if (p.msg) a.msg = p.msg;
      if (p.state) a.state = p.state;
      if (p.by) a.ack_by = p.by;

      // Event types: raise / raise_repeat / rtn / clear / ack
      if (p.event === 'raise') {
        a.cleared = false;
        a.acked = false;
        a.ack_by = null;
        a.since = 0;   // will be back-filled by the retained state above on the next poll
      } else if (p.event === 'ack') {
        a.acked = true;
      } else if (p.event === 'rtn') {
        a.cleared = false;  // still active in RTN_UNACK
      } else if (p.event === 'clear') {
        a.cleared = true;
      }
    }

    if (highest > latestProcessed) lastEventId.set(d.device_id, highest);
  }

  // -------------------------------------------------------------------
  // TELEMETRY hydration — new.
  //
  // telemetry/*/raw is NOT retained, so it only exists in `events`.
  // We build a bounded history per series keyed by "<device>/<sensor>",
  // keeping the last N readings.
  // -------------------------------------------------------------------
  const TELEMETRY_MAX_POINTS = 240;

  function ensureSeries(device, sensor) {
    const key = `${device.device_id}/${sensor}`;
    let s = TELEMETRY[key];
    if (!s) {
      const d = device;
      const isBool = sensor.startsWith('di') || sensor.startsWith('do');
      s = TELEMETRY[key] = {
        unit: isBool ? 'bool' : '',
        threshold: null,
        window_s: 2,
        history: [],
      };
    }
    return s;
  }

  function hydrateTelemetry(d) {
    const events = (d.recent_events || [])
      .slice()
      .sort((a, b) => a.received_at - b.received_at);

    for (const ev of events) {
      const m = ev.topic_tail.match(/^telemetry\/([^/]+)\/raw$/);
      if (!m) continue;

      const sensor = m[1];
      const p = ev.payload || {};
      const value = p.value;
      if (value === undefined) continue;

      const s = ensureSeries(d, sensor);
      if (p.unit) s.unit = p.unit;

      const numericValue = (typeof value === 'boolean') ? (value ? 1 : 0) : Number(value);
      if (!Number.isFinite(numericValue)) continue;

      const t = p.timestamp && p.timestamp > 1e12 ? p.timestamp : ev.received_at;
      const last = s.history[s.history.length - 1];
      if (last && t <= last.t) continue;

      s.history.push({ t, v: numericValue });
      if (s.history.length > TELEMETRY_MAX_POINTS) {
        s.history.splice(0, s.history.length - TELEMETRY_MAX_POINTS);
      }
    }
  }

  // -------------------------------------------------------------------
  // Snapshot hydration — orchestrates the three above.
  // -------------------------------------------------------------------
  function hydrateSnapshot(snapshot) {
    if (firstSnapshot && !USE_DEMO) clearDemoFixtures();
    firstSnapshot = false;

    const newDevices = [];
    for (const d of snapshot) {
      if (!seenDeviceIds.has(d.device_id)) {
        seenDeviceIds.add(d.device_id);
        if (!d.site_id) newDevices.push(d);
      }
    }

    for (const d of snapshot) {
      hydrateDevice(d);
      hydrateAlarms(d);
      hydrateTelemetry(d);
    }

    for (const dev of DEVICES) {
      if (!snapshot.find(s => s.device_id === dev.device_id)) dev.lwt = 'offline';
    }

    for (const d of snapshot) {
      for (const [tail, payload] of Object.entries(d.latest_state)) {
        const full = `electrix/${d.device_id}/${tail}`;
        const opts = { qos: 1, retain: true };
        fanout(full, payload, opts);
        emit('message', full, payload, opts);
      }
    }

    for (const d of newDevices) {
      const dev = DEVICES.find(x => x.device_id === d.device_id);
      if (dev) emit('new-device', dev);
    }
  }

  async function pollOnce() {
    try {
      const snapshot = await apiRequest('/snapshot', { cache: 'no-store' });
      if (Date.now() - lastCommandPoll >= 10000) {
        lastCommandPoll = Date.now();
        try {
          recentCommands = await apiRequest('/commands?limit=8', { cache: 'no-store' });
        } catch (error) {
          console.warn('[mqtt-adapter] command history fetch failed:', error.message);
        }
      }
      hydrateSnapshot(snapshot);
      if (!connected) {
        connected = true;
        connectionError = '';
        emit('connected');
        console.info(`[mqtt-adapter] live: ${snapshot.length} device(s) from ${BACKEND_URL}`);
      }
    } catch (e) {
      const previousError = connectionError;
      connectionError = e.message || 'Backend request failed';
      if (connected) { connected = false; emit('disconnected'); }
      if (state.user && previousError !== connectionError) renderMain();
      console.warn('[mqtt-adapter] snapshot fetch failed:', e.message);
    }
  }

  function startPolling() {
    if (pollHandle) return;
    hydrateSites().catch(e => console.warn('[mqtt-adapter] sites fetch failed:', e.message)).finally(() => {
      pollOnce();
      pollHandle = setInterval(pollOnce, 2000);
    });
  }

  return {
    isConnected: () => connected,
    connectionError: () => connectionError,
    recentCommands: () => recentCommands,
    backendUrl: () => BACKEND_URL,

    on(ev, cb) { (listeners[ev] ||= []).push(cb); },
    connect() { startPolling(); },
    subscribe(pattern, cb) { subs.push({ pattern, cb }); },

    waitForAck(id, ms = 5000) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => { pendingAcks.delete(id); rej(new Error('ack timeout')); }, ms);
        pendingAcks.set(id, payload => {
          clearTimeout(t);
          if (payload?.status === 'error') rej(new Error(payload.message || 'command rejected'));
          else res(payload);
        });
      });
    },

    async publish(topic, payload, opts = {}) {
      const m = topic.match(/^electrix\/([^/]+)\/cmd\/([^/]+)\/set$/);
      if (m) {
        const [, device_id, actuator] = m;
        const value = payload && payload.value;
        const request_id = payload && payload.request_id;
        emit('message', topic, payload, opts);
        const result = await apiRequest(
          `/devices/${encodeURIComponent(device_id)}/actuators/${encodeURIComponent(actuator)}/set`,
          { method: 'POST', body: JSON.stringify({ value: !!value }) },
        );
        const ackTopic = `electrix/${device_id}/ack/${request_id}`;
        const ackPayload = result.ack_payload
          || { status: result.status === 'ok' ? 'ok' : 'error', echoed_value: !!value };
        setTimeout(() => {
          fanout(ackTopic, ackPayload, { qos: 1 });
          emit('message', ackTopic, ackPayload, { qos: 1 });
        }, 30);
        return result;
      }
      emit('message', topic, payload, opts);
      throw new Error(`Unsupported MQTT command topic: ${topic}`);
    },

    inject(topic, payload) {
      fanout(topic, payload, {});
      emit('message', topic, payload, {});
    },

    async createSite(name) {
      const site = await apiRequest('/sites', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (typeof SITES !== 'undefined' && !SITES.find(s => s.id === site.id)) {
        SITES.push({ id: site.id, name: site.name });
      }
      return site;
    },
    async deleteSite(siteId) {
      return apiRequest(`/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' });
    },

    async assignDeviceSite(deviceId, siteId) {
      const result = await apiRequest(`/devices/${deviceId}/site`, {
        method: 'POST',
        body: JSON.stringify({ site_id: siteId }),
      });
      const dev = typeof deviceById === 'function' ? deviceById(deviceId) : null;
      if (dev) dev.site_id = siteId;
      return result;
    },
    async saveConfig(deviceId, cfg) {
      const data = await apiRequest(`/devices/${deviceId}/config`, {
        method: 'POST',
        body: JSON.stringify(cfg),
      });
      if (data.status && data.status !== 'ok') {
        const err = data.error || {};
        throw new Error(`${err.field || 'config'}: ${err.reason || 'rejected'}`);
      }
      return data;
    },
    async deviceEvents(deviceId, limit = 200, beforeId = null, filter = '') {
      const params = new URLSearchParams({ limit: String(limit) });
      if (beforeId !== null && beforeId !== undefined) params.set('before_id', String(beforeId));
      if (filter) params.set('filter', filter);
      return apiRequest(`/devices/${encodeURIComponent(deviceId)}/events?${params}`, { cache: 'no-store' });
    },
    async deviceCommands(deviceId, limit = 100) {
      const params = new URLSearchParams({ limit: String(limit) });
      return apiRequest(`/devices/${encodeURIComponent(deviceId)}/commands?${params}`, { cache: 'no-store' });
    },
    async deviceDiagnostics(deviceId) {
      return apiRequest(`/devices/${encodeURIComponent(deviceId)}/diagnostics`, { cache: 'no-store' });
    },
    async refreshSnapshot() {
      const snapshot = await apiRequest('/snapshot', { cache: 'no-store' });
      hydrateSnapshot(snapshot);
      return snapshot;
    },
    async acknowledgeAlarm(deviceId, alarmType) {
      return apiRequest(`/devices/${encodeURIComponent(deviceId)}/alarms/${encodeURIComponent(alarmType)}/ack`, {
        method: 'POST',
      });
    },
    async rebootDevice(deviceId, delayS = 1) {
      return apiRequest(`/devices/${encodeURIComponent(deviceId)}/reboot`, {
        method: 'POST',
        body: JSON.stringify({ delay_s: delayS }),
      });
    },
    async factoryResetDevice(deviceId, confirm) {
      return apiRequest(`/devices/${encodeURIComponent(deviceId)}/factory_reset`, {
        method: 'POST',
        body: JSON.stringify({ confirm }),
      });
    },
    async refreshSites() { return hydrateSites(); },
    refresh() { return pollOnce(); },
    apiRequest,
    async login(username, password) {
      return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    },
    async getCurrentUser() {
      return apiRequest('/auth/me');
    },
    async listUsers() { return apiRequest('/users'); },
    async createUser(payload) { return apiRequest('/users', { method: 'POST', body: JSON.stringify(payload) }); },
    async deleteUser(username) { return apiRequest(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' }); },
    async getAuditLog() { return apiRequest('/audit-log'); },
  };
})();

const waitForAck = (id, ms) => mqtt.waitForAck(id, ms);