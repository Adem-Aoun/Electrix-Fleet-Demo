'use strict';

const mqtt = (() => {
  const subs = [], listeners = { connected:[], disconnected:[], message:[] }, pendingAcks = new Map();
  let connected = false;
  const emit = (ev, ...a) => listeners[ev].forEach(cb => cb(...a));
  const topicMatch = (pattern, topic) => {
    const p = pattern.split('/'), t = topic.split('/');
    for (let i = 0; i < p.length; i++) {
      if (p[i] === '#') return true;
      if (p[i] === '+') continue;
      if (p[i] !== t[i]) return false;
    }
    return p.length === t.length;
  };
  const fanout = (topic, payload) => subs.forEach(s => { if (topicMatch(s.pattern, topic)) s.cb(topic, payload); });
  subs.push({ pattern:'electrix/#', cb: topic => {
    const m = topic.match(/\/ack\/([^/]+)$/); if (!m) return;
    const cb = pendingAcks.get(m[1]); if (cb) { pendingAcks.delete(m[1]); cb(); }
  }});
  return {
    isConnected: () => connected,
    on(ev, cb) { listeners[ev]?.push(cb); },
    connect() { setTimeout(() => { connected = true; emit('connected'); }, 120); },
    subscribe(p, cb) { subs.push({ pattern:p, cb }); },
    waitForAck(id, ms = 5000) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => { pendingAcks.delete(id); rej(new Error('ack timeout')); }, ms);
        pendingAcks.set(id, () => { clearTimeout(t); res(); });
      });
    },
    async publish(topic, payload, opts = {}) {
      if (!connected) throw new Error('MQTT not connected');
      await sleep(40 + Math.random() * 70);
      fanout(topic, payload); emit('message', topic, payload, opts);
      return { ok:true, topic, opts };
    },
    inject(topic, payload) { fanout(topic, payload); emit('message', topic, payload, {}); },
  };
})();
const waitForAck = (id, ms) => mqtt.waitForAck(id, ms);
