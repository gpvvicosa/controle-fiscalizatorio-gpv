const CACHE_NAME = 'gpv-vistorias-pwa-20260808-v17-2-pscip-hotfix';
const APP_SHELL = [
  './', './index.html', './styles.css', './config.js', './ocupacoes.js', './app.js', './manifest.webmanifest',
  './offline.html', './assets/cabecalho.webp', './assets/logo-cbmmg.png', './assets/logo-gpv.png',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)); return response;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./offline.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response && response.status === 200 && response.type === 'basic') {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
