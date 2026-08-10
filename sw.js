const CACHE_NAME = 'gpv-vistorias-pwa-20260810-v23-6-link-curto-manual';
const VERSION = '23.7';
const APP_SHELL = [
  './',
  './index.html',
  `./styles.css?v=${VERSION}`,
  `./config.js?v=${VERSION}`,
  `./ocupacoes.js?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  './manifest.webmanifest',
  './offline.html',
  './assets/cabecalho.webp',
  './assets/logo-cbmmg.png',
  `./assets/logo-gpv.png?v=${VERSION}`,
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/manual-do-autuado-infoscip-fiscalizacao.pdf',
  './manual/'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request, fallbackUrl = '') {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  const destino = request.destination;
  const arquivoCritico = destino === 'style' || destino === 'script' || /\/(?:styles\.css|app\.js|config\.js|ocupacoes\.js)$/.test(url.pathname);
  if (arquivoCritico) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }))
  );
});
