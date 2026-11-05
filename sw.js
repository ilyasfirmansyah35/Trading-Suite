const CACHE = 'ts-v2';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
    if (e.request.url.includes('script.google.com')) return; // never cache GAS API calls
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
