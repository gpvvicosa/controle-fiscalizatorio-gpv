/**
 * CONTROLE FISCALIZATÓRIO — GPV VIÇOSA
 * Gateway Cloudflare Worker entre o PWA (GitHub Pages) e o Apps Script.
 *
 * SEGREDOS/VARIÁVEIS NO CLOUDFLARE (NUNCA COLOCAR NO GITHUB):
 *   APPS_SCRIPT_URL   = URL /exec do Web App do Apps Script
 *   APPS_SCRIPT_TOKEN = token retornado por configurarPwaApp()
 *   GPV_ACCESS_KEY    = chave legada, mantida apenas para aparelhos ainda não atualizados
 *   ALLOWED_ORIGINS   = origens permitidas, separadas por vírgula
 *                       Ex.: https://gpvvicosa.github.io
 */

const ACTIONS = new Set(['ping', 'config', 'cnpj', 'save', 'update', 'auth', 'users', 'user_add', 'user_update', 'user_delete']);
const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB — uploads PDF/DWG até 8 MB em Base64

const CONFIG_READ_QUERIES = new Set(['', 'duplicidade', 'estabelecimento_historico', 'metas', 'programadas', 'pscip', 'registro', 'registros', 'responsavel_telefone', 'sistema_status', 'ddus']);

function podeRepetirComSeguranca(action, body) {
  if (['ping', 'cnpj', 'auth', 'users'].includes(action)) return true;
  if (action !== 'config') return false;
  return CONFIG_READ_QUERIES.has(String(body?.consulta || '').trim().toLowerCase());
}

async function chamarAppsScript(url, upstreamBody, repetir = false) {
  const tentativas = repetir ? 2 : 1;
  let ultima = null;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const response = await fetch(String(url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json',
          'User-Agent': 'GPV-Vicosa-PWA-Gateway/1.1'
        },
        body: JSON.stringify(upstreamBody),
        redirect: 'follow'
      });
      const texto = await response.text();
      let dados = null;
      try { dados = JSON.parse(texto || '{}'); } catch (e) {}
      if (dados) return { response, dados, texto };
      ultima = { response, dados: null, texto };
      if (tentativa < tentativas) await new Promise(resolve => setTimeout(resolve, 450));
    } catch (error) {
      ultima = { error };
      if (tentativa < tentativas) await new Promise(resolve => setTimeout(resolve, 450));
    }
  }
  return ultima || {};
}

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors
    }
  });
}

function originsPermitidas(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function corsHeaders(origin, env) {
  const permitidas = originsPermitidas(env);
  const origemNormalizada = String(origin || '').replace(/\/$/, '');
  const permitida = origemNormalizada && permitidas.includes(origemNormalizada);
  return {
    'Access-Control-Allow-Origin': permitida ? origemNormalizada : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-GPV-Access-Key, X-GPV-App-Version',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function origemAutorizada(request, env) {
  const origin = String(request.headers.get('Origin') || '').replace(/\/$/, '');
  if (!origin) return false;
  return originsPermitidas(env).includes(origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Teste simples: abrir a URL do Worker no navegador deve mostrar que o gateway está online.
    if (request.method === 'GET') {
      return json({
        ok: true,
        service: 'Controle Fiscalizatório GPV — API Gateway',
        status: 'online',
        endpoint: url.hostname
      });
    }

    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      if (!origemAutorizada(request, env)) return json({ ok: false, error: 'Origem não autorizada.' }, 403, cors);
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Método não permitido.' }, 405, cors);
    }

    if (!origemAutorizada(request, env)) {
      return json({ ok: false, error: 'Origem não autorizada.' }, 403, cors);
    }

    if (!env.APPS_SCRIPT_URL || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(String(env.APPS_SCRIPT_URL))) {
      return json({ ok: false, error: 'APPS_SCRIPT_URL não configurada corretamente no Worker.' }, 500, cors);
    }
    if (!env.APPS_SCRIPT_TOKEN) {
      return json({ ok: false, error: 'APPS_SCRIPT_TOKEN não configurado no Worker.' }, 500, cors);
    }

    const tamanho = Number(request.headers.get('Content-Length') || 0);
    if (tamanho > MAX_BODY_BYTES) {
      return json({ ok: false, error: 'Requisição muito grande.' }, 413, cors);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'Requisição muito grande.' }, 413, cors);
      body = JSON.parse(raw || '{}');
    } catch (e) {
      return json({ ok: false, error: 'JSON inválido.' }, 400, cors);
    }

    const action = String(body.action || '').trim().toLowerCase();
    if (!ACTIONS.has(action)) {
      return json({ ok: false, error: 'Ação não permitida.' }, 400, cors);
    }

    // V19+: autenticação por Nº BM é validada no Apps Script. Durante a transição,
    // versões antigas continuam usando a chave legada já configurada no Worker.
    const modoBm = String(body.clientAuthVersion || '').trim().toLowerCase() === 'bm-v1';
    const acaoBm = ['auth', 'users', 'user_add', 'user_update', 'user_delete'].includes(action);
    if (!modoBm && !acaoBm) {
      const clientKey = String(request.headers.get('X-GPV-Access-Key') || '');
      if (!env.GPV_ACCESS_KEY || clientKey !== String(env.GPV_ACCESS_KEY)) {
        return json({ ok: false, error: 'Código de acesso inválido.' }, 401, cors);
      }
    }

    // O token real do Apps Script é acrescentado APENAS aqui, no Worker.
    // Ele nunca é enviado ao navegador e nunca fica salvo no GitHub.
    const upstreamBody = { ...body, action, token: String(env.APPS_SCRIPT_TOKEN) };

    try {
      const resultado = await chamarAppsScript(
        env.APPS_SCRIPT_URL,
        upstreamBody,
        podeRepetirComSeguranca(action, body)
      );

      if (resultado.error) throw resultado.error;
      const upstream = resultado.response;
      const dados = resultado.dados;

      if (!dados) {
        return json({
          ok: false,
          error: 'O serviço do Apps Script respondeu temporariamente fora do padrão. Tente novamente em instantes.',
          upstreamStatus: upstream?.status || 0
        }, 502, cors);
      }

      let status = upstream?.ok && dados?.ok !== false ? 200 : 502;
      if (String(dados?.code || '') === 'AUTH_REQUIRED') status = 401;
      else if (String(dados?.code || '') === 'BM_NAO_AUTORIZADO') status = 403;
      else if (String(dados?.code || '') === 'BM_INVALIDO') status = 400;
      return json(dados, status, cors);
    } catch (e) {
      return json({
        ok: false,
        error: 'Não foi possível comunicar com o Apps Script.',
        detail: e && e.message ? e.message : String(e)
      }, 502, cors);
    }
  }
};
