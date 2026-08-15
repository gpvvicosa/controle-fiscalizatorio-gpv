const CACHE_NAME = 'gpv-vistorias-pwa-20260814-v23-9-80-acervo-its-fase1';
const VERSION = '23.9.80';

const CORE_SHELL = [
  './',
  './index.html',
  `./styles.css?v=${VERSION}`,
  `./config.js?v=${VERSION}`,
  `./ocupacoes.js?v=${VERSION}`,
  `./notificacoes-infoscip.js?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  './manifest.webmanifest',
  './offline.html'
];

const OPTIONAL_SHELL = [
  './assets/cabecalho.webp',
  './assets/logo-cbmmg.png',
  `./assets/logo-gpv.png?v=${VERSION}`,
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/manual-do-autuado-infoscip-fiscalizacao.pdf',
  './manual/',
  './instrucoes-tecnicas/assets/app.js',
  './instrucoes-tecnicas/assets/its.js',
  './instrucoes-tecnicas/assets/portal.js',
  './instrucoes-tecnicas/assets/search-index.js',
  './instrucoes-tecnicas/assets/style.css',
  './instrucoes-tecnicas/assets/visual/it-33-p21.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p26.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p45.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p46.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p50.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p51.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p52.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p54.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p55.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p66.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p67.webp',
  './instrucoes-tecnicas/assets/visual/it-33-p69.webp',
  './instrucoes-tecnicas/index.html',
  './instrucoes-tecnicas/its/it-01.html',
  './instrucoes-tecnicas/its/it-02.html',
  './instrucoes-tecnicas/its/it-03.html',
  './instrucoes-tecnicas/its/it-04.html',
  './instrucoes-tecnicas/its/it-05.html',
  './instrucoes-tecnicas/its/it-06.html',
  './instrucoes-tecnicas/its/it-07.html',
  './instrucoes-tecnicas/its/it-08.html',
  './instrucoes-tecnicas/its/it-09.html',
  './instrucoes-tecnicas/its/it-10.html',
  './instrucoes-tecnicas/its/it-11.html',
  './instrucoes-tecnicas/its/it-12.html',
  './instrucoes-tecnicas/its/it-13.html',
  './instrucoes-tecnicas/its/it-14.html',
  './instrucoes-tecnicas/its/it-15.html',
  './instrucoes-tecnicas/its/it-16.html',
  './instrucoes-tecnicas/its/it-17.html',
  './instrucoes-tecnicas/its/it-18.html',
  './instrucoes-tecnicas/its/it-19.html',
  './instrucoes-tecnicas/its/it-20.html',
  './instrucoes-tecnicas/its/it-21.html',
  './instrucoes-tecnicas/its/it-22.html',
  './instrucoes-tecnicas/its/it-23.html',
  './instrucoes-tecnicas/its/it-24.html',
  './instrucoes-tecnicas/its/it-25.html',
  './instrucoes-tecnicas/its/it-26.html',
  './instrucoes-tecnicas/its/it-27.html',
  './instrucoes-tecnicas/its/it-28.html',
  './instrucoes-tecnicas/its/it-29.html',
  './instrucoes-tecnicas/its/it-30.html',
  './instrucoes-tecnicas/its/it-31.html',
  './instrucoes-tecnicas/its/it-32.html',
  './instrucoes-tecnicas/its/it-33.html',
  './instrucoes-tecnicas/its/it-34.html',
  './instrucoes-tecnicas/its/it-35.html',
  './instrucoes-tecnicas/its/it-36.html',
  './instrucoes-tecnicas/its/it-37.html',
  './instrucoes-tecnicas/its/it-38.html',
  './instrucoes-tecnicas/its/it-39.html',
  './instrucoes-tecnicas/its/it-40.html',
  './instrucoes-tecnicas/its/it-41.html',
  './instrucoes-tecnicas/its/it-42.html',
  './instrucoes-tecnicas/its/it-43.html',
  './instrucoes-tecnicas/its/it-44.html',
  './instrucoes-tecnicas/its/it-45.html'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Arquivos críticos: se algum falhar, não instala um shell incompleto.
    await cache.addAll(CORE_SHELL);
    // Arquivos auxiliares não podem impedir a atualização do aplicativo.
    await Promise.allSettled(OPTIONAL_SHELL.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('gpv-vistorias-pwa-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
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
  const arquivoCritico = destino === 'style' || destino === 'script' ||
    /\/(?:styles\.css|app\.js|config\.js|ocupacoes\.js|notificacoes-infoscip\.js)$/.test(url.pathname);

  if (arquivoCritico) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    } catch (error) {
      if (request.destination === 'document') {
        const offline = await caches.match('./offline.html');
        if (offline) return offline;
      }
      throw error;
    }
  })());
});
