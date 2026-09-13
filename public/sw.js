/* LEGION PWA: cache immutable bundles + media hosts. HTML + JSON always fresh. */
const C = 'legion-v25-1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k !== 'legion-rt').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) {
    if (/gstatic|googleapis|agnes-ai|catbox|uguu/.test(u.hostname)) {
      e.respondWith(caches.open('legion-rt').then(c => c.match(e.request).then(h => h || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => h))));
    }
    return;
  }
  // JSON (banlist/manifest) and HTML: network-first, never stale
  if (u.pathname.endsWith('.json') || !u.pathname.includes('.') || u.pathname.endsWith('/')) return;
  if (u.pathname.startsWith('/_next/') || /\.(png|svg|ico|woff2?)$/.test(u.pathname)) {
    e.respondWith(caches.open(C).then(c => c.match(e.request).then(h => h || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
  }
});
