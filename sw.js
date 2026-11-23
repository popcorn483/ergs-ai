// ERGS Digital Skills & AI: lets phones install the library as an app and read released issues offline.
// Pages and code come fresh from the network when online; issue files (encrypted) are kept for offline reading.
const CACHE = 'ergsai-v135';
const SHELL = ['./', 'index.html', 'style.css', 'dark.css', 'app.js', 'config.js', 'crest.js', 'share.js', 'tips.js', 'skills.js', 'skills-art.js', 'tips-art.js', 'skillart-draw.js', 'tipshots.js', 'sheets.js', 'manifest.webmanifest', 'icons/icon-192.png', 'fonts/lemonmilk-bold.woff', 'fonts/lemonmilk-regular.woff', 'fonts/lemonmilk-light.woff'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || e.request.cache === 'no-store') return;   // update checks go straight to GitHub
  if (/\/img\/.+\.bin$/.test(u.pathname)) {   // page images never change: cache first
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return res; })));
    return;
  }
  e.respondWith(fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return res; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined))));
});

// push notifications: "a new issue is in the binder" (sent by the GitHub Action in .github/workflows/push.yml)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (er) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'ERGS Digital Skills & AI', {
    body: d.body || 'A new issue is in the binder.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'ergs-issue', data: { url: d.url || './#binder' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope)) { w.navigate(url).catch(() => {}); return w.focus(); }
    return clients.openWindow(url);
  }));
});
