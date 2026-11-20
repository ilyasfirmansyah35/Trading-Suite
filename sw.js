const CACHE = 'ts-v12';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

// Install: pre-cache shell for offline use
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting(); // activate immediately
});

// Activate: delete old caches + take control
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim(); // control all tabs immediately
});

// Fetch: NETWORK-FIRST for app files, cache-first for CDN
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Skip API calls
  if (e.request.url.includes('script.google.com') || e.request.url.includes('api.exchangerate')) return;

  // CDN resources (fonts, icons, chart.js) — cache-first (they never change)
  if (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('fonts.googleapis.com') || e.request.url.includes('fonts.gstatic.com')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    })));
    return;
  }

  // App files — NETWORK FIRST (always get latest, fallback to cache when offline)
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
