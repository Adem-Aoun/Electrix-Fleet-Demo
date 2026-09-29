'use strict';

(function installPWA() {
  try {
    const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="42" fill="#E8A33D"/><path d="M100 28 L58 108 L90 108 L90 164 L134 84 L102 84 Z" fill="#14171C"/></svg>`;
    const iconUrl = 'data:image/svg+xml,' + encodeURIComponent(iconSvg);
    const manifest = {
      name: 'Electrix Command', short_name: 'Electrix',
      description: 'Fleet control for MQTT-connected relay and sensor devices.',
      start_url: '.', scope: '.', display: 'standalone', orientation: 'any',
      background_color: '#14171C', theme_color: '#14171C',
      icons: [
        { src: iconUrl, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
        { src: iconUrl, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
        { src: iconUrl, sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
        { src: iconUrl, sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    };
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    document.head.appendChild(manifestLink);
    const apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    apple.href = iconUrl;
    document.head.appendChild(apple);
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      const swCode = [
        "const CACHE='electrix-shell-v4';",
        "self.addEventListener('install',e=>{self.skipWaiting()});",
        "self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});",
        "self.addEventListener('fetch',e=>{",
        "  if(e.request.method!=='GET')return;",
        "  const u=new URL(e.request.url);",
        "  if(u.origin!==location.origin)return;",
        "  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(res=>{",
        "    if(res.ok)c.put(e.request,res.clone());return res;",
        "  }).catch(()=>c.match(e.request)))));",
        "});",
      ].join('');
      navigator.serviceWorker.register(URL.createObjectURL(new Blob([swCode], { type: 'application/javascript' }))).catch(() => {});
    }
  } catch (e) {}
})();

function refreshIcons(root) {
  if (!window.lucide || typeof lucide.createIcons !== 'function') return;
  try { lucide.createIcons(); } catch {}
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uid = () => (crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)).replace(/-/g, '').slice(0, 12);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const fmtAgo = s => s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
const fmtClock = ts => new Date(ts).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
const fmtDateTime = ts => new Date(ts).toLocaleString('en-GB', { month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const icon = (name, cls = '') => `<i data-lucide="${esc(name)}"${cls ? ` class="${esc(cls)}"` : ''}></i>`;
const isMobile = () => window.matchMedia('(max-width:820px)').matches;

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied', { msg: text.slice(0, 60), type:'info', timeout:1600 }); }
  catch { toast('Copy failed', { type:'error' }); }
}
