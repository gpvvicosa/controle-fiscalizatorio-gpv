// V23.9.99ic — shell com acessos diretos aos Manuais do Autuado e do Militar — INFOSCIP em HTML interativo.
// V23.9.99hz — shell com inclusão retroativa de irregularidades constatadas pela Ficha.
// V23.9.99hx — shell com mensagem específica de WhatsApp para irregularidade de Brigada de Incêndio.
// V23.9.99hw — shell com irregularidades estruturadas da Fiscalização e relatórios próprios de Brigada.
// V23.9.99hu — shell da validação cruzada de cidade por GPS, CEP, endereço físico e CNPJ.
// V23.9.99ht — shell do redesenho estrutural de Vistorias Programadas.
// V23.9.99hs — shell do acabamento premium e responsivo de Vistorias Programadas.
// V23.9.99hr — shell do modal de Programadas compacto, sem cadastro e com ação Ver vistoria.
// V23.9.99hq — shell do modal de Vistorias Programadas local-first e responsivo.
// V23.9.99hp — Home mais limpa: Sincronização só aparece quando exige atenção.
// V23.9.99ho — DDU/Rascunhos condicionais e seletor estruturado de ocupações.
// V23.9.99hn — novo shell do Painel com resumo operacional preparado antes da liberação da tela inicial.
// V23.9.99hm — atualizações descobertas após a abertura ficam em segundo plano até a próxima abertura ou ação manual.
// V23.9.99hl — shell da abertura confiável com saudação e continuidade visual dos registros recentes.
// V23.9.99hk — shell do rollback controlado das Metas para a rotina estável HG com backend HK.
const CACHE_NAME = 'gpv-vistorias-shell-20260918-v23-9-99-ic-manuais-interativos-html';
const RUNTIME_CACHE_NAME = 'gpv-vistorias-runtime-documentos-v1';
const VERSION = '23.9.99ic';

// V23.9.99hj — restaura o contrato estável de consulta das Metas através do gateway; backend HI preservado.
// V23.9.99hi — novo shell publica revalidação das Metas e backend HI para Eventos declaratórios.
// V23.9.99hh — Metas iniciadas diretamente em toda entrada do Painel.
// V23.9.99hg — novo shell publica a correção de Metas sem alterar o cache documental sob demanda.
// V23.9.99hf — atualização automática reforçada na abertura/retorno; novo shell assume o controle com segurança.
// V23.9.99hd — abertura local-first, atualização silenciosa e Metas revalidadas sem bloquear o Painel.
// V23.9.99gx — mantém instalação leve; otimização do Painel ocorre no app/backend.
// V23.9.99gw — instalação leve: somente o núcleo necessário para abrir/operar o PWA.
// Manuais, ITs, PDFs e imagens técnicas são armazenados sob demanda em cache separado,
// que sobrevive às trocas de versão do shell e não bloqueia a atualização do aplicativo.
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
  `./assets/splash-app-vistoriador-desktop.webp?v=${VERSION}`,
  `./assets/logo-ddu-181.webp?v=${VERSION}`,
  './offline.html'
];

const IT_SHARED_CRITICAL_PATHS = new Set([
  '/instrucoes-tecnicas/assets/app.js',
  '/instrucoes-tecnicas/assets/its.js',
  '/instrucoes-tecnicas/assets/portal.js',
  '/instrucoes-tecnicas/assets/search-index.js',
  '/instrucoes-tecnicas/assets/style.css'
]);

function caminhoRelativoAoEscopo_(url) {
  const scope = new URL(self.registration.scope);
  const path = new URL(url, scope).pathname;
  const base = scope.pathname.endsWith('/') ? scope.pathname.slice(0, -1) : scope.pathname;
  return base && path.startsWith(base) ? path.slice(base.length) || '/' : path;
}

function ehRotaIts_(url) {
  const path = caminhoRelativoAoEscopo_(url);
  return path === '/instrucoes-tecnicas' || path.startsWith('/instrucoes-tecnicas/');
}

