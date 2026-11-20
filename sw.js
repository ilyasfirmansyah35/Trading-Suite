const CACHE = 'ts-v11';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

// Install: pre-cache shell files
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

// Activate: delete old caches + take control immediately
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for app files
// Serve from cache immediately, but also fetch fresh copy and update cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('script.google.com')) return;

  // CDN resources (fonts, icons, chart.js) — cache-first is fine
  if (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('fonts.googleapis.com') || e.request.url.includes('fonts.gstatic.com')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    })));
    return;
  }

  // App files — stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(networkRes => {
        if (networkRes && networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return networkRes;
      }).catch(() => cached); // offline fallback to cache

      return cached || fetchPromise;
    })
  );
});
