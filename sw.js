const CACHE_NAME = 'gpv-vistorias-pwa-20260829-v23-9-99-dc';
const VERSION = '23.9.99dc';

const CORE_SHELL = [
  './',
  './index.html',
  `./styles.css?v=${VERSION}`,
  `./config.js?v=${VERSION}`,
  `./ocupacoes.js?v=${VERSION}`,
  `./notificacoes-infoscip.js?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  `./app-vistoriador-ck.webmanifest?v=${VERSION}`,
  `./assets/app-vistoriador-icon-192-ck.png?v=${VERSION}`,
  `./assets/app-vistoriador-icon-512-ck.png?v=${VERSION}`,
  `./assets/splash-app-vistoriador.webp?v=${VERSION}`,
  './offline.html'
];

const OPTIONAL_SHELL = [
  './base-normativa-its.json?v=23.9.99l',
  './assets/cabecalho.webp',
  './assets/logo-cbmmg.png',
  `./assets/logo-gpv.png?v=${VERSION}`,
  `./assets/miniatura-app-vistoriador-ch.jpg?v=${VERSION}`,
  `./assets/app-vistoriador-icon-maskable-512-ck.png?v=${VERSION}`,
  './assets/manual-do-autuado-infoscip-fiscalizacao.pdf',
  './manual/',
  './instrucoes-tecnicas/assets/app.js',
  './instrucoes-tecnicas/assets/its.js',
  './instrucoes-tecnicas/assets/portal.js',
  './instrucoes-tecnicas/assets/search-index.js',
  './instrucoes-tecnicas/assets/style.css',
  './instrucoes-tecnicas/assets/visual/it-01-p77.webp',
  './instrucoes-tecnicas/assets/visual/it-01-p78.webp',
  './instrucoes-tecnicas/assets/visual/it-01-p79.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p17.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p18.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p19.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p20.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p21.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p22.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p23.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p24.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p25.webp',
  './instrucoes-tecnicas/assets/visual/it-17-p18.webp',
  './instrucoes-tecnicas/assets/visual/it-17-p21.webp',
  './instrucoes-tecnicas/assets/visual/it-17-p23.webp',
  './instrucoes-tecnicas/assets/visual/it-17-p24.webp',
  './instrucoes-tecnicas/assets/visual/it-17-p27.webp',
  './instrucoes-tecnicas/assets/visual/it-17-p30.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p47.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p48.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p49.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p50.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p51.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p52.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p53.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p54.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p55.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p56.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p57.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p58.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p59.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p60.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p61.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p62.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p63.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p64.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p65.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p66.webp',
  './instrucoes-tecnicas/assets/visual/it-23-p67.webp',
  './instrucoes-tecnicas/assets/visual/it-28-p05.webp',
  './instrucoes-tecnicas/assets/visual/it-29-p05.webp',
  './instrucoes-tecnicas/assets/visual/it-29-p06.webp',
  './instrucoes-tecnicas/assets/visual/it-29-p07.webp',
  './instrucoes-tecnicas/assets/visual/it-35-p23.webp',
  './instrucoes-tecnicas/assets/visual/it-35-p27.webp',
  './instrucoes-tecnicas/assets/visual/it-35-p28.webp',
  './instrucoes-tecnicas/assets/visual/it-38-p06.webp',
  './instrucoes-tecnicas/assets/visual/it-38-p08.webp',
  './instrucoes-tecnicas/assets/visual/it-39-p14.webp',
  './instrucoes-tecnicas/assets/visual/it-39-p15.webp',
  './instrucoes-tecnicas/assets/visual/it-39-p16.webp',
  './instrucoes-tecnicas/assets/visual/it-39-p17.webp',
  './instrucoes-tecnicas/assets/visual/it-03-p65.webp',
  './instrucoes-tecnicas/assets/visual/it-03-p89.webp',
  './instrucoes-tecnicas/assets/visual/it-03-p90.webp',
  './instrucoes-tecnicas/assets/visual/it-03-p91.webp',
  './instrucoes-tecnicas/assets/visual/it-03-p92.webp',
  './instrucoes-tecnicas/assets/visual/it-03-p93.webp',
  './instrucoes-tecnicas/assets/visual/it-03-p94.webp',
  './instrucoes-tecnicas/assets/visual/it-10-p27.webp',
  './instrucoes-tecnicas/assets/visual/it-10-p28.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p26.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p27.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p28.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p29.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p30.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p31.webp',
  './instrucoes-tecnicas/assets/visual/it-15-p32.webp',
  './instrucoes-tecnicas/assets/visual/it-41-p69.webp',
  './instrucoes-tecnicas/assets/visual/it-41-p70.webp',
  './instrucoes-tecnicas/assets/visual/it-41-p71.webp',
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

async function buscarOpcionalComLimite(request, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resposta = await fetch(request, { cache: 'no-store', signal: controller.signal });
    return resposta && resposta.ok ? resposta : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function copiarOpcionaisDaVersaoAnterior(cacheAtual) {
  const chaves = (await caches.keys()).filter(key =>
    key.startsWith('gpv-vistorias-pwa-') && key !== CACHE_NAME
  );
  if (!chaves.length) return false;

  const cachesAntigos = await Promise.all(chaves.map(key => caches.open(key)));
  await Promise.allSettled(OPTIONAL_SHELL.map(async url => {
    const req = new Request(new URL(url, self.location.href).href);
    for (const cacheAntigo of cachesAntigos) {
      const resposta = await cacheAntigo.match(req, { ignoreSearch: false });
      if (resposta) {
        await cacheAtual.put(req, resposta.clone());
        return;
      }
    }

    // Se este arquivo ainda não existia na versão anterior, tenta baixar apenas ele,
    // com limite curto para uma conexão ruim não prender a atualização inteira.
    const nova = await buscarOpcionalComLimite(req);
    if (nova) await cacheAtual.put(req, nova.clone());
  }));
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Arquivos críticos continuam sendo baixados na versão atual.
    await cache.addAll(CORE_SHELL);

    // Em atualização, reaproveita localmente os arquivos auxiliares já armazenados
    // (Manual/ITs/imagens), evitando baixar novamente dezenas de arquivos após dias sem uso.
    const migrou = await copiarOpcionaisDaVersaoAnterior(cache);
    if (!migrou) {
      // Primeira instalação: mantém o comportamento offline completo.
      await Promise.allSettled(OPTIONAL_SHELL.map(url => cache.add(url)));
    }
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

async function atualizarCacheEmSegundoPlano(request, cacheKey = request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (_) {
    return null;
  }
}

async function cacheRapidoComAtualizacao(request, fallbackUrl = '', cacheKey = request) {
  const cached = await caches.match(request);
  if (cached) return { response: cached, refresh: atualizarCacheEmSegundoPlano(request, cacheKey) };

  if (fallbackUrl) {
    const fallback = await caches.match(fallbackUrl);
    if (fallback) return { response: fallback, refresh: atualizarCacheEmSegundoPlano(request, cacheKey) };
  }

  // Somente quando não existe shell armazenado é necessário aguardar a rede.
  const response = await fetch(request, { cache: 'no-store' });
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone()).catch(() => {});
  }
  return { response, refresh: Promise.resolve() };
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const resultado = await cacheRapidoComAtualizacao(request, './index.html', './index.html');
      event.waitUntil(resultado.refresh.catch(() => {}));
      return resultado.response;
    })());
    return;
  }

  const destino = request.destination;
  const arquivoCritico = destino === 'style' || destino === 'script' ||
    /\/(?:styles\.css|app\.js|config\.js|ocupacoes\.js|notificacoes-infoscip\.js)$/.test(url.pathname);

  if (arquivoCritico) {
    event.respondWith((async () => {
      const resultado = await cacheRapidoComAtualizacao(request);
      event.waitUntil(resultado.refresh.catch(() => {}));
      return resultado.response;
    })());
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


// =============================================================================
// V23.9.99cl — PUSH SEGURO
// O servidor envia push sem conteúdo. Dados operacionais só aparecem depois
// que o usuário entra no PWA e abre a Central de Notificações.
// =============================================================================
self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('App do Vistoriador', {
    body: 'Novo aviso disponível. Abra o aplicativo para consultar.',
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    tag: 'app-vistoriador-aviso',
    renotify: true,
    requireInteraction: false,
    data: { openAppAlerts: true }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const todas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const base = new URL('./', self.registration.scope).href;
    const existente = todas.find(cliente => String(cliente.url || '').startsWith(base));
    if (existente) {
      try { await existente.focus(); } catch (_) {}
      try { existente.postMessage({ type: 'OPEN_APP_ALERTS' }); } catch (_) {}
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(new URL('./?avisos=1', self.registration.scope).href);
  })());
});