function ehAssetCompartilhadoIts_(url) {
  return IT_SHARED_CRITICAL_PATHS.has(caminhoRelativoAoEscopo_(url));
}

function ehDocumentoRuntime_(url) {
  const path = caminhoRelativoAoEscopo_(url);
  return path === '/base-normativa-its.json' ||
    path === '/assets/infoscip-fiscalizacao-search-index.json' ||
    path === '/assets/manual-do-autuado-infoscip-fiscalizacao.pdf' ||
    path === '/assets/manual-do-militar-infoscip-fiscalizacao.pdf' ||
    path.startsWith('/assets/manual-pages/') ||
    path.startsWith('/instrucoes-tecnicas/') ||
    path.startsWith('/manual/');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('gpv-vistorias-pwa-') || key.startsWith('gpv-vistorias-shell-'))
      .filter(key => key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    // RUNTIME_CACHE_NAME é intencionalmente preservado para manter documentos já
    // consultados disponíveis offline sem recopiá-los a cada atualização do PWA.
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function atualizarCacheEmSegundoPlano(request, cacheKey = request, cacheName = CACHE_NAME) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok && response.status === 200) {
      const cache = await caches.open(cacheName);
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (_) {
    return null;
  }
}

async function cacheRapidoComAtualizacao(request, fallbackUrl = '', cacheKey = request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: false }) || await cache.match(request, { ignoreSearch: true });
  if (cached) return { response: cached, refresh: atualizarCacheEmSegundoPlano(request, cacheKey, CACHE_NAME) };

  if (fallbackUrl) {
    const fallback = await cache.match(fallbackUrl, { ignoreSearch: true });
    if (fallback) return { response: fallback, refresh: atualizarCacheEmSegundoPlano(request, cacheKey, CACHE_NAME) };
  }

  const response = await fetch(request, { cache: 'no-store' });
  if (response && response.ok && response.status === 200) cache.put(request, response.clone()).catch(() => {});
  return { response, refresh: Promise.resolve() };
}

async function redePrimeiroComCache_(request, fallbackUrl = '', cacheName = RUNTIME_CACHE_NAME) {
  let response = null;
  try {
    response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      if (response.status === 200) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      }
      return response;
    }
  } catch (_) {
    response = null;
  }

  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  if (fallbackUrl) {
    const fallback = await cache.match(fallbackUrl, { ignoreSearch: true });
    if (fallback) return fallback;
  }
  if (response) return response;
  throw new Error('Recurso indisponível na rede e no cache.');
}

async function runtimeCachePrimeiro_(request) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.status === 200) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    if (ehRotaIts_(url)) {
      event.respondWith(redePrimeiroComCache_(request, './instrucoes-tecnicas/index.html', RUNTIME_CACHE_NAME));
      return;
    }

    event.respondWith((async () => {
      const resultado = await cacheRapidoComAtualizacao(request, './index.html', './index.html');
      event.waitUntil(resultado.refresh.catch(() => {}));
      return resultado.response;
    })());
    return;
  }

  if (ehAssetCompartilhadoIts_(url)) {
    event.respondWith(redePrimeiroComCache_(request, '', RUNTIME_CACHE_NAME));
    return;
  }

  const destino = request.destination;
  const arquivoCritico = destino === 'style' || destino === 'script' ||
    /\/(?:styles\.css|app\.js|config\.js|ocupacoes\.js|notificacoes-infoscip\.js)$/.test(url.pathname);

  if (arquivoCritico && !ehDocumentoRuntime_(url)) {
    event.respondWith((async () => {
      const resultado = await cacheRapidoComAtualizacao(request);
      event.waitUntil(resultado.refresh.catch(() => {}));
      return resultado.response;
    })());
    return;
  }

  if (ehDocumentoRuntime_(url)) {
    event.respondWith(runtimeCachePrimeiro_(request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.status === 200 && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    } catch (error) {
      if (request.destination === 'document') {
        const offline = await caches.match('./offline.html', { ignoreSearch: true });
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
    icon: './assets/app-vistoriador-icon-192-ck.png',
    badge: './assets/app-vistoriador-icon-192-ck.png',
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
