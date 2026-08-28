(() => {
      'use strict';

      const DRAFT_KEY = 'appVistoriaGpvUmaPaginaV2';
      const PENDING_KEY = 'appVistoriaGpvPendentesV1';
      const CONFIG_CACHE_KEY = 'appVistoriaGpvConfigPwaV1';
      const DB_NAME = 'ControleVistoriasGPV';
      const DB_VERSION = 2;
      const DB_STORE = 'pendentes';
      const DB_PHOTO_STORE = 'fotos_pendentes';
      const API_URL = String(window.GPV_PUBLIC_CONFIG?.apiUrl || '').trim();
      const AUTH_USER_STORAGE = 'gpvVistoriasUsuarioBmV1';
      const AUTH_SESSION_STORAGE = 'gpvVistoriasSessaoBmV1';
      const AUTH_PROFILES_STORAGE = 'gpvVistoriasPerfisBmV1';
      const AUTH_DEVICE_PIN_KEY_STORAGE = 'gpvVistoriasChaveSenhaLocalV1';
      const AUTH_SHARED_DEVICE_STORAGE = 'gpvVistoriasDispositivoCompartilhadoV1';
      const AUTH_LIMITED_SESSION_HOURS = 10;
      const AUTH_CLIENT_VERSION = 'bm-v1';
      const APP_VERSION = '23.9.99';
      const PANEL_CACHE_STORAGE = 'gpvPainelCacheV1';
      const RECORD_CACHE_STORAGE = 'gpvFichaCacheV1';
      const GOALS_CACHE_STORAGE = 'gpvMetasCacheV1';
      const SUGGESTIONS_CACHE_STORAGE = 'gpvSugestoesFiscalizacaoCacheV2Cronologica';
      const PANEL_CACHE_TTL_MS = 10 * 60 * 1000;
      const PANEL_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
      const PANEL_FOREGROUND_REFRESH_MS = 15 * 1000;
      const PANEL_PERIODIC_REFRESH_MS = 60 * 1000;
      const PANEL_REQUEST_STALE_MS = 25 * 1000;
      const PANEL_LAST_SUCCESS_STORAGE = 'gpvPainelUltimaRespostaV1';
      const PANEL_LAST_ERROR_STORAGE = 'gpvPainelUltimaFalhaV1';
      const APP_LAST_API_SUCCESS_STORAGE = 'gpvUltimaRespostaApiV1';
      const RECORD_CACHE_TTL_MS = 10 * 60 * 1000;
      const GOALS_CACHE_TTL_MS = 10 * 60 * 1000;
      const GOALS_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
      const SUGGESTIONS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
      const SUGGESTIONS_REFRESH_SOFT_MS = 5 * 60 * 1000;
      const API_READ_RETRY_DELAY_MS = 700;
      const DEVICE_NAME_STORAGE = 'gpvVistoriasNomeDispositivoV1';
      const APP_LAST_ACTIVE_STORAGE = 'gpvUltimaAtividadeAppV1';
      const APP_LONG_IDLE_MS = 8 * 60 * 60 * 1000;
      const USERS_CACHE_STORAGE = 'gpvVistoriadoresCacheV1';
      const DDU_CACHE_STORAGE = 'gpvDdusCacheV1';
      let appRetomadaAposLongaPausa_ = false;

      function registrarEstadoRetomadaApp_() {
        const agora = Date.now();
        let ultimo = 0;
        try { ultimo = Number(localStorage.getItem(APP_LAST_ACTIVE_STORAGE) || 0); } catch (_) {}
        appRetomadaAposLongaPausa_ = Boolean(ultimo && agora - ultimo >= APP_LONG_IDLE_MS);
        try { localStorage.setItem(APP_LAST_ACTIVE_STORAGE, String(agora)); } catch (_) {}
        return appRetomadaAposLongaPausa_;
      }

      function marcarAtividadeApp_() {
        try { localStorage.setItem(APP_LAST_ACTIVE_STORAGE, String(Date.now())); } catch (_) {}
      }

      registrarEstadoRetomadaApp_();
      let authState = { usuario: null, sessionToken: '' };
      let authPendingUserId = '';
      let authPendingBm = '';
      let authSessionTimer = 0;
      const DEFAULT_CONFIG = Object.freeze({
        ok: true,
        titulo: 'Controle de Vistorias — GPV Viçosa',
        formularioContingenciaUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSennudBo6iSNJvdLg0753X9t7mTtKkdZcuTafg0EHnfEXD0Yg/viewform?usp=header',
        receitaCnpjUrl: 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp',
        consultaCnpjFonte: 'OpenCNPJ',
        planilhaUrl: '',
        opcoes: {
          cidade: ['Viçosa','Cajuri','Canaã','Araponga','Coimbra','Ervália','Paula Cândido','Pedra do Anta','Porto Firme','Presidente Bernardes','São Geraldo','São Miguel do Anta','Teixeiras','Outro'],
          sancao: ['Autuado','Advertência','Notificado','Regularizado','Liberado','Pendente — multa em aberto','Pendente — conferir multa no INFOSCIP'],
          tipoVistoria: [], natureza: [],
          demandaPrincipal: ['Alerta Vermelho','DDU','Liberação','Iniciativa','PET','Eventos declaratórios','Vistoria Acessória'],
          categoriaMeta: ['', 'Brigada','CLCB','Renovação AVCB','Eventos declaratórios','Nível de risco III'],
          ocupacao: [], responsavel: [], profissao: [], estadoCivil: [], escolaridade: [],
          enderecoCorrespondencia: ['O Mesmo']
        },
        padroes: { cidade: 'Viçosa', enderecoCorrespondencia: 'O Mesmo' }
      });

      function decodificarPayloadSessaoBm_(token) {
        const parte = String(token || '').split('.')[0] || '';
        if (!parte) return null;
        try {
          const normalizada = parte.replace(/-/g, '+').replace(/_/g, '/');
          const preenchida = normalizada + '='.repeat((4 - (normalizada.length % 4)) % 4);
          const texto = decodeURIComponent(Array.from(atob(preenchida)).map(ch => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
          const payload = JSON.parse(texto);
          return payload && Number(payload.exp || 0) ? payload : null;
        } catch (_) {
          return null;
        }
      }

      function sessaoTokenExpiradaBm_(token) {
        const payload = decodificarPayloadSessaoBm_(token);
        return Boolean(payload && Number(payload.exp || 0) <= Date.now());
      }

      function tokenSessaoLimitada10hBm_(token) {
        const payload = decodificarPayloadSessaoBm_(token);
        if (!payload) return false;
        const duracao = Number(payload.exp || 0) - Number(payload.iat || 0);
        return duracao > 0 && duracao <= (AUTH_LIMITED_SESSION_HOURS * 60 * 60 * 1000) + (5 * 60 * 1000);
      }

      function dispositivoCompartilhadoBm_() {
        try { return localStorage.getItem(AUTH_SHARED_DEVICE_STORAGE) === '1'; }
        catch (_) { return false; }
      }

      function marcarDispositivoCompartilhadoBm_() {
        try { localStorage.setItem(AUTH_SHARED_DEVICE_STORAGE, '1'); } catch (_) {}
      }

      function quantidadePerfisConhecidosRawBm_() {
        try {
          const bruto = JSON.parse(localStorage.getItem(AUTH_PROFILES_STORAGE) || '[]');
          return Array.isArray(bruto) ? bruto.filter(item => item?.usuario?.id).length : 0;
        } catch (_) { return 0; }
      }

      function dispositivoCompartilhadoPrevistoBm_(bm = '', userId = '') {
        if (dispositivoCompartilhadoBm_()) return true;
        let lista = [];
        try {
          const bruto = JSON.parse(localStorage.getItem(AUTH_PROFILES_STORAGE) || '[]');
          if (Array.isArray(bruto)) lista = bruto.filter(item => item?.usuario?.id);
        } catch (_) {}
        if (lista.length > 1) return true;
        if (!lista.length) return false;
        const alvoId = String(userId || '').trim();
        const alvoBm = normalizarBmCliente_(bm || '');
        return lista.some(item => {
          if (alvoId) return String(item.usuario?.id || '') !== alvoId;
          if (alvoBm) return normalizarBmCliente_(item.usuario?.bm || '') !== alvoBm;
          return false;
        });
      }

      function aplicarPoliticaDispositivoCompartilhadoBm_() {
        let lista = [];
        try {
          const bruto = JSON.parse(localStorage.getItem(AUTH_PROFILES_STORAGE) || '[]');
          if (Array.isArray(bruto)) lista = bruto;
        } catch (_) {}
        if (lista.filter(item => item?.usuario?.id).length > 1) marcarDispositivoCompartilhadoBm_();
        if (!dispositivoCompartilhadoBm_()) return;
        let alterou = false;
        lista.forEach(item => {
          if (item && item.savedPinCipher) {
            item.savedPinCipher = '';
            alterou = true;
          }
        });
        if (alterou) {
          try { localStorage.setItem(AUTH_PROFILES_STORAGE, JSON.stringify(lista.slice(0, 12))); } catch (_) {}
        }
      }

      function sessaoDeveSerLimitada10hBm_(bm = '', userId = '') {
        if (dispositivoCompartilhadoPrevistoBm_(bm, userId)) return true;
        return !Boolean(authSavePasswordCheck?.checked);
      }

      function limparTimerSessaoBm_() {
        if (authSessionTimer) clearTimeout(authSessionTimer);
        authSessionTimer = 0;
      }

      function agendarVerificacaoExpiracaoSessaoBm_() {
        limparTimerSessaoBm_();
        const token = String(authState.sessionToken || '').trim();
        const payload = decodificarPayloadSessaoBm_(token);
        if (!payload?.exp) return;
        const restante = Number(payload.exp) - Date.now();
        if (restante <= 0) {
          setTimeout(() => expirarSessaoBm_(), 0);
          return;
        }
        authSessionTimer = window.setTimeout(() => {
          if (sessaoTokenExpiradaBm_(authState.sessionToken)) expirarSessaoBm_();
          else agendarVerificacaoExpiracaoSessaoBm_();
        }, Math.min(restante + 250, 60 * 60 * 1000));
      }

      function expirarSessaoBm_() {
        if (!authState.usuario?.id && !authState.sessionToken) return;
        try { prepararSaidaUsuarioBm_(); }
        catch (_) {
          limparSessaoLocalBm_();
          limparEstadoPinLogin_();
        }
        const perfis = carregarPerfisConhecidosBm_();
        const mensagem = `Sessão expirada após ${AUTH_LIMITED_SESSION_HOURS} horas. Informe sua senha para entrar novamente.`;
        if (perfis.length) mostrarEscolhaUsuariosDispositivo_(mensagem);
        else mostrarTelaLoginBm_(mensagem);
        if (authMessage) authMessage.textContent = mensagem;
      }

      function validarSessaoLocalAtivaBm_() {
        const token = String(authState.sessionToken || '').trim();
        if (!token) return false;
        if (!sessaoTokenExpiradaBm_(token)) return true;
        expirarSessaoBm_();
        return false;
      }

      function atualizarPoliticaLoginBm_() {
        if (!authSavePasswordCheck) return;
        const compartilhado = dispositivoCompartilhadoBm_() || quantidadePerfisConhecidosRawBm_() > 1;
        authSavePasswordCheck.disabled = compartilhado;
        if (compartilhado) authSavePasswordCheck.checked = false;
        const nota = document.getElementById('authSavePasswordNote');
        if (nota) {
          nota.textContent = compartilhado
            ? `Aparelho compartilhado: a senha não será armazenada e cada sessão expira após ${AUTH_LIMITED_SESSION_HOURS} horas.`
            : `Sem salvar a senha, a sessão expira automaticamente após ${AUTH_LIMITED_SESSION_HOURS} horas. Marque somente em aparelho de uso individual.`;
        }
      }

      function carregarSessaoLocalBm_() {
        let usuario = null;
        let sessionToken = '';
        try { usuario = JSON.parse(localStorage.getItem(AUTH_USER_STORAGE) || 'null'); } catch (e) {}
        try { sessionToken = String(localStorage.getItem(AUTH_SESSION_STORAGE) || '').trim(); } catch (e) {}
        if (sessionToken && sessaoTokenExpiradaBm_(sessionToken)) {
          try {
            localStorage.removeItem(AUTH_USER_STORAGE);
            localStorage.removeItem(AUTH_SESSION_STORAGE);
          } catch (_) {}
          usuario = null;
          sessionToken = '';
        }
        authState = { usuario: usuario && usuario.id ? usuario : null, sessionToken };
        if (sessionToken) agendarVerificacaoExpiracaoSessaoBm_();
        return authState;
      }

      function carregarPerfisConhecidosBm_() {
        let lista = [];
        try {
          const bruto = JSON.parse(localStorage.getItem(AUTH_PROFILES_STORAGE) || '[]');
          if (Array.isArray(bruto)) lista = bruto;
        } catch (e) {}

        aplicarPoliticaDispositivoCompartilhadoBm_();
        try {
          const brutoAtualizado = JSON.parse(localStorage.getItem(AUTH_PROFILES_STORAGE) || '[]');
          if (Array.isArray(brutoAtualizado)) lista = brutoAtualizado;
        } catch (_) {}

        lista = lista
          .filter(item => item && item.usuario && item.usuario.id && item.sessionToken)
          .map(item => ({
            usuario: item.usuario,
            sessionToken: String(item.sessionToken || ''),
            lastUsedAt: Number(item.lastUsedAt || 0),
            offlinePinSalt: String(item.offlinePinSalt || ''),
            offlinePinVerifier: String(item.offlinePinVerifier || ''),
            savedPinCipher: String(item.savedPinCipher || '')
          }));

        // Migração transparente da V19: o usuário que já estava gravado no aparelho
        // passa a compor a lista de perfis conhecidos sem exigir novo login.
        const atual = carregarSessaoLocalBm_();
        if (atual.usuario && atual.sessionToken && !lista.some(item => String(item.usuario.id) === String(atual.usuario.id))) {
          lista.push({ usuario: atual.usuario, sessionToken: atual.sessionToken, lastUsedAt: Date.now() });
          salvarPerfisConhecidosBm_(lista);
        }

        return lista.sort((a, b) => Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0));
      }

      function salvarPerfisConhecidosBm_(lista) {
        try {
          const normalizados = (Array.isArray(lista) ? lista : [])
            .filter(item => item && item.usuario && item.usuario.id && item.sessionToken)
            .slice(0, 12);
          localStorage.setItem(AUTH_PROFILES_STORAGE, JSON.stringify(normalizados));
        } catch (e) {}
        aplicarPoliticaDispositivoCompartilhadoBm_();
      }

      function registrarPerfilConhecidoBm_(usuario, sessionToken) {
        if (!usuario?.id || !sessionToken) return;
        const existentes = carregarPerfisConhecidosBm_();
        const anterior = existentes.find(item => String(item.usuario.id) === String(usuario.id));
        const lista = existentes.filter(item => String(item.usuario.id) !== String(usuario.id));
        lista.unshift({
          usuario,
          sessionToken: String(sessionToken),
          lastUsedAt: Date.now(),
          offlinePinSalt: String(anterior?.offlinePinSalt || ''),
          offlinePinVerifier: String(anterior?.offlinePinVerifier || ''),
          savedPinCipher: String(anterior?.savedPinCipher || '')
        });
        salvarPerfisConhecidosBm_(lista);
      }

      function removerPerfilConhecidoBm_(userId) {
        if (!userId) return;
        salvarPerfisConhecidosBm_(carregarPerfisConhecidosBm_().filter(item => String(item.usuario.id) !== String(userId)));
      }

      function bytesParaBase64Bm_(bytes) {
        let bin = '';
        const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
        return btoa(bin);
      }

      function base64ParaBytesBm_(valor) {
        const bin = atob(String(valor || ''));
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
        return arr;
      }

      async function obterChaveSenhaLocalBm_() {
        if (!window.crypto?.subtle) throw new Error('Este navegador não oferece suporte ao armazenamento local protegido.');
        let chaveB64 = '';
        try { chaveB64 = String(localStorage.getItem(AUTH_DEVICE_PIN_KEY_STORAGE) || ''); } catch (e) {}
        let bytes;
        try { bytes = chaveB64 ? base64ParaBytesBm_(chaveB64) : null; } catch (e) { bytes = null; }
        if (!bytes || bytes.length !== 32) {
          bytes = crypto.getRandomValues(new Uint8Array(32));
          try { localStorage.setItem(AUTH_DEVICE_PIN_KEY_STORAGE, bytesParaBase64Bm_(bytes)); } catch (e) {}
        }
        return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      }

      async function criptografarSenhaLocalBm_(pin) {
        const senha = normalizarPinCliente_(pin);
        if (!/^\d{6}$/.test(senha)) throw new Error('Senha inválida para armazenamento local.');
        const chave = await obterChaveSenhaLocalBm_();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const dados = new TextEncoder().encode(senha);
        const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, dados);
        return `v1.${bytesParaBase64Bm_(iv)}.${bytesParaBase64Bm_(new Uint8Array(cifrado))}`;
      }

      async function descriptografarSenhaLocalBm_(valor) {
        const partes = String(valor || '').split('.');
        if (partes.length !== 3 || partes[0] !== 'v1') return '';
        try {
          const chave = await obterChaveSenhaLocalBm_();
          const iv = base64ParaBytesBm_(partes[1]);
          const cifrado = base64ParaBytesBm_(partes[2]);
          const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chave, cifrado);
          return normalizarPinCliente_(new TextDecoder().decode(aberto));
        } catch (e) { return ''; }
      }

      async function salvarSenhaLocalPerfilBm_(userId, pin) {
        const id = String(userId || '').trim();
        const senha = normalizarPinCliente_(pin);
        if (!id || !/^\d{6}$/.test(senha)) return false;
        try {
          const lista = carregarPerfisConhecidosBm_();
          const item = lista.find(p => String(p.usuario.id) === id);
          if (!item) return false;
          item.savedPinCipher = await criptografarSenhaLocalBm_(senha);
          item.lastUsedAt = Date.now();
          salvarPerfisConhecidosBm_(lista);
          atualizarUsuarioLogadoUi_();
          return true;
        } catch (e) { return false; }
      }

      function apagarSenhaLocalPerfilBm_(userId) {
        const id = String(userId || '').trim();
        if (!id) return;
        const lista = carregarPerfisConhecidosBm_();
        const item = lista.find(p => String(p.usuario.id) === id);
        if (!item) return;
        item.savedPinCipher = '';
        salvarPerfisConhecidosBm_(lista);
        atualizarUsuarioLogadoUi_();
      }

      function perfilTemSenhaSalvaBm_(userId) {
        const id = String(userId || '').trim();
        return Boolean(carregarPerfisConhecidosBm_().find(p => String(p.usuario.id) === id)?.savedPinCipher);
      }

      function invalidarCredenciaisLocaisPerfilBm_(userId) {
        const id = String(userId || '').trim();
        if (!id) return;
        const lista = carregarPerfisConhecidosBm_();
        const item = lista.find(p => String(p.usuario.id) === id);
        if (!item) return;
        item.savedPinCipher = '';
        item.offlinePinSalt = '';
        item.offlinePinVerifier = '';
        salvarPerfisConhecidosBm_(lista);
        atualizarUsuarioLogadoUi_();
      }

      function normalizarPinCliente_(valor) {
        return String(valor || '').replace(/\D/g, '').slice(0, 6);
      }

      async function derivarVerificadorPinOfflineBm_(pin, saltB64 = '') {
        if (!window.crypto?.subtle) throw new Error('Este navegador não oferece suporte à validação segura de senha offline.');
        const enc = new TextEncoder();
        const salt = saltB64 ? base64ParaBytesBm_(saltB64) : crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(String(pin || '')), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, keyMaterial, 256);
        return { salt: bytesParaBase64Bm_(salt), verifier: bytesParaBase64Bm_(new Uint8Array(bits)) };
      }

      async function registrarCredencialOfflineBm_(usuario, pin) {
        if (!usuario?.id || !/^\d{6}$/.test(String(pin || ''))) return;
        try {
          const derivado = await derivarVerificadorPinOfflineBm_(pin);
          const lista = carregarPerfisConhecidosBm_();
          const item = lista.find(p => String(p.usuario.id) === String(usuario.id));
          if (!item) return;
          item.offlinePinSalt = derivado.salt;
          item.offlinePinVerifier = derivado.verifier;
          item.lastUsedAt = Date.now();
          salvarPerfisConhecidosBm_(lista);
        } catch (e) {}
      }

      async function validarPinOfflineBm_(perfil, pin) {
        if (!perfil?.offlinePinSalt || !perfil?.offlinePinVerifier) return false;
        try {
          const derivado = await derivarVerificadorPinOfflineBm_(pin, perfil.offlinePinSalt);
          return derivado.verifier === String(perfil.offlinePinVerifier || '');
        } catch (e) {
          return false;
        }
      }

      function salvarSessaoLocalBm_(usuario, sessionToken) {
        authState = { usuario: usuario || null, sessionToken: String(sessionToken || '') };
        try {
          if (usuario) localStorage.setItem(AUTH_USER_STORAGE, JSON.stringify(usuario));
          else localStorage.removeItem(AUTH_USER_STORAGE);
          if (sessionToken) localStorage.setItem(AUTH_SESSION_STORAGE, String(sessionToken));
          else localStorage.removeItem(AUTH_SESSION_STORAGE);
          // Remove o código antigo do aparelho; V19+ usa exclusivamente Nº BM.
          localStorage.removeItem('gpvVistoriasAccessKeyV1');
        } catch (e) {}
        if (usuario && sessionToken) registrarPerfilConhecidoBm_(usuario, sessionToken);
        if (sessionToken) agendarVerificacaoExpiracaoSessaoBm_();
        else limparTimerSessaoBm_();
        atualizarUsuarioLogadoUi_();
      }

      function limparSessaoLocalBm_() {
        // Limpa apenas o usuário ativo. A lista de perfis conhecidos permanece para
        // permitir a escolha rápida em tablets compartilhados.
        salvarSessaoLocalBm_(null, '');
      }

      function draftUserId_() {
        const id = String(authState.usuario?.id || 'sem-usuario').replace(/[^A-Za-z0-9_-]/g, '');
        return id || 'sem-usuario';
      }

      function draftIndexKey_() {
        return `${DRAFT_KEY}:index:${draftUserId_()}`;
      }

      function draftKeyAtual_(recordId = currentRecordId) {
        const rid = String(recordId || '').replace(/[^A-Za-z0-9_-]/g, '');
        return `${DRAFT_KEY}:${draftUserId_()}:${rid || 'sem-registro'}`;
      }

      function draftFinalizadosKey_() {
        return `${DRAFT_KEY}:finalizados:${draftUserId_()}`;
      }

      function draftAssinaturasFinalizadasKey_() {
        return `${DRAFT_KEY}:assinaturas-finalizadas:${draftUserId_()}`;
      }

      function assinaturaRascunhoPayload_(payload = {}) {
        const p = payload && typeof payload === 'object' ? payload : {};
        const preparacaoId = String(p._appPreparacaoId || '').trim();
        if (preparacaoId) return `prep:${preparacaoId}`;

        const dduId = String(p._appDduId || '').trim();
        if (dduId) return `ddu:${dduId}`;

        const eventoDeclaracao = String(p.eventoDeclaracaoNumero || '').trim();
        if (eventoDeclaracao) return `evento:${normalize(eventoDeclaracao)}`;

        const documento = digits(p.cnpj || '');
        const pscip = String(p.pscip || '').trim().toUpperCase().replace(/\s+/g, '');
        const endereco = normalize(p.endereco || '').replace(/\s+/g, ' ').trim();
        const numero = normalize(p.numero || '').replace(/\s+/g, ' ').trim();
        const tipo = normalize(p.tipoVistoria || '').replace(/\s+/g, ' ').trim();
        const nome = normalize(p.nomeFantasia || p.razaoSocial || '').replace(/\s+/g, ' ').trim();

        if (documento.length >= 11 && endereco) {
          return `doc:${documento}|end:${endereco}|num:${numero}|tipo:${tipo}`;
        }
        if (pscip && endereco) {
          return `pscip:${pscip}|end:${endereco}|num:${numero}|tipo:${tipo}`;
        }
        if (nome && endereco) {
          return `nome:${nome}|end:${endereco}|num:${numero}|tipo:${tipo}`;
        }
        return '';
      }

      function lerAssinaturasFinalizadasLocais_() {
        try {
          const bruto = JSON.parse(localStorage.getItem(draftAssinaturasFinalizadasKey_()) || '{}');
          if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
          const limite = Date.now() - 1000 * 60 * 60 * 24 * 7;
          const limpo = {};
          Object.entries(bruto).forEach(([assinatura, encerradoEm]) => {
            const data = Number(encerradoEm || 0);
            if (assinatura && data >= limite) limpo[assinatura] = data;
          });
          if (Object.keys(limpo).length !== Object.keys(bruto).length) {
            localStorage.setItem(draftAssinaturasFinalizadasKey_(), JSON.stringify(limpo));
          }
          return limpo;
        } catch (e) {
          return {};
        }
      }

      function marcarAssinaturaFinalizadaLocal_(payload) {
        const assinatura = assinaturaRascunhoPayload_(payload);
        if (!assinatura) return '';
        try {
          const mapa = lerAssinaturasFinalizadasLocais_();
          mapa[assinatura] = Date.now();
          localStorage.setItem(draftAssinaturasFinalizadasKey_(), JSON.stringify(mapa));
        } catch (e) {}
        return assinatura;
      }

      function assinaturaFinalizadaLocal_(payload) {
        const assinatura = assinaturaRascunhoPayload_(payload);
        if (!assinatura) return false;
        return Boolean(lerAssinaturasFinalizadasLocais_()[assinatura]);
      }

      function lerRascunhoLocalPorId_(recordId) {
        try {
          const raw = localStorage.getItem(draftKeyAtual_(recordId));
          if (!raw) return null;
          const draft = JSON.parse(raw);
          return draft && typeof draft === 'object' ? draft : null;
        } catch (e) {
          return null;
        }
      }

      function removerRascunhosLocaisRelacionados_(payloadFinal, recordIdFinal = '') {
        const assinaturaFinal = assinaturaRascunhoPayload_(payloadFinal);
        const idsRemovidos = new Set();
        const removerId = id => {
          const rid = String(id || '').trim();
          if (!rid || idsRemovidos.has(rid)) return;
          idsRemovidos.add(rid);
          marcarRascunhoFinalizadoLocal_(rid);
          removerRascunhoLocal_(rid);
        };

        removerId(recordIdFinal || payloadFinal?._appRegistroId || '');

        if (assinaturaFinal) {
          for (const item of lerIndiceRascunhosLocais_()) {
            const draft = lerRascunhoLocalPorId_(item && item.id);
            if (!draft?.payload) continue;
            if (assinaturaRascunhoPayload_(draft.payload) === assinaturaFinal) removerId(item.id);
          }

          // Defesa para chaves antigas que ficaram fora do índice local.
          try {
            const prefixo = `${DRAFT_KEY}:${draftUserId_()}:`;
            const reservadas = new Set([
              draftIndexKey_(),
              draftFinalizadosKey_(),
              draftAssinaturasFinalizadasKey_()
            ]);
            const chaves = [];
            for (let i = 0; i < localStorage.length; i += 1) {
              const chave = localStorage.key(i);
              if (chave && chave.startsWith(prefixo) && !reservadas.has(chave)) chaves.push(chave);
            }
            chaves.forEach(chave => {
              try {
                const draft = JSON.parse(localStorage.getItem(chave) || '{}');
                if (assinaturaRascunhoPayload_(draft?.payload || {}) !== assinaturaFinal) return;
                localStorage.removeItem(chave);
                const id = String(draft?.recordId || draft?.payload?._appRegistroId || '').trim();
                if (id) marcarRascunhoFinalizadoLocal_(id);
              } catch (e) {}
            });
          } catch (e) {}
        }

        // Remove também o formato de rascunho único das versões antigas quando
        // ele representa a mesma vistoria que acabou de ser concluída.
        [`${DRAFT_KEY}:${draftUserId_()}`, DRAFT_KEY].forEach(chave => {
          try {
            const raw = localStorage.getItem(chave);
            if (!raw) return;
            const draft = JSON.parse(raw);
            const assinatura = assinaturaRascunhoPayload_(draft?.payload || {});
            if (!assinaturaFinal || assinatura === assinaturaFinal) localStorage.removeItem(chave);
          } catch (e) {}
        });

        return assinaturaFinal;
      }

      function deduplicarRascunhosLocais_() {
        const vistos = new Map();
        for (const item of lerIndiceRascunhosLocais_()) {
          const rid = String(item?.id || '').trim();
          if (!rid) continue;
          const draft = lerRascunhoLocalPorId_(rid);
          if (!draft?.payload) {
            removerRascunhoLocal_(rid);
            continue;
          }
          const assinatura = assinaturaRascunhoPayload_(draft.payload);
          if (!assinatura) continue;
          if (assinaturaFinalizadaLocal_(draft.payload)) {
            removerRascunhoLocal_(rid);
            continue;
          }
          const anterior = vistos.get(assinatura);
          if (!anterior) {
            vistos.set(assinatura, { id: rid, savedAt: Number(draft.savedAt || item.savedAt || 0) });
            continue;
          }
          const atualSavedAt = Number(draft.savedAt || item.savedAt || 0);
          if (atualSavedAt > anterior.savedAt) {
            removerRascunhoLocal_(anterior.id);
            vistos.set(assinatura, { id: rid, savedAt: atualSavedAt });
          } else {
            removerRascunhoLocal_(rid);
          }
        }
      }

      function lerRascunhosFinalizadosLocais_() {
        try {
          const bruto = JSON.parse(localStorage.getItem(draftFinalizadosKey_()) || '{}');
          if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
          const limite = Date.now() - 1000 * 60 * 60 * 24 * 7;
          const limpo = {};
          Object.entries(bruto).forEach(([id, encerradoEm]) => {
            const data = Number(encerradoEm || 0);
            if (id && data >= limite) limpo[id] = data;
          });
          if (Object.keys(limpo).length !== Object.keys(bruto).length) {
            localStorage.setItem(draftFinalizadosKey_(), JSON.stringify(limpo));
          }
          return limpo;
        } catch (e) {
          return {};
        }
      }

      function rascunhoFinalizadoLocal_(recordId) {
        const rid = String(recordId || '').trim();
        if (!rid) return false;
        return Boolean(lerRascunhosFinalizadosLocais_()[rid]);
      }

      function marcarRascunhoFinalizadoLocal_(recordId) {
        const rid = String(recordId || '').trim();
        if (!rid) return;
        try {
          const mapa = lerRascunhosFinalizadosLocais_();
          mapa[rid] = Date.now();
          localStorage.setItem(draftFinalizadosKey_(), JSON.stringify(mapa));
        } catch (e) {}
      }

      function lerIndiceRascunhosLocais_() {
        try {
          const lista = JSON.parse(localStorage.getItem(draftIndexKey_()) || '[]');
          return Array.isArray(lista) ? lista.filter(Boolean) : [];
        } catch (e) { return []; }
      }

      function registrarRascunhoLocal_(recordId, savedAt = Date.now()) {
        const rid = String(recordId || '').trim();
        if (!rid) return;
        const lista = lerIndiceRascunhosLocais_().filter(x => String(x.id) !== rid);
        lista.unshift({ id: rid, savedAt: Number(savedAt || Date.now()) });
        localStorage.setItem(draftIndexKey_(), JSON.stringify(lista.slice(0, 30)));
      }

      function removerRascunhoLocal_(recordId) {
        const rid = String(recordId || '').trim();
        try { localStorage.removeItem(draftKeyAtual_(rid)); } catch (e) {}
        try {
          const lista = lerIndiceRascunhosLocais_().filter(x => String(x.id) !== rid);
          localStorage.setItem(draftIndexKey_(), JSON.stringify(lista));
        } catch (e) {}
      }

      function obterRascunhoLocalMaisRecente_() {
        deduplicarRascunhosLocais_();
        const limite = Date.now() - 1000 * 60 * 60 * 24 * 3;
        for (const item of lerIndiceRascunhosLocais_()) {
          if (Number(item.savedAt || 0) < limite) { removerRascunhoLocal_(item.id); continue; }
          if (rascunhoFinalizadoLocal_(item.id)) { removerRascunhoLocal_(item.id); continue; }
          try {
            const raw = localStorage.getItem(draftKeyAtual_(item.id));
            if (!raw) continue;
            const draft = JSON.parse(raw);
            if (draft?.payload && assinaturaFinalizadaLocal_(draft.payload)) {
              removerRascunhoLocal_(item.id);
              continue;
            }
            return raw;
          } catch (e) {}
        }
        return '';
      }

      const API_CONFIG_READ_QUERIES = new Set([
        '',
        'registros',
        'registro',
        'registro_extras',
        'responsavel_telefone',
        'responsavel_cpf',
        'duplicidade',
        'estabelecimento_historico',
        'pscip',
        'encerramento_fiscal',
        'processo_pf',
        'rascunhos',
        'rascunho',
        'rascunho_estado',
        'sistema_status',
        'metas',
        'programadas',
        'sugestoes_fiscalizacao',
        'reds_modelos',
        'retorno_liberacao_candidatos',
        'retorno_liberacao_documento',
        'geocodificar_localizacao',
        'ddus'
      ]);

      function requisicaoLeituraPodeRepetir_(action, data = {}) {
        const acao = String(action || '').trim().toLowerCase();
        if (acao === 'ping' || acao === 'cnpj' || acao === 'users') return true;
        if (acao !== 'config') return false;
        return API_CONFIG_READ_QUERIES.has(String(data?.consulta || '').trim().toLowerCase());
      }

      function erroTransitorioGateway_(erro) {
        const status = Number(erro?.status || 0);
        const codigo = String(erro?.code || '').trim().toUpperCase();
        if ([
          'RESPONSE_FORMAT',
          'UPSTREAM_FORMAT',
          'REQUEST_TIMEOUT',
          'NETWORK_ERROR',
          'GEOCODIFICACAO_INDISPONIVEL',
          'GEOCODIFICACAO_FORMATO'
        ].includes(codigo)) return true;
        return [408, 425, 429, 500, 502, 503, 504].includes(status);
      }

      function esperarApi_(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))));
      }

      function registrarRespostaApiValida_(action, data = {}) {
        try {
          localStorage.setItem(APP_LAST_API_SUCCESS_STORAGE, JSON.stringify({
            em: new Date().toISOString(),
            acao: String(action || ''),
            consulta: String(data?.consulta || '')
          }));
        } catch (e) {}
      }

      async function gatewayRequest_(action, data = {}, timeoutMs = 30000, opcoes = {}) {
        if (!navigator.onLine) throw new Error('Sem conexão com a internet.');
        if (!API_URL || API_URL.includes('COLE_AQUI')) {
          throw new Error('A URL da API ainda não foi configurada em config.js.');
        }
        const controller = new AbortController();
        const sinalExterno = opcoes?.signal || null;
        let canceladaExternamente = false;
        const cancelarPorSolicitacaoMaisRecente = () => {
          canceladaExternamente = true;
          controller.abort();
        };
        if (sinalExterno) {
          if (sinalExterno.aborted) cancelarPorSolicitacaoMaisRecente();
          else sinalExterno.addEventListener('abort', cancelarPorSolicitacaoMaisRecente, { once: true });
        }
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-GPV-App-Version': `v${APP_VERSION}`
            },
            body: JSON.stringify({ action, clientAuthVersion: AUTH_CLIENT_VERSION, ...data }),
            cache: 'no-store',
            signal: controller.signal
          });
          const textoResposta = await response.text();
          let result = null;
          try {
            result = textoResposta ? JSON.parse(textoResposta) : null;
          } catch (e) {
            result = null;
          }

          if (!result || typeof result !== 'object') {
            const error = new Error('O serviço respondeu temporariamente em formato inválido.');
            error.code = 'RESPONSE_FORMAT';
            error.status = response.status || 502;
            throw error;
          }

          if (!response.ok || result.ok === false) {
            const message = result?.error || result?.message || `Falha na comunicação (HTTP ${response.status}).`;
            const error = new Error(message);
            error.code = String(result?.code || '');
            error.status = response.status;
            error.upstreamStatus = Number(result?.upstreamStatus || 0);
            throw error;
          }

          return result;
        } catch (error) {
          if (error?.name === 'AbortError') {
            if (canceladaExternamente || sinalExterno?.aborted) {
              const cancelledError = new Error('A consulta anterior foi substituída por uma atualização mais recente.');
              cancelledError.code = 'REQUEST_CANCELLED';
              cancelledError.status = 499;
              throw cancelledError;
            }
            const timeoutError = new Error('A comunicação demorou mais que o esperado. O registro continua seguro neste aparelho.');
            timeoutError.code = 'REQUEST_TIMEOUT';
            timeoutError.status = 408;
            throw timeoutError;
          }

          if (error instanceof TypeError && !error?.code) {
            const networkError = new Error('A comunicação com o serviço foi interrompida temporariamente.');
            networkError.code = 'NETWORK_ERROR';
            networkError.status = 503;
            throw networkError;
          }

          throw error;
        } finally {
          clearTimeout(timer);
          sinalExterno?.removeEventListener?.('abort', cancelarPorSolicitacaoMaisRecente);
        }
      }

      async function apiRequest(action, data = {}, timeoutMs = 30000, opcoes = {}) {
        if (!validarSessaoLocalAtivaBm_()) {
          const error = new Error('Sua sessão expirou. Entre novamente com seu Nº BM.');
          error.code = 'AUTH_REQUIRED';
          throw error;
        }

        const sessionToken = String(authState.sessionToken || '').trim();
        if (!sessionToken) {
          const error = new Error('Entre com seu Nº BM para continuar.');
          error.code = 'AUTH_REQUIRED';
          throw error;
        }

        const podeRepetir = requisicaoLeituraPodeRepetir_(action, data);
        const tentativas = podeRepetir ? 2 : 1;
        let ultimoErro = null;

        for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
          try {
            const result = await gatewayRequest_(action, { ...data, sessionToken }, timeoutMs, opcoes);
            atualizarPerfilLocalPorResposta_(result);
            registrarRespostaApiValida_(action, data);
            return result;
          } catch (error) {
            ultimoErro = error;

            if (error?.code === 'AUTH_REQUIRED' || error?.status === 401) {
              limparSessaoLocalBm_();
              mostrarTelaLoginBm_('Sua identificação precisa ser confirmada novamente.');
              throw error;
            }

            if (tentativa >= tentativas || !podeRepetir || !erroTransitorioGateway_(error)) {
              throw error;
            }

            await esperarApi_(API_READ_RETRY_DELAY_MS * tentativa);
          }
        }

        throw ultimoErro || new Error('Não foi possível concluir a comunicação.');
      }

      async function authRequest_(data = {}, timeoutMs = 30000) {
        return gatewayRequest_('auth', data, timeoutMs);
      }

      const OCUPACOES_CBMMG = window.OCUPACOES_CBMMG || [];
      const form = document.getElementById('vistoriaForm');
      const submitBtn = document.getElementById('submitBtn');
      const clearBtn = document.getElementById('clearBtn');
      const loadingOverlay = document.getElementById('loadingOverlay');
      const loadingText = document.getElementById('loadingText');
      const errorBox = document.getElementById('errorBox');
      const draftStatus = document.getElementById('draftStatus');
      const appStatus = document.getElementById('appStatus');
      const authGate = document.getElementById('authGate');
      const authForm = document.getElementById('authForm');
      const authBmInput = document.getElementById('authBmInput');
      const authPinInput = document.getElementById('authPinInput');
      const authPinToggleBtn = document.getElementById('authPinToggleBtn');
      const authSavePasswordCheck = document.getElementById('authSavePasswordCheck');
      const authPinSetup = document.getElementById('authPinSetup');
      const authNewPinInput = document.getElementById('authNewPinInput');
      const authConfirmPinInput = document.getElementById('authConfirmPinInput');
      const authCreatePinBtn = document.getElementById('authCreatePinBtn');
      const authEnterBtn = document.getElementById('authEnterBtn');
      const authMessage = document.getElementById('authMessage');
      const authProfileChoice = document.getElementById('authProfileChoice');
      const authProfileList = document.getElementById('authProfileList');
      const authOfflineNote = document.getElementById('authOfflineNote');
      const authSubtitle = document.getElementById('authSubtitle');
      const authManualLogin = document.getElementById('authManualLogin');
      const authDeviceChoice = document.getElementById('authDeviceChoice');
      const authDeviceProfileList = document.getElementById('authDeviceProfileList');
      const authUseOtherBmBtn = document.getElementById('authUseOtherBmBtn');
      const loggedUserBadge = document.getElementById('loggedUserBadge');
      const changePinBtn = document.getElementById('changePinBtn');
      const forgetSavedPinBtn = document.getElementById('forgetSavedPinBtn');
      const manageUsersBtn = document.getElementById('manageUsersBtn');
      const redsTemplatesMenuBtn = document.getElementById('redsTemplatesMenuBtn');
      const redsTemplatesModal = document.getElementById('redsTemplatesModal');
      const redsTemplatesCloseBtn = document.getElementById('redsTemplatesCloseBtn');
      const redsTemplatesList = document.getElementById('redsTemplatesList');
      const redsTemplatesEmpty = document.getElementById('redsTemplatesEmpty');
      const redsTemplatesEditorPanel = document.getElementById('redsTemplatesEditorPanel');
      const redsTemplateGroup = document.getElementById('redsTemplateGroup');
      const redsTemplateName = document.getElementById('redsTemplateName');
      const redsTemplateState = document.getElementById('redsTemplateState');
      const redsTemplateText = document.getElementById('redsTemplateText');
      const redsTemplateCharCount = document.getElementById('redsTemplateCharCount');
      const redsTemplateUpdatedBy = document.getElementById('redsTemplateUpdatedBy');
      const redsTemplateMarkers = document.getElementById('redsTemplateMarkers');
      const redsTemplateMarkerWarning = document.getElementById('redsTemplateMarkerWarning');
      const redsTemplatePreviewPanel = document.getElementById('redsTemplatePreviewPanel');
      const redsTemplatePreviewText = document.getElementById('redsTemplatePreviewText');
      const redsTemplateMessage = document.getElementById('redsTemplateMessage');
      const redsTemplatePreviewBtn = document.getElementById('redsTemplatePreviewBtn');
      const redsTemplateRestoreBtn = document.getElementById('redsTemplateRestoreBtn');
      const redsTemplateSaveBtn = document.getElementById('redsTemplateSaveBtn');
      const systemManualBtn = document.getElementById('systemManualBtn');
      const systemManualModal = document.getElementById('systemManualModal');
      const systemManualCloseBtn = document.getElementById('systemManualCloseBtn');
      const systemManualScroll = document.getElementById('systemManualScroll');
      const duvidasMenuBtn = document.getElementById('duvidasMenuBtn');
      const duvidasModal = document.getElementById('duvidasModal');
      const duvidasCloseBtn = document.getElementById('duvidasCloseBtn');
      const duvidasNovaConversaBtn = document.getElementById('duvidasNovaConversaBtn');
      const duvidasConversation = document.getElementById('duvidasConversation');
      const duvidasEmpty = document.getElementById('duvidasEmpty');
      const duvidasSuggestions = document.getElementById('duvidasSuggestions');
      const duvidasForm = document.getElementById('duvidasForm');
      const duvidasInput = document.getElementById('duvidasInput');
      const duvidasStatus = document.getElementById('duvidasStatus');
      const duvidasCharCount = document.getElementById('duvidasCharCount');
      const duvidasConnectionBadge = document.getElementById('duvidasConnectionBadge');
      const duvidasSendBtn = document.getElementById('duvidasSendBtn');
      const switchUserBtn = document.getElementById('switchUserBtn');
      const logoutUserBtn = document.getElementById('logoutUserBtn');
      const changePinModal = document.getElementById('changePinModal');
      const changePinCloseBtn = document.getElementById('changePinCloseBtn');
      const changePinForm = document.getElementById('changePinForm');
      const changePinCurrent = document.getElementById('changePinCurrent');
      const changePinNew = document.getElementById('changePinNew');
      const changePinConfirm = document.getElementById('changePinConfirm');
      const changePinMessage = document.getElementById('changePinMessage');
      const changePinSaveBtn = document.getElementById('changePinSaveBtn');
      const loggedUserMenuText = document.getElementById('loggedUserMenuText');
      const userManagerModal = document.getElementById('userManagerModal');
      const userManagerCloseBtn = document.getElementById('userManagerCloseBtn');
      const userManagerCurrent = document.getElementById('userManagerCurrent');
      const userManagerList = document.getElementById('userManagerList');
      const userManagerForm = document.getElementById('userManagerForm');
      const userManagerId = document.getElementById('userManagerId');
      const userManagerName = document.getElementById('userManagerName');
      const userManagerBm = document.getElementById('userManagerBm');
      const userManagerProfile = document.getElementById('userManagerProfile');
      const userManagerMessage = document.getElementById('userManagerMessage');
      const userManagerFormTitle = document.getElementById('userManagerFormTitle');
      const userManagerSaveBtn = document.getElementById('userManagerSaveBtn');
      const userManagerCancelBtn = document.getElementById('userManagerCancelBtn');
      const successScreen = document.getElementById('successScreen');
      const whatsappOrientacoesBtn = document.getElementById('whatsappOrientacoesBtn');
      const whatsappOrientacoesNote = document.getElementById('whatsappOrientacoesNote');
      const successTitle = document.getElementById('successTitle');
      const recordsSuccessBtn = document.getElementById('recordsSuccessBtn');
      const formTabBtn = document.getElementById('formTabBtn');
      const recordsTabBtn = document.getElementById('recordsTabBtn');
      const recordsPanel = document.getElementById('recordsPanel');
      const recordsSearch = document.getElementById('recordsSearch');
      const recordsSearchBox = document.getElementById('recordsSearchBox');
      const recordsSearchActivity = document.getElementById('recordsSearchActivity');
      const recordsCityFilter = document.getElementById('recordsCityFilter');
      const recordsDemandFilter = document.getElementById('recordsDemandFilter');
      const recordsSanctionFilter = document.getElementById('recordsSanctionFilter');
      const recordsTypeFilter = document.getElementById('recordsTypeFilter');
      const recordsInspectorFilter = document.getElementById('recordsInspectorFilter');
      const recordsPeriodFilter = document.getElementById('recordsPeriodFilter');
      const recordsClearFiltersBtn = document.getElementById('recordsClearFiltersBtn');
      const recordsRefreshBtn = document.getElementById('recordsRefreshBtn');
      const recordsStatus = document.getElementById('recordsStatus');
      const recordsList = document.getElementById('recordsList');
      const recordsTableBody = document.getElementById('recordsTableBody');
      const recordsPrevBtn = document.getElementById('recordsPrevBtn');
      const recordsNextBtn = document.getElementById('recordsNextBtn');
      const recordsPageLabel = document.getElementById('recordsPageLabel');
      const recordsPaginationSummary = document.getElementById('recordsPaginationSummary');
      const recordsPageButtons = document.getElementById('recordsPageButtons');
      const recordsPageSize = document.getElementById('recordsPageSize');
      const dashboardNewInspectionBtn = document.getElementById('dashboardNewInspectionBtn');
      const kpiTotal = document.getElementById('kpiTotal');
      const kpiAutuado = document.getElementById('kpiAutuado');
      const kpiAdvertencia = document.getElementById('kpiAdvertencia');
      const kpiNotificado = document.getElementById('kpiNotificado');
      const kpiRegularizado = document.getElementById('kpiRegularizado');
      const kpiLiberado = document.getElementById('kpiLiberado');
      const kpiRegularizadoPercent = document.getElementById('kpiRegularizadoPercent');
      const kpiLiberadoPercent = document.getElementById('kpiLiberadoPercent');
      const kpiAdvertenciaPercent = document.getElementById('kpiAdvertenciaPercent');
      const kpiMulta1 = document.getElementById('kpiMulta1');
      const kpiMulta2 = document.getElementById('kpiMulta2');
      const kpiMulta1Card = document.getElementById('kpiMulta1Card');
      const kpiMulta2Card = document.getElementById('kpiMulta2Card');
      const recordsOpenSheetLink = document.getElementById('recordsOpenSheetLink');
      const recordDetailScreen = document.getElementById('recordDetailScreen');
      const recordDetailCloseBtn = document.getElementById('recordDetailCloseBtn');
      const recordDetailTitle = document.getElementById('recordDetailTitle');
      const recordDetailSubtitle = document.getElementById('recordDetailSubtitle');
      const recordDetailLine = document.getElementById('recordDetailLine');
      const recordDetailLoading = document.getElementById('recordDetailLoading');
      const recordDetailGroups = document.getElementById('recordDetailGroups');
      const recordDetailSheetLink = document.getElementById('recordDetailSheetLink');
      const recordDetailBackdrop = document.getElementById('recordDetailBackdrop');
      const recordDetailStatusBadge = document.getElementById('recordDetailStatusBadge');
      const recordCurrentStatus = document.querySelector('.record-current-status');
      const recordInfoscipUpdatePanel = document.getElementById('recordInfoscipUpdatePanel');
      const recordInfoscipUpdateBtn = document.getElementById('recordInfoscipUpdateBtn');
      const recordStatusUpdateModal = document.getElementById('recordStatusUpdateModal');
      const recordStatusUpdateCloseBtn = document.getElementById('recordStatusUpdateCloseBtn');
      const recordStatusUpdateCancelBtn = document.getElementById('recordStatusUpdateCancelBtn');
      const recordStatusUpdateSaveBtn = document.getElementById('recordStatusUpdateSaveBtn');
      const recordStatusUpdateCurrent = document.getElementById('recordStatusUpdateCurrent');
      const recordStatusUpdateSelect = document.getElementById('recordStatusUpdateSelect');
      const recordFineUpdateSelect = document.getElementById('recordFineUpdateSelect');
      const recordStatusUpdateConfirm = document.getElementById('recordStatusUpdateConfirm');
      const recordStatusUpdateMessage = document.getElementById('recordStatusUpdateMessage');
      const recordCorrectionPanel = document.getElementById('recordCorrectionPanel');
      const recordCorrectionBtn = document.getElementById('recordCorrectionBtn');
      const recordCorrectionModal = document.getElementById('recordCorrectionModal');
      const recordCorrectionCloseBtn = document.getElementById('recordCorrectionCloseBtn');
      const recordCorrectionCancelBtn = document.getElementById('recordCorrectionCancelBtn');
      const recordCorrectionSaveBtn = document.getElementById('recordCorrectionSaveBtn');
      const recordCorrectionFields = document.getElementById('recordCorrectionFields');
      const recordCorrectionReason = document.getElementById('recordCorrectionReason');
      const recordCorrectionMessage = document.getElementById('recordCorrectionMessage');
      const recordHistoryPanel = document.getElementById('recordHistoryPanel');
      const recordHistoryCount = document.getElementById('recordHistoryCount');
      const recordHistoryTimeline = document.getElementById('recordHistoryTimeline');
      const recordAuditPanel = document.getElementById('recordAuditPanel');
      const recordInfoscipHistoryPanel = document.getElementById('recordInfoscipHistoryPanel');
      const recordInfoscipHistoryModel = document.getElementById('recordInfoscipHistoryModel');
      const recordInfoscipHistoryText = document.getElementById('recordInfoscipHistoryText');
      const recordInfoscipCopyBtn = document.getElementById('recordInfoscipCopyBtn');
      const recordInfoscipCopyStatus = document.getElementById('recordInfoscipCopyStatus');
      const recordInfoscipModelSelect = document.getElementById('recordInfoscipModelSelect');
      const recordRedsReportPanel = document.getElementById('recordRedsReportPanel');
      const recordRedsReportModel = document.getElementById('recordRedsReportModel');
      const recordRedsReportText = document.getElementById('recordRedsReportText');
      const recordRedsCopyBtn = document.getElementById('recordRedsCopyBtn');
      const recordRedsCopyStatus = document.getElementById('recordRedsCopyStatus');
      const recordRedsModelSelect = document.getElementById('recordRedsModelSelect');
      const recordAutoNumberWrap = document.getElementById('recordAutoNumberWrap');
      const recordAutoNumberInput = document.getElementById('recordAutoNumberInput');
      const recordAutoNumberSaveBtn = document.getElementById('recordAutoNumberSaveBtn');
      const recordAutoNumberStatus = document.getElementById('recordAutoNumberStatus');
      const recordWhatsappPanel = document.getElementById('recordWhatsappPanel');
      const recordWhatsappPhoneInput = document.getElementById('recordWhatsappPhoneInput');
      const recordWhatsappSendBtn = document.getElementById('recordWhatsappSendBtn');
      const recordWhatsappStatus = document.getElementById('recordWhatsappStatus');
      const recordNotificationsPanel = document.getElementById('recordNotificationsPanel');
      const recordNotificationsSummary = document.getElementById('recordNotificationsSummary');
      const recordNotificationsList = document.getElementById('recordNotificationsList');
      const recordNotificationsCopyAllBtn = document.getElementById('recordNotificationsCopyAllBtn');
      const recordNotificationsStatus = document.getElementById('recordNotificationsStatus');
      const recordAuditCount = document.getElementById('recordAuditCount');
      const recordAuditList = document.getElementById('recordAuditList');
      const connectionBanner = document.getElementById('connectionBanner');
      const connectionStateText = document.getElementById('connectionStateText');
      const syncSummary = document.getElementById('syncSummary');
      const dashboardSyncIndicator = document.getElementById('dashboardSyncIndicator');
      const dashboardSyncCount = document.getElementById('dashboardSyncCount');
      const pendingPanel = document.getElementById('pendingPanel');
      const pendingTitle = document.getElementById('pendingTitle');
      const pendingText = document.getElementById('pendingText');
      const sendPendingBtn = document.getElementById('sendPendingBtn');
      const installPanel = document.getElementById('installPanel');
      const installBtn = document.getElementById('installBtn');
      const installText = document.getElementById('installText');
      const appMoreMenu = document.getElementById('appMoreMenu');
      const appMoreMenuCloseBtn = document.getElementById('appMoreMenuCloseBtn');
      const goalsMenuBtn = document.getElementById('goalsMenuBtn');
      const dashboardGoalsPanel = document.getElementById('dashboardGoalsPanel');
      const dashboardGoalsTitle = document.getElementById('dashboardGoalsTitle');
      const dashboardGoalsSubtitle = document.getElementById('dashboardGoalsSubtitle');
      const dashboardGoalsOverallValue = document.getElementById('dashboardGoalsOverallValue');
      const dashboardGoalsOverallLabel = document.getElementById('dashboardGoalsOverallLabel');
      const dashboardGoalsProgressBar = document.getElementById('dashboardGoalsProgressBar');
      const dashboardGoalsPercent = document.getElementById('dashboardGoalsPercent');
      const dashboardGoalsGrid = document.getElementById('dashboardGoalsGrid');
      const dashboardGoalsOpenBtn = document.getElementById('dashboardGoalsOpenBtn');
      const goalsModal = document.getElementById('goalsModal');
      const goalsModalCloseBtn = document.getElementById('goalsModalCloseBtn');
      const goalsModalPrintBtn = document.getElementById('goalsModalPrintBtn');
      const goalsPrintMeta = document.getElementById('goalsPrintMeta');
      const goalsModalTitle = document.getElementById('goalsModalTitle');
      const goalsModalSubtitle = document.getElementById('goalsModalSubtitle');
      const goalsModalSummary = document.getElementById('goalsModalSummary');
      const goalsModalList = document.getElementById('goalsModalList');
      const goalsModalDetails = document.getElementById('goalsModalDetails');
      const goalsTabSummaryBtn = document.getElementById('goalsTabSummaryBtn');
      const goalsTabDetailsBtn = document.getElementById('goalsTabDetailsBtn');
      const goalsSummaryPanel = document.getElementById('goalsSummaryPanel');
      const goalsDetailsPanel = document.getElementById('goalsDetailsPanel');
      const navMoreMenuBtn = document.getElementById('navMoreMenuBtn');
      const dashboardMoreMenuBtn = document.getElementById('dashboardMoreMenuBtn');
      const dashboardSheetHeaderLink = document.getElementById('dashboardSheetHeaderLink');
      const tutorialMenuBtn = document.getElementById('tutorialMenuBtn');
      const usefulLinksBtn = document.getElementById('usefulLinksBtn');
      const updateAppBtn = document.getElementById('updateAppBtn');
      const aboutSystemBtn = document.getElementById('aboutSystemBtn');
      const deviceNameBtn = document.getElementById('deviceNameBtn');
      const deviceNameMenuText = document.getElementById('deviceNameMenuText');
      const adminSheetMenuLink = document.getElementById('adminSheetMenuLink');
      const moreMenuTriggers = [navMoreMenuBtn, dashboardMoreMenuBtn].filter(Boolean);
      const tutorialModal = document.getElementById('tutorialModal');
      const tutorialCloseBtn = document.getElementById('tutorialCloseBtn');
      const tutorialPrevBtn = document.getElementById('tutorialPrevBtn');
      const tutorialNextBtn = document.getElementById('tutorialNextBtn');
      const tutorialStepCounter = document.getElementById('tutorialStepCounter');
      const tutorialProgressBar = document.getElementById('tutorialProgressBar');
      const tutorialStepEls = Array.from(document.querySelectorAll('[data-tutorial-step]'));
      const citySelect = document.getElementById('cidadeSelect');
      const otherCityWrap = document.getElementById('outraCidadeWrap');
      const otherCity = document.getElementById('outraCidade');
      const cityCheckModal = document.getElementById('cityCheckModal');
      const cityCheckText = document.getElementById('cityCheckText');
      const cityCheckChangeBtn = document.getElementById('cityCheckChangeBtn');
      const cityCheckKeepBtn = document.getElementById('cityCheckKeepBtn');
      const licenciamentoSelect = document.getElementById('licenciamento');
      const possuiPscipSelect = document.getElementById('possuiPscip');
      const pscipLicenciamentoWrap = document.getElementById('pscipLicenciamentoWrap');
      const pscipInput = document.getElementById('pscip');
      const pscipLookupStatus = document.getElementById('pscipLookupStatus');
      const pscipHistoryPanel = document.getElementById('pscipHistoryPanel');
      const pscipHistoryResults = document.getElementById('pscipHistoryResults');
      const pscipLabel = document.getElementById('pscipLabel');
      const situacaoPscipWrap = document.getElementById('situacaoPscipWrap');
      const situacaoPscipInput = document.getElementById('situacaoPscip');
      const sancaoSelect = document.getElementById('sancao');
      const situacaoMultaInfoscipSelect = document.getElementById('situacaoMultaInfoscip');
      const sancaoAutomaticaHint = document.getElementById('sancaoAutomaticaHint');
      const pendenciaDocumentalWrap = document.getElementById('pendenciaDocumentalWrap');
      const pendenciaDocumentalSelect = document.getElementById('pendenciaDocumental');
      const tipoLiberacaoWrap = document.getElementById('tipoLiberacaoWrap');
      const tipoLiberacaoSelect = document.getElementById('tipoLiberacao');
      const liberacaoParcialDescricaoWrap = document.getElementById('liberacaoParcialDescricaoWrap');
      const liberacaoParcialDescricaoInput = document.getElementById('liberacaoParcialDescricao');
      const liberacaoParcialAreaWrap = document.getElementById('liberacaoParcialAreaWrap');
      const liberacaoParcialAreaInput = document.getElementById('liberacaoParcialArea');
      const tipoVistoriaInput = document.getElementById('tipoVistoria');
      const tipoVistoriaSecao = document.getElementById('tipoVistoriaSecao');
      const vistoriadorResponsavelSelect = document.getElementById('vistoriadorResponsavel');
      const categoriaMetaSelect = document.getElementById('categoriaMeta');
      const areaInput = document.getElementById('area');
      const areaLabel = document.getElementById('areaLabel');
      const areaMetaStatus = document.getElementById('areaMetaStatus');
      const eventosDeclaratoriosSecao = document.getElementById('eventosDeclaratoriosSecao');
      const consultaTecnicaSecao = document.getElementById('consultaTecnicaSecao');
      const consultaTecnicaDescricao = document.getElementById('consultaTecnicaDescricao');
      const consultaTecnicaRelacionadas = document.getElementById('consultaTecnicaRelacionadas');
      const demandaFiscalizacaoWrap = document.getElementById('demandaFiscalizacaoWrap');
      const estabelecimentoDocumentoWrap = document.getElementById('estabelecimentoDocumentoWrap');
      const nomeFantasiaWrap = document.getElementById('nomeFantasiaWrap');
      const razaoSocialWrap = document.getElementById('razaoSocialWrap');
      const enderecoCorrespondenciaWrap = document.getElementById('enderecoCorrespondenciaWrap');
      const estabelecimentoTitulo = document.getElementById('estabelecimentoTitulo');
      const estabelecimentoDescricao = document.getElementById('estabelecimentoDescricao');
      const responsavelSecao = document.getElementById('responsavelSecao');
      const responsavelTitulo = document.getElementById('responsavelTitulo');
      const responsavelDescricao = document.getElementById('responsavelDescricao');
      const responsavelCpfWrap = document.getElementById('responsavelCpfWrap');
      const responsavelTelefoneWrap = document.getElementById('responsavelTelefoneWrap');
      const responsavelTelefoneLookupHint = document.getElementById('responsavelTelefoneLookupHint');
      const responsavelCpfLookupHint = document.getElementById('responsavelCpfLookupHint');
      const responsavelCpfLookupStatus = document.getElementById('responsavelCpfLookupStatus');
      const responsavelCpfLookupResultados = document.getElementById('responsavelCpfLookupResultados');
      const processoTitulo = document.getElementById('processoTitulo');
      const edificacaoSecao = document.getElementById('edificacao');
      const situacaoMultaInfoscipWrap = document.getElementById('situacaoMultaInfoscipWrap');
      const categoriaMetaWrap = document.getElementById('categoriaMetaWrap');
      const eventoDeclaracaoNumeroInput = document.getElementById('eventoDeclaracaoNumero');
      const eventoClassificacaoSelect = document.getElementById('eventoClassificacao');
      const eventoOrganizadorDocumentoInput = document.getElementById('eventoOrganizadorDocumento');
      const eventoTelefoneOrganizadorInput = document.getElementById('eventoTelefoneOrganizador');
      const eventoResponsavelEhOrganizadorCheck = document.getElementById('eventoResponsavelEhOrganizador');
      const eventoResponsavelEhOrganizadorHint = document.getElementById('eventoResponsavelEhOrganizadorHint');
      const notificacoesLiberacaoSecao = document.getElementById('notificacoesLiberacaoSecao');
      const notificacoesLiberacaoLista = document.getElementById('notificacoesLiberacaoLista');
      const notificacoesLiberacaoResumo = document.getElementById('notificacoesLiberacaoResumo');
      const notificacoesAdicionarLocalBtn = document.getElementById('notificacoesAdicionarLocalBtn');
      const notificacoesCompartilharAuxBtn = document.getElementById('notificacoesCompartilharAuxBtn');
      const notificacoesRevisarBtn = document.getElementById('notificacoesRevisarBtn');
      const auxNotificationsContext = document.getElementById('auxNotificationsContext');
      const auxNotificationsBuilding = document.getElementById('auxNotificationsBuilding');
      const auxNotificationsMeta = document.getElementById('auxNotificationsMeta');
      const auxNotificationsExitBtn = document.getElementById('auxNotificationsExitBtn');
      const auxNotificationsShareModal = document.getElementById('auxNotificationsShareModal');
      const auxNotificationsShareCloseBtn = document.getElementById('auxNotificationsShareCloseBtn');
      const auxNotificationsShareCancelBtn = document.getElementById('auxNotificationsShareCancelBtn');
      const auxNotificationsShareBuilding = document.getElementById('auxNotificationsShareBuilding');
      const auxNotificationsShareLink = document.getElementById('auxNotificationsShareLink');
      const auxNotificationsCopyLinkBtn = document.getElementById('auxNotificationsCopyLinkBtn');
      const auxNotificationsNativeShareBtn = document.getElementById('auxNotificationsNativeShareBtn');
      const dlNotificacaoTiposLocal = document.getElementById('dlNotificacaoTiposLocal');
      const dlNotificacaoCategorias = document.getElementById('dlNotificacaoCategorias');
      const notificationReviewModal = document.getElementById('notificationReviewModal');
      const notificationReviewCloseBtn = document.getElementById('notificationReviewCloseBtn');
      const notificationReviewBackBtn = document.getElementById('notificationReviewBackBtn');
      const notificationReviewAddBtn = document.getElementById('notificationReviewAddBtn');
      const notificationReviewConfirmBtn = document.getElementById('notificationReviewConfirmBtn');
      const notificationReviewSummary = document.getElementById('notificationReviewSummary');
      const notificationReviewProgressBar = document.getElementById('notificationReviewProgressBar');
      const notificationReviewList = document.getElementById('notificationReviewList');
      const licenciamentoFieldWrap = document.getElementById('licenciamentoFieldWrap');
      const possuiPscipFieldWrap = document.getElementById('possuiPscipFieldWrap');
      const fluxoFiscalizacaoBtn = document.getElementById('fluxoFiscalizacaoBtn');
      const fluxoLiberacaoBtn = document.getElementById('fluxoLiberacaoBtn');
      const fluxoVistoriaAtualTexto = document.getElementById('fluxoVistoriaAtualTexto');
      const vistoriaFlowSections = Array.from(document.querySelectorAll('.vistoria-flow-section'));
      const vistoriaBottomBar = document.getElementById('vistoriaBottomBar');
      const prepareInspectionBtn = document.getElementById('prepareInspectionBtn');
      const registerDduBtn = document.getElementById('registerDduBtn');
      const dduSummaryCard = document.getElementById('dduSummaryCard');
      const dduSummaryCount = document.getElementById('dduSummaryCount');
      const dduSummaryText = document.getElementById('dduSummaryText');
      const dduRegisterModal = document.getElementById('dduRegisterModal');
      const dduRegisterCloseBtn = document.getElementById('dduRegisterCloseBtn');
      const dduRegisterCancelBtn = document.getElementById('dduRegisterCancelBtn');
      const dduRegisterSaveBtn = document.getElementById('dduRegisterSaveBtn');
      const dduRegisterError = document.getElementById('dduRegisterError');
      const dduListModal = document.getElementById('dduListModal');
      const dduListCloseBtn = document.getElementById('dduListCloseBtn');
      const dduList = document.getElementById('dduList');
      const dduListStatus = document.getElementById('dduListStatus');
      const prepareDwgWrap = document.getElementById('prepareDwgWrap');
      const prepareDwgFile = document.getElementById('prepareDwgFile');
      const prepareDwgStatus = document.getElementById('prepareDwgStatus');

      const programmedSummaryRow = document.getElementById('programmedSummaryRow');
      const programmedSummaryCard = document.getElementById('programmedSummaryCard');
      const programmedSummaryText = document.getElementById('programmedSummaryText');
      const programmedSummaryCount = document.getElementById('programmedSummaryCount');
      const inspectionSuggestionsCard = document.getElementById('inspectionSuggestionsCard');
      const inspectionSuggestionsText = document.getElementById('inspectionSuggestionsText');
      const inspectionSuggestionsCount = document.getElementById('inspectionSuggestionsCount');
      const inspectionSuggestionsBadge = document.getElementById('inspectionSuggestionsBadge');
      const inspectionSuggestionsVistoriaCard = document.getElementById('inspectionSuggestionsVistoriaCard');
      const inspectionSuggestionsVistoriaText = document.getElementById('inspectionSuggestionsVistoriaText');
      const inspectionSuggestionsVistoriaSummary = document.getElementById('inspectionSuggestionsVistoriaSummary');
      const inspectionSuggestionsVistoriaCount = document.getElementById('inspectionSuggestionsVistoriaCount');
      const inspectionSuggestionsRefreshBtn = document.getElementById('inspectionSuggestionsRefreshBtn');
      const programmedQuickAddBtn = document.getElementById('programmedQuickAddBtn');
      const programmedListModal = document.getElementById('programmedListModal');
      const programmedListCloseBtn = document.getElementById('programmedListCloseBtn');

      const desktopPrepareInspectionBtn = document.getElementById('desktopPrepareInspectionBtn');
      const prepareInspectionModal = document.getElementById('prepareInspectionModal');
      const prepareInspectionCloseBtn = document.getElementById('prepareInspectionCloseBtn');
      const prepareInspectionCancelBtn = document.getElementById('prepareInspectionCancelBtn');
      const prepareInspectionSaveBtn = document.getElementById('prepareInspectionSaveBtn');
      const prepareInspectionError = document.getElementById('prepareInspectionError');
      const preparedInspectionsList = document.getElementById('preparedInspectionsList');
      const preparedInspectionsStatus = document.getElementById('preparedInspectionsStatus');
      const programmedInspectionsBox = document.querySelector('.programmed-inspections-box');
      const preparedForUserNotice = document.getElementById('preparedForUserNotice');
      const programDeadlineNotice = document.getElementById('programDeadlineNotice');
      const prepareTipo = document.getElementById('prepareTipo');
      const prepareData = document.getElementById('prepareData');
      const prepareVistoriador = document.getElementById('prepareVistoriador');
      const preparePfInput = document.getElementById('preparePf');
      const preparePfLookupStatus = document.getElementById('preparePfLookupStatus');
      const preparePfLookupResults = document.getElementById('preparePfLookupResults');
      const processPfInput = document.getElementById('pf');
      const processPfLabel = document.getElementById('processPfLabel');
      const processPfLookupStatus = document.getElementById('processPfLookupStatus');
      const processPfLookupResults = document.getElementById('processPfLookupResults');
      const vistoriaAcessoriaWrap = document.getElementById('vistoriaAcessoriaWrap');
      const acessoriaVinculoStatus = document.getElementById('acessoriaVinculoStatus');
      const acessoriaResultadoSelect = document.getElementById('acessoriaResultado');
      const acessoriaResultadoHint = document.getElementById('acessoriaResultadoHint');
      const acessoriaTipoLicencaWrap = document.getElementById('acessoriaTipoLicencaWrap');
      const acessoriaTipoLicencaSelect = document.getElementById('acessoriaTipoLicenca');
      const dduProtocolWrap = document.getElementById('dduProtocolWrap');
      const dduProtocolInput = document.getElementById('dduProtocol');
      const priorProcessAlert = document.getElementById('priorProcessAlert');
      const cnpjStatus = document.getElementById('cnpjStatus');
      const limparResponsavelBtn = document.getElementById('limparResponsavelBtn');
      const appDiagnosticsBtn = document.getElementById('appDiagnosticsBtn');
      const appDiagnosticsModal = document.getElementById('appDiagnosticsModal');
      const appDiagnosticsCloseBtn = document.getElementById('appDiagnosticsCloseBtn');
      const appDiagnosticsGrid = document.getElementById('appDiagnosticsGrid');
      const appDiagnosticsStatus = document.getElementById('appDiagnosticsStatus');
      const appDiagnosticsLastError = document.getElementById('appDiagnosticsLastError');
      const appDiagnosticsRefreshBtn = document.getElementById('appDiagnosticsRefreshBtn');
      const appDiagnosticsRepairBtn = document.getElementById('appDiagnosticsRepairBtn');

      const useCurrentLocationBtn = document.getElementById('useCurrentLocationBtn');
      const locationAddressStatus = document.getElementById('locationAddressStatus');

      const retornoLiberacaoSecao = document.getElementById('retornoLiberacaoSecao');
      const retornoLiberacaoResumoAnterior = document.getElementById('retornoLiberacaoResumoAnterior');
      const retornoLiberacaoAnteriorSelect = document.getElementById('retornoLiberacaoAnteriorSelect');
      const retornoLiberacaoCorrespondencia = document.getElementById('retornoLiberacaoCorrespondencia');
      const retornoLiberacaoSimBtn = document.getElementById('retornoLiberacaoSimBtn');
      const retornoLiberacaoNaoBtn = document.getElementById('retornoLiberacaoNaoBtn');
      const retornoLiberacaoInput = document.getElementById('retornoLiberacao');
      const retornoLiberacaoDetalhes = document.getElementById('retornoLiberacaoDetalhes');
      const retornoLiberacaoAnteriorTitulo = document.getElementById('retornoLiberacaoAnteriorTitulo');
      const retornoLiberacaoAnteriorMeta = document.getElementById('retornoLiberacaoAnteriorMeta');
      const retornoLiberacaoAbrirFichaBtn = document.getElementById('retornoLiberacaoAbrirFichaBtn');
      const retornoLiberacaoChaveAnteriorInput = document.getElementById('retornoLiberacaoChaveAnterior');
      const retornoLiberacaoLinhaAnteriorInput = document.getElementById('retornoLiberacaoLinhaAnterior');
      const retornoLiberacaoDataAnteriorInput = document.getElementById('retornoLiberacaoDataAnterior');
      const retornoLiberacaoSituacaoAnteriorInput = document.getElementById('retornoLiberacaoSituacaoAnterior');
      const retornoLiberacaoPscipAnteriorInput = document.getElementById('retornoLiberacaoPscipAnterior');
      const retornoLiberacaoNotificacoesOriginaisInput = document.getElementById('retornoLiberacaoNotificacoesOriginais');
      const retornoLiberacaoPendenciasInput = document.getElementById('retornoLiberacaoPendencias');
      const retornoLiberacaoPendenciasLista = document.getElementById('retornoLiberacaoPendenciasLista');
      const retornoLiberacaoSemNotificacoes = document.getElementById('retornoLiberacaoSemNotificacoes');
      const retornoLiberacaoNotificacoesInfo = document.getElementById('retornoLiberacaoNotificacoesInfo');
      const retornoLiberacaoNotificacoesManualInput = document.getElementById('retornoLiberacaoNotificacoesManual');
      const retornoLiberacaoPdfInput = document.getElementById('retornoLiberacaoPdfInput');
      const retornoLiberacaoAbrirDocumentoBtn = document.getElementById('retornoLiberacaoAbrirDocumentoBtn');
      const retornoLiberacaoPdfStatus = document.getElementById('retornoLiberacaoPdfStatus');
      const retornoLiberacaoDocumentoLinkInput = document.getElementById('retornoLiberacaoDocumentoLink');
      const retornoLiberacaoAbrirLinkBtn = document.getElementById('retornoLiberacaoAbrirLinkBtn');
      const retornoLiberacaoDocumentoFileIdInput = document.getElementById('retornoLiberacaoDocumentoFileId');
      const retornoLiberacaoDocumentoNomeInput = document.getElementById('retornoLiberacaoDocumentoNome');
      const retornoLiberacaoDocumentoUrlInput = document.getElementById('retornoLiberacaoDocumentoUrl');

      const retornoLiberacaoPdfModal = document.getElementById('retornoLiberacaoPdfModal');
      const retornoLiberacaoPdfCloseBtn = document.getElementById('retornoLiberacaoPdfCloseBtn');
      const retornoLiberacaoPdfDoneBtn = document.getElementById('retornoLiberacaoPdfDoneBtn');
      const retornoLiberacaoPdfFrame = document.getElementById('retornoLiberacaoPdfFrame');
      const retornoLiberacaoPdfLoading = document.getElementById('retornoLiberacaoPdfLoading');
      const retornoLiberacaoPdfTitle = document.getElementById('retornoLiberacaoPdfTitle');
      const retornoLiberacaoPdfSubtitle = document.getElementById('retornoLiberacaoPdfSubtitle');
      const retornoLiberacaoPdfExternalBtn = document.getElementById('retornoLiberacaoPdfExternalBtn');
      const localizacaoLatitudeInput = document.getElementById('localizacaoLatitude');
      const localizacaoLongitudeInput = document.getElementById('localizacaoLongitude');
      const localizacaoCoordenadasInput = document.getElementById('localizacaoCoordenadas');
      const localizacaoPrecisaoInput = document.getElementById('localizacaoPrecisao');
      const localizacaoCapturadaEmInput = document.getElementById('localizacaoCapturadaEm');
      const localizacaoEnderecoIdentificadoInput = document.getElementById('localizacaoEnderecoIdentificado');
      const establishmentHistoryPanel = document.getElementById('establishmentHistoryPanel');
      const establishmentHistoryResults = document.getElementById('establishmentHistoryResults');
      const identificadorInput = document.getElementById('cnpj');
      const identificadorLabel = document.getElementById('identificadorLabel');
      const cpfInput = document.getElementById('cpf');
      const telefoneInput = document.getElementById('telefone');
      const responsavelLookupStatus = document.getElementById('responsavelLookupStatus');
      const responsavelLookupResultados = document.getElementById('responsavelLookupResultados');
      const ocupacaoInput = document.getElementById('ocupacao');
      const ocupacaoResultados = document.getElementById('ocupacaoResultados');
      const ocupacaoToggle = document.getElementById('ocupacaoToggle');
      const ocupacaoMeta = document.getElementById('ocupacaoMeta');
      const ocupacoesSelecionadasBox = document.getElementById('ocupacoesSelecionadasBox');
      const ocupacoesSelecionadasLista = document.getElementById('ocupacoesSelecionadasLista');
      const reviewModal = document.getElementById('reviewModal');
      const reviewList = document.getElementById('reviewList');
      const reviewDuplicateNotice = document.getElementById('reviewDuplicateNotice');
      const reviewClosureNotice = document.getElementById('reviewClosureNotice');
      const processClosureNotice = document.getElementById('processClosureNotice');
      const reviewCancelBtn = document.getElementById('reviewCancelBtn');
      const reviewCancelTopBtn = document.getElementById('reviewCancelTopBtn');
      const reviewConfirmBtn = document.getElementById('reviewConfirmBtn');
      const usefulLinksModal = document.getElementById('usefulLinksModal');
      const usefulLinksCloseBtn = document.getElementById('usefulLinksCloseBtn');
      const aboutSystemModal = document.getElementById('aboutSystemModal');
      const aboutSystemCloseBtn = document.getElementById('aboutSystemCloseBtn');
      const aboutSystemGrid = document.getElementById('aboutSystemGrid');
      const aboutSystemNote = document.getElementById('aboutSystemNote');
      const accessGuidanceModal = document.getElementById('accessGuidanceModal');
      const accessGuidanceTitle = document.getElementById('accessGuidanceTitle');
      const accessGuidanceText = document.getElementById('accessGuidanceText');
      const accessGuidanceContinueBtn = document.getElementById('accessGuidanceContinueBtn');

      let accessGuidanceResolve = null;
      let ocupacaoTouchStartY = null;
      let ocupacaoArrastando = false;

      let appConfig = {};
      let sancoesConfiguradas = [];
      let demandasConfiguradas = [];
      let usuariosAtivosApp = [];
      let preparacoesVistoria = [];
      let sugestoesFiscalizacao = [];
      let resumoSugestoesFiscalizacao = { total: 0, alta: 0, media: 0, acompanhamento: 0 };
      let sugestoesFiscalizacaoCarregadas = false;
      let sugestoesFiscalizacaoAtualizando = false;
      let sugestoesFiscalizacaoGeradoEm = '';
      let filtroPreparacoes = 'todas';
      let preparacaoEmUsoId = '';
      let dduEmUsoId = '';
      let dduEmUsoNumero = '';
      let processoAcessoriaVinculado = null;
      let ddusAtivos = [];
      let metasMensaisAtual = null;
      let metasCarregando = false;
      let preparacaoEditandoId = '';
      let preparacaoRetornarProgramadas = false;
      let submitting = false;
      let ultimoRegistroParaOrientacoes = null;
      let recordWhatsappRegistroAtual = null;
      let recordStatusRegistroAtual = null;
      let recordCorrectionRegistroAtual = null;
      let recordCorrectionOriginal = new Map();
      let redsTemplatesOverrides_ = {};
      let redsTemplatesMetadata_ = {};
      let redsTemplatesCarregados_ = false;
      let redsTemplatesCarregadosEm_ = 0;
      let redsTemplateAtualId_ = '';
      let redsTemplateCarregando_ = false;
      let retornoLiberacaoCandidatos_ = [];
      let retornoLiberacaoConsultaTimer_ = null;
      let retornoLiberacaoConsultaSequencia_ = 0;
      let retornoLiberacaoConsultaAssinatura_ = '';
      let retornoLiberacaoDocumentoBlobUrl_ = '';
      let retornoLiberacaoDocumentoExterno_ = '';
      const APP_REVISION_UI_ = '23.9.99by';
      const APP_LAST_ERROR_KEY_ = 'gpvLastUiErrorV1';
      const APP_LAST_RECOVERY_KEY_ = 'gpvLastUiRecoveryV1';
      let ultimaRecuperacaoInterface_ = '';
      let watchdogInterfaceTimer_ = null;
      let ultimaInvalidacaoRetornoInterface_ = 0;
      let ultimoToqueAcao_ = { elemento: null, em: 0 };
      let validacaoGuiadaAtiva_ = false;
      let validacaoGuiadaAtual_ = null;
      let validacaoGuiadaTimer_ = null;
      const UI_LOCK_MODAL_MAP_ = [
        ['mobile-choice-open', () => mobileChoiceState?.overlay && !mobileChoiceState.overlay.hidden],
        ['detail-open', () => recordDetailScreen && recordDetailScreen.classList.contains('show')],
        ['duvidas-open', () => duvidasModal && !duvidasModal.hidden],
        ['gpv-dialog-open', () => document.querySelector('.gpv-dialog-overlay:not([hidden])')],
        ['record-correction-open', () => recordCorrectionModal && !recordCorrectionModal.hidden],
        ['record-status-update-open', () => recordStatusUpdateModal && !recordStatusUpdateModal.hidden],
        ['reds-templates-open', () => redsTemplatesModal && !redsTemplatesModal.hidden],
        ['return-pdf-open', () => retornoLiberacaoPdfModal && !retornoLiberacaoPdfModal.hidden],
        ['system-manual-open', () => systemManualModal && !systemManualModal.hidden],
        ['tutorial-open', () => tutorialModal && !tutorialModal.hidden],
        ['useful-links-open', () => usefulLinksModal && !usefulLinksModal.hidden],
        ['user-manager-open', () => userManagerModal && !userManagerModal.hidden],
        ['about-open', () => aboutSystemModal && !aboutSystemModal.hidden],
        ['app-diagnostics-open', () => appDiagnosticsModal && !appDiagnosticsModal.hidden],
        ['access-guidance-open', () => accessGuidanceModal && !accessGuidanceModal.hidden],
        ['city-check-open', () => cityCheckModal && !cityCheckModal.hidden],
        ['daily-motivational-open', () => {
          const modal = document.getElementById('dailyMotivationalOverlay');
          return modal && !modal.hidden;
        }],
        ['inspection-start-choice-open', () => {
          const modal = document.getElementById('inspectionStartChoiceModal');
          return modal && !modal.hidden;
        }],
        ['more-menu-open', () => appMoreMenu && !appMoreMenu.hidden],
        ['review-open', () => document.querySelector('.review-overlay:not([hidden])')],
        ['auth-locked', () => authGate && authGate.classList.contains('show')],
        ['printing-goals', () => window.matchMedia?.('print')?.matches === true]
      ];
      let recordDetailReturnContext = '';
      let ultimoRegistroConsultaChave = '';
      let recordsSearchTimer = null;
      let recordsSearchPending = false;
      let recordsRequestSequencia_ = 0;
      let recordsRequestController_ = null;
      let recordsRequestStartedAt_ = 0;
      let recordsForegroundRefreshTimer_ = null;
      let recordsPeriodicRefreshTimer_ = null;
      let recordsPostSyncTimers_ = [];
      let atualizacaoPlanilhaPromise_ = null;
      const recordsState = {
        pagina: 1,
        limite: 25,
        total: 0,
        totalPaginas: 1,
        carregando: false,
        planilhaUrl: '',
        itens: [],
        resumo: null,
        chaveSelecionada: '',
        linhaSelecionada: 0,
        prazoMulta: ''
      };

      function registrarFalhaInterface_(tipo, detalhe) {
        try {
          const registro = {
            em: new Date().toISOString(),
            tipo: String(tipo || 'erro'),
            detalhe: String(detalhe || '').slice(0, 1000),
            versao: APP_REVISION_UI_
          };
          localStorage.setItem(APP_LAST_ERROR_KEY_, JSON.stringify(registro));
        } catch (e) {}
      }

      function registrarRecuperacaoInterface_(motivo, detalhes) {
        try {
          const registro = {
            em: new Date().toISOString(),
            motivo: String(motivo || 'watchdog'),
            detalhes: Array.isArray(detalhes) ? detalhes.slice(0, 20) : [],
            versao: APP_REVISION_UI_
          };
          localStorage.setItem(APP_LAST_RECOVERY_KEY_, JSON.stringify(registro));
        } catch (e) {}
      }

      window.addEventListener('error', event => {
        const mensagem = [event?.message, event?.filename ? String(event.filename).split('/').pop() : '', event?.lineno ? `linha ${event.lineno}` : '']
          .filter(Boolean).join(' • ');
        registrarFalhaInterface_('JavaScript', mensagem || 'Erro não identificado');
      });

      window.addEventListener('unhandledrejection', event => {
        const motivo = event?.reason?.message || String(event?.reason || 'Promise rejeitada sem tratamento');
        registrarFalhaInterface_('Requisição/Promise', motivo);
      });

      function elementoBloqueadorOrfao_(el) {
        if (!el || el.hidden) return false;
        try {
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none') return false;
          const opacidade = Number.parseFloat(st.opacity || '1');
          return opacidade <= 0.01 && st.pointerEvents !== 'none';
        } catch (e) {
          return false;
        }
      }

      function repararInterfaceOrfa_(motivo = 'watchdog', forcar = false) {
        if (!document.body) return { corrigidos: 0, detalhes: [] };
        const detalhes = [];
        let corrigidos = 0;

        UI_LOCK_MODAL_MAP_.forEach(([classe, estaAberto]) => {
          if (!document.body.classList.contains(classe)) return;
          let aberto = false;
          try { aberto = Boolean(estaAberto()); } catch (e) { aberto = false; }
          if (!aberto) {
            document.body.classList.remove(classe);
            corrigidos += 1;
            detalhes.push(`classe órfã: ${classe}`);
          }
        });

        // Overlays invisíveis com pointer-events ativos podem capturar todos os toques.
        document.querySelectorAll([
          '.review-overlay',
          '.mobile-choice-overlay',
          '.gpv-dialog-overlay',
          '.tutorial-overlay',
          '.access-guidance-overlay',
          '.user-manager-overlay',
          '.record-status-update-overlay',
          '.record-correction-overlay',
          '.useful-links-overlay',
          '.about-overlay',
          '.city-check-overlay',
          '.daily-motivational-overlay',
          '.inspection-start-choice-overlay'
        ].join(', ')).forEach(el => {
          if (!elementoBloqueadorOrfao_(el)) return;
          el.hidden = true;
          el.setAttribute('aria-hidden', 'true');
          corrigidos += 1;
          detalhes.push(`overlay invisível: ${el.id || el.className || 'sem-id'}`);
        });

        // A camada pode ter sido ocultada no bloco anterior. Faz uma segunda
        // conferência para remover, no mesmo ciclo, a classe de bloqueio ligada a ela.
        UI_LOCK_MODAL_MAP_.forEach(([classe, estaAberto]) => {
          if (!document.body.classList.contains(classe)) return;
          let aberto = false;
          try { aberto = Boolean(estaAberto()); } catch (e) { aberto = false; }
          if (!aberto) {
            document.body.classList.remove(classe);
            corrigidos += 1;
            detalhes.push(`classe órfã: ${classe}`);
          }
        });

        // Em alguns navegadores móveis, uma propriedade inline residual pode sobreviver
        // ao fechamento de um modal.
        ['pointerEvents','touchAction'].forEach(prop => {
          const atual = String(document.body.style[prop] || '');
          const bloqueioTotal = atual === 'none';
          if ((forcar && atual && atual !== 'auto' && atual !== 'manipulation') || bloqueioTotal) {
            document.body.style[prop] = '';
            corrigidos += 1;
            detalhes.push(`body.${prop}`);
          }
        });

        const modalInicio = document.getElementById('inspectionStartChoiceModal');
        if (modalInicio?.dataset.loading === '1') {
          const iniciouEm = Number(modalInicio.dataset.loadingAt || 0);
          const expirou = iniciouEm > 0 && Date.now() - iniciouEm > 90000;
          if (modalInicio.hidden || forcar || expirou) {
            resetarEstadoEscolhaInicioVistoria_();
            corrigidos += 1;
            detalhes.push('botões de início da vistoria');
          }
        }

        if (
          inspectionSuggestionsRefreshBtn?.disabled &&
          inspectionSuggestionsRefreshBtn.classList.contains('is-loading') &&
          !sugestoesFiscalizacaoAtualizando
        ) {
          inspectionSuggestionsRefreshBtn.disabled = false;
          inspectionSuggestionsRefreshBtn.classList.remove('is-loading');
          const texto = inspectionSuggestionsRefreshBtn.querySelector('span');
          if (texto) texto.textContent = 'Atualizar agora';
          corrigidos += 1;
          detalhes.push('botão de atualização das sugestões');
        }

        if (recordsRefreshBtn?.disabled && !recordsState.carregando) {
          recordsRefreshBtn.disabled = false;
          recordsRefreshBtn.classList.remove('is-loading');
          recordsRefreshBtn.removeAttribute('aria-busy');
          corrigidos += 1;
          detalhes.push('botão de atualização do Painel');
        }

        const consultaPainelExpirada = recordsState.carregando && recordsRequestStartedAt_ > 0 &&
          Date.now() - recordsRequestStartedAt_ > 90 * 1000;
        if (consultaPainelExpirada) {
          cancelarConsultaPainelEmAndamento_('watchdog: consulta sem resposta');
          corrigidos += 1;
          detalhes.push('consulta antiga do Painel');
          if (document.body.classList.contains('records-mode') && navigator.onLine) {
            agendarAtualizacaoPainelAoRetornar_('watchdog', { forcar: true, atraso: 200 });
          }
        }

        if (corrigidos) {
          ultimaRecuperacaoInterface_ = `${new Date().toLocaleString('pt-BR')} — ${motivo}: ${detalhes.join(', ')}`;
          registrarRecuperacaoInterface_(motivo, detalhes);
        }

        return { corrigidos, detalhes };
      }

      function iniciarWatchdogInterface_() {
        clearInterval(watchdogInterfaceTimer_);
        watchdogInterfaceTimer_ = setInterval(() => {
          if (document.visibilityState !== 'visible') return;
          repararInterfaceOrfa_('verificação automática');
        }, 20000);
      }

      function contarRascunhosLocaisDiagnostico_() {
        try { return lerIndiceRascunhosLocais_().length; } catch (e) { return 0; }
      }

      function lerUltimaFalhaInterface_() {
        try { return JSON.parse(localStorage.getItem(APP_LAST_ERROR_KEY_) || 'null'); }
        catch (e) { return null; }
      }

      function lerUltimaRecuperacaoInterface_() {
        try { return JSON.parse(localStorage.getItem(APP_LAST_RECOVERY_KEY_) || 'null'); }
        catch (e) { return null; }
      }

      function lerRegistroDiagnostico_(chave) {
        try { return JSON.parse(localStorage.getItem(chave) || 'null'); }
        catch (e) { return null; }
      }

      function formatarDataDiagnostico_(valor) {
        const data = valor ? new Date(valor) : null;
        if (!data || Number.isNaN(data.getTime())) return 'Ainda não registrada';
        return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
      }

      function resumoUltimaRespostaApiDiagnostico_() {
        const item = lerRegistroDiagnostico_(APP_LAST_API_SUCCESS_STORAGE);
        if (!item?.em) return 'Ainda não registrada';
        const operacao = [item.acao, item.consulta].filter(Boolean).join(' / ');
        return `${formatarDataDiagnostico_(item.em)}${operacao ? ` • ${operacao}` : ''}`;
      }

      function resumoUltimaAtualizacaoPainelDiagnostico_() {
        const item = lerRegistroDiagnostico_(PANEL_LAST_SUCCESS_STORAGE);
        if (!item?.em) return 'Ainda não registrada neste aparelho';
        const total = Number.isFinite(Number(item.total)) ? ` • ${Number(item.total)} registro(s)` : '';
        return `${formatarDataDiagnostico_(item.em)}${total}`;
      }

      function resumoConsultaPainelDiagnostico_() {
        if (!recordsState.carregando || !recordsRequestStartedAt_) return 'Nenhuma consulta em andamento';
        const segundos = Math.max(0, Math.round((Date.now() - recordsRequestStartedAt_) / 1000));
        return `Em andamento há ${segundos}s`;
      }

      function resumoRascunhoAtualDiagnostico_() {
        if (!usuarioPodeOperar_()) return 'Preenchimento temporário — não gravado';
        try {
          const raw = localStorage.getItem(draftKeyAtual_(currentRecordId));
          if (!raw) return rascunhoEmAndamento_() ? 'Outro rascunho preservado no aparelho' : 'Nenhum rascunho ativo';
          const draft = JSON.parse(raw);
          if (!draft?.payload || rascunhoFinalizadoLocal_(currentRecordId)) return 'Nenhum rascunho ativo';
          const salvoEm = Number(draft.savedAt || 0);
          const horario = salvoEm
            ? new Date(salvoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
            : 'horário não identificado';
          return `Salvo em ${horario} • ID ${String(currentRecordId || '').slice(0, 8) || '—'}`;
        } catch (e) {
          return 'Rascunho atual não pôde ser lido';
        }
      }

      async function resumoCachePwaDiagnostico_() {
        if (!('caches' in window)) return 'Indisponível neste navegador';
        try {
          const nomes = (await caches.keys()).filter(nome => nome.startsWith('gpv-vistorias-pwa-'));
          if (!nomes.length) return 'Nenhum cache do app localizado';
          const atual = nomes.find(nome => nome.includes('localizacao-bx')) || nomes[nomes.length - 1];
          const cache = await caches.open(atual);
          const entradas = await cache.keys();
          return `${atual} • ${entradas.length} arquivo(s)`;
        } catch (e) {
          return 'Não foi possível consultar o cache';
        }
      }

      async function resumoServiceWorkerDiagnostico_() {
        if (!('serviceWorker' in navigator)) return 'Não suportado';
        try {
          const registro = await navigator.serviceWorker.getRegistration();
          const controlador = navigator.serviceWorker.controller;
          if (!registro && !controlador) return 'Não registrado';
          const estado = controlador?.state || registro?.active?.state || 'registrado';
          if (registro?.waiting) return `${estado} • atualização aguardando aplicação`;
          if (registro?.installing) return `${estado} • atualização instalando`;
          return controlador ? `${estado} • controlando esta tela` : `${estado} • aguardando controle da tela`;
        } catch (e) {
          return navigator.serviceWorker.controller ? 'Ativo' : 'Estado indisponível';
        }
      }

      function diagnosticoItemHtml_(rotulo, valor) {
        return `<div class="app-diagnostics-item"><label>${escapeHtml(rotulo)}</label><strong>${escapeHtml(valor == null ? '—' : String(valor))}</strong></div>`;
      }

      async function atualizarDiagnosticoApp_(opcoes = {}) {
        if (!appDiagnosticsGrid || !appDiagnosticsStatus) return;
        const reparo = opcoes.ignorarReparo
          ? { corrigidos: 0, detalhes: [] }
          : repararInterfaceOrfa_('abertura do diagnóstico');
        const locks = UI_LOCK_MODAL_MAP_.filter(([classe]) => document.body.classList.contains(classe)).map(([classe]) => classe);
        const overlaysVisiveis = Array.from(document.querySelectorAll('[class*="overlay"]:not([hidden])'))
          .filter(el => {
            try {
              const st = getComputedStyle(el);
              return st.display !== 'none' && st.visibility !== 'hidden';
            } catch (e) { return true; }
          }).length;
        const [serviceWorkerResumo, cacheResumo] = await Promise.all([
          resumoServiceWorkerDiagnostico_(),
          resumoCachePwaDiagnostico_()
        ]);
        const conexao = navigator.connection?.effectiveType
          ? `${navigator.onLine ? 'Online' : 'Offline'} • ${navigator.connection.effectiveType}`
          : (navigator.onLine ? 'Online' : 'Offline');
        const filaOffline = obterPendentes().length;
        const recuperacao = lerUltimaRecuperacaoInterface_();
        const ultimaFalhaPainel = lerRegistroDiagnostico_(PANEL_LAST_ERROR_STORAGE);

        const itens = [
          ['Revisão do app', APP_REVISION_UI_],
          ['Conexão', conexao],
          ['Service Worker', serviceWorkerResumo],
          ['Cache do app', cacheResumo],
          ['Fila offline', filaOffline ? `${filaOffline} vistoria(s) aguardando envio` : 'Sem envios pendentes'],
          ['Última resposta válida da API', resumoUltimaRespostaApiDiagnostico_()],
          ['Última atualização do Painel', resumoUltimaAtualizacaoPainelDiagnostico_()],
          ['Consulta do Painel', resumoConsultaPainelDiagnostico_()],
          ['Última falha do Painel', ultimaFalhaPainel?.em
            ? `${formatarDataDiagnostico_(ultimaFalhaPainel.em)} • ${ultimaFalhaPainel.mensagem || 'falha não detalhada'}`
            : 'Nenhuma registrada'],
          ['Rascunho atual', resumoRascunhoAtualDiagnostico_()],
          ['Rascunhos preservados', contarRascunhosLocaisDiagnostico_()],
          ['Bloqueios ativos', locks.length ? locks.join(', ') : 'Nenhum'],
          ['Camadas abertas', overlaysVisiveis],
          ['Última recuperação', recuperacao?.em ? new Date(recuperacao.em).toLocaleString('pt-BR') : 'Nenhuma'],
          ['Usuário', authState.usuario?.nome || 'Sem sessão'],
          ['Aparelho', nomeDispositivo_() || 'Não identificado']
        ];
        appDiagnosticsGrid.innerHTML = itens.map(([r,v]) => diagnosticoItemHtml_(r,v)).join('');

        const ultima = lerUltimaFalhaInterface_();
        if (appDiagnosticsLastError) {
          appDiagnosticsLastError.hidden = !ultima;
          appDiagnosticsLastError.textContent = ultima
            ? `Última falha JavaScript\n${ultima.em || ''}\n${ultima.tipo || ''}: ${ultima.detalhe || ''}`
            : '';
        }

        if (reparo.corrigidos) {
          appDiagnosticsStatus.textContent = `A interface tinha ${reparo.corrigidos} bloqueio(s) inconsistente(s) e foi corrigida.`;
          appDiagnosticsStatus.className = 'app-diagnostics-status warning';
        } else {
          appDiagnosticsStatus.textContent = 'Nenhum bloqueio inconsistente foi encontrado neste momento.';
          appDiagnosticsStatus.className = 'app-diagnostics-status ok';
        }
      }

      function abrirDiagnosticoApp_() {
        fecharMenuMais_();
        if (!appDiagnosticsModal) return;
        appDiagnosticsModal.hidden = false;
        document.body.classList.add('app-diagnostics-open');
        void atualizarDiagnosticoApp_();
        setTimeout(() => appDiagnosticsCloseBtn?.focus(), 0);
      }

      function fecharDiagnosticoApp_() {
        if (!appDiagnosticsModal) return;
        appDiagnosticsModal.hidden = true;
        document.body.classList.remove('app-diagnostics-open');
      }

      async function repararInterfacePeloUsuario_() {
        const resultado = repararInterfaceOrfa_('ação manual', true);
        fecharEscolhaMovel_();
        fecharMenuMais_();
        // Mantém formulários/rascunhos e não recarrega a página.
        await atualizarDiagnosticoApp_({ ignorarReparo: true });
        if (appDiagnosticsStatus) {
          appDiagnosticsStatus.textContent = resultado.corrigidos
            ? `Foram corrigidos ${resultado.corrigidos} bloqueio(s) da interface sem apagar o preenchimento.`
            : 'A interface foi conferida. Nenhum bloqueio órfão foi encontrado.';
          appDiagnosticsStatus.className = resultado.corrigidos ? 'app-diagnostics-status warning' : 'app-diagnostics-status ok';
        }
      }

      function perfilAcessoAtual_() {
        return String(authState.usuario?.perfil || 'GPV').trim().toUpperCase() === 'GERAL' ? 'GERAL' : 'GPV';
      }

      function usuarioPodeOperar_() {
        return perfilAcessoAtual_() === 'GPV';
      }

      // V23.9.99bh — a planilha administrativa fica acessível somente
      // para usuários do perfil GPV. O perfil GERAL permanece no app
      // exclusivamente com os recursos de consulta/treinamento permitidos.
      function usuarioPodeAcessarPlanilha_() {
        return perfilAcessoAtual_() === 'GPV';
      }

      function bloquearLinksPlanilhaParaGeral_() {
        if (usuarioPodeAcessarPlanilha_()) return;

        [
          recordsOpenSheetLink,
          recordDetailSheetLink,
          adminSheetMenuLink,
          dashboardSheetHeaderLink
        ].forEach(link => {
          if (!link) return;
          link.hidden = true;
          link.removeAttribute('href');
          link.setAttribute('aria-hidden', 'true');
          link.setAttribute('tabindex', '-1');
        });
      }

      function usuarioEmTreinamento_() {
        return perfilAcessoAtual_() === 'GERAL';
      }

      function fecharAvisoAcessoGeral_() {
        if (!accessGuidanceModal || accessGuidanceModal.hidden) return;
        accessGuidanceModal.hidden = true;
        accessGuidanceModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('access-guidance-open');
        const resolver = accessGuidanceResolve;
        accessGuidanceResolve = null;
        if (resolver) resolver(true);
      }

      function mostrarAvisoAcessoGeral_(tipo = 'login') {
        if (!usuarioEmTreinamento_() || !accessGuidanceModal) return Promise.resolve(true);
        const textos = {
          login: { titulo: 'Conheça o sistema', texto: 'Você pode utilizar as funcionalidades disponíveis para conhecer e praticar o funcionamento do sistema. Nenhuma vistoria ou alteração realizada neste acesso será registrada.', botao: 'Entendi — acessar o sistema' },
          vistoria: { titulo: 'Vistoria', texto: 'Você pode preencher e percorrer todo o processo normalmente para conhecer o funcionamento da vistoria. Ao final, nenhuma informação será enviada ou registrada.', botao: 'Continuar' },
          conclusao: { titulo: 'Treinamento concluído', texto: 'Você percorreu o fluxo da vistoria. Nenhuma vistoria ou alteração foi enviada ou registrada.', botao: 'Continuar no sistema' },
          cadastro: { titulo: 'Cadastro concluído', texto: 'Você percorreu o cadastro da vistoria. Nenhuma programação, arquivo ou alteração foi enviada ou registrada.', botao: 'Continuar no sistema' }
        };
        const conteudo = textos[tipo] || textos.login;
        if (accessGuidanceResolve) fecharAvisoAcessoGeral_();
        if (accessGuidanceTitle) accessGuidanceTitle.textContent = conteudo.titulo;
        if (accessGuidanceText) accessGuidanceText.textContent = conteudo.texto;
        if (accessGuidanceContinueBtn) accessGuidanceContinueBtn.textContent = conteudo.botao;
        accessGuidanceModal.hidden = false;
        accessGuidanceModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('access-guidance-open');
        return new Promise(resolve => {
          accessGuidanceResolve = resolve;
          setTimeout(() => accessGuidanceContinueBtn?.focus(), 20);
        });
      }

      function atualizarPerfilLocalPorResposta_(result) {
        const perfil = String(result?.acessoPerfil || '').trim().toUpperCase();
        if (!authState.usuario?.id || !['GPV', 'GERAL'].includes(perfil)) return;
        if (String(authState.usuario.perfil || 'GPV').trim().toUpperCase() === perfil) return;
        const usuarioAtualizado = { ...authState.usuario, perfil };
        salvarSessaoLocalBm_(usuarioAtualizado, authState.sessionToken);
        aplicarPermissoesInterface_();
        // V23.9.72: uma atualização de perfil vinda da API não deve expulsar
        // o usuário GERAL da Vistoria. Ele pode permanecer no fluxo para
        // treinamento; ações de gravação continuam bloqueadas no servidor.
      }

      function aplicarPermissoesInterface_() {
        const consulta = !usuarioPodeOperar_();
        document.body.classList.toggle('access-geral', consulta);

        const ocultarOperacional = [
          registerDduBtn,
          usefulLinksBtn,
          aboutSystemBtn,
          manageUsersBtn,
          redsTemplatesMenuBtn,
          loggedUserBadge,
          adminSheetMenuLink,
          dashboardSheetHeaderLink,
          recordsOpenSheetLink,
          recordDetailSheetLink,
          recordInfoscipUpdatePanel,
          recordAutoNumberWrap,
          recordWhatsappPanel,
          pendingPanel,
          syncSummary
        ];
        ocultarOperacional.forEach(el => {
          if (!el) return;
          if (consulta) el.hidden = true;
        });

        if (form) form.hidden = false;
        if (formTabBtn) formTabBtn.hidden = false;
        if (dashboardNewInspectionBtn) dashboardNewInspectionBtn.hidden = false;
        if (prepareInspectionBtn) prepareInspectionBtn.hidden = false;
        if (desktopPrepareInspectionBtn) desktopPrepareInspectionBtn.hidden = false;
        if (!consulta) {
          // Elementos condicionais são reexibidos pelas rotinas próprias quando aplicável.
          if (registerDduBtn) registerDduBtn.hidden = false;
          if (usefulLinksBtn) usefulLinksBtn.hidden = false;
          if (aboutSystemBtn) aboutSystemBtn.hidden = false;
          if (manageUsersBtn) manageUsersBtn.hidden = false;
          if (redsTemplatesMenuBtn) redsTemplatesMenuBtn.hidden = false;
          if (syncSummary) syncSummary.hidden = false;
          carregarModelosRedsPersonalizados_(false).catch(() => {});
        } else {
          if (draftStatus) draftStatus.textContent = 'Preenchimento temporário';
          if (submitBtn) submitBtn.textContent = 'Finalizar treinamento';
          if (prepareInspectionSaveBtn && !preparacaoEditandoId) prepareInspectionSaveBtn.textContent = 'Finalizar treinamento';
        }

        // Defesa adicional contra links residuais de uma sessão GPV anterior
        // no mesmo aparelho/navegador.
        bloquearLinksPlanilhaParaGeral_();
      }

      function abrirManualSistema_() {
        fecharMenuMais_();
        if (!systemManualModal) return;
        systemManualModal.hidden = false;
        document.body.classList.add('system-manual-open');
        if (systemManualScroll) systemManualScroll.scrollTop = 0;
        setTimeout(() => systemManualCloseBtn?.focus(), 0);
      }

      function fecharManualSistema_() {
        if (!systemManualModal) return;
        systemManualModal.hidden = true;
        document.body.classList.remove('system-manual-open');
      }

      function navegarManualSistema_(targetId) {
        const alvo = document.getElementById(String(targetId || ''));
        if (!alvo || !systemManualScroll) return;
        const top = alvo.offsetTop - 12;
        systemManualScroll.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }


      function normalizarConsultaDuvidas_(valor) {
        return String(valor == null ? '' : valor)
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9./\s-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function tokensConsultaDuvidas_(valor) {
        const stop = new Set([
          'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas',
          'para','por','com','sem','que','qual','quais','como','onde','quando','porque','porquê','se','ser','esta','este',
          'isso','isto','ao','aos','ou','me','eu','tem','tenho','deve','deverá','devera','sobre','mais','menos'
        ]);
        return Array.from(new Set(normalizarConsultaDuvidas_(valor).split(' ').filter(t => t.length >= 3 && !stop.has(t)))).slice(0, 18);
      }

      function buscarContextoManualDuvidas_(pergunta) {
        const tokens = tokensConsultaDuvidas_(pergunta);
        const consulta = normalizarConsultaDuvidas_(pergunta);
        const secoes = Array.from(document.querySelectorAll('#systemManualModal .system-manual-section'));
        return secoes.map(sec => {
          const titulo = String(sec.querySelector('h3')?.textContent || '').trim();
          const texto = Array.from(sec.querySelectorAll('p')).map(p => String(p.textContent || '').trim()).filter(Boolean).join(' ');
          const canon = normalizarConsultaDuvidas_(`${titulo} ${texto}`);
          let score = 0;
          tokens.forEach(t => {
            if (normalizarConsultaDuvidas_(titulo).includes(t)) score += 6;
            else if (canon.includes(t)) score += 2;
          });
          if (consulta && canon.includes(consulta)) score += 14;
          return { id: sec.id || '', titulo, texto: texto.slice(0, 1500), score };
        }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, 3);
      }

      async function buscarContextoItsDuvidas_(pergunta) {
        const base = await carregarBaseNormativaITS_().catch(() => []);
        if (!Array.isArray(base) || !base.length) return [];
        const tokens = tokensConsultaDuvidas_(pergunta);
        const consulta = normalizarConsultaDuvidas_(pergunta);
        const itExplicita = consulta.match(/\bit\s*0*(\d{1,2})\b/i);
        const itemExplicito = consulta.match(/\b(?:item\s*)?([a-z]?\.?\d+(?:\.\d+){1,6})\b/i);
        const itNumero = itExplicita ? Number(itExplicita[1]) : 0;
        const itemNumero = itemExplicito ? String(itemExplicito[1] || '').toUpperCase() : '';
        const candidatos = [];

        for (const ref of base) {
          const it = Number(ref?.it || 0);
          if (itNumero && it !== itNumero) continue;
          const section = String(ref?.section || '').trim();
          const text = String(ref?.text || '').trim();
          const tituloCanon = normalizarConsultaDuvidas_(section);
          const textoCanon = normalizarConsultaDuvidas_(text);
          let score = 0;
          if (itNumero && it === itNumero) score += 30;
          if (itemNumero && normalizarConsultaDuvidas_(section).includes(normalizarConsultaDuvidas_(itemNumero))) score += 34;
          tokens.forEach(t => {
            if (tituloCanon.includes(t)) score += 6;
            if (textoCanon.includes(t)) score += 2;
          });
          if (consulta.length > 8 && textoCanon.includes(consulta)) score += 18;
          if (score > 0) candidatos.push({ it, item: section, texto: text.slice(0, 1400), arquivo: String(ref?.arquivo || ''), score });
        }

        candidatos.sort((a,b) => b.score - a.score);
        const usados = new Set();
        const saida = [];
        for (const c of candidatos) {
          const chave = `${c.it}|${c.item}`;
          if (usados.has(chave)) continue;
          usados.add(chave);
          saida.push(c);
          if (saida.length >= 5) break;
        }
        return saida;
      }

      function fontesContextoDuvidas_(manual, its) {
        const fontes = [];
        (Array.isArray(manual) ? manual : []).slice(0,3).forEach(m => fontes.push({ tipo:'manual', titulo:m.titulo || 'Manual do Sistema', id:m.id || '' }));
        (Array.isArray(its) ? its : []).slice(0,5).forEach(i => fontes.push({ tipo:'it', it:Number(i.it || 0), item:String(i.item || ''), titulo:`IT ${String(i.it || '').padStart(2,'0')}${i.item ? ` · item ${i.item}` : ''}` }));
        return fontes;
      }

      function montarRespostaLocalDuvidas_(pergunta, manual, its) {
        const partes = [];
        const manualTop = Array.isArray(manual) ? manual[0] : null;
        const itsTop = Array.isArray(its) ? its.slice(0,3) : [];
        if (manualTop) partes.push(`Manual do Sistema — ${manualTop.titulo}\n${String(manualTop.texto || '').slice(0,900)}`);
        if (itsTop.length) {
          const blocos = itsTop.map(ref => `IT ${String(ref.it || '').padStart(2,'0')}${ref.item ? `, item ${ref.item}` : ''}: ${String(ref.texto || '').slice(0,650)}`);
          partes.push(`Base técnica localizada:\n${blocos.join('\n\n')}`);
        }
        if (!partes.length) {
          return 'Não localizei no Manual do Sistema nem na base das Instruções Técnicas um trecho suficientemente relacionado a essa pergunta. Tente informar o assunto, a IT ou o item específico. Se a dúvida for sobre a situação oficial de um processo, consulte o INFOSCIP.';
        }
        return `${partes.join('\n\n')}\n\nAtenção operacional: para situação oficial de processo, confirme no INFOSCIP.`;
      }

      function resetarHistoricoDuvidas_(forcar = false) {
        const usuarioId = String(authState.usuario?.id || '');
        if (!forcar && duvidasHistoricoUsuarioId_ === usuarioId) return;
        duvidasHistoricoUsuarioId_ = usuarioId;
        duvidasHistorico_ = [];
        pararAnimacaoConsultaDuvidas_();
        duvidasRespondendo_ = false;
        duvidasPerguntaEmCurso_ = '';
        renderizarHistoricoDuvidas_();
        atualizarComposerDuvidas_();
      }

      function horaMensagemDuvidas_(valor) {
        try {
          const data = valor ? new Date(valor) : new Date();
          if (Number.isNaN(data.getTime())) return '';
          return new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit' }).format(data);
        } catch (e) { return ''; }
      }

      function formatarInlineDuvidas_(texto) {
        let seguro = escapeHtml(String(texto || ''));
        seguro = seguro.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        seguro = seguro.replace(/`([^`]+)`/g, '<code>$1</code>');
        return seguro;
      }

      function formatarConteudoMensagemDuvidas_(texto) {
        const linhas = String(texto || '').replace(/\r/g, '').split('\n');
        const partes = [];
        let lista = [];
        let listaTipo = '';
        const fecharLista = () => {
          if (!lista.length) return;
          const tag = listaTipo === 'ol' ? 'ol' : 'ul';
          partes.push(`<${tag}>${lista.map(item => `<li>${formatarInlineDuvidas_(item)}</li>`).join('')}</${tag}>`);
          lista = [];
          listaTipo = '';
        };
        linhas.forEach(linhaOriginal => {
          const linha = String(linhaOriginal || '').trim();
          if (!linha) { fecharLista(); return; }
          const bullet = linha.match(/^[-•]\s+(.+)$/);
          const numero = linha.match(/^\d+[.)]\s+(.+)$/);
          if (bullet || numero) {
            const tipo = numero ? 'ol' : 'ul';
            if (listaTipo && listaTipo !== tipo) fecharLista();
            listaTipo = tipo;
            lista.push((bullet || numero)[1]);
            return;
          }
          fecharLista();
          const titulo = linha.match(/^#{1,3}\s+(.+)$/);
          if (titulo) partes.push(`<h4>${formatarInlineDuvidas_(titulo[1])}</h4>`);
          else if (/^(atenção operacional|atenção|fonte|fontes|resposta)\s*:/i.test(linha)) partes.push(`<p class="duvidas-answer-emphasis">${formatarInlineDuvidas_(linha)}</p>`);
          else partes.push(`<p>${formatarInlineDuvidas_(linha)}</p>`);
        });
        fecharLista();
        return partes.join('');
      }

      function renderizarIndicadoresDuvidas_(msg) {
        const fontes = Array.isArray(msg?.fontes) ? msg.fontes : [];
        const manual = fontes.some(f => f?.tipo === 'manual');
        const its = fontes.filter(f => f?.tipo === 'it').length;
        const badges = [];
        if (msg?.modo === 'ia') badges.push('<span class="duvidas-mode-chip ia">IA</span>');
        else badges.push('<span class="duvidas-mode-chip local">Base local</span>');
        if (manual) badges.push('<span class="duvidas-mode-chip manual">Manual</span>');
        if (its) badges.push(`<span class="duvidas-mode-chip it">${its} ${its === 1 ? 'IT' : 'ITs'}</span>`);
        if (msg?.iaIndisponivel) badges.push('<span class="duvidas-mode-chip warning">IA indisponível</span>');
        return badges.join('');
      }

      function renderizarFontesDuvidas_(fontes) {
        const lista = Array.isArray(fontes) ? fontes : [];
        if (!lista.length) return '';
        const itens = lista.slice(0,8).map(f => {
          if (f.tipo === 'it' && Number(f.it || 0)) {
            const numero = String(Number(f.it)).padStart(2,'0');
            const titulo = escapeHtml(f.titulo || `IT ${numero}`);
            return `<a class="duvidas-source-item" href="./instrucoes-tecnicas/its/it-${numero}.html" target="_blank" rel="noopener"><span class="duvidas-source-icon">IT</span><span>${titulo}</span><b aria-hidden="true">↗</b></a>`;
          }
          const titulo = escapeHtml(f.titulo || 'Manual do Sistema');
          const id = escapeHtml(f.id || '');
          return `<button class="duvidas-source-item" type="button" data-duvidas-manual-id="${id}"><span class="duvidas-source-icon manual">M</span><span>${titulo}</span><b aria-hidden="true">→</b></button>`;
        }).join('');
        return `<details class="duvidas-source-details"><summary><span>Fontes consultadas</span><strong>${lista.length}</strong></summary><div class="duvidas-source-list">${itens}</div></details>`;
      }

      function renderizarCarregamentoDuvidas_() {
        const etapas = ['Analisando sua pergunta', 'Consultando Manual e ITs', 'Preparando a resposta'];
        return `<div class="duvidas-message assistant duvidas-thinking-message" data-duvidas-thinking>
          <div class="duvidas-assistant-row">
            <div class="duvidas-assistant-avatar" aria-hidden="true">GPV</div>
            <div class="duvidas-thinking-card">
              <div class="duvidas-thinking-title"><span class="duvidas-thinking-dots"><i></i><i></i><i></i></span><strong>Consultando...</strong></div>
              <div class="duvidas-thinking-steps">${etapas.map((etapa,idx) => `<span class="duvidas-thinking-step ${idx === duvidasEtapaCarregamento_ ? 'active' : (idx < duvidasEtapaCarregamento_ ? 'done' : '')}" data-duvidas-step="${idx}"><i></i>${etapa}</span>`).join('')}</div>
            </div>
          </div>
        </div>`;
      }

      function atualizarEtapasCarregamentoDuvidas_() {
        if (!duvidasConversation) return;
        duvidasConversation.querySelectorAll('[data-duvidas-step]').forEach(el => {
          const idx = Number(el.dataset.duvidasStep || 0);
          el.classList.toggle('active', idx === duvidasEtapaCarregamento_);
          el.classList.toggle('done', idx < duvidasEtapaCarregamento_);
        });
      }

      function iniciarAnimacaoConsultaDuvidas_() {
        pararAnimacaoConsultaDuvidas_();
        duvidasEtapaCarregamento_ = 0;
        atualizarEtapasCarregamentoDuvidas_();
        duvidasCarregamentoTimer_ = setInterval(() => {
          if (!duvidasRespondendo_) return;
          if (duvidasEtapaCarregamento_ < 2) duvidasEtapaCarregamento_ += 1;
          atualizarEtapasCarregamentoDuvidas_();
        }, 1350);
      }

      function pararAnimacaoConsultaDuvidas_() {
        if (duvidasCarregamentoTimer_) clearInterval(duvidasCarregamentoTimer_);
        duvidasCarregamentoTimer_ = null;
        duvidasEtapaCarregamento_ = 0;
      }

      function renderizarHistoricoDuvidas_() {
        if (!duvidasConversation) return;
        const pertoFim = duvidasConversation.scrollHeight - duvidasConversation.scrollTop - duvidasConversation.clientHeight < 140;
        if (!duvidasHistorico_.length && !duvidasRespondendo_) {
          duvidasConversation.innerHTML = '<div class="duvidas-empty" id="duvidasEmpty"><div class="duvidas-empty-icon" aria-hidden="true">?</div><strong>Como posso ajudar?</strong><span>Escreva uma dúvida ou escolha uma pergunta rápida acima. As fontes utilizadas aparecem junto da resposta.</span><div class="duvidas-empty-capabilities"><span>Manual</span><span>ITs CBMMG</span><span>Contexto da conversa</span></div></div>';
        } else {
          const mensagens = duvidasHistorico_.map((msg, index) => {
            const usuario = msg.papel === 'usuario';
            const hora = horaMensagemDuvidas_(msg.hora);
            if (usuario) {
              return `<article class="duvidas-message user" data-duvidas-index="${index}"><div class="duvidas-message-bubble user-bubble">${formatarConteudoMensagemDuvidas_(msg.texto || '')}</div><div class="duvidas-message-meta"><span>Você</span>${hora ? `<time>${hora}</time>` : ''}</div></article>`;
            }
            return `<article class="duvidas-message assistant" data-duvidas-index="${index}">
              <div class="duvidas-assistant-row"><div class="duvidas-assistant-avatar" aria-hidden="true">GPV</div><div class="duvidas-assistant-content">
                <div class="duvidas-message-bubble assistant-bubble">${formatarConteudoMensagemDuvidas_(msg.texto || '')}</div>
                <div class="duvidas-message-meta duvidas-assistant-meta"><span>Assistente GPV</span>${hora ? `<time>${hora}</time>` : ''}<span class="duvidas-mode-group">${renderizarIndicadoresDuvidas_(msg)}</span></div>
                ${renderizarFontesDuvidas_(msg.fontes)}
                <div class="duvidas-message-actions"><button type="button" data-duvidas-copy-index="${index}" aria-label="Copiar resposta">Copiar</button><button type="button" data-duvidas-retry-index="${index}" aria-label="Perguntar novamente">Perguntar novamente</button></div>
              </div></div>
            </article>`;
          }).join('');
          duvidasConversation.innerHTML = mensagens + (duvidasRespondendo_ ? renderizarCarregamentoDuvidas_() : '');
        }
        if (duvidasSuggestions) duvidasSuggestions.hidden = duvidasHistorico_.some(m => m.papel === 'usuario') || duvidasRespondendo_;
        if (pertoFim || duvidasRespondendo_) requestAnimationFrame(() => { duvidasConversation.scrollTop = duvidasConversation.scrollHeight; });
      }

      function ajustarAlturaDuvidasInput_() {
        if (!duvidasInput) return;
        duvidasInput.style.height = 'auto';
        const limite = window.innerWidth <= 700 ? 132 : 160;
        duvidasInput.style.height = `${Math.max(48, Math.min(limite, duvidasInput.scrollHeight))}px`;
      }

      function atualizarComposerDuvidas_() {
        const tamanho = String(duvidasInput?.value || '').length;
        if (duvidasCharCount) {
          duvidasCharCount.textContent = `${tamanho}/1200`;
          duvidasCharCount.classList.toggle('warning', tamanho >= 1050);
        }
        ajustarAlturaDuvidasInput_();
        if (duvidasSendBtn) {
          duvidasSendBtn.disabled = duvidasRespondendo_ || tamanho < 3;
          duvidasSendBtn.classList.toggle('is-loading', duvidasRespondendo_);
          const label = duvidasSendBtn.querySelector('[data-duvidas-send-label]');
          if (label) label.textContent = duvidasRespondendo_ ? 'Respondendo' : 'Enviar';
        }
      }

      function atualizarEstadoConexaoDuvidas_() {
        if (!duvidasConnectionBadge) return;
        const online = navigator.onLine;
        duvidasConnectionBadge.classList.toggle('offline', !online);
        const texto = duvidasConnectionBadge.querySelector('span');
        if (texto) texto.textContent = online ? 'Online' : 'Offline';
        if (!duvidasRespondendo_ && duvidasStatus) {
          duvidasStatus.textContent = online ? 'Pronto para consultar.' : 'Offline: a consulta local ao Manual e às ITs continua disponível.';
        }
      }

      function abrirDuvidas_() {
        fecharMenuMais_();
        if (!duvidasModal) return;
        resetarHistoricoDuvidas_();
        duvidasModal.hidden = false;
        document.body.classList.add('duvidas-open');
        atualizarEstadoConexaoDuvidas_();
        atualizarComposerDuvidas_();
        carregarBaseNormativaITS_().catch(() => []);
        setTimeout(() => duvidasInput?.focus(), 80);
      }

      function fecharDuvidas_() {
        if (!duvidasModal) return;
        duvidasModal.hidden = true;
        document.body.classList.remove('duvidas-open');
      }

      async function copiarRespostaDuvidas_(indice) {
        const msg = duvidasHistorico_[Number(indice)];
        const texto = String(msg?.texto || '').trim();
        if (!texto) return;
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(texto);
          else {
            const area = document.createElement('textarea');
            area.value = texto;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed'; area.style.opacity = '0';
            document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
          }
          if (duvidasStatus) duvidasStatus.textContent = 'Resposta copiada.';
        } catch (e) {
          if (duvidasStatus) duvidasStatus.textContent = 'Não foi possível copiar automaticamente.';
        }
      }

      function perguntaOrigemMensagemDuvidas_(indice) {
        const i = Number(indice);
        const msg = duvidasHistorico_[i];
        if (msg?.perguntaOrigem) return String(msg.perguntaOrigem);
        for (let pos = i - 1; pos >= 0; pos -= 1) {
          if (duvidasHistorico_[pos]?.papel === 'usuario') return String(duvidasHistorico_[pos].texto || '');
        }
        return '';
      }

      async function reenviarDuvida_(indice) {
        if (duvidasRespondendo_) return;
        const pergunta = perguntaOrigemMensagemDuvidas_(indice).trim();
        if (!pergunta) return;
        if (duvidasInput) duvidasInput.value = pergunta;
        atualizarComposerDuvidas_();
        await enviarDuvida_();
      }

      function abrirFonteManualDuvidas_(id) {
        const alvo = String(id || '').trim();
        if (!alvo) return;
        fecharDuvidas_();
        abrirManualSistema_();
        setTimeout(() => navegarManualSistema_(alvo), 120);
      }

      async function enviarDuvida_() {
        if (duvidasRespondendo_) return;
        const pergunta = String(duvidasInput?.value || '').trim();
        if (pergunta.length < 3) {
          if (duvidasStatus) duvidasStatus.textContent = 'Descreva a dúvida antes de perguntar.';
          duvidasInput?.focus();
          return;
        }

        resetarHistoricoDuvidas_();
        duvidasRespondendo_ = true;
        duvidasPerguntaEmCurso_ = pergunta;
        if (duvidasStatus) duvidasStatus.textContent = 'Consultando Manual do Sistema e Instruções Técnicas...';
        duvidasHistorico_.push({ papel:'usuario', texto:pergunta, hora:new Date().toISOString() });
        duvidasHistorico_ = duvidasHistorico_.slice(-12);
        if (duvidasInput) duvidasInput.value = '';
        atualizarComposerDuvidas_();
        renderizarHistoricoDuvidas_();
        iniciarAnimacaoConsultaDuvidas_();

        try {
          const [manual, its] = await Promise.all([
            Promise.resolve(buscarContextoManualDuvidas_(pergunta)),
            buscarContextoItsDuvidas_(pergunta)
          ]);
          const fontesLocais = fontesContextoDuvidas_(manual, its);
          let resposta = '';
          let fontes = fontesLocais;
          let modo = 'base_local';
          let iaIndisponivel = false;

          if (navigator.onLine) {
            try {
              const historicoEnvio = duvidasHistorico_.slice(-9).map(m => ({ papel:m.papel, texto:String(m.texto || '').slice(0,1800) }));
              const retorno = await apiRequest('config', {
                consulta: 'duvidas',
                pergunta,
                historico: historicoEnvio,
                contexto: {
                  manual: manual.map(m => ({ id:m.id, titulo:m.titulo, texto:m.texto })),
                  its: its.map(i => ({ it:i.it, item:i.item, texto:i.texto, arquivo:i.arquivo }))
                }
              }, 55000);
              resposta = String(retorno?.resposta || '').trim();
              if (Array.isArray(retorno?.fontes) && retorno.fontes.length) fontes = retorno.fontes;
              modo = String(retorno?.modo || 'ia');
              iaIndisponivel = Boolean(retorno?.iaIndisponivel);
              if (duvidasStatus) {
                if (modo === 'ia') duvidasStatus.textContent = 'Resposta pronta — baseada nas fontes localizadas.';
                else if (iaIndisponivel) duvidasStatus.textContent = 'IA indisponível agora — resposta produzida diretamente pelas fontes locais.';
                else duvidasStatus.textContent = 'Resposta baseada diretamente no Manual e nas ITs localizadas.';
              }
            } catch (erroApi) {
              resposta = montarRespostaLocalDuvidas_(pergunta, manual, its);
              modo = 'base_local';
              iaIndisponivel = true;
              if (duvidasStatus) duvidasStatus.textContent = 'A consulta online não respondeu. Mostrando a base local.';
            }
          } else {
            resposta = montarRespostaLocalDuvidas_(pergunta, manual, its);
            if (duvidasStatus) duvidasStatus.textContent = 'Resposta local — aparelho sem conexão.';
          }

          if (!resposta) resposta = montarRespostaLocalDuvidas_(pergunta, manual, its);
          pararAnimacaoConsultaDuvidas_();
          duvidasRespondendo_ = false;
          duvidasHistorico_.push({ papel:'assistente', texto:resposta, fontes, modo, iaIndisponivel, perguntaOrigem:pergunta, hora:new Date().toISOString() });
          duvidasHistorico_ = duvidasHistorico_.slice(-12);
          renderizarHistoricoDuvidas_();
        } catch (erro) {
          pararAnimacaoConsultaDuvidas_();
          duvidasRespondendo_ = false;
          duvidasHistorico_.push({
            papel:'assistente',
            texto:'Não foi possível concluir a consulta agora. Tente novamente. Se necessário, use diretamente o Manual do Sistema ou o menu Instruções Técnicas CBMMG.',
            fontes:[], modo:'base_local', iaIndisponivel:true, perguntaOrigem:pergunta, hora:new Date().toISOString()
          });
          renderizarHistoricoDuvidas_();
          if (duvidasStatus) duvidasStatus.textContent = erro?.message || 'Falha ao consultar. Você pode tentar novamente.';
          if (duvidasInput && !duvidasInput.value) duvidasInput.value = pergunta;
        } finally {
          duvidasPerguntaEmCurso_ = '';
          atualizarComposerDuvidas_();
          if (!duvidasModal?.hidden && !duvidasInput?.value) setTimeout(() => duvidasInput?.focus(), 30);
        }
      }

      function appTemInteracaoCriticaParaAtualizacao_() {
        if (sendingQueue || submitting) return true;

        // Enquanto a tela de vistoria estiver aberta, qualquer atualização fica
        // adiada, mesmo antes do primeiro salvamento automático do rascunho.
        if (
          authState.sessionToken &&
          vistaAtualNavegacao_() === 'form'
        ) {
          return true;
        }

        // Não recarrega enquanto houver uma etapa/modal operacional aberta.
        try {
          if (camadaNavegacaoAtiva_()) return true;
        } catch (e) {}

        return false;
      }

      function appPodeAplicarAtualizacaoSilenciosa_() {
        if (!swAtualizacaoPendente_ || swRecarregamentoAtualizacaoEmCurso_) return false;
        return !appTemInteracaoCriticaParaAtualizacao_();
      }

      function agendarNovaTentativaAtualizacaoSilenciosa_() {
        if (!swAtualizacaoPendente_ || swTimerAtualizacaoAdiada_) return;

        swTimerAtualizacaoAdiada_ = setTimeout(() => {
          swTimerAtualizacaoAdiada_ = null;
          aplicarAtualizacaoSilenciosaSeSeguro_();
        }, 45 * 1000);
      }

      function aplicarAtualizacaoSilenciosaSeSeguro_() {
        if (!swAtualizacaoPendente_) return false;

        if (!appPodeAplicarAtualizacaoSilenciosa_()) {
          agendarNovaTentativaAtualizacaoSilenciosa_();
          return false;
        }

        // Se houver um rascunho preservado enquanto o usuário está no Painel,
        // reforça a gravação local antes da recarga.
        try {
          if (usuarioPodeOperar_() && rascunhoEmAndamento_()) saveDraft();
        } catch (e) {}

        swAtualizacaoPendente_ = false;
        swRecarregamentoAtualizacaoEmCurso_ = true;

        if (swTimerAtualizacaoAdiada_) {
          clearTimeout(swTimerAtualizacaoAdiada_);
          swTimerAtualizacaoAdiada_ = null;
        }

        // A sessão BM permanece no armazenamento local. Somente a interface e
        // os arquivos do aplicativo são recarregados.
        try {
          sessionStorage.setItem('gpv_auto_update_applied_v1', String(Date.now()));
        } catch (e) {}

        const url = new URL(window.location.href);
        url.searchParams.set('appAtualizado', Date.now().toString());
        window.location.replace(url.toString());
        return true;
      }

      function observarAtualizacaoSilenciosaPwa_(registro) {
        if (!registro) return;
        swRegistroSilencioso_ = registro;
        registro.addEventListener('updatefound', () => {
          const worker = registro.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              swAtualizacaoPendente_ = true;
              aplicarAtualizacaoSilenciosaSeSeguro_();
            }
          });
        });
      }

      async function verificarAtualizacaoSilenciosaPwa_(forcar = false) {
        if (!navigator.onLine || !('serviceWorker' in navigator)) return;
        const agora = Date.now();
        if (!forcar && agora - swUltimaVerificacaoSilenciosa_ < 10 * 60 * 1000) return;
        swUltimaVerificacaoSilenciosa_ = agora;
        try {
          const registro = swRegistroSilencioso_ || await navigator.serviceWorker.getRegistration();
          if (registro) {
            swRegistroSilencioso_ = registro;
            await registro.update();
          }
        } catch (e) {}
      }
      let saveTimer = null;
      let cnpjTimer = null;
      let ultimoCnpjConsultado = '';
      let cnpjConsultaSequencia = 0;
      let cnpjAssociadoDadosEmpresa = '';
      let responsavelLookupTimer = null;
      let responsavelLookupSequencia = 0;
      let telefoneResponsavelAssociado = '';
      const RESPONSAVEL_EDITABLE_FIELDS_ = new Set([
        'telefone','responsavel','nomeResponsavel','rg','cpf','mae','nascimento',
        'profissao','estadoCivil','escolaridade','email','enderecoResponsavel'
      ]);
      const responsavelCamposEditadosManual_ = new Set();
      let responsavelEdicaoManualAtiva_ = false;
      let responsavelLookupAplicacaoId_ = 0;
      let responsavelCpfLookupTimer = null;
      let responsavelCpfLookupSequencia = 0;
      let cpfResponsavelAssociado = '';
      let responsaveisLookupAtual = [];
      let responsaveisCpfLookupAtual = [];
      let preenchendoResponsavelLookup = false;
      let ocupacoesExistentes = [];
      let ocupacaoSelecionada = null;
      let ocupacoesSelecionadas = [];
      let currentRecordId = criarIdRegistro();
      let sendingQueue = false;
      let pendingCache = [];
      let deferredInstallPrompt = null;
      let tutorialStepIndex = 0;
      let duvidasHistorico_ = [];
      let duvidasHistoricoUsuarioId_ = '';
      let duvidasRespondendo_ = false;
      let duvidasEtapaCarregamento_ = 0;
      let duvidasCarregamentoTimer_ = null;
      let duvidasPerguntaEmCurso_ = '';
      let swRegistroSilencioso_ = null;
      let swUltimaVerificacaoSilenciosa_ = 0;
      let swAtualizacaoPendente_ = false;
      let swRecarregamentoAtualizacaoEmCurso_ = false;
      let swTimerAtualizacaoAdiada_ = null;
      let sancaoDefinidaAutomaticamente = false;
      let sancaoAntesDoAutomatico = '';
      let cpfCopiadoDoIdentificador = '';
      let estabelecimentoLookupTimer = null;
      let estabelecimentoLookupSequencia = 0;
      let historicoEstabelecimentoAtual = [];
      let pscipLookupTimer = null;
      let pscipLookupSequencia = 0;
      let historicoPscipAtual = [];
      let encerramentoFiscalTimer = null;
      let encerramentoFiscalSequencia = 0;
      let encerramentoFiscalAtual = null;
      let processoPfLookupTimer = null;
      let processoPfLookupSequencia = 0;
      let processoPfCandidatos = [];
      let processoPfAutoAtual = '';
      let preparePfLookupTimer = null;
      let preparePfLookupSequencia = 0;
      let preparePfCandidatos = [];
      let preparePfAutoAtual = '';
      let notificacoesLiberacaoDraft = [];
      let recordNotificationsAtual = [];

      // V23.9.69 — navegação global do PWA.
      // Um único "guard" de histórico é mantido apenas enquanto existe alguma
      // camada interna aberta. Assim, o botão Voltar do Android fecha primeiro
      // a tela/modal atual e só pode sair do app quando o usuário realmente
      // retorna ao nível inicial.
      let appNavigationRootView = 'form';
      let appNavigationReady = false;
      let appNavigationGuardActive = false;
      let appNavigationConsumingGuard = false;
      let appNavigationHandlingBack = false;
      let appNavigationSyncTimer = null;
      let appNavigationObserver = null;

      function value(id) {
        const el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
      }

      function tipoIdentificador_(valor) {
        const d = digits(valor);
        if (d.length === 14) return 'cnpj';
        if (d.length === 11) return 'cpf';
        return '';
      }

      function formatarCpfTela_(valor) {
        const d = digits(valor).slice(0, 11);
        if (d.length !== 11) return d;
        return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
      }

      function formatarCnpjTela_(valor) {
        let d = digits(valor).slice(0, 14);
        if (d.length <= 2) return d;
        let v = d.replace(/^(\d{2})(\d)/, '$1.$2')
          .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
          .replace(/\.(\d{3})(\d)/, '.$1/$2')
          .replace(/(\d{4})(\d)/, '$1-$2');
        return v;
      }

      function formatarDocumentoPainel_(valor) {
        const d = digits(valor);
        if (d.length === 11) return { rotulo: 'CPF', valor: formatarCpfTela_(d) };
        if (d.length === 14) return { rotulo: 'CNPJ', valor: formatarCnpjTela_(d) };
        return { rotulo: 'CNPJ / CPF', valor: String(valor || '').trim() || '—' };
      }

      function identificadorPainel_(item) {
        const principal = String(item?.cnpj || '').trim();
        const cpf = String(item?.cpf || '').trim();

        // A coluna histórica da planilha pode trazer CPF dentro de "cnpj".
        // A quantidade de dígitos define o tipo real do documento.
        if (principal) return formatarDocumentoPainel_(principal);
        if (cpf) return formatarDocumentoPainel_(cpf);
        return { rotulo: 'CNPJ / CPF', valor: '—' };
      }

      function cityValue() {
        return citySelect.value === 'Outro' ? value('outraCidade') : citySelect.value;
      }


      // =========================================================================
      // V23.9.99ac — diálogos próprios do GPV
      // Substitui as caixas nativas de aviso, confirmação e entrada de texto do navegador.
      // =========================================================================
      const filaDialogosGpv_ = [];
      let dialogoGpvAtivo_ = false;

      function dialogoGpv_(opcoes = {}) {
        return new Promise(resolve => {
          filaDialogosGpv_.push({ opcoes: opcoes || {}, resolve });
          executarProximoDialogoGpv_();
        });
      }

      function executarProximoDialogoGpv_() {
        if (dialogoGpvAtivo_ || !filaDialogosGpv_.length) return;

        const modal = document.getElementById('gpvDialogModal');
        const tituloEl = document.getElementById('gpvDialogTitle');
        const mensagemEl = document.getElementById('gpvDialogMessage');
        const iconEl = document.getElementById('gpvDialogIcon');
        const inputEl = document.getElementById('gpvDialogInput');
        const choicesEl = document.getElementById('gpvDialogChoices');
        const cancelarBtn = document.getElementById('gpvDialogCancelBtn');
        const confirmarBtn = document.getElementById('gpvDialogConfirmBtn');
        const fecharBtn = document.getElementById('gpvDialogCloseBtn');

        const itemFila = filaDialogosGpv_.shift();
        const o = itemFila.opcoes || {};
        const tipo = String(o.tipo || 'alert');
        const tom = String(o.tom || (tipo === 'confirm' ? 'warning' : 'info'));

        if (!modal || !tituloEl || !mensagemEl || !cancelarBtn || !confirmarBtn || !fecharBtn) {
          itemFila.resolve(tipo === 'alert' ? true : null);
          setTimeout(executarProximoDialogoGpv_, 0);
          return;
        }

        dialogoGpvAtivo_ = true;
        modal.dataset.tone = tom;
        modal.dataset.type = tipo;
        tituloEl.textContent = String(o.titulo || (tipo === 'alert' ? 'Aviso' : 'Confirmação'));
        mensagemEl.textContent = String(o.mensagem || '');
        iconEl.textContent = tom === 'danger' ? '!' : (tom === 'success' ? '✓' : (tom === 'warning' ? '!' : 'i'));

        const ehPrompt = tipo === 'prompt';
        const ehChoices = tipo === 'choice';
        const ehAlert = tipo === 'alert';

        if (inputEl) {
          inputEl.hidden = !ehPrompt;
          inputEl.value = ehPrompt ? String(o.valorInicial || '') : '';
          inputEl.placeholder = ehPrompt ? String(o.placeholder || '') : '';
          inputEl.maxLength = Number(o.maxLength || 120);
          inputEl.inputMode = String(o.inputMode || 'text');
        }

        let finalizar = () => {};
        if (choicesEl) {
          choicesEl.innerHTML = '';
          choicesEl.hidden = !ehChoices;
          if (ehChoices) {
            (Array.isArray(o.opcoes) ? o.opcoes : []).forEach(opcao => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'gpv-dialog-choice';
              const titulo = document.createElement('strong');
              titulo.textContent = String(opcao?.titulo || opcao?.label || '');
              btn.appendChild(titulo);
              if (opcao?.subtitulo) {
                const sub = document.createElement('span');
                sub.textContent = String(opcao.subtitulo);
                btn.appendChild(sub);
              }
              btn.addEventListener('click', () => finalizar(opcao?.valor ?? opcao?.value ?? null));
              choicesEl.appendChild(btn);
            });
          }
        }

        cancelarBtn.hidden = ehAlert;
        cancelarBtn.textContent = String(o.rotuloCancelar || 'Cancelar');
        confirmarBtn.hidden = ehChoices;
        confirmarBtn.textContent = String(o.rotuloConfirmar || (ehAlert ? 'Entendi' : (ehPrompt ? 'Salvar' : 'Confirmar')));
        confirmarBtn.classList.toggle('is-danger', tom === 'danger');

        let encerrado = false;
        const onKeydown = event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelar();
          } else if (event.key === 'Enter' && ehPrompt) {
            event.preventDefault();
            confirmar();
          }
        };
        const onOverlayClick = event => {
          if (event.target === modal) cancelar();
        };
        finalizar = valor => {
          if (encerrado) return;
          encerrado = true;
          document.removeEventListener('keydown', onKeydown);
          modal.removeEventListener('click', onOverlayClick);
          modal.hidden = true;
          document.body.classList.remove('gpv-dialog-open');
          dialogoGpvAtivo_ = false;
          itemFila.resolve(valor);
          setTimeout(executarProximoDialogoGpv_, 0);
        };
        const cancelar = () => finalizar(ehAlert ? true : null);
        const confirmar = () => {
          if (ehAlert) return finalizar(true);
          if (ehPrompt) return finalizar(String(inputEl?.value || '').trim());
          return finalizar(true);
        };

        cancelarBtn.onclick = cancelar;
        confirmarBtn.onclick = confirmar;
        fecharBtn.onclick = cancelar;
        document.addEventListener('keydown', onKeydown);
        modal.addEventListener('click', onOverlayClick);
        modal.hidden = false;
        document.body.classList.add('gpv-dialog-open');

        setTimeout(() => {
          if (ehPrompt && inputEl) {
            inputEl.focus();
            try { inputEl.select(); } catch (e) {}
          } else if (ehChoices) {
            choicesEl?.querySelector('button')?.focus();
          } else {
            confirmarBtn.focus();
          }
        }, 30);
      }

      function avisarGpv_(mensagem, titulo = 'Aviso', opcoes = {}) {
        return dialogoGpv_({
          tipo: 'alert',
          titulo,
          mensagem,
          tom: opcoes.tom || 'info',
          rotuloConfirmar: opcoes.rotuloConfirmar || 'Entendi'
        });
      }

      async function confirmarGpv_(mensagem, titulo = 'Confirmar ação', opcoes = {}) {
        const resposta = await dialogoGpv_({
          tipo: 'confirm',
          titulo,
          mensagem,
          tom: opcoes.tom || 'warning',
          rotuloConfirmar: opcoes.rotuloConfirmar || 'Confirmar',
          rotuloCancelar: opcoes.rotuloCancelar || 'Cancelar'
        });
        return resposta === true;
      }

      async function solicitarTextoGpv_(mensagem, titulo = 'Informar dado', opcoes = {}) {
        const resposta = await dialogoGpv_({
          tipo: 'prompt',
          titulo,
          mensagem,
          tom: opcoes.tom || 'info',
          valorInicial: opcoes.valorInicial || '',
          placeholder: opcoes.placeholder || '',
          maxLength: opcoes.maxLength || 120,
          inputMode: opcoes.inputMode || 'text',
          rotuloConfirmar: opcoes.rotuloConfirmar || 'Salvar',
          rotuloCancelar: opcoes.rotuloCancelar || 'Cancelar'
        });
        return resposta == null ? null : String(resposta);
      }

      async function escolherOpcaoGpv_(mensagem, opcoes, titulo = 'Escolha uma opção') {
        return dialogoGpv_({
          tipo: 'choice',
          titulo,
          mensagem,
          tom: 'info',
          opcoes: Array.isArray(opcoes) ? opcoes : []
        });
      }

      function escapeHtml(v) {
        return String(v == null ? '' : v)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function escapeAttr(v) { return escapeHtml(v); }
      function digits(v) { return String(v || '').replace(/\D/g, ''); }
      function normalize(v) {
        return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      }

      /* V23.9.53 — seletor móvel padronizado com gesto seguro.
         Em telas pequenas, selects e campos com datalist abrem em uma folha inferior
         com lista vertical rolável. Arrastar a página/lista nunca é tratado como seleção;
         somente um toque intencional abre o seletor. Campos datalist continuam aceitando texto livre. */
      const MOBILE_CHOICE_MEDIA = '(max-width: 820px), (pointer: coarse)';
      let mobileChoiceState = {
        target: null,
        options: [],
        allowCustom: false,
        overlay: null,
        sheet: null,
        title: null,
        search: null,
        list: null,
        empty: null,
        custom: null,
        customBtn: null,
        closeBtn: null
      };

      function escolhaMovelDisponivel_() {
        try { return window.matchMedia(MOBILE_CHOICE_MEDIA).matches; } catch (e) { return window.innerWidth <= 820; }
      }

      function campoElegivelEscolhaMovel_(alvo) {
        if (!(alvo instanceof HTMLElement)) return false;
        if (alvo.closest('.mobile-choice-overlay')) return false;
        if (alvo.dataset?.mobilePicker === 'off') return false;
        if (alvo.matches('select')) return !alvo.multiple && !alvo.disabled;
        if (alvo.matches('input[list]')) {
          if (alvo.disabled || alvo.readOnly) return false;
          const listaId = String(alvo.getAttribute('list') || '').trim();
          return Boolean(listaId && document.getElementById(listaId));
        }
        return false;
      }

      function rotuloCampoEscolhaMovel_(alvo) {
        if (!alvo) return 'Selecionar opção';
        const id = String(alvo.id || '').trim();
        if (id) {
          const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (label) return String(label.textContent || '').replace(/\s+/g, ' ').trim() || 'Selecionar opção';
        }
        const labelPai = alvo.closest('label');
        if (labelPai) {
          const clone = labelPai.cloneNode(true);
          clone.querySelectorAll('input,select,textarea,datalist,button').forEach(el => el.remove());
          const texto = String(clone.textContent || '').replace(/\s+/g, ' ').trim();
          if (texto) return texto;
        }
        return String(alvo.getAttribute('aria-label') || alvo.name || alvo.placeholder || 'Selecionar opção').trim();
      }

      function opcoesCampoEscolhaMovel_(alvo) {
        const vistos = new Set();
        const saida = [];
        const adicionar = (valor, texto, detalhe = '') => {
          const v = String(valor ?? '');
          const t = String(texto ?? v).replace(/\s+/g, ' ').trim() || v;
          const chave = `${v}\u0000${t}`;
          if (vistos.has(chave)) return;
          vistos.add(chave);
          saida.push({ value: v, text: t, detail: String(detalhe || '').replace(/\s+/g, ' ').trim() });
        };

        if (alvo?.matches('select')) {
          Array.from(alvo.options || []).forEach(option => {
            if (option.disabled) return;
            adicionar(option.value, option.textContent || option.label || option.value);
          });
          return saida;
        }

        const listaId = String(alvo?.getAttribute('list') || '').trim();
        const datalist = listaId ? document.getElementById(listaId) : null;
        Array.from(datalist?.options || []).forEach(option => {
          const valor = String(option.value || '').trim();
          if (!valor) return;
          const label = String(option.label || option.textContent || '').trim();
          adicionar(valor, valor, label && normalize(label) !== normalize(valor) ? label : '');
        });
        return saida;
      }

      function garantirEscolhaMovel_() {
        if (mobileChoiceState.overlay) return mobileChoiceState;
        const overlay = document.createElement('div');
        overlay.className = 'mobile-choice-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
          <section class="mobile-choice-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileChoiceTitle">
            <div class="mobile-choice-handle" aria-hidden="true"></div>
            <header class="mobile-choice-head">
              <div>
                <span>Selecionar opção</span>
                <h2 id="mobileChoiceTitle">Escolha uma opção</h2>
              </div>
              <button class="mobile-choice-close" type="button" aria-label="Fechar lista">×</button>
            </header>
            <div class="mobile-choice-search-wrap">
              <span aria-hidden="true">⌕</span>
              <input class="mobile-choice-search" type="search" autocomplete="off" inputmode="search" placeholder="Pesquisar na lista..." aria-label="Pesquisar opções">
            </div>
            <div class="mobile-choice-list" role="listbox"></div>
            <div class="mobile-choice-empty" hidden>Nenhuma opção encontrada.</div>
            <div class="mobile-choice-custom" hidden>
              <button type="button" class="mobile-choice-custom-btn"></button>
            </div>
          </section>`;
        document.body.appendChild(overlay);

        mobileChoiceState = {
          ...mobileChoiceState,
          overlay,
          sheet: overlay.querySelector('.mobile-choice-sheet'),
          title: overlay.querySelector('#mobileChoiceTitle'),
          search: overlay.querySelector('.mobile-choice-search'),
          list: overlay.querySelector('.mobile-choice-list'),
          empty: overlay.querySelector('.mobile-choice-empty'),
          custom: overlay.querySelector('.mobile-choice-custom'),
          customBtn: overlay.querySelector('.mobile-choice-custom-btn'),
          closeBtn: overlay.querySelector('.mobile-choice-close')
        };

        mobileChoiceState.closeBtn?.addEventListener('click', fecharEscolhaMovel_);
        overlay.addEventListener('click', event => { if (event.target === overlay) fecharEscolhaMovel_(); });
        mobileChoiceState.search?.addEventListener('input', renderizarOpcoesEscolhaMovel_);
        mobileChoiceState.list?.addEventListener('click', event => {
          const botao = event.target.closest('[data-mobile-choice-index]');
          if (!botao) return;
          const indice = Number(botao.dataset.mobileChoiceIndex);
          const opcao = mobileChoiceState.options[indice];
          if (opcao) aplicarEscolhaMovel_(opcao.value);
        });
        mobileChoiceState.customBtn?.addEventListener('click', () => {
          const valor = String(mobileChoiceState.search?.value || '').trim();
          if (valor) aplicarEscolhaMovel_(valor);
        });
        return mobileChoiceState;
      }

      function renderizarOpcoesEscolhaMovel_() {
        const state = garantirEscolhaMovel_();
        if (!state.target) return;
        const termo = normalize(state.search?.value || '');
        const atual = String(state.target.value || '');
        const indices = state.options
          .map((opcao, index) => ({ opcao, index }))
          .filter(({ opcao }) => !termo || normalize(`${opcao.text} ${opcao.detail} ${opcao.value}`).includes(termo));

        state.list.innerHTML = indices.map(({ opcao, index }) => {
          const selecionado = String(opcao.value) === atual;
          const texto = opcao.text || (opcao.value ? opcao.value : 'Limpar seleção');
          return `<button type="button" class="mobile-choice-option${selecionado ? ' is-selected' : ''}" data-mobile-choice-index="${index}" role="option" aria-selected="${selecionado ? 'true' : 'false'}">
            <span class="mobile-choice-option-text">${escapeHtml(texto)}</span>
            ${opcao.detail ? `<small>${escapeHtml(opcao.detail)}</small>` : ''}
            <span class="mobile-choice-check" aria-hidden="true">${selecionado ? '✓' : '›'}</span>
          </button>`;
        }).join('');

        state.empty.hidden = Boolean(indices.length);
        const digitado = String(state.search?.value || '').trim();
        const existeExato = state.options.some(opcao => normalize(opcao.value) === normalize(digitado));
        const mostrarCustom = state.allowCustom && Boolean(digitado) && !existeExato;
        state.custom.hidden = !mostrarCustom;
        if (mostrarCustom) state.customBtn.textContent = `Usar texto digitado: “${digitado}”`;
      }

      function abrirEscolhaMovel_(alvo) {
        if (!escolhaMovelDisponivel_() || !campoElegivelEscolhaMovel_(alvo)) return false;
        const state = garantirEscolhaMovel_();
        state.target = alvo;
        state.options = opcoesCampoEscolhaMovel_(alvo);
        state.allowCustom = alvo.matches('input[list]');
        state.title.textContent = rotuloCampoEscolhaMovel_(alvo);
        state.search.value = '';
        state.search.placeholder = state.allowCustom ? 'Pesquisar ou digitar...' : 'Pesquisar na lista...';
        state.overlay.hidden = false;
        document.body.classList.add('mobile-choice-open');
        alvo.setAttribute('aria-expanded', 'true');
        renderizarOpcoesEscolhaMovel_();
        requestAnimationFrame(() => {
          state.sheet?.scrollTo?.({ top: 0 });
          state.closeBtn?.focus?.({ preventScroll: true });
        });
        return true;
      }

      function fecharEscolhaMovel_() {
        const state = mobileChoiceState;
        if (!state.overlay || state.overlay.hidden) return;
        const alvo = state.target;
        state.overlay.hidden = true;
        document.body.classList.remove('mobile-choice-open');
        if (alvo) alvo.setAttribute('aria-expanded', 'false');
        state.target = null;
        state.options = [];
        state.allowCustom = false;
        if (state.search) state.search.value = '';
      }

      function aplicarEscolhaMovel_(valor) {
        const alvo = mobileChoiceState.target;
        if (!alvo) return;
        const novo = String(valor ?? '');
        const anterior = String(alvo.value || '');
        alvo.value = novo;
        if (anterior !== novo || alvo.matches('input[list]')) {
          alvo.dispatchEvent(new Event('input', { bubbles: true }));
          alvo.dispatchEvent(new Event('change', { bubbles: true }));
        }
        fecharEscolhaMovel_();
      }

      function focarCampoCompatEscolhaMovel_(alvo) {
        if (!alvo) return;
        if (abrirEscolhaMovel_(alvo)) return;
        alvo.focus?.();
      }

      function instalarEscolhaMovel_() {
        garantirEscolhaMovel_();

        // Não bloqueia pointerdown: isso preserva a rolagem natural da página.
        // O clique posterior só abre o seletor quando o dedo praticamente não se moveu.
        const gesto = {
          pointerId: null,
          target: null,
          startX: 0,
          startY: 0,
          moved: false,
          endedAt: 0
        };
        const LIMITE_MOVIMENTO_TOQUE = 12;
        const JANELA_CLIQUE_APOS_GESTO_MS = 700;

        const limparGesto = () => {
          gesto.pointerId = null;
          gesto.target = null;
          gesto.startX = 0;
          gesto.startY = 0;
          gesto.moved = false;
          gesto.endedAt = 0;
        };

        document.addEventListener('pointerdown', event => {
          if (!escolhaMovelDisponivel_()) return;
          const alvo = event.target?.closest?.('select,input[list]');
          if (!campoElegivelEscolhaMovel_(alvo)) { limparGesto(); return; }
          gesto.pointerId = event.pointerId;
          gesto.target = alvo;
          gesto.startX = Number(event.clientX || 0);
          gesto.startY = Number(event.clientY || 0);
          gesto.moved = false;
          gesto.endedAt = 0;
        }, true);

        document.addEventListener('pointermove', event => {
          if (gesto.pointerId == null || event.pointerId !== gesto.pointerId || gesto.moved) return;
          const dx = Math.abs(Number(event.clientX || 0) - gesto.startX);
          const dy = Math.abs(Number(event.clientY || 0) - gesto.startY);
          if (dx > LIMITE_MOVIMENTO_TOQUE || dy > LIMITE_MOVIMENTO_TOQUE) gesto.moved = true;
        }, true);

        document.addEventListener('pointerup', event => {
          if (gesto.pointerId == null || event.pointerId !== gesto.pointerId) return;
          gesto.endedAt = Date.now();
        }, true);

        document.addEventListener('pointercancel', event => {
          if (gesto.pointerId == null || event.pointerId !== gesto.pointerId) return;
          limparGesto();
        }, true);

        document.addEventListener('click', event => {
          if (!escolhaMovelDisponivel_()) return;
          const alvo = event.target?.closest?.('select,input[list]');
          if (!campoElegivelEscolhaMovel_(alvo)) return;

          const veioDoMesmoGesto = gesto.target === alvo &&
            (!gesto.endedAt || (Date.now() - gesto.endedAt) <= JANELA_CLIQUE_APOS_GESTO_MS);

          // Alguns navegadores ainda disparam click depois de um pequeno arrasto.
          // Nesse caso consumimos o click, mas não abrimos nem alteramos o campo.
          if (veioDoMesmoGesto && gesto.moved) {
            event.preventDefault();
            event.stopImmediatePropagation();
            limparGesto();
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();
          limparGesto();
          alvo.blur?.();
          if (mobileChoiceState.target !== alvo || mobileChoiceState.overlay?.hidden) abrirEscolhaMovel_(alvo);
        }, true);

        window.addEventListener('resize', () => { if (!escolhaMovelDisponivel_()) fecharEscolhaMovel_(); });
      }

      function nomeDispositivo_() {
        try { return String(localStorage.getItem(DEVICE_NAME_STORAGE) || '').trim(); } catch (e) { return ''; }
      }

      function salvarNomeDispositivo_(nome) {
        const limpo = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        try {
          if (limpo) localStorage.setItem(DEVICE_NAME_STORAGE, limpo);
          else localStorage.removeItem(DEVICE_NAME_STORAGE);
        } catch (e) {}
        atualizarNomeDispositivoUi_();
        if (authState.usuario?.nome && !usuariosAtivosApp.length) { usuariosAtivosApp = [{ nome: authState.usuario.nome }]; preencherVistoriadores_(); }
        return limpo;
      }

      function atualizarNomeDispositivoUi_() {
        if (!deviceNameMenuText) return;
        const nome = nomeDispositivo_();
        deviceNameMenuText.textContent = nome ? nome : 'Definir nome deste celular ou tablet';
      }

      function normalizarTermoOcupacao(v) {
        const termo = normalize(v);
        const codigo = termo.match(/^([a-z])\s*-?\s*(\d+)$/i);
        return codigo ? (codigo[1].toLowerCase() + '-' + codigo[2]) : termo;
      }

      function criarIdRegistro() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
          return window.crypto.randomUUID();
        }
        return 'gpv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      }

      function obterPendentes() {
        return Array.isArray(pendingCache) ? pendingCache : [];
      }

      function abrirBancoOffline() {
        return new Promise((resolve, reject) => {
          if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível.'));
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
            if (!db.objectStoreNames.contains(DB_PHOTO_STORE)) db.createObjectStore(DB_PHOTO_STORE, { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error('Não foi possível abrir o banco offline.'));
        });
      }

      async function carregarFilaIndexedDb() {
        const db = await abrirBancoOffline();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, 'readonly');
          const req = tx.objectStore(DB_STORE).getAll();
          req.onsuccess = () => resolve((req.result || []).sort((a,b) => Number(a.criadoEm||0) - Number(b.criadoEm||0)));
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
        });
      }

      async function gravarFilaIndexedDb(lista) {
        const db = await abrirBancoOffline();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, 'readwrite');
          const store = tx.objectStore(DB_STORE);
          store.clear();
          (lista || []).forEach(item => store.put(item));
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { const err = tx.error; db.close(); reject(err); };
        });
      }

      async function inicializarFilaOffline() {
        try {
          pendingCache = await carregarFilaIndexedDb();
          // Migra automaticamente a fila da versão Web App antiga, caso exista.
          try {
            const legacyRaw = localStorage.getItem(PENDING_KEY);
            const legacy = legacyRaw ? JSON.parse(legacyRaw) : [];
            if (Array.isArray(legacy) && legacy.length) {
              const ids = new Set(pendingCache.map(item => item?.id));
              legacy.forEach(item => { if (item?.id && !ids.has(item.id)) pendingCache.push(item); });
              await gravarFilaIndexedDb(pendingCache);
              localStorage.removeItem(PENDING_KEY);
            }
          } catch (e) {}
        } catch (e) {
          try {
            const raw = localStorage.getItem(PENDING_KEY);
            pendingCache = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(pendingCache)) pendingCache = [];
          } catch (fallbackError) { pendingCache = []; }
        }
        atualizarPainelPendentes();
      }

      function salvarPendentes(lista) {
        pendingCache = Array.isArray(lista) ? lista : [];
        gravarFilaIndexedDb(pendingCache).catch(() => {
          try { localStorage.setItem(PENDING_KEY, JSON.stringify(pendingCache)); }
          catch (e) { showError('O navegador não conseguiu salvar a fila offline. Mantenha o aplicativo aberto e não limpe os dados do navegador.'); }
        });
        atualizarPainelPendentes();
      }

      function enfileirarRegistro(payload) {
        const lista = [...obterPendentes()];
        const id = String(payload?._appRegistroId || currentRecordId || criarIdRegistro());
        if (!lista.some(item => item && item.id === id)) {
          lista.push({ id, criadoEm: Date.now(), payload: { ...payload, _appRegistroId: id } });
          salvarPendentes(lista);
        }
        return id;
      }

      function removerPendente(id) {
        salvarPendentes(obterPendentes().filter(item => item && item.id !== id));
      }

      function atualizarResumoSincronizacao_() {
        const quantidade = obterPendentes().length;
        if (syncSummary) {
          syncSummary.classList.remove('is-ok', 'is-pending', 'is-offline');
        }
        if (dashboardSyncIndicator) {
          dashboardSyncIndicator.classList.remove('is-checking', 'is-ok', 'is-pending', 'is-offline');
        }

        let estado = 'is-ok';
        let texto = 'Tudo sincronizado';
        if (!navigator.onLine) {
          estado = 'is-offline';
          texto = quantidade
            ? `Offline • ${quantidade} vistoria${quantidade === 1 ? '' : 's'} aguardando envio`
            : 'Offline • nenhum envio pendente';
        } else if (quantidade) {
          estado = 'is-pending';
          texto = `${quantidade} vistoria${quantidade === 1 ? '' : 's'} aguardando sincronização`;
        }

        if (syncSummary) {
          syncSummary.classList.add(estado);
          syncSummary.textContent = texto;
        }
        if (dashboardSyncIndicator) {
          dashboardSyncIndicator.classList.add(estado);
          dashboardSyncIndicator.setAttribute('aria-label', texto);
          dashboardSyncIndicator.title = texto;
        }
        if (dashboardSyncCount) {
          if (quantidade > 0) {
            dashboardSyncCount.hidden = false;
            dashboardSyncCount.textContent = quantidade > 99 ? '99+' : String(quantidade);
          } else {
            dashboardSyncCount.hidden = true;
            dashboardSyncCount.textContent = '';
          }
        }
      }

      function atualizarPainelPendentes() {
        const quantidade = obterPendentes().length;
        pendingPanel.classList.toggle('show', quantidade > 0);
        pendingTitle.textContent = quantidade === 1
          ? '1 vistoria aguardando envio'
          : quantidade + ' vistorias aguardando envio';
        pendingText.textContent = quantidade
          ? (navigator.onLine
              ? 'A internet está disponível. Você pode enviar agora; o app também tentará automaticamente.'
              : 'Os registros estão salvos neste aparelho e serão mantidos até a internet voltar.')
          : '';
        sendPendingBtn.disabled = !navigator.onLine || sendingQueue || quantidade === 0;
        sendPendingBtn.textContent = sendingQueue ? 'Enviando...' : 'Enviar pendentes';
        atualizarResumoSincronizacao_();
      }

      function atualizarStatusConexao() {
        const online = navigator.onLine;
        connectionBanner.classList.toggle('offline', !online);
        connectionBanner.classList.toggle('connection-online', online);
        connectionBanner.setAttribute('aria-label', online
          ? 'Online — conexão disponível'
          : 'Offline — dados preservados neste aparelho');
        if (connectionStateText) connectionStateText.textContent = online ? 'Online' : 'Offline';
        submitBtn.textContent = usuarioPodeOperar_()
          ? (online ? 'Registrar vistoria' : 'Salvar no aparelho')
          : 'Finalizar treinamento';
        if (!online) {
          appStatus.textContent = usuarioPodeOperar_()
            ? 'Sem internet — preenchimento salvo neste aparelho.'
            : 'Sem internet — o preenchimento continua disponível; pesquisas online ficam indisponíveis.';
          if (cnpjStatus) showCnpjStatus('Sem internet. A consulta automática de CNPJ fica disponível quando a conexão voltar.', 'info');
        }
        atualizarPainelPendentes();
        atualizarBotaoPlanilhaSucesso_();
        if (document.body.classList.contains('records-mode') && !online) {
          recordsStatus.className = 'records-status error';
          recordsStatus.textContent = 'O Painel Fiscalizatório precisa de internet. O formulário e os registros pendentes continuam disponíveis offline.';
        }
      }

      function chamarSalvarNoServidor(payload) {
        return apiRequest('save', { payload }, 35000);
      }

      function atualizarPlanilhaEmSegundoPlano() {
        if (!navigator.onLine) return Promise.resolve(false);
        if (atualizacaoPlanilhaPromise_) return atualizacaoPlanilhaPromise_;

        atualizacaoPlanilhaPromise_ = esperarApi_(120)
          .then(() => apiRequest('update', {}, 90000))
          .then(() => true)
          .catch(() => false)
          .finally(() => { atualizacaoPlanilhaPromise_ = null; });
        return atualizacaoPlanilhaPromise_;
      }

      function agendarAtualizacoesPainelAposEnvio_() {
        recordsPostSyncTimers_.forEach(timer => clearTimeout(timer));
        recordsPostSyncTimers_ = [900, 3500, 8000].map(atraso => setTimeout(() => {
          if (!navigator.onLine || !document.body.classList.contains('records-mode')) return;
          void carregarRegistros_(true, { substituirSeAntiga: true, motivo: 'vistoria enviada' });
        }, atraso));
      }

      async function enviarPendentes(automatico = false) {
        if (sendingQueue || !navigator.onLine) {
          atualizarPainelPendentes();
          return;
        }

        let lista = obterPendentes();
        if (!lista.length) return;
        sendingQueue = true;
        atualizarPainelPendentes();
        appStatus.textContent = automatico ? 'Enviando vistorias pendentes...' : 'Enviando fila de vistorias...';

        let enviados = 0;
        let dduConcluidoEnviado = false;
        for (const item of [...lista]) {
          if (!navigator.onLine) break;
          try {
            const resultadoServidor = await chamarSalvarNoServidor(item.payload || {});
            if (item.id === String(ultimoRegistroParaOrientacoes?._appRegistroId || '')) {
              ultimoRegistroConsultaChave = String(resultadoServidor?.chaveConsulta || '');
              atualizarBotaoPlanilhaSucesso_();
            }
            if (String(item?.payload?._appDduId || '').trim()) dduConcluidoEnviado = true;
            removerPendente(item.id);
            enviados += 1;
          } catch (erro) {
            break;
          }
        }

        sendingQueue = false;
        atualizarPainelPendentes();
        if (enviados > 0) {
          limparCachesConsulta_();
          const atualizacaoPlanilha = atualizarPlanilhaEmSegundoPlano();
          agendarAtualizacoesPainelAposEnvio_();
          void atualizacaoPlanilha.then(atualizou => {
            if (!atualizou || !navigator.onLine) return;
            limparCachesConsulta_();
            if (document.body.classList.contains('records-mode')) {
              void carregarRegistros_(true, { substituirSeAntiga: true, motivo: 'planilha atualizada' });
            } else {
              void preaquecerPainel_();
            }
          });
          // Se uma vistoria vinculada a DDU acabou de chegar ao servidor, atualiza o indicador
          // para o ícone desaparecer imediatamente quando não houver mais DDU pendente.
          if (dduConcluidoEnviado) setTimeout(() => { void carregarDdUs_(); }, 250);
          appStatus.textContent = enviados === 1
            ? '1 vistoria pendente enviada com sucesso.'
            : enviados + ' vistorias pendentes enviadas com sucesso.';
        } else if (obterPendentes().length && navigator.onLine && !automatico) {
          showError('Não foi possível enviar a fila agora. Os registros continuam salvos neste aparelho.');
        }
      }

      function telefoneWhatsApp_(valor) {
        let numero = String(valor || '').replace(/\D/g, '');
        if (/^55\d{10,11}$/.test(numero)) return numero;
        if (/^\d{10,11}$/.test(numero)) return '55' + numero;
        return '';
      }

      function dataOrientacao_(valor) {
        const bruto = String(valor || '').trim();
        if (bruto) {
          const ptBr = bruto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (ptBr) {
            return `${ptBr[1].padStart(2, '0')}/${ptBr[2].padStart(2, '0')}/${ptBr[3]}`;
          }
        }
        const data = bruto ? new Date(bruto) : new Date();
        if (Number.isNaN(data.getTime())) return '';
        return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }

      function contextoWhatsAppLiberacao_(p) {
        const nome = String(p?.nomeResponsavel || '').trim();
        const estabelecimento = String(p?.nomeFantasia || p?.razaoSocial || '').trim();
        const pscip = String(p?.pscip || p?.projeto || '').trim();
        const situacao = String(p?.sancao || p?.situacaoAtual || '').trim();
        const tipoVistoria = String(p?.tipoVistoria || '').trim();
        return { nome, estabelecimento, pscip, situacao, tipoVistoria };
      }

      function ehMensagemLiberacao_(p) {
        const ctx = contextoWhatsAppLiberacao_(p);
        return normalize(ctx.tipoVistoria).includes('liberacao') ||
          [normalize('Liberado'), normalize('Notificado')].includes(normalize(ctx.situacao));
      }

      function montarMensagemLiberadoWhatsApp_(p) {
        const { nome, estabelecimento, pscip } = contextoWhatsAppLiberacao_(p);
        const linhas = [];

        linhas.push(nome ? `Olá, ${nome}.` : 'Olá.');
        linhas.push('');
        linhas.push(
          `Informamos que a vistoria de liberação realizada${estabelecimento ? ` na edificação *${estabelecimento}*` : ' na edificação'}${pscip ? `, referente ao *PSCIP ${pscip}*` : ''}, foi concluída com resultado *LIBERADO*.`
        );
        linhas.push('');
        linhas.push('Orientamos a manter todas as medidas de segurança contra incêndio e pânico em condições adequadas de uso e funcionamento, conforme previsto no processo aprovado.');
        linhas.push('');
        linhas.push('A situação do licenciamento e a disponibilização do AVCB devem ser acompanhadas pelo *INFOSCIP*.');
        linhas.push('');
        linhas.push('*Grupamento de Prevenção e Vistoria — 3º Pelotão Viçosa — CBMMG*');

        return linhas.join('\n');
      }

      function montarMensagemNotificadoWhatsApp_(p) {
        const { nome, estabelecimento, pscip } = contextoWhatsAppLiberacao_(p);
        const linhas = [];

        linhas.push(nome ? `Olá, ${nome}.` : 'Olá.');
        linhas.push('');
        linhas.push(
          `Durante a vistoria de liberação${estabelecimento ? ` da edificação *${estabelecimento}*` : ''}${pscip ? `, referente ao *PSCIP ${pscip}*` : ''}, foram constatadas irregularidades na execução das medidas de segurança contra incêndio e pânico, em desacordo com o projeto aprovado.`
        );
        linhas.push('');
        linhas.push('As não conformidades foram registradas no *INFOSCIP* e, por esse motivo, não foi possível a emissão do AVCB neste momento.');
        linhas.push('');
        linhas.push('Após a correção das irregularidades, poderá ser solicitada *nova vistoria*. Também é possível apresentar *pedido de reconsideração de ato*, nos termos do art. 16 do Decreto Estadual nº 47.998/2020, cabendo recurso conforme o art. 17 do mesmo Decreto.');
        linhas.push('');
        linhas.push('*Grupamento de Prevenção e Vistoria — 3º Pelotão Viçosa — CBMMG*');

        return linhas.join('\n');
      }

      function montarMensagemOrientacoesAutuado_(p) {
        const nome = String(p?.nomeResponsavel || '').trim();
        const estabelecimento = String(p?.nomeFantasia || p?.razaoSocial || '').trim();
        const data = dataOrientacao_(p?._appCriadoEm);
        const linhas = [];

        linhas.push(nome ? `Olá, ${nome}.` : 'Olá.');
        linhas.push(`Foi realizada uma vistoria pelo CBMMG${estabelecimento ? ` no estabelecimento ${estabelecimento}` : ''}${data ? ` em ${data}` : ''}.`);
        linhas.push('');
        linhas.push('🚒 *FOI AUTUADO PELO CORPO DE BOMBEIROS?*');
        linhas.push('📌 Veja abaixo as principais orientações.');
        linhas.push('');
        linhas.push('📬 *COMO VOCÊ SERÁ AVISADO*');
        linhas.push('');
        linhas.push('A autuação será encaminhada por correspondência, com Aviso de Recebimento (AR), para o endereço da edificação.');
        linhas.push('');
        linhas.push('⚠️ *Não recebeu a correspondência em até 15 dias?*');
        linhas.push('');
        linhas.push('Entre em contato com o GPV Viçosa pelo WhatsApp:');
        linhas.push('📲 (31) 3612-3894');
        linhas.push('');
        linhas.push('📘 *IMPORTANTE*');
        linhas.push('');
        linhas.push('Consulte o *Manual do Autuado*, com orientações sobre o procedimento de fiscalização, prazos, defesa, regularização e acompanhamento no INFOSCIP:');
        linhas.push('');
        linhas.push('https://drive.google.com/file/d/1ruWxhB-8QVlOAV6o6eItqOeHgjUyKvt0/view?usp=sharing');
        linhas.push('');
        linhas.push('👷‍♂️ *PRIMEIRO PASSO FUNDAMENTAL*');
        linhas.push('');
        linhas.push('O responsável pela edificação deverá procurar um profissional legalmente habilitado, quando necessário, para elaborar, regularizar e/ou protocolar o processo de segurança contra incêndio e pânico junto ao Corpo de Bombeiros Militar de Minas Gerais.');
        linhas.push('');
        linhas.push('Esse profissional poderá ser, conforme o serviço necessário:');
        linhas.push('');
        linhas.push('✔️ Engenheiro');
        linhas.push('✔️ Arquiteto');
        linhas.push('');
        linhas.push('⚠️ O profissional deverá possuir habilitação compatível com o serviço a ser executado.');
        linhas.push('');
        linhas.push('✅ *PASSO A PASSO*');
        linhas.push('');
        linhas.push('*1️⃣ Leia atentamente a documentação recebida*');
        linhas.push('Verifique as irregularidades apontadas, as orientações e os respectivos prazos.');
        linhas.push('');
        linhas.push('*2️⃣ Acesse o sistema INFOSCIP*');
        linhas.push('🌐 fiscalizacaobombeiros.mg.gov.br');
        linhas.push('🔑 Entre utilizando sua conta gov.br.');
        linhas.push('');
        linhas.push('*3️⃣ Acesse “Meus Processos”*');
        linhas.push('📄 Utilize o código de acesso constante na documentação, quando solicitado.');
        linhas.push('');
        linhas.push('*4️⃣ Providencie a regularização dentro do prazo*');
        linhas.push('');
        linhas.push('Com o auxílio do profissional responsável, quando necessário:');
        linhas.push('');
        linhas.push('✔️ providencie o projeto/processo de segurança contra incêndio;');
        linhas.push('✔️ protocole a documentação necessária no CBMMG;');
        linhas.push('✔️ corrija as irregularidades identificadas;');
        linhas.push('✔️ solicite prorrogação de prazo, quando cabível.');
        linhas.push('');
        linhas.push('*5️⃣ Acompanhe o andamento do processo*');
        linhas.push('');
        linhas.push('📧 Mantenha seus dados de contato e e-mail atualizados para acompanhar as comunicações e não perder os prazos.');
        linhas.push('');
        linhas.push('⚠️ *ATENÇÃO*');
        linhas.push('');
        linhas.push('O descumprimento das exigências e dos prazos poderá resultar na aplicação das medidas administrativas cabíveis, inclusive multa, embargo, interdição ou cancelamento do AVCB/CLCB, conforme o caso.');
        linhas.push('');
        linhas.push('🔥 *Corpo de Bombeiros Militar de Minas Gerais*');
        linhas.push('*GPV — 3º Pelotão Viçosa*');
        return linhas.join('\n');
      }

      function montarMensagemOrientacoes_(p) {
        if (ehMensagemLiberacao_(p)) {
          const situacao = normalize(p?.sancao || p?.situacaoAtual || '');
          if (situacao === normalize('Liberado')) return montarMensagemLiberadoWhatsApp_(p);
          if (situacao === normalize('Notificado')) return montarMensagemNotificadoWhatsApp_(p);
        }
        return montarMensagemOrientacoesAutuado_(p);
      }

      function abrirMensagemWhatsAppResponsavel_(payload = ultimoRegistroParaOrientacoes, telefoneAlternativo = '') {
        if (!navigator.onLine) {
          avisarGpv_('A mensagem poderá ser aberta no WhatsApp quando a conexão voltar.', 'Sem internet', { tom: 'warning' });
          return false;
        }

        const dados = payload || {};
        const numero = telefoneWhatsApp_(telefoneAlternativo || dados.telefone);
        if (!numero) {
          avisarGpv_('Informe um telefone válido do responsável antes de abrir o WhatsApp.', 'Telefone não informado', { tom: 'warning' });
          return false;
        }

        // V23.9.47: preserva integralmente o padrão atual da mensagem, mas evita o
        // redirecionamento wa.me no desktop. O WhatsApp Web recebe o texto UTF-8
        // diretamente, reduzindo perda de emojis/caracteres durante redirecionamentos.
        const mensagem = montarMensagemOrientacoes_(dados).normalize('NFC');
        const textoCodificado = encodeURIComponent(mensagem);
        const ehDesktop = !/Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator.userAgent || ''));
        const urlPrimaria = ehDesktop
          ? `https://web.whatsapp.com/send?phone=${numero}&text=${textoCodificado}`
          : `https://wa.me/${numero}?text=${textoCodificado}`;
        const urlAlternativa = `https://api.whatsapp.com/send?phone=${numero}&text=${textoCodificado}`;

        try {
          if (ehDesktop) {
            const novaAba = window.open(urlPrimaria, '_blank');
            if (novaAba) {
              try { novaAba.opener = null; } catch (_) {}
              try { novaAba.focus(); } catch (_) {}
              return true;
            }
          }
          window.location.assign(urlPrimaria);
        } catch (erro) {
          try {
            window.location.href = urlPrimaria;
          } catch (erro2) {
            window.location.href = urlAlternativa;
          }
        }
        return true;
      }

      function atualizarBotaoOrientacoes_() {
        if (!whatsappOrientacoesBtn) return;
        const dados = ultimoRegistroParaOrientacoes || {};
        const numero = telefoneWhatsApp_(dados.telefone);
        const label = whatsappOrientacoesBtn.querySelector('.whatsapp-btn-label');
        const situacao = normalize(dados.sancao || dados.situacaoAtual || '');
        const liberado = ehMensagemLiberacao_(dados) && situacao === normalize('Liberado');
        const notificado = ehMensagemLiberacao_(dados) && situacao === normalize('Notificado');

        whatsappOrientacoesBtn.disabled = !numero;

        if (numero) {
          if (label) {
            label.textContent = liberado
              ? 'Enviar mensagem de liberação'
              : notificado
                ? 'Enviar mensagem de notificação'
                : 'Enviar mensagem ao responsável';
          }

          if (whatsappOrientacoesNote) {
            whatsappOrientacoesNote.textContent = liberado
              ? 'A mensagem de liberação será aberta no WhatsApp para conferência antes do envio.'
              : notificado
                ? 'A mensagem sobre as irregularidades e nova vistoria será aberta no WhatsApp para conferência antes do envio.'
                : 'A mensagem será aberta diretamente no WhatsApp do responsável e já inclui o acesso ao Manual do Autuado.';
          }
        } else {
          if (label) label.textContent = 'WhatsApp — telefone não informado';
          if (whatsappOrientacoesNote) {
            whatsappOrientacoesNote.textContent = 'Informe um telefone válido do responsável para abrir diretamente a conversa no WhatsApp.';
          }
        }
      }

      function abrirOrientacoesWhatsApp_() {
        abrirMensagemWhatsAppResponsavel_();
      }

      function mostrarSucesso(titulo, mensagem) {
        if (titulo !== 'Vistoria concluída parcialmente') {
          successScreen.classList.remove('partial-success');
          const closeBtn = document.getElementById('closeSuccessBtn');
          if (closeBtn) closeBtn.textContent = 'Continuar nesta tela';
        }
        successTitle.textContent = titulo;
        document.getElementById('successText').textContent = mensagem;
        atualizarBotaoOrientacoes_();
        atualizarBotaoPlanilhaSucesso_();
        successScreen.classList.add('show');
      }


      function atualizarLinkPlanilha_(url) {
        const destino = String(url || '').trim();
        if (destino && usuarioPodeAcessarPlanilha_()) {
          recordsState.planilhaUrl = destino;
        }

        const finalUrl = recordsState.planilhaUrl || String(appConfig?.planilhaUrl || '').trim();

        [recordsOpenSheetLink, recordDetailSheetLink, adminSheetMenuLink, dashboardSheetHeaderLink].forEach(link => {
          if (!link) return;

          if (!usuarioPodeAcessarPlanilha_()) {
            link.hidden = true;
            link.removeAttribute('href');
            link.setAttribute('aria-hidden', 'true');
            link.setAttribute('tabindex', '-1');
            return;
          }

          link.removeAttribute('aria-hidden');
          link.removeAttribute('tabindex');

          if (finalUrl) {
            link.href = finalUrl;
            link.hidden = false;
          } else {
            link.removeAttribute('href');
            link.hidden = true;
          }
        });
      }

      document.addEventListener('click', (event) => {
        const alvo = event.target?.closest?.(
          '#dashboardSheetHeaderLink, #adminSheetMenuLink, #recordsOpenSheetLink, #recordDetailSheetLink'
        );
        if (!alvo || usuarioPodeAcessarPlanilha_()) return;

        event.preventDefault();
        event.stopPropagation();

        alvo.hidden = true;
        alvo.removeAttribute('href');
        alvo.setAttribute('aria-hidden', 'true');
        alvo.setAttribute('tabindex', '-1');

        try { fecharMenuMais_(); } catch (_) {}
        if (appStatus) {
          appStatus.textContent = 'A planilha administrativa está disponível somente para usuários GPV.';
        }
      }, true);

      function atualizarBotaoPlanilhaSucesso_() {
        if (!recordsSuccessBtn) return;
        const label = recordsSuccessBtn.querySelector('.records-success-label');
        const online = navigator.onLine;
        recordsSuccessBtn.disabled = !online;
        if (!online) {
          if (label) label.textContent = 'Painel indisponível offline';
        } else if (ultimoRegistroConsultaChave) {
          if (label) label.textContent = 'Ver registro no painel';
        } else {
          if (label) label.textContent = 'Abrir painel';
        }
      }

      function marcarAbaApp_(modo) {
        // V23.9.72: o perfil GERAL também pode abrir o fluxo real de Vistoria
        // para conhecimento/treinamento. A proteção contra gravação permanece
        // no envio e, de forma independente, no backend.
        modo = modo === 'records' ? 'records' : 'form';
        const painel = modo === 'records';
        document.body.classList.toggle('records-mode', painel);
        recordsPanel.hidden = !painel;
        formTabBtn?.classList.toggle('active', !painel);
        recordsTabBtn?.classList.toggle('active', painel);
        formTabBtn?.setAttribute('aria-pressed', String(!painel));
        recordsTabBtn?.setAttribute('aria-pressed', String(painel));

        if (painel && swAtualizacaoPendente_) {
          setTimeout(() => aplicarAtualizacaoSilenciosaSeSeguro_(), 150);
        }
      }

      function atualizarVistaNaUrl_(modo) {
        try {
          const url = new URL(window.location.href);
          if (modo === 'records') url.searchParams.set('view', 'painel');
          else url.searchParams.set('view', 'vistoria');
          window.history.replaceState({ ...(window.history.state || {}), gpvApp: true }, '', url.pathname + url.search + url.hash);
        } catch (e) {}
      }

      const AUX_NOTIFICATIONS_QUERY = 'notificacoes';
      let auxNotificationsActiveId = '';
      let auxNotificationsStateTimer = null;

      function idAcessoAuxiliarNotificacoesUrl_() {
        try {
          const id = String(new URLSearchParams(window.location.search).get(AUX_NOTIFICATIONS_QUERY) || '').trim();
          return /^[A-Za-z0-9_-]{8,160}$/.test(id) ? id : '';
        } catch (e) {
          return '';
        }
      }

      function urlBaseSemAcessoAuxiliar_() {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete(AUX_NOTIFICATIONS_QUERY);
          url.searchParams.delete('view');
          url.hash = '';
          return url;
        } catch (e) {
          return null;
        }
      }

      function urlAcessoAuxiliarNotificacoes_(rascunhoId) {
        const url = urlBaseSemAcessoAuxiliar_();
        if (!url) return '';
        url.searchParams.set(AUX_NOTIFICATIONS_QUERY, String(rascunhoId || '').trim());
        return url.toString();
      }

      function nomeEdificacaoAcessoAuxiliar_(payload = {}) {
        return String(
          payload.nomeFantasia ||
          payload.razaoSocial ||
          payload.nomeEvento ||
          'Vistoria de Liberação'
        ).trim();
      }

      function atualizarCabecalhoAcessoAuxiliar_(payload = {}, detalhe = {}) {
        const edificio = nomeEdificacaoAcessoAuxiliar_(payload);
        const pscip = String(payload.pscip || '').trim();
        const endereco = [payload.endereco, payload.numero, payload.bairro].filter(Boolean).join(', ');
        if (auxNotificationsBuilding) {
          auxNotificationsBuilding.textContent = edificio + (pscip ? ` · ${pscip}` : '');
        }
        if (auxNotificationsMeta) {
          const partes = [];
          if (endereco) partes.push(endereco);
          if (detalhe?.atualizadoPor) partes.push(`Última atualização: ${detalhe.atualizadoPor}`);
          auxNotificationsMeta.textContent = partes.join(' • ');
        }
      }

      function modoAcessoAuxiliarNotificacoesAtivo_() {
        return Boolean(auxNotificationsActiveId && document.body.classList.contains('aux-notifications-mode'));
      }

      function encerrarMonitorAcessoAuxiliar_() {
        if (auxNotificationsStateTimer) {
          clearInterval(auxNotificationsStateTimer);
          auxNotificationsStateTimer = null;
        }
      }

      function bloquearAcessoAuxiliarEncerrado_(mensagem) {
        document.body.classList.add('aux-notifications-closed');
        if (auxNotificationsMeta) auxNotificationsMeta.textContent = mensagem || 'Esta vistoria não aceita mais lançamentos.';
        notificacoesLiberacaoLista?.querySelectorAll('input,textarea,button').forEach(el => {
          if (el.id !== 'auxNotificationsExitBtn') el.disabled = true;
        });
        if (notificacoesAdicionarLocalBtn) notificacoesAdicionarLocalBtn.disabled = true;
        appStatus.textContent = mensagem || 'Esta vistoria não aceita mais lançamentos.';
      }

      async function verificarEstadoAcessoAuxiliar_() {
        if (!auxNotificationsActiveId || !navigator.onLine || !usuarioPodeOperar_()) return;
        try {
          const estado = await apiRequest('config', {
            consulta: 'rascunho_estado',
            id: auxNotificationsActiveId
          }, 9000);
          const valor = String(estado?.estado || '').trim().toLowerCase();
          if (!estado?.encontrado) {
            bloquearAcessoAuxiliarEncerrado_('A vistoria compartilhada não foi localizada.');
            encerrarMonitorAcessoAuxiliar_();
            return;
          }
          if (!['em_andamento','parcial'].includes(valor)) {
            const texto = valor === 'cancelado'
              ? 'Este preenchimento foi cancelado e não aceita novos lançamentos.'
              : 'Esta vistoria já foi encerrada e não aceita novos lançamentos.';
            bloquearAcessoAuxiliarEncerrado_(texto);
            encerrarMonitorAcessoAuxiliar_();
          }
        } catch (e) {}
      }

      function iniciarMonitorAcessoAuxiliar_() {
        encerrarMonitorAcessoAuxiliar_();
        auxNotificationsStateTimer = setInterval(() => { void verificarEstadoAcessoAuxiliar_(); }, 8000);
      }

      async function abrirAcessoAuxiliarNotificacoes_(rascunhoId) {
        const id = String(rascunhoId || '').trim();
        if (!id || !usuarioPodeOperar_()) return false;

        document.body.classList.add('aux-notifications-loading');
        appStatus.textContent = 'Abrindo notificações compartilhadas...';

        if (!navigator.onLine) {
          document.body.classList.remove('aux-notifications-loading');
          appStatus.textContent = 'O primeiro acesso ao link da vistoria precisa de conexão com a internet.';
          return false;
        }

        try {
          // O endpoint "rascunho" já valida se a vistoria está ativa.
          // Um único request reduz sensivelmente o tempo entre o link e a tela de notificações.
          const detalhe = await apiRequest('config', { consulta: 'rascunho', id }, 20000);
          if (!detalhe?.payload) throw new Error('Não foi possível carregar o rascunho compartilhado.');

          currentRecordId = id;
          applyPayload(detalhe.payload, id);
          auxNotificationsActiveId = id;

          marcarAbaApp_('form');
          notificacoesLiberacaoSecao.hidden = false;
          if (auxNotificationsContext) auxNotificationsContext.hidden = false;
          document.body.classList.add('aux-notifications-mode');
          document.body.classList.remove('aux-notifications-closed');
          atualizarCabecalhoAcessoAuxiliar_(detalhe.payload, detalhe);
          atualizarBotaoCancelarPreenchimentoTopo_();
          renderizarNotificacoesLiberacao_();
          saveDraft();
          iniciarMonitorAcessoAuxiliar_();

          requestAnimationFrame(() => requestAnimationFrame(() => {
            try { notificacoesLiberacaoSecao.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {}
          }));

          appStatus.textContent = `Notificações compartilhadas abertas${detalhe.atualizadoPor ? ` — última atualização: ${detalhe.atualizadoPor}` : ''}.`;
          return true;
        } catch (erro) {
          auxNotificationsActiveId = '';
          document.body.classList.remove('aux-notifications-mode');
          if (auxNotificationsContext) auxNotificationsContext.hidden = true;
          appStatus.textContent = erro?.message || 'Não foi possível abrir as notificações compartilhadas.';
          showError(erro?.message || 'Não foi possível abrir as notificações compartilhadas.');
          return false;
        } finally {
          document.body.classList.remove('aux-notifications-loading');
        }
      }

      function sairAcessoAuxiliarNotificacoes_() {
        encerrarMonitorAcessoAuxiliar_();
        const url = urlBaseSemAcessoAuxiliar_();
        if (url) window.location.href = url.toString();
      }

      function fecharModalCompartilharAuxiliar_() {
        if (auxNotificationsShareModal) auxNotificationsShareModal.hidden = true;
        document.body.classList.remove('review-open');
      }

      async function copiarTextoClipboard_(texto) {
        const valor = String(texto || '');
        if (!valor) return false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(valor);
            return true;
          }
        } catch (e) {}
        try {
          const area = document.createElement('textarea');
          area.value = valor;
          area.setAttribute('readonly','');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          const ok = document.execCommand('copy');
          area.remove();
          return Boolean(ok);
        } catch (e) {
          return false;
        }
      }

      async function compartilharNotificacoesComAuxiliar_() {
        if (!usuarioPodeOperar_()) return;
        if (modoAcessoAuxiliarNotificacoesAtivo_()) return;
        if (!currentRecordId || notificacoesLiberacaoSecao?.hidden) {
          appStatus.textContent = 'Abra uma Vistoria de Liberação antes de compartilhar as notificações.';
          return;
        }
        if (!navigator.onLine) {
          appStatus.textContent = 'Conecte-se à internet para gerar o link compartilhado.';
          return;
        }

        const textoAnterior = notificacoesCompartilharAuxBtn?.textContent || 'Compartilhar notificações';
        if (notificacoesCompartilharAuxBtn) {
          notificacoesCompartilharAuxBtn.disabled = true;
          notificacoesCompartilharAuxBtn.textContent = 'Preparando link...';
        }

        try {
          saveDraft();
          const sincronizou = await sincronizarRascunhoCompartilhado_('em_andamento', true);
          if (!sincronizou) throw new Error('Não foi possível sincronizar a vistoria para criar o link.');

          // Confirma que o rascunho realmente está acessível no servidor antes de entregar o endereço.
          const detalhe = await apiRequest('config', { consulta: 'rascunho', id: String(currentRecordId) }, 15000);
          if (!detalhe?.payload) throw new Error('O servidor não confirmou o rascunho compartilhado.');

          const link = urlAcessoAuxiliarNotificacoes_(currentRecordId);
          if (!link) throw new Error('Não foi possível montar o link da vistoria.');

          if (auxNotificationsShareLink) auxNotificationsShareLink.value = link;
          if (auxNotificationsShareBuilding) {
            const edificio = nomeEdificacaoAcessoAuxiliar_(detalhe.payload);
            const pscip = String(detalhe.payload.pscip || '').trim();
            auxNotificationsShareBuilding.textContent = edificio + (pscip ? ` · ${pscip}` : '');
          }
          if (auxNotificationsNativeShareBtn) {
            auxNotificationsNativeShareBtn.hidden = typeof navigator.share !== 'function';
          }
          if (auxNotificationsShareModal) auxNotificationsShareModal.hidden = false;
          document.body.classList.add('review-open');
          setTimeout(() => auxNotificationsCopyLinkBtn?.focus(), 30);
          appStatus.textContent = 'Link específico das notificações pronto para compartilhar.';
        } catch (erro) {
          appStatus.textContent = erro?.message || 'Não foi possível gerar o link compartilhado.';
        } finally {
          if (notificacoesCompartilharAuxBtn) {
            notificacoesCompartilharAuxBtn.disabled = false;
            notificacoesCompartilharAuxBtn.textContent = textoAnterior;
          }
        }
      }

      function mostrarSplashAcessoAuxiliar_(texto = 'Abrindo notificações da vistoria...') {
        document.documentElement.classList.add('gpv-aux-entry');
        document.body?.classList.remove('gpv-aux-auth-visible');
        if (loadingText) loadingText.textContent = texto;
        loadingOverlay?.classList.add('show');
      }

      function ocultarSplashAcessoAuxiliar_() {
        loadingOverlay?.classList.remove('show');
      }

      function prepararLoginAcessoAuxiliar_() {
        if (!idAcessoAuxiliarNotificacoesUrl_()) return;
        document.documentElement.classList.add('gpv-aux-entry');
        document.body?.classList.add('gpv-aux-auth-visible');
        // O login já está visível; só então retiramos o splash para evitar qualquer flash da home.
        requestAnimationFrame(() => requestAnimationFrame(() => ocultarSplashAcessoAuxiliar_()));
      }

      async function carregarAcessoAuxiliarRapido_() {
        const id = idAcessoAuxiliarNotificacoesUrl_();
        if (!id) return false;

        mostrarSplashAcessoAuxiliar_('Abrindo notificações da vistoria...');

        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null'); } catch (e) {}
        aplicarConfig(cached || DEFAULT_CONFIG);
        aplicarPermissoesInterface_();
        atualizarNomeDispositivoUi_();
        atualizarStatusConexao();

        if (!usuarioPodeOperar_()) {
          ocultarSplashAcessoAuxiliar_();
          appStatus.textContent = 'Este link de notificações exige um usuário com perfil GPV.';
          return false;
        }

        if (!navigator.onLine) {
          if (loadingText) loadingText.textContent = 'Conecte-se à internet para abrir este acesso pela primeira vez.';
          appStatus.textContent = 'O primeiro acesso ao link da vistoria precisa de conexão com a internet.';
          return false;
        }

        try {
          const abriu = await abrirAcessoAuxiliarNotificacoes_(id);
          if (!abriu) {
            if (loadingText) loadingText.textContent = 'Não foi possível abrir as notificações desta vistoria.';
            return false;
          }

          // Só libera a tela depois que a área exclusiva de notificações já está montada.
          requestAnimationFrame(() => requestAnimationFrame(() => {
            ocultarSplashAcessoAuxiliar_();
          }));

          // Serviços secundários continuam em segundo plano e não atrasam o acesso.
          if (cached && navigator.onLine) {
            setTimeout(async () => {
              try {
                const data = await apiRequest('config', {}, 30000);
                aplicarConfig(data);
                try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
              } catch (e) {}
            }, 2200);
          }
          setTimeout(() => { void processarFilaFotosPendentes_(); }, 1600);
          return true;
        } catch (erro) {
          if (loadingText) loadingText.textContent = erro?.message || 'Não foi possível abrir as notificações desta vistoria.';
          appStatus.textContent = erro?.message || 'Não foi possível abrir as notificações compartilhadas.';
          return false;
        }
      }

      function vistaInicialDaUrl_() {
        try {
          if (idAcessoAuxiliarNotificacoesUrl_()) return 'form';
          const valor = String(new URLSearchParams(window.location.search).get('view') || '').trim().toLowerCase();
          if (['painel', 'panel', 'records', 'planilha'].includes(valor)) return 'records';
          if (['vistoria', 'form', 'formulario', 'nova-vistoria'].includes(valor)) return 'form';
          return '';
        } catch (e) {
          return '';
        }
      }

      function vistaInicialPorDispositivo_() {
        const largura = Math.max(
          Number(window.innerWidth || 0),
          Number(document.documentElement?.clientWidth || 0)
        );
        const altura = Math.max(
          Number(window.innerHeight || 0),
          Number(document.documentElement?.clientHeight || 0)
        );

        // Celular: prioridade absoluta para a vistoria em campo.
        if (largura <= 767) return 'form';

        // Tablet: retrato abre a vistoria; paisagem aproveita a largura para o painel.
        if (largura <= 1180) return largura > altura ? 'records' : 'form';

        // Notebook/desktop: painel como página inicial de uso diário.
        return 'records';
      }

      function vistaAtualNavegacao_() {
        return document.body.classList.contains('records-mode') ? 'records' : 'form';
      }

      function elementoVisivelNavegacao_(el, classe = '') {
        if (!el) return false;
        if (el.hidden) return false;
        if (classe && !el.classList.contains(classe)) return false;
        return true;
      }

      function camadaNavegacaoAtiva_() {
        if (elementoVisivelNavegacao_(accessGuidanceModal)) return { id: 'access-guidance', fechar: () => fecharAvisoAcessoGeral_() };
        const mobileChoice = mobileChoiceState?.overlay;
        if (elementoVisivelNavegacao_(mobileChoice)) return { id: 'mobile-choice', fechar: () => fecharEscolhaMovel_() };
        if (elementoVisivelNavegacao_(recordCorrectionModal)) return { id: 'record-correction', fechar: () => fecharCorrecaoRegistro_() };
        if (elementoVisivelNavegacao_(recordStatusUpdateModal)) return { id: 'status-infoscip', fechar: () => fecharAtualizacaoSituacaoInfoscip_() };
        if (elementoVisivelNavegacao_(notificationReviewModal)) return { id: 'notification-review', fechar: () => notificationReviewBackBtn?.click() };
        if (elementoVisivelNavegacao_(reviewModal)) return { id: 'review', fechar: () => reviewCancelBtn?.click() };
        if (elementoVisivelNavegacao_(cityCheckModal)) return { id: 'city-check', fechar: () => cityCheckKeepBtn?.click() };
        if (elementoVisivelNavegacao_(changePinModal)) return { id: 'change-pin', fechar: () => fecharAlterarSenha_() };
        if (elementoVisivelNavegacao_(userManagerModal)) return { id: 'user-manager', fechar: () => fecharGerenciadorUsuarios_() };
        if (elementoVisivelNavegacao_(redsTemplatesModal)) return { id: 'reds-templates', fechar: () => fecharHistoricosPadraoReds_() };
        if (elementoVisivelNavegacao_(prepareInspectionModal)) return { id: 'prepare-inspection', fechar: () => fecharModalPreparacao_() };
        if (elementoVisivelNavegacao_(dduRegisterModal)) return { id: 'ddu-register', fechar: () => fecharCadastroDdu_() };
        if (elementoVisivelNavegacao_(duvidasModal)) return { id: 'duvidas', fechar: () => fecharDuvidas_() };
        if (elementoVisivelNavegacao_(systemManualModal)) return { id: 'system-manual', fechar: () => fecharManualSistema_() };
        if (elementoVisivelNavegacao_(aboutSystemModal)) return { id: 'about', fechar: () => fecharSobreSistema_() };
        if (elementoVisivelNavegacao_(usefulLinksModal)) return { id: 'useful-links', fechar: () => fecharLinksUteis_() };
        if (elementoVisivelNavegacao_(tutorialModal)) return { id: 'tutorial', fechar: () => fecharTutorial_() };
        if (elementoVisivelNavegacao_(recordDetailScreen, 'show')) return { id: 'record-detail', fechar: () => fecharDetalheRegistro_() };
        if (elementoVisivelNavegacao_(goalsModal)) return { id: 'goals', fechar: () => fecharMetas_() };
        if (elementoVisivelNavegacao_(programmedListModal)) return { id: 'programmed-list', fechar: () => fecharListaProgramadas_() };
        if (elementoVisivelNavegacao_(dduListModal)) return { id: 'ddu-list', fechar: () => dduListCloseBtn?.click() };
        if (elementoVisivelNavegacao_(successScreen, 'show')) return { id: 'success', fechar: () => document.getElementById('closeSuccessBtn')?.click() };
        if (appMoreMenu && !appMoreMenu.hidden) return { id: 'more-menu', fechar: () => fecharMenuMais_() };

        const programmedReturnBar = document.getElementById('programmedReturnBar');
        if (programmedReturnBar && !programmedReturnBar.hidden) {
          return { id: 'programmed-form', fechar: () => programmedReturnBar.querySelector('#returnToProgrammedBtn')?.click() };
        }

        const fluxoSelecionado = Boolean(String(tipoVistoriaInput?.value || '').trim()) &&
          (document.body.classList.contains('inspection-flow-active') || document.body.classList.contains('release-flow-active'));
        if (vistaAtualNavegacao_() === 'form' && fluxoSelecionado) {
          return {
            id: 'inspection-flow',
            fechar: () => {
              restaurarPainelProgramadas_(false);
              aplicarFluxoVistoria_('', { silencioso: true });
              try { tipoVistoriaSecao?.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {}
            }
          };
        }

        const vistaAtual = vistaAtualNavegacao_();
        if (vistaAtual !== appNavigationRootView) {
          return {
            id: `view-${vistaAtual}`,
            fechar: () => {
              if (appNavigationRootView === 'records') mostrarVistaPlanilha_({ carregar: false });
              else mostrarVistaFormulario_();
            }
          };
        }
        return null;
      }

      function precisaGuardNavegacao_() {
        return Boolean(camadaNavegacaoAtiva_());
      }

      function agendarSincronizacaoNavegacao_() {
        if (!appNavigationReady || appNavigationHandlingBack) return;
        clearTimeout(appNavigationSyncTimer);
        appNavigationSyncTimer = setTimeout(sincronizarGuardNavegacao_, 0);
      }

      function sincronizarGuardNavegacao_() {
        if (!appNavigationReady || appNavigationHandlingBack || appNavigationConsumingGuard) return;
        const precisa = precisaGuardNavegacao_();
        if (precisa && !appNavigationGuardActive) {
          try {
            const estado = { ...(window.history.state || {}), gpvApp: true, gpvNavigationGuard: true };
            window.history.pushState(estado, '', window.location.href);
            appNavigationGuardActive = true;
          } catch (e) {}
          return;
        }
        if (!precisa && appNavigationGuardActive) {
          appNavigationConsumingGuard = true;
          try { window.history.back(); }
          catch (e) { appNavigationConsumingGuard = false; appNavigationGuardActive = false; }
        }
      }

      function tratarVoltarNavegacao_(event) {
        if (!appNavigationReady) return;
        if (appNavigationConsumingGuard) {
          appNavigationConsumingGuard = false;
          appNavigationGuardActive = false;
          // Corrige a URL da entrada-base caso a troca Painel/Vistoria tenha
          // ocorrido enquanto o guard estava no topo do histórico.
          atualizarVistaNaUrl_(vistaAtualNavegacao_());
          setTimeout(() => agendarSincronizacaoNavegacao_(), 0);
          return;
        }

        if (!appNavigationGuardActive) return;
        appNavigationGuardActive = false;
        const camada = camadaNavegacaoAtiva_();
        if (!camada) return;

        appNavigationHandlingBack = true;
        try { camada.fechar?.(); }
        catch (e) { console.warn('Navegação interna:', e?.message || e); }
        setTimeout(() => {
          appNavigationHandlingBack = false;
          agendarSincronizacaoNavegacao_();
        }, 30);
      }

      function inicializarNavegacaoGlobal_(vistaRaiz) {
        if (appNavigationReady) return;
        appNavigationRootView = vistaRaiz === 'records' ? 'records' : 'form';
        appNavigationReady = true;
        try {
          window.history.replaceState({ ...(window.history.state || {}), gpvApp: true, gpvNavigationBase: true }, '', window.location.href);
        } catch (e) {}
        window.addEventListener('popstate', tratarVoltarNavegacao_);
        appNavigationObserver = new MutationObserver(() => agendarSincronizacaoNavegacao_());
        appNavigationObserver.observe(document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ['hidden', 'class', 'aria-hidden']
        });
        agendarSincronizacaoNavegacao_();
      }

      async function mostrarVistaFormulario_() {
        const estavaNoFormulario = vistaAtualNavegacao_() === 'form';
        if (usuarioEmTreinamento_() && !estavaNoFormulario) await mostrarAvisoAcessoGeral_('vistoria');
        marcarAbaApp_('form');
        fecharDetalheRegistro_({ restaurarContexto: false });
        atualizarVistaNaUrl_('form');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (usuarioEmTreinamento_()) {
          if (draftStatus) draftStatus.textContent = 'Preenchimento temporário';
          if (submitBtn) submitBtn.textContent = 'Finalizar treinamento';
        }
      }

      function mostrarVistaPlanilha_(opcoes = {}) {
        // Sempre entrar no Painel com a ficha fechada.
        fecharDetalheRegistro_({ restaurarContexto: false });
        marcarAbaApp_('records');
        atualizarVistaNaUrl_('records');
        if (opcoes.busca != null && recordsSearch) recordsSearch.value = String(opcoes.busca || '');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (opcoes.carregar !== false) carregarRegistros_(true, { forcar: true, motivo: 'abertura do Painel' });
      }

      function preencherSelectConsulta_(select, valores, rotuloTodos) {
        if (!select) return;
        const atual = select.value;
        const lista = Array.isArray(valores) ? valores.filter(Boolean) : [];
        select.innerHTML = `<option value="">${escapeHtml(rotuloTodos)}</option>` +
          lista.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
        if (lista.includes(atual)) select.value = atual;
      }

      function preencherPeriodosConsulta_(anos) {
        if (!recordsPeriodFilter) return;
        const atual = recordsPeriodFilter.value;
        const fixos = [
          ['', 'Todos'],
          ['30d', 'Últimos 30 dias'],
          ['90d', 'Últimos 90 dias'],
          ['365d', 'Últimos 12 meses']
        ];
        const anosValidos = (Array.isArray(anos) ? anos : [])
          .map(v => String(v || '').trim()).filter(v => /^\d{4}$/.test(v));
        recordsPeriodFilter.innerHTML = fixos.map(([v, t]) => `<option value="${v}">${t}</option>`).join('') +
          anosValidos.map(ano => `<option value="ano:${ano}">Ano ${ano}</option>`).join('');
        const existe = Array.from(recordsPeriodFilter.options).some(o => o.value === atual);
        if (existe) recordsPeriodFilter.value = atual;
      }

      function filtrosConsultaAtuais_() {
        return {
          busca: String(recordsSearch?.value || '').trim(),
          cidade: String(recordsCityFilter?.value || '').trim(),
          demanda: String(recordsDemandFilter?.value || '').trim(),
          sancao: String(recordsSanctionFilter?.value || '').trim(),
          tipo: String(recordsTypeFilter?.value || '').trim(),
          vistoriador: String(recordsInspectorFilter?.value || '').trim(),
          periodo: String(recordsPeriodFilter?.value || '').trim(),
          prazoMulta: String(recordsState.prazoMulta || '').trim()
        };
      }

      function atualizarEstadoCardsMulta_() {
        const ativo1 = recordsState.prazoMulta === 'primeira';
        const ativo2 = recordsState.prazoMulta === 'segunda';
        kpiMulta1Card?.classList.toggle('active', ativo1);
        kpiMulta2Card?.classList.toggle('active', ativo2);
        kpiMulta1Card?.setAttribute('aria-pressed', ativo1 ? 'true' : 'false');
        kpiMulta2Card?.setAttribute('aria-pressed', ativo2 ? 'true' : 'false');
      }

      function limparFiltrosVisiveisPainel_() {
        if (recordsSearch) recordsSearch.value = '';
        if (recordsCityFilter) recordsCityFilter.value = '';
        if (recordsDemandFilter) recordsDemandFilter.value = '';
        if (recordsSanctionFilter) recordsSanctionFilter.value = '';
        if (recordsTypeFilter) recordsTypeFilter.value = '';
        if (recordsInspectorFilter) recordsInspectorFilter.value = '';
        if (recordsPeriodFilter) recordsPeriodFilter.value = '';
      }

      function filtrarPorPrazoMulta_(tipo) {
        const proximo = recordsState.prazoMulta === tipo ? '' : tipo;
        limparFiltrosVisiveisPainel_();
        recordsState.prazoMulta = proximo;
        atualizarEstadoCardsMulta_();
        carregarRegistros_(true, { forcar: true, motivo: 'filtro de prazo' });
      }

      function classeStatus_(valor) {
        const n = normalize(valor);
        if (n === 'autuado') return 'status-autuado';
        if (n === 'advertencia') return 'status-advertencia';
        if (n === 'notificado') return 'status-notificado';
        if (n === 'regularizado') return 'status-regularizado';
        if (n === 'liberado') return 'status-liberado';
        if (n.startsWith('pendente')) return 'status-pendente';
        return 'status-neutral';
      }

      function statusBadgeHtml_(valor) {
        const texto = String(valor || 'Sem situação');
        return `<span class="status-badge ${classeStatus_(texto)}">${escapeHtml(texto)}</span>`;
      }

      function percentualResumo_(valor, total) {
        const base = Number(total || 0);
        const numero = Number(valor || 0);
        if (!base) return '0% do total';
        const percentual = (numero / base) * 100;
        return `${percentual.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% do total`;
      }

      function atualizarKpis_(resumo) {
        const r = resumo || {};
        const total = Number(r.total || 0);
        if (kpiTotal) kpiTotal.textContent = total.toLocaleString('pt-BR');
        if (kpiAutuado) kpiAutuado.textContent = Number(r.autuado || 0).toLocaleString('pt-BR');
        if (kpiAdvertencia) kpiAdvertencia.textContent = Number(r.advertencia || 0).toLocaleString('pt-BR');
        if (kpiNotificado) kpiNotificado.textContent = Number(r.notificado || 0).toLocaleString('pt-BR');
        if (kpiRegularizado) kpiRegularizado.textContent = Number(r.regularizado || 0).toLocaleString('pt-BR');
        if (kpiLiberado) kpiLiberado.textContent = Number(r.liberado || 0).toLocaleString('pt-BR');
        if (kpiRegularizadoPercent) kpiRegularizadoPercent.textContent = percentualResumo_(r.regularizado, total);
        if (kpiLiberadoPercent) kpiLiberadoPercent.textContent = percentualResumo_(r.liberado, total);
        if (kpiAdvertenciaPercent) kpiAdvertenciaPercent.textContent = percentualResumo_(r.advertencia, total);
        if (kpiMulta1) kpiMulta1.textContent = Number(r.primeiraMulta || 0).toLocaleString('pt-BR');
        if (kpiMulta2) kpiMulta2.textContent = Number(r.segundaMulta || 0).toLocaleString('pt-BR');
        atualizarEstadoCardsMulta_();
      }

      function formatarDataPainel_(valor) {
        const texto = String(valor || '').trim();
        if (!texto) return '—';

        const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) {
          return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
        }

        const barras = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (barras) {
          let parte1 = Number(barras[1]);
          let parte2 = Number(barras[2]);
          const ano = barras[3];

          // Base antiga/importada pode chegar em MM/DD/AAAA.
          // Ex.: 03/14/2025 -> 14/03/2025.
          if (parte2 > 12 && parte1 >= 1 && parte1 <= 12) {
            return `${String(parte2).padStart(2, '0')}/${String(parte1).padStart(2, '0')}/${ano}`;
          }

          // Nos casos ambíguos (ex.: 05/06/2025), mantém o padrão brasileiro.
          return `${String(parte1).padStart(2, '0')}/${String(parte2).padStart(2, '0')}/${ano}`;
        }

        return texto;
      }

      function formatarDataNascimentoFicha_(valor) {
        const texto = String(valor == null ? '' : valor).trim();
        if (!texto) return '';
        const formatada = formatarDataPainel_(texto);
        return formatada === '—' ? '' : formatada;
      }

      function formatarEnderecoPainel_(item) {
        const logradouro = String(item?.endereco || '').trim();
        const numero = String(item?.numero || '').trim();
        const bairro = String(item?.bairro || '').trim();
        const partes = [];
        if (logradouro) partes.push(logradouro);
        if (numero) partes[0] = partes[0] ? `${partes[0]}, ${numero}` : numero;
        if (bairro) partes.push(bairro);
        return partes.join(' — ') || '—';
      }

      // V23.9.68 — concentra prazo e próxima providência e respeita a conferência manual do INFOSCIP.
      // Prioriza textos já gravados pelo sistema/planilha e só usa descrições neutras como contingência.
      function proximaAcaoPainel_(item) {
        const acaoSugerida = String(item?.acaoSugerida || '').trim();
        const alertaPrazo = String(item?.alertaPrazo || '').trim();
        const pendenciaDocumental = String(item?.pendenciaDocumental || '').trim();
        const diasAutuacao = String(item?.diasAutuacao || '').trim();
        const sancao = normalize(item?.sancao || '');
        const tipo = normalize(item?.tipoVistoria || '');

        let principal = '';
        let detalhe = '';

        if (acaoSugerida) {
          principal = acaoSugerida;
          if (alertaPrazo && !normalize(acaoSugerida).includes(normalize(alertaPrazo))) detalhe = alertaPrazo;
        } else if (alertaPrazo) {
          principal = alertaPrazo;
        } else if (pendenciaDocumental) {
          principal = 'Pendência documental';
          detalhe = pendenciaDocumental;
        } else if (sancao === 'advertencia') {
          principal = 'Acompanhar prazo de regularização';
        } else if (sancao === 'autuado') {
          principal = 'Acompanhar autuação e regularização';
        } else if (sancao === 'notificado' && tipo.includes('liberacao')) {
          principal = 'Aguardar correção das pendências';
        } else if (sancao === 'notificado') {
          principal = 'Acompanhar pendências registradas';
        } else if (sancao === 'regularizado') {
          principal = 'Processo regularizado';
        } else if (sancao === normalize('Pendente — multa em aberto')) {
          principal = 'Conferir quitação da multa no INFOSCIP';
        } else if (sancao === normalize('Pendente — conferir multa no INFOSCIP')) {
          principal = 'Conferir multa no INFOSCIP';
        } else if (sancao === 'liberado') {
          principal = 'Liberação concluída';
        } else {
          principal = 'Sem ação pendente registrada';
        }

        if (!detalhe && diasAutuacao && (sancao === 'autuado' || sancao === 'advertencia')) {
          const numero = Number(String(diasAutuacao).replace(',', '.'));
          detalhe = Number.isFinite(numero)
            ? `${Math.max(0, Math.trunc(numero))} dia${Math.trunc(numero) === 1 ? '' : 's'} desde a autuação`
            : diasAutuacao;
        }
        return { principal, detalhe };
      }

      function marcarLinhaSelecionada_() {
        if (!recordsTableBody) return;
        recordsTableBody.querySelectorAll('.records-table-row').forEach(row => {
          row.classList.toggle('selected', Boolean(recordsState.chaveSelecionada) && row.dataset.recordKey === recordsState.chaveSelecionada);
        });
      }

      function renderizarRegistros_() {
        const itens = recordsState.itens || [];
        if (!itens.length) {
          recordsList.innerHTML = '<div class="records-empty">Nenhum registro encontrado com os filtros informados.</div>';
          recordsTableBody.innerHTML = '<tr><td colspan="11" class="records-table-empty">Nenhum registro encontrado.</td></tr>';
          return;
        }

        recordsTableBody.innerHTML = itens.map(item => {
          const tituloBase = item.nomeFantasia || item.razaoSocial || 'Registro sem nome';
          const titulo = item.origemHistorica ? `${tituloBase} · histórico 2024-2025` : tituloBase;
          const selecionado = recordsState.chaveSelecionada && recordsState.chaveSelecionada === item.chave ? ' selected' : '';
          const proximaAcao = proximaAcaoPainel_(item);
          return `<tr class="records-table-row${selecionado}" data-record-key="${escapeAttr(item.chave || '')}" data-record-line="${Number(item.linha || 0)}" tabindex="0" aria-label="Abrir ficha de ${escapeAttr(titulo)}">
            <td>${escapeHtml(formatarDataPainel_(item.carimbo))}</td>
            <td><strong>${escapeHtml(titulo)}</strong>${item.razaoSocial && normalize(item.razaoSocial) !== normalize(titulo) ? `<small>${escapeHtml(item.razaoSocial)}</small>` : ''}</td>
            <td class="records-address-cell" title="${escapeAttr(formatarEnderecoPainel_(item))}">${escapeHtml(formatarEnderecoPainel_(item))}</td>
            <td>${escapeHtml(item.cidade || '—')}</td>
            <td class="records-mono">${escapeHtml(identificadorPainel_(item).valor)}</td>
            <td>${escapeHtml(item.demanda || '—')}</td>
            <td>${statusBadgeHtml_(item.sancao)}</td>
            <td class="records-next-action-cell" title="${escapeAttr([proximaAcao.principal, proximaAcao.detalhe].filter(Boolean).join(' — '))}"><strong>${escapeHtml(proximaAcao.principal)}</strong>${proximaAcao.detalhe ? `<small>${escapeHtml(proximaAcao.detalhe)}</small>` : ''}</td>
            <td class="records-mono">${escapeHtml(item.projeto ? projetoPscipOperacional_(item.projeto) : '—')}</td>
            <td>${escapeHtml(item.tipoVistoria || '—')}</td>
            <td class="records-ficha-cell"><button class="records-ficha-btn" type="button" data-open-record-detail="${escapeAttr(item.chave || '')}" data-record-line="${Number(item.linha || 0)}" title="Abrir Ficha do Processo" aria-label="Abrir ficha de ${escapeAttr(titulo)}">
              <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9.5L19 7v13.5H6z"/><path d="M15.5 3.5V7H19M9 11h7M9 15h5"/></svg>
            </button></td>
          </tr>`;
        }).join('');

        recordsList.innerHTML = itens.map(item => {
          const tituloBase = item.nomeFantasia || item.razaoSocial || 'Registro sem nome';
          const titulo = item.origemHistorica ? `${tituloBase} · histórico 2024-2025` : tituloBase;
          const razao = item.razaoSocial && normalize(item.razaoSocial) !== normalize(titulo) ? item.razaoSocial : '';
          const endereco = formatarEnderecoPainel_(item);
          const proximaAcao = proximaAcaoPainel_(item);
          return `<button class="records-card" type="button" data-record-key="${escapeAttr(item.chave || '')}" data-record-line="${Number(item.linha || 0)}" aria-label="Abrir ficha de ${escapeAttr(titulo)}">
            <div class="records-card-top"><div class="records-card-title">${escapeHtml(titulo)}</div><div class="records-card-date">${escapeHtml(formatarDataPainel_(item.carimbo))}</div></div>
            ${razao ? `<div class="records-card-subtitle">${escapeHtml(razao)}</div>` : ''}
            <div class="records-card-status-row">${statusBadgeHtml_(item.sancao)}<span>${escapeHtml(item.demanda || 'Sem demanda')}</span></div>
            <div class="records-card-meta">
              <div class="records-meta-item"><span>Cidade</span><strong>${escapeHtml(item.cidade || '—')}</strong></div>
              <div class="records-meta-item"><span>${escapeHtml(identificadorPainel_(item).rotulo)}</span><strong>${escapeHtml(identificadorPainel_(item).valor)}</strong></div>
              <div class="records-meta-item"><span>Nº PSCIP</span><strong>${escapeHtml(item.projeto ? projetoPscipOperacional_(item.projeto) : '—')}</strong></div>
              <div class="records-meta-item"><span>Nº PF</span><strong>${escapeHtml(item.pf || '—')}</strong></div>
            </div>
            ${endereco && endereco !== '—' ? `<div class="records-card-address">${escapeHtml(endereco)}</div>` : ''}
            <div class="records-card-action"><span>Prazo / Próxima ação</span><strong>${escapeHtml(proximaAcao.principal)}</strong>${proximaAcao.detalhe ? `<small>${escapeHtml(proximaAcao.detalhe)}</small>` : ''}</div>
            <div class="records-card-cta">Ver ficha completa <span aria-hidden="true">→</span></div>
          </button>`;
        }).join('');
      }

      function paginasPainel_(pagina, totalPaginas) {
        if (totalPaginas <= 5) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
        const paginas = new Set([1, totalPaginas, pagina - 1, pagina, pagina + 1]);
        return Array.from(paginas).filter(p => p >= 1 && p <= totalPaginas).sort((a, b) => a - b);
      }

      function atualizarPaginacao_() {
        const total = recordsState.total || 0;
        const pagina = recordsState.pagina || 1;
        const totalPaginas = Math.max(1, recordsState.totalPaginas || 1);
        const inicio = total ? ((pagina - 1) * recordsState.limite) + 1 : 0;
        const fim = Math.min(total, pagina * recordsState.limite);
        if (recordsPaginationSummary) recordsPaginationSummary.textContent = total ? `Mostrando ${inicio} a ${fim} de ${total} registros` : 'Nenhum registro';
        if (recordsPageLabel) recordsPageLabel.textContent = `Página ${pagina} de ${totalPaginas}`;
        if (recordsPrevBtn) recordsPrevBtn.disabled = pagina <= 1 || recordsState.carregando;
        if (recordsNextBtn) recordsNextBtn.disabled = pagina >= totalPaginas || recordsState.carregando;

        if (recordsPageButtons) {
          const paginas = paginasPainel_(pagina, totalPaginas);
          const partes = [];
          paginas.forEach((numero, indice) => {
            const anterior = paginas[indice - 1];
            if (anterior && numero - anterior > 1) partes.push('<span class="pagination-ellipsis" aria-hidden="true">…</span>');
            partes.push(`<button class="pagination-page${numero === pagina ? ' active' : ''}" type="button" data-page="${numero}" ${recordsState.carregando ? 'disabled' : ''}>${numero}</button>`);
          });
          recordsPageButtons.innerHTML = partes.join('');
        }

        if (recordsPageSize && String(recordsPageSize.value) !== String(recordsState.limite)) {
          recordsPageSize.value = String(recordsState.limite);
        }
      }

      function escaparHtmlMetas_(valor) {
        return String(valor == null ? '' : valor)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      }

      function classeMeta_(item) {
        const situacao = normalize(item?.situacao || '');
        if (situacao === 'atingida') return 'is-done';
        if (situacao.includes('informativa')) return 'is-info';
        if (Number(item?.realizado || 0) > 0) return 'is-progress';
        return 'is-pending';
      }

      function renderizarMetas_(dados) {
        metasMensaisAtual = dados || null;
        const categorias = Array.isArray(dados?.categorias) ? dados.categorias : [];
        const metaTotal = Number(dados?.metaTotal || 0);
        const realizadoTotal = Number(dados?.realizadoTotal || 0);
        const percentual = Math.max(0, Math.min(100, Number(dados?.percentual || 0)));
        const titulo = String(dados?.titulo || 'Mês atual').trim();

        if (dashboardGoalsTitle) dashboardGoalsTitle.textContent = `Metas de ${titulo} — Viçosa`;
        if (dashboardGoalsSubtitle) dashboardGoalsSubtitle.textContent = metaTotal > 0
          ? `${realizadoTotal} de ${metaTotal} vistorias da meta contabilizadas.`
          : 'Acompanhamento mensal das categorias de meta.';
        if (dashboardGoalsOverallValue) dashboardGoalsOverallValue.textContent = `${realizadoTotal} / ${metaTotal}`;
        if (dashboardGoalsOverallLabel) dashboardGoalsOverallLabel.textContent = percentual >= 100 ? 'Meta geral atingida' : `Faltam ${Math.max(0, metaTotal - realizadoTotal)}`;
        if (dashboardGoalsPercent) dashboardGoalsPercent.textContent = `${Math.round(percentual)}%`;
        if (dashboardGoalsProgressBar) dashboardGoalsProgressBar.style.width = `${percentual}%`;

        if (dashboardGoalsGrid) {
          const categoriasPainel = [...categorias].sort((a, b) => {
            const aInformativa = Number(a?.meta || 0) <= 0 ? 1 : 0;
            const bInformativa = Number(b?.meta || 0) <= 0 ? 1 : 0;
            return aInformativa - bInformativa;
          });

          dashboardGoalsGrid.innerHTML = categoriasPainel.map(item => {
            const meta = Number(item?.meta || 0);
            const realizado = Number(item?.realizado || 0);
            const totalReal = Number(item?.totalReal || realizado);
            const pct = meta > 0 ? Math.max(0, Math.min(100, Number(item?.percentual || 0))) : 100;
            const valor = meta > 0 ? `${realizado}/${meta}` : `${totalReal}`;
            const rodape = meta > 0
              ? (realizado >= meta ? '✓ Meta atingida' : `Falta${Math.max(0, meta - realizado) === 1 ? '' : 'm'} ${Math.max(0, meta - realizado)}`)
              : 'Realização informativa';
            return `<article class="dashboard-goal-item ${classeMeta_(item)}">
              <div class="dashboard-goal-item-top"><strong>${escaparHtmlMetas_(item?.nome || '')}</strong><b>${valor}</b></div>
              <div class="dashboard-goal-mini-progress"><span style="width:${pct}%"></span></div>
              <small>${escaparHtmlMetas_(rodape)}</small>
            </article>`;
          }).join('');
        }

        if (goalsModalTitle) goalsModalTitle.textContent = `Metas de ${titulo}`;
        if (goalsModalSubtitle) goalsModalSubtitle.textContent = `${realizadoTotal} de ${metaTotal} contabilizadas na meta mensal de Viçosa.`;
        if (goalsModalSummary) goalsModalSummary.innerHTML = `<div class="goals-modal-overall-card"><div class="goals-modal-overall-top"><div><span>Progresso geral</span><strong>${Math.round(percentual)}%</strong></div><div class="goals-modal-overall-count"><span>Realizado / meta</span><strong>${realizadoTotal}/${metaTotal}</strong></div></div><div class="goals-modal-overall-progress"><span style="width:${Math.max(0, Math.min(100, percentual))}%"></span></div><div class="goals-modal-overall-foot"><span>${realizadoTotal >= metaTotal ? 'Meta mensal atingida' : `Faltam ${Math.max(0, metaTotal-realizadoTotal)} para a meta mensal`}</span><span>Viçosa</span></div></div>`;
        if (goalsModalList) {
          goalsModalList.innerHTML = categorias.map(item => {
            const meta = Number(item?.meta || 0);
            const realizado = Number(item?.realizado || 0);
            const totalReal = Number(item?.totalReal || realizado);
            const pct = meta > 0 ? Math.max(0, Math.min(100, Number(item?.percentual || 0))) : 100;
            const ultimo = String(item?.ultimoLocal || '').trim();
            const data = String(item?.ultimaData || '').trim();
            return `<article class="goals-modal-item ${classeMeta_(item)}">
              <div class="goals-modal-item-head"><div><strong>${escaparHtmlMetas_(item?.nome || '')}</strong><span>${meta > 0 ? `Meta ${meta}` : 'Fora da meta'}</span></div><b>${meta > 0 ? `${realizado}/${meta}` : totalReal}</b></div>
              <div class="goals-modal-progress"><span style="width:${pct}%"></span></div>
              <div class="goals-modal-meta"><span>${meta > 0 ? (realizado >= meta ? 'Meta atingida' : `Faltam ${Math.max(0, meta-realizado)}`) : `${totalReal} realizada(s)`}</span>${ultimo ? `<span>Último: ${escaparHtmlMetas_(ultimo)}${data ? ` • ${escaparHtmlMetas_(data)}` : ''}</span>` : '<span>Nenhum registro no mês</span>'}</div>
            </article>`;
          }).join('');
        }

        if (goalsModalDetails) {
          const gruposComRegistros = categorias.filter(item => Array.isArray(item?.detalhes) && item.detalhes.length);
          goalsModalDetails.innerHTML = gruposComRegistros.length ? gruposComRegistros.map(item => {
            const detalhes = item.detalhes || [];
            const rotulo = Number(item?.meta || 0) > 0
              ? `${detalhes.length} contabilizada${detalhes.length === 1 ? '' : 's'} na meta`
              : `${detalhes.length} realização${detalhes.length === 1 ? '' : 'ões'} fora da meta`;
            const cards = detalhes.map(registro => {
              const areaBruta = String(registro?.area || '').trim();
              const area = areaBruta ? (/m²|m2/i.test(areaBruta) ? areaBruta : `${areaBruta} m²`) : '';
              const campos = [
                ['REDS', registro?.reds],
                ['Nº do PF', registro?.pf],
                ['Nº do PSCIP', registro?.projeto],
                ['Área', area],
                ['Vistoriador', registro?.vistoriador],
                ['Situação', registro?.sancao]
              ].filter(([, valor]) => String(valor || '').trim());
              return `<article class="goals-detail-card">
                <div class="goals-detail-card-head"><span>${escaparHtmlMetas_(registro?.data || '')}</span>${registro?.tipoVistoria ? `<b>${escaparHtmlMetas_(registro.tipoVistoria)}</b>` : ''}</div>
                <h4>${escaparHtmlMetas_(registro?.nomeFantasia || 'Local não informado')}</h4>
                <div class="goals-detail-fields">${campos.map(([rotuloCampo, valorCampo]) => `<div><span>${escaparHtmlMetas_(rotuloCampo)}</span><strong>${escaparHtmlMetas_(valorCampo)}</strong></div>`).join('')}</div>
                <button class="goals-detail-open-record" type="button" data-goal-open-record="${escapeAttr(registro?.chave || '')}" data-record-line="${Number(registro?.linha || 0)}">
                  <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9.5L19 7v13.5H6z"/><path d="M15.5 3.5V7H19M9 11h7M9 15h5"/></svg>
                  Abrir Ficha
                </button>
              </article>`;
            }).join('');
            return `<section class="goals-details-category ${classeMeta_(item)}"><header><div><strong>${escaparHtmlMetas_(item?.nome || '')}</strong><span>${escaparHtmlMetas_(rotulo)}</span></div><b>${Number(item?.meta || 0) > 0 ? `${Number(item?.realizado || 0)}/${Number(item?.meta || 0)}` : Number(item?.totalReal || 0)}</b></header><div class="goals-details-grid">${cards}</div></section>`;
          }).join('') : '<div class="goals-details-empty"><strong>Nenhum local contabilizado neste mês.</strong><span>Quando houver registros válidos para as metas, eles aparecerão aqui com acesso direto à Ficha do Processo.</span></div>';
        }
      }

      function selecionarAbaMetas_(aba = 'resumo') {
        const detalhes = aba === 'detalhes';
        goalsTabSummaryBtn?.classList.toggle('active', !detalhes);
        goalsTabDetailsBtn?.classList.toggle('active', detalhes);
        goalsTabSummaryBtn?.setAttribute('aria-selected', String(!detalhes));
        goalsTabDetailsBtn?.setAttribute('aria-selected', String(detalhes));
        if (goalsSummaryPanel) goalsSummaryPanel.hidden = detalhes;
        if (goalsDetailsPanel) goalsDetailsPanel.hidden = !detalhes;
      }

      async function carregarMetas_(forcar = false) {
        if (metasCarregando) return;
        const cache = lerStorageJson_(GOALS_CACHE_STORAGE, {});
        const idadeCache = cache?.salvoEm ? Math.max(0, Date.now() - Number(cache.salvoEm)) : Infinity;
        const cacheDisponivel = Boolean(cache?.resposta && cache?.salvoEm && idadeCache <= GOALS_CACHE_STALE_MS);
        const cacheFresco = cacheDisponivel && idadeCache <= GOALS_CACHE_TTL_MS;

        if (metasMensaisAtual && !forcar) {
          renderizarMetas_(metasMensaisAtual);
          return;
        }

        if (!metasMensaisAtual && cacheDisponivel) {
          metasMensaisAtual = cache.resposta;
          renderizarMetas_(metasMensaisAtual);
          if (!cacheFresco && dashboardGoalsSubtitle) {
            dashboardGoalsSubtitle.textContent += ' Última atualização salva; conferindo dados atuais...';
          }
        }

        if (!navigator.onLine) {
          if (!cacheDisponivel && dashboardGoalsSubtitle) {
            dashboardGoalsSubtitle.textContent = 'Conecte-se à internet para atualizar as metas.';
          }
          return;
        }
        metasCarregando = true;
        try {
          const resposta = await apiRequest('config', { consulta: 'metas' }, 30000);
          metasMensaisAtual = resposta || {};
          gravarStorageJson_(GOALS_CACHE_STORAGE, { salvoEm: Date.now(), resposta: metasMensaisAtual });
          renderizarMetas_(metasMensaisAtual);
        } catch (erro) {
          if (cacheDisponivel && metasMensaisAtual) {
            renderizarMetas_(metasMensaisAtual);
            if (dashboardGoalsSubtitle) {
              dashboardGoalsSubtitle.textContent += ' Últimos dados válidos mantidos; atualização temporariamente indisponível.';
            }
          } else if (dashboardGoalsSubtitle) {
            dashboardGoalsSubtitle.textContent = 'Não foi possível atualizar as metas agora. O sistema tentará novamente na próxima atualização.';
          }
        } finally { metasCarregando = false; }
      }

      function abrirMetas_() {
        fecharMenuMais_();
        selecionarAbaMetas_('resumo');
        if (goalsModal) goalsModal.hidden = false;
        void carregarMetas_(true);
      }

      function dataHoraImpressaoMetas_() {
        try {
          return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short'
          }).format(new Date());
        } catch (erro) {
          return new Date().toLocaleString('pt-BR');
        }
      }

      async function imprimirOuSalvarMetas_() {
        if (!goalsModal || goalsModal.hidden || !metasMensaisAtual) {
          await avisarGpv_(
            'Abra as metas mensais antes de imprimir ou salvar o relatório.',
            'Metas mensais',
            { tom: 'warning' }
          );
          return;
        }

        const modo = await escolherOpcaoGpv_(
          'Escolha o conteúdo que deseja levar para a impressão ou para o PDF.',
          [
            {
              valor: 'resumo',
              titulo: 'Resumo mensal',
              subtitulo: 'Progresso geral e cartões das metas, como na tela Resumo.'
            },
            {
              valor: 'completo',
              titulo: 'Resumo + detalhes dos locais',
              subtitulo: 'Inclui também os registros contabilizados em cada categoria.'
            }
          ],
          'Imprimir / salvar metas'
        );

        if (!modo) return;

        const resumoEstavaOculto = Boolean(goalsSummaryPanel?.hidden);
        const detalhesEstavamOcultos = Boolean(goalsDetailsPanel?.hidden);
        const tituloAnterior = document.title;

        if (goalsPrintMeta) {
          goalsPrintMeta.textContent =
            `GPV — 3º Pelotão Viçosa • Gerado em ${dataHoraImpressaoMetas_()}`;
        }

        if (goalsSummaryPanel) goalsSummaryPanel.hidden = false;
        if (goalsDetailsPanel) goalsDetailsPanel.hidden = modo !== 'completo';

        goalsModal.dataset.printMode = modo;
        document.body.classList.add('printing-goals');

        const tituloMetas = String(goalsModalTitle?.textContent || 'Metas mensais').trim();
        document.title = `${tituloMetas} - GPV Viçosa`;

        let limpezaExecutada = false;
        const limparImpressao = () => {
          if (limpezaExecutada) return;
          limpezaExecutada = true;
          document.body.classList.remove('printing-goals');
          delete goalsModal.dataset.printMode;
          if (goalsSummaryPanel) goalsSummaryPanel.hidden = resumoEstavaOculto;
          if (goalsDetailsPanel) goalsDetailsPanel.hidden = detalhesEstavamOcultos;
          document.title = tituloAnterior;
        };

        window.addEventListener('afterprint', limparImpressao, { once: true });

        setTimeout(() => {
          window.addEventListener('focus', () => {
            setTimeout(limparImpressao, 250);
          }, { once: true });
        }, 700);

        setTimeout(() => {
          try {
            window.print();
          } catch (erro) {
            limparImpressao();
            avisarGpv_(
              'Não foi possível abrir o serviço de impressão deste aparelho.',
              'Impressão indisponível',
              { tom: 'warning' }
            );
          }
        }, 80);
      }

      function fecharMetas_() { if (goalsModal) goalsModal.hidden = true; }

      function lerStorageJson_(chave, fallback = {}) {
        try {
          const bruto = localStorage.getItem(chave);
          const obj = bruto ? JSON.parse(bruto) : fallback;
          return obj && typeof obj === 'object' ? obj : fallback;
        } catch (erro) { return fallback; }
      }

      function gravarStorageJson_(chave, valor) {
        try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
        catch (erro) { return false; }
      }

      function lerCacheSugestoesFiscalizacaoLocal_() {
        const item = lerStorageJson_(SUGGESTIONS_CACHE_STORAGE, null);
        if (!item || !Array.isArray(item.itens) || !item.resumo || !item.salvoEm) return null;
        if (Date.now() - Number(item.salvoEm || 0) > SUGGESTIONS_CACHE_TTL_MS) return null;
        return item;
      }

      function salvarCacheSugestoesFiscalizacaoLocal_(resposta) {
        if (!resposta || !Array.isArray(resposta.itens)) return;
        gravarStorageJson_(SUGGESTIONS_CACHE_STORAGE, {
          salvoEm: Date.now(),
          geradoEm: String(resposta.geradoEm || new Date().toISOString()),
          itens: resposta.itens,
          resumo: resposta.resumo || { total: resposta.itens.length, alta: 0, media: 0, acompanhamento: 0 }
        });
      }

      function aplicarCacheSugestoesFiscalizacaoLocal_(cache) {
        if (!cache || !Array.isArray(cache.itens)) return false;
        sugestoesFiscalizacao = ordenarSugestoesFiscalizacaoCronologicamente_(cache.itens);
        resumoSugestoesFiscalizacao = cache.resumo || { total: cache.itens.length, alta: 0, media: 0, acompanhamento: 0 };
        sugestoesFiscalizacaoGeradoEm = String(cache.geradoEm || '');
        sugestoesFiscalizacaoCarregadas = true;
        atualizarResumoSugestoesUi_();
        return true;
      }

      function rotuloAtualizacaoSugestoes_() {
        const cache = lerCacheSugestoesFiscalizacaoLocal_();
        const salvoEm = Number(cache?.salvoEm || 0);
        if (!salvoEm) return '';
        const minutos = Math.max(0, Math.floor((Date.now() - salvoEm) / 60000));
        if (minutos < 1) return 'atualizado agora';
        if (minutos === 1) return 'atualizado há 1 min';
        if (minutos < 60) return `atualizado há ${minutos} min`;
        return `atualizado às ${new Date(salvoEm).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}`;
      }

      function chaveCachePainel_(filtros, offset, limite) {
        return JSON.stringify({ filtros: filtros || {}, offset: Number(offset || 0), limite: Number(limite || 25) });
      }

      function lerCachePainel_(chave) {
        const mapa = lerStorageJson_(PANEL_CACHE_STORAGE, {});
        const item = mapa[chave];
        if (!item || !item.salvoEm || !item.resposta) return null;

        const idade = Math.max(0, Date.now() - Number(item.salvoEm));
        if (idade > PANEL_CACHE_STALE_MS) return null;

        return {
          ...item,
          idade,
          desatualizado: idade > PANEL_CACHE_TTL_MS
        };
      }

      function salvarCachePainel_(chave, resposta) {
        const mapa = lerStorageJson_(PANEL_CACHE_STORAGE, {});
        mapa[chave] = { salvoEm: Date.now(), resposta };
        const entradas = Object.entries(mapa).sort((a,b) => Number(b[1]?.salvoEm || 0) - Number(a[1]?.salvoEm || 0));
        gravarStorageJson_(PANEL_CACHE_STORAGE, Object.fromEntries(entradas.slice(0, 6)));
      }

      function lerCacheFicha_(chave) {
        const mapa = lerStorageJson_(RECORD_CACHE_STORAGE, {});
        const item = mapa[String(chave || '')];
        if (!item || !item.salvoEm || !item.registro) return null;
        if (Date.now() - Number(item.salvoEm) > RECORD_CACHE_TTL_MS) return null;
        return item;
      }

      function salvarCacheFicha_(chave, registro) {
        if (!chave || !registro) return;
        const mapa = lerStorageJson_(RECORD_CACHE_STORAGE, {});
        mapa[String(chave)] = { salvoEm: Date.now(), registro };
        const entradas = Object.entries(mapa).sort((a,b) => Number(b[1]?.salvoEm || 0) - Number(a[1]?.salvoEm || 0));
        gravarStorageJson_(RECORD_CACHE_STORAGE, Object.fromEntries(entradas.slice(0, 12)));
      }

      function limparCachesConsulta_() {
        try { localStorage.removeItem(PANEL_CACHE_STORAGE); } catch (erro) {}
        try { localStorage.removeItem(RECORD_CACHE_STORAGE); } catch (erro) {}
        try { localStorage.removeItem(GOALS_CACHE_STORAGE); } catch (erro) {}
        try { localStorage.removeItem(SUGGESTIONS_CACHE_STORAGE); } catch (erro) {}
        sugestoesFiscalizacaoCarregadas = false;
        sugestoesFiscalizacao = [];
        sugestoesFiscalizacaoGeradoEm = '';
        metasMensaisAtual = null;
      }

      async function preaquecerPainel_() {
        if (!navigator.onLine || recordsState.carregando || document.body.classList.contains('records-mode')) return;
        const filtros = { busca:'', cidade:'', demanda:'', sancao:'', tipo:'', vistoriador:'', periodo:'', prazoMulta:'' };
        const limite = 25;
        const chaveCache = chaveCachePainel_(filtros, 0, limite);
        if (lerCachePainel_(chaveCache)?.resposta) return;
        try {
          const resposta = await apiRequest('config', { consulta:'registros', filtros:{ ...filtros, offset:0, limite } }, 50000);
          salvarCachePainel_(chaveCache, resposta || {});
        } catch (erro) {}
      }

      function formatarMomentoPainel_(valor) {
        const data = valor ? new Date(valor) : null;
        if (!data || Number.isNaN(data.getTime())) return 'horário não identificado';
        return data.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      function registrarSucessoPainel_(resposta) {
        const registro = {
          em: new Date().toISOString(),
          total: Number(resposta?.total || 0)
        };
        gravarStorageJson_(PANEL_LAST_SUCCESS_STORAGE, registro);
        try { localStorage.removeItem(PANEL_LAST_ERROR_STORAGE); } catch (e) {}
        return registro.em;
      }

      function registrarFalhaPainel_(erro) {
        gravarStorageJson_(PANEL_LAST_ERROR_STORAGE, {
          em: new Date().toISOString(),
          codigo: String(erro?.code || ''),
          mensagem: String(erro?.message || 'Não foi possível atualizar o Painel.').slice(0, 500)
        });
      }

      function ultimaRespostaPainelEm_() {
        const item = lerRegistroDiagnostico_(PANEL_LAST_SUCCESS_STORAGE);
        const instante = item?.em ? new Date(item.em).getTime() : 0;
        return Number.isFinite(instante) ? instante : 0;
      }

      function cancelarConsultaPainelEmAndamento_(motivo = 'consulta substituída') {
        if (!recordsState.carregando && !recordsRequestController_) return false;
        recordsRequestSequencia_ += 1;
        try { recordsRequestController_?.abort(); } catch (e) {}
        recordsRequestController_ = null;
        recordsRequestStartedAt_ = 0;
        recordsState.carregando = false;
        recordsSearchPending = false;
        definirBuscaPainelEmAndamento_(false);
        if (recordsRefreshBtn) {
          recordsRefreshBtn.disabled = false;
          recordsRefreshBtn.classList.remove('is-loading');
          recordsRefreshBtn.removeAttribute('aria-busy');
        }
        atualizarPaginacao_();
        return Boolean(motivo);
      }

      function agendarAtualizacaoPainelAoRetornar_(motivo = 'retorno ao app', opcoes = {}) {
        if (!navigator.onLine || !authState.sessionToken) return;
        if (document.visibilityState !== 'visible' || !document.body.classList.contains('records-mode')) return;

        const forcar = opcoes.forcar === true;
        const ultimaResposta = ultimaRespostaPainelEm_();
        if (!forcar && ultimaResposta && Date.now() - ultimaResposta < PANEL_FOREGROUND_REFRESH_MS) return;

        clearTimeout(recordsForegroundRefreshTimer_);
        recordsForegroundRefreshTimer_ = setTimeout(() => {
          recordsForegroundRefreshTimer_ = null;
          if (!navigator.onLine || document.visibilityState !== 'visible') return;
          if (!document.body.classList.contains('records-mode')) return;
          void carregarRegistros_(true, { forcar: true, motivo });
        }, Math.max(80, Number(opcoes.atraso || 240)));
      }

      function iniciarAtualizacaoPeriodicaPainel_() {
        clearInterval(recordsPeriodicRefreshTimer_);
        recordsPeriodicRefreshTimer_ = setInterval(() => {
          if (!navigator.onLine || document.visibilityState !== 'visible') return;
          if (!document.body.classList.contains('records-mode')) return;
          const ultimaResposta = ultimaRespostaPainelEm_();
          if (ultimaResposta && Date.now() - ultimaResposta < PANEL_PERIODIC_REFRESH_MS) return;
          void carregarRegistros_(true, {
            substituirSeAntiga: true,
            silenciosa: true,
            motivo: 'atualização periódica'
          });
        }, PANEL_PERIODIC_REFRESH_MS);
      }

      function aplicarRespostaPainel_(resposta, opcoes = {}) {
        recordsState.itens = (Array.isArray(resposta?.itens) ? resposta.itens : []).slice(0, recordsState.limite);
        recordsState.total = Number(resposta?.total || 0);
        recordsState.totalPaginas = Math.max(1, Math.ceil(recordsState.total / recordsState.limite));
        recordsState.resumo = resposta?.resumo || null;
        if (recordsState.pagina > recordsState.totalPaginas) recordsState.pagina = recordsState.totalPaginas;

        const disponiveis = resposta?.filtrosDisponiveis || {};
        preencherSelectConsulta_(recordsCityFilter, disponiveis.cidades, 'Todos');
        preencherSelectConsulta_(recordsDemandFilter, disponiveis.demandas, 'Todas');
        preencherSelectConsulta_(recordsSanctionFilter, disponiveis.sancoes, 'Todas');
        preencherSelectConsulta_(recordsTypeFilter, disponiveis.tipos, 'Todas');
        preencherSelectConsulta_(recordsInspectorFilter, disponiveis.vistoriadores, 'Todos');
        preencherPeriodosConsulta_(disponiveis.anos);
        atualizarLinkPlanilha_(resposta?.planilhaUrl || '');
        atualizarKpis_(resposta?.resumo || {});
        void carregarMetas_(false);
        const chaveAindaVisivel = recordsState.itens.some(item => item.chave === recordsState.chaveSelecionada);
        if (!chaveAindaVisivel) recordsState.chaveSelecionada = '';
        renderizarRegistros_();
        atualizarPaginacao_();

        const filtrosAtivos = Object.values(filtrosConsultaAtuais_()).some(Boolean);
        const rotuloMulta = recordsState.prazoMulta === 'primeira'
          ? 'sujeito à 1ª multa'
          : (recordsState.prazoMulta === 'segunda' ? 'sujeito à 2ª multa' : '');
        const origemCache = opcoes.cache === true;
        recordsStatus.className = origemCache ? 'records-status cached' : 'records-status';
        if (origemCache) {
          const momentoCache = formatarMomentoPainel_(opcoes.salvoEm);
          recordsStatus.innerHTML = navigator.onLine
            ? `<strong>Dados salvos de ${momentoCache} exibidos.</strong> Conferindo informações mais recentes... <span class="records-freshness is-cached">Cache identificado</span>`
            : `<strong>Offline:</strong> exibindo dados salvos de ${momentoCache} neste aparelho. <span class="records-freshness is-cached">Sem consulta ao servidor</span>`;
          return;
        }
        const resumoConsulta = rotuloMulta
          ? `<strong>${recordsState.total}</strong> ${recordsState.total === 1 ? 'edificação' : 'edificações'} ${rotuloMulta}${recordsState.total === 1 ? '' : 's'}. Clique novamente no card para remover o filtro.`
          : (filtrosAtivos
            ? `<strong>${recordsState.total}</strong> resultado${recordsState.total === 1 ? '' : 's'} com os filtros atuais. Os indicadores acima representam o total da base.`
            : `<strong>${recordsState.total}</strong> registro${recordsState.total === 1 ? '' : 's'} na consulta. Mais recentes primeiro.`);
        recordsStatus.innerHTML = `${resumoConsulta} <span class="records-freshness is-live">Atualizado agora às ${new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</span>`;
      }

      function definirBuscaPainelEmAndamento_(ativa) {
        const ligada = Boolean(ativa);
        if (recordsSearchBox) {
          recordsSearchBox.classList.toggle('is-searching', ligada);
          recordsSearchBox.setAttribute('aria-busy', ligada ? 'true' : 'false');
        }
        if (recordsSearchActivity) recordsSearchActivity.hidden = !ligada;
      }

      async function carregarRegistros_(reiniciar = true, opcoes = {}) {
        if (recordsState.carregando) {
          const idadeConsulta = recordsRequestStartedAt_ ? Date.now() - recordsRequestStartedAt_ : 0;
          const substituir = opcoes.forcar === true ||
            (opcoes.substituirSeAntiga === true && idadeConsulta >= PANEL_REQUEST_STALE_MS);
          if (substituir) {
            cancelarConsultaPainelEmAndamento_(opcoes.motivo || 'atualização mais recente');
          } else {
            if (reiniciar && opcoes.silenciosa !== true) recordsSearchPending = true;
            return;
          }
        }
        if (reiniciar) recordsState.pagina = 1;

        const offset = (recordsState.pagina - 1) * recordsState.limite;
        const limiteApi = Math.max(10, recordsState.limite);
        const filtros = filtrosConsultaAtuais_();
        const buscaAtiva = Boolean(String(filtros.busca || '').trim());
        const chaveCache = chaveCachePainel_(filtros, offset, limiteApi);
        const cache = lerCachePainel_(chaveCache);
        if (cache?.resposta) aplicarRespostaPainel_(cache.resposta, { cache: true, salvoEm: cache.salvoEm });

        if (!navigator.onLine) {
          definirBuscaPainelEmAndamento_(false);
          if (!cache?.resposta) {
            recordsStatus.className = 'records-status error';
            recordsStatus.textContent = 'Sem internet e sem consulta recente salva neste aparelho.';
          }
          return;
        }

        recordsState.carregando = true;
        const requisicaoSequencia = ++recordsRequestSequencia_;
        const requestController = new AbortController();
        recordsRequestController_ = requestController;
        recordsRequestStartedAt_ = Date.now();
        if (recordsRefreshBtn) {
          recordsRefreshBtn.disabled = false;
          recordsRefreshBtn.classList.add('is-loading');
          recordsRefreshBtn.setAttribute('aria-busy', 'true');
        }
        atualizarPaginacao_();
        definirBuscaPainelEmAndamento_(buscaAtiva);

        if (buscaAtiva) {
          recordsStatus.className = 'records-status searching';
          recordsStatus.innerHTML = cache?.resposta
            ? '<strong>Resultados salvos exibidos.</strong> Buscando informações mais recentes...'
            : '<strong>Buscando registros...</strong> Consultando estabelecimento, CNPJ/CPF, PSCIP, endereço e nº do endereço.';
        } else if (!cache?.resposta) {
          recordsStatus.className = 'records-status loading';
          recordsStatus.innerHTML = `
            <div class="panel-loading-visual" role="status" aria-live="polite">
              <div class="panel-loading-icon" aria-hidden="true">
                <span class="panel-loading-sheet"></span>
                <span class="panel-loading-pen"></span>
              </div>
              <strong>Atualizando Painel Fiscalizatório...</strong>
              <small>Carregando dados do painel</small>
              <span class="panel-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            </div>`;
        }

        try {
          const resposta = await apiRequest('config', {
            consulta: 'registros',
            filtros: { ...filtros, offset, limite: limiteApi }
          }, 40000, { signal: requestController.signal });
          if (requisicaoSequencia !== recordsRequestSequencia_) return;
          salvarCachePainel_(chaveCache, resposta || {});
          registrarSucessoPainel_(resposta || {});
          aplicarRespostaPainel_(resposta || {});
          carregarResumoSugestoesFiscalizacao_().catch(() => {});
        } catch (erro) {
          if (requisicaoSequencia !== recordsRequestSequencia_ || erro?.code === 'REQUEST_CANCELLED') return;
          registrarFalhaPainel_(erro);
          if (cache?.resposta) {
            recordsStatus.className = 'records-status cached';
            const momentoCache = formatarMomentoPainel_(cache.salvoEm);
            recordsStatus.innerHTML = buscaAtiva
              ? `<strong>Serviço temporariamente instável.</strong> Resultados salvos de ${momentoCache} continuam visíveis; tente novamente em instantes.`
              : `<strong>Atualização temporariamente indisponível.</strong> Dados salvos de ${momentoCache} continuam visíveis e serão conferidos na próxima tentativa.`;
          } else {
            recordsStatus.className = 'records-status error';
            recordsStatus.textContent = erro?.message || (buscaAtiva ? 'Não foi possível concluir a busca.' : 'Não foi possível carregar o Painel Fiscalizatório.');
            if (!recordsState.itens.length) {
              recordsList.innerHTML = '<div class="records-empty">O painel não pôde ser carregado agora.</div>';
              recordsTableBody.innerHTML = '<tr><td colspan="9" class="records-table-empty">Não foi possível carregar os registros.</td></tr>';
            }
          }
        } finally {
          if (requisicaoSequencia === recordsRequestSequencia_) {
            recordsState.carregando = false;
            if (recordsRequestController_ === requestController) recordsRequestController_ = null;
            recordsRequestStartedAt_ = 0;
            if (recordsRefreshBtn) {
              recordsRefreshBtn.disabled = false;
              recordsRefreshBtn.classList.remove('is-loading');
              recordsRefreshBtn.removeAttribute('aria-busy');
            }
            definirBuscaPainelEmAndamento_(false);
            atualizarPaginacao_();

            if (recordsSearchPending) {
              recordsSearchPending = false;
              setTimeout(() => carregarRegistros_(true, { motivo: 'consulta pendente' }), 20);
            }
          }
        }
      }

      function fecharDetalheRegistro_(opcoes = {}) {
        if (!recordDetailScreen) return;
        const contextoRetorno = recordDetailReturnContext;
        recordDetailReturnContext = '';
        recordDetailScreen.classList.remove('show');
        recordDetailScreen.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('detail-open');
        recordDetailGroups.innerHTML = '';
        recordHistoryTimeline.innerHTML = '';
        recordHistoryPanel.hidden = true;
        recordDetailLoading.hidden = false;
        if (recordInfoscipHistoryPanel) recordInfoscipHistoryPanel.hidden = true;
        if (recordInfoscipHistoryText) recordInfoscipHistoryText.value = '';
        if (recordInfoscipCopyStatus) recordInfoscipCopyStatus.textContent = '';
        if (recordRedsReportPanel) recordRedsReportPanel.hidden = true;
        if (recordRedsReportText) recordRedsReportText.value = '';
        if (recordWhatsappPanel) recordWhatsappPanel.hidden = true;
        if (recordWhatsappPhoneInput) recordWhatsappPhoneInput.value = '';
        if (recordWhatsappStatus) recordWhatsappStatus.textContent = '';
        recordWhatsappRegistroAtual = null;
        recordStatusRegistroAtual = null;
        recordCorrectionRegistroAtual = null;
        recordCorrectionOriginal = new Map();
        if (recordCorrectionPanel) recordCorrectionPanel.hidden = true;
        if (recordInfoscipUpdatePanel) recordInfoscipUpdatePanel.hidden = true;
        fecharCorrecaoRegistro_();
        fecharAtualizacaoSituacaoInfoscip_();
        if (opcoes.restaurarContexto !== false && contextoRetorno === 'goals-details') {
          abrirMetas_();
          selecionarAbaMetas_('detalhes');
        }
      }

      function descricaoSituacaoPainel_(situacao) {
        const n = normalize(situacao);
        if (n === 'liberado') return 'Processo de liberação concluído';
        if (n === 'regularizado') return 'Fiscalização regularizada';
        if (n === 'advertencia') return 'Prazo de regularização em acompanhamento';
        if (n === 'autuado') return 'Fiscalização com irregularidade registrada';
        if (n === 'notificado') return 'Pendência técnica no fluxo de liberação';
        if (n === normalize('Pendente — multa em aberto')) return 'Vistoria encerrada com regularização/liberação pendente por multa';
        if (n === normalize('Pendente — conferir multa no INFOSCIP')) return 'Vistoria encerrada aguardando conferência de multa';
        return 'Situação registrada no processo';
      }

      function valorCampoFicha_(registro, ...rotulos) {
        const procurados = rotulos.map(normalize);
        const campos = Array.isArray(registro?.campos) ? registro.campos : [];
        for (const campo of campos) {
          const chave = normalize(campo?.rotulo || '');
          if (procurados.includes(chave)) return String(campo?.valor || '').trim();
        }
        return '';
      }

      function enderecoFicha_(registro) {
        const partes = [
          valorCampoFicha_(registro, 'Endereço do estabelecimento'),
          valorCampoFicha_(registro, 'Nº'),
          valorCampoFicha_(registro, 'Complemento'),
          valorCampoFicha_(registro, 'Bairro')
        ].filter(Boolean);
        const cidade = valorCampoFicha_(registro, 'Cidade');
        const endereco = partes.join(', ');
        return [endereco, cidade].filter(Boolean).join(' — ');
      }

      // V23.9.99ba — cópia individual de valores da Ficha/Histórico.
      // Copia somente o valor escolhido (CPF, RG, PSCIP, PF, REDS etc.),
      // sem montar texto agregado e sem alterar nenhum dado do processo.
      function botaoCopiarValorFichaHtml_(rotulo, valor, classeExtra = '') {
        const texto = String(valor == null ? '' : valor).trim();
        if (!texto || texto === '—') return '';
        return `<button type="button" class="record-copy-value-btn${classeExtra ? ` ${escapeAttr(classeExtra)}` : ''}" data-copy-field-value="${escapeAttr(texto)}" data-copy-field-label="${escapeAttr(rotulo || 'valor')}" title="Copiar ${escapeAttr(rotulo || 'valor')}" aria-label="Copiar ${escapeAttr(rotulo || 'valor')}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path></svg>
          <span class="record-copy-value-label">Copiar</span>
        </button>`;
      }

      async function copiarValorFicha_(botao) {
        if (!botao) return;
        const texto = String(botao.dataset.copyFieldValue || '').trim();
        const rotulo = String(botao.dataset.copyFieldLabel || 'Valor').trim();
        if (!texto) return;

        const copiarFallback = () => {
          const area = document.createElement('textarea');
          area.value = texto;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          area.style.pointerEvents = 'none';
          area.style.left = '-9999px';
          document.body.appendChild(area);
          area.select();
          area.setSelectionRange(0, area.value.length);
          let ok = false;
          try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
          area.remove();
          if (!ok) throw new Error('Não foi possível copiar.');
        };

        try {
          if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
          } else {
            copiarFallback();
          }

          clearTimeout(botao._copyFeedbackTimer);
          botao.classList.add('is-copied');
          botao.setAttribute('aria-label', `${rotulo} copiado`);
          botao.setAttribute('title', `${rotulo} copiado`);
          const label = botao.querySelector('.record-copy-value-label');
          if (label) label.textContent = 'Copiado';
          botao._copyFeedbackTimer = setTimeout(() => {
            botao.classList.remove('is-copied');
            botao.setAttribute('aria-label', `Copiar ${rotulo}`);
            botao.setAttribute('title', `Copiar ${rotulo}`);
            if (label) label.textContent = 'Copiar';
          }, 1300);
        } catch (erro) {
          console.warn('Falha ao copiar valor da Ficha:', erro?.message || erro);
          avisarGpv_('Não foi possível copiar este valor automaticamente. Tente novamente.', 'Copiar informação');
        }
      }

      document.addEventListener('click', event => {
        const botao = event.target.closest?.('[data-copy-field-value]');
        if (!botao) return;
        event.preventDefault();
        event.stopPropagation();
        void copiarValorFicha_(botao);
      });

      function montarGrupoFicha_(titulo, campos, classeExtra = '') {
        const validos = (campos || []).filter(item => item && item[1]);
        if (!validos.length) return '';
        return `<section class="record-detail-group${classeExtra ? ` ${escapeAttr(classeExtra)}` : ''}"><h3>${escapeHtml(titulo)}</h3><div class="record-detail-fields">${validos.map(([rotulo, valor]) => `<div class="record-detail-field"><label>${escapeHtml(rotulo)}</label><div class="record-detail-copy-row"><span class="record-detail-copy-value">${escapeHtml(valor)}</span>${botaoCopiarValorFichaHtml_(rotulo, valor)}</div></div>`).join('')}</div></section>`;
      }

      function resumoOperacionalFicha_(registro, situacao) {
        const itemAcao = {
          sancao: situacao,
          tipoVistoria: valorCampoFicha_(registro, 'Tipo de vistoria'),
          acaoSugerida: valorCampoFicha_(registro, 'Ação sugerida'),
          alertaPrazo: valorCampoFicha_(registro, 'Alerta de Prazo'),
          pendenciaDocumental: valorCampoFicha_(registro, 'Pendência documental'),
          diasAutuacao: valorCampoFicha_(registro, 'Dias desde a Autuação')
        };
        const acao = proximaAcaoPainel_(itemAcao);
        return [
          ['Situação atual', situacao || 'Sem situação'],
          ['Nº do PF', valorCampoFicha_(registro, 'Nº do PF')],
          ['Nº do PSCIP', valorPscipOperacionalFicha_(registro)],
          ['REDS', valorCampoFicha_(registro, 'REDS')],
          ['Nº do Auto', valorCampoFicha_(registro, 'Nº do Auto')],
          ['Data da vistoria', valorCampoFicha_(registro, 'Data e hora')],
          ['Situação de multa', valorCampoFicha_(registro, 'Situação de multa no INFOSCIP')],
          ['Multa conferida em', valorCampoFicha_(registro, 'Multa conferida em')],
          ['Multa conferida por', valorCampoFicha_(registro, 'Multa conferida por')],
          ['Prazo / Próxima ação', [acao.principal, acao.detalhe].filter(Boolean).join(' — ')]
        ];
      }

      function descricaoHistorico_(item) {
        const n = normalize(item?.sancao || '');
        let texto = '';
        if (n === 'autuado') texto = 'Irregularidades registradas na fiscalização. O responsável foi cientificado de que a autuação será formalmente comunicada por meio de correspondência enviada via Aviso de Recebimento (AR) ao endereço da edificação.';
        else if (n === 'advertencia') texto = 'Prazo de regularização em acompanhamento.';
        else if (n === 'notificado') texto = 'Pendências técnicas registradas para liberação.';
        else if (n === 'regularizado') texto = 'Fiscalização regularizada.';
        else if (n === 'liberado') texto = 'Processo de liberação concluído.';
        else if (n === normalize('Pendente — multa em aberto')) texto = 'Vistoria encerrada, porém a regularização/liberação permanece pendente por multa em aberto.';
        else if (n === normalize('Pendente — conferir multa no INFOSCIP')) texto = 'Vistoria encerrada, aguardando conferência da situação de multa no INFOSCIP.';
        else texto = 'Registro incluído no histórico do local.';

        const complementos = [
          item?.tipoVistoria,
          item?.demanda,
          item?.projeto ? `PSCIP ${projetoPscipOperacional_(item.projeto) || item.projeto}` : '',
          item?.pf ? `PF ${item.pf}` : '',
          item?.reds ? `REDS ${item.reds}` : ''
        ].filter(Boolean);
        return complementos.length ? `${texto} ${complementos.join(' · ')}` : texto;
      }

      function dadosCopiaveisHistorico_(item) {
        const documento = identificadorPainel_(item || {});
        const projeto = item?.projeto ? (projetoPscipOperacional_(item.projeto) || String(item.projeto || '').trim()) : '';
        const endereco = [
          String(item?.endereco || '').trim(),
          String(item?.numero || '').trim(),
          String(item?.bairro || '').trim(),
          String(item?.cidade || '').trim()
        ].filter(Boolean).join(', ');
        return [
          ['Data', formatarDataPainel_(item?.carimbo)],
          [documento.rotulo, documento.valor && documento.valor !== '—' ? documento.valor : ''],
          [projeto && normalizarProcessoAntigo_(projeto) ? 'Processo antigo' : 'PSCIP', projeto],
          ['Nº do PF', item?.pf],
          ['REDS', item?.reds],
          ['Endereço', endereco]
        ].filter(([, valor]) => String(valor == null ? '' : valor).trim() && String(valor).trim() !== '—');
      }

      function renderizarHistorico_(historico) {
        const itens = Array.isArray(historico) ? historico : [];
        if (!itens.length) {
          recordHistoryPanel.hidden = true;
          return;
        }
        recordHistoryPanel.hidden = false;
        recordHistoryCount.textContent = `${itens.length} registro${itens.length === 1 ? '' : 's'}`;
        recordHistoryTimeline.innerHTML = itens.map(item => {
          const titulo = item.sancao || item.tipoVistoria || item.demanda || 'Vistoria realizada';
          const dadosCopiaveis = dadosCopiaveisHistorico_(item);
          const atalhos = dadosCopiaveis.length
            ? `<div class="history-copy-grid">${dadosCopiaveis.map(([rotulo, valor]) => `<div class="history-copy-item"><span>${escapeHtml(rotulo)}</span><strong>${escapeHtml(valor)}</strong>${botaoCopiarValorFichaHtml_(rotulo, valor, 'history-copy-btn')}</div>`).join('')}</div>`
            : '';
          return `<article class="history-item ${classeStatus_(item.sancao)}">
            <div class="history-marker" aria-hidden="true"></div>
            <div class="history-body"><time>${escapeHtml(formatarDataPainel_(item.carimbo))}</time><strong>${escapeHtml(titulo)}</strong><p>${escapeHtml(descricaoHistorico_(item))}</p>${atalhos}</div>
          </article>`;
        }).join('');
      }


      function renderizarAuditoriaRegistro_(auditoria) {
        const itens = Array.isArray(auditoria) ? auditoria : [];
        if (!recordAuditPanel || !recordAuditList || !recordAuditCount) return;
        if (!itens.length) {
          recordAuditPanel.hidden = true;
          recordAuditList.innerHTML = '';
          return;
        }
        recordAuditPanel.hidden = false;
        recordAuditCount.textContent = `${itens.length} evento${itens.length === 1 ? '' : 's'}`;
        recordAuditList.innerHTML = itens.map(item => {
          const autor = [item.usuario, item.dispositivo].filter(Boolean).join(' • ');
          const mudanca = item.campo
            ? `${item.campo}${item.valorAnterior || item.novoValor ? `: ${item.valorAnterior || '—'} → ${item.novoValor || '—'}` : ''}`
            : '';
          return `<article class="record-audit-item">
            <strong>${escapeHtml(item.acao || 'Alteração')}</strong>
            <span>${escapeHtml([item.dataHora, autor, item.origem].filter(Boolean).join(' • '))}</span>
            ${mudanca ? `<p>${escapeHtml(mudanca)}</p>` : ''}
            ${item.observacao ? `<p>${escapeHtml(item.observacao)}</p>` : ''}
          </article>`;
        }).join('');
      }

      const RELATORIOS_REDS_LIBERACAO = Object.freeze({
        liberado: {
          titulo: 'Liberação de AVCB — sem pendência',
          texto: `COM BASE NA LEI ESTADUAL Nº 14.130/2001 E NO DECRETO ESTADUAL Nº 47.998/2020, FOI REALIZADA VISTORIA PARA LIBERAÇÃO DO AVCB DA EDIFICAÇÃO REGISTRADA NESTE REDS, CONFORME PSCIP Nº {{PSCIP}}.

DURANTE A VISTORIA, A GUARNIÇÃO BM CONSTATOU QUE AS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO ESTAVAM INSTALADAS EM CONFORMIDADE COM O PROJETO APROVADO, NÃO SENDO VERIFICADAS IRREGULARIDADES.

DIANTE DISSO, A EDIFICAÇÃO FOI APROVADA EM VISTORIA FINAL, SENDO LIBERADA A EMISSÃO DO AVCB.

O RESPONSÁVEL FOI ORIENTADO A MANTER AS MEDIDAS DE SEGURANÇA EM CONDIÇÕES DE USO E A COMUNICAR AO CBMMG QUALQUER ALTERAÇÃO NO LAYOUT, USO OU OCUPAÇÃO DA EDIFICAÇÃO, MEDIANTE ATUALIZAÇÃO DO PSCIP, SOB PENA DAS SANÇÕES PREVISTAS NA LEI Nº 14.130/2001.`
        },
        liberadoPendencia: {
          titulo: 'Liberação de AVCB — com pendência documental',
          texto: `COM BASE NA LEI Nº 14.130/2001, E RESPALDADO NO DECRETO Nº 47.998, DE 1º DE JULHO DE 2020, E NO PSCIP (PROJETO DE PREVENÇÃO CONTRA INCÊNDIO E PÂNICO) Nº {{PSCIP}}, FOI PROCEDIDA A VISTORIA DE LIBERAÇÃO E EMISSÃO DE AVCB DA EDIFICAÇÃO EM APREÇO, REGISTRADA NESTE REDS.

NO MOMENTO DA VISTORIA, A GUARNIÇÃO BM CONSTATOU QUE O SISTEMA PREVENTIVO DE COMBATE A INCÊNDIO E PÂNICO ENCONTRAVA-SE INSTALADO EM CONFORMIDADE COM O SEU REFERIDO PROCESSO. COMO RESULTADO, HOUVE APROVAÇÃO NA VISTORIA FINAL.

FOI REITERADO AO RESPONSÁVEL PELO USO QUE QUALQUER ALTERAÇÃO NO LAYOUT DA EDIFICAÇÃO, OU NO USO E OCUPAÇÃO, QUE COMPROMETA AS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO PREVISTAS PARA A EDIFICAÇÃO, DEVERÁ SER ACOMPANHADA DA DEVIDA ATUALIZAÇÃO DO PSCIP JUNTO AO CBMMG.

O RESPONSÁVEL FOI ORIENTADO A MANTER, EM CONDIÇÕES PERMANENTES DE USO, O SISTEMA PREVENTIVO DE COMBATE A INCÊNDIO E PÂNICO DA EDIFICAÇÃO E DA ÁREA DE RISCO. CASO DEIXE DE FAZÊ-LO, INCORRERÁ NAS SANÇÕES PREVISTAS NA LEI ESTADUAL Nº 14.130/2001.

OBS.: DURANTE A VISTORIA FORAM IDENTIFICADAS PENDÊNCIAS DOCUMENTAIS, DEVIDAMENTE REGISTRADAS NO SISTEMA INFOSCIP. A EMISSÃO DO AVCB ESTÁ CONDICIONADA À REGULARIZAÇÃO DESSAS PENDÊNCIAS.`
        },
        parcial: {
          titulo: 'Vistoria parcial para liberação e emissão de AVCB',
          texto: `EM ATENDIMENTO À SOLICITAÇÃO, COMPARECEMOS AO ENDEREÇO CITADO NESTE REDS PARA REALIZAÇÃO DE VISTORIA PARCIAL DE LIBERAÇÃO E EMISSÃO DE AVCB.

IN LOCO, VERIFICOU-SE UMA EDIFICAÇÃO QUE POSSUI PROCESSO DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO SOB O Nº {{PSCIP}}.

NO MOMENTO DA VISTORIA, A GUARNIÇÃO BM CONSTATOU QUE O SISTEMA PREVENTIVO DE COMBATE A INCÊNDIO E PÂNICO ENCONTRAVA-SE INSTALADO EM CONFORMIDADE COM O SEU REFERIDO PROCESSO.

DIANTE DO EXPOSTO, E RESPALDADO NO ARTIGO 2º DA LEI ESTADUAL Nº 14.130/2001 (QUE DISPÕE SOBRE A PREVENÇÃO CONTRA INCÊNDIO E PÂNICO NO ESTADO DE MINAS GERAIS), ESTA EDIFICAÇÃO VISTORIADA FOI LIBERADA PARCIALMENTE PELO CBMMG, SOMENTE {{AREA_PARCIAL_DESC}} DE {{AREA_PARCIAL}} M², CONFORME SOLICITAÇÃO DO RESPONSÁVEL TÉCNICO NO INFOSCIP.

ORIENTAMOS O RESPONSÁVEL QUE QUALQUER ALTERAÇÃO NO LAYOUT DA EDIFICAÇÃO OU NO USO E OCUPAÇÃO, QUE COMPROMETA AS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO PREVISTAS PARA A EDIFICAÇÃO, DEVERÁ SER COMUNICADA AO CBMMG COM A DEVIDA ATUALIZAÇÃO DO PSCIP.

O RESPONSÁVEL FOI AINDA ORIENTADO A MANTER, EM CONDIÇÕES PERMANENTES DE USO, O SISTEMA PREVENTIVO DE COMBATE A INCÊNDIO NA EDIFICAÇÃO E, CASO DEIXE DE FAZÊ-LO, INCORRERÁ NAS SANÇÕES PREVISTAS NA LEI ESTADUAL Nº 14.130/2001.`
        },
        notificado: {
          titulo: 'Notificado em vistoria de liberação',
          texto: `EM ATENDIMENTO À SOLICITAÇÃO DE VISTORIA FINAL PARA EMISSÃO DO AUTO DE VISTORIA DO CORPO DE BOMBEIROS (AVCB), DESLOCAMOS ATÉ O ENDEREÇO INFORMADO NESTE REDS. NO LOCAL TRATA-SE DE EDIFICAÇÃO VINCULADA AO PSCIP Nº {{PSCIP}}.

DURANTE A VISTORIA, FORAM CONSTATADAS IRREGULARIDADES NA EXECUÇÃO DAS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO, EM DESACORDO COM O PROJETO APROVADO. AS NÃO CONFORMIDADES IDENTIFICADAS FORAM LANÇADAS NO SISTEMA INFOSCIP. EM RAZÃO DAS IRREGULARIDADES VERIFICADAS, NÃO FOI POSSÍVEL EMITIR O AVCB.

O RESPONSÁVEL PODERÁ SANAR AS IRREGULARIDADES E SOLICITAR NOVA VISTORIA, BEM COMO APRESENTAR PEDIDO DE RECONSIDERAÇÃO DE ATO, NOS TERMOS DO ART. 16 DO DECRETO ESTADUAL Nº 47.998/2020, CABENDO RECURSO CONFORME ART. 17 DO MESMO DECRETO.

PARA ESCLARECIMENTOS, O GPV DO 3º PELOTÃO BM/VIÇOSA ESTÁ SEDIADO NA CASA Nº 38, VILA GIANNETTI – UFV – CENTRO, VIÇOSA/MG. TEL.: (31) 3612-3894. E-MAIL: VICOSA.GPV@BOMBEIROS.MG.GOV.BR.`
        }
      });

      const RELATORIOS_REDS_FISCALIZACAO = Object.freeze({
        ddu: {
          titulo: 'DDU — fiscalização autuada',
          texto: `EM ATENDIMENTO AO DISQUE DENÚNCIA UNIFICADO (DDU), PROTOCOLO: {{DDU}}, COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, NOS TERMOS DO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E DO ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE VISTORIA DE FISCALIZAÇÃO VINCULADA AO PROCESSO FISCALIZATÓRIO Nº {{PF}}, FOI CONSTATADO QUE A EDIFICAÇÃO APRESENTA IRREGULARIDADES (NÃO POSSUI AVCB), CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO DECRETO ESTADUAL Nº 47.998/2020 E DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG, TENDO SIDO EMITIDO, NO SISTEMA INFOSCIP, O AUTO DE INFRAÇÃO ADMINISTRATIVA Nº {{AUTO}}.

O RESPONSÁVEL FOI ORIENTADO SOBRE A NECESSIDADE DE REGULARIZAÇÃO, E CIENTIFICADO DE QUE A AUTUAÇÃO SERÁ FORMALMENTE COMUNICADA POR MEIO DE CORRESPONDÊNCIA ENVIADA VIA AVISO DE RECEBIMENTO (AR) AO ENDEREÇO DA EDIFICAÇÃO.`
        },
        brigadaVencida: {
          titulo: 'Fiscalização — brigada vencida',
          texto: `EM AÇÃO FISCALIZADORA, COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, NOS TERMOS DO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E DO ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, FOI CONSTATADO QUE A EDIFICAÇÃO APRESENTA IRREGULARIDADES (NÃO POSSUI CERTIFICADO VÁLIDO DE BRIGADA DE INCÊNDIO), AS QUAIS FORAM REGISTRADAS NO PROCESSO FISCALIZATÓRIO Nº {{PF}}, CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG, TENDO SIDO EMITIDO, NO SISTEMA INFOSCIP, O AUTO DE INFRAÇÃO ADMINISTRATIVA Nº {{AUTO}}.

O RESPONSÁVEL FOI ORIENTADO SOBRE A NECESSIDADE DE REGULARIZAÇÃO, E CIENTIFICADO DE QUE A AUTUAÇÃO SERÁ FORMALMENTE COMUNICADA POR MEIO DE CORRESPONDÊNCIA ENVIADA VIA AVISO DE RECEBIMENTO (AR) AO ENDEREÇO DA EDIFICAÇÃO.`
        },
        renovacaoAvcb: {
          titulo: 'Fiscalização — Renovação AVCB',
          texto: `COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, CONFORME PREVISTO NO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E NO ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, CONSTATOU-SE UMA EDIFICAÇÃO CLASSIFICADA NA OCUPAÇÃO/DIVISÃO {{OCUPACAO}}. VERIFICOU-SE, IN LOCO, QUE A EDIFICAÇÃO POSSUI PSCIP Nº {{PSCIP}} E QUE O RESPECTIVO AUTO DE VISTORIA DO CORPO DE BOMBEIROS (AVCB) FOI RENOVADO EM {{DATA_RENOVACAO_AVCB}}.

RESSALTAMOS QUE, NO MOMENTO DA VISTORIA, AS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO ENCONTRAVAM-SE DEVIDAMENTE INSTALADAS E EM CONFORMIDADE COM O PROJETO APROVADO E LIBERADO PELO CBMMG.`
        },
        avcbVencido: {
          titulo: 'Fiscalização — AVCB vencido',
          texto: `EM AÇÃO FISCALIZADORA, FOI REALIZADA VISTORIA NO ENDEREÇO MENCIONADO NESTE RELATÓRIO, NOS TERMOS DO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E DO ITEM 5.1 DA IT 45/2025.

DURANTE A VISTORIA, CONSTATOU-SE QUE A EDIFICAÇÃO FUNCIONA SEM AVCB VÁLIDO JUNTO AO CBMMG, UMA VEZ QUE O AVCB SE ENCONTRA COM PRAZO DE VALIDADE EXPIRADO. A IRREGULARIDADE FOI REGISTRADA NO PROCESSO FISCALIZATÓRIO Nº {{PF}}, SENDO EMITIDO O AUTO DE INFRAÇÃO ADMINISTRATIVA Nº {{AUTO}}, NO SISTEMA INFOSCIP.

O RESPONSÁVEL FOI ORIENTADO SOBRE A NECESSIDADE DE REGULARIZAÇÃO, E CIENTIFICADO DE QUE A AUTUAÇÃO SERÁ FORMALMENTE COMUNICADA POR MEIO DE CORRESPONDÊNCIA ENVIADA VIA AVISO DE RECEBIMENTO (AR) AO ENDEREÇO DA EDIFICAÇÃO.`
        },
        acessoriaLicenciado: {
          titulo: 'Vistoria Acessória — regularizada — local possui licenciamento',
          texto: `COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA ACESSÓRIA, CONFORME PREVISTO NO ITEM 6.4.2 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, CONSTATOU-SE QUE AS IRREGULARIDADES APONTADAS NO PROCESSO FISCALIZATÓRIO Nº {{PF}} FORAM SANADAS. A EDIFICAÇÃO POSSUI {{DOCUMENTO_LICENCA_NOME}} Nº {{PSCIP}}, E NO MOMENTO DA VISTORIA AS MEDIDAS DE SEGURANÇA SE ENCONTRAVAM EM CONFORMIDADE COM A LEGISLAÇÃO VIGENTE.`
        },
        acessoriaDispensado: {
          titulo: 'Vistoria Acessória — regularizada — local dispensado de licenciamento',
          texto: `COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA ACESSÓRIA, CONFORME PREVISTO NO ITEM 6.4.2 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, CONSTATOU-SE QUE AS IRREGULARIDADES APONTADAS NO PROCESSO FISCALIZATÓRIO Nº {{PF}} FORAM SANADAS. A EDIFICAÇÃO ENQUADRA-SE COMO DISPENSADA DE LICENCIAMENTO JUNTO AO CBMMG E POSSUI AS MEDIDAS DE SEGURANÇA EM CONFORMIDADE COM A LEGISLAÇÃO VIGENTE.`
        },
        comPscipSemAvcb: {
          titulo: 'Fiscalização — Autuado — com PSCIP — sem AVCB',
          texto: `COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, CONFORME PREVISTO NO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, VINCULADA AO PROCESSO FISCALIZATÓRIO Nº {{PF}}, CONSTATAMOS UMA EDIFICAÇÃO COM OCUPAÇÕES/DIVISÕES {{OCUPACAO}}, COM ÁREA TOTAL CONSTRUÍDA DE {{AREA}} M².

VERIFICAMOS IN LOCO QUE A EDIFICAÇÃO POSSUI PSCIP Nº {{PSCIP}}, COM A SITUAÇÃO ATUAL DE {{SITUACAO_PSCIP}}; CONTUDO AINDA NÃO POSSUI O AVCB (AUTO DE VISTORIA DO CORPO DE BOMBEIROS), CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG, TENDO SIDO EMITIDO, NO SISTEMA INFOSCIP, O AUTO DE INFRAÇÃO ADMINISTRATIVA Nº {{AUTO}}.

O RESPONSÁVEL FOI ORIENTADO SOBRE A NECESSIDADE DE REGULARIZAÇÃO, E CIENTIFICADO DE QUE A AUTUAÇÃO SERÁ FORMALMENTE COMUNICADA POR MEIO DE CORRESPONDÊNCIA ENVIADA VIA AVISO DE RECEBIMENTO (AR) AO ENDEREÇO DA EDIFICAÇÃO.`
        },
        eventoDeclaratorioConforme: {
          titulo: 'Fiscalização — evento declaratório conforme',
          texto: `COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, CONFORME PREVISTO NO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

NO LOCAL, CONSTATOU-SE UM EVENTO DE {{EVENTO_RISCO}} – Nº {{EVENTO_DECLARACAO}}, INTITULADO {{EVENTO_NOME}}, ORGANIZADO POR {{EVENTO_ORGANIZADOR}}, CPF/CNPJ Nº {{EVENTO_DOCUMENTO}}.

IN LOCO, VERIFICAMOS QUE O LOCAL ONDE SERÁ REALIZADO O EVENTO ESTÁ DE ACORDO COM A DECLARAÇÃO REALIZADA VIA INFOSCIP. O RESPONSÁVEL PELO EVENTO TEVE CIÊNCIA DE QUE DEVERÁ MANTER AS MEDIDAS DE PREVENÇÃO E COMBATE A INCÊNDIO E PÂNICO DO REFERIDO EVENTO EM PERMANENTES CONDIÇÕES DE USO, BEM COMO TODAS AS SAÍDAS DE EMERGÊNCIA DESTRANCADAS E DESOBSTRUÍDAS DURANTE TODA A REALIZAÇÃO DO EVENTO.

O RESPONSÁVEL FOI INFORMADO, TAMBÉM, DE QUE DEVERÁ RESPEITAR A CAPACIDADE MÁXIMA DE PÚBLICO INFORMADA NA DECLARAÇÃO EMITIDA NO INFOSCIP E, CASO DEIXE DE FAZÊ-LO, ESTARÁ SUJEITO ÀS MEDIDAS E SANÇÕES PREVISTAS NA LEI ESTADUAL Nº 14.130/2001, NO DECRETO ESTADUAL Nº 47.998/2020 E NA INSTRUÇÃO TÉCNICA Nº 45/2025.

PARA DÚVIDAS OU ESCLARECIMENTOS EM RELAÇÃO AO PROCEDIMENTO DURANTE A VISTORIA, O GRUPAMENTO DE PREVENÇÃO E VISTORIA DO 3º PELOTÃO BM/VIÇOSA FICA SEDIADO NA CASA Nº 38, VILA GIANNETTI – UFV – CENTRO, VIÇOSA – MG. TEL.: (31) 3612-3894. E-MAIL: VICOSA.GPV@BOMBEIROS.MG.GOV.BR.`
        },
        irregular: {
          titulo: 'Fiscalização — irregularidade / autuação',
          texto: `EM AÇÃO FISCALIZADORA, COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, NOS TERMOS DO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E DO ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, FOI CONSTATADO QUE A EDIFICAÇÃO APRESENTA IRREGULARIDADES, AS QUAIS FORAM REGISTRADAS NO PROCESSO FISCALIZATÓRIO Nº {{PF}}, CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG, TENDO SIDO EMITIDO, NO SISTEMA INFOSCIP, O AUTO DE INFRAÇÃO ADMINISTRATIVA Nº {{AUTO}}.

O RESPONSÁVEL FOI CIENTIFICADO DE QUE A AUTUAÇÃO SERÁ FORMALMENTE COMUNICADA POR MEIO DE CORRESPONDÊNCIA ENVIADA VIA AVISO DE RECEBIMENTO (AR) AO ENDEREÇO DA EDIFICAÇÃO.`
        },
        semAvcb: {
          titulo: 'Fiscalização — sem AVCB/CLCB',
          texto: `EM AÇÃO FISCALIZADORA, COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, NOS TERMOS DO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E DO ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, FOI CONSTATADO QUE A EDIFICAÇÃO NÃO POSSUI AVCB/CLCB E APRESENTA IRREGULARIDADES QUANTO ÀS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO. AS IRREGULARIDADES FORAM REGISTRADAS NO PROCESSO FISCALIZATÓRIO Nº {{PF}}.

O RESPONSÁVEL FOI ORIENTADO QUANTO À NECESSIDADE DE REGULARIZAÇÃO DA EDIFICAÇÃO JUNTO AO CBMMG.`
        },
        regularizado: {
          titulo: 'Fiscalização — regularizado com AVCB/CLCB',
          texto: `COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO.

VERIFICOU-SE QUE A EDIFICAÇÃO POSSUI {{LICENCA}} VÁLIDO{{PSCIP_TRECHO}} E QUE, NO MOMENTO DA VISTORIA, AS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO ENCONTRAVAM-SE INSTALADAS EM CONFORMIDADE COM A LEGISLAÇÃO E COM O PROJETO APROVADO.

O RESPONSÁVEL FOI ORIENTADO A MANTER AS MEDIDAS DE SEGURANÇA EM CONDIÇÕES PERMANENTES DE USO E A COMUNICAR AO CBMMG EVENTUAIS ALTERAÇÕES DE LAYOUT, USO OU OCUPAÇÃO.

A EDIFICAÇÃO ENCONTRA-SE REGULARIZADA JUNTO AO CBMMG.`
        },
        dispensado: {
          titulo: 'Fiscalização — dispensado de licenciamento / regular',
          texto: `COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO.

IN LOCO, CONSTATOU-SE QUE A EDIFICAÇÃO SE ENQUADRA COMO DISPENSADA DE LICENCIAMENTO. NO MOMENTO DA VISTORIA, O SISTEMA PREVENTIVO ENCONTRAVA-SE EM CONFORMIDADE COM A LEGISLAÇÃO VIGENTE; PORTANTO, A EDIFICAÇÃO ENCONTRA-SE REGULARIZADA JUNTO AO CBMMG.

O RESPONSÁVEL FOI ORIENTADO A MANTER AS MEDIDAS DE SEGURANÇA EM CONDIÇÕES PERMANENTES DE USO E A REGULARIZAR EVENTUAIS ALTERAÇÕES DE LAYOUT, USO OU OCUPAÇÃO.`
        },
        localFechado: {
          titulo: 'Fiscalização — local fechado / vistoria não realizada',
          texto: `COMPARECEMOS AO ENDEREÇO CITADO NESTE REDS PARA REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO.

ENTRETANTO, COMO O ESTABELECIMENTO ENCONTRAVA-SE FECHADO E/OU NÃO FOI LOCALIZADO RESPONSÁVEL PARA ACOMPANHAR A GUARNIÇÃO, NÃO FOI POSSÍVEL REALIZAR A VISTORIA.

UMA NOVA TENTATIVA DE VISTORIA SERÁ REALIZADA OPORTUNAMENTE.`
        }
      });

      // Textos próprios para o campo Histórico do INFOSCIP Fiscalização.
      // São objetivos e, por definição operacional, não exibem números de
      // PSCIP, DDU, Processo Fiscalizatório ou Auto de Infração. Os relatórios completos do REDS
      // permanecem independentes e inalterados.
      const HISTORICOS_INFOSCIP_FISCALIZACAO = Object.freeze({
        ddu: {
          titulo: 'DDU — fiscalização autuada',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA EM ATENDIMENTO A DEMANDA RECEBIDA PELO DDU. CONSTATADO QUE A EDIFICAÇÃO NÃO POSSUI AVCB/CLCB VÁLIDO, CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG. RESPONSÁVEL ORIENTADO QUANTO À NECESSIDADE DE REGULARIZAÇÃO.`
        },
        brigadaVencida: {
          titulo: 'Fiscalização — brigada vencida',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA. CONSTATADO QUE A EDIFICAÇÃO NÃO POSSUI CERTIFICADO VÁLIDO DE BRIGADA DE INCÊNDIO, CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG. RESPONSÁVEL ORIENTADO QUANTO À NECESSIDADE DE REGULARIZAÇÃO.`
        },
        renovacaoAvcb: {
          titulo: 'Fiscalização — Renovação AVCB',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA. CONSTATADO QUE A EDIFICAÇÃO POSSUI AVCB RENOVADO EM {{DATA_RENOVACAO_AVCB}} E QUE AS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO ENCONTRAVAM-SE INSTALADAS EM CONFORMIDADE COM O PROJETO APROVADO.`
        },
        avcbVencido: {
          titulo: 'Fiscalização — AVCB vencido',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA. CONSTATADO QUE A EDIFICAÇÃO FUNCIONA COM AVCB/CLCB VENCIDO, CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG. RESPONSÁVEL ORIENTADO QUANTO À RENOVAÇÃO DO LICENCIAMENTO.`
        },
        acessoriaLicenciado: {
          titulo: 'Vistoria Acessória — regularizada — com licenciamento',
          texto: `VISTORIA ACESSÓRIA REALIZADA PARA VERIFICAÇÃO DAS IRREGULARIDADES ANTERIORMENTE APONTADAS. CONSTATADO QUE AS IRREGULARIDADES FORAM SANADAS. A EDIFICAÇÃO POSSUI {{DOCUMENTO_LICENCA_NOME}} VÁLIDO E ENCONTRA-SE REGULARIZADA JUNTO AO CBMMG.`
        },
        acessoriaDispensado: {
          titulo: 'Vistoria Acessória — regularizada — dispensada de licenciamento',
          texto: `VISTORIA ACESSÓRIA REALIZADA PARA VERIFICAÇÃO DAS IRREGULARIDADES ANTERIORMENTE APONTADAS. CONSTATADO QUE AS IRREGULARIDADES FORAM SANADAS. A EDIFICAÇÃO ENQUADRA-SE COMO DISPENSADA DE LICENCIAMENTO, POSSUI AS MEDIDAS DE SEGURANÇA APLICÁVEIS E ENCONTRA-SE REGULARIZADA JUNTO AO CBMMG.`
        },
        comPscipSemAvcb: {
          titulo: 'Fiscalização — com PSCIP — sem AVCB',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA. CONSTATADO QUE A EDIFICAÇÃO POSSUI PSCIP NA SITUAÇÃO {{SITUACAO_PSCIP}}, PORÉM AINDA NÃO POSSUI AVCB/CLCB. CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG.`
        },
        eventoDeclaratorioConforme: {
          titulo: 'Fiscalização — evento declaratório conforme',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA NO EVENTO {{EVENTO_NOME}}, DECLARAÇÃO INFOSCIP Nº {{EVENTO_DECLARACAO}}, CLASSIFICADO COMO {{EVENTO_RISCO}}. CONSTATADO QUE O LOCAL E AS MEDIDAS DE SEGURANÇA ESTÃO DE ACORDO COM A DECLARAÇÃO. O RESPONSÁVEL FOI ORIENTADO A MANTER AS SAÍDAS DE EMERGÊNCIA DESOBSTRUÍDAS E A RESPEITAR A CAPACIDADE MÁXIMA DE PÚBLICO INFORMADA.`
        },
        irregular: {
          titulo: 'Fiscalização — irregularidade / autuação',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA. FORAM CONSTATADAS IRREGULARIDADES NAS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO, CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG. O RESPONSÁVEL FOI ORIENTADO QUANTO À NECESSIDADE DE REGULARIZAÇÃO.`
        },
        semAvcb: {
          titulo: 'Fiscalização — sem AVCB/CLCB',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA. CONSTATADO QUE A EDIFICAÇÃO NÃO POSSUI AVCB/CLCB E APRESENTA IRREGULARIDADES NAS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO, CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA, NOS TERMOS DO ITEM 5.2 DA INSTRUÇÃO TÉCNICA Nº 45 (1ª EDIÇÃO) DO CBMMG. RESPONSÁVEL ORIENTADO QUANTO À REGULARIZAÇÃO.`
        },
        regularizado: {
          titulo: 'Fiscalização — regularizada com AVCB/CLCB',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA. CONSTATADO QUE A EDIFICAÇÃO POSSUI AVCB/CLCB VÁLIDO E QUE AS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO ESTÃO EM CONFORMIDADE COM O LICENCIAMENTO. A EDIFICAÇÃO ENCONTRA-SE REGULARIZADA JUNTO AO CBMMG.`
        },
        dispensado: {
          titulo: 'Fiscalização — dispensada de licenciamento / regular',
          texto: `VISTORIA DE FISCALIZAÇÃO REALIZADA. CONSTATADO QUE A EDIFICAÇÃO ENQUADRA-SE COMO DISPENSADA DE LICENCIAMENTO E POSSUI AS MEDIDAS DE SEGURANÇA APLICÁVEIS EM CONFORMIDADE COM A LEGISLAÇÃO VIGENTE. A EDIFICAÇÃO ENCONTRA-SE REGULARIZADA JUNTO AO CBMMG.`
        },
        localFechado: {
          titulo: 'Fiscalização — local fechado / vistoria não realizada',
          texto: `COMPARECIMENTO REALIZADO PARA VISTORIA DE FISCALIZAÇÃO. O ESTABELECIMENTO ENCONTRAVA-SE FECHADO E/OU NÃO FOI LOCALIZADO RESPONSÁVEL PARA ACOMPANHAR A VISTORIA, IMPOSSIBILITANDO SUA REALIZAÇÃO. UMA NOVA TENTATIVA SERÁ REALIZADA OPORTUNAMENTE.`
        }
      });

      const REDS_TEMPLATE_CATALOG = Object.freeze([
        { id: 'liberacao.liberado', grupo: 'Liberação', grupoId: 'liberacao', chave: 'liberado', titulo: RELATORIOS_REDS_LIBERACAO.liberado.titulo },
        { id: 'liberacao.liberadoPendencia', grupo: 'Liberação', grupoId: 'liberacao', chave: 'liberadoPendencia', titulo: RELATORIOS_REDS_LIBERACAO.liberadoPendencia.titulo },
        { id: 'liberacao.parcial', grupo: 'Liberação', grupoId: 'liberacao', chave: 'parcial', titulo: RELATORIOS_REDS_LIBERACAO.parcial.titulo },
        { id: 'liberacao.notificado', grupo: 'Liberação', grupoId: 'liberacao', chave: 'notificado', titulo: RELATORIOS_REDS_LIBERACAO.notificado.titulo },

        { id: 'fiscalizacao.ddu', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'ddu', titulo: RELATORIOS_REDS_FISCALIZACAO.ddu.titulo },
        { id: 'fiscalizacao.brigadaVencida', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'brigadaVencida', titulo: RELATORIOS_REDS_FISCALIZACAO.brigadaVencida.titulo },
        { id: 'fiscalizacao.renovacaoAvcb', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'renovacaoAvcb', titulo: RELATORIOS_REDS_FISCALIZACAO.renovacaoAvcb.titulo },
        { id: 'fiscalizacao.avcbVencido', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'avcbVencido', titulo: RELATORIOS_REDS_FISCALIZACAO.avcbVencido.titulo },
        { id: 'fiscalizacao.acessoriaLicenciado', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'acessoriaLicenciado', titulo: RELATORIOS_REDS_FISCALIZACAO.acessoriaLicenciado.titulo },
        { id: 'fiscalizacao.acessoriaDispensado', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'acessoriaDispensado', titulo: RELATORIOS_REDS_FISCALIZACAO.acessoriaDispensado.titulo },
        { id: 'fiscalizacao.comPscipSemAvcb', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'comPscipSemAvcb', titulo: RELATORIOS_REDS_FISCALIZACAO.comPscipSemAvcb.titulo },
        { id: 'fiscalizacao.eventoDeclaratorioConforme', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'eventoDeclaratorioConforme', titulo: RELATORIOS_REDS_FISCALIZACAO.eventoDeclaratorioConforme.titulo },
        { id: 'fiscalizacao.irregular', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'irregular', titulo: RELATORIOS_REDS_FISCALIZACAO.irregular.titulo },
        { id: 'fiscalizacao.semAvcb', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'semAvcb', titulo: RELATORIOS_REDS_FISCALIZACAO.semAvcb.titulo },
        { id: 'fiscalizacao.regularizado', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'regularizado', titulo: RELATORIOS_REDS_FISCALIZACAO.regularizado.titulo },
        { id: 'fiscalizacao.dispensado', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'dispensado', titulo: RELATORIOS_REDS_FISCALIZACAO.dispensado.titulo },
        { id: 'fiscalizacao.localFechado', grupo: 'Fiscalização', grupoId: 'fiscalizacao', chave: 'localFechado', titulo: RELATORIOS_REDS_FISCALIZACAO.localFechado.titulo }
      ]);

      const REDS_TEMPLATE_EXEMPLOS = Object.freeze({
        '{{PSCIP}}': 'PRJ2026001234',
        '{{PF}}': '2026-FIS012345',
        '{{AUTO}}': '2026-AIA000123',
        '{{DDU}}': 'DDU 123456',
        '{{PSCIP_TRECHO}}': ', VINCULADA AO PSCIP Nº PRJ2026001234',
        '{{LICENCA}}': 'AVCB Nº 123456',
        '{{OCUPACAO}}': 'A-2, C-2, F-8 e D-1',
        '{{AREA}}': '1.250',
        '{{SITUACAO_PSCIP}}': 'APROVADO',
        '{{DATA_RENOVACAO_AVCB}}': '15/08/2026',
        '{{DOCUMENTO_LICENCA_NOME}}': 'AUTO DE VISTORIA DO CORPO DE BOMBEIROS (AVCB)',
        '{{EVENTO_RISCO}}': 'RISCO BAIXO',
        '{{EVENTO_DECLARACAO}}': '2026RME01234',
        '{{EVENTO_NOME}}': 'EVENTO DE EXEMPLO',
        '{{EVENTO_ORGANIZADOR}}': 'ORGANIZADOR DE EXEMPLO',
        '{{EVENTO_DOCUMENTO}}': '00.000.000/0001-00',
        '{{AREA_PARCIAL_DESC}}': 'O PAVIMENTO TÉRREO',
        '{{AREA_PARCIAL}}': '420'
      });

      function modeloRedsPadraoPorId_(id) {
        const item = REDS_TEMPLATE_CATALOG.find(modelo => modelo.id === String(id || ''));
        if (!item) return null;
        const origem = item.grupoId === 'liberacao'
          ? RELATORIOS_REDS_LIBERACAO[item.chave]
          : RELATORIOS_REDS_FISCALIZACAO[item.chave];
        return origem ? { ...origem, id: item.id, grupo: item.grupo, grupoId: item.grupoId, chave: item.chave } : null;
      }

      function modeloRedsEfetivoPorId_(id) {
        const padrao = modeloRedsPadraoPorId_(id);
        if (!padrao) return null;
        const personalizado = String(redsTemplatesOverrides_?.[id] || '');
        return {
          ...padrao,
          texto: personalizado || padrao.texto,
          personalizado: Boolean(personalizado),
          metadata: redsTemplatesMetadata_?.[id] || null
        };
      }

      function modeloRedsEfetivo_(grupoId, chave) {
        return modeloRedsEfetivoPorId_(`${grupoId}.${chave}`);
      }

      function marcadoresTextoReds_(texto) {
        const encontrados = String(texto || '').match(/\{\{[A-Z0-9_]+\}\}/g) || [];
        return [...new Set(encontrados)];
      }

      function formatarDataHoraModeloReds_(valor) {
        const data = valor ? new Date(valor) : null;
        if (!data || Number.isNaN(data.getTime())) return '';
        try {
          return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        } catch (e) {
          return data.toLocaleString('pt-BR');
        }
      }

      function textoExemploModeloReds_(texto) {
        let saida = String(texto || '');
        Object.entries(REDS_TEMPLATE_EXEMPLOS).forEach(([marcador, valor]) => {
          saida = saida.replaceAll(marcador, valor);
        });
        return saida;
      }

      function definirMensagemModeloReds_(texto = '', tipo = '') {
        if (!redsTemplateMessage) return;
        redsTemplateMessage.textContent = String(texto || '');
        redsTemplateMessage.classList.toggle('error', tipo === 'error');
        redsTemplateMessage.classList.toggle('success', tipo === 'success');
      }

      function atualizarMarcadoresModeloReds_() {
        const modelo = modeloRedsPadraoPorId_(redsTemplateAtualId_);
        if (!modelo || !redsTemplateText || !redsTemplateMarkers || !redsTemplateMarkerWarning) return;

        const obrigatorios = marcadoresTextoReds_(modelo.texto);
        const atuais = new Set(marcadoresTextoReds_(redsTemplateText.value));
        const ausentes = obrigatorios.filter(marcador => !atuais.has(marcador));

        redsTemplateMarkers.innerHTML = obrigatorios.length
          ? obrigatorios.map(marcador => `<span class="reds-template-marker">${escapeHtml(marcador)}</span>`).join('')
          : '<span class="reds-template-marker none">Este modelo não utiliza marcadores automáticos.</span>';

        redsTemplateMarkerWarning.hidden = !ausentes.length;
        redsTemplateMarkerWarning.textContent = ausentes.length
          ? `Atenção: ${ausentes.length === 1 ? 'o marcador' : 'os marcadores'} ${ausentes.join(', ')} ${ausentes.length === 1 ? 'foi removido' : 'foram removidos'} do texto. Salve somente se isso for intencional.`
          : '';

        if (redsTemplateCharCount) {
          redsTemplateCharCount.textContent = `${redsTemplateText.value.length} / 7000`;
        }
      }

      function renderizarListaModelosReds_() {
        if (!redsTemplatesList) return;
        let grupoAnterior = '';
        const html = [];

        REDS_TEMPLATE_CATALOG.forEach(item => {
          if (item.grupo !== grupoAnterior) {
            grupoAnterior = item.grupo;
            html.push(`<div class="reds-template-group-label">${escapeHtml(item.grupo)}</div>`);
          }

          const personalizado = Boolean(String(redsTemplatesOverrides_?.[item.id] || ''));
          html.push(
            `<button class="reds-template-item${item.id === redsTemplateAtualId_ ? ' active' : ''}" type="button" data-reds-template-id="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.titulo)}</strong>
              <span class="${personalizado ? 'customized' : ''}">${personalizado ? 'Personalizado' : 'Padrão original'}</span>
            </button>`
          );
        });

        redsTemplatesList.innerHTML = html.join('');
      }

      function selecionarModeloReds_(id) {
        const modelo = modeloRedsEfetivoPorId_(id);
        if (!modelo || !redsTemplatesEditorPanel || !redsTemplatesEmpty || !redsTemplateText) return;

        redsTemplateAtualId_ = id;
        redsTemplatesEmpty.hidden = true;
        redsTemplatesEditorPanel.hidden = false;

        if (redsTemplateGroup) redsTemplateGroup.textContent = modelo.grupo;
        if (redsTemplateName) redsTemplateName.textContent = modelo.titulo;
        if (redsTemplateState) {
          redsTemplateState.textContent = modelo.personalizado ? 'Personalizado' : 'Padrão original';
          redsTemplateState.classList.toggle('customized', modelo.personalizado);
        }

        redsTemplateText.value = modelo.texto;
        if (redsTemplateRestoreBtn) redsTemplateRestoreBtn.disabled = !modelo.personalizado;
        if (redsTemplatePreviewPanel) redsTemplatePreviewPanel.hidden = true;
        if (redsTemplatePreviewText) redsTemplatePreviewText.value = '';
        definirMensagemModeloReds_('');

        const meta = modelo.metadata || {};
        if (redsTemplateUpdatedBy) {
          const autor = [meta.usuario, meta.bm ? `BM ${meta.bm}` : ''].filter(Boolean).join(' • ');
          const data = formatarDataHoraModeloReds_(meta.atualizadoEm);
          redsTemplateUpdatedBy.textContent = modelo.personalizado && (autor || data)
            ? `Última alteração: ${[autor, data].filter(Boolean).join(' • ')}`
            : '';
        }

        atualizarMarcadoresModeloReds_();
        renderizarListaModelosReds_();
      }

      async function carregarModelosRedsPersonalizados_(forcar = false) {
        if (!usuarioPodeOperar_() || redsTemplateCarregando_) return;
        const agora = Date.now();

        if (
          !forcar &&
          redsTemplatesCarregados_ &&
          agora - Number(redsTemplatesCarregadosEm_ || 0) < 5 * 60 * 1000
        ) {
          return;
        }

        redsTemplateCarregando_ = true;
        try {
          const resposta = await apiRequest('config', { consulta: 'reds_modelos' }, 30000);
          if (!resposta?.ok) throw new Error(resposta?.error || 'Não foi possível carregar os históricos padrão.');

          redsTemplatesOverrides_ = resposta.modelos && typeof resposta.modelos === 'object'
            ? { ...resposta.modelos }
            : {};
          redsTemplatesMetadata_ = resposta.metadata && typeof resposta.metadata === 'object'
            ? { ...resposta.metadata }
            : {};
          redsTemplatesCarregados_ = true;
          redsTemplatesCarregadosEm_ = Date.now();

          renderizarListaModelosReds_();

          if (redsTemplateAtualId_) selecionarModeloReds_(redsTemplateAtualId_);

          if (recordRedsRegistroAtual) {
            const situacao = recordRedsRegistroAtual?.situacaoAtual ||
              valorCampoFicha_(recordRedsRegistroAtual, 'Sanção');
            renderizarRelatorioReds_(recordRedsRegistroAtual, situacao);
          }
        } catch (erro) {
          if (redsTemplatesModal && !redsTemplatesModal.hidden) {
            definirMensagemModeloReds_(
              erro?.message || 'Não foi possível atualizar os modelos agora. Os textos padrão locais continuam disponíveis.',
              'error'
            );
          }
        } finally {
          redsTemplateCarregando_ = false;
        }
      }

      async function abrirHistoricosPadraoReds_() {
        fecharMenuMais_();

        if (!usuarioPodeOperar_()) {
          await avisarGpv_('Esta configuração está disponível somente para usuários GPV.', 'Acesso restrito');
          return;
        }

        if (!redsTemplatesModal) return;

        redsTemplatesModal.hidden = false;
        document.body.classList.add('reds-templates-open');
        definirMensagemModeloReds_('Carregando configurações...');

        await carregarModelosRedsPersonalizados_(true);

        renderizarListaModelosReds_();
        if (!redsTemplateAtualId_ && REDS_TEMPLATE_CATALOG.length) {
          selecionarModeloReds_(REDS_TEMPLATE_CATALOG[0].id);
        } else if (redsTemplateAtualId_) {
          selecionarModeloReds_(redsTemplateAtualId_);
        }

        definirMensagemModeloReds_('');
        setTimeout(() => redsTemplatesCloseBtn?.focus(), 0);
      }

      function fecharHistoricosPadraoReds_() {
        if (!redsTemplatesModal) return;
        redsTemplatesModal.hidden = true;
        document.body.classList.remove('reds-templates-open');
        if (redsTemplatePreviewPanel) redsTemplatePreviewPanel.hidden = true;
        definirMensagemModeloReds_('');
      }

      function visualizarExemploModeloReds_() {
        if (!redsTemplateText || !redsTemplatePreviewPanel || !redsTemplatePreviewText) return;
        redsTemplatePreviewText.value = textoExemploModeloReds_(redsTemplateText.value);
        redsTemplatePreviewPanel.hidden = false;
        redsTemplatePreviewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      async function salvarModeloRedsAtual_() {
        if (!usuarioPodeOperar_() || !redsTemplateAtualId_ || !redsTemplateText || !redsTemplateSaveBtn) return;

        const modeloPadrao = modeloRedsPadraoPorId_(redsTemplateAtualId_);
        const texto = String(redsTemplateText.value || '').trim();

        if (!texto) {
          definirMensagemModeloReds_('O texto do histórico não pode ficar vazio.', 'error');
          redsTemplateText.focus();
          return;
        }

        const obrigatorios = modeloPadrao ? marcadoresTextoReds_(modeloPadrao.texto) : [];
        const atuais = new Set(marcadoresTextoReds_(texto));
        const ausentes = obrigatorios.filter(marcador => !atuais.has(marcador));

        if (ausentes.length) {
          const prosseguir = await confirmarGpv_(
            `Você removeu ${ausentes.length === 1 ? 'o marcador' : 'os marcadores'} ${ausentes.join(', ')}. O relatório deixará de preencher automaticamente ${ausentes.length === 1 ? 'esse campo' : 'esses campos'}. Deseja salvar mesmo assim?`,
            'Marcador removido',
            { rotuloConfirmar: 'Salvar mesmo assim', rotuloCancelar: 'Revisar texto' }
          );
          if (!prosseguir) return;
        }

        redsTemplateSaveBtn.disabled = true;
        if (redsTemplateRestoreBtn) redsTemplateRestoreBtn.disabled = true;
        definirMensagemModeloReds_('Salvando alteração...');

        try {
          const resposta = await apiRequest('config', {
            consulta: 'reds_modelo_salvar',
            modeloId: redsTemplateAtualId_,
            texto
          }, 30000);

          if (!resposta?.ok) throw new Error(resposta?.error || 'Não foi possível salvar o histórico.');

          redsTemplatesOverrides_[redsTemplateAtualId_] = String(resposta.texto || texto);
          redsTemplatesMetadata_[redsTemplateAtualId_] = resposta.metadata || {};
          redsTemplatesCarregados_ = true;
          redsTemplatesCarregadosEm_ = Date.now();

          selecionarModeloReds_(redsTemplateAtualId_);
          definirMensagemModeloReds_('Histórico padrão atualizado para todos os usuários GPV.', 'success');

          if (recordRedsRegistroAtual) {
            const situacao = recordRedsRegistroAtual?.situacaoAtual ||
              valorCampoFicha_(recordRedsRegistroAtual, 'Sanção');
            renderizarRelatorioReds_(recordRedsRegistroAtual, situacao);
          }
        } catch (erro) {
          definirMensagemModeloReds_(erro?.message || 'Falha ao salvar o histórico.', 'error');
        } finally {
          redsTemplateSaveBtn.disabled = false;
          if (redsTemplateRestoreBtn) {
            redsTemplateRestoreBtn.disabled = !Boolean(String(redsTemplatesOverrides_?.[redsTemplateAtualId_] || ''));
          }
        }
      }

      async function restaurarModeloRedsAtual_() {
        if (!usuarioPodeOperar_() || !redsTemplateAtualId_ || !redsTemplateRestoreBtn) return;

        const modelo = modeloRedsEfetivoPorId_(redsTemplateAtualId_);
        if (!modelo?.personalizado) return;

        const confirmou = await confirmarGpv_(
          `Restaurar "${modelo.titulo}" para o texto original do aplicativo? A personalização atual será removida.`,
          'Restaurar histórico padrão',
          { rotuloConfirmar: 'Restaurar padrão', rotuloCancelar: 'Cancelar' }
        );
        if (!confirmou) return;

        redsTemplateRestoreBtn.disabled = true;
        if (redsTemplateSaveBtn) redsTemplateSaveBtn.disabled = true;
        definirMensagemModeloReds_('Restaurando texto original...');

        try {
          const resposta = await apiRequest('config', {
            consulta: 'reds_modelo_restaurar',
            modeloId: redsTemplateAtualId_
          }, 30000);

          if (!resposta?.ok) throw new Error(resposta?.error || 'Não foi possível restaurar o histórico.');

          delete redsTemplatesOverrides_[redsTemplateAtualId_];
          delete redsTemplatesMetadata_[redsTemplateAtualId_];
          redsTemplatesCarregadosEm_ = Date.now();

          selecionarModeloReds_(redsTemplateAtualId_);
          definirMensagemModeloReds_('Texto original restaurado.', 'success');

          if (recordRedsRegistroAtual) {
            const situacao = recordRedsRegistroAtual?.situacaoAtual ||
              valorCampoFicha_(recordRedsRegistroAtual, 'Sanção');
            renderizarRelatorioReds_(recordRedsRegistroAtual, situacao);
          }
        } catch (erro) {
          definirMensagemModeloReds_(erro?.message || 'Falha ao restaurar o histórico.', 'error');
        } finally {
          if (redsTemplateSaveBtn) redsTemplateSaveBtn.disabled = false;
          if (redsTemplateRestoreBtn) {
            redsTemplateRestoreBtn.disabled = !Boolean(String(redsTemplatesOverrides_?.[redsTemplateAtualId_] || ''));
          }
        }
      }

      let recordRedsRegistroAtual = null;

      function modeloRelatorioRedsLiberacao_(registro, situacao) {
        const n = normalize(situacao);
        const tipoLiberacao = normalize(valorCampoFicha_(registro, 'Tipo da liberação'));
        const parcial = tipoLiberacao === normalize('Parcial');
        if (n === normalize('Notificado')) return parcial ? null : modeloRedsEfetivo_('liberacao', 'notificado');
        if (n !== normalize('Liberado')) return null;
        if (parcial) return modeloRedsEfetivo_('liberacao', 'parcial');
        const pendencia = normalize(valorCampoFicha_(registro, 'Pendência documental'));
        return pendencia === normalize('Sim')
          ? modeloRedsEfetivo_('liberacao', 'liberadoPendencia')
          : modeloRedsEfetivo_('liberacao', 'liberado');
      }

      function sugestaoModeloFiscalizacao_(registro, situacao) {
        const n = normalize(situacao);
        const demanda = normalize(valorCampoFicha_(registro, 'Demanda'));
        const projeto = valorPscipOperacionalFicha_(registro);
        const licenciamento = normalize(valorCampoFicha_(registro, 'Situação do licenciamento'));
        const acessoria = demanda.includes(normalize('Vistoria Acessória'));
        if (acessoria) {
          if (n !== normalize('Regularizado')) return '';
          return [normalize('dispensado'), normalize('Dispensado de licenciamento')].includes(licenciamento) ? 'acessoriaDispensado' : 'acessoriaLicenciado';
        }
        if (demanda.includes(normalize('Eventos declaratórios')) && n === normalize('Regularizado')) return 'eventoDeclaratorioConforme';
        if (demanda.includes(normalize('Renovação AVCB')) && n === normalize('Regularizado')) return 'renovacaoAvcb';
        if (n === normalize('Autuado')) {
          if (demanda.includes(normalize('DDU')) && [normalize('nao_possui'), normalize('Não possui')].includes(licenciamento)) return 'ddu';
          if (demanda.includes(normalize('Brigada'))) return 'brigadaVencida';
          if ([normalize('vencido'), normalize('AVCB/CLCB vencido')].includes(licenciamento)) return 'avcbVencido';
          if ([normalize('nao_possui'), normalize('Não possui')].includes(licenciamento) && projeto) return 'comPscipSemAvcb';
          if ([normalize('nao_possui'), normalize('Não possui')].includes(licenciamento)) return 'semAvcb';
          return 'irregular';
        }
        if (n === normalize('Regularizado')) return projeto ? 'regularizado' : 'dispensado';
        return 'irregular';
      }

      function preencherSelectModelosReds_(ehLiberacao, registro, situacao) {
        if (!recordRedsModelSelect) return '';
        recordRedsModelSelect.innerHTML = '';
        const label = recordRedsModelSelect.closest('.record-reds-model-label');
        if (ehLiberacao) {
          recordRedsModelSelect.hidden = true;
          if (label) label.hidden = true;
          return '';
        }
        const demanda = normalize(valorCampoFicha_(registro, 'Demanda'));
        const ehEventoDeclaratorio = demanda.includes(normalize('Eventos declaratórios'));
        const ehAcessoria = demanda.includes(normalize('Vistoria Acessória'));
        const ehRenovacaoAvcb = demanda.includes(normalize('Renovação AVCB'));
        const opcoes = [
          ...(ehRenovacaoAvcb ? [['renovacaoAvcb', 'Fiscalização — Renovação AVCB']] : []),
          ...(ehAcessoria ? [
            ['acessoriaLicenciado', 'Vistoria Acessória — regularizada — com licenciamento'],
            ['acessoriaDispensado', 'Vistoria Acessória — regularizada — dispensado de licenciamento']
          ] : []),
          ...(ehEventoDeclaratorio ? [['eventoDeclaratorioConforme', 'Fiscalização — evento declaratório conforme']] : []),
          ...(!ehAcessoria ? [
            ['ddu', 'DDU — fiscalização autuada'],
            ['brigadaVencida', 'Fiscalização — brigada vencida'],
            ['avcbVencido', 'Fiscalização — AVCB vencido'],
            ['comPscipSemAvcb', 'Fiscalização — Autuado — com PSCIP — sem AVCB'],
            ['irregular', 'Fiscalização — irregularidade / autuação'],
            ['semAvcb', 'Fiscalização — sem AVCB/CLCB'],
            ['regularizado', 'Fiscalização — regularizado com AVCB/CLCB'],
            ['dispensado', 'Fiscalização — dispensado de licenciamento / regular'],
            ['localFechado', 'Fiscalização — local fechado / vistoria não realizada']
          ] : [])
        ];
        if (!opcoes.length) {
          recordRedsModelSelect.hidden = true;
          if (label) label.hidden = true;
          return '';
        }
        recordRedsModelSelect.hidden = false;
        if (label) label.hidden = false;
        opcoes.forEach(([valor, rotulo]) => {
          const option = document.createElement('option'); option.value = valor; option.textContent = rotulo; recordRedsModelSelect.appendChild(option);
        });
        const sugerido = sugestaoModeloFiscalizacao_(registro, situacao);
        recordRedsModelSelect.value = modeloRedsEfetivo_('fiscalizacao', sugerido) ? sugerido : opcoes[0][0];
        return recordRedsModelSelect.value;
      }

      function preencherSelectModelosInfoscipFiscalizacao_(chaveInicial = '') {
        if (!recordInfoscipModelSelect || !recordRedsModelSelect) return '';
        const opcoes = Array.from(recordRedsModelSelect.options)
          .filter(option => HISTORICOS_INFOSCIP_FISCALIZACAO[option.value]);

        recordInfoscipModelSelect.innerHTML = '';
        opcoes.forEach(optionReds => {
          const option = document.createElement('option');
          option.value = optionReds.value;
          option.textContent = HISTORICOS_INFOSCIP_FISCALIZACAO[optionReds.value]?.titulo || optionReds.textContent;
          recordInfoscipModelSelect.appendChild(option);
        });

        if (!opcoes.length) return '';
        const selecionada = HISTORICOS_INFOSCIP_FISCALIZACAO[chaveInicial]
          ? chaveInicial
          : opcoes[0].value;
        recordInfoscipModelSelect.value = selecionada;
        return recordInfoscipModelSelect.value;
      }

      function atualizarTextoHistoricoInfoscipFiscalizacao_() {
        const registro = recordRedsRegistroAtual;
        if (!registro || !recordInfoscipHistoryPanel || !recordInfoscipHistoryText || !recordInfoscipHistoryModel) return;

        const chave = String(recordInfoscipModelSelect?.value || recordRedsModelSelect?.value || '');
        const modelo = HISTORICOS_INFOSCIP_FISCALIZACAO[chave];
        if (!modelo) {
          recordInfoscipHistoryPanel.hidden = true;
          recordInfoscipHistoryText.value = '';
          return;
        }

        recordInfoscipHistoryModel.textContent = `${modelo.titulo} — confira o texto antes de copiar.`;
        recordInfoscipHistoryText.value = montarTextoRedsFiscalizacao_(modelo, registro);
        recordInfoscipHistoryPanel.hidden = false;
        if (recordInfoscipCopyStatus) recordInfoscipCopyStatus.textContent = '';
      }

      function codigosOcupacaoRelatorio_(valor) {
        const texto = String(valor || '').toUpperCase();
        const encontrados = [];
        const vistos = new Set();

        // Aceita "G-3" e também "G3"; a saída fica sempre como "G-3".
        const regex = /\b([A-Z]{1,2})\s*-?\s*(\d{1,2})\b/g;
        let match;
        while ((match = regex.exec(texto)) !== null) {
          const codigo = `${match[1]}-${match[2]}`;
          if (!vistos.has(codigo)) {
            vistos.add(codigo);
            encontrados.push(codigo);
          }
        }

        if (!encontrados.length) return '';
        if (encontrados.length === 1) return encontrados[0];
        if (encontrados.length === 2) return `${encontrados[0]} e ${encontrados[1]}`;

        return `${encontrados.slice(0, -1).join(', ')} e ${encontrados[encontrados.length - 1]}`;
      }

      function montarTextoRedsFiscalizacao_(modelo, registro) {
        const pscip = valorPscipOperacionalFicha_(registro);
        const pf = valorCampoFicha_(registro, 'Nº do PF') || 'NÃO INFORMADO';
        const numeroAuto = String(recordAutoNumberInput?.value || valorCampoFicha_(registro, 'Nº do Auto') || '').trim();
        const autoExibicao = numeroAuto || '________________________';
        const pscipTrecho = pscip ? `, VINCULADA AO PSCIP Nº ${pscip}` : '';
        const licenca = pscip ? `AVCB/CLCB Nº ${pscip}` : 'LICENCIAMENTO VÁLIDO';
        const eventoRisco = String(valorCampoFicha_(registro, 'Classificação do evento') || 'RISCO NÃO INFORMADO').toUpperCase();
        const eventoDeclaracao = valorCampoFicha_(registro, 'Nº da declaração INFOSCIP') || 'NÃO INFORMADO';
        const eventoNome = String(valorCampoFicha_(registro, 'Nome do evento') || 'NÃO INFORMADO').toUpperCase();
        const eventoOrganizador = String(valorCampoFicha_(registro, 'Organizador do evento') || 'NÃO INFORMADO').toUpperCase();
        const eventoDocumento = valorCampoFicha_(registro, 'CPF/CNPJ do organizador') || 'NÃO INFORMADO';
        const ddu = valorCampoFicha_(registro, 'Nº DDU') || 'NÃO INFORMADO';
        const ocupacaoCompleta = String(valorCampoFicha_(registro, 'Ocupação') || '').replace(/\s*\|\s*/g, ', ').toUpperCase();
        const ocupacaoSomenteCodigos = codigosOcupacaoRelatorio_(ocupacaoCompleta);

        // V23.9.99bi — padrão dos históricos/relatórios REDS:
        // quando citar ocupação/divisão, exibir somente as siglas.
        // Ex.: A-2, C-2, F-8 e D-1.
        const ocupacao = ocupacaoSomenteCodigos || 'NÃO INFORMADO';
        const area = valorCampoFicha_(registro, 'Área m²') || 'NÃO INFORMADA';
        const situacaoPscip = String(valorCampoFicha_(registro, 'Situação atual do PSCIP') || 'NÃO INFORMADA').toUpperCase();
        const dataRenovacaoAvcb = valorCampoFicha_(registro, 'Data de renovação do AVCB') || 'NÃO INFORMADA';
        const tipoLicenca = String(valorCampoFicha_(registro, 'Documento de licenciamento da acessória') || 'CLCB').toUpperCase();
        const documentoLicencaNome = tipoLicenca === 'AVCB' ? 'AUTO DE VISTORIA DO CORPO DE BOMBEIROS (AVCB)' : 'CERTIFICADO DE LICENCIAMENTO DO CORPO DE BOMBEIROS (CLCB)';
        return modelo.texto
          .replaceAll('{{PSCIP}}', pscip || 'NÃO INFORMADO')
          .replaceAll('{{PF}}', pf)
          .replaceAll('{{AUTO}}', autoExibicao)
          .replaceAll('{{DDU}}', ddu)
          .replaceAll('{{PSCIP_TRECHO}}', pscipTrecho)
          .replaceAll('{{LICENCA}}', licenca)
          .replaceAll('{{OCUPACAO}}', ocupacao)
          .replaceAll('{{AREA}}', area)
          .replaceAll('{{SITUACAO_PSCIP}}', situacaoPscip)
          .replaceAll('{{DATA_RENOVACAO_AVCB}}', dataRenovacaoAvcb)
          .replaceAll('{{DOCUMENTO_LICENCA_NOME}}', documentoLicencaNome)
          .replaceAll('{{EVENTO_RISCO}}', eventoRisco)
          .replaceAll('{{EVENTO_DECLARACAO}}', eventoDeclaracao)
          .replaceAll('{{EVENTO_NOME}}', eventoNome)
          .replaceAll('{{EVENTO_ORGANIZADOR}}', eventoOrganizador)
          .replaceAll('{{EVENTO_DOCUMENTO}}', eventoDocumento);
      }

      function atualizarTextoRelatorioRedsFiscalizacao_() {
        const registro = recordRedsRegistroAtual;
        if (!registro || !recordRedsReportText || !recordRedsReportModel) return;
        const tipo = normalize(valorCampoFicha_(registro, 'Tipo de vistoria'));
        const situacao = registro?.situacaoAtual || valorCampoFicha_(registro, 'Sanção');
        if (tipo.includes('liberacao') || [normalize('Liberado'), normalize('Notificado')].includes(normalize(situacao))) return;
        const chaveModelo = recordRedsModelSelect?.value || sugestaoModeloFiscalizacao_(registro, situacao);
        const modelo = modeloRedsEfetivo_('fiscalizacao', chaveModelo);
        if (!modelo) {
          recordRedsReportPanel.hidden = true;
          recordRedsReportText.value = '';
          return;
        }
        recordRedsReportModel.textContent = `${modelo.titulo} — confira o texto antes de copiar.`;
        recordRedsReportText.value = montarTextoRedsFiscalizacao_(modelo, registro);
      }

      function renderizarRelatorioReds_(registro, situacao) {
        if (!recordRedsReportPanel || !recordRedsReportText || !recordRedsReportModel) return;

        if (
          usuarioPodeOperar_() &&
          (!redsTemplatesCarregados_ || Date.now() - Number(redsTemplatesCarregadosEm_ || 0) > 5 * 60 * 1000)
        ) {
          carregarModelosRedsPersonalizados_(false).catch(() => {});
        }
        recordRedsRegistroAtual = registro;
        if (recordInfoscipHistoryPanel) recordInfoscipHistoryPanel.hidden = true;
        if (recordInfoscipHistoryText) recordInfoscipHistoryText.value = '';
        if (recordInfoscipCopyStatus) recordInfoscipCopyStatus.textContent = '';
        const tipo = normalize(valorCampoFicha_(registro, 'Tipo de vistoria'));
        const demanda = normalize(valorCampoFicha_(registro, 'Demanda'));
        const ehLiberacao = tipo.includes('liberacao') || demanda.includes('liberacao') || [normalize('Liberado'), normalize('Notificado')].includes(normalize(situacao));
        const pscip = valorPscipOperacionalFicha_(registro);
        const acessoria = demanda.includes(normalize('Vistoria Acessória'));
        if (recordAutoNumberInput) recordAutoNumberInput.value = ehLiberacao || acessoria ? '' : valorCampoFicha_(registro, 'Nº do Auto');
        if (recordAutoNumberWrap) recordAutoNumberWrap.hidden = ehLiberacao || acessoria;
        if (recordAutoNumberSaveBtn) recordAutoNumberSaveBtn.hidden = ehLiberacao || acessoria;
        if (ehLiberacao) {
          const modelo = modeloRelatorioRedsLiberacao_(registro, situacao);
          if (!modelo) {
            recordRedsReportPanel.hidden = true;
            recordRedsReportText.value = '';
            return;
          }
          preencherSelectModelosReds_(true, registro, situacao);
          const areaDesc = String(valorCampoFicha_(registro, 'Área/trecho liberado') || 'A ÁREA INFORMADA').toUpperCase();
          const areaParcial = valorCampoFicha_(registro, 'Área liberada parcialmente (m²)') || 'NÃO INFORMADA';
          recordRedsReportModel.textContent = modelo.titulo;
          recordRedsReportText.value = modelo.texto
            .replaceAll('{{PSCIP}}', pscip || 'NÃO INFORMADO')
            .replaceAll('{{AREA_PARCIAL_DESC}}', areaDesc)
            .replaceAll('{{AREA_PARCIAL}}', areaParcial);
        } else {
          const escolhido = preencherSelectModelosReds_(false, registro, situacao);
          if (!escolhido) {
            recordRedsReportPanel.hidden = true;
            recordRedsReportText.value = '';
            return;
          }
          atualizarTextoRelatorioRedsFiscalizacao_();
          const escolhidoInfoscip = preencherSelectModelosInfoscipFiscalizacao_(escolhido);
          if (escolhidoInfoscip) atualizarTextoHistoricoInfoscipFiscalizacao_();
        }
        recordRedsReportPanel.hidden = false;
        if (recordRedsCopyStatus) recordRedsCopyStatus.textContent = '';
      }

      async function salvarNumeroAutoRegistro_() {
        const chave = String(recordsState.chaveSelecionada || '');
        const numeroAuto = String(recordAutoNumberInput?.value || '').trim();
        if (!chave || !recordAutoNumberInput || !recordAutoNumberSaveBtn) return;
        if (!navigator.onLine) {
          if (recordAutoNumberStatus) recordAutoNumberStatus.textContent = 'É necessário estar online para salvar o Nº do Auto.';
          return;
        }
        recordAutoNumberSaveBtn.disabled = true;
        if (recordAutoNumberStatus) recordAutoNumberStatus.textContent = 'Salvando...';
        try {
          const r = await apiRequest('config', { consulta: 'auto_salvar', chave, numeroAuto }, 30000);
          if (!r?.ok) throw new Error(r?.error || 'Não foi possível salvar o Nº do Auto.');
          if (recordRedsRegistroAtual) {
            const campo = (recordRedsRegistroAtual.campos || []).find(x => normalize(x?.rotulo) === normalize('Nº do Auto'));
            if (campo) campo.valor = numeroAuto;
            else if (numeroAuto) recordRedsRegistroAtual.campos = [...(recordRedsRegistroAtual.campos || []), { grupo: 'Processo', rotulo: 'Nº do Auto', valor: numeroAuto }];
          }
          if (recordAutoNumberStatus) recordAutoNumberStatus.textContent = numeroAuto ? 'Nº do Auto salvo na ficha do processo.' : 'Nº do Auto removido da ficha.';
          limparCachesConsulta_();
          atualizarTextoRelatorioRedsFiscalizacao_();
        } catch (erro) {
          if (recordAutoNumberStatus) recordAutoNumberStatus.textContent = String(erro?.message || 'Falha ao salvar o Nº do Auto.');
        } finally {
          recordAutoNumberSaveBtn.disabled = false;
        }
      }

      async function copiarRelatorioReds_() {
        const texto = String(recordRedsReportText?.value || '');
        if (!texto) return;
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(texto);
          else {
            recordRedsReportText.focus();
            recordRedsReportText.select();
            document.execCommand('copy');
          }
          if (recordRedsCopyStatus) recordRedsCopyStatus.textContent = 'Relatório copiado. Pronto para colar no REDS.';
          if (recordRedsCopyBtn) {
            const original = recordRedsCopyBtn.textContent;
            recordRedsCopyBtn.textContent = 'Copiado ✓';
            setTimeout(() => { recordRedsCopyBtn.textContent = original; }, 1800);
          }
        } catch (erro) {
          if (recordRedsCopyStatus) recordRedsCopyStatus.textContent = 'Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.';
        }
      }

      async function copiarHistoricoInfoscipFiscalizacao_() {
        const texto = String(recordInfoscipHistoryText?.value || '');
        if (!texto) return;
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(texto);
          else {
            recordInfoscipHistoryText.focus();
            recordInfoscipHistoryText.select();
            document.execCommand('copy');
          }
          if (recordInfoscipCopyStatus) {
            recordInfoscipCopyStatus.textContent = 'Histórico copiado. Pronto para colar no INFOSCIP Fiscalização.';
          }
          if (recordInfoscipCopyBtn) {
            const original = recordInfoscipCopyBtn.textContent;
            recordInfoscipCopyBtn.textContent = 'Copiado ✓';
            setTimeout(() => { recordInfoscipCopyBtn.textContent = original; }, 1800);
          }
        } catch (erro) {
          if (recordInfoscipCopyStatus) {
            recordInfoscipCopyStatus.textContent = 'Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.';
          }
        }
      }

      function payloadWhatsAppFicha_(registro, telefone) {
        const nomeResponsavel = valorCampoFicha_(registro, 'Nome');
        const nomeFantasia = registro?.titulo || valorCampoFicha_(registro, 'Nome Fantasia');
        const razaoSocial = valorCampoFicha_(registro, 'Razão Social');
        const dataRegistro = valorCampoFicha_(registro, 'Data e hora');
        return {
          telefone: telefone || valorCampoFicha_(registro, 'Telefone'),
          nomeResponsavel,
          nomeFantasia,
          razaoSocial,
          tipoVistoria: valorCampoFicha_(registro, 'Tipo de vistoria'),
          sancao: String(registro?.situacaoAtual || valorCampoFicha_(registro, 'Sanção') || '').trim(),
          pscip: valorPscipOperacionalFicha_(registro) || valorCampoFicha_(registro, 'Nº do PSCIP', 'Nº do PSCIP / Projeto'),
          _appCriadoEm: dataRegistro
        };
      }

      function atualizarWhatsAppFicha_() {
        if (!recordWhatsappPanel || !recordWhatsappPhoneInput || !recordWhatsappSendBtn) return;
        const numero = telefoneWhatsApp_(recordWhatsappPhoneInput.value);
        recordWhatsappSendBtn.disabled = !numero;
        if (recordWhatsappStatus) {
          recordWhatsappStatus.textContent = numero
            ? 'A mensagem será aberta no WhatsApp para conferência e envio.'
            : 'Informe um telefone válido com DDD para habilitar o envio.';
        }
      }

      function renderizarWhatsAppFicha_(registro) {
        if (!recordWhatsappPanel || !recordWhatsappPhoneInput || !recordWhatsappSendBtn) return;
        recordWhatsappRegistroAtual = registro || null;
        recordWhatsappPanel.hidden = false;
        recordWhatsappPhoneInput.value = valorCampoFicha_(registro, 'Telefone');
        atualizarWhatsAppFicha_();
      }

      function enviarWhatsAppFicha_() {
        if (!recordWhatsappRegistroAtual || !recordWhatsappPhoneInput) return;
        const telefone = String(recordWhatsappPhoneInput.value || '').trim();
        const payload = payloadWhatsAppFicha_(recordWhatsappRegistroAtual, telefone);
        const abriu = abrirMensagemWhatsAppResponsavel_(payload, telefone);
        if (recordWhatsappStatus) {
          recordWhatsappStatus.textContent = abriu
            ? 'Abrindo o WhatsApp com a mensagem pronta...'
            : 'Não foi possível abrir o WhatsApp. Confira o telefone e a conexão.';
        }
      }



      function notificacoesDaFicha_(registro) {
        const bruto = String(registro?.notificacoesTemporarias || '').trim();
        const estrutura = normalizarEstruturaNotificacoes_(bruto);
        const itens = [];
        estrutura.forEach(local => {
          (local.irregularidades || []).forEach(irregularidade => {
            if (!irregularidadeNotificacaoTemConteudo_(irregularidade)) return;
            itens.push({ local, irregularidade });
          });
        });
        return itens;
      }

      function renderizarNotificacoesFicha_(registro) {
        if (!recordNotificationsPanel || !recordNotificationsList) return;
        recordNotificationsAtual = notificacoesDaFicha_(registro);
        if (!recordNotificationsAtual.length) {
          recordNotificationsPanel.hidden = true;
          recordNotificationsList.innerHTML = '';
          if (recordNotificationsStatus) recordNotificationsStatus.textContent = '';
          return;
        }

        recordNotificationsPanel.hidden = false;
        if (recordNotificationsSummary) {
          const locais = new Set(recordNotificationsAtual.map(item => `${item.local.tipoLocal}|${item.local.complemento}`)).size;
          const validade = String(registro?.notificacoesDisponiveisAte || '').trim();
          recordNotificationsSummary.textContent =
            `${recordNotificationsAtual.length} irregularidade${recordNotificationsAtual.length === 1 ? '' : 's'} registrada${recordNotificationsAtual.length === 1 ? '' : 's'} em ${locais} local${locais === 1 ? '' : 'is'}.` +
            (validade ? ` Disponível na Ficha até ${validade}.` : '');
        }
        recordNotificationsList.innerHTML = recordNotificationsAtual.map((item, indice) => {
          const local = item.local;
          const irregularidade = item.irregularidade;
          return `<article class="record-notification-item">
            <div class="record-notification-item-head">
              <div>
                <strong>${indice + 1}. ${escapeHtml([local.tipoLocal, local.complemento].filter(Boolean).join(' — ') || 'Local não informado')}</strong>
                <small>${escapeHtml(irregularidade.tipoIrregularidade || 'Tipo não informado')} • ${escapeHtml(irregularidade.itemIrregular || 'Item não informado')}</small>
              </div>
              <button class="record-notification-copy" type="button" data-record-notification-copy="${indice}">Copiar</button>
            </div>
            <p>${escapeHtml(irregularidade.descricao || '')}</p>
          </article>`;
        }).join('');
        if (recordNotificationsStatus) recordNotificationsStatus.textContent = '';
      }

      async function copiarNotificacaoFicha_(indice) {
        const item = recordNotificationsAtual[Number(indice)];
        if (!item) return;
        const ok = await copiarTextoCompat_(textoNotificacaoIndividual_(item.local, item.irregularidade, false));
        if (recordNotificationsStatus) recordNotificationsStatus.textContent = ok ? 'Descrição copiada.' : 'Não foi possível copiar automaticamente.';
      }

      async function copiarTodasNotificacoesFicha_() {
        if (!recordNotificationsAtual.length) return;
        const ok = await copiarTextoCompat_(textoTodasNotificacoes_(recordNotificationsAtual));
        if (recordNotificationsStatus) recordNotificationsStatus.textContent = ok ? 'Todas as notificações foram copiadas.' : 'Não foi possível copiar automaticamente.';
      }


      function fluxoLiberacaoFicha_(registro) {
        const demanda = normalize(valorCampoFicha_(registro, 'Demanda'));
        const tipo = normalize(valorCampoFicha_(registro, 'Tipo de vistoria'));
        return demanda.includes(normalize('Liberação')) || tipo.includes(normalize('Liberação'));
      }

      function opcoesAtualizacaoInfoscipFicha_(registro) {
        const atual = normalize(registro?.situacaoAtual || '');
        const pendente = atual.startsWith(normalize('Pendente'));
        if (fluxoLiberacaoFicha_(registro)) {
          // V23.9.76 — também permite corrigir Vistorias de Liberação antigas que
          // chegaram à Ficha sem qualquer situação registrada.
          if (!atual || atual === normalize('Sem situação')) return ['Notificado', 'Liberado'];

          // V23.9.75 — Liberação tecnicamente não aprovada é Notificado, nunca Autuado.
          // Permite corrigir pela Ficha registros antigos/inconsistentes que tenham sido
          // gravados como Autuado, Advertência ou Regularizado no fluxo de Liberação.
          const inconsistente = [
            normalize('Autuado'),
            normalize('Advertência'),
            normalize('Regularizado')
          ].includes(atual);
          if (inconsistente) return ['Notificado'];
          return pendente ? ['Notificado', 'Liberado'] : [];
        }
        if (atual === normalize('Autuado')) return ['Advertência'];
        if (pendente) return ['Regularizado'];
        return [];
      }

      function configurarAtualizacaoInfoscipFicha_(registro) {
        recordStatusRegistroAtual = registro || null;
        if (!recordInfoscipUpdatePanel || !recordInfoscipUpdateBtn) return;
        if (!usuarioPodeOperar_()) {
          recordInfoscipUpdatePanel.hidden = true;
          recordInfoscipUpdateBtn.disabled = true;
          return;
        }
        const opcoes = opcoesAtualizacaoInfoscipFicha_(registro);
        recordInfoscipUpdatePanel.hidden = !opcoes.length;
        recordInfoscipUpdateBtn.disabled = !opcoes.length;
      }

      function abrirAtualizacaoSituacaoInfoscip_() {
        if (!recordStatusRegistroAtual || !recordStatusUpdateModal) return;
        const opcoes = opcoesAtualizacaoInfoscipFicha_(recordStatusRegistroAtual);
        if (!opcoes.length) return;
        if (recordStatusUpdateCurrent) recordStatusUpdateCurrent.textContent = recordStatusRegistroAtual.situacaoAtual || '—';
        if (recordStatusUpdateSelect) {
          recordStatusUpdateSelect.innerHTML = opcoes.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
        }
        if (recordFineUpdateSelect) {
          recordFineUpdateSelect.value = normalizarSituacaoMultaInfoscip_(valorCampoFicha_(recordStatusRegistroAtual, 'Situação de multa no INFOSCIP'));
        }
        if (recordStatusUpdateConfirm) recordStatusUpdateConfirm.checked = false;
        if (recordStatusUpdateMessage) { recordStatusUpdateMessage.textContent = ''; recordStatusUpdateMessage.className = 'record-status-update-message'; }
        recordStatusUpdateModal.hidden = false;
        document.body.classList.add('record-status-update-open');
        setTimeout(() => recordStatusUpdateSelect?.focus(), 30);
      }

      function fecharAtualizacaoSituacaoInfoscip_() {
        if (!recordStatusUpdateModal || recordStatusUpdateModal.hidden) return;
        recordStatusUpdateModal.hidden = true;
        document.body.classList.remove('record-status-update-open');
        if (recordStatusUpdateSaveBtn) recordStatusUpdateSaveBtn.disabled = false;
      }

      function situacaoEsperadaAposConferencia_(novaSituacao, situacaoMultaInfoscip) {
        const nova = String(novaSituacao || '').trim();
        const multa = normalizarSituacaoMultaInfoscip_(situacaoMultaInfoscip || 'Não conferido');
        if (['Liberado', 'Regularizado'].some(v => normalize(v) === normalize(nova))) {
          if (multa === 'Possui multa em aberto') return 'Pendente — multa em aberto';
          if (multa !== 'Não possui multa em aberto') return 'Pendente — conferir multa no INFOSCIP';
        }
        return nova;
      }

      function atualizacaoSituacaoConfirmadaNaFicha_(registro, novaSituacao, situacaoMultaInfoscip) {
        if (!registro) return false;
        const esperada = situacaoEsperadaAposConferencia_(novaSituacao, situacaoMultaInfoscip);
        const atual = String(registro?.situacaoAtual || valorCampoFicha_(registro, 'Sanção') || '').trim();
        if (normalize(atual) !== normalize(esperada)) return false;
        const multaAtual = normalizarSituacaoMultaInfoscip_(valorCampoFicha_(registro, 'Situação de multa no INFOSCIP'));
        return multaAtual === normalizarSituacaoMultaInfoscip_(situacaoMultaInfoscip);
      }

      async function verificarAtualizacaoSituacaoAposTimeout_(chave, linhaHint, novaSituacao, situacaoMultaInfoscip) {
        // O AbortController encerra apenas a espera no navegador; o Apps Script pode
        // concluir a gravação logo depois. Antes de sugerir uma nova tentativa,
        // consultamos a Ficha para evitar duplicidade de auditoria.
        await new Promise(resolve => setTimeout(resolve, 1800));
        try {
          const registro = await consultarRegistroComRetry_(chave, linhaHint, true);
          if (atualizacaoSituacaoConfirmadaNaFicha_(registro, novaSituacao, situacaoMultaInfoscip)) {
            gravarCacheFicha_(chave, registro);
            return registro;
          }
        } catch (e) {}
        return null;
      }

      async function salvarAtualizacaoSituacaoInfoscip_() {
        if (!recordStatusRegistroAtual || !recordsState.chaveSelecionada) return;
        const novaSituacao = String(recordStatusUpdateSelect?.value || '').trim();
        const situacaoMultaInfoscip = normalizarSituacaoMultaInfoscip_(recordFineUpdateSelect?.value || 'Não conferido');
        if (!novaSituacao) return;
        if (!recordStatusUpdateConfirm?.checked) {
          if (recordStatusUpdateMessage) {
            recordStatusUpdateMessage.textContent = 'Confirme que consultou o INFOSCIP antes de salvar.';
            recordStatusUpdateMessage.className = 'record-status-update-message error';
          }
          return;
        }
        if (!navigator.onLine) {
          if (recordStatusUpdateMessage) {
            recordStatusUpdateMessage.textContent = 'Esta atualização exige conexão para registrar a conferência no INFOSCIP.';
            recordStatusUpdateMessage.className = 'record-status-update-message error';
          }
          return;
        }
        if (recordStatusUpdateSaveBtn) recordStatusUpdateSaveBtn.disabled = true;
        if (recordStatusUpdateMessage) {
          recordStatusUpdateMessage.textContent = 'Salvando atualização...';
          recordStatusUpdateMessage.className = 'record-status-update-message';
        }

        const chave = recordsState.chaveSelecionada;
        const linhaHint = Number(recordsState.linhaSelecionada || recordStatusRegistroAtual?.linhaAtual || 0);

        try {
          const resposta = await apiRequest('config', {
            consulta: 'situacao_atualizar',
            chave,
            linhaHint,
            novaSituacao,
            situacaoMultaInfoscip,
            confirmadoInfoscip: true,
            dispositivo: nomeDispositivo_()
          }, 55000);

          fecharAtualizacaoSituacaoInfoscip_();
          limparCachesConsulta_();
          appStatus.textContent = `Situação atualizada para ${resposta?.situacaoAtual || novaSituacao} após conferência no INFOSCIP.`;
          await abrirDetalheRegistro_(chave, Number(resposta?.linha || linhaHint));
          if (document.body.classList.contains('records-mode')) void carregarRegistros_(false, { forcar: true, motivo: 'situação alterada' });
        } catch (erro) {
          if (erro?.code === 'REQUEST_TIMEOUT') {
            if (recordStatusUpdateMessage) {
              recordStatusUpdateMessage.textContent = 'A confirmação está demorando. Verificando se a atualização já foi concluída...';
              recordStatusUpdateMessage.className = 'record-status-update-message';
            }
            const confirmada = await verificarAtualizacaoSituacaoAposTimeout_(chave, linhaHint, novaSituacao, situacaoMultaInfoscip);
            if (confirmada) {
              fecharAtualizacaoSituacaoInfoscip_();
              limparCachesConsulta_();
              appStatus.textContent = `Situação atualizada para ${confirmada?.situacaoAtual || novaSituacao} após conferência no INFOSCIP.`;
              await abrirDetalheRegistro_(chave, Number(confirmada?.linhaAtual || linhaHint));
              if (document.body.classList.contains('records-mode')) void carregarRegistros_(false, { forcar: true, motivo: 'situação confirmada' });
              return;
            }
            if (recordStatusUpdateMessage) {
              recordStatusUpdateMessage.textContent = 'Não foi possível confirmar a atualização. Feche e reabra a Ficha antes de tentar novamente.';
              recordStatusUpdateMessage.className = 'record-status-update-message error';
            }
          } else if (recordStatusUpdateMessage) {
            recordStatusUpdateMessage.textContent = erro?.message || 'Não foi possível atualizar a situação.';
            recordStatusUpdateMessage.className = 'record-status-update-message error';
          }
        } finally {
          if (recordStatusUpdateSaveBtn) recordStatusUpdateSaveBtn.disabled = false;
        }
      }


      function registroEhEventoDeclaratorio_(registro) {
        return Boolean(valorCampoFicha_(registro, 'Nº da declaração INFOSCIP')) ||
          normalize(valorCampoFicha_(registro, 'Demanda')).includes(normalize('Eventos declaratórios'));
      }

      function registroEhLiberacao_(registro) {
        const tipo = normalize(valorCampoFicha_(registro, 'Tipo de vistoria'));
        const demanda = normalize(valorCampoFicha_(registro, 'Demanda'));
        return tipo.includes(normalize('Liberação')) || demanda.includes(normalize('Liberação'));
      }

      function registroEhAcessoria_(registro) {
        return normalize(valorCampoFicha_(registro, 'Demanda')).includes(normalize('Vistoria Acessória'));
      }

      function camposCorrecaoRegistro_(registro) {
        const evento = registroEhEventoDeclaratorio_(registro);
        const liberacao = registroEhLiberacao_(registro);
        const acessoria = registroEhAcessoria_(registro);
        const demanda = valorCampoFicha_(registro, 'Demanda');
        const renovacao = normalize(demanda).includes(normalize('Renovação AVCB'));
        const ddu = normalize(demanda).includes(normalize('DDU')) || Boolean(valorCampoFicha_(registro, 'Nº DDU'));
        const campo = (id, grupo, rotulo, fontes, opcoes = {}) => ({ id, grupo, rotulo, fontes, ...opcoes });

        return [
          campo('nomeFantasia', 'Estabelecimento', 'Nome Fantasia', ['Nome Fantasia'], { mostrar: !evento }),
          campo('razaoSocial', 'Estabelecimento', 'Razão Social', ['Razão Social'], { mostrar: !evento }),
          campo('documentoEstabelecimento', 'Estabelecimento', 'CNPJ / CPF do estabelecimento', ['CNPJ'], { mostrar: !evento, inputmode: 'numeric' }),

          campo('cidade', 'Edificação / local', 'Cidade', ['Cidade']),
          campo('enderecoEdificacao', 'Edificação / local', evento ? 'Endereço do evento' : 'Endereço da edificação', ['Endereço do estabelecimento']),
          campo('numero', 'Edificação / local', 'Número', ['Nº']),
          campo('complemento', 'Edificação / local', 'Complemento', ['Complemento']),
          campo('bairro', 'Edificação / local', 'Bairro', ['Bairro']),
          campo('enderecoCorrespondencia', 'Edificação / local', 'Endereço para correspondência', ['Endereço para correspondência'], { mostrar: !evento }),
          campo('area', 'Edificação / local', 'Área (m²)', ['Área (m²)', 'Área m²', 'Área'], { mostrar: !evento, inputmode: 'decimal' }),
          campo('pavimentos', 'Edificação / local', 'Pavimentos', ['Pavimentos'], { mostrar: !evento, inputmode: 'numeric' }),
          campo('altura', 'Edificação / local', 'Altura (m)', ['Altura (m)', 'Altura'], { mostrar: !evento, inputmode: 'decimal' }),
          campo('ocupacao', 'Edificação / local', 'Ocupação / Divisão', ['Ocupação', 'Ocupação / Divisão', 'Divisão'], { mostrar: !evento }),

          campo('pscip', 'Processo / vistoria', 'Nº do PSCIP / Projeto', ['Nº do PSCIP / Projeto'], { mostrar: !evento, placeholder: 'PRJ + 10 números ou 44/2016' }),
          campo('pf', 'Processo / vistoria', 'Nº do PF', ['Nº do PF'], { mostrar: !evento }),
          campo('tipoVistoria', 'Processo / vistoria', 'Tipo de vistoria', ['Tipo de vistoria'], { tipo: 'select', opcoes: ['Vistoria de Fiscalização', 'Vistoria de Liberação'] }),
          campo('vistoriadorResponsavel', 'Processo / vistoria', 'Vistoriador responsável', ['Vistoriador responsável']),
          campo('reds', 'Processo / vistoria', 'REDS', ['REDS']),
          campo('natureza', 'Processo / vistoria', 'Natureza', ['Natureza']),
          campo('demanda', 'Processo / vistoria', 'Demanda', ['Demanda']),
          campo('resim', 'Processo / vistoria', 'RESIM', ['RESIM'], { mostrar: !evento }),
          campo('situacaoLicenciamento', 'Processo / vistoria', 'Situação do licenciamento', ['Situação do licenciamento'], {
            mostrar: !evento,
            tipo: 'select',
            opcoes: ['Possui AVCB ou CLCB', 'Não possui', 'AVCB/CLCB vencido', 'Dispensado de licenciamento']
          }),
          campo('situacaoPscip', 'Processo / vistoria', 'Situação atual do PSCIP', ['Situação atual do PSCIP'], { mostrar: !evento }),
          campo('pendenciaDocumental', 'Processo / vistoria', 'Pendência documental', ['Pendência documental'], { mostrar: liberacao, tipo: 'select', opcoes: ['Sim', 'Não'] }),
          campo('nDdu', 'Processo / vistoria', 'Nº DDU', ['Nº DDU'], { mostrar: ddu }),
          campo('dataRenovacaoAvcb', 'Processo / vistoria', 'Data de renovação do AVCB', ['Data de renovação do AVCB'], { mostrar: renovacao, placeholder: 'DD/MM/AAAA' }),
          campo('tipoLiberacao', 'Processo / vistoria', 'Tipo da liberação', ['Tipo da liberação'], { mostrar: liberacao, tipo: 'select', opcoes: ['Final', 'Parcial'] }),
          campo('liberacaoParcialDescricao', 'Processo / vistoria', 'Área/trecho liberado', ['Área/trecho liberado'], { mostrar: liberacao, tipo: 'textarea' }),
          campo('liberacaoParcialArea', 'Processo / vistoria', 'Área liberada parcialmente (m²)', ['Área liberada parcialmente (m²)'], { mostrar: liberacao, inputmode: 'decimal' }),
          campo('acessoriaResultado', 'Processo / vistoria', 'Resultado da vistoria acessória', ['Resultado da vistoria acessória'], { mostrar: acessoria, tipo: 'select', opcoes: ['Irregularidades sanadas', 'Irregularidades persistem'] }),
          campo('acessoriaTipoLicenca', 'Processo / vistoria', 'Documento de licenciamento da acessória', ['Documento de licenciamento da acessória'], { mostrar: acessoria }),
          campo('acessoriaSituacaoAnterior', 'Processo / vistoria', 'Situação anterior do PF', ['Situação anterior do PF'], { mostrar: acessoria }),

          campo('responsavel', 'Responsável / envolvido', evento ? 'Vínculo / função' : 'Responsável / vínculo', ['Responsável']),
          campo('nomeResponsavel', 'Responsável / envolvido', 'Nome', ['Nome']),
          campo('rg', 'Responsável / envolvido', 'RG', ['RG']),
          campo('cpfResponsavel', 'Responsável / envolvido', 'CPF', ['CPF'], { inputmode: 'numeric' }),
          campo('mae', 'Responsável / envolvido', 'Mãe', ['Mãe']),
          campo('nascimento', 'Responsável / envolvido', 'Data de nascimento', ['Nascimento', 'Data de nascimento'], { placeholder: 'DD/MM/AAAA' }),
          campo('profissao', 'Responsável / envolvido', 'Profissão', ['Profissão']),
          campo('estadoCivil', 'Responsável / envolvido', 'Estado civil', ['Estado civil']),
          campo('escolaridade', 'Responsável / envolvido', 'Escolaridade', ['Escolaridade']),
          campo('telefone', 'Responsável / envolvido', 'Telefone', ['Telefone'], { inputmode: 'tel' }),
          campo('email', 'Responsável / envolvido', 'E-mail', ['E-mail'], { tipoInput: 'email' }),
          campo('enderecoResponsavel', 'Responsável / envolvido', 'Endereço do responsável', ['Endereço do responsável', 'Endereço do envolvido']),

          campo('eventoDeclaracaoNumero', 'Evento declaratório', 'Nº da declaração INFOSCIP', ['Nº da declaração INFOSCIP'], { mostrar: evento }),
          campo('eventoClassificacao', 'Evento declaratório', 'Classificação do evento', ['Classificação do evento'], {
            mostrar: evento,
            tipo: 'select',
            opcoes: ['Risco mínimo', 'Risco baixo', 'Risco médio'],
            opcoesEstritas: true
          }),
          campo('eventoNome', 'Evento declaratório', 'Nome do evento', ['Nome do evento'], { mostrar: evento }),
          campo('eventoInicio', 'Evento declaratório', 'Início do evento', ['Início do evento'], { mostrar: evento }),
          campo('eventoTermino', 'Evento declaratório', 'Término do evento', ['Término do evento'], { mostrar: evento }),
          campo('eventoPublicoEstimado', 'Evento declaratório', 'Público estimado', ['Público estimado'], { mostrar: evento, inputmode: 'numeric' }),
          campo('eventoOrganizador', 'Evento declaratório', 'Organizador do evento', ['Organizador do evento'], { mostrar: evento }),
          campo('eventoOrganizadorDocumento', 'Evento declaratório', 'CPF/CNPJ do organizador', ['CPF/CNPJ do organizador'], { mostrar: evento, inputmode: 'numeric' }),
          campo('eventoTelefoneOrganizador', 'Evento declaratório', 'Telefone do organizador', ['Telefone do organizador'], { mostrar: evento, inputmode: 'tel' })
        ].filter(item => item.mostrar !== false);
      }

      function valorCampoCorrecao_(registro, campo) {
        const valor = valorCampoFicha_(registro, ...(campo?.fontes || []));
        if (campo?.id === 'nascimento') return formatarDataNascimentoFicha_(valor);
        return valor;
      }

      function opcoesCampoCorrecao_(campo, valorAtual) {
        const base = Array.isArray(campo?.opcoes) ? campo.opcoes.slice() : [];
        if (!campo?.opcoesEstritas && valorAtual && !base.some(v => normalize(v) === normalize(valorAtual))) {
          base.unshift(valorAtual);
        }
        return base;
      }

      function htmlCampoCorrecao_(campo, valorAtual) {
        const id = `record-correction-${campo.id}`;
        const comum = `data-correction-id="${escapeAttr(campo.id)}" data-correction-label="${escapeAttr(campo.rotulo)}"`;
        if (campo.tipo === 'select') {
          const opcoes = opcoesCampoCorrecao_(campo, valorAtual);
          const selecionadoValido = opcoes.some(v => normalize(v) === normalize(valorAtual));
          const optionsHtml = [`<option value="">Selecione</option>`].concat(
            opcoes.map(v => `<option value="${escapeAttr(v)}"${normalize(v) === normalize(valorAtual) ? ' selected' : ''}>${escapeHtml(v)}</option>`)
          ).join('');
          return `<label class="record-correction-field"><span>${escapeHtml(campo.rotulo)}</span><select id="${escapeAttr(id)}" ${comum} data-correction-kind="select"${selecionadoValido ? ' data-correction-initial-valid="1"' : ''}>${optionsHtml}</select></label>`;
        }
        if (campo.tipo === 'textarea') {
          return `<label class="record-correction-field wide"><span>${escapeHtml(campo.rotulo)}</span><textarea id="${escapeAttr(id)}" ${comum} rows="3"${campo.placeholder ? ` placeholder="${escapeAttr(campo.placeholder)}"` : ''}>${escapeHtml(valorAtual)}</textarea></label>`;
        }
        const tipo = campo.tipoInput || 'text';
        return `<label class="record-correction-field"><span>${escapeHtml(campo.rotulo)}</span><input id="${escapeAttr(id)}" type="${escapeAttr(tipo)}" ${comum} value="${escapeAttr(valorAtual)}"${campo.inputmode ? ` inputmode="${escapeAttr(campo.inputmode)}"` : ''}${campo.placeholder ? ` placeholder="${escapeAttr(campo.placeholder)}"` : ''}></label>`;
      }

      function renderizarCamposCorrecao_(registro) {
        if (!recordCorrectionFields) return;
        const campos = camposCorrecaoRegistro_(registro);
        recordCorrectionOriginal = new Map();
        const grupos = new Map();
        campos.forEach(campo => {
          const atual = valorCampoCorrecao_(registro, campo);
          recordCorrectionOriginal.set(campo.id, { valor: atual, campo });
          if (!grupos.has(campo.grupo)) grupos.set(campo.grupo, []);
          grupos.get(campo.grupo).push({ campo, atual });
        });
        recordCorrectionFields.innerHTML = Array.from(grupos.entries()).map(([grupo, itens], index) => `
          <details class="record-correction-group"${index < 2 || grupo === 'Responsável / envolvido' || grupo === 'Evento declaratório' ? ' open' : ''}>
            <summary><span>${escapeHtml(grupo)}</span><small>${itens.length} campo${itens.length === 1 ? '' : 's'}</small></summary>
            <div class="record-correction-grid">${itens.map(item => htmlCampoCorrecao_(item.campo, item.atual)).join('')}</div>
          </details>`).join('');
      }

      function configurarCorrecaoFicha_(registro) {
        recordCorrectionRegistroAtual = registro || null;
        if (!recordCorrectionPanel || !recordCorrectionBtn) return;
        const historico = Boolean(registro?.origemHistorica) || String(registro?.chave || recordsState.chaveSelecionada || '').startsWith('HIST:');
        const permitido = usuarioPodeOperar_() && !historico;
        recordCorrectionPanel.hidden = !permitido;
        recordCorrectionBtn.disabled = !permitido;
      }

      function abrirCorrecaoRegistro_() {
        if (!recordCorrectionRegistroAtual || !recordCorrectionModal || !usuarioPodeOperar_()) return;
        const historico = Boolean(recordCorrectionRegistroAtual?.origemHistorica) || String(recordCorrectionRegistroAtual?.chave || '').startsWith('HIST:');
        if (historico) {
          avisarGpv_('Registros da base histórica 2024-2025 são somente para consulta e não podem ser corrigidos por esta tela.', 'Registro histórico');
          return;
        }
        renderizarCamposCorrecao_(recordCorrectionRegistroAtual);
        if (recordCorrectionReason) recordCorrectionReason.value = '';
        if (recordCorrectionMessage) { recordCorrectionMessage.textContent = ''; recordCorrectionMessage.className = 'record-correction-message'; }
        if (recordCorrectionSaveBtn) recordCorrectionSaveBtn.disabled = false;
        recordCorrectionModal.hidden = false;
        document.body.classList.add('record-correction-open');
        setTimeout(() => recordCorrectionFields?.querySelector('input,select,textarea')?.focus(), 40);
      }

      function fecharCorrecaoRegistro_() {
        if (!recordCorrectionModal || recordCorrectionModal.hidden) return;
        recordCorrectionModal.hidden = true;
        document.body.classList.remove('record-correction-open');
        if (recordCorrectionSaveBtn) recordCorrectionSaveBtn.disabled = false;
      }

      function normalizarComparacaoCorrecao_(id, valor) {
        const texto = String(valor == null ? '' : valor).trim();
        if (['documentoEstabelecimento', 'cpfResponsavel', 'eventoOrganizadorDocumento', 'telefone', 'eventoTelefoneOrganizador'].includes(id)) {
          return texto.replace(/\D/g, '');
        }
        if (id === 'pscip') return texto.toUpperCase().replace(/\s+/g, '');
        return normalize(texto.replace(/\s+/g, ' '));
      }

      function coletarAlteracoesCorrecao_() {
        if (!recordCorrectionFields) return [];
        const alteracoes = [];
        recordCorrectionFields.querySelectorAll('[data-correction-id]').forEach(el => {
          const id = String(el.dataset.correctionId || '');
          const original = recordCorrectionOriginal.get(id);
          if (!original) return;
          // Em selects estritos, um valor legado que não faça parte das opções não é apagado
          // apenas por abrir o formulário; só muda se o militar realmente selecionar algo.
          if (el.dataset.correctionKind === 'select' && !el.dataset.correctionTouched && !el.dataset.correctionInitialValid) return;
          const novo = String(el.value == null ? '' : el.value).trim();
          if (normalizarComparacaoCorrecao_(id, original.valor) === normalizarComparacaoCorrecao_(id, novo)) return;
          alteracoes.push({
            id,
            rotulo: original.campo.rotulo,
            anterior: original.valor,
            novo
          });
        });
        return alteracoes;
      }

      function validarAlteracoesCorrecao_(alteracoes) {
        for (const item of alteracoes) {
          const valor = String(item.novo || '').trim();
          if (item.id === 'documentoEstabelecimento' && valor) {
            const d = digits(valor);
            if (![11, 14].includes(d.length)) return 'O CNPJ/CPF do estabelecimento deve conter 11 ou 14 dígitos.';
          }
          if (item.id === 'cpfResponsavel' && valor && digits(valor).length !== 11) {
            return 'O CPF do responsável deve conter 11 dígitos.';
          }
          if (item.id === 'eventoOrganizadorDocumento' && valor && ![11,14].includes(digits(valor).length)) {
            return 'O CPF/CNPJ do organizador deve conter 11 ou 14 dígitos.';
          }
          if (item.id === 'pscip' && valor && !pscipProjetoValido_(valor)) {
            return 'O Nº do PSCIP / Projeto deve usar PRJ + 10 números ou processo antigo, como 44/2016.';
          }
          if (item.id === 'nascimento' && valor) {
            const m = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (!m) return 'A Data de nascimento deve estar no formato DD/MM/AAAA.';
            const dia = Number(m[1]);
            const mes = Number(m[2]);
            const ano = Number(m[3]);
            const data = new Date(ano, mes - 1, dia);
            if (
              data.getFullYear() !== ano ||
              data.getMonth() !== mes - 1 ||
              data.getDate() !== dia
            ) return 'Informe uma Data de nascimento válida no formato DD/MM/AAAA.';
          }
          if (item.id === 'eventoClassificacao' && valor && !['Risco mínimo','Risco baixo','Risco médio'].some(v => normalize(v) === normalize(valor))) {
            return 'Em evento declaratório, a classificação deve ser Risco mínimo, Risco baixo ou Risco médio.';
          }
        }
        return '';
      }

      function resumoAlteracoesCorrecao_(alteracoes, motivo) {
        const max = 10;
        const linhas = alteracoes.slice(0, max).map(item => {
          const anterior = item.anterior || '—';
          const novo = item.novo || '—';
          return `• ${item.rotulo}: ${anterior} → ${novo}`;
        });
        if (alteracoes.length > max) linhas.push(`• + ${alteracoes.length - max} outra(s) alteração(ões)`);
        linhas.push('', `Motivo: ${motivo}`);
        return linhas.join('\n');
      }

      async function salvarCorrecaoRegistro_() {
        if (!recordCorrectionRegistroAtual || !recordsState.chaveSelecionada) return;
        const motivo = String(recordCorrectionReason?.value || '').replace(/\s+/g, ' ').trim();
        if (motivo.length < 5) {
          if (recordCorrectionMessage) {
            recordCorrectionMessage.textContent = 'Informe o motivo da correção com pelo menos 5 caracteres.';
            recordCorrectionMessage.className = 'record-correction-message error';
          }
          recordCorrectionReason?.focus();
          return;
        }
        const alteracoes = coletarAlteracoesCorrecao_();
        if (!alteracoes.length) {
          if (recordCorrectionMessage) {
            recordCorrectionMessage.textContent = 'Nenhum dado foi alterado.';
            recordCorrectionMessage.className = 'record-correction-message error';
          }
          return;
        }
        const erroValidacao = validarAlteracoesCorrecao_(alteracoes);
        if (erroValidacao) {
          if (recordCorrectionMessage) {
            recordCorrectionMessage.textContent = erroValidacao;
            recordCorrectionMessage.className = 'record-correction-message error';
          }
          return;
        }
        if (!navigator.onLine) {
          if (recordCorrectionMessage) {
            recordCorrectionMessage.textContent = 'A correção de uma vistoria encerrada exige conexão com a internet.';
            recordCorrectionMessage.className = 'record-correction-message error';
          }
          return;
        }

        const confirmar = await confirmarGpv_(
          resumoAlteracoesCorrecao_(alteracoes, motivo),
          'Confirmar correção da vistoria',
          { rotuloConfirmar: 'Salvar correção', rotuloCancelar: 'Voltar e revisar' }
        );
        if (!confirmar) return;

        if (recordCorrectionSaveBtn) recordCorrectionSaveBtn.disabled = true;
        if (recordCorrectionMessage) {
          recordCorrectionMessage.textContent = 'Salvando correções e registrando auditoria...';
          recordCorrectionMessage.className = 'record-correction-message';
        }

        const chaveAnterior = recordsState.chaveSelecionada;
        const linhaHint = Number(recordsState.linhaSelecionada || recordCorrectionRegistroAtual?.linhaAtual || 0);
        try {
          const resposta = await apiRequest('config', {
            consulta: 'registro_corrigir',
            chave: chaveAnterior,
            linhaHint,
            motivo,
            dispositivo: nomeDispositivo_(),
            alteracoes: Object.fromEntries(alteracoes.map(item => [item.id, item.novo]))
          }, 65000);
          fecharCorrecaoRegistro_();
          limparCachesConsulta_();
          const novaChave = String(resposta?.chave || chaveAnterior);
          appStatus.textContent = `${Number(resposta?.alteracoes || alteracoes.length)} correção(ões) salva(s) na vistoria e registrada(s) na auditoria.`;
          await abrirDetalheRegistro_(novaChave, Number(resposta?.linha || linhaHint));
          if (document.body.classList.contains('records-mode')) void carregarRegistros_(false, { forcar: true, motivo: 'registro corrigido' });
        } catch (erro) {
          if (recordCorrectionMessage) {
            recordCorrectionMessage.textContent = erro?.message || 'Não foi possível salvar as correções.';
            recordCorrectionMessage.className = 'record-correction-message error';
          }
        } finally {
          if (recordCorrectionSaveBtn) recordCorrectionSaveBtn.disabled = false;
        }
      }

      function renderizarFichaRegistro_(registro) {
        const situacao = registro?.situacaoAtual || 'Sem situação';
        const estabelecimento = registro?.titulo || valorCampoFicha_(registro, 'Nome Fantasia', 'Razão Social') || '—';
        const eventoDeclaracaoFicha = valorCampoFicha_(registro, 'Nº da declaração INFOSCIP');
        const eventoFicha = Boolean(eventoDeclaracaoFicha) || normalize(valorCampoFicha_(registro, 'Demanda')).includes(normalize('Eventos declaratórios'));
        const cnpj = valorCampoFicha_(registro, 'CNPJ');
        const cpfRegistro = valorCampoFicha_(registro, 'CPF');
        const identificadorRegistro = eventoFicha ? '' : (cnpj || (cpfRegistro ? formatarCpfTela_(cpfRegistro) : ''));
        const rotuloIdentificador = cnpj ? 'CNPJ' : (cpfRegistro && !eventoFicha ? 'CPF' : 'CNPJ / CPF');
        const razaoSocial = valorCampoFicha_(registro, 'Razão Social');
        const idsProjetoFicha = identificadoresProjetoFicha_(registro);
        const processo = [
          ['PSCIP atual', idsProjetoFicha.atual],
          ['Processo antigo', idsProjetoFicha.antigo],
          ['Nº do PF', valorCampoFicha_(registro, 'Nº do PF')],
          ['Demanda', valorCampoFicha_(registro, 'Demanda')],
          ['Data de renovação do AVCB', valorCampoFicha_(registro, 'Data de renovação do AVCB')],
          ['Situação do licenciamento', valorCampoFicha_(registro, 'Situação do licenciamento')],
          ['Situação atual do PSCIP', valorCampoFicha_(registro, 'Situação atual do PSCIP')],
          ['Nº DDU', valorCampoFicha_(registro, 'Nº DDU')],
          ['Resultado da vistoria acessória', valorCampoFicha_(registro, 'Resultado da vistoria acessória')],
          ['Situação anterior do PF', valorCampoFicha_(registro, 'Situação anterior do PF')],
          ['Documento de licenciamento', valorCampoFicha_(registro, 'Documento de licenciamento da acessória')],
          ['Tipo da liberação', valorCampoFicha_(registro, 'Tipo da liberação')],
          ['Área/trecho liberado', valorCampoFicha_(registro, 'Área/trecho liberado')],
          ['Área liberada parcialmente (m²)', valorCampoFicha_(registro, 'Área liberada parcialmente (m²)')],
          ['Tipo de vistoria', valorCampoFicha_(registro, 'Tipo de vistoria')],
          ['Data da vistoria', valorCampoFicha_(registro, 'Data e hora')],
          ['REDS', valorCampoFicha_(registro, 'REDS')],
          ['Enviado por', valorCampoFicha_(registro, 'Enviado por')],
          ['Pendência documental', valorCampoFicha_(registro, 'Pendência documental')],
          ['Situação de multa no INFOSCIP', valorCampoFicha_(registro, 'Situação de multa no INFOSCIP')],
          ['Multa conferida em', valorCampoFicha_(registro, 'Multa conferida em')],
          ['Multa conferida por', valorCampoFicha_(registro, 'Multa conferida por')]
        ];
        const local = [
          ['Estabelecimento', estabelecimento],
          ['Razão Social', razaoSocial && normalize(razaoSocial) !== normalize(estabelecimento) ? razaoSocial : ''],
          [rotuloIdentificador, identificadorRegistro],
          ['Endereço da edificação', enderecoFicha_(registro)],
          ['Endereço para correspondência', valorCampoFicha_(registro, 'Endereço para correspondência')],
          ['Área (m²)', valorCampoFicha_(registro, 'Área m²', 'Área')],
          ['Pavimentos', valorCampoFicha_(registro, 'Pavimentos')],
          ['Altura (m)', valorCampoFicha_(registro, 'Altura')],
          ['Ocupação / Divisão', valorCampoFicha_(registro, 'Ocupação', 'Ocupação / Divisão', 'Divisão')],
          ['Situação do licenciamento', valorCampoFicha_(registro, 'Situação do licenciamento')],
          ['Situação atual do PSCIP', valorCampoFicha_(registro, 'Situação atual do PSCIP')]
        ];
        const localizacao = registro?.localizacao && String(registro.localizacao.coordenadas || '').trim()
          ? [['Coordenadas', String(registro.localizacao.coordenadas || '').trim()]]
          : [];
        const responsavel = [
          ['Responsável / vínculo', valorCampoFicha_(registro, 'Responsável')],
          ['Nome', valorCampoFicha_(registro, 'Nome')],
          ['RG', valorCampoFicha_(registro, 'RG')],
          ['CPF', valorCampoFicha_(registro, 'CPF')],
          ['Mãe', valorCampoFicha_(registro, 'Mãe')],
          ['Data de nascimento', formatarDataNascimentoFicha_(valorCampoFicha_(registro, 'Nascimento', 'Data de nascimento'))],
          ['Profissão', valorCampoFicha_(registro, 'Profissão')],
          ['Estado civil', valorCampoFicha_(registro, 'Estado civil')],
          ['Escolaridade', valorCampoFicha_(registro, 'Escolaridade')],
          ['Telefone', valorCampoFicha_(registro, 'Telefone')],
          ['E-mail', valorCampoFicha_(registro, 'E-mail')],
          ['Endereço do responsável', valorCampoFicha_(registro, 'Endereço do responsável', 'Endereço do envolvido')]
        ];
        const eventoDeclaratorio = [
          ['Nº da declaração INFOSCIP', valorCampoFicha_(registro, 'Nº da declaração INFOSCIP')],
          ['Classificação do evento', valorCampoFicha_(registro, 'Classificação do evento')],
          ['Nome do evento', valorCampoFicha_(registro, 'Nome do evento')],
          ['Início', valorCampoFicha_(registro, 'Início do evento')],
          ['Término', valorCampoFicha_(registro, 'Término do evento')],
          ['Público estimado', valorCampoFicha_(registro, 'Público estimado')],
          ['Organizador', valorCampoFicha_(registro, 'Organizador do evento')],
          ['CPF/CNPJ do organizador', valorCampoFicha_(registro, 'CPF/CNPJ do organizador')],
          ['Telefone', valorCampoFicha_(registro, 'Telefone do organizador')]
        ];

        const sugestao = registro?.sugestaoFiscalizacao || null;
        const controleSugestao = registro?.controleSugestaoFiscalizacao || null;
        const observacoesSugestao = Array.isArray(controleSugestao?.observacoes)
          ? controleSugestao.observacoes
          : (Array.isArray(sugestao?.observacoesControle) ? sugestao.observacoesControle : []);

        const blocoObservacoesSugestao = observacoesSugestao.length
          ? `<section class="record-suggestion-observations">
              <strong>Observações operacionais da edificação</strong>
              ${observacoesSugestao.slice(-6).map(obs => `<div class="record-suggestion-observation-item">
                <p>${escapeHtml(obs.observacao || '')}</p>
                <small>${[obs.registradoEm, obs.usuario].filter(Boolean).map(escapeHtml).join(' • ')}</small>
              </div>`).join('')}
            </section>`
          : '';

        const avisoControleSugestao = controleSugestao?.regularizadaManualmente
          ? `<section class="record-suggestion-manual-regularized">
              <div>
                <strong>✓ Sugestão encerrada — regularização informada</strong>
                <p>Este endereço foi retirado manualmente das Sugestões de Fiscalização.</p>
                <small>${[
                  controleSugestao.registradoEm ? `Registrado em ${controleSugestao.registradoEm}` : '',
                  controleSugestao.usuario ? `por ${controleSugestao.usuario}` : '',
                  controleSugestao.observacao ? `Observação: ${controleSugestao.observacao}` : ''
                ].filter(Boolean).join(' • ')}</small>
              </div>
              ${usuarioPodeOperar_() ? '<button type="button" class="btn btn-secondary" data-ficha-reopen-suggestion>Reabrir sugestão</button>' : ''}
            </section>`
          : '';

        const avisoSugestao = avisoControleSugestao || (sugestao ? `<section class="record-suggestion-callout priority-${classePrioridadeSugestao_(sugestao.prioridade)}">
          <div><strong>Nova fiscalização sugerida — ${escapeHtml(sugestao.prioridade || 'Acompanhamento')}</strong>
          <p>${escapeHtml(sugestao.motivo || 'Há histórico que recomenda nova verificação do local.')}</p>
          ${registro?.avisoHistorico ? `<small>${escapeHtml(registro.avisoHistorico)}</small>` : ''}</div>
          ${usuarioPodeOperar_() ? `<button type="button" class="btn btn-primary" data-ficha-program-suggestion>Programar vistoria</button>` : ''}
        </section>` : (registro?.avisoHistorico ? `<section class="record-history-reset-note">${escapeHtml(registro.avisoHistorico)}</section>` : ''));

        recordDetailGroups.innerHTML =
          avisoSugestao +
          blocoObservacoesSugestao +
          montarBlocoRetornoLiberacaoFicha_(registro) +
          montarGrupoFicha_('Resumo operacional', resumoOperacionalFicha_(registro, situacao), 'record-operational-summary') +
          montarGrupoFicha_('Processo', processo) +
          montarGrupoFicha_('Evento declaratório', eventoDeclaratorio) +
          montarGrupoFicha_('Edificação', local) +
          montarGrupoFicha_('Localização capturada', localizacao, 'record-location-captured') +
          montarGrupoFicha_(eventoFicha ? 'Responsável que acompanhou a vistoria' : 'Responsável', responsavel);

        recordDetailTitle.textContent = 'Ficha do Processo';
        recordDetailSubtitle.textContent = descricaoSituacaoPainel_(situacao);
        recordDetailLine.textContent = [estabelecimento, eventoFicha && eventoDeclaracaoFicha ? `Declaração ${eventoDeclaracaoFicha}` : identificadorRegistro].filter(Boolean).join(' • ');
        recordDetailStatusBadge.textContent = situacao;
        recordDetailStatusBadge.className = `status-badge ${classeStatus_(situacao)}`;
        if (recordCurrentStatus) recordCurrentStatus.className = `record-current-status ${classeStatus_(situacao)}`;
        configurarCorrecaoFicha_(registro);
        configurarAtualizacaoInfoscipFicha_(registro);
        renderizarNotificacoesFicha_(registro);
        renderizarRelatorioReds_(registro, situacao);
        renderizarWhatsAppFicha_(registro);
        renderizarHistorico_(registro?.historico || []);
        renderizarAuditoriaRegistro_(registro?.auditoria || []);
        atualizarLinkPlanilha_(registro?.planilhaUrl || '');
        aplicarPermissoesInterface_();
      }

      function estadoCarregandoFicha_(mensagem = 'Carregando ficha do processo...') {
        recordDetailScreen?.classList.add('is-detail-loading');
        recordDetailScreen?.classList.remove('is-detail-error');
        recordDetailLoading.hidden = false;
        recordDetailLoading.innerHTML = `<div class="record-detail-loader-card" role="status" aria-live="polite"><div class="record-detail-loader-bar"><span></span></div><strong>${escapeHtml(mensagem)}</strong><small>Consultando os dados do processo.</small></div>`;
      }

      function estadoErroFicha_(mensagem) {
        recordDetailScreen?.classList.remove('is-detail-loading');
        recordDetailScreen?.classList.add('is-detail-error');
        recordDetailLoading.hidden = false;
        recordDetailLoading.innerHTML = `<div class="record-detail-error-card"><strong>Não foi possível carregar a ficha.</strong><p>${escapeHtml(mensagem || 'A consulta demorou mais que o esperado.')}</p><button type="button" class="record-detail-retry-btn" data-retry-record-detail> Tentar novamente </button></div>`;
      }

      async function consultarRegistroComRetry_(chave, linhaHint = 0, modoRapido = true) {
        let ultimoErro = null;
        for (let tentativa = 0; tentativa < 2; tentativa += 1) {
          try {
            if (tentativa > 0) {
              estadoCarregandoFicha_('Tentando novamente...');
              await new Promise(resolve => setTimeout(resolve, 350));
            }
            return await apiRequest('config', {
              consulta: 'registro',
              chave,
              linhaHint: Number(linhaHint || 0),
              modoRapido: modoRapido === true
            }, modoRapido ? 30000 : 50000);
          } catch (erro) {
            ultimoErro = erro;
            if (!navigator.onLine) break;
          }
        }
        throw ultimoErro || new Error('Não foi possível consultar o processo.');
      }

      async function carregarComplementosFicha_(chave, linhaHint, registroBase) {
        if (!navigator.onLine || !chave) return;
        try {
          const extras = await apiRequest('config', {
            consulta: 'registro_extras',
            chave,
            linhaHint: Number(linhaHint || 0)
          }, 50000);
          if (!extras || !Array.isArray(extras.historico) || !Array.isArray(extras.auditoria)) return;
          if (recordsState.chaveSelecionada !== chave || !recordDetailScreen?.classList.contains('show')) return;
          renderizarHistorico_(extras.historico || []);
          renderizarAuditoriaRegistro_(extras.auditoria || []);
          const completo = {
            ...(registroBase || {}),
            historico: extras.historico || [],
            auditoria: extras.auditoria || [],
            sugestaoFiscalizacao: extras.sugestaoFiscalizacao || registroBase?.sugestaoFiscalizacao || null,
            controleSugestaoFiscalizacao: extras.controleSugestaoFiscalizacao || registroBase?.controleSugestaoFiscalizacao || null,
            parcial: false
          };
          salvarCacheFicha_(chave, completo);
        } catch (erro) {
          // A ficha principal permanece utilizável mesmo se histórico/auditoria demorarem.
          console.warn('Complementos da ficha não carregados:', erro?.message || erro);
        }
      }

      async function abrirDetalheRegistro_(chave, linhaHint = 0, opcoes = {}) {
        if (!chave) return;
        const jaAberta = Boolean(recordDetailScreen?.classList.contains('show'));
        if (Object.prototype.hasOwnProperty.call(opcoes || {}, 'contexto')) recordDetailReturnContext = String(opcoes.contexto || '');
        else if (!jaAberta) recordDetailReturnContext = '';
        recordsState.chaveSelecionada = chave;
        recordsState.linhaSelecionada = Number(linhaHint || 0);
        marcarLinhaSelecionada_();
        recordDetailScreen.classList.add('show');
        recordDetailScreen.setAttribute('aria-hidden', 'false');
        document.body.classList.add('detail-open');
        if (recordInfoscipHistoryPanel) recordInfoscipHistoryPanel.hidden = true;
        if (recordInfoscipHistoryText) recordInfoscipHistoryText.value = '';
        if (recordInfoscipCopyStatus) recordInfoscipCopyStatus.textContent = '';
        if (recordRedsReportPanel) recordRedsReportPanel.hidden = true;
        if (recordRedsReportText) recordRedsReportText.value = '';
        if (recordWhatsappPanel) recordWhatsappPanel.hidden = true;
        if (recordWhatsappStatus) recordWhatsappStatus.textContent = '';
        recordWhatsappRegistroAtual = null;

        const cache = lerCacheFicha_(chave);
        if (cache?.registro) {
          recordDetailScreen.classList.remove('is-detail-loading', 'is-detail-error');
          recordDetailLoading.hidden = true;
          renderizarFichaRegistro_(cache.registro);
        } else {
          recordDetailGroups.innerHTML = '';
          recordHistoryTimeline.innerHTML = '';
          recordHistoryPanel.hidden = true;
          if (recordAuditList) recordAuditList.innerHTML = '';
          if (recordAuditPanel) recordAuditPanel.hidden = true;
          if (recordDetailStatusBadge) {
            recordDetailStatusBadge.textContent = 'Carregando';
            recordDetailStatusBadge.className = 'status-badge status-neutral';
          }
          if (recordDetailSubtitle) recordDetailSubtitle.textContent = '';
          if (recordDetailLine) recordDetailLine.textContent = '';
          estadoCarregandoFicha_('Abrindo dados principais...');
        }

        if (!navigator.onLine) {
          if (!cache?.registro) estadoErroFicha_('Sem internet e sem uma ficha recente salva neste aparelho.');
          return;
        }

        try {
          // Com linhaHint, o backend valida e lê somente a linha escolhida primeiro.
          const registro = await consultarRegistroComRetry_(chave, linhaHint, true);
          const registroParaRender = cache?.registro
            ? { ...registro, historico: cache.registro.historico || [], auditoria: cache.registro.auditoria || [] }
            : registro;
          recordDetailScreen.classList.remove('is-detail-loading', 'is-detail-error');
          recordDetailLoading.hidden = true;
          renderizarFichaRegistro_(registroParaRender);
          salvarCacheFicha_(chave, registroParaRender);
          void carregarComplementosFicha_(chave, registro?.linhaAtual || linhaHint, registroParaRender);
        } catch (erro) {
          if (cache?.registro) {
            appStatus.textContent = 'Ficha aberta com os dados recentes salvos; a atualização online não respondeu agora.';
          } else {
            const msg = String(erro?.message || 'Não foi possível abrir a ficha.').replace('O registro continua seguro neste aparelho.', '').trim();
            estadoErroFicha_(msg);
          }
        }
      }

      async function aguardarChaveUltimoRegistro_() {
        for (let tentativa = 0; tentativa < 24; tentativa += 1) {
          if (ultimoRegistroConsultaChave || !sendingQueue) break;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        return ultimoRegistroConsultaChave;
      }

      async function abrirRegistroSucessoNaPlanilha_() {
        if (!navigator.onLine) {
          avisarGpv_('O registro continua seguro no aparelho e será sincronizado quando a conexão voltar.', 'Painel indisponível sem internet', { tom: 'warning' });
          return;
        }
        const p = ultimoRegistroParaOrientacoes || {};
        const busca = p.cnpj || p.nomeFantasia || p.razaoSocial || '';
        mostrarVistaPlanilha_({ busca, carregar: false });
        recordsStatus.className = 'records-status loading';
        recordsStatus.textContent = 'Confirmando o registro enviado...';
        const chave = await aguardarChaveUltimoRegistro_();
        await carregarRegistros_(true, { forcar: true, motivo: 'confirmação do envio' });
        if (chave) {
          const item = (recordsState.itens || []).find(registro => registro.chave === chave);
          await abrirDetalheRegistro_(chave, Number(item?.linha || 0));
        }
      }

      function salvarRegistroOffline(payload) {
        payload._appCriadoEm = payload._appCriadoEm || new Date().toISOString();
        ultimoRegistroConsultaChave = '';
        ultimoRegistroParaOrientacoes = { ...payload };
        const registroEncerradoId = String(currentRecordId || payload._appRegistroId || '');
        enfileirarRegistro(payload);
        if (navigator.onLine) {
          apiRequest('config', {
            consulta: 'rascunho_encerrar',
            id: registroEncerradoId,
            payload
          }, 12000).catch(() => {});
        }
        encerrarEstadoLocalVistoria_(registroEncerradoId, payload);
        resetForm(true, true);
        mostrarSucesso(
          'Vistoria salva no aparelho',
          'A internet está indisponível. O registro foi guardado neste celular e ficará na fila para envio quando a conexão voltar.'
        );
        appStatus.textContent = 'Vistoria salva no aparelho — aguardando internet.';
      }

      function cargaLabel(valor) {
        const carga = String(valor || '').trim();
        return /^\d+$/.test(carga) ? carga + ' MJ/m²' : carga;
      }

      function valorOcupacao(item) {
        return item ? (item.divisao + ' - ' + item.descricao) : '';
      }

      const GRUPOS_OCUPACAO_CBMMG = Object.freeze({
        A: 'Residencial',
        B: 'Serviço de hospedagem',
        C: 'Comercial',
        D: 'Serviço profissional',
        E: 'Educacional e cultura física',
        F: 'Reunião de público',
        G: 'Serviço automotivo e assemelhados',
        H: 'Serviço de saúde e institucional',
        I: 'Indústria',
        J: 'Depósito',
        L: 'Explosivos',
        M: 'Especial'
      });

      function letraGrupoOcupacao(item) {
        return String(item?.divisao || '').split('-')[0].trim().toUpperCase();
      }

      function chaveBuscaOcupacao(item) {
        return normalize([
          letraGrupoOcupacao(item),
          item.grupo,
          item.descricao,
          item.divisao,
          item.carga
        ].filter(Boolean).join(' '));
      }

      function pontuarOcupacao(item, termoNormalizado) {
        const q = termoNormalizado;
        if (!q) return 1;

        const descricao = normalize(item.descricao);
        const grupo = normalize(item.grupo);
        const divisao = normalize(item.divisao);
        const letra = normalize(letraGrupoOcupacao(item));
        const palavrasDescricao = descricao.split(/[^a-z0-9]+/).filter(Boolean);

        if (divisao === q) return 1200;
        if (letra === q) return 1150;
        if (divisao.startsWith(q)) return 1100;
        if (descricao === q) return 1050;
        if (descricao.startsWith(q)) return 1000;
        if (palavrasDescricao.some(palavra => palavra.startsWith(q))) return 950;
        if (grupo === q) return 900;
        if (grupo.startsWith(q)) return 875;
        if (descricao.includes(q)) return 800;
        if (grupo.includes(q)) return 750;
        if (chaveBuscaOcupacao(item).includes(q)) return 600;
        return 0;
      }

      function grupoSugeridoOcupacao(itens, termoNormalizado) {
        if (!termoNormalizado || !itens.length) return null;
        const primeiro = itens[0];
        const pontuacao = pontuarOcupacao(primeiro, termoNormalizado);
        if (pontuacao < 875) return null;
        const letra = letraGrupoOcupacao(primeiro);
        return {
          letra,
          nome: GRUPOS_OCUPACAO_CBMMG[letra] || primeiro.grupo,
          melhor: primeiro
        };
      }

      function esconderResultadosOcupacao() {
        ocupacaoResultados.classList.remove('show');
        ocupacaoResultados.innerHTML = '';
        ocupacaoToggle?.setAttribute('aria-expanded', 'false');
      }

      function mostrarMetaOcupacao(item) {
        ocupacaoSelecionada = item || null;
        if (!item) {
          ocupacaoMeta.classList.remove('show');
          ocupacaoMeta.innerHTML = '';
          return;
        }
        ocupacaoMeta.innerHTML =
          '<strong>' + escapeHtml(item.grupo) + '</strong>' +
          ' &nbsp;•&nbsp; Divisão <strong>' + escapeHtml(item.divisao) + '</strong>' +
          ' &nbsp;•&nbsp; Carga de incêndio: <strong>' + escapeHtml(cargaLabel(item.carga)) + '</strong>';
        ocupacaoMeta.classList.add('show');
      }

      function localizarOcupacaoPorValor(texto) {
        const alvo = normalize(texto);
        if (!alvo) return null;
        return OCUPACOES_CBMMG.find(item =>
          normalize(valorOcupacao(item)) === alvo ||
          normalize(item.descricao) === alvo
        ) || null;
      }

      function separarOcupacoesTexto(texto) {
        return String(texto || '')
          .split(/\s*\|\s*/)
          .map(v => String(v || '').trim())
          .filter(Boolean);
      }

      function ocupacaoJaSelecionada(valor) {
        const alvo = normalize(valor);
        return ocupacoesSelecionadas.some(registro => normalize(registro.valor) === alvo);
      }

      function renderizarOcupacoesSelecionadas() {
        ocupacoesSelecionadasLista.innerHTML = '';
        if (!ocupacoesSelecionadas.length) {
          ocupacoesSelecionadasBox.classList.remove('show');
          return;
        }

        ocupacoesSelecionadas.forEach((registro, indice) => {
          const item = registro.item || localizarOcupacaoPorValor(registro.valor);
          const linha = document.createElement('div');
          linha.className = 'occupancy-chip';

          const principal = document.createElement('div');
          principal.className = 'occupancy-chip-main';

          if (item) {
            principal.innerHTML =
              '<strong>Grupo ' + escapeHtml(letraGrupoOcupacao(item)) + ' • ' +
              escapeHtml(item.divisao + ' — ' + item.grupo) + '</strong>' +
              '<span>' + escapeHtml(item.descricao) + '</span>' +
              '<small>Carga de incêndio: ' + escapeHtml(cargaLabel(item.carga)) + '</small>';
          } else {
            principal.innerHTML =
              '<strong>Ocupação informada manualmente</strong>' +
              '<span>' + escapeHtml(registro.valor) + '</span>';
          }

          const remover = document.createElement('button');
          remover.type = 'button';
          remover.className = 'occupancy-chip-remove';
          remover.setAttribute('aria-label', 'Remover ocupação');
          remover.textContent = '×';
          remover.addEventListener('click', () => {
            ocupacoesSelecionadas.splice(indice, 1);
            renderizarOcupacoesSelecionadas();
            scheduleDraftSave();
            pesquisarOcupacoes(ocupacaoInput.value);
          });

          linha.appendChild(principal);
          linha.appendChild(remover);
          ocupacoesSelecionadasLista.appendChild(linha);
        });

        ocupacoesSelecionadasBox.classList.add('show');
      }

      function adicionarOcupacaoValor(valor, item, salvar = true) {
        const texto = String(valor || '').trim();
        if (!texto || ocupacaoJaSelecionada(texto)) return false;

        ocupacoesSelecionadas.push({
          valor: texto,
          item: item || localizarOcupacaoPorValor(texto)
        });
        renderizarOcupacoesSelecionadas();

        if (salvar) scheduleDraftSave();
        return true;
      }

      function adicionarOcupacaoItem(item) {
        if (!item) return;
        adicionarOcupacaoValor(valorOcupacao(item), item);
        ocupacaoInput.value = '';
        ocupacaoSelecionada = null;
        mostrarMetaOcupacao(null);
        esconderResultadosOcupacao();
        setTimeout(() => ocupacaoInput.focus(), 0);
      }

      function adicionarOcupacaoManual(texto) {
        const valor = String(texto || '').trim();
        if (!valor) return;
        separarOcupacoesTexto(valor).forEach(parte => adicionarOcupacaoValor(parte, localizarOcupacaoPorValor(parte), false));
        renderizarOcupacoesSelecionadas();
        ocupacaoInput.value = '';
        ocupacaoSelecionada = null;
        mostrarMetaOcupacao(null);
        esconderResultadosOcupacao();
        scheduleDraftSave();
        setTimeout(() => ocupacaoInput.focus(), 0);
      }

      function ocupacaoTextoFinal() {
        const valores = ocupacoesSelecionadas.map(registro => registro.valor);
        const pendente = String(ocupacaoInput.value || '').trim();
        if (pendente && !valores.some(valor => normalize(valor) === normalize(pendente))) {
          valores.push(pendente);
        }
        return valores.join(' | ');
      }

      function restaurarOcupacoesSelecionadas(texto) {
        ocupacoesSelecionadas = [];
        separarOcupacoesTexto(texto).forEach(valor => {
          adicionarOcupacaoValor(valor, localizarOcupacaoPorValor(valor), false);
        });
        ocupacaoInput.value = '';
        ocupacaoSelecionada = null;
        mostrarMetaOcupacao(null);
        renderizarOcupacoesSelecionadas();
      }

      function selecionarOcupacao(item) {
        adicionarOcupacaoItem(item);
      }

      function selecaoOcupacaoPermitida(event) {
        if (ocupacaoArrastando) {
          event.preventDefault();
          event.stopPropagation();
          return false;
        }
        return true;
      }

      function pesquisarOcupacoes(termo, exibirListaCompleta = false) {
        const q = normalizarTermoOcupacao(termo);
        const oficiaisOrdenados = q
          ? OCUPACOES_CBMMG
              .map((item, indice) => ({ item, indice, pontos: pontuarOcupacao(item, q) }))
              .filter(resultado => resultado.pontos > 0)
              .filter(resultado => !ocupacaoJaSelecionada(valorOcupacao(resultado.item)))
              .sort((a, b) => b.pontos - a.pontos || a.indice - b.indice)
              .map(resultado => resultado.item)
          : OCUPACOES_CBMMG
              .filter(item => !ocupacaoJaSelecionada(valorOcupacao(item)));

        const oficiais = exibirListaCompleta ? oficiaisOrdenados : oficiaisOrdenados.slice(0, 10);

        const existentes = q
          ? ocupacoesExistentes
              .filter(v => normalize(v).includes(q))
              .filter(v => !ocupacaoJaSelecionada(v))
              .filter(v => !oficiais.some(item => normalize(valorOcupacao(item)) === normalize(v) || normalize(item.descricao) === normalize(v)))
              .slice(0, 3)
          : [];

        ocupacaoResultados.innerHTML = '';

        const grupoSugerido = grupoSugeridoOcupacao(oficiais, q);
        if (grupoSugerido) {
          const destaque = document.createElement('div');
          destaque.className = 'occupancy-group-suggestion';
          destaque.innerHTML =
            '<strong>Sugestão: Grupo ' + escapeHtml(grupoSugerido.letra) + ' — ' + escapeHtml(grupoSugerido.nome) + '</strong>' +
            'Melhor correspondência: ' + escapeHtml(grupoSugerido.melhor.divisao + ' — ' + grupoSugerido.melhor.descricao) + '.';
          ocupacaoResultados.appendChild(destaque);
        }

        oficiais.forEach(item => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'occupancy-option';
          btn.setAttribute('role', 'option');
          btn.innerHTML =
            '<strong>Grupo ' + escapeHtml(letraGrupoOcupacao(item)) + ' • ' + escapeHtml(item.divisao + ' — ' + item.grupo) + '</strong>' +
            '<span>' + escapeHtml(item.descricao) + '</span>' +
            '<small>Carga de incêndio: ' + escapeHtml(cargaLabel(item.carga)) + '</small>';
          const escolher = event => {
            if (!selecaoOcupacaoPermitida(event)) return;
            event.preventDefault();
            adicionarOcupacaoItem(item);
          };
          btn.addEventListener('click', escolher);
          ocupacaoResultados.appendChild(btn);
        });

        existentes.forEach(valor => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'occupancy-option';
          btn.setAttribute('role', 'option');
          btn.innerHTML =
            '<strong>Valor já utilizado na planilha</strong>' +
            '<span>' + escapeHtml(valor) + '</span>';
          const escolherExistente = event => {
            if (!selecaoOcupacaoPermitida(event)) return;
            event.preventDefault();
            adicionarOcupacaoManual(valor);
          };
          btn.addEventListener('click', escolherExistente);
          ocupacaoResultados.appendChild(btn);
        });

        const textoManual = String(termo || '').trim();
        if (textoManual && !ocupacaoJaSelecionada(textoManual)) {
          const manual = document.createElement('button');
          manual.type = 'button';
          manual.className = 'occupancy-add-manual';
          manual.innerHTML = '➕ Adicionar também como texto digitado: <strong>' + escapeHtml(textoManual) + '</strong>';
          const escolherManual = event => {
            if (!selecaoOcupacaoPermitida(event)) return;
            event.preventDefault();
            adicionarOcupacaoManual(textoManual);
          };
          manual.addEventListener('click', escolherManual);
          ocupacaoResultados.appendChild(manual);
        }

        if (!ocupacaoResultados.children.length) {
          const vazio = document.createElement('div');
          vazio.className = 'hint';
          vazio.style.padding = '10px';
          vazio.textContent = 'Nenhuma ocupação encontrada. Digite a ocupação e use a opção de adicionar como texto.';
          ocupacaoResultados.appendChild(vazio);
        }

        ocupacaoResultados.classList.add('show');
        ocupacaoToggle?.setAttribute('aria-expanded', 'true');
      }

      function sincronizarMetaOcupacao() {
        const item = localizarOcupacaoPorValor(ocupacaoInput.value);
        mostrarMetaOcupacao(item);
      }

      function fillDatalist(id, values) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = (values || []).filter(Boolean).map(v => '<option value="' + escapeAttr(v) + '"></option>').join('');
      }

      function fillSelect(id, values, placeholder) {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        el.innerHTML = '<option value="">' + escapeHtml(placeholder || 'Selecione') + '</option>' +
          (values || []).filter(Boolean).map(v => '<option value="' + escapeAttr(v) + '">' + escapeHtml(v) + '</option>').join('');
        if (current) el.value = current;
      }

      function fillCity(values) {
        const cities = (values || []).filter(Boolean);
        citySelect.innerHTML = cities.map(v => '<option value="' + escapeAttr(v) + '">' + escapeHtml(v) + '</option>').join('');
        if (!citySelect.options.length) citySelect.innerHTML = '<option value="Viçosa">Viçosa</option>';
        citySelect.value = appConfig?.padroes?.cidade || 'Viçosa';
        syncOtherCity();
      }

      function populateOptions(op) {
        fillCity(op.cidade);
        sancoesConfiguradas = (op.sancao || []).filter(v => normalize(v) !== normalize('Advertência'));
        demandasConfiguradas = (op.demandaPrincipal || []).filter(Boolean);
        atualizarOpcoesDemandaPorFluxo_();
        atualizarOpcoesSancaoPorFluxo_();
        fillDatalist('dlNatureza', op.natureza);
        fillSelect('categoriaMeta', (op.categoriaMeta || []).filter(Boolean), 'Nenhuma / não se aplica');
        atualizarVerificacaoMetasFiscalizacao_();
        ocupacoesExistentes = Array.from(new Set(
          (op.ocupacao || [])
            .filter(Boolean)
            .flatMap(valor => separarOcupacoesTexto(valor))
        ));
        fillDatalist('dlResponsavel', op.responsavel);
        fillDatalist('dlProfissao', op.profissao);
        fillDatalist('dlEstadoCivil', op.estadoCivil);
        fillDatalist('dlEscolaridade', op.escolaridade);
        fillDatalist('dlEnderecoCorrespondencia', op.enderecoCorrespondencia);
      }


      function preencherVistoriadores_(usuarios = usuariosAtivosApp) {
        const nomes = Array.from(new Set((usuarios || []).map(u => String(u?.nome || u || '').trim()).filter(Boolean)));
        const aplicar = select => {
          if (!select) return;
          const atual = String(select.value || '');
          select.innerHTML = '<option value="">Selecione</option>' + nomes.map(nome => `<option value="${escapeAttr(nome)}">${escapeHtml(nome)}</option>`).join('');
          if (atual && nomes.includes(atual)) select.value = atual;
        };
        aplicar(vistoriadorResponsavelSelect);
        aplicar(prepareVistoriador);
      }

      function aplicarCacheVistoriadores_() {
        let cache = [];
        try { cache = JSON.parse(localStorage.getItem(USERS_CACHE_STORAGE) || '[]'); } catch (_) { cache = []; }
        if (!Array.isArray(cache) || !cache.length) return false;
        usuariosAtivosApp = cache;
        preencherVistoriadores_();
        return true;
      }

      async function carregarUsuariosVistoriadores_() {
        const tinhaCache = aplicarCacheVistoriadores_();
        if (!navigator.onLine) {
          if (!tinhaCache && authState.usuario?.nome) {
            usuariosAtivosApp = [{ nome: authState.usuario.nome }];
            preencherVistoriadores_();
          }
          return;
        }
        try {
          const resposta = await apiRequest('users', {}, 12000);
          usuariosAtivosApp = Array.isArray(resposta?.usuarios)
            ? resposta.usuarios.filter(u => String(u?.perfil || 'GPV').toUpperCase() !== 'GERAL')
            : [];
          preencherVistoriadores_();
          try { localStorage.setItem(USERS_CACHE_STORAGE, JSON.stringify(usuariosAtivosApp)); } catch (_) {}
        } catch (erro) {
          if (!tinhaCache && authState.usuario?.nome) {
            usuariosAtivosApp = [{ nome: authState.usuario.nome }];
            preencherVistoriadores_();
          }
        }
      }

      function fluxoVistoriaAtual_() {
        const atual = normalize(value('tipoVistoria'));
        if (atual.includes('liberacao')) return 'liberacao';
        if (atual.includes('fiscalizacao')) return 'fiscalizacao';
        return '';
      }

      function ehFluxoLiberacao_() { return fluxoVistoriaAtual_() === 'liberacao'; }
      function ehFluxoFiscalizacao_() { return fluxoVistoriaAtual_() === 'fiscalizacao'; }


      function ehEventoDeclaratorio_() {
        return ehFluxoFiscalizacao_() && normalize(value('demandaPrincipal')) === normalize('Eventos declaratórios');
      }

      function ehVistoriaAcessoria_() {
        return ehFluxoFiscalizacao_() && normalize(value('demandaPrincipal')) === normalize('Vistoria Acessória');
      }

      function ehDemandaDdu_() {
        return ehFluxoFiscalizacao_() && normalize(value('demandaPrincipal')) === normalize('DDU');
      }

      function ehPet_() {
        return normalize(value('demandaPrincipal')) === normalize('PET');
      }

      function demandasPermitidasFiscalizacao_() {
        const opcoes = (demandasConfiguradas || []).filter(Boolean).slice();
        ['PET', 'Eventos declaratórios', 'Vistoria Acessória'].forEach(obrigatoria => {
          if (!opcoes.some(valor => normalize(valor) === normalize(obrigatoria))) opcoes.push(obrigatoria);
        });
        return opcoes.filter(valor => normalize(valor) !== normalize('Liberação'));
      }

      function demandasPermitidasLiberacao_() {
        return ['Liberação', 'PET'];
      }

      function atualizarHintDemandaPorFluxo_() {
        const hint = document.getElementById('demandaFluxoHint');
        if (!hint) return;
        const fluxo = fluxoVistoriaAtual_();
        const pet = ehPet_();
        if (fluxo === 'liberacao') {
          hint.innerHTML = pet
            ? '<strong>PET:</strong> Projeto de Evento Temporário. É um evento temporário que não se enquadra como Evento declaratório e seu fluxo inicial normal é Vistoria de Liberação.'
            : 'Para Projeto de Evento Temporário, selecione <strong>PET</strong>. PET não deve ser tratado como Evento declaratório e normalmente inicia por Vistoria de Liberação.';
        } else if (fluxo === 'fiscalizacao') {
          hint.innerHTML = pet
            ? '<strong>PET:</strong> use Fiscalização quando se tratar de fiscalização de um Projeto de Evento Temporário já existente. O fluxo inicial normal do PET é Vistoria de Liberação.'
            : 'Em Fiscalização, selecione <strong>Eventos declaratórios</strong> apenas para o fluxo específico desses eventos. Para fiscalizar um PET já existente, selecione <strong>PET</strong>.';
        } else {
          hint.textContent = 'Escolha primeiro o tipo de vistoria.';
        }
      }

      function atualizarOpcoesDemandaPorFluxo_() {
        const demanda = document.getElementById('demandaPrincipal');
        const fluxo = fluxoVistoriaAtual_();
        let opcoes = (demandasConfiguradas || []).filter(Boolean);

        if (fluxo === 'fiscalizacao') opcoes = demandasPermitidasFiscalizacao_();
        else if (fluxo === 'liberacao') opcoes = demandasPermitidasLiberacao_();

        fillDatalist('dlDemanda', opcoes);
        if (!demanda) {
          atualizarHintDemandaPorFluxo_();
          return;
        }

        const atual = normalize(demanda.value);
        if (fluxo === 'liberacao') {
          const pet = atual === normalize('PET');
          demanda.value = pet ? 'PET' : 'Liberação';
        } else if (fluxo === 'fiscalizacao' && atual === normalize('Liberação')) {
          demanda.value = '';
        }
        atualizarHintDemandaPorFluxo_();
      }

      function sincronizarTipoLiberacao_() {
        const liberacao = ehFluxoLiberacao_();
        if (tipoLiberacaoWrap) tipoLiberacaoWrap.hidden = !liberacao;
        if (!liberacao) {
          if (tipoLiberacaoSelect) tipoLiberacaoSelect.value = 'final';
          if (liberacaoParcialDescricaoWrap) liberacaoParcialDescricaoWrap.hidden = true;
          if (liberacaoParcialAreaWrap) liberacaoParcialAreaWrap.hidden = true;
          return;
        }
        if (tipoLiberacaoSelect && !tipoLiberacaoSelect.value) tipoLiberacaoSelect.value = 'final';
        const parcial = normalize(tipoLiberacaoSelect?.value) === normalize('parcial');
        if (liberacaoParcialDescricaoWrap) liberacaoParcialDescricaoWrap.hidden = !parcial;
        if (liberacaoParcialAreaWrap) liberacaoParcialAreaWrap.hidden = !parcial;
        if (!parcial) {
          if (liberacaoParcialDescricaoInput) liberacaoParcialDescricaoInput.value = '';
          if (liberacaoParcialAreaInput) liberacaoParcialAreaInput.value = '';
        }
      }

      function atualizarVinculoAcessoria_() {
        if (!acessoriaVinculoStatus) return;
        if (!ehVistoriaAcessoria_()) {
          acessoriaVinculoStatus.textContent = '';
          acessoriaVinculoStatus.className = 'lookup-status';
          return;
        }
        const pf = String(processPfInput?.value || '').trim();
        const vinculado = processoAcessoriaVinculado &&
          pf &&
          normalize(processoAcessoriaVinculado.pf || '') === normalize(pf);
        if (!vinculado) {
          acessoriaVinculoStatus.textContent = 'Localize e selecione um processo fiscalizatório anterior de local já autuado.';
          acessoriaVinculoStatus.className = 'lookup-status show info';
          return;
        }
        const c = processoAcessoriaVinculado;
        const auto = c.numeroAuto ? ` • Auto ${c.numeroAuto}` : '';
        acessoriaVinculoStatus.textContent = `PF ${c.pf} vinculado • situação atual: ${c.sancao || 'não informada'}${auto}`;
        acessoriaVinculoStatus.className = 'lookup-status show success';
      }

      function sincronizarVistoriaAcessoria_() {
        const acessoria = ehVistoriaAcessoria_();
        if (vistoriaAcessoriaWrap) vistoriaAcessoriaWrap.hidden = !acessoria;
        if (pscipLabel) pscipLabel.textContent = acessoria ? 'Nº do PSCIP / licenciamento' : 'Nº do PSCIP';
        if (processPfLabel) processPfLabel.textContent = acessoria ? 'Nº do PF anterior' : 'Nº do PF';
        if (!acessoria) {
          processoAcessoriaVinculado = null;
          if (acessoriaResultadoSelect) acessoriaResultadoSelect.value = '';
          if (acessoriaTipoLicencaSelect) acessoriaTipoLicencaSelect.value = '';
          if (acessoriaTipoLicencaWrap) acessoriaTipoLicencaWrap.hidden = true;
          atualizarVinculoAcessoria_();
          return;
        }
        const resultado = normalize(acessoriaResultadoSelect?.value || '');
        const sanadas = resultado === normalize('sanadas');
        const naoSanadas = resultado === normalize('nao_sanadas');
        const possuiLicenca = value('licenciamento') === 'possui';
        if (acessoriaTipoLicencaWrap) acessoriaTipoLicencaWrap.hidden = !(sanadas && possuiLicenca);
        if (!(sanadas && possuiLicenca) && acessoriaTipoLicencaSelect) acessoriaTipoLicencaSelect.value = '';
        if (sancaoSelect) {
          sancaoSelect.disabled = true;
          if (sanadas) sancaoSelect.value = 'Regularizado';
          else if (naoSanadas && processoAcessoriaVinculado?.sancao) {
            const atual = String(processoAcessoriaVinculado.sancao || '').trim();
            if (atual && !Array.from(sancaoSelect.options).some(op => normalize(op.value) === normalize(atual))) {
              const op = document.createElement('option'); op.value = atual; op.textContent = atual; sancaoSelect.appendChild(op);
            }
            sancaoSelect.value = atual;
          } else sancaoSelect.value = '';
        }
        if (acessoriaResultadoHint) acessoriaResultadoHint.textContent = naoSanadas
          ? 'As irregularidades persistem: o registro ficará vinculado ao PF anterior e não será gerada nova autuação automaticamente.'
          : 'Quando as irregularidades forem sanadas, a situação final só será Regularizado se não houver multa em aberto no INFOSCIP.';
        atualizarVinculoAcessoria_();
      }

      function sincronizarDemandasEspeciais_() {
        const ddu = ehDemandaDdu_();
        if (dduProtocolWrap) dduProtocolWrap.hidden = !ddu;
        if (ddu && dduProtocolInput && !dduProtocolInput.value && dduEmUsoNumero) dduProtocolInput.value = dduEmUsoNumero;
        sincronizarVistoriaAcessoria_();
        sincronizarTipoLiberacao_();
      }

      function formatarDocumentoEvento_(valor) {
        const d = digits(valor || '').slice(0, 14);
        if (d.length <= 11) {
          return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        }
        return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
      }

      function formatarTelefoneEvento_(valor) {
        let d = digits(valor || '').slice(0, 11);
        if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
        return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
      }

      function sincronizarResponsavelComOrganizadorEvento_() {
        if (!ehEventoDeclaratorio_() || !eventoResponsavelEhOrganizadorCheck?.checked) return;
        const cpfOrganizador = digits(eventoOrganizadorDocumentoInput?.value || '');
        if (cpfOrganizador.length !== 11) return;
        preenchendoResponsavelLookup = true;
        try {
          setResponsibleField_('cpf', cpfOrganizador, formatarCpfTela_);
          setResponsibleField_('nomeResponsavel', value('eventoOrganizador'));
          setResponsibleField_('telefone', value('eventoTelefoneOrganizador'), formatarTelefoneTela_);
          if (!value('responsavel')) setResponsibleField_('responsavel', 'Organizador do evento');
        } finally {
          preenchendoResponsavelLookup = false;
        }
        if (ehEventoDeclaratorio_()) agendarConsultaResponsavelPorCpf_();
        scheduleDraftSave();
      }

      function atualizarDisponibilidadeResponsavelOrganizadorEvento_() {
        if (!eventoResponsavelEhOrganizadorCheck) return;
        const evento = ehEventoDeclaratorio_();
        const cpfOrganizador = digits(eventoOrganizadorDocumentoInput?.value || '');
        const disponivel = evento && cpfOrganizador.length === 11;
        eventoResponsavelEhOrganizadorCheck.disabled = !disponivel;
        if (!disponivel) eventoResponsavelEhOrganizadorCheck.checked = false;
        if (eventoResponsavelEhOrganizadorHint) {
          eventoResponsavelEhOrganizadorHint.textContent = disponivel
            ? 'Marque para aproveitar CPF, nome e telefone do organizador pessoa física. Os demais dados continuam disponíveis para conferência.'
            : 'Disponível quando o organizador estiver identificado por CPF.';
        }
        if (disponivel && eventoResponsavelEhOrganizadorCheck.checked) sincronizarResponsavelComOrganizadorEvento_();
      }

      function linkItContextual_(numero, titulo, subtitulo = '') {
        const n = String(numero).padStart(2, '0');
        const extra = subtitulo ? `<small>${escapeHtml(subtitulo)}</small>` : '';
        return `<a class="technical-it-shortcut" data-it-context-link href="instrucoes-tecnicas/its/it-${n}.html" aria-label="Abrir IT ${n} — ${escapeAttr(titulo)}">
          <span class="technical-it-number">IT ${n}</span>
          <span class="technical-it-copy"><strong>${escapeHtml(titulo)}</strong>${extra}</span>
          <span class="technical-it-arrow" aria-hidden="true">›</span>
        </a>`;
      }

      function atualizarConsultaTecnicaContextual_() {
        if (!consultaTecnicaSecao || !consultaTecnicaRelacionadas) return;
        const fluxo = fluxoVistoriaAtual_();
        const evento = fluxo === 'fiscalizacao' && ehEventoDeclaratorio_();
        consultaTecnicaSecao.hidden = !fluxo;
        if (!fluxo) return;

        const itens = [];
        if (evento) {
          itens.push([33, 'Eventos Temporários', 'Requisitos próprios dos eventos temporários']);
          itens.push([45, 'Fiscalização', 'Fiscalização em eventos temporários']);
          if (consultaTecnicaDescricao) consultaTecnicaDescricao.textContent = 'Atalhos relacionados ao evento declaratório atual. A consulta não altera o preenchimento da vistoria.';
        } else if (fluxo === 'fiscalizacao') {
          itens.push([45, 'Fiscalização', 'Procedimentos de fiscalização']);
          if (consultaTecnicaDescricao) consultaTecnicaDescricao.textContent = 'Acesso rápido à norma de fiscalização e às medidas de segurança mais consultadas em campo.';
        } else {
          itens.push([1, 'Procedimentos Administrativos', 'Consulta durante a vistoria de liberação']);
          if (consultaTecnicaDescricao) consultaTecnicaDescricao.textContent = 'Acesso rápido aos procedimentos administrativos e às medidas de segurança mais consultadas durante a liberação.';
        }

        const categoria = normalize(value('categoriaMeta'));
        if (categoria.includes(normalize('Brigada')) && !itens.some(item => item[0] === 12)) {
          itens.push([12, 'Brigada de Incêndio', 'Categoria informada nesta vistoria']);
        }
        consultaTecnicaRelacionadas.innerHTML = itens.map(item => linkItContextual_(...item)).join('');
      }

      function aplicarModoEventoDeclaratorio_(opcoes = {}) {
        const fluxo = fluxoVistoriaAtual_();
        const evento = fluxo === 'fiscalizacao' && normalize(value('demandaPrincipal')) === normalize('Eventos declaratórios');
        if (eventosDeclaratoriosSecao) eventosDeclaratoriosSecao.hidden = !evento;
        if (demandaFiscalizacaoWrap) demandaFiscalizacaoWrap.hidden = !fluxo;
        if (licenciamentoFieldWrap) licenciamentoFieldWrap.hidden = fluxo === 'liberacao' || evento;
        if (possuiPscipFieldWrap) possuiPscipFieldWrap.hidden = fluxo === 'liberacao' || evento;

        if (estabelecimentoDocumentoWrap) estabelecimentoDocumentoWrap.hidden = evento;
        if (nomeFantasiaWrap) nomeFantasiaWrap.hidden = evento;
        if (razaoSocialWrap) razaoSocialWrap.hidden = evento;
        if (enderecoCorrespondenciaWrap) enderecoCorrespondenciaWrap.hidden = evento;
        if (responsavelSecao) responsavelSecao.hidden = !fluxo;
        if (edificacaoSecao) edificacaoSecao.hidden = evento || !fluxo;
        if (situacaoMultaInfoscipWrap) situacaoMultaInfoscipWrap.hidden = evento;
        if (categoriaMetaWrap) categoriaMetaWrap.hidden = evento;

        if (estabelecimentoTitulo) estabelecimentoTitulo.textContent = evento ? '3. Local do evento' : '2. Identificação e dados do estabelecimento';
        if (estabelecimentoDescricao) estabelecimentoDescricao.textContent = evento
          ? 'Informe o endereço real onde o evento será realizado. Este endereço é a principal referência para localizar o histórico do local.'
          : 'Digite CNPJ ou CPF. O aplicativo identifica o documento automaticamente.';
        if (responsavelTitulo) responsavelTitulo.textContent = evento ? '4. Responsável que acompanhou a vistoria' : '3. Responsável';
        if (responsavelDescricao) responsavelDescricao.textContent = evento
          ? 'Informe a pessoa que acompanhou a guarnição durante a fiscalização. Ela pode ser diferente do organizador do evento.'
          : 'Todos os dados pessoais existentes na planilha. No registro rápido, somente Nome e Mãe são obrigatórios.';
        if (processoTitulo) processoTitulo.textContent = evento ? '5. Processo e vistoria' : '4. Processo e vistoria';
        if (responsavelCpfWrap) {
          responsavelCpfWrap.style.order = evento ? '-20' : '';
          responsavelCpfWrap.classList.toggle('wide', evento);
        }
        if (responsavelTelefoneWrap) responsavelTelefoneWrap.style.order = evento ? '-19' : '';
        if (responsavelTelefoneLookupHint) responsavelTelefoneLookupHint.hidden = evento;
        if (responsavelLookupStatus) responsavelLookupStatus.hidden = evento;
        if (responsavelLookupResultados) responsavelLookupResultados.hidden = evento;
        if (responsavelCpfLookupHint) responsavelCpfLookupHint.hidden = !evento;
        if (responsavelCpfLookupStatus) responsavelCpfLookupStatus.hidden = !evento;
        if (responsavelCpfLookupResultados && !evento) {
          responsavelCpfLookupResultados.hidden = true;
          responsavelCpfLookupResultados.innerHTML = '';
        }
        atualizarDisponibilidadeResponsavelOrganizadorEvento_();

        if (categoriaMetaSelect) {
          categoriaMetaSelect.disabled = evento;
          if (evento) categoriaMetaSelect.value = 'Eventos declaratórios';
          else if (normalize(categoriaMetaSelect.value) === normalize('Eventos declaratórios') && normalize(value('demandaPrincipal')) !== normalize('Eventos declaratórios')) categoriaMetaSelect.value = '';
        }
        if (evento && situacaoMultaInfoscipSelect) situacaoMultaInfoscipSelect.value = 'Não conferido';

        atualizarOpcoesSancaoPorFluxo_();
        if (evento && sancaoSelect && !['Regularizado','Autuado'].some(v => normalize(v) === normalize(sancaoSelect.value))) sancaoSelect.value = '';
        atualizarVerificacaoMetasFiscalizacao_();
        syncLicenciamento();
        if (evento) {
          esconderAvisoEncerramentoFiscal_();
          agendarConsultaProcessoPf_('form', 100);
        }
        atualizarConsultaTecnicaContextual_();
        sincronizarDemandasEspeciais_();
        atualizarCampoRenovacaoAvcb_();
        if (!opcoes.silencioso) scheduleDraftSave();
      }

      function numeroAreaM2_(valor) {
        let texto = String(valor == null ? '' : valor).trim().replace(/\s+/g, '');
        if (!texto) return NaN;
        texto = texto.replace(/[^0-9,.-]/g, '');
        const temVirgula = texto.includes(',');
        const temPonto = texto.includes('.');
        if (temVirgula && temPonto) {
          if (texto.lastIndexOf(',') > texto.lastIndexOf('.')) texto = texto.replace(/\./g, '').replace(',', '.');
          else texto = texto.replace(/,/g, '');
        } else if (temVirgula) {
          const partes = texto.split(',');
          texto = partes.length > 2 ? partes.join('') : `${partes[0]}.${partes[1] || ''}`;
        } else if (temPonto) {
          const partes = texto.split('.');
          if (partes.length > 2) texto = partes.join('');
          else if (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3) texto = partes.join('');
        }
        const numero = Number(texto);
        return Number.isFinite(numero) ? numero : NaN;
      }

      function categoriaMetaComAreaParaExibicao_(payload = {}) {
        const partes = String(payload?.categoriaMeta || '')
          .split(/\s*\|\s*|\s*;\s*|\n+/)
          .map(v => String(v || '').trim())
          .filter(Boolean);
        const tipo = normalize(payload?.tipoVistoria || '');
        const fiscalizacao = tipo.includes('fiscalizacao');
        const area = numeroAreaM2_(payload?.area);
        if (fiscalizacao && Number.isFinite(area) && area > 930 && !partes.some(v => normalize(v) === normalize('Nível de risco III'))) {
          partes.push('Nível de risco III');
        }
        return partes.join(' | ');
      }

      function atualizarVerificacaoMetasFiscalizacao_() {
        const eventoDeclaratorio = ehEventoDeclaratorio_();
        const fiscalizacao = ehFluxoFiscalizacao_() && !eventoDeclaratorio;
        if (areaInput) areaInput.required = fiscalizacao;
        areaLabel?.classList.toggle('required', fiscalizacao);
        if (eventoDeclaratorio) {
          if (areaMetaStatus) { areaMetaStatus.className = 'lookup-status'; areaMetaStatus.textContent = ''; }
          if (categoriaMetaSelect) { categoriaMetaSelect.value = 'Eventos declaratórios'; categoriaMetaSelect.disabled = true; }
          return;
        }

        if (categoriaMetaSelect) {
          const opcaoNivel3 = Array.from(categoriaMetaSelect.options || []).find(op => normalize(op.value) === normalize('Nível de risco III'));
          if (opcaoNivel3) opcaoNivel3.disabled = fiscalizacao;
          if (fiscalizacao && normalize(categoriaMetaSelect.value) === normalize('Nível de risco III')) categoriaMetaSelect.value = '';
        }

        if (!areaMetaStatus) return;
        if (!fiscalizacao) {
          areaMetaStatus.className = 'lookup-status';
          areaMetaStatus.textContent = '';
          return;
        }

        const bruto = String(areaInput?.value || '').trim();
        const area = numeroAreaM2_(bruto);
        const categoriaManual = String(categoriaMetaSelect?.value || '').trim();
        if (!bruto) {
          areaMetaStatus.className = 'lookup-status show info';
          areaMetaStatus.textContent = 'Fiscalização: informe a área da edificação para verificar automaticamente o enquadramento nas metas.';
          return;
        }
        if (!Number.isFinite(area) || area <= 0) {
          areaMetaStatus.className = 'lookup-status show error';
          areaMetaStatus.textContent = 'Informe uma área válida em metros quadrados.';
          return;
        }
        if (area > 930) {
          areaMetaStatus.className = 'lookup-status show success';
          areaMetaStatus.textContent = `Meta verificada: ${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m² — enquadra-se automaticamente em Nível de risco III (> 930 m²)${categoriaManual ? ` e também mantém a categoria ${categoriaManual}` : ''}.`;
          return;
        }
        areaMetaStatus.className = 'lookup-status show info';
        areaMetaStatus.textContent = `Meta verificada: ${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m² — não se enquadra automaticamente em Nível de risco III pela regra de área${categoriaManual ? `. Categoria informada: ${categoriaManual}.` : '. Nenhuma outra categoria de meta foi selecionada.'}`;
      }

      function atualizarOpcoesSancaoPorFluxo_() {
        if (!sancaoSelect) return;
        const fluxo = fluxoVistoriaAtual_();
        const atual = String(sancaoSelect.value || '');
        let opcoes = [];
        if (fluxo === 'liberacao') {
          opcoes = ['Liberado', 'Notificado'];
        } else if (fluxo === 'fiscalizacao' && ehEventoDeclaratorio_()) {
          opcoes = ['Regularizado', 'Autuado'];
        } else if (fluxo === 'fiscalizacao' && ehVistoriaAcessoria_()) {
          opcoes = ['Regularizado'];
          const anterior = String(processoAcessoriaVinculado?.sancao || '').trim();
          if (anterior && !opcoes.some(v => normalize(v) === normalize(anterior))) opcoes.unshift(anterior);
        } else if (fluxo === 'fiscalizacao') {
          opcoes = (sancoesConfiguradas || []).filter(v => {
            const n = normalize(v);
            return n !== normalize('Advertência') &&
              n !== normalize('Notificado') &&
              n !== normalize('Liberado') &&
              !n.startsWith(normalize('Pendente'));
          });
          if (!opcoes.length) opcoes = ['Autuado', 'Regularizado'];
        } else {
          opcoes = [];
        }
        fillSelect('sancao', opcoes, fluxo ? 'Selecione' : 'Escolha primeiro o tipo de vistoria');
        if (atual && opcoes.some(v => normalize(v) === normalize(atual))) sancaoSelect.value = atual;
        if (ehVistoriaAcessoria_()) sincronizarVistoriaAcessoria_();
      }

      function aplicarFluxoVistoria_(fluxo, opcoes = {}) {
        const f = fluxo === 'liberacao' ? 'liberacao' : (fluxo === 'fiscalizacao' ? 'fiscalizacao' : '');
        if (tipoVistoriaInput) tipoVistoriaInput.value = f === 'liberacao' ? 'Vistoria de Liberação' : (f === 'fiscalizacao' ? 'Vistoria de Fiscalização' : '');
        fluxoFiscalizacaoBtn?.classList.toggle('is-active', f === 'fiscalizacao');
        fluxoLiberacaoBtn?.classList.toggle('is-active', f === 'liberacao');
        document.body.classList.toggle('release-flow-active', f === 'liberacao');
        document.body.classList.toggle('inspection-flow-active', f === 'fiscalizacao');
        fluxoFiscalizacaoBtn?.setAttribute('aria-pressed', f === 'fiscalizacao' ? 'true' : 'false');
        fluxoLiberacaoBtn?.setAttribute('aria-pressed', f === 'liberacao' ? 'true' : 'false');
        vistoriaFlowSections.forEach(sec => { sec.hidden = !f; });
        if (notificacoesLiberacaoSecao) notificacoesLiberacaoSecao.hidden = f !== 'liberacao';
        if (vistoriaBottomBar) vistoriaBottomBar.hidden = !f;
        if (fluxoVistoriaAtualTexto) {
          fluxoVistoriaAtualTexto.hidden = !f;
          fluxoVistoriaAtualTexto.textContent = f === 'liberacao'
            ? 'Fluxo selecionado: Vistoria de Liberação — resultado pretendido: Liberado ou Notificado. Pendências de multa impedem a liberação.'
            : (f === 'fiscalizacao' ? 'Fluxo selecionado: Vistoria de Fiscalização.' : '');
        }
        atualizarOpcoesDemandaPorFluxo_();
        atualizarOpcoesSancaoPorFluxo_();
        if (licenciamentoFieldWrap) licenciamentoFieldWrap.hidden = f === 'liberacao';
        if (possuiPscipFieldWrap) possuiPscipFieldWrap.hidden = f === 'liberacao';
        if (f === 'liberacao') {
          if (licenciamentoSelect) licenciamentoSelect.value = '';
          if (possuiPscipSelect) possuiPscipSelect.value = 'sim';
          syncPscip_();
          const demanda = document.getElementById('demandaPrincipal');
          if (demanda && (!demanda.value || [normalize('Fiscalização'), normalize('Eventos declaratórios')].includes(normalize(demanda.value)))) demanda.value = 'Liberação';
        } else {
          syncLicenciamento();
        }
        if (f === 'liberacao') agendarConsultaRetornoLiberacao_(300);
        else resetarRetornoLiberacao_();
        aplicarModoEventoDeclaratorio_({ silencioso: true });
        syncNotificado();
        atualizarVerificacaoMetasFiscalizacao_();
        if (!opcoes.silencioso && f) {
          document.getElementById('cidadeSecao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          scheduleDraftSave();
        }
      }

      function inferirFluxoDoRascunho_(p = {}) {
        const tipo = normalize(String(p.tipoVistoria || ''));
        if (tipo.includes('liberacao')) return 'liberacao';
        if (tipo.includes('fiscalizacao')) return 'fiscalizacao';
        const sancao = normalize(String(p.sancao || ''));
        if (sancao === normalize('Liberado') || sancao === normalize('Notificado')) return 'liberacao';
        return p.tipoVistoria || p.sancao ? 'fiscalizacao' : '';
      }


      function catalogoNotificacoesInfoscip_() {
        const catalogo = window.GPV_NOTIFICACOES_INFOSCIP || {};
        return {
          tiposLocal: Array.isArray(catalogo.tiposLocal) ? catalogo.tiposLocal : [],
          categorias: Array.isArray(catalogo.categorias) ? catalogo.categorias : []
        };
      }

      function novoIdNotificacao_(prefixo) {
        const aleatorio = Math.random().toString(36).slice(2, 9);
        return `${prefixo || 'notif'}_${Date.now().toString(36)}_${aleatorio}`;
      }

      function novaIrregularidadeNotificacao_() {
        return {
          id: novoIdNotificacao_('irr'),
          tipoIrregularidade: '',
          itemIrregular: '',
          descricao: '',
          textoTecnico: '',
          statusTecnico: 'pendente',
          fundamentoNormativo: null,
          fundamentosNormativos: [],
          fotos: [],
          decisaoRevisao: '',
          textoFinal: '',
          revisadoPor: '',
          revisadoEm: '',
          autorNome: String(authState.usuario?.nome || ''),
          autorId: String(authState.usuario?.id || ''),
          atualizadoEm: new Date().toISOString()
        };
      }

      function novoLocalNotificacao_() {
        return {
          id: novoIdNotificacao_('loc'),
          tipoLocal: '',
          complemento: '',
          irregularidades: [novaIrregularidadeNotificacao_()]
        };
      }

      function sanitizarEstruturaNotificacoesLocal_(entrada) {
        if (!entrada || typeof entrada !== 'object') return null;
        const irregularidadesOrigem = Array.isArray(entrada.irregularidades) ? entrada.irregularidades : [];
        const irregularidades = irregularidadesOrigem.slice(0, 80).map(item => ({
          id: String(item?.id || novoIdNotificacao_('irr')),
          tipoIrregularidade: String(item?.tipoIrregularidade || '').slice(0, 500),
          itemIrregular: String(item?.itemIrregular || '').slice(0, 500),
          descricao: String(item?.descricao || '').slice(0, 6000),
          textoTecnico: String(item?.textoTecnico || '').slice(0, 6000),
          statusTecnico: String(item?.statusTecnico || 'pendente').slice(0, 40),
          fundamentoNormativo: item?.fundamentoNormativo && typeof item.fundamentoNormativo === 'object' ? item.fundamentoNormativo : null,
          fundamentosNormativos: Array.isArray(item?.fundamentosNormativos) ? item.fundamentosNormativos.slice(0, 8) : [],
          fotos: Array.isArray(item?.fotos) ? item.fotos.slice(0, 20).map(foto => ({
            id: String(foto?.id || foto?.fileId || '').slice(0, 200),
            fileId: String(foto?.fileId || '').slice(0, 200),
            nome: String(foto?.nome || '').slice(0, 300),
            url: String(foto?.url || '').slice(0, 1500),
            estado: String(foto?.estado || '').slice(0, 40),
            temporaria: Boolean(foto?.temporaria),
            manter: Boolean(foto?.manter)
          })) : [],
          decisaoRevisao: String(item?.decisaoRevisao || '').slice(0, 40),
          textoFinal: String(item?.textoFinal || '').slice(0, 6000),
          revisadoPor: String(item?.revisadoPor || '').slice(0, 100),
          revisadoEm: String(item?.revisadoEm || ''),
          autorNome: String(item?.autorNome || '').slice(0, 100),
          autorId: String(item?.autorId || '').slice(0, 100),
          atualizadoEm: String(item?.atualizadoEm || '')
        }));
        return {
          id: String(entrada.id || novoIdNotificacao_('loc')),
          tipoLocal: String(entrada.tipoLocal || '').slice(0, 300),
          complemento: String(entrada.complemento || '').slice(0, 500),
          irregularidades
        };
      }

      function normalizarEstruturaNotificacoes_(valor) {
        let origem = valor;
        if (typeof origem === 'string') {
          const texto = origem.trim();
          if (!texto) return [];
          try { origem = JSON.parse(texto); } catch (erro) { return []; }
        }
        if (!Array.isArray(origem)) return [];
        return origem.slice(0, 40).map(sanitizarEstruturaNotificacoesLocal_).filter(Boolean);
      }

      function restaurarNotificacoesLiberacao_(valor) {
        notificacoesLiberacaoDraft = normalizarEstruturaNotificacoes_(valor);
        renderizarNotificacoesLiberacao_();
      }

      function serializarNotificacoesLiberacao_() {
        if (!notificacoesLiberacaoDraft.length) return '';
        try {
          return JSON.stringify(notificacoesLiberacaoDraft.map(local => ({
            tipoLocal: String(local.tipoLocal || '').trim(),
            complemento: String(local.complemento || '').trim(),
            irregularidades: (local.irregularidades || []).map(item => ({
              tipoIrregularidade: String(item.tipoIrregularidade || '').trim(),
              itemIrregular: String(item.itemIrregular || '').trim(),
              descricao: String(item.descricao || '').trim(),
              textoTecnico: String(item.textoTecnico || '').trim(),
              statusTecnico: String(item.statusTecnico || 'pendente'),
              fundamentoNormativo: item.fundamentoNormativo || null,
              fundamentosNormativos: Array.isArray(item.fundamentosNormativos) ? item.fundamentosNormativos : [],
              fotos: Array.isArray(item.fotos) ? item.fotos.map(foto => ({
                id: String(foto.id || foto.fileId || ''),
                fileId: String(foto.fileId || ''),
                nome: String(foto.nome || ''),
                url: String(foto.url || ''),
                estado: String(foto.estado || ''),
                temporaria: Boolean(foto.temporaria),
                manter: Boolean(foto.manter)
              })) : [],
              decisaoRevisao: String(item.decisaoRevisao || ''),
              textoFinal: String(item.textoFinal || '').trim(),
              revisadoPor: String(item.revisadoPor || ''),
              revisadoEm: String(item.revisadoEm || ''),
              autorNome: String(item.autorNome || ''),
              autorId: String(item.autorId || ''),
              atualizadoEm: String(item.atualizadoEm || '')
            }))
          })));
        } catch (erro) {
          return '';
        }
      }

      function localNotificacaoPorId_(id) {
        return notificacoesLiberacaoDraft.find(item => String(item.id) === String(id)) || null;
      }

      function irregularidadeNotificacaoPorId_(local, id) {
        return (local?.irregularidades || []).find(item => String(item.id) === String(id)) || null;
      }

      function localNotificacaoTemConteudo_(local) {
        if (!local) return false;
        if (String(local.tipoLocal || '').trim() || String(local.complemento || '').trim()) return true;
        return (local.irregularidades || []).some(irregularidadeNotificacaoTemConteudo_);
      }

      function irregularidadeNotificacaoTemConteudo_(item) {
        if (!item) return false;
        return Boolean(
          String(item.tipoIrregularidade || '').trim() ||
          String(item.itemIrregular || '').trim() ||
          String(item.descricao || '').trim()
        );
      }

      function notificacoesPossuemConteudo_() {
        return notificacoesLiberacaoDraft.some(localNotificacaoTemConteudo_);
      }

      function flattenNotificacoesLiberacao_(somenteComConteudo = true) {
        const itens = [];
        notificacoesLiberacaoDraft.forEach((local, indiceLocal) => {
          (local.irregularidades || []).forEach((irregularidade, indiceIrregularidade) => {
            if (somenteComConteudo && !irregularidadeNotificacaoTemConteudo_(irregularidade) && !String(local.tipoLocal || '').trim() && !String(local.complemento || '').trim()) return;
            itens.push({
              local,
              irregularidade,
              indiceLocal,
              indiceIrregularidade
            });
          });
        });
        return itens;
      }

      function itensCategoriaNotificacao_(categoria) {
        const chave = normalize(categoria);
        if (!chave) return [];
        const encontrado = catalogoNotificacoesInfoscip_().categorias.find(item => normalize(item?.tipo) === chave);
        return Array.isArray(encontrado?.itens) ? encontrado.itens : [];
      }

      function optionsHtmlNotificacao_(valores) {
        return (valores || []).map(valor => `<option value="${escapeAttr(valor)}"></option>`).join('');
      }

      function inicializarCatalogoNotificacoes_() {
        const catalogo = catalogoNotificacoesInfoscip_();
        if (dlNotificacaoTiposLocal) dlNotificacaoTiposLocal.innerHTML = optionsHtmlNotificacao_(catalogo.tiposLocal);
        if (dlNotificacaoCategorias) dlNotificacaoCategorias.innerHTML = optionsHtmlNotificacao_(catalogo.categorias.map(item => item.tipo));
      }

      function atualizarResumoNotificacoesLiberacao_() {
        if (!notificacoesLiberacaoResumo) return;
        const locaisComConteudo = notificacoesLiberacaoDraft.filter(localNotificacaoTemConteudo_);
        const irregularidades = flattenNotificacoesLiberacao_(true);
        if (!locaisComConteudo.length && !irregularidades.length) {
          notificacoesLiberacaoResumo.textContent = 'Nenhuma notificação adicionada.';
          return;
        }
        notificacoesLiberacaoResumo.textContent =
          `${locaisComConteudo.length} local${locaisComConteudo.length === 1 ? '' : 'is'} • ` +
          `${irregularidades.length} irregularidade${irregularidades.length === 1 ? '' : 's'} em rascunho`;
      }

      let baseNormativaITSCarregando_ = null;
      let baseNormativaITSExata_ = [];

      function indiceNormativoDisponivel_() {
        if (Array.isArray(baseNormativaITSExata_) && baseNormativaITSExata_.length) return baseNormativaITSExata_;
        if (Array.isArray(window.SEARCH_INDEX) && window.SEARCH_INDEX.length) return window.SEARCH_INDEX;
        return [];
      }

      async function carregarBaseNormativaITS_() {
        if (Array.isArray(baseNormativaITSExata_) && baseNormativaITSExata_.length) return baseNormativaITSExata_;
        if (baseNormativaITSCarregando_) return baseNormativaITSCarregando_;

        baseNormativaITSCarregando_ = (async () => {
          // Fonte prioritária: índice gerado exclusivamente do acervo de PDFs das ITs fornecido ao projeto.
          try {
            const resposta = await fetch('./base-normativa-its.json?v=23.9.99m');
            if (resposta.ok) {
              const dados = await resposta.json();
              if (Array.isArray(dados?.itens) && dados.itens.length) {
                baseNormativaITSExata_ = dados.itens.map(reg => ({
                  it: Number(String(reg.it || '').match(/\d+/)?.[0] || 0),
                  title: '',
                  page: 0,
                  section: String(reg.item || ''),
                  text: String(reg.texto || ''),
                  arquivo: String(reg.arquivo || ''),
                  fonte: 'acervo-its-cbmmg-usuario'
                })).filter(reg => reg.it && reg.section && reg.text);
                if (baseNormativaITSExata_.length) return baseNormativaITSExata_;
              }
            }
          } catch (e) {}

          // Fallback de compatibilidade: índice do portal técnico já publicado no PWA.
          if (Array.isArray(window.SEARCH_INDEX) && window.SEARCH_INDEX.length) return window.SEARCH_INDEX;
          return await new Promise(resolve => {
            const existente = document.querySelector('script[data-base-normativa-its]');
            if (existente) {
              existente.addEventListener('load', () => resolve(window.SEARCH_INDEX || []), { once:true });
              existente.addEventListener('error', () => resolve([]), { once:true });
              return;
            }
            const script = document.createElement('script');
            script.src = './instrucoes-tecnicas/assets/search-index.js?v=23.9.99';
            script.async = true;
            script.dataset.baseNormativaIts = '1';
            script.onload = () => resolve(window.SEARCH_INDEX || []);
            script.onerror = () => resolve([]);
            document.head.appendChild(script);
          });
        })().catch(() => []);

        return baseNormativaITSCarregando_;
      }

      function itsPreferenciaisNotificacao_(tipo) {
        const n = normalize(tipo);
        const mapa = [
          [/acesso de viaturas/, [4]],
          [/armazenamento de liquidos inflamaveis/, [22]],
          [/brigada de incendio/, [12]],
          [/cobertura de sape|piacava/, [28]],
          [/gas natural/, [24]],
          [/compartimentacao horizontal|compartimentacao vertical/, [7]],
          [/controle de fumaca/, [41]],
          [/materiais de acabamento|revestimento/, [38]],
          [/eventos temporarios/, [33]],
          [/fogos de artificio|pirotecnia/, [25]],
          [/heliponto|heliporto/, [26]],
          [/hidrante publico/, [29]],
          [/iluminacao de emergencia/, [13]],
          [/impossibilidades tecnicas|edificacoes existentes/, [40]],
          [/gas liquefeito|glp/, [23]],
          [/produtos perigosos/, [27]],
          [/patio de conteineres/, [31]],
          [/plano de intervencao/, [11]],
          [/pressurizacao de escada/, [10]],
          [/processo de seguranca.*pscip/, [1,3]],
          [/cozinhas profissionais/, [32]],
          [/saidas? de emergencia/, [8]],
          [/seguranca estrutural/, [6]],
          [/separacao entre edificacoes/, [5]],
          [/sinalizacao de emergencia/, [15]],
          [/chuveiros automaticos/, [18]],
          // IT 20 consta como revogada no acervo recebido: não é usada como fundamento automático.
          [/sistema de protecao por espuma/, []],
          [/sistema de protecao por extintores/, [16]],
          // IT 19 consta como revogada no acervo recebido: não é usada como fundamento automático.
          [/sistema de resfriamento/, []],
          [/sistema fixo de gases/, [21]],
          [/deteccao e alarme/, [14]],
          [/hidrantes e mangotinhos/, [17]]
        ];
        return mapa.find(([re]) => re.test(n))?.[1] || [];
      }

      function itPreferencialNotificacao_(tipo) {
        return itsPreferenciaisNotificacao_(tipo)[0] || 0;
      }

      function chaveNotificacao_(valor) {
        return normalize(valor).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
      }

      function tokenCanonicoNormativo_(token) {
        const t = normalize(token);
        const mapa = {
          fechando:'fech', fechamento:'fech', fechada:'fech', fechado:'fech', fecha:'fech', fechar:'fech',
          corrimaos:'corrimao', guardas:'guarda',
          extintores:'extintor', hidrantes:'hidrante', mangueiras:'mangueira',
          luminarias:'luminaria', iluminacao:'iluminacao',
          acionadores:'acionador', detectores:'detector', avisadores:'avisador',
          portas:'porta', escadas:'escada', rampas:'rampa',
          sinalizacoes:'sinalizacao', equipamentos:'equipamento',
          certificados:'certificado', certificacao:'certificado',
          recalques:'recalque', abrigos:'abrigo', valvulas:'valvula', engates:'engate'
        };
        if (mapa[t]) return mapa[t];
        return t
          .replace(/(coes|cao)$/,'')
          .replace(/(mente)$/,'')
          .replace(/(ando|endo|indo)$/,'')
          .replace(/(ados|adas|idos|idas)$/,'')
          .replace(/(ado|ada|ido|ida)$/,'')
          .replace(/s$/,'');
      }

      function tokensNormativos_(texto, {descricao=false} = {}) {
        const stop = new Set([
          'para','com','uma','uns','umas','das','dos','que','por','deve','item','irregular','sistema','edificacao','edificacoes',
          'outro','outros','teste','testes','situacao','local','medida','medidas','instalacao','instalado','instalada','instalados','instaladas',
          'falta','faltando','ausencia','ausente','sem','nao','fora','prazo','vencido','vencida','vencidos','vencidas','quebrado','quebrada',
          'funcionou','funciona','funcionando','totalmente','parcialmente','irregular','inadequado','inadequada','divergente','incorreto','incorreta'
        ]);
        const tokens = normalize(texto).split(/[^a-z0-9]+/).filter(Boolean);
        const saida = [];
        for (const original of tokens) {
          if (original.length < 3 || stop.has(original)) continue;
          // números ajudam apenas na descrição para localizar itens com limites explícitos.
          if (/^\d+$/.test(original) && !descricao) continue;
          const canon = tokenCanonicoNormativo_(original);
          if (canon.length >= 3 && !stop.has(canon) && !saida.includes(canon)) saida.push(canon);
        }
        return saida;
      }

      function textoNormativoCanonico_(texto) {
        return normalize(texto).split(/[^a-z0-9]+/).filter(Boolean).map(tokenCanonicoNormativo_).join(' ');
      }

      function impedirFundamentoAutomatico_(item) {
        const tipo = chaveNotificacao_(item?.tipoIrregularidade || '');
        const irregular = chaveNotificacao_(item?.itemIrregular || '');
        const desc = chaveNotificacao_(item?.descricao || '');

        // IT 12 exige a apresentação dos certificados, mas o acervo recebido não traz
        // prazo de validade do certificado de formação do brigadista.
        if (/brigada/.test(tipo) && /certificado/.test(irregular) && /(venc|validade|fora.*data|prazo)/.test(desc)) return true;

        // A IT 13 não estabelece, por si só, uma altura máxima genérica de instalação.
        // O item 5.5 trata de tensão quando a luminária está abaixo de 2,5 m.
        if (/iluminacao de emergencia/.test(tipo) && /altura de instalacao da luminaria/.test(irregular)) return true;

        // Teste funcional da iluminação depende também da NBR 10898, adotada pelo item 2.2 da IT 13.
        if (/iluminacao de emergencia/.test(tipo) && /teste/.test(irregular)) return true;

        // Itens genéricos não recebem referência apenas por similaridade textual. Quando houver
        // fundamento direto, ele é tratado nas regras confirmadas acima.
        if (/^(outros?|teste)$/.test(irregular)) return true;

        // Cozinhas profissionais remete diversos requisitos à NBR 14518; descrição vaga não
        // deve resultar em citação automática de um capítulo amplo da IT 32.
        if (/cozinhas profissionais/.test(tipo) && /sistema de exaustao/.test(irregular)) return true;

        return false;
      }

      function segmentosNormativosDoRef_(ref) {
        const texto = String(ref?.text || '');
        const re = /(?:^|\n)\s*((?:[A-Z]\.\d+(?:\.\d+)*|\d+(?:\.\d+)+))\s+([^\n]*)([\s\S]*?)(?=\n\s*(?:[A-Z]\.\d+(?:\.\d+)*|\d+(?:\.\d+)+)\s+|$)/g;
        const segmentos = [];
        let m;
        while ((m = re.exec(texto))) {
          segmentos.push({
            numero: String(m[1] || '').trim(),
            titulo: String(m[2] || '').trim(),
            texto: `${m[2] || ''}\n${m[3] || ''}`.trim()
          });
        }
        if (segmentos.length) return segmentos;
        const secao = String(ref?.section || '').trim();
        const numero = secao.match(/^((?:[A-Z]\.\d+(?:\.\d+)*|\d+(?:\.\d+)+))\b/i)?.[1] || '';
        return numero ? [{numero,titulo:secao,texto}] : [];
      }

      function buscarFundamentoNormativo_(item) {
        const base = indiceNormativoDisponivel_();
        if (!base.length || impedirFundamentoAutomatico_(item)) return null;

        const itsPreferidas = itsPreferenciaisNotificacao_(item?.tipoIrregularidade);
        if (!itsPreferidas.length) return null;

        const tipoTokens = tokensNormativos_(item?.tipoIrregularidade || '');
        const itemTokens = tokensNormativos_(item?.itemIrregular || '');
        const descTokens = tokensNormativos_(item?.descricao || '', {descricao:true});
        const itemGenerico = !itemTokens.length || /^(outros?|teste)$/.test(chaveNotificacao_(item?.itemIrregular || ''));

        const candidatos = [];
        for (const ref of base) {
          if (!itsPreferidas.includes(Number(ref.it))) continue;
          const refSecao = textoNormativoCanonico_(ref.section || '');
          for (const seg of segmentosNormativosDoRef_(ref)) {
            const tituloCanon = textoNormativoCanonico_(seg.titulo || '');
            const textoCanon = textoNormativoCanonico_(seg.texto || '');
            let score = 0, itemHits = 0, descHits = 0, tipoHits = 0;

            for (const t of itemTokens) {
              if (tituloCanon.includes(t)) { score += 10; itemHits++; }
              else if (textoCanon.includes(t)) { score += 6; itemHits++; }
              else if (refSecao.includes(t)) score += 1;
            }
            for (const t of descTokens) {
              if (tituloCanon.includes(t)) { score += 5; descHits++; }
              else if (textoCanon.includes(t)) { score += 3; descHits++; }
            }
            for (const t of tipoTokens) {
              if (tituloCanon.includes(t) || textoCanon.includes(t) || refSecao.includes(t)) { score += 1; tipoHits++; }
            }
            if (Number(ref.it) === itsPreferidas[0]) score += 4;

            candidatos.push({ref, seg, score, itemHits, descHits, tipoHits, numero:seg.numero});
          }
        }

        candidatos.sort((a,b) => b.score - a.score);
        const melhor = candidatos[0];
        const segundo = candidatos[1];
        if (!melhor) return null;

        const itemMinimo = itemGenerico ? 0 : Math.min(2, Math.max(1, itemTokens.length));
        const contextoOk = melhor.itemHits >= itemMinimo && (melhor.itemHits > 0 || melhor.descHits >= 2);
        const margem = !segundo || melhor.score - segundo.score >= 3;
        const limiar = itemGenerico ? 15 : 18;
        if (!contextoOk || melhor.score < limiar || !margem) return null;

        return {
          it: Number(melhor.ref.it),
          item: melhor.numero,
          pagina: Number(melhor.ref.page || 0),
          trecho: String(melhor.seg.texto || '').trim(),
          score: melhor.score,
          confianca: melhor.score >= 28 ? 'alta' : 'moderada'
        };
      }

      function extrairNumeroMedida_(texto, unidade='m') {
        const bruto = String(texto || '').replace(',', '.');
        const re = unidade === 'm' ? /(\d+(?:\.\d+)?)\s*(?:m|metro|metros)\b/i : /(\d+(?:\.\d+)?)\s*(?:cm|centimetro|centimetros)\b/i;
        const m = bruto.match(re);
        return m ? Number(m[1]) : null;
      }

      function formatarMedidaMetro_(valor) {
        if (!Number.isFinite(valor)) return '';
        return valor.toLocaleString('pt-BR', {minimumFractionDigits: valor % 1 ? 2 : 2, maximumFractionDigits: 2}) + ' m';
      }

      function descricaoTecnicaBasica_(item) {
        const tipoOriginal = String(item?.tipoIrregularidade || '').trim();
        const irregularOriginal = String(item?.itemIrregular || '').trim();
        const descOriginal = String(item?.descricao || '').trim();
        const tipo = chaveNotificacao_(tipoOriginal);
        const irregular = chaveNotificacao_(irregularOriginal);
        const desc = chaveNotificacao_(descOriginal);
        if (!descOriginal && !irregularOriginal) return '';

        const faltando = /(falta|faltando|ausen|nao possui|sem\b)/.test(desc);
        const naoFunciona = /(nao.*func|inoper|nao.*acion|nao.*acend|falh)/.test(desc);
        const vencido = /(venc|validade.*expir|fora.*prazo|fora.*data)/.test(desc);

        // SAÍDAS DE EMERGÊNCIA — IT 08
        if (/porta corta fogo/.test(irregular)) {
          if (/nao.*fech.*automatic|nao.*fecha.*sozinha|sem.*fechamento.*automatic/.test(desc)) return 'A porta corta-fogo não realiza o fechamento automático';
          if (/nao.*fech|fecha.*parcial|nao.*total|nao.*complet/.test(desc)) return 'A porta corta-fogo não realiza o fechamento completo';
          if (/macaneta.*queb|queb.*macaneta|macaneta.*danific/.test(desc)) return 'A porta corta-fogo encontra-se com a maçaneta danificada';
          if (/trav|calco|calcad|presa.*aberta|mantida.*aberta/.test(desc)) return 'A porta corta-fogo encontra-se impedida de permanecer fechada';
          return `Porta corta-fogo: ${descOriginal}`.replace(/[.;,:\s]+$/, '');
        }
        if (/guardas? e corrimaos?/.test(irregular)) {
          if (faltando && /corrimao/.test(desc)) return /escada/.test(desc) ? 'Ausência de corrimão na escada' : 'Ausência de corrimão';
          if (faltando && /(guarda|guarda corpo)/.test(desc)) return 'Ausência de guarda-corpo no local com desnível';
          const altura = extrairNumeroMedida_(descOriginal, /cm/.test(desc) ? 'cm' : 'm');
          if (/corrimao/.test(desc) && /altura/.test(desc) && altura != null) return `Corrimão instalado em altura de ${/cm/.test(desc) ? altura.toLocaleString('pt-BR')+' cm' : formatarMedidaMetro_(altura)}`;
          if (/(guarda|guarda corpo)/.test(desc) && /altura/.test(desc) && altura != null) return `Guarda-corpo instalado em altura de ${/cm/.test(desc) ? altura.toLocaleString('pt-BR')+' cm' : formatarMedidaMetro_(altura)}`;
        }
        if (/saidas? de emergencia/.test(tipo) && /porta/.test(desc) && /(abre|abrindo).*(dentro|contrario|sentido)/.test(desc)) return 'Porta integrante da rota de fuga abrindo no sentido contrário ao trânsito de saída';

        // ILUMINAÇÃO DE EMERGÊNCIA — IT 13 / NBR 10898 quando aplicável
        if (/iluminacao de emergencia/.test(tipo)) {
          if (/altura de instalacao da luminaria/.test(irregular)) {
            const altura = extrairNumeroMedida_(descOriginal);
            return altura != null ? `Luminária do sistema de iluminação de emergência instalada a ${formatarMedidaMetro_(altura)} de altura` : `Altura de instalação da luminária de emergência: ${descOriginal}`.replace(/[.;,:\s]+$/,'');
          }
          if (/distancia maxima entre pontos/.test(irregular)) {
            const distancia = extrairNumeroMedida_(descOriginal);
            return distancia != null ? `Distância de ${formatarMedidaMetro_(distancia)} entre pontos de iluminação de emergência` : `Distanciamento entre pontos de iluminação de emergência: ${descOriginal}`.replace(/[.;,:\s]+$/,'');
          }
          if (/instalacao aparente/.test(irregular) && faltando) return 'Instalação aparente do circuito de iluminação de emergência sem tubulação e caixas de passagem metálicas ou em PVC rígido antichama';
          if (/teste/.test(irregular) && naoFunciona) return 'O sistema de iluminação de emergência não funcionou durante o teste de acionamento';
          if (/certificado/.test(irregular) && faltando) return 'Ausência de comprovação de certificação dos equipamentos do sistema de iluminação de emergência';
        }

        // BRIGADA — IT 12
        if (/brigada/.test(tipo)) {
          if (/certificado/.test(irregular) && vencido) return 'Certificado de formação do brigadista com prazo de validade expirado';
          if (/certificado/.test(irregular) && faltando) return 'Ausência de apresentação do certificado de formação do brigadista';
          if (/composicao/.test(irregular) && faltando) return 'Composição da brigada de incêndio inferior à prevista para a edificação';
        }

        // EXTINTORES — IT 16
        if (/extintor/.test(tipo)) {
          if (vencido) return 'Extintor com prazo de validade da carga ou garantia de funcionamento expirado';
          if (/instalacao/.test(irregular) && /(tripe|suporte).*(solto|nao.*afix|nao.*aparafus)/.test(desc)) return 'Suporte de piso do extintor não afixado ao solo';
          if (/instalacao/.test(irregular) && faltando && /(entrada|acesso|porta)/.test(desc)) return 'Ausência de extintor próximo à entrada principal';
          if (/instalacao/.test(irregular) && /escada/.test(desc)) return 'Extintor instalado em escada';
          if (/instalacao/.test(irregular) && /(obstru|sem acesso|dificil acesso)/.test(desc)) return 'Extintor instalado em condição que prejudica o acesso ao equipamento';
        }

        // HIDRANTES E MANGOTINHOS — IT 17
        if (/hidrantes? e mangotinhos?/.test(tipo)) {
          if (/abrigo/.test(irregular) && /(tranc|chaveado)/.test(desc)) return 'Porta do abrigo do hidrante mantida trancada';
          if (/abrigo/.test(irregular) && faltando && /(mangueira|chave|esguicho)/.test(desc)) return 'Abrigo de hidrante incompleto, com ausência de componentes obrigatórios';
          if (/mangueiras?/.test(irregular) && faltando) return 'Ausência de mangueira de incêndio no ponto de hidrante';
          if (/esguichos?/.test(irregular) && faltando) return 'Ausência de esguicho no ponto de hidrante';
          if (/engates|valvulas/.test(irregular) && faltando) return 'Ausência de chave para hidrante/engate rápido no ponto de hidrante';
          if (/recalque/.test(irregular)) {
            if (/tampa/.test(desc) && /(sem.*vermelh|nao.*pint|cor.*difer)/.test(desc)) return 'Tampa da caixa do dispositivo de recalque sem pintura vermelha';
            if (/(fundo|dreno|brita)/.test(desc) && faltando) return 'Caixa do dispositivo de recalque sem fundo permeável ou dreno';
            if (/veiculo|estacionamento|garagem|circulacao/.test(desc)) return 'Dispositivo de recalque instalado em local de circulação ou passagem de veículos';
          }
        }

        // DETECÇÃO E ALARME — IT 14
        if (/deteccao e alarme/.test(tipo)) {
          if (/teste/.test(irregular) && naoFunciona) return 'O sistema de detecção e alarme de incêndio não funcionou durante o teste';
          if (/acionador manual/.test(irregular)) {
            if (faltando) return 'Ausência de acionador manual de alarme de incêndio';
            if (naoFunciona) return 'Acionador manual do sistema de alarme de incêndio inoperante';
          }
          if (/avisadores visuais e sonoros/.test(irregular) && naoFunciona) return 'Avisador visual e/ou sonoro do sistema de alarme de incêndio inoperante';
          if (/central de deteccao/.test(irregular) && naoFunciona) return 'Central do sistema de detecção/alarme de incêndio inoperante';
          if (/fonte de alimentacao/.test(irregular) && faltando) return 'Sistema de detecção e alarme sem a fonte auxiliar de alimentação exigida';
        }

        // SINALIZAÇÃO — IT 15
        if (/sinalizacao de emergencia/.test(tipo)) {
          if (/orientacao e salvamento/.test(irregular) && faltando) return 'Ausência de sinalização de orientação e salvamento';
          if (/equipamentos de combate/.test(irregular) && faltando) return 'Ausência de sinalização do equipamento de combate a incêndio';
          if (/alerta/.test(irregular) && faltando) return 'Ausência de sinalização de alerta';
          if (/proibicao/.test(irregular) && faltando) return 'Ausência de sinalização de proibição';
          if (/complementar/.test(irregular) && faltando) return 'Ausência da sinalização complementar exigida';
          if (/fotolum|nao.*lumines|sem.*fotolum/.test(desc)) return 'Sinalização de emergência sem característica fotoluminescente';
        }

        // ACESSO DE VIATURAS — IT 04
        if (/acesso de viaturas/.test(tipo)) {
          if (/vias de acesso/.test(irregular) && /(obstru|bloque)/.test(desc)) return 'Via de acesso para viaturas do Corpo de Bombeiros obstruída';
          if (/acesso ao hidrante de recalque/.test(irregular)) return `Acesso ao hidrante de recalque em condição irregular: ${descOriginal}`.replace(/[.;,:\s]+$/,'');
          if (/vias de acesso/.test(irregular)) return `Via de acesso para viaturas em condição irregular: ${descOriginal}`.replace(/[.;,:\s]+$/,'');
        }

        // PSCIP — divergências de execução
        if (/processo de seguranca.*pscip/.test(tipo) && /erros ou falhas/.test(irregular)) {
          return `Execução em desacordo com o PSCIP aprovado: ${descOriginal}`.replace(/[.;,:\s]+$/,'');
        }

        // GLP — redação técnica contextual, fundamento será buscado na IT 23 quando seguro.
        if (/gas liquefeito|glp/.test(tipo)) {
          if (/ensaio de estanqueidade/.test(irregular) && /(nao.*apresent|falta|sem)/.test(desc)) return 'Ausência de comprovação do ensaio de estanqueidade da instalação de GLP';
          if (/central de glp/.test(irregular)) return `Central de GLP em condição irregular: ${descOriginal}`.replace(/[.;,:\s]+$/,'');
          if (/afastamentos/.test(irregular)) return `Afastamento da instalação de GLP em desacordo com a condição verificada em vistoria: ${descOriginal}`.replace(/[.;,:\s]+$/,'');
        }

        // Outros sistemas: melhora a redação mesmo quando a referência ainda não pode ser confirmada.
        if (/pressurizacao de escada/.test(tipo) && /teste/.test(irregular) && naoFunciona) {
          return 'O sistema de pressurização da escada não funcionou satisfatoriamente durante o teste de aprovação';
        }
        if (/chuveiros automaticos/.test(tipo) && /bombas?/.test(irregular) && /(nao.*acion|nao.*part|nao.*func)/.test(desc)) {
          return 'A bomba do sistema de chuveiros automáticos não entrou em operação durante o teste';
        }
        if (/controle de fumaca/.test(tipo) && /(janela|veneziana)/.test(irregular) && /(nao.*abre|trav|inoper)/.test(desc)) {
          return 'Janela/veneziana do sistema de extração de fumaça não realiza a abertura necessária';
        }
        if (/separacao entre edificacoes/.test(tipo) && /distancia de separacao/.test(irregular) && /(insuf|menor|inferior)/.test(desc)) {
          return 'Distância de separação entre edificações insuficiente para a condição verificada';
        }
        if (/compartimentacao horizontal|compartimentacao vertical/.test(tipo) && /compartimentacao vertical/.test(irregular) && /(abertura|passagem|shaft|duto).*(sem|falta|ausen).*(selag|corta fogo)/.test(desc)) {
          return 'Abertura na compartimentação vertical sem selagem corta-fogo';
        }
        if (/eventos temporarios/.test(tipo) && /responsavel tecnico/.test(irregular) && /(nao.*apresent|sem|falta).*(art|rrt|trt)/.test(desc)) {
          return 'Ausência de apresentação do documento de responsabilidade técnica (ART/RRT/TRT) aplicável ao evento';
        }
        if (/materiais de acabamento|revestimento/.test(tipo) && /teste/.test(irregular) && /(nao.*atende|classe|reacao.*fogo)/.test(desc)) {
          return 'Material de acabamento ou revestimento sem comprovação de atendimento à classe de reação ao fogo aplicável';
        }

        // Regra genérica: usa o item selecionado para não devolver apenas frases telegráficas.
        if (descOriginal) {
          let tecnico = descOriginal
            .replace(/^(falta|faltando)\s+/i, 'Ausência de ')
            .replace(/^nao\s+funcionou\s*$/i, `${irregularOriginal || tipoOriginal} não funcionou`);
          tecnico = tecnico.charAt(0).toUpperCase() + tecnico.slice(1);
          return tecnico.replace(/[.;,:\s]+$/, '');
        }
        return irregularOriginal;
      }

      function reprocessarComBaseNormativa_(local, item) {
        carregarBaseNormativaITS_().then(() => {
          if (!item || !String(item.descricao || item.itemIrregular || '').trim()) return;
          const atual = elaborarTextoTecnicoLocal_(local, item);
          item.textoTecnico = atual.texto;
          item.statusTecnico = atual.status;
          item.fundamentoNormativo = atual.fundamento || null;
          item.fundamentosNormativos = Array.isArray(atual.fundamentos)
            ? atual.fundamentos
            : (atual.fundamento ? [atual.fundamento] : []);
          atualizarTextoTecnicoIrregularidade_(item);
          agendarPersistenciaNotificacoesLiberacao_();
        });
      }

      function regraNormativaConfirmada_(item) {
        const tipo = chaveNotificacao_(item?.tipoIrregularidade || '');
        const irregular = chaveNotificacao_(item?.itemIrregular || '');
        const desc = chaveNotificacao_(item?.descricao || '');

        // IT 08 — Saídas de emergência
        if (/saidas? de emergencia/.test(tipo) && /(porta corta fogo|porta)/.test(irregular + ' ' + desc)) {
          if (/(abre|abrindo).*(dentro|contrario|sentido contrario)/.test(desc)) return {texto:'Porta integrante da rota de fuga abrindo no sentido contrário ao trânsito de saída', it:8, item:'5.5.4.1'};
          if (/porta corta fogo/.test(irregular) && /(nao.*fecha.*automatic|nao.*fech.*automatic|sem.*fechamento.*automatic|nao.*fecha.*sozinha)/.test(desc)) return {texto:'A porta corta-fogo não realiza o fechamento automático', it:8, item:'5.5.4.5'};
        }
        if (/saidas? de emergencia/.test(tipo) && /guardas? e corrimaos?/.test(irregular)) {
          if (/(falta|ausen|sem).*(corrimao)/.test(desc)) return {texto:/escada/.test(desc)?'Ausência de corrimão na escada':'Ausência de corrimão',it:8,item:'5.8.2.1'};
          if (/(falta|ausen|sem).*(guarda|guarda corpo)/.test(desc)) return {texto:'Ausência de guarda-corpo no local com desnível',it:8,item:'5.8.1.1'};
        }

        // IT 13 — Iluminação de emergência
        if (/iluminacao de emergencia/.test(tipo)) {
          if (/instalacao aparente/.test(irregular) && /(falta|sem|nao possui).*(tubul|caixa)/.test(desc)) return {texto:'Instalação aparente do circuito de iluminação de emergência sem tubulação e caixas de passagem metálicas ou em PVC rígido antichama',it:13,item:'5.3'};
          if (/distancia maxima entre pontos/.test(irregular)) {
            const d=extrairNumeroMedida_(item?.descricao || '');
            if (Number.isFinite(d) && d>15) return {texto:`Distância de ${formatarMedidaMetro_(d)} entre pontos de iluminação de emergência`,it:13,item:'5.4'};
          }
        }

        // IT 12 — Brigada: o acervo confirma a obrigação de apresentação, não validade temporal do certificado.
        if (/brigada/.test(tipo) && /certificado/.test(irregular) && /(falta|ausen|nao.*apresent|sem.*certificado)/.test(desc)) return {texto:'Ausência de apresentação do certificado de formação do brigadista',it:12,item:'C.1, alínea “b”'};

        // IT 16 — Extintores
        if (/extintor/.test(tipo)) {
          if (/(venc|validade.*expir|fora.*prazo|fora.*data)/.test(desc)) return {texto:'Extintor com prazo de validade da carga ou garantia de funcionamento expirado',it:16,item:'7.2'};
          if (
            /instalacao/.test(irregular) &&
            (
              /(tripe|suporte).*(nao.*afix|nao.*fix|solto|nao.*aparafus)/.test(desc) ||
              /extintor.*(nao.*afix|nao.*fix|solto).*(chao|piso|solo)/.test(desc) ||
              /(nao.*afix|nao.*fix|solto).*(chao|piso|solo).*(extintor)/.test(desc)
            )
          ) return {texto:'Extintor instalado sobre suporte de piso não devidamente fixado ao solo',it:16,item:'5.2.2.4, alínea “a”'};
          if (/instalacao/.test(irregular) && /(falta|ausen|sem).*(extintor).*(entrada|porta|acesso)/.test(desc)) return {texto:'Ausência de extintor próximo à entrada principal',it:16,item:'5.2.2.9'};
          if (/instalacao/.test(irregular) && /escada/.test(desc)) return {texto:'Extintor instalado em escada',it:16,item:'5.2.2.3'};
          if (/instalacao/.test(irregular) && /(obstru|bloquead)/.test(desc)) return {texto:'Extintor obstruído ou com acesso prejudicado',it:16,item:'5.2.1, alínea “c”'};
        }

        // IT 17 — Hidrantes e mangotinhos
        if (/hidrantes? e mangotinhos?/.test(tipo)) {
          if (/recalque/.test(irregular)) {
            if (/tampa/.test(desc) && /(sem.*vermelh|nao.*pint|cor.*difer)/.test(desc)) return {texto:'Tampa da caixa do dispositivo de recalque sem pintura vermelha',it:17,item:'5.3.4, alínea “b”'};
            if (/(fundo|dreno|brita)/.test(desc) && /(falta|sem|ausen)/.test(desc)) return {texto:'Caixa do dispositivo de recalque sem fundo permeável ou dreno',it:17,item:'5.3.4, alínea “a”'};
            if (/circulacao|passagem.*veiculo|garagem|estacionamento/.test(desc)) return {texto:'Dispositivo de recalque instalado em local de circulação ou passagem de veículos',it:17,item:'5.3.7'};
          }
          if (/abrigo/.test(irregular) && /(tranc|chavead)/.test(desc)) return {texto:'Porta do abrigo do hidrante mantida trancada',it:17,item:'5.4.7'};
          if (/(abrigo|mangueiras?|engates|valvulas|esguichos)/.test(irregular) && /(falta|ausen|sem).*(mangueira|chave|esguicho)/.test(desc)) return {texto:'Ponto de hidrante com ausência de componente obrigatório',it:17,item:'5.6.1.5 e Tabela 3'};
        }

        // IT 14 — Detecção e alarme
        if (/deteccao e alarme/.test(tipo)) {
          if (/fonte de alimentacao/.test(irregular) && /(falta|ausen|sem).*(bateria|nobreak|no break|fonte auxiliar)/.test(desc)) return {texto:'Sistema de detecção e alarme sem fonte auxiliar de alimentação',it:14,item:'5.3'};
          if (/central de deteccao/.test(irregular) && /(altura|instalad)/.test(desc)) {
            const d=extrairNumeroMedida_(item?.descricao || '');
            if (Number.isFinite(d) && (d<1.4 || d>1.6)) return {texto:`Interface da central de detecção/alarme instalada a ${formatarMedidaMetro_(d)} do piso`,it:14,item:'5.6.3'};
          }
          if (/acionador manual/.test(irregular)) {
            const d=extrairNumeroMedida_(item?.descricao || '');
            if (Number.isFinite(d) && (d<0.9 || d>1.35)) return {texto:`Acionador manual de alarme instalado a ${formatarMedidaMetro_(d)} do piso`,it:14,item:'5.10'};
            if (/(distancia|caminhamento).*(3[1-9]|[4-9]\d)\s*m/.test(desc)) return {texto:'Distância até o acionador manual superior a 30 m',it:14,item:'5.8'};
          }
        }

        // IT 15 — Sinalização
        if (/sinalizacao de emergencia/.test(tipo)) {
          if (/orientacao e salvamento/.test(irregular) && /(falta|ausen|sem)/.test(desc)) return {texto:'Ausência de sinalização de orientação e salvamento',it:15,item:'6.1.3'};
          if (/equipamentos de combate/.test(irregular) && /(falta|ausen|sem)/.test(desc)) return {texto:'Ausência de sinalização do equipamento de combate a incêndio',it:15,item:'6.1.4'};
          if (/fotolum|sem.*fotolum|nao.*fotolum/.test(desc)) return {texto:'Sinalização de emergência sem característica fotoluminescente',it:15,item:'6.5.2'};
        }

        // IT 04 — Acesso de viaturas
        if (/acesso de viaturas/.test(tipo)) {
          if (/vias de acesso/.test(irregular)) {
            if (/obstru|bloque/.test(desc)) return {texto:'Via de acesso para viaturas do Corpo de Bombeiros obstruída',it:4,item:'5.1.3.3'};
            const largura=(item?.descricao||'').match(/largura[^0-9]*(\d+(?:[.,]\d+)?)/i);
            if (largura && Number(largura[1].replace(',','.'))<6) return {texto:`Via de acesso para viaturas com largura inferior a 6,00 m`,it:4,item:'5.1.3.1'};
            const altura=(item?.descricao||'').match(/altura[^0-9]*(\d+(?:[.,]\d+)?)/i);
            if (altura && Number(altura[1].replace(',','.'))<4.5) return {texto:'Via de acesso para viaturas com altura livre inferior a 4,50 m',it:4,item:'5.1.3.4'};
          }
          if (/acesso ao hidrante de recalque/.test(irregular)) {
            const d=extrairNumeroMedida_(item?.descricao||'');
            if (Number.isFinite(d) && d>10) return {texto:`Hidrante de recalque instalado a ${formatarMedidaMetro_(d)} da via pública ou da via de acesso`,it:4,item:'5.1.2'};
          }
        }

        // IT 10 — Pressurização de escada
        if (/pressurizacao de escada/.test(tipo) && /teste/.test(irregular) && /(nao.*func|inoper|falh|nao.*acion)/.test(desc)) {
          return {texto:'O sistema de pressurização da escada não funcionou satisfatoriamente durante o teste de aprovação',it:10,item:'5.5.1, alínea “c”'};
        }

        // IT 18 — Chuveiros automáticos
        if (/chuveiros automaticos/.test(tipo) && /bombas?/.test(irregular) && /(nao.*acion|nao.*part|nao.*func)/.test(desc)) {
          return {texto:'A bomba do sistema de chuveiros automáticos não entrou em operação conforme exigido',it:18,item:'5.22'};
        }

        // IT 33 — Eventos temporários
        if (/eventos temporarios/.test(tipo) && /responsavel tecnico/.test(irregular) && /(nao.*apresent|sem|falta).*(art|rrt|trt)/.test(desc)) {
          return {texto:'Ausência de apresentação do documento de responsabilidade técnica (ART/RRT/TRT) aplicável ao evento',it:33,item:'5.3.1.5'};
        }

        // IT 01 — divergência do PSCIP aprovado
        if (/processo de seguranca.*pscip/.test(tipo) && /erros ou falhas/.test(irregular) && String(item?.descricao||'').trim()) return {texto:`Execução divergente do PSCIP aprovado: ${String(item.descricao).trim().replace(/[.;,:\s]+$/,'')}`,it:1,item:'6.2.1.4'};

        return null;
      }

      function formatarReferenciaNormativa_(regra) {
        if (!regra?.it || !regra?.item) return '';
        const item = String(regra.item).trim();
        const alinea = item.match(/^(.+?),\s*alínea\s*[“\"]?([a-z0-9]+)[”\"]?$/i);
        if (alinea) {
          return `em desacordo com a alínea “${alinea[2]}” do item ${alinea[1].trim()} da IT ${String(regra.it).padStart(2,'0')}`;
        }
        return `em desacordo com o item ${item} da IT ${String(regra.it).padStart(2,'0')}`;
      }


      function resultadoTecnicoCompostoConfirmado_(item) {
        const tipo = chaveNotificacao_(item?.tipoIrregularidade || '');
        const irregular = chaveNotificacao_(item?.itemIrregular || '');
        const desc = chaveNotificacao_(item?.descricao || '');

        if (/hidrantes? e mangotinhos?/.test(tipo) && /recalque/.test(irregular)) {
          const tampa = /tampa/.test(desc) && /(sem.*vermelh|nao.*pint|cor.*difer)/.test(desc);
          const fundo = /(fundo|dreno|brita)/.test(desc) && /(falta|sem|ausen)/.test(desc);
          if (tampa && fundo) {
            return {
              texto: 'Tampa da caixa do dispositivo de recalque sem pintura vermelha e caixa sem fundo permeável ou dreno, em desacordo com as alíneas “b” e “a” do item 5.3.4 da IT 17.',
              status: 'sugerido',
              fundamentos: [
                {it:17,item:'5.3.4, alínea “b”',origem:'regra-confirmada-acervo'},
                {it:17,item:'5.3.4, alínea “a”',origem:'regra-confirmada-acervo'}
              ]
            };
          }
        }

        if (/extintor/.test(tipo)) {
          const vencido = /(venc|validade.*expir|fora.*prazo|fora.*data)/.test(desc);
          const suporte = /(tripe|suporte).*(nao.*afix|solto|nao.*aparafus|sem.*fix)/.test(desc);
          if (vencido && suporte) {
            return {
              texto: 'Extintor com prazo de validade da carga ou garantia de funcionamento expirado e suporte de piso não afixado ao solo, em desacordo com o item 7.2 e com a alínea “a” do item 5.2.2.4 da IT 16.',
              status: 'sugerido',
              fundamentos: [
                {it:16,item:'7.2',origem:'regra-confirmada-acervo'},
                {it:16,item:'5.2.2.4, alínea “a”',origem:'regra-confirmada-acervo'}
              ]
            };
          }
        }

        if (/saidas? de emergencia/.test(tipo) && /porta corta fogo/.test(irregular)) {
          const fechamento = /(nao.*fecha.*automatic|nao.*fech.*automatic|sem.*fechamento.*automatic|nao.*fecha.*sozinha)/.test(desc);
          const macaneta = /macaneta.*(queb|danific)|(?:queb|danific).*macaneta/.test(desc);
          if (fechamento && macaneta) {
            return {
              texto: 'A porta corta-fogo não realiza o fechamento automático, em desacordo com o item 5.5.4.5 da IT 08, e apresenta maçaneta danificada.',
              status: 'conferencia',
              fundamentos: [{it:8,item:'5.5.4.5',origem:'regra-confirmada-acervo'}]
            };
          }
        }
        return null;
      }

      function fundamentosDoItem_(item) {
        const varios = Array.isArray(item?.fundamentosNormativos) ? item.fundamentosNormativos.filter(Boolean) : [];
        if (varios.length) return varios;
        return item?.fundamentoNormativo ? [item.fundamentoNormativo] : [];
      }

      function localizarTrechoFundamento_(fundamento) {
        if (!fundamento?.it || !fundamento?.item) return null;
        const it = Number(fundamento.it);
        const itemAlvo = String(fundamento.item || '').split(',')[0].trim();
        const base = indiceNormativoDisponivel_();
        const candidato = base.find(ref =>
          Number(ref.it) === it &&
          String(ref.section || '').trim() === itemAlvo &&
          String(ref.text || '').trim()
        ) || base.find(ref =>
          Number(ref.it) === it &&
          String(ref.section || '').trim().startsWith(itemAlvo) &&
          String(ref.text || '').trim()
        );
        if (!candidato) return null;
        return {it, item:String(candidato.section || itemAlvo), trecho:String(candidato.text || '').trim()};
      }

      function elaborarTextoTecnicoLocal_(local, item) {
        const tecnico = descricaoTecnicaBasica_(item);
        if (!tecnico) return { texto:'', status:'conferencia', fundamento:null, fundamentos:[] };

        const composta = resultadoTecnicoCompostoConfirmado_(item);
        if (composta) {
          return {
            texto: composta.texto,
            status: composta.status,
            fundamento: composta.fundamentos?.[0] || null,
            fundamentos: composta.fundamentos || []
          };
        }

        const confirmada = regraNormativaConfirmada_(item);
        if (confirmada) {
          return {
            texto: `${confirmada.texto}, ${formatarReferenciaNormativa_(confirmada)}.`,
            status: 'sugerido',
            fundamento: {it:confirmada.it,item:confirmada.item,origem:'regra-confirmada-acervo'},
            fundamentos: [{it:confirmada.it,item:confirmada.item,origem:'regra-confirmada-acervo'}]
          };
        }

        const fundamento = buscarFundamentoNormativo_(item);
        if (fundamento) {
          return {
            texto: `${tecnico}, em desacordo com o item ${fundamento.item} da IT ${String(fundamento.it).padStart(2,'0')}.`,
            status: 'sugerido',
            fundamento,
            fundamentos: [fundamento]
          };
        }

        // Mesmo sem referência segura, sempre entrega redação técnica contextualizada.
        return { texto: `${tecnico}.`, status: 'conferencia', fundamento: null, fundamentos: [] };
      }

      function processarIrregularidadeTecnica_(local, item) {
        if (!local || !item || !String(item.descricao || item.itemIrregular || '').trim()) return;
        const resultado = elaborarTextoTecnicoLocal_(local, item);
        item.textoTecnico = resultado.texto;
        item.statusTecnico = resultado.status;
        item.fundamentoNormativo = resultado.fundamento || null;
        item.fundamentosNormativos = Array.isArray(resultado.fundamentos)
          ? resultado.fundamentos
          : (resultado.fundamento ? [resultado.fundamento] : []);
        if (!indiceNormativoDisponivel_().length || !baseNormativaITSExata_.length) {
          reprocessarComBaseNormativa_(local, item);
        }
        item.autorNome = item.autorNome || String(authState.usuario?.nome || '');
        item.autorId = item.autorId || String(authState.usuario?.id || '');
        item.atualizadoEm = new Date().toISOString();
      }


      let fotoIrregularidadeAlvo_ = null;
      let enviandoFilaFotos_ = false;

      function comprimirFotoIrregularidade_(file) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            try {
              const maxDim = 1280;
              const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(img.width * escala));
              canvas.height = Math.max(1, Math.round(img.height * escala));
              canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
              resolve(canvas.toDataURL('image/jpeg', 0.72));
            } catch (e) {
              URL.revokeObjectURL(url);
              reject(e);
            }
          };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a fotografia.')); };
          img.src = url;
        });
      }

      async function gravarFotoPendenteDb_(registro) {
        const db = await abrirBancoOffline();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(DB_PHOTO_STORE, 'readwrite');
          tx.objectStore(DB_PHOTO_STORE).put(registro);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { const e = tx.error; db.close(); reject(e); };
        });
      }

      async function listarFotosPendentesDb_() {
        const db = await abrirBancoOffline();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(DB_PHOTO_STORE, 'readonly');
          const req = tx.objectStore(DB_PHOTO_STORE).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
        });
      }

      async function removerFotoPendenteDb_(id) {
        const db = await abrirBancoOffline();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(DB_PHOTO_STORE, 'readwrite');
          tx.objectStore(DB_PHOTO_STORE).delete(id);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { const e = tx.error; db.close(); reject(e); };
        });
      }

      function localizarFotoNoRascunho_(localId, itemId, fotoId) {
        const local = localNotificacaoPorId_(localId);
        const item = irregularidadeNotificacaoPorId_(local, itemId);
        const foto = item?.fotos?.find(f => String(f.id || f.fileId) === String(fotoId));
        return { local, item, foto };
      }

      function payloadUploadFoto_(registro) {
        return {
          consulta: 'foto_irregularidade_salvar',
          dataUrl: registro.dataUrl,
          edificacao: registro.edificacao,
          endereco: registro.endereco,
          pscip: registro.pscip,
          preparacaoId: registro.preparacaoId,
          rascunhoId: registro.rascunhoId,
          irregularidadeId: registro.itemId,
          dataVistoria: registro.dataVistoria
        };
      }

      async function concluirUploadFoto_(registro, resposta) {
        const { item } = localizarFotoNoRascunho_(registro.localId, registro.itemId, registro.id);
        if (!item) return;
        if (!Array.isArray(item.fotos)) item.fotos = [];
        const indice = item.fotos.findIndex(f => String(f.id || f.fileId) === String(registro.id));
        const fotoServidor = {
          id: String(resposta.fileId || ''),
          fileId: String(resposta.fileId || ''),
          nome: String(resposta.nome || ''),
          url: String(resposta.url || ''),
          estado: 'sincronizada',
          temporaria: true,
          manter: Boolean(resposta.manter)
        };
        if (indice >= 0) item.fotos.splice(indice, 1, fotoServidor);
        else item.fotos.push(fotoServidor);
        await removerFotoPendenteDb_(registro.id).catch(() => {});
        renderizarNotificacoesLiberacao_();
        scheduleDraftSave();
        agendarSincronizacaoRascunhoCompartilhado_();
      }

      async function enviarRegistroFotoPendente_(registro) {
        const resposta = await apiRequest('config', payloadUploadFoto_(registro), 30000);
        if (!resposta?.fileId) throw new Error('O servidor não confirmou o armazenamento da fotografia.');
        await concluirUploadFoto_(registro, resposta);
      }

      async function processarFilaFotosPendentes_() {
        if (enviandoFilaFotos_ || !navigator.onLine || !usuarioPodeOperar_()) return;
        enviandoFilaFotos_ = true;
        try {
          const fila = await listarFotosPendentesDb_().catch(() => []);
          for (const registro of fila) {
            try { await enviarRegistroFotoPendente_(registro); }
            catch (e) { /* mantém no IndexedDB para a próxima tentativa */ }
          }
        } finally {
          enviandoFilaFotos_ = false;
        }
      }

      async function fotografarIrregularidadeSelecionada_(file) {
        if (!fotoIrregularidadeAlvo_ || !file) return;
        const { localId, itemId } = fotoIrregularidadeAlvo_;
        const local = localNotificacaoPorId_(localId);
        const item = irregularidadeNotificacaoPorId_(local, itemId);
        if (!item) return;

        appStatus.textContent = 'Preparando fotografia...';
        const dataUrl = await comprimirFotoIrregularidade_(file);
        const localFotoId = `foto-local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const registro = {
          id: localFotoId,
          localId: String(localId),
          itemId: String(itemId),
          dataUrl,
          edificacao: value('nomeFantasia') || value('razaoSocial') || value('endereco') || 'Edificação',
          endereco: value('endereco'),
          pscip: value('pscip'),
          preparacaoId: String(preparacaoEmUsoId || ''),
          rascunhoId: String(currentRecordId || ''),
          dataVistoria: value('dataVistoria') || new Date().toLocaleDateString('pt-BR'),
          criadoEm: Date.now()
        };

        if (!Array.isArray(item.fotos)) item.fotos = [];
        item.fotos.push({
          id: localFotoId,
          estado: 'pendente',
          temporaria: true,
          manter: false
        });

        await gravarFotoPendenteDb_(registro);
        renderizarNotificacoesLiberacao_();
        scheduleDraftSave();

        if (navigator.onLine) {
          appStatus.textContent = 'Enviando fotografia...';
          try {
            await enviarRegistroFotoPendente_(registro);
            appStatus.textContent = '✓ Fotografia salva e vinculada à irregularidade.';
          } catch (e) {
            appStatus.textContent = 'Fotografia salva neste aparelho e aguardando sincronização.';
          }
        } else {
          appStatus.textContent = 'Fotografia salva neste aparelho e aguardando sincronização.';
        }
      }

      async function alterarRetencaoFoto_(localId, itemId, fileId) {
        const { item, foto } = localizarFotoNoRascunho_(localId, itemId, fileId);
        if (!item || !foto || !fileId || String(fileId).startsWith('foto-local-')) return;
        const novoValor = !Boolean(foto.manter);
        const resposta = await apiRequest('config', {
          consulta: 'foto_irregularidade_manter',
          fileId,
          manter: novoValor
        }, 15000);
        foto.manter = Boolean(resposta?.manter);
        renderizarNotificacoesLiberacao_();
        scheduleDraftSave();
        agendarSincronizacaoRascunhoCompartilhado_();
      }

      async function excluirFotoIrregularidade_(localId, itemId, fotoId) {
        const { item, foto } = localizarFotoNoRascunho_(localId, itemId, fotoId);
        if (!item || !foto) return;
        const confirmado = await confirmarGpv_(
          'Esta fotografia será removida desta irregularidade.',
          'Excluir fotografia?',
          { tom: 'danger', rotuloConfirmar: 'Excluir' }
        );
        if (!confirmado) return;

        if (String(fotoId).startsWith('foto-local-')) {
          await removerFotoPendenteDb_(fotoId).catch(() => {});
        } else if (navigator.onLine) {
          await apiRequest('config', { consulta: 'foto_irregularidade_excluir', fileId: fotoId }, 15000);
        } else {
          appStatus.textContent = 'Conecte-se à internet para excluir uma fotografia já enviada ao Drive.';
          return;
        }

        item.fotos = item.fotos.filter(f => String(f.id || f.fileId) !== String(fotoId));
        renderizarNotificacoesLiberacao_();
        scheduleDraftSave();
        agendarSincronizacaoRascunhoCompartilhado_();
      }

      function renderizarNotificacoesLiberacao_() {
        if (!notificacoesLiberacaoLista) return;
        if (!notificacoesLiberacaoDraft.length) {
          notificacoesLiberacaoLista.innerHTML = '';
          atualizarResumoNotificacoesLiberacao_();
          return;
        }

        notificacoesLiberacaoLista.innerHTML = notificacoesLiberacaoDraft.map((local, indiceLocal) => {
          const irregs = Array.isArray(local.irregularidades) ? local.irregularidades : [];
          const irregularidadesHtml = irregs.length
            ? irregs.map((item, indiceItem) => {
                const listaId = `dlNotifItens_${escapeAttr(item.id)}`;
                const opcoesItens = itensCategoriaNotificacao_(item.tipoIrregularidade);
                return `<article class="notification-irregularity-card" data-notification-irregularity-card="${escapeAttr(item.id)}">
                  <div class="notification-irregularity-head">
                    <div class="notification-irregularity-title"><strong>Irregularidade ${indiceItem + 1}</strong><span class="notification-save-state" data-notification-save-state="${escapeAttr(item.id)}">✓ Salva neste aparelho</span></div>
                    <button type="button" data-notification-remove-irregularity="${escapeAttr(item.id)}" data-notification-local-id="${escapeAttr(local.id)}" aria-label="Excluir irregularidade">×</button>
                  </div>
                  <div class="notification-irregularity-fields">
                    <label>Tipo de Irregularidade
                      <input data-notification-field="tipoIrregularidade" data-notification-local-id="${escapeAttr(local.id)}" data-notification-irregularity-id="${escapeAttr(item.id)}" list="dlNotificacaoCategorias" value="${escapeAttr(item.tipoIrregularidade)}" placeholder="Pesquise ou digite a categoria">
                    </label>
                    <label>Item Irregular
                      <input data-notification-field="itemIrregular" data-notification-local-id="${escapeAttr(local.id)}" data-notification-irregularity-id="${escapeAttr(item.id)}" list="${listaId}" value="${escapeAttr(item.itemIrregular)}" placeholder="Selecione ou digite o item">
                      <datalist id="${listaId}">${optionsHtmlNotificacao_(opcoesItens)}</datalist>
                    </label>
                    <label class="notification-description-field">Descrição
                      <textarea data-notification-field="descricao" data-notification-local-id="${escapeAttr(local.id)}" data-notification-irregularity-id="${escapeAttr(item.id)}" placeholder="Descreva objetivamente a irregularidade constatada.">${escapeHtml(item.descricao)}</textarea>
                    </label>
                  </div>
                  <div class="notification-photo-tools">
                    <button class="notification-mini-btn notification-photo-btn" type="button"
                      data-notification-photo="${escapeAttr(item.id)}"
                      data-notification-local-id="${escapeAttr(local.id)}">📷 Fotografar irregularidade</button>
                    ${Array.isArray(item.fotos) && item.fotos.length ? `
                      <div class="notification-photo-list">
                        ${item.fotos.map((foto, indiceFoto) => `
                          <div class="notification-photo-item ${foto.estado === 'pendente' ? 'is-pending' : ''}">
                            <span>Foto ${indiceFoto + 1}${foto.estado === 'pendente' ? ' — aguardando envio' : ''}</span>
                            ${foto.url ? `<a href="${escapeAttr(foto.url)}" target="_blank" rel="noopener">Ver</a>` : ''}
                            ${foto.fileId ? `<button type="button" data-notification-photo-keep="${escapeAttr(foto.fileId)}" data-notification-id="${escapeAttr(item.id)}" data-notification-local-id="${escapeAttr(local.id)}">${foto.manter ? '✓ Manter' : 'Manter'}</button>` : ''}
                            <button type="button" data-notification-photo-delete="${escapeAttr(foto.fileId || foto.id)}" data-notification-id="${escapeAttr(item.id)}" data-notification-local-id="${escapeAttr(local.id)}">Excluir</button>
                          </div>`).join('')}
                      </div>` : ''}
                  </div>
                  <div class="notification-technical-suggestion ${item.statusTecnico === 'conferencia' ? 'needs-review' : ''}" data-notification-technical="${escapeAttr(item.id)}">
                    <strong>${item.statusTecnico === 'sugerido' ? '✓ Texto técnico fundamentado' : 'Referência normativa pendente'}</strong>
                    <span data-notification-technical-text>${escapeHtml(item.textoTecnico || 'A redação técnica será preparada após a descrição da irregularidade.')}</span>
                    <small data-notification-technical-note ${item.statusTecnico === 'conferencia' ? '' : 'hidden'}></small>
                    ${item.autorNome ? `<small>Lançado por ${escapeHtml(item.autorNome)}</small>` : ''}
                  </div>
                </article>`;
              }).join('')
            : '<div class="notification-draft-notice"><span>Nenhuma irregularidade neste local.</span></div>';

          return `<article class="notification-local-card" data-notification-local-card="${escapeAttr(local.id)}">
            <div class="notification-local-head">
              <strong>Local ${indiceLocal + 1} — Local da irregularidade</strong>
              <button type="button" data-notification-remove-local="${escapeAttr(local.id)}" aria-label="Excluir local">×</button>
            </div>
            <div class="notification-local-fields">
              <label>Tipo do Local
                <input data-notification-field="tipoLocal" data-notification-local-id="${escapeAttr(local.id)}" list="dlNotificacaoTiposLocal" value="${escapeAttr(local.tipoLocal)}" placeholder="Ex.: ESCADA ou OUTROS LOCAIS">
              </label>
              <label>Complemento
                <input data-notification-field="complemento" data-notification-local-id="${escapeAttr(local.id)}" value="${escapeAttr(local.complemento)}" placeholder="Ex.: ENTRADA PRINCIPAL">
              </label>
            </div>
            <div class="notification-irregularities">${irregularidadesHtml}</div>
            <button class="notification-add-irregularity-btn" type="button" data-notification-add-irregularity="${escapeAttr(local.id)}">+ Adicionar irregularidade neste local</button>
          </article>`;
        }).join('');

        atualizarResumoNotificacoesLiberacao_();
      }

      function adicionarLocalNotificacao_(rolar = true) {
        const local = novoLocalNotificacao_();
        notificacoesLiberacaoDraft.push(local);
        renderizarNotificacoesLiberacao_();
        scheduleDraftSave();
        if (rolar) {
          setTimeout(() => {
            const alvo = notificacoesLiberacaoLista?.querySelector(`[data-notification-local-card="${CSS.escape(local.id)}"]`);
            alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            focarCampoCompatEscolhaMovel_(alvo?.querySelector('[data-notification-field="tipoLocal"]'));
          }, 30);
        }
        return local;
      }

      function adicionarIrregularidadeNotificacao_(localId, rolar = true) {
        const local = localNotificacaoPorId_(localId);
        if (!local) return null;
        if (!Array.isArray(local.irregularidades)) local.irregularidades = [];
        const item = novaIrregularidadeNotificacao_();
        local.irregularidades.push(item);
        renderizarNotificacoesLiberacao_();
        scheduleDraftSave();
        if (rolar) {
          setTimeout(() => {
            const alvo = notificacoesLiberacaoLista?.querySelector(`[data-notification-irregularity-card="${CSS.escape(item.id)}"]`);
            alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            focarCampoCompatEscolhaMovel_(alvo?.querySelector('[data-notification-field="tipoIrregularidade"]'));
          }, 30);
        }
        return item;
      }

      function removerLocalNotificacao_(localId) {
        notificacoesLiberacaoDraft = notificacoesLiberacaoDraft.filter(item => String(item.id) !== String(localId));
        renderizarNotificacoesLiberacao_();
        scheduleDraftSave();
      }

      function removerIrregularidadeNotificacao_(localId, irregularId) {
        const local = localNotificacaoPorId_(localId);
        if (!local) return;
        local.irregularidades = (local.irregularidades || []).filter(item => String(item.id) !== String(irregularId));
        renderizarNotificacoesLiberacao_();
        scheduleDraftSave();
      }

      function atualizarCampoNotificacao_(alvo) {
        const campo = String(alvo?.dataset?.notificationField || '');
        const local = localNotificacaoPorId_(alvo?.dataset?.notificationLocalId);
        if (!campo || !local) return;
        const valor = String(alvo.value || '');
        if (campo === 'tipoLocal' || campo === 'complemento') {
          local[campo] = valor;
        } else {
          const irregularidade = irregularidadeNotificacaoPorId_(local, alvo?.dataset?.notificationIrregularityId);
          if (!irregularidade) return;
          irregularidade[campo] = valor;
          marcarIrregularidadeSalvando_(irregularidade.id);
          irregularidade.autorNome = irregularidade.autorNome || String(authState.usuario?.nome || '');
          irregularidade.autorId = irregularidade.autorId || String(authState.usuario?.id || '');
          irregularidade.atualizadoEm = new Date().toISOString();
          if (campo === 'descricao' || campo === 'itemIrregular' || campo === 'tipoIrregularidade') {
            irregularidade.decisaoRevisao = '';
            irregularidade.textoFinal = '';
            irregularidade.revisadoPor = '';
            irregularidade.revisadoEm = '';
            processarIrregularidadeTecnica_(local, irregularidade);
            atualizarTextoTecnicoIrregularidade_(irregularidade);
          }
          if (campo === 'tipoIrregularidade') {
            const listaId = `dlNotifItens_${irregularidade.id}`;
            const dl = document.getElementById(listaId);
            if (dl) dl.innerHTML = optionsHtmlNotificacao_(itensCategoriaNotificacao_(valor));
          }
        }
        alvo.classList.remove('notification-field-invalid');
        atualizarResumoNotificacoesLiberacao_();
        scheduleDraftSave();
      }

      async function copiarTextoCompat_(texto) {
        const conteudo = String(texto || '');
        if (!conteudo) return false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(conteudo);
            return true;
          }
        } catch (erro) {}
        try {
          const area = document.createElement('textarea');
          area.value = conteudo;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          const ok = document.execCommand('copy');
          area.remove();
          return Boolean(ok);
        } catch (erro) {
          return false;
        }
      }

      function textoNotificacaoIndividual_(local, irregularidade, incluirEstrutura = false) {
        const descricao = String(irregularidade?.descricao || '').trim();
        if (!incluirEstrutura) return descricao;
        const linhas = [
          `LOCAL: ${[local?.tipoLocal, local?.complemento].filter(Boolean).join(' — ') || 'NÃO INFORMADO'}`,
          `TIPO DE IRREGULARIDADE: ${irregularidade?.tipoIrregularidade || 'NÃO INFORMADO'}`,
          `ITEM IRREGULAR: ${irregularidade?.itemIrregular || 'NÃO INFORMADO'}`,
          `DESCRIÇÃO: ${descricao || 'NÃO INFORMADA'}`
        ];
        return linhas.join('\n');
      }

      function textoTodasNotificacoes_(itens) {
        return (itens || []).map((item, indice) =>
          `${indice + 1}. ${textoNotificacaoIndividual_(item.local, item.irregularidade, true)}`
        ).join('\n\n');
      }

      function limparErrosCamposNotificacoes_() {
        notificacoesLiberacaoLista?.querySelectorAll('.notification-field-invalid').forEach(el => el.classList.remove('notification-field-invalid'));
      }

      function validarNotificacoesParaNotificado_(mostrarMensagem = true) {
        limparErrosCamposNotificacoes_();
        const ehNotificado = ehFluxoLiberacao_() && normalize(value('sancao')) === normalize('Notificado');
        if (!ehNotificado) return true;

        const candidatos = flattenNotificacoesLiberacao_(true);
        if (!candidatos.length) {
          return mostrarPendenciaValidacaoGuiada_(
            notificacoesAdicionarLocalBtn,
            'Para concluir a vistoria de liberação como Notificado, registre ao menos uma irregularidade.',
            1,
            mostrarMensagem,
            notificacoesLiberacaoSecao
          );
        }

        // V23.9.99: no campo, basta a descrição objetiva. Tipo/local/item podem ser
        // complementados posteriormente no Pelotão sem bloquear o encerramento.
        const comDescricao = candidatos.filter(({ irregularidade }) => String(irregularidade?.descricao || irregularidade?.itemIrregular || '').trim());
        if (!comDescricao.length) {
          const descricao = notificacoesLiberacaoLista?.querySelector('[data-notification-field="descricao"]');
          return mostrarPendenciaValidacaoGuiada_(
            descricao,
            'Informe ao menos uma descrição objetiva da irregularidade constatada.',
            1,
            mostrarMensagem,
            notificacoesLiberacaoSecao
          );
        }
        return true;
      }

      function rolarParaNotificacao_(localId, irregularId) {
        notificationReviewModal.hidden = true;
        document.body.classList.remove('review-open');
        notificacoesLiberacaoSecao?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          const seletor = irregularId
            ? `[data-notification-irregularity-card="${CSS.escape(irregularId)}"]`
            : `[data-notification-local-card="${CSS.escape(localId)}"]`;
          const alvo = notificacoesLiberacaoLista?.querySelector(seletor);
          alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          focarCampoCompatEscolhaMovel_(alvo?.querySelector('input,textarea'));
        }, 80);
      }

      function marcarIrregularidadeRevisada_(item, decisao, textoFinal) {
        if (!item) return;
        item.decisaoRevisao = String(decisao || '');
        item.textoFinal = String(textoFinal || '').trim();
        item.revisadoPor = String(authState.usuario?.nome || '');
        item.revisadoEm = new Date().toISOString();
        item.atualizadoEm = new Date().toISOString();
        scheduleDraftSave();
        agendarSincronizacaoRascunhoCompartilhado_();
      }

      function resumoRevisaoNotificacoes_() {
        const itens = flattenNotificacoesLiberacao_(true);
        const revisadas = itens.filter(({irregularidade}) => Boolean(irregularidade?.decisaoRevisao)).length;
        const refsPendentes = itens.filter(({irregularidade}) => irregularidade?.statusTecnico !== 'sugerido').length;
        return {
          total: itens.length,
          revisadas,
          faltantes: Math.max(0, itens.length - revisadas),
          refsPendentes,
          percentual: itens.length ? Math.round((revisadas / itens.length) * 100) : 0
        };
      }

      function htmlFundamentoRevisao_(item) {
        const fundamentos = fundamentosDoItem_(item);
        if (!fundamentos.length) {
          return `<div class="notification-review-foundation is-pending" hidden data-review-foundation>
            <strong>Referência normativa pendente</strong>
            <p>O texto técnico pode ser revisado normalmente. A referência ainda não foi confirmada na base normativa disponível.</p>
          </div>`;
        }
        const blocos = fundamentos.map(fundamento => {
          const localizado = localizarTrechoFundamento_(fundamento);
          return `<div class="notification-review-foundation-block">
            <strong>IT ${String(fundamento.it).padStart(2,'0')} — ${escapeHtml(String(fundamento.item || ''))}</strong>
            <p>${escapeHtml(localizado?.trecho || fundamento?.trecho || 'Trecho normativo não disponível no índice local.')}</p>
          </div>`;
        }).join('');
        const parcial = item?.statusTecnico !== 'sugerido'
          ? `<div class="notification-review-foundation-warning">Há aspecto da constatação cuja referência normativa permanece pendente.</div>`
          : '';
        return `<div class="notification-review-foundation" hidden data-review-foundation>${blocos}${parcial}</div>`;
      }

      function htmlFotosRevisao_(item) {
        const fotos = Array.isArray(item?.fotos) ? item.fotos : [];
        if (!fotos.length) return '';
        return `<div class="notification-review-photos">
          <strong>📷 ${fotos.length} foto${fotos.length === 1 ? '' : 's'}</strong>
          <div>${fotos.map((foto, indice) => foto.url
            ? `<a href="${escapeAttr(foto.url)}" target="_blank" rel="noopener">Ver foto ${indice + 1}</a>`
            : `<span>Foto ${indice + 1} — aguardando sincronização</span>`
          ).join('')}</div>
        </div>`;
      }

      function renderizarRevisaoTecnicaNotificacoes_() {
        if (!notificationReviewList) return;
        const itens = flattenNotificacoesLiberacao_(true);
        const resumo = resumoRevisaoNotificacoes_();

        if (notificationReviewSummary) {
          const partes = [
            `${resumo.total} notificação${resumo.total === 1 ? '' : 'ões'}`,
            `${resumo.revisadas} revisada${resumo.revisadas === 1 ? '' : 's'}`,
            `${resumo.faltantes} pendente${resumo.faltantes === 1 ? '' : 's'} de revisão`
          ];
          if (resumo.refsPendentes) {
            partes.push(`${resumo.refsPendentes} referência${resumo.refsPendentes === 1 ? '' : 's'} normativa${resumo.refsPendentes === 1 ? '' : 's'} pendente${resumo.refsPendentes === 1 ? '' : 's'}`);
          }
          notificationReviewSummary.textContent = partes.join(' • ');
        }
        if (notificationReviewProgressBar) notificationReviewProgressBar.style.width = `${resumo.percentual}%`;

        if (!itens.length) {
          notificationReviewList.innerHTML = '<div class="notification-review-empty">Nenhuma irregularidade registrada para revisão.</div>';
          if (notificationReviewConfirmBtn) notificationReviewConfirmBtn.disabled = true;
          return;
        }

        const grupos = new Map();
        itens.forEach(reg => {
          if (!grupos.has(reg.local.id)) grupos.set(reg.local.id, []);
          grupos.get(reg.local.id).push(reg);
        });

        notificationReviewList.innerHTML = Array.from(grupos.values()).map((grupo, indiceGrupo) => {
          const local = grupo[0].local;
          const nomeLocal = [local.tipoLocal, local.complemento].filter(Boolean).join(' — ') || 'Local não informado';
          return `<section class="notification-review-location">
            <header class="notification-review-location-head">
              <span>Local ${indiceGrupo + 1}</span>
              <strong>${escapeHtml(nomeLocal)}</strong>
            </header>
            <div class="notification-review-location-items">
              ${grupo.map((reg, indiceItem) => {
                const item = reg.irregularidade;
                const decisao = String(item.decisaoRevisao || '');
                const revisada = Boolean(decisao);
                const statusLabel = revisada
                  ? (decisao === 'aceita' ? 'Sugestão aceita' : decisao === 'editada' ? 'Texto editado' : 'Original mantido')
                  : 'Pendente de revisão';
                const statusClass = revisada ? 'is-reviewed' : 'is-pending';
                const textoTecnico = String(item.textoTecnico || '').trim() || 'A sugestão técnica ainda não foi gerada.';
                const finalAtual = String(item.textoFinal || '').trim();

                return `<article class="notification-review-item ${statusClass}" data-review-item="${escapeAttr(item.id)}">
                  <div class="notification-review-item-top">
                    <div>
                      <span class="notification-review-number">Irregularidade ${indiceItem + 1}</span>
                      <span class="notification-review-state ${statusClass}">${statusLabel}</span>
                    </div>
                    ${item.autorNome ? `<small>Lançado por ${escapeHtml(item.autorNome)}</small>` : ''}
                  </div>

                  <div class="notification-review-fields-grid">
                    <div><span>Tipo de Irregularidade</span><strong>${escapeHtml(item.tipoIrregularidade || 'Não informado')}</strong></div>
                    <div><span>Item Irregular</span><strong>${escapeHtml(item.itemIrregular || 'Não informado')}</strong></div>
                  </div>

                  <div class="notification-review-text-block original">
                    <span>Constatação em campo</span>
                    <p>${escapeHtml(item.descricao || 'Sem descrição informada.')}</p>
                  </div>

                  <div class="notification-review-text-block technical ${item.statusTecnico === 'sugerido' ? 'is-grounded' : 'needs-reference'}">
                    <div class="notification-review-text-title">
                      <span>Texto técnico sugerido</span>
                      <em>${item.statusTecnico === 'sugerido' ? 'Fundamentado' : 'Referência normativa pendente'}</em>
                    </div>
                    <p>${escapeHtml(textoTecnico)}</p>
                  </div>

                  ${finalAtual ? `<div class="notification-review-text-block final">
                    <span>Texto selecionado para uso</span>
                    <p>${escapeHtml(finalAtual)}</p>
                  </div>` : ''}

                  ${htmlFotosRevisao_(item)}
                  ${htmlFundamentoRevisao_(item)}

                  <div class="notification-review-edit-area" hidden data-review-edit-area>
                    <label>Editar texto técnico
                      <textarea data-review-edit-text>${escapeHtml(finalAtual || textoTecnico)}</textarea>
                    </label>
                    <div>
                      <button type="button" data-review-edit-cancel>Cancelar edição</button>
                      <button type="button" class="is-primary" data-review-edit-save>Salvar texto editado</button>
                    </div>
                  </div>

                  <div class="notification-review-item-actions">
                    <button type="button" class="is-accept" data-review-accept>Aceitar sugestão</button>
                    <button type="button" data-review-edit>Editar</button>
                    <button type="button" data-review-original>Manter original</button>
                    <button type="button" data-review-foundation-toggle>Ver fundamento</button>
                  </div>
                </article>`;
              }).join('')}
            </div>
          </section>`;
        }).join('');

        if (notificationReviewConfirmBtn) {
          notificationReviewConfirmBtn.disabled = resumo.faltantes > 0;
          notificationReviewConfirmBtn.title = resumo.faltantes
            ? `Ainda há ${resumo.faltantes} irregularidade${resumo.faltantes === 1 ? '' : 's'} pendente${resumo.faltantes === 1 ? '' : 's'} de revisão.`
            : '';
        }
      }

      function abrirRevisaoTecnicaNotificacoes_() {
        const itens = flattenNotificacoesLiberacao_(true);
        if (!itens.length) {
          appStatus.textContent = 'Adicione ao menos uma irregularidade antes de iniciar a revisão.';
          notificacoesLiberacaoSecao?.scrollIntoView({behavior:'smooth', block:'start'});
          return;
        }
        renderizarRevisaoTecnicaNotificacoes_();
        notificationReviewModal.hidden = false;
        document.body.classList.add('review-open');
        setTimeout(() => notificationReviewCloseBtn?.focus(), 30);
      }

      function fecharRevisaoTecnicaNotificacoes_() {
        if (notificationReviewModal) notificationReviewModal.hidden = true;
        document.body.classList.remove('review-open');
      }

      function mostrarConferenciaNotificacoes_() {
        abrirRevisaoTecnicaNotificacoes_();
        return Promise.resolve(false);
      }

      notificationReviewList?.addEventListener('click', event => {
        const artigo = event.target.closest('[data-review-item]');
        if (!artigo) return;
        const registro = flattenNotificacoesLiberacao_(true).find(({irregularidade}) => String(irregularidade.id) === String(artigo.dataset.reviewItem));
        const item = registro?.irregularidade;
        if (!item) return;

        const toggle = event.target.closest('[data-review-foundation-toggle]');
        if (toggle) {
          const box = artigo.querySelector('[data-review-foundation]');
          if (box) {
            box.hidden = !box.hidden;
            toggle.textContent = box.hidden ? 'Ver fundamento' : 'Ocultar fundamento';
          }
          return;
        }

        if (event.target.closest('[data-review-edit]')) {
          const area = artigo.querySelector('[data-review-edit-area]');
          if (area) {
            area.hidden = false;
            const textarea = area.querySelector('[data-review-edit-text]');
            if (textarea) {
              textarea.value = item.textoFinal || item.textoTecnico || item.descricao || '';
              setTimeout(() => textarea.focus(), 20);
            }
          }
          return;
        }

        if (event.target.closest('[data-review-edit-cancel]')) {
          const area = artigo.querySelector('[data-review-edit-area]');
          if (area) area.hidden = true;
          return;
        }

        if (event.target.closest('[data-review-edit-save]')) {
          const textarea = artigo.querySelector('[data-review-edit-text]');
          const texto = String(textarea?.value || '').trim();
          if (!texto) {
            appStatus.textContent = 'Informe o texto técnico antes de salvar a edição.';
            textarea?.focus();
            return;
          }
          marcarIrregularidadeRevisada_(item, 'editada', texto);
          renderizarRevisaoTecnicaNotificacoes_();
          return;
        }

        if (event.target.closest('[data-review-accept]')) {
          const texto = String(item.textoTecnico || '').trim();
          if (!texto) {
            appStatus.textContent = 'A sugestão técnica ainda não está disponível para esta irregularidade.';
            return;
          }
          marcarIrregularidadeRevisada_(item, 'aceita', texto);
          renderizarRevisaoTecnicaNotificacoes_();
          return;
        }

        if (event.target.closest('[data-review-original]')) {
          const texto = String(item.descricao || '').trim();
          if (!texto) {
            appStatus.textContent = 'A constatação em campo está vazia.';
            return;
          }
          marcarIrregularidadeRevisada_(item, 'original', texto);
          renderizarRevisaoTecnicaNotificacoes_();
        }
      });

      notificationReviewCloseBtn?.addEventListener('click', fecharRevisaoTecnicaNotificacoes_);
      notificationReviewBackBtn?.addEventListener('click', fecharRevisaoTecnicaNotificacoes_);
      notificationReviewModal?.addEventListener('click', event => {
        if (event.target === notificationReviewModal) fecharRevisaoTecnicaNotificacoes_();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && notificationReviewModal && !notificationReviewModal.hidden) fecharRevisaoTecnicaNotificacoes_();
      });
      notificationReviewConfirmBtn?.addEventListener('click', () => {
        const resumo = resumoRevisaoNotificacoes_();
        if (resumo.faltantes) {
          appStatus.textContent = `Ainda há ${resumo.faltantes} irregularidade${resumo.faltantes === 1 ? '' : 's'} pendente${resumo.faltantes === 1 ? '' : 's'} de revisão.`;
          return;
        }
        fecharRevisaoTecnicaNotificacoes_();
        appStatus.textContent = '✓ Revisão das notificações finalizada e salva no rascunho.';
        scheduleDraftSave();
        agendarSincronizacaoRascunhoCompartilhado_();
      });

      function normalizarSituacaoMultaInfoscip_(valor) {
        const n = normalize(valor || '');
        if (n === normalize('Não possui multa em aberto')) return 'Não possui multa em aberto';
        if (n === normalize('Possui multa em aberto')) return 'Possui multa em aberto';
        return 'Não conferido';
      }

      function situacaoFinalPorMulta_(sancaoPretendida, situacaoMulta) {
        const pretendida = String(sancaoPretendida || '').trim();
        const n = normalize(pretendida);
        if (n !== normalize('Regularizado') && n !== normalize('Liberado')) return pretendida;
        const multa = normalizarSituacaoMultaInfoscip_(situacaoMulta);
        if (multa === 'Não possui multa em aberto') return pretendida;
        if (multa === 'Possui multa em aberto') return 'Pendente — multa em aberto';
        return 'Pendente — conferir multa no INFOSCIP';
      }

      function buildPayload() {
        const eventoDeclaratorio = ehEventoDeclaratorio_();
        const acessoria = ehVistoriaAcessoria_();
        let sancaoPretendida = value('sancao');
        // V23.9.75 — defesa adicional para rascunhos/estados antigos do navegador:
        // no fluxo de Liberação, resultados próprios da Fiscalização nunca podem ser enviados.
        if (ehFluxoLiberacao_()) {
          const n = normalize(sancaoPretendida);
          if ([normalize('Autuado'), normalize('Advertência'), normalize('Regularizado')].includes(n)) {
            sancaoPretendida = 'Notificado';
          }
        }
        const situacaoMultaInfoscip = normalizarSituacaoMultaInfoscip_(value('situacaoMultaInfoscip'));
        return {
          _appRegistroId: currentRecordId,
          _appUsuarioId: String(authState.usuario?.id || ''),
          _appUsuarioNome: String(authState.usuario?.nome || ''),
          _appUsuarioSessao: String(authState.sessionToken || ''),
          _appDispositivo: nomeDispositivo_(),
          _appPreparacaoId: preparacaoEmUsoId,
          _appDduId: dduEmUsoId,
          _appDduNumero: value('dduProtocol') || dduEmUsoNumero,
          _appAcessoriaPfVinculado: acessoria ? String(processoAcessoriaVinculado?.pf || '') : '',
          _appAcessoriaSituacaoAnterior: acessoria ? String(processoAcessoriaVinculado?.sancao || '') : '',
          _appVersao: APP_VERSION,
          vistoriadorResponsavel: value('vistoriadorResponsavel'),
          cidade: cityValue() || 'Viçosa',
          nomeFantasia: eventoDeclaratorio ? value('eventoNome') : value('nomeFantasia'),
          razaoSocial: eventoDeclaratorio ? '' : value('razaoSocial'),
          cnpj: eventoDeclaratorio ? '' : value('cnpj'),
          _appIdentificadorTipo: eventoDeclaratorio ? '' : tipoIdentificador_(value('cnpj')) ,
          _appLicenciamento: eventoDeclaratorio ? '' : value('licenciamento'),
          situacaoLicenciamento: eventoDeclaratorio ? '' : value('licenciamento'),
          _appPossuiPscip: eventoDeclaratorio ? '' : value('possuiPscip'),
          situacaoPscip: eventoDeclaratorio ? '' : value('situacaoPscip'),
          _appSancaoAntesAuto: sancaoAntesDoAutomatico,
          _appSancaoPretendida: sancaoPretendida,
          sancao: eventoDeclaratorio ? sancaoPretendida : situacaoFinalPorMulta_(sancaoPretendida, situacaoMultaInfoscip),
          situacaoMultaInfoscip: eventoDeclaratorio ? '' : situacaoMultaInfoscip,
          pendenciaDocumental: value('pendenciaDocumental'),
          tipoLiberacao: ehFluxoLiberacao_() ? (value('tipoLiberacao') || 'final') : '',
          liberacaoParcialDescricao: ehFluxoLiberacao_() && normalize(value('tipoLiberacao')) === normalize('parcial') ? value('liberacaoParcialDescricao') : '',
          liberacaoParcialArea: ehFluxoLiberacao_() && normalize(value('tipoLiberacao')) === normalize('parcial') ? value('liberacaoParcialArea') : '',
          acessoriaResultado: acessoria ? value('acessoriaResultado') : '',
          acessoriaTipoLicenca: acessoria ? value('acessoriaTipoLicenca') : '',
          acessoriaSituacaoAnterior: acessoria ? String(processoAcessoriaVinculado?.sancao || '') : '',
          dduProtocol: ehDemandaDdu_() ? (value('dduProtocol') || dduEmUsoNumero) : '',
          pscip: eventoDeclaratorio ? '' : (value('possuiPscip') === 'sim' ? projetoPscipOperacional_(value('pscip')) : ''),
          pf: value('pf'),
          tipoVistoria: value('tipoVistoria'),
          reds: value('reds'),
          natureza: value('natureza'),
          enderecoCorrespondencia: eventoDeclaratorio ? '' : value('enderecoCorrespondencia'),
          endereco: value('endereco'),
          numero: value('numero'),
          complemento: value('complemento'),
          bairro: value('bairro'),
          localizacaoLatitude: value('localizacaoLatitude'),
          localizacaoLongitude: value('localizacaoLongitude'),
          localizacaoCoordenadas: value('localizacaoCoordenadas'),
          localizacaoPrecisao: value('localizacaoPrecisao'),
          localizacaoCapturadaEm: value('localizacaoCapturadaEm'),
          localizacaoEnderecoIdentificado: value('localizacaoEnderecoIdentificado'),
          demandaPrincipal: eventoDeclaratorio ? 'Eventos declaratórios' : value('demandaPrincipal'),
          dataRenovacaoAvcb: ehDemandaRenovacaoAvcb_() ? formatarDataRenovacaoAvcbDigitacao_(value('dataRenovacaoAvcb')) : '',
          categoriaMeta: eventoDeclaratorio ? 'Eventos declaratórios' : value('categoriaMeta'),
          resim: value('resim'),
          area: eventoDeclaratorio ? '' : value('area'),
          pavimentos: eventoDeclaratorio ? '' : value('pavimentos'),
          altura: eventoDeclaratorio ? '' : value('altura'),
          ocupacao: eventoDeclaratorio ? '' : ocupacaoTextoFinal(),
          responsavel: value('responsavel'),
          nomeResponsavel: value('nomeResponsavel'),
          rg: value('rg'),
          cpf: eventoDeclaratorio ? value('cpf') : (value('cpf') || (tipoIdentificador_(value('cnpj')) === 'cpf' ? value('cnpj') : '')) ,
          mae: value('mae'),
          nascimento: value('nascimento'),
          profissao: value('profissao'),
          estadoCivil: value('estadoCivil'),
          escolaridade: value('escolaridade'),
          telefone: value('telefone'),
          email: value('email'),
          enderecoResponsavel: value('enderecoResponsavel'),
          eventoDeclaracaoNumero: eventoDeclaratorio ? value('eventoDeclaracaoNumero').toUpperCase() : '',
          eventoClassificacao: eventoDeclaratorio ? value('eventoClassificacao') : '',
          eventoNome: eventoDeclaratorio ? value('eventoNome') : '',
          eventoInicio: eventoDeclaratorio ? value('eventoInicio') : '',
          eventoTermino: eventoDeclaratorio ? value('eventoTermino') : '',
          eventoPublicoEstimado: eventoDeclaratorio ? value('eventoPublicoEstimado') : '',
          eventoOrganizador: eventoDeclaratorio ? value('eventoOrganizador') : '',
          eventoOrganizadorDocumento: eventoDeclaratorio ? value('eventoOrganizadorDocumento') : '',
          eventoTelefoneOrganizador: eventoDeclaratorio ? value('eventoTelefoneOrganizador') : '',
          retornoLiberacao: ehFluxoLiberacao_() ? value('retornoLiberacao') : '',
          retornoLiberacaoChaveAnterior: ehFluxoLiberacao_() ? value('retornoLiberacaoChaveAnterior') : '',
          retornoLiberacaoLinhaAnterior: ehFluxoLiberacao_() ? value('retornoLiberacaoLinhaAnterior') : '',
          retornoLiberacaoDataAnterior: ehFluxoLiberacao_() ? value('retornoLiberacaoDataAnterior') : '',
          retornoLiberacaoSituacaoAnterior: ehFluxoLiberacao_() ? value('retornoLiberacaoSituacaoAnterior') : '',
          retornoLiberacaoPscipAnterior: ehFluxoLiberacao_() ? value('retornoLiberacaoPscipAnterior') : '',
          retornoLiberacaoNotificacoesOriginais: ehFluxoLiberacao_() ? value('retornoLiberacaoNotificacoesOriginais') : '',
          retornoLiberacaoPendencias: ehFluxoLiberacao_() ? value('retornoLiberacaoPendencias') : '',
          retornoLiberacaoNotificacoesManual: ehFluxoLiberacao_() ? value('retornoLiberacaoNotificacoesManual') : '',
          retornoLiberacaoDocumentoFileId: ehFluxoLiberacao_() ? value('retornoLiberacaoDocumentoFileId') : '',
          retornoLiberacaoDocumentoNome: ehFluxoLiberacao_() ? value('retornoLiberacaoDocumentoNome') : '',
          retornoLiberacaoDocumentoUrl: ehFluxoLiberacao_() ? value('retornoLiberacaoDocumentoUrl') : '',
          retornoLiberacaoDocumentoLink: ehFluxoLiberacao_() ? value('retornoLiberacaoDocumentoLink') : '',
          notificacoesLiberacao: ehFluxoLiberacao_() ? serializarNotificacoesLiberacao_() : ''
        };
      }

      function openParentDetails(element) {
        if (!element) return;
        const details = element.closest('details');
        if (details) details.open = true;
      }

      function limparOrientacaoCampoObrigatorio_() {
        document.querySelectorAll('.required-field-guidance').forEach(el => el.remove());
        document.querySelectorAll('.validation-guided-current').forEach(el => {
          el.classList.remove('validation-guided-current');
          if (el.getAttribute('aria-invalid') === 'true') el.removeAttribute('aria-invalid');
        });
      }

      function encerrarValidacaoGuiada_() {
        validacaoGuiadaAtiva_ = false;
        validacaoGuiadaAtual_ = null;
        if (validacaoGuiadaTimer_) clearTimeout(validacaoGuiadaTimer_);
        validacaoGuiadaTimer_ = null;
        limparOrientacaoCampoObrigatorio_();
      }

      function mostrarPendenciaValidacaoGuiada_(element, mensagem, total = 1, showMessage = true, scrollTarget = null) {
        limparOrientacaoCampoObrigatorio_();
        validacaoGuiadaAtiva_ = true;
        validacaoGuiadaAtual_ = element || null;

        const texto = String(mensagem || 'Preencha este campo para continuar.').trim();
        const textoCompleto = total > 1
          ? `Há ${total} pendências obrigatórias. ${texto} Depois de corrigir este campo, o app levará você à próxima pendência.`
          : texto;

        if (element) {
          openParentDetails(element);
          element.classList.add('invalid', 'validation-guided-current');
          element.setAttribute('aria-invalid', 'true');
        }

        const host = element?.closest('.field')
          || scrollTarget?.querySelector?.('.section-body')
          || element?.parentElement
          || scrollTarget;
        if (host) {
          const hint = document.createElement('div');
          hint.className = 'required-field-guidance';
          hint.setAttribute('role', 'alert');
          hint.setAttribute('aria-live', 'assertive');
          hint.textContent = textoCompleto;
          host.appendChild(hint);
        }

        if (showMessage) showError(textoCompleto);

        const alvoRolagem = element || scrollTarget;
        if (alvoRolagem?.scrollIntoView) {
          setTimeout(() => {
            try { alvoRolagem.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
            if (element && !element.disabled && !element.readOnly) {
              setTimeout(() => {
                try { element.focus({ preventScroll: true }); } catch (e) { try { element.focus(); } catch (_) {} }
              }, 220);
            }
          }, 30);
        }
        return false;
      }

      function agendarAvancoValidacaoGuiada_(event) {
        if (!validacaoGuiadaAtiva_ || !validacaoGuiadaAtual_) return;
        const alvo = event?.target;
        if (!alvo || alvo !== validacaoGuiadaAtual_) return;
        if (validacaoGuiadaTimer_) clearTimeout(validacaoGuiadaTimer_);
        const campoEsperado = validacaoGuiadaAtual_;
        validacaoGuiadaTimer_ = setTimeout(() => {
          validacaoGuiadaTimer_ = null;
          if (!validacaoGuiadaAtiva_ || validacaoGuiadaAtual_ !== campoEsperado) return;
          validateRequired(true);
        }, 140);
      }

      function validateRequired(showMessage = true) {
        limparOrientacaoCampoObrigatorio_();
        document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        const eventoDeclaratorio = ehEventoDeclaratorio_();
        const localizacaoCapturada = localizacaoValidaFormulario_();
        const checks = [
          ['tipoVistoria', 'Tipo de vistoria'],
          ['sancao', 'Situação / resultado'],
          ['vistoriadorResponsavel', 'Vistoriador responsável'],
          ...(!localizacaoCapturada ? [['endereco', eventoDeclaratorio ? 'Endereço do evento ou localização atual' : 'Endereço ou localização atual']] : []),
          ...(eventoDeclaratorio
            ? [
                ['eventoDeclaracaoNumero', 'Nº da declaração INFOSCIP'],
                ['nomeResponsavel', 'Nome do responsável que acompanhou a vistoria'],
                ['mae', 'Mãe']
              ]
            : [
                ...(ehFluxoLiberacao_() ? [] : [['licenciamento', 'Situação do licenciamento'], ['possuiPscip', 'Possui PSCIP?']]),
                ...(ehFluxoFiscalizacao_() ? [['area', 'Área da edificação (m²)']] : []),
                ['cnpj', 'CNPJ ou CPF'],
                ['nomeResponsavel', 'Nome do responsável'],
                ['mae', 'Mãe']
              ])
        ];
        const missing = [];
        let first = null;
        if (ehFluxoLiberacao_() && normalize(value('sancao')) === normalize('Liberado') && !value('pendenciaDocumental')) {
          if (pendenciaDocumentalSelect) pendenciaDocumentalSelect.classList.add('invalid');
          missing.push('Pendência documental');
          first = first || pendenciaDocumentalSelect;
        }
        if (!eventoDeclaratorio && value('possuiPscip') === 'sim' && !pscipProjetoValido_(value('pscip'))) {
          const elPscip = document.getElementById('pscip');
          if (elPscip) elPscip.classList.add('invalid');
          missing.push('Nº do PSCIP / Projeto (PRJ + 10 números ou processo antigo, ex.: 44/2016)');
          first = first || elPscip;
        }
        if (ehFluxoLiberacao_() && !eventoDeclaratorio && !pscipAtualValido_(value('pscip'))) {
          const elPscip = document.getElementById('pscip');
          if (elPscip) elPscip.classList.add('invalid');
          missing.push('Nº do PSCIP atual para liberação (PRJ + 10 números)');
          first = first || elPscip;
        }
        if (ehFluxoFiscalizacao_() && !eventoDeclaratorio && value('licenciamento') === 'nao_possui' && value('possuiPscip') === 'sim' && !String(value('situacaoPscip') || '').trim()) {
          situacaoPscipInput?.classList.add('invalid');
          missing.push('Situação atual do PSCIP no INFOSCIP');
          first = first || situacaoPscipInput;
        }
        if (ehDemandaDdu_() && !String(value('dduProtocol') || '').trim()) {
          dduProtocolInput?.classList.add('invalid');
          missing.push('Protocolo DDU');
          first = first || dduProtocolInput;
        }
        if (ehDemandaRenovacaoAvcb_()) {
          const dataRenovacaoInput = document.getElementById('dataRenovacaoAvcb');
          const dataRenovacao = String(dataRenovacaoInput?.value || '').trim();
          if (!dataRenovacao || !dataRenovacaoAvcbValida_(dataRenovacao)) {
            dataRenovacaoInput?.classList.add('invalid');
            missing.push('Data de renovação do AVCB');
            first = first || dataRenovacaoInput;
          }
        }
        if (ehFluxoLiberacao_() && normalize(value('tipoLiberacao')) === normalize('parcial')) {
          if (!String(value('liberacaoParcialDescricao') || '').trim()) {
            liberacaoParcialDescricaoInput?.classList.add('invalid'); missing.push('Área/trecho liberado'); first = first || liberacaoParcialDescricaoInput;
          }
          const areaParcial = numeroAreaM2_(value('liberacaoParcialArea'));
          if (!String(value('liberacaoParcialArea') || '').trim() || !Number.isFinite(areaParcial) || areaParcial <= 0) {
            liberacaoParcialAreaInput?.classList.add('invalid'); missing.push('Área liberada parcialmente (m²)'); first = first || liberacaoParcialAreaInput;
          }
        }
        if (ehVistoriaAcessoria_()) {
          const pfAtual = String(value('pf') || '').trim();

          if (
            pfAtual &&
            (!processoAcessoriaVinculado ||
              normalize(processoAcessoriaVinculado.pf || '') !== normalize(pfAtual))
          ) {
            const candidatoExato = (Array.isArray(processoPfCandidatos) ? processoPfCandidatos : [])
              .find(item => normalize(item?.pf || '') === normalize(pfAtual));

            if (candidatoExato) {
              processoAcessoriaVinculado = { ...candidatoExato };
              processoPfAutoAtual = pfAtual;
              atualizarVinculoAcessoria_();
              renderizarAlertaProcessoAnterior_([
                candidatoExato,
                ...processoPfCandidatos.filter(item =>
                  normalize(item?.pf || '') !== normalize(pfAtual)
                )
              ]);
            }
          }

          const vinculoOk = processoAcessoriaVinculado &&
            pfAtual &&
            normalize(processoAcessoriaVinculado.pf || '') === normalize(pfAtual);

          if (!pfAtual) {
            processPfInput?.classList.add('invalid');
            missing.push('Nº do PF anterior');
            first = first || processPfInput;
          }

          if (!vinculoOk) {
            return mostrarPendenciaValidacaoGuiada_(
              processPfInput,
              'Vistoria Acessória exige um processo fiscalizatório anterior vinculado. Aguarde a localização do PF ou confira se o número informado corresponde ao processo encontrado.',
              1,
              showMessage
            );
          }
          const resultadoAcessoria = normalize(value('acessoriaResultado'));
          if (!resultadoAcessoria) { acessoriaResultadoSelect?.classList.add('invalid'); missing.push('Resultado da Vistoria Acessória'); first = first || acessoriaResultadoSelect; }
          if (resultadoAcessoria === normalize('sanadas')) {
            const lic = value('licenciamento');
            if (!['possui','dispensado'].includes(lic)) {
              licenciamentoSelect?.classList.add('invalid');
              return mostrarPendenciaValidacaoGuiada_(
                licenciamentoSelect,
                'Para concluir a Vistoria Acessória com irregularidades sanadas, informe licenciamento válido ou dispensado de licenciamento.',
                1,
                showMessage
              );
            }
            if (lic === 'possui') {
              if (!String(value('acessoriaTipoLicenca') || '').trim()) { acessoriaTipoLicencaSelect?.classList.add('invalid'); missing.push('Documento de licenciamento'); first = first || acessoriaTipoLicencaSelect; }
              if (!pscipProjetoValido_(value('pscip'))) { pscipInput?.classList.add('invalid'); missing.push('Nº do PSCIP / Projeto (PRJ + 10 números ou processo antigo, ex.: 44/2016)'); first = first || pscipInput; }
            }
          }
        }
        checks.forEach(([id, label]) => {
          const el = document.getElementById(id);
          if (!el || !String(el.value || '').trim()) {
            missing.push(label);
            if (el) el.classList.add('invalid');
            if (!first && el) first = el;
          }
        });
        if (citySelect.value === 'Outro' && !value('outraCidade')) {
          missing.push('Outra cidade');
          otherCity.classList.add('invalid');
          if (!first) first = otherCity;
        }
        if (ehFluxoFiscalizacao_() && !eventoDeclaratorio && value('area')) {
          const area = numeroAreaM2_(value('area'));
          if (!Number.isFinite(area) || area <= 0) {
            if (areaInput) areaInput.classList.add('invalid');
            return mostrarPendenciaValidacaoGuiada_(
              areaInput,
              'Informe uma área válida da edificação em metros quadrados.',
              1,
              showMessage
            );
          }
        }
        if (!eventoDeclaratorio) {
          const identificador = digits(value('cnpj'));
          if (identificador && ![11, 14].includes(identificador.length)) {
            const el = document.getElementById('cnpj');
            el.classList.add('invalid');
            return mostrarPendenciaValidacaoGuiada_(
              el,
              'Informe um CNPJ com 14 dígitos ou um CPF com 11 dígitos.',
              1,
              showMessage
            );
          }
        } else {
          if (!declaracaoEventoValida_(value('eventoDeclaracaoNumero'))) {
            eventoDeclaracaoNumeroInput?.classList.add('invalid');
            return mostrarPendenciaValidacaoGuiada_(
              eventoDeclaracaoNumeroInput,
              'Informe o Nº da declaração INFOSCIP no padrão ano + letras do código + sequência numérica. Ex.: 2026RME09669.',
              1,
              showMessage
            );
          }
          const documentoOrganizador = digits(value('eventoOrganizadorDocumento'));
          if (documentoOrganizador && ![11, 14].includes(documentoOrganizador.length)) {
            eventoOrganizadorDocumentoInput?.classList.add('invalid');
            return mostrarPendenciaValidacaoGuiada_(
              eventoOrganizadorDocumentoInput,
              'Informe o CPF/CNPJ do organizador com 11 ou 14 dígitos, ou deixe o campo em branco.',
              1,
              showMessage
            );
          }
          const cpfResponsavel = digits(value('cpf'));
          if (cpfResponsavel && cpfResponsavel.length !== 11) {
            cpfInput?.classList.add('invalid');
            return mostrarPendenciaValidacaoGuiada_(
              cpfInput,
              'Informe o CPF do responsável que acompanhou a vistoria com 11 dígitos, ou deixe o campo em branco.',
              1,
              showMessage
            );
          }
          const inicio = value('eventoInicio');
          const termino = value('eventoTermino');
          if (inicio && termino && new Date(termino).getTime() < new Date(inicio).getTime()) {
            const eventoTerminoInput = document.getElementById('eventoTermino');
            eventoTerminoInput?.classList.add('invalid');
            return mostrarPendenciaValidacaoGuiada_(
              eventoTerminoInput,
              'O término do evento não pode ser anterior ao início.',
              1,
              showMessage
            );
          }
        }
        if (missing.length) {
          const rotuloAtual = missing[0] || 'Campo obrigatório';
          const totalPendencias = Math.max(1, document.querySelectorAll('.invalid').length);
          return mostrarPendenciaValidacaoGuiada_(
            first,
            `Preencha este campo: ${rotuloAtual}.`,
            totalPendencias,
            showMessage
          );
        }
        encerrarValidacaoGuiada_();
        hideError();
        return true;
      }

      function showError(message) {
        errorBox.innerHTML = '<strong>Atenção:</strong> ' + escapeHtml(message);
        errorBox.classList.add('show');
        appStatus.textContent = 'Verifique os campos obrigatórios.';
      }
      function hideError() { errorBox.classList.remove('show'); }

      function syncOtherCity() {
        const isOther = citySelect.value === 'Outro';
        otherCityWrap.classList.toggle('show', isOther);
        if (!isOther) otherCity.classList.remove('invalid');
      }

      function syncLicenciamento() {
        const situacao = value('licenciamento');
        const naoPossui = situacao === 'nao_possui';
        const vencido = situacao === 'vencido';
        const liberacao = ehFluxoLiberacao_();
        const eventoDeclaratorio = ehEventoDeclaratorio_();
        const acessoria = ehVistoriaAcessoria_();

        if (eventoDeclaratorio) {
          if (sancaoSelect) sancaoSelect.disabled = false;
          sancaoDefinidaAutomaticamente = false;
          sancaoAntesDoAutomatico = '';
          if (sancaoAutomaticaHint) sancaoAutomaticaHint.hidden = true;
          syncNotificado();
          esconderAvisoEncerramentoFiscal_();
          return;
        }

        // Em vistoria de liberação, a constatação final é exclusivamente Liberado/Notificado.
        // A regra de autuação automática por ausência de AVCB/CLCB pertence somente ao fluxo fiscalizatório.
        if (liberacao) {
          if (sancaoSelect) sancaoSelect.disabled = false;
          sancaoDefinidaAutomaticamente = false;
          sancaoAntesDoAutomatico = '';
          if (sancaoAutomaticaHint) sancaoAutomaticaHint.hidden = true;
        } else if (acessoria) {
          sancaoDefinidaAutomaticamente = false;
          sancaoAntesDoAutomatico = '';
          if (sancaoAutomaticaHint) sancaoAutomaticaHint.hidden = true;
          sincronizarVistoriaAcessoria_();
        } else if (naoPossui || vencido) {
          if (!sancaoDefinidaAutomaticamente) sancaoAntesDoAutomatico = value('sancao');
          sancaoDefinidaAutomaticamente = true;
          if (sancaoSelect) {
            sancaoSelect.value = 'Autuado';
            sancaoSelect.disabled = true;
          }
          if (sancaoAutomaticaHint) {
            sancaoAutomaticaHint.hidden = false;
            sancaoAutomaticaHint.textContent = vencido
              ? 'Autuado definido automaticamente porque foi informado que o AVCB/CLCB está vencido.'
              : 'Autuado definido automaticamente porque foi informado que o local não possui AVCB ou CLCB.';
          }
        } else {
          if (sancaoSelect) sancaoSelect.disabled = false;
          if (sancaoDefinidaAutomaticamente && sancaoSelect) {
            const existeAnterior = Array.from(sancaoSelect.options).some(op => op.value === sancaoAntesDoAutomatico);
            sancaoSelect.value = existeAnterior ? sancaoAntesDoAutomatico : '';
          }
          sancaoDefinidaAutomaticamente = false;
          sancaoAntesDoAutomatico = '';
          if (sancaoAutomaticaHint) sancaoAutomaticaHint.hidden = true;
        }

        syncNotificado();
        agendarConsultaEncerramentoFiscal_();
      }

      function syncPscip_() {
        const eventoDeclaratorio = ehEventoDeclaratorio_();
        const possui = !eventoDeclaratorio && value('possuiPscip') === 'sim';
        const mostrarSituacao = ehFluxoFiscalizacao_() && !eventoDeclaratorio && possui;
        if (situacaoPscipWrap) situacaoPscipWrap.hidden = !mostrarSituacao;
        if (!mostrarSituacao && situacaoPscipInput) situacaoPscipInput.value = '';
        if (pscipLicenciamentoWrap) {
          pscipLicenciamentoWrap.hidden = !possui;
          pscipLicenciamentoWrap.classList.toggle('is-visible', possui);
          pscipLicenciamentoWrap.setAttribute('aria-hidden', possui ? 'false' : 'true');
          pscipLicenciamentoWrap.style.display = possui ? 'block' : 'none';
        }
        if (pscipInput) {
          pscipInput.disabled = !possui;
          if (!possui) {
            pscipInput.value = '';
            esconderHistoricoPscip_();
            clearPscipLookupStatus_();
          } else if (!String(pscipInput.value || '').trim()) {
            pscipInput.value = 'PRJ';
          } else {
            normalizarPscipInput_(false);
          }
        }
        if (ehVistoriaAcessoria_()) sincronizarVistoriaAcessoria_();
        agendarConsultaEncerramentoFiscal_();
      }

      function syncPendenciaDocumental_() {
        const mostrar = ehFluxoLiberacao_() && normalize(value('sancao')) === normalize('Liberado');
        if (pendenciaDocumentalWrap) pendenciaDocumentalWrap.hidden = !mostrar;
        if (pendenciaDocumentalSelect) {
          pendenciaDocumentalSelect.required = mostrar;
          if (!mostrar) pendenciaDocumentalSelect.value = '';
        }
      }

      function syncNotificado() {
        syncPendenciaDocumental_();
        const isNotificado = normalize(value('sancao')) === normalize('Notificado');
        document.getElementById('noticeNotificado').classList.toggle('show', isNotificado);
        notificacoesLiberacaoSecao?.classList.toggle('notification-required-state', isNotificado && ehFluxoLiberacao_());
        if ((isNotificado || ehFluxoLiberacao_()) && !value('demandaPrincipal')) document.getElementById('demandaPrincipal').value = 'Liberação';
      }

      function syncResponsibleAddress() {
        const checked = document.getElementById('mesmoEnderecoResponsavel').checked;
        const field = document.getElementById('enderecoResponsavel');
        field.readOnly = false;
        field.style.background = '';
        if (checked) {
          preenchendoResponsavelLookup = true;
          try {
            setResponsibleField_(
              'enderecoResponsavel',
              [value('endereco'), value('numero'), value('complemento'), value('bairro')].filter(Boolean).join(', ')
            );
          } finally {
            preenchendoResponsavelLookup = false;
          }
        }
      }

      function respostaRetornoLiberacaoAtual_() {
        return String(retornoLiberacaoInput?.value || '').trim().toLowerCase();
      }

      function candidatoRetornoLiberacaoSelecionado_() {
        const chave = String(retornoLiberacaoAnteriorSelect?.value || retornoLiberacaoChaveAnteriorInput?.value || '');
        return retornoLiberacaoCandidatos_.find(item => String(item.chave || '') === chave) || null;
      }

      function limparDocumentoRetornoLiberacao_() {
        if (retornoLiberacaoDocumentoFileIdInput) retornoLiberacaoDocumentoFileIdInput.value = '';
        if (retornoLiberacaoDocumentoNomeInput) retornoLiberacaoDocumentoNomeInput.value = '';
        if (retornoLiberacaoDocumentoUrlInput) retornoLiberacaoDocumentoUrlInput.value = '';
        if (retornoLiberacaoAbrirDocumentoBtn) retornoLiberacaoAbrirDocumentoBtn.hidden = true;
        if (retornoLiberacaoPdfStatus) {
          retornoLiberacaoPdfStatus.textContent = '';
          retornoLiberacaoPdfStatus.className = 'return-release-upload-status';
        }
      }

      function resetarRetornoLiberacao_(opcoes = {}) {
        clearTimeout(retornoLiberacaoConsultaTimer_);
        retornoLiberacaoConsultaSequencia_ += 1;
        retornoLiberacaoConsultaAssinatura_ = '';
        retornoLiberacaoCandidatos_ = [];

        if (retornoLiberacaoSecao) retornoLiberacaoSecao.hidden = true;
        if (retornoLiberacaoDetalhes) retornoLiberacaoDetalhes.hidden = true;
        if (retornoLiberacaoAnteriorSelect) retornoLiberacaoAnteriorSelect.innerHTML = '';
        if (retornoLiberacaoInput) retornoLiberacaoInput.value = '';
        if (retornoLiberacaoChaveAnteriorInput) retornoLiberacaoChaveAnteriorInput.value = '';
        if (retornoLiberacaoLinhaAnteriorInput) retornoLiberacaoLinhaAnteriorInput.value = '';
        if (retornoLiberacaoDataAnteriorInput) retornoLiberacaoDataAnteriorInput.value = '';
        if (retornoLiberacaoSituacaoAnteriorInput) retornoLiberacaoSituacaoAnteriorInput.value = '';
        if (retornoLiberacaoPscipAnteriorInput) retornoLiberacaoPscipAnteriorInput.value = '';
        if (retornoLiberacaoNotificacoesOriginaisInput) retornoLiberacaoNotificacoesOriginaisInput.value = '';
        if (retornoLiberacaoPendenciasInput) retornoLiberacaoPendenciasInput.value = '';
        if (retornoLiberacaoPendenciasLista) retornoLiberacaoPendenciasLista.innerHTML = '';
        if (retornoLiberacaoSemNotificacoes) retornoLiberacaoSemNotificacoes.hidden = true;
        if (retornoLiberacaoNotificacoesInfo) retornoLiberacaoNotificacoesInfo.textContent = 'O app tentará recuperar as notificações já lançadas.';
        if (retornoLiberacaoNotificacoesManualInput && !opcoes.preservarManual) retornoLiberacaoNotificacoesManualInput.value = '';
        if (retornoLiberacaoDocumentoLinkInput && !opcoes.preservarDocumento) retornoLiberacaoDocumentoLinkInput.value = '';
        if (!opcoes.preservarDocumento) limparDocumentoRetornoLiberacao_();

        retornoLiberacaoSimBtn?.classList.remove('is-selected');
        retornoLiberacaoNaoBtn?.classList.remove('is-selected');
      }

      function extrairPendenciasRetornoLiberacao_(json) {
        const itens = [];
        let locais = [];
        try {
          locais = typeof json === 'string' ? JSON.parse(json || '[]') : (Array.isArray(json) ? json : []);
        } catch (e) {
          locais = [];
        }
        if (!Array.isArray(locais)) return itens;

        locais.forEach((local, indiceLocal) => {
          const irregularidades = Array.isArray(local?.irregularidades) ? local.irregularidades : [];
          irregularidades.forEach((item, indiceItem) => {
            const id = String(item?.id || `ret-${indiceLocal + 1}-${indiceItem + 1}`);
            const localTexto = [local?.tipoLocal, local?.complemento].filter(Boolean).join(' — ');
            const descricao = String(item?.descricao || item?.textoTecnico || item?.itemIrregular || '').trim();
            itens.push({
              id,
              local: localTexto,
              tipo: String(item?.tipoIrregularidade || '').trim(),
              item: String(item?.itemIrregular || '').trim(),
              descricao,
              status: 'Não verificado'
            });
          });
        });
        return itens;
      }

      function lerPendenciasRetornoLiberacaoCampo_() {
        try {
          const itens = JSON.parse(String(retornoLiberacaoPendenciasInput?.value || '[]'));
          return Array.isArray(itens) ? itens : [];
        } catch (e) {
          return [];
        }
      }

      function salvarPendenciasRetornoLiberacaoCampo_(itens) {
        if (!retornoLiberacaoPendenciasInput) return;
        retornoLiberacaoPendenciasInput.value = JSON.stringify(Array.isArray(itens) ? itens : []);
        scheduleDraftSave();
      }

      function renderizarPendenciasRetornoLiberacao_(itens) {
        const lista = Array.isArray(itens) ? itens : [];
        if (!retornoLiberacaoPendenciasLista || !retornoLiberacaoSemNotificacoes) return;

        retornoLiberacaoSemNotificacoes.hidden = Boolean(lista.length);
        retornoLiberacaoPendenciasLista.innerHTML = lista.map((item, indice) => {
          const titulo = item.item || item.tipo || `Irregularidade ${indice + 1}`;
          const detalhe = item.descricao || 'Irregularidade registrada na vistoria anterior.';
          const local = item.local ? `Local: ${item.local}` : '';
          const status = String(item.status || 'Não verificado');
          return `<article class="return-release-pendency" data-return-pendency-id="${escapeAttr(item.id)}">
            <div class="return-release-pendency-main">
              <strong>${escapeHtml(titulo)}</strong>
              <span>${escapeHtml(detalhe)}</span>
              ${local ? `<small>${escapeHtml(local)}</small>` : ''}
            </div>
            <label>
              <span class="sr-only">Situação no retorno</span>
              <select data-return-pendency-status="${escapeAttr(item.id)}">
                ${['Não verificado','Regularizado','Continua irregular'].map(opcao => `<option value="${escapeAttr(opcao)}"${normalize(opcao) === normalize(status) ? ' selected' : ''}>${escapeHtml(opcao)}</option>`).join('')}
              </select>
            </label>
          </article>`;
        }).join('');

        salvarPendenciasRetornoLiberacaoCampo_(lista);
      }

      function aplicarCandidatoRetornoLiberacao_(candidato, opcoes = {}) {
        if (!candidato) return;

        if (retornoLiberacaoChaveAnteriorInput) retornoLiberacaoChaveAnteriorInput.value = String(candidato.chave || '');
        if (retornoLiberacaoLinhaAnteriorInput) retornoLiberacaoLinhaAnteriorInput.value = String(candidato.linha || '');
        if (retornoLiberacaoDataAnteriorInput) retornoLiberacaoDataAnteriorInput.value = String(candidato.carimbo || '');
        if (retornoLiberacaoSituacaoAnteriorInput) retornoLiberacaoSituacaoAnteriorInput.value = String(candidato.situacao || '');
        if (retornoLiberacaoPscipAnteriorInput) retornoLiberacaoPscipAnteriorInput.value = String(candidato.pscip || '');
        if (retornoLiberacaoNotificacoesOriginaisInput) retornoLiberacaoNotificacoesOriginaisInput.value = String(candidato.notificacoes || '');

        if (retornoLiberacaoAnteriorTitulo) {
          retornoLiberacaoAnteriorTitulo.textContent = [candidato.carimbo, candidato.situacao].filter(Boolean).join(' • ') || 'Vistoria anterior';
        }
        if (retornoLiberacaoAnteriorMeta) {
          retornoLiberacaoAnteriorMeta.textContent = [
            candidato.pscip ? `PSCIP ${candidato.pscip}` : '',
            candidato.reds ? `REDS ${candidato.reds}` : '',
            candidato.enderecoCompleto || ''
          ].filter(Boolean).join(' • ');
        }

        if (retornoLiberacaoResumoAnterior) {
          retornoLiberacaoResumoAnterior.textContent = [
            candidato.carimbo || '',
            candidato.situacao || '',
            candidato.pscip ? `PSCIP ${candidato.pscip}` : ''
          ].filter(Boolean).join(' • ');
        }

        if (retornoLiberacaoCorrespondencia) {
          retornoLiberacaoCorrespondencia.textContent = Array.isArray(candidato.correspondencias) && candidato.correspondencias.length
            ? `Correspondência: ${candidato.correspondencias.join(' • ')}`
            : 'Correspondência pelo endereço informado.';
        }

        let pendencias = [];
        if (opcoes.preservarPendencias) {
          pendencias = lerPendenciasRetornoLiberacaoCampo_();
        }
        if (!pendencias.length) pendencias = extrairPendenciasRetornoLiberacao_(candidato.notificacoes || '');

        renderizarPendenciasRetornoLiberacao_(pendencias);

        if (retornoLiberacaoNotificacoesInfo) {
          retornoLiberacaoNotificacoesInfo.textContent = candidato.notificacoes
            ? `Notificações recuperadas do registro anterior${candidato.notificacoesDisponiveisAte ? ` • disponíveis na base temporária até ${candidato.notificacoesDisponiveisAte}` : ''}.`
            : 'Nenhuma notificação detalhada foi localizada para este registro anterior.';
        }
      }

      function renderizarCandidatosRetornoLiberacao_() {
        if (!retornoLiberacaoSecao || !retornoLiberacaoAnteriorSelect) return;
        if (!ehFluxoLiberacao_() || !retornoLiberacaoCandidatos_.length) {
          retornoLiberacaoSecao.hidden = true;
          return;
        }

        retornoLiberacaoSecao.hidden = false;
        const chaveAtual = String(retornoLiberacaoChaveAnteriorInput?.value || '');
        retornoLiberacaoAnteriorSelect.innerHTML = retornoLiberacaoCandidatos_.map((item, indice) => {
          const label = [
            item.carimbo || `Vistoria ${indice + 1}`,
            item.situacao || '',
            item.pscip ? `PSCIP ${item.pscip}` : '',
            item.nomeFantasia || item.razaoSocial || ''
          ].filter(Boolean).join(' — ');
          return `<option value="${escapeAttr(item.chave || '')}">${escapeHtml(label)}</option>`;
        }).join('');

        if (chaveAtual && retornoLiberacaoCandidatos_.some(i => String(i.chave) === chaveAtual)) {
          retornoLiberacaoAnteriorSelect.value = chaveAtual;
        }

        aplicarCandidatoRetornoLiberacao_(candidatoRetornoLiberacaoSelecionado_(), {
          preservarPendencias: respostaRetornoLiberacaoAtual_() === 'sim'
        });

        const resposta = respostaRetornoLiberacaoAtual_();
        retornoLiberacaoSimBtn?.classList.toggle('is-selected', resposta === 'sim');
        retornoLiberacaoNaoBtn?.classList.toggle('is-selected', resposta === 'nao');
        if (retornoLiberacaoDetalhes) retornoLiberacaoDetalhes.hidden = resposta !== 'sim';
      }

      function filtrosRetornoLiberacaoAtuais_() {
        return {
          cidade: cityValue() || 'Viçosa',
          identificador: digits(value('cnpj')),
          pscip: projetoPscipOperacional_(value('pscip')),
          endereco: String(value('endereco') || '').trim(),
          numero: String(value('numero') || '').trim()
        };
      }

      function assinaturaConsultaRetornoLiberacao_(filtros) {
        return [
          normalize(filtros.cidade || ''),
          String(filtros.identificador || ''),
          normalize(filtros.pscip || ''),
          normalize(filtros.endereco || ''),
          normalize(filtros.numero || '')
        ].join('|');
      }

      async function consultarRetornoLiberacao_() {
        clearTimeout(retornoLiberacaoConsultaTimer_);
        if (!ehFluxoLiberacao_()) {
          resetarRetornoLiberacao_();
          return;
        }

        const filtros = filtrosRetornoLiberacaoAtuais_();
        if (normalize(filtros.endereco).length < 3) {
          if (!String(retornoLiberacaoChaveAnteriorInput?.value || '').trim()) resetarRetornoLiberacao_({ preservarManual: true, preservarDocumento: true });
          return;
        }

        if (!navigator.onLine) return;

        const assinatura = assinaturaConsultaRetornoLiberacao_(filtros);
        if (assinatura === retornoLiberacaoConsultaAssinatura_ && retornoLiberacaoCandidatos_.length) return;
        retornoLiberacaoConsultaAssinatura_ = assinatura;
        const sequencia = ++retornoLiberacaoConsultaSequencia_;

        try {
          const resposta = await apiRequest('config', {
            consulta: 'retorno_liberacao_candidatos',
            filtros
          }, 25000);

          if (sequencia !== retornoLiberacaoConsultaSequencia_) return;
          retornoLiberacaoCandidatos_ = Array.isArray(resposta?.candidatos) ? resposta.candidatos : [];

          if (!retornoLiberacaoCandidatos_.length) {
            if (!String(retornoLiberacaoChaveAnteriorInput?.value || '').trim()) {
              resetarRetornoLiberacao_({ preservarManual: true, preservarDocumento: true });
            }
            return;
          }

          renderizarCandidatosRetornoLiberacao_();
        } catch (erro) {
          if (sequencia !== retornoLiberacaoConsultaSequencia_) return;
          // A conferência de retorno é auxiliar. Falha de consulta não bloqueia a vistoria.
        }
      }

      function agendarConsultaRetornoLiberacao_(espera = 650) {
        clearTimeout(retornoLiberacaoConsultaTimer_);
        if (!ehFluxoLiberacao_()) return;
        retornoLiberacaoConsultaTimer_ = setTimeout(() => { void consultarRetornoLiberacao_(); }, Math.max(50, Number(espera || 0)));
      }

      function responderPerguntaRetornoLiberacao_(resposta) {
        const candidato = candidatoRetornoLiberacaoSelecionado_();
        if (!candidato) return;

        const sim = resposta === 'sim';
        if (retornoLiberacaoInput) retornoLiberacaoInput.value = sim ? 'Sim' : 'Não';
        retornoLiberacaoSimBtn?.classList.toggle('is-selected', sim);
        retornoLiberacaoNaoBtn?.classList.toggle('is-selected', !sim);
        if (retornoLiberacaoDetalhes) retornoLiberacaoDetalhes.hidden = !sim;

        if (sim) {
          aplicarCandidatoRetornoLiberacao_(candidato, { preservarPendencias: false });
        } else {
          if (retornoLiberacaoPendenciasInput) retornoLiberacaoPendenciasInput.value = '';
          if (retornoLiberacaoNotificacoesOriginaisInput) retornoLiberacaoNotificacoesOriginaisInput.value = '';
        }
        scheduleDraftSave();
      }

      function restaurarRetornoLiberacaoDoPayload_(payload) {
        const p = payload && typeof payload === 'object' ? payload : {};
        const resposta = normalize(p.retornoLiberacao || '');
        const chave = String(p.retornoLiberacaoChaveAnterior || '').trim();
        if (!ehFluxoLiberacao_() || (!chave && resposta !== normalize('Não'))) return;

        if (retornoLiberacaoInput) retornoLiberacaoInput.value = resposta === normalize('Sim') ? 'Sim' : 'Não';
        if (retornoLiberacaoChaveAnteriorInput) retornoLiberacaoChaveAnteriorInput.value = chave;
        if (retornoLiberacaoLinhaAnteriorInput) retornoLiberacaoLinhaAnteriorInput.value = String(p.retornoLiberacaoLinhaAnterior || '');
        if (retornoLiberacaoDataAnteriorInput) retornoLiberacaoDataAnteriorInput.value = String(p.retornoLiberacaoDataAnterior || '');
        if (retornoLiberacaoSituacaoAnteriorInput) retornoLiberacaoSituacaoAnteriorInput.value = String(p.retornoLiberacaoSituacaoAnterior || '');
        if (retornoLiberacaoPscipAnteriorInput) retornoLiberacaoPscipAnteriorInput.value = String(p.retornoLiberacaoPscipAnterior || '');
        if (retornoLiberacaoNotificacoesOriginaisInput) retornoLiberacaoNotificacoesOriginaisInput.value = String(p.retornoLiberacaoNotificacoesOriginais || '');
        if (retornoLiberacaoPendenciasInput) retornoLiberacaoPendenciasInput.value = String(p.retornoLiberacaoPendencias || '');
        if (retornoLiberacaoDocumentoFileIdInput) retornoLiberacaoDocumentoFileIdInput.value = String(p.retornoLiberacaoDocumentoFileId || '');
        if (retornoLiberacaoDocumentoNomeInput) retornoLiberacaoDocumentoNomeInput.value = String(p.retornoLiberacaoDocumentoNome || '');
        if (retornoLiberacaoDocumentoUrlInput) retornoLiberacaoDocumentoUrlInput.value = String(p.retornoLiberacaoDocumentoUrl || '');
        if (retornoLiberacaoAbrirDocumentoBtn) retornoLiberacaoAbrirDocumentoBtn.hidden = !String(p.retornoLiberacaoDocumentoFileId || '');
        if (retornoLiberacaoPdfStatus && p.retornoLiberacaoDocumentoNome) {
          retornoLiberacaoPdfStatus.textContent = `PDF vinculado: ${p.retornoLiberacaoDocumentoNome}`;
          retornoLiberacaoPdfStatus.className = 'return-release-upload-status success';
        }

        const candidatoRestaurado = {
          chave,
          linha: p.retornoLiberacaoLinhaAnterior || '',
          carimbo: p.retornoLiberacaoDataAnterior || '',
          situacao: p.retornoLiberacaoSituacaoAnterior || '',
          pscip: p.retornoLiberacaoPscipAnterior || '',
          notificacoes: p.retornoLiberacaoNotificacoesOriginais || '',
          enderecoCompleto: '',
          correspondencias: ['vínculo salvo no rascunho']
        };

        retornoLiberacaoCandidatos_ = chave ? [candidatoRestaurado] : [];
        if (chave) {
          retornoLiberacaoSecao.hidden = false;
          retornoLiberacaoAnteriorSelect.innerHTML = `<option value="${escapeAttr(chave)}">${escapeHtml([candidatoRestaurado.carimbo, candidatoRestaurado.situacao, candidatoRestaurado.pscip].filter(Boolean).join(' — ') || 'Vistoria anterior vinculada')}</option>`;
          aplicarCandidatoRetornoLiberacao_(candidatoRestaurado, { preservarPendencias: true });
        }

        retornoLiberacaoSimBtn?.classList.toggle('is-selected', resposta === normalize('Sim'));
        retornoLiberacaoNaoBtn?.classList.toggle('is-selected', resposta === normalize('Não'));
        if (retornoLiberacaoDetalhes) retornoLiberacaoDetalhes.hidden = resposta !== normalize('Sim');

        if (navigator.onLine) agendarConsultaRetornoLiberacao_(400);
      }

      function arquivoParaDataUrl_(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Não foi possível ler o PDF.'));
          reader.readAsDataURL(file);
        });
      }

      async function anexarPdfRetornoLiberacao_(file) {
        if (!file) return;
        if (!usuarioPodeOperar_()) {
          await avisarGpv_('O perfil de consulta não pode anexar documentos.', 'Acesso restrito');
          return;
        }
        if (!navigator.onLine) {
          await avisarGpv_('Conecte-se à internet para enviar o PDF ao Drive.', 'PDF da notificação');
          return;
        }
        if (String(file.type || '').toLowerCase() !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
          await avisarGpv_('Selecione um arquivo PDF.', 'Documento inválido');
          return;
        }
        if (Number(file.size || 0) > 6 * 1024 * 1024) {
          await avisarGpv_('O PDF deve ter no máximo 6 MB.', 'Arquivo muito grande');
          return;
        }

        if (retornoLiberacaoPdfStatus) {
          retornoLiberacaoPdfStatus.textContent = 'Enviando PDF para o Drive...';
          retornoLiberacaoPdfStatus.className = 'return-release-upload-status';
        }

        try {
          const dataUrl = await arquivoParaDataUrl_(file);
          const resposta = await apiRequest('config', {
            consulta: 'retorno_liberacao_documento_salvar',
            dataUrl,
            nome: file.name || 'notificacao.pdf',
            registroId: currentRecordId,
            chaveAnterior: value('retornoLiberacaoChaveAnterior'),
            edificacao: value('nomeFantasia') || value('razaoSocial') || value('endereco') || 'Edificação',
            pscip: value('pscip'),
            substituirFileId: value('retornoLiberacaoDocumentoFileId')
          }, 45000);

          if (!resposta?.ok || !resposta.fileId) throw new Error(resposta?.error || 'O servidor não confirmou o PDF.');

          if (retornoLiberacaoDocumentoFileIdInput) retornoLiberacaoDocumentoFileIdInput.value = String(resposta.fileId || '');
          if (retornoLiberacaoDocumentoNomeInput) retornoLiberacaoDocumentoNomeInput.value = String(resposta.nome || file.name || '');
          if (retornoLiberacaoDocumentoUrlInput) retornoLiberacaoDocumentoUrlInput.value = String(resposta.url || '');
          if (retornoLiberacaoAbrirDocumentoBtn) retornoLiberacaoAbrirDocumentoBtn.hidden = false;
          if (retornoLiberacaoPdfStatus) {
            retornoLiberacaoPdfStatus.textContent = `✓ PDF salvo: ${resposta.nome || file.name}`;
            retornoLiberacaoPdfStatus.className = 'return-release-upload-status success';
          }
          scheduleDraftSave();
        } catch (erro) {
          if (retornoLiberacaoPdfStatus) {
            retornoLiberacaoPdfStatus.textContent = erro?.message || 'Não foi possível enviar o PDF.';
            retornoLiberacaoPdfStatus.className = 'return-release-upload-status error';
          }
        } finally {
          if (retornoLiberacaoPdfInput) retornoLiberacaoPdfInput.value = '';
        }
      }

      function fecharVisualizadorRetornoLiberacao_() {
        if (!retornoLiberacaoPdfModal) return;
        retornoLiberacaoPdfModal.hidden = true;
        document.body.classList.remove('return-pdf-open');
        if (retornoLiberacaoPdfFrame) retornoLiberacaoPdfFrame.src = 'about:blank';
        if (retornoLiberacaoDocumentoBlobUrl_) {
          try { URL.revokeObjectURL(retornoLiberacaoDocumentoBlobUrl_); } catch (e) {}
          retornoLiberacaoDocumentoBlobUrl_ = '';
        }
        retornoLiberacaoDocumentoExterno_ = '';
        if (retornoLiberacaoPdfExternalBtn) retornoLiberacaoPdfExternalBtn.hidden = true;
      }

      function abrirModalRetornoLiberacaoBase_(titulo, subtitulo) {
        if (!retornoLiberacaoPdfModal) return;
        retornoLiberacaoPdfModal.hidden = false;
        document.body.classList.add('return-pdf-open');
        if (retornoLiberacaoPdfTitle) retornoLiberacaoPdfTitle.textContent = titulo || 'Notificação da vistoria';
        if (retornoLiberacaoPdfSubtitle) retornoLiberacaoPdfSubtitle.textContent = subtitulo || 'Documento vinculado à vistoria.';
        if (retornoLiberacaoPdfLoading) {
          retornoLiberacaoPdfLoading.hidden = false;
          retornoLiberacaoPdfLoading.textContent = 'Carregando documento...';
        }
        if (retornoLiberacaoPdfFrame) retornoLiberacaoPdfFrame.src = 'about:blank';
      }

      function bytesBase64ParaBlob_(base64, mime = 'application/pdf') {
        const binario = atob(String(base64 || ''));
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
        return new Blob([bytes], { type: mime || 'application/pdf' });
      }

      async function abrirDocumentoRetornoLiberacaoNoApp_(dados = {}) {
        const fileId = String(dados.fileId || '').trim();
        const url = String(dados.url || '').trim();
        const nome = String(dados.nome || 'Notificação da vistoria').trim();

        abrirModalRetornoLiberacaoBase_(nome, 'Documento da notificação anterior');

        if (fileId) {
          try {
            const resposta = await apiRequest('config', {
              consulta: 'retorno_liberacao_documento',
              fileId
            }, 35000);

            if (!resposta?.ok || !resposta.base64) throw new Error(resposta?.error || 'Documento não disponível.');
            const blob = bytesBase64ParaBlob_(resposta.base64, resposta.mimeType || 'application/pdf');
            retornoLiberacaoDocumentoBlobUrl_ = URL.createObjectURL(blob);
            if (retornoLiberacaoPdfFrame) retornoLiberacaoPdfFrame.src = retornoLiberacaoDocumentoBlobUrl_;
            if (retornoLiberacaoPdfLoading) retornoLiberacaoPdfLoading.hidden = true;
            retornoLiberacaoDocumentoExterno_ = url || String(resposta.url || '');
            if (retornoLiberacaoPdfExternalBtn) retornoLiberacaoPdfExternalBtn.hidden = !retornoLiberacaoDocumentoExterno_;
            return;
          } catch (erro) {
            if (retornoLiberacaoPdfLoading) retornoLiberacaoPdfLoading.textContent = erro?.message || 'Não foi possível abrir o PDF.';
            retornoLiberacaoDocumentoExterno_ = url;
            if (retornoLiberacaoPdfExternalBtn) retornoLiberacaoPdfExternalBtn.hidden = !url;
            return;
          }
        }

        if (url) {
          retornoLiberacaoDocumentoExterno_ = url;
          if (retornoLiberacaoPdfFrame) retornoLiberacaoPdfFrame.src = url;
          if (retornoLiberacaoPdfLoading) retornoLiberacaoPdfLoading.hidden = true;
          if (retornoLiberacaoPdfExternalBtn) retornoLiberacaoPdfExternalBtn.hidden = false;
          return;
        }

        if (retornoLiberacaoPdfLoading) retornoLiberacaoPdfLoading.textContent = 'Nenhum documento foi informado.';
      }

      function abrirLinkRetornoLiberacao_() {
        const url = String(retornoLiberacaoDocumentoLinkInput?.value || '').trim();
        if (!/^https:\/\//i.test(url)) {
          avisarGpv_('Informe um link HTTPS válido.', 'Link da notificação');
          return;
        }
        void abrirDocumentoRetornoLiberacaoNoApp_({ url, nome: 'Notificação — link informado' });
      }

      function pendenciasRetornoFichaHtml_(retorno) {
        let itens = [];
        try {
          itens = typeof retorno?.pendencias === 'string' ? JSON.parse(retorno.pendencias || '[]') : (Array.isArray(retorno?.pendencias) ? retorno.pendencias : []);
        } catch (e) {
          itens = [];
        }
        if (!Array.isArray(itens) || !itens.length) return '';
        return `<div class="record-return-items">${itens.map((item, indice) => `<div class="record-return-item">
          <strong>${escapeHtml(item.item || item.tipo || `Irregularidade ${indice + 1}`)}</strong>
          ${item.descricao ? `<span>${escapeHtml(item.descricao)}</span>` : ''}
          <small>Situação no retorno: ${escapeHtml(item.status || 'Não verificado')}</small>
        </div>`).join('')}</div>`;
      }

      function montarBlocoRetornoLiberacaoFicha_(registro) {
        const retorno = registro?.retornoLiberacao || null;
        const posteriores = Array.isArray(registro?.retornosPosterioresLiberacao) ? registro.retornosPosterioresLiberacao : [];
        if (!retorno && !posteriores.length) return '';

        let html = '<section class="record-detail-group record-return-release"><h3>Retorno de vistoria de liberação</h3>';

        if (retorno) {
          html += `<div class="record-return-header">
            <div>
              <strong>Esta vistoria é retorno de uma vistoria anterior</strong>
              <span>${escapeHtml([retorno.dataAnterior, retorno.situacaoAnterior, retorno.pscipAnterior ? `PSCIP ${retorno.pscipAnterior}` : ''].filter(Boolean).join(' • '))}</span>
            </div>
          </div>`;

          html += pendenciasRetornoFichaHtml_(retorno);

          if (retorno.notificacoesManual) {
            html += `<div class="record-return-item"><strong>Complemento das notificações anteriores</strong><span>${escapeHtml(retorno.notificacoesManual)}</span></div>`;
          }

          html += '<div class="record-return-actions">';
          if (retorno.chaveAnterior) {
            html += `<button class="btn btn-secondary" type="button" data-return-open-record="${escapeAttr(retorno.chaveAnterior)}" data-return-open-line="${escapeAttr(retorno.linhaAnterior || '')}">Ver vistoria anterior</button>`;
          }
          if (retorno.documentoFileId || retorno.documentoLink) {
            html += `<button class="btn btn-primary" type="button" data-return-open-document data-return-file-id="${escapeAttr(retorno.documentoFileId || '')}" data-return-document-name="${escapeAttr(retorno.documentoNome || 'Notificação da vistoria')}" data-return-document-url="${escapeAttr(retorno.documentoLink || retorno.documentoUrl || '')}">Abrir notificação</button>`;
          }
          if (retorno.documentoLink) {
            html += `${botaoCopiarValorFichaHtml_('Link da notificação', retorno.documentoLink)}`;
          }
          html += '</div>';
        }

        if (posteriores.length) {
          html += `<div class="record-return-items"><strong>Retornos vinculados a esta vistoria</strong>${posteriores.map(item => `<div class="record-return-item">
            <strong>${escapeHtml([item.dataAtual, item.situacaoAtual].filter(Boolean).join(' • ') || 'Retorno posterior')}</strong>
            <span>${escapeHtml(item.pscipAtual ? `PSCIP ${item.pscipAtual}` : '')}</span>
            <div class="record-return-actions">
              ${item.chaveAtual ? `<button class="btn btn-secondary" type="button" data-return-open-record="${escapeAttr(item.chaveAtual)}" data-return-open-line="${escapeAttr(item.linhaAtual || '')}">Ver vistoria de retorno</button>` : ''}
            </div>
          </div>`).join('')}</div>`;
        }

        html += '</section>';
        return html;
      }

      function coordenadaDecimalTexto_(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return '';
        return String(numero);
      }

      function localizacaoValidaFormulario_() {
        const lat = Number(localizacaoLatitudeInput?.value);
        const lon = Number(localizacaoLongitudeInput?.value);
        return Number.isFinite(lat) && Number.isFinite(lon) &&
          lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      }

      function limparStatusLocalizacao_() {
        if (locationAddressStatus) {
          locationAddressStatus.hidden = true;
          locationAddressStatus.className = 'location-address-status';
          locationAddressStatus.innerHTML = '';
        }
      }

      function mostrarStatusLocalizacao_(html, tipo = 'info') {
        if (!locationAddressStatus) return;
        locationAddressStatus.hidden = false;
        locationAddressStatus.className = `location-address-status ${tipo === 'error' ? 'is-error' : 'is-info'}`;
        locationAddressStatus.innerHTML = html;
      }

      function enderecoLocalizacaoHtml_(resultado) {
        const logradouro = String(resultado?.logradouro || '').trim();
        const numero = String(resultado?.numero || '').trim();
        const bairro = String(resultado?.bairro || '').trim();
        const cidade = String(resultado?.cidade || '').trim();
        const uf = String(resultado?.uf || '').trim();
        const cep = String(resultado?.cep || '').trim();

        const primeira = [
          [logradouro, numero].filter(Boolean).join(', '),
          bairro
        ].filter(Boolean).join(' — ');

        const segundaCidade = [cidade, uf].filter(Boolean).join(' — ');
        const segunda = [segundaCidade, cep ? `CEP ${cep}` : ''].filter(Boolean).join(' — ');

        let linhas = [primeira, segunda].filter(Boolean);

        if (!linhas.length) {
          const fallback = String(resultado?.enderecoIdentificado || '').trim();
          if (fallback) linhas = fallback.split(/\s*\|\s*/).filter(Boolean);
        }

        return linhas.length
          ? `<strong>Endereço identificado:</strong>${linhas.map(linha => `<div>${escapeHtml(linha)}</div>`).join('')}`
          : '';
      }

      function enderecoLocalizacaoTexto_(resultado) {
        const logradouro = String(resultado?.logradouro || '').trim();
        const numero = String(resultado?.numero || '').trim();
        const bairro = String(resultado?.bairro || '').trim();
        const cidade = String(resultado?.cidade || '').trim();
        const uf = String(resultado?.uf || '').trim();
        const cep = String(resultado?.cep || '').trim();
        const linhas = [
          [[logradouro, numero].filter(Boolean).join(', '), bairro].filter(Boolean).join(' — '),
          [[cidade, uf].filter(Boolean).join(' — '), cep ? `CEP ${cep}` : ''].filter(Boolean).join(' — ')
        ].filter(Boolean);
        if (linhas.length) return linhas.join('\n');
        return String(resultado?.enderecoIdentificado || '').trim().replace(/\s*\|\s*/g, '\n');
      }

      function enderecoAtualFormularioTexto_() {
        const cidade = citySelect?.value === 'Outro'
          ? String(otherCity?.value || '').trim()
          : String(citySelect?.value || '').trim();
        return [
          [String(value('endereco') || '').trim(), String(value('numero') || '').trim()].filter(Boolean).join(', '),
          String(value('bairro') || '').trim(),
          cidade
        ].filter(Boolean).join(' — ');
      }

      function aplicarCidadeLocalizacao_(cidade) {
        const informada = String(cidade || '').trim();
        if (!informada || !citySelect) return;

        const opcao = findCityOption(informada);
        if (opcao) {
          citySelect.value = opcao.value;
          if (otherCity) otherCity.value = '';
        } else {
          citySelect.value = 'Outro';
          if (otherCity) otherCity.value = informada;
        }
        syncOtherCity();
      }

      function aplicarEnderecoDaLocalizacao_(resultado, substituir = false) {
        if (!resultado || typeof resultado !== 'object') return;

        const enderecoAtual = String(value('endereco') || '').trim();
        const numeroAtual = String(value('numero') || '').trim();
        const bairroAtual = String(value('bairro') || '').trim();

        if (substituir || !enderecoAtual) {
          const campo = document.getElementById('endereco');
          if (campo && resultado.logradouro) campo.value = String(resultado.logradouro);
        }
        if (substituir || !numeroAtual) {
          const campo = document.getElementById('numero');
          if (campo && resultado.numero) campo.value = String(resultado.numero);
        }
        if (substituir || !bairroAtual) {
          const campo = document.getElementById('bairro');
          if (campo && resultado.bairro) campo.value = String(resultado.bairro);
        }

        aplicarCidadeLocalizacao_(resultado.cidade);

        if (localizacaoEnderecoIdentificadoInput) {
          const identificado = String(resultado.enderecoIdentificado || enderecoLocalizacaoTexto_(resultado).replace(/\n/g, ' | ')).trim();
          localizacaoEnderecoIdentificadoInput.value = identificado;
        }

        const html = enderecoLocalizacaoHtml_(resultado);
        if (html) mostrarStatusLocalizacao_(html, 'info');

        syncResponsibleAddress();
        scheduleDraftSave();
        agendarConsultaRetornoLiberacao_(250);
      }

      let localizacaoConsultaSequencia_ = 0;

      async function identificarEnderecoPorLocalizacao_(silencioso = false) {
        if (!localizacaoValidaFormulario_() || !navigator.onLine) return null;
        const sequencia = ++localizacaoConsultaSequencia_;

        if (!silencioso) {
          mostrarStatusLocalizacao_('<strong>Localização capturada.</strong><div>Identificando o endereço...</div>', 'info');
        }

        try {
          const resposta = await apiRequest('config', {
            consulta: 'geocodificar_localizacao',
            latitude: localizacaoLatitudeInput?.value || '',
            longitude: localizacaoLongitudeInput?.value || ''
          }, 25000);

          if (sequencia !== localizacaoConsultaSequencia_) return null;

          if (!resposta?.ok) throw new Error(resposta?.error || 'Endereço não identificado.');

          const temEndereco = [
            resposta.logradouro,
            resposta.numero,
            resposta.bairro,
            resposta.cidade,
            resposta.uf,
            resposta.cep,
            resposta.enderecoIdentificado
          ].some(valor => String(valor || '').trim());

          if (!temEndereco) {
            if (!silencioso) {
              mostrarStatusLocalizacao_(
                '<strong>Localização capturada.</strong><div>Não foi possível identificar o endereço automaticamente. Você pode continuar o preenchimento.</div>',
                'error'
              );
            }
            return resposta;
          }

          const enderecoEncontrado = enderecoLocalizacaoTexto_(resposta);
          if (localizacaoEnderecoIdentificadoInput) {
            localizacaoEnderecoIdentificadoInput.value = String(resposta.enderecoIdentificado || enderecoEncontrado.replace(/\n/g, ' | ')).trim();
          }
          scheduleDraftSave();

          const enderecoAtual = enderecoAtualFormularioTexto_();
          const mensagem = [
            'Endereço encontrado pela localização:',
            enderecoEncontrado,
            enderecoAtual ? `\nEndereço atualmente preenchido:\n${enderecoAtual}` : '',
            '\nDeseja usar o endereço encontrado nos campos desta vistoria?'
          ].filter(Boolean).join('\n');
          const usarEndereco = await confirmarGpv_(
            mensagem,
            'Endereço identificado',
            {
              tom: 'info',
              rotuloConfirmar: 'Usar endereço',
              rotuloCancelar: enderecoAtual ? 'Manter endereço atual' : 'Não usar'
            }
          );

          if (sequencia !== localizacaoConsultaSequencia_) return resposta;
          if (usarEndereco) {
            aplicarEnderecoDaLocalizacao_(resposta, true);
            const html = enderecoLocalizacaoHtml_(resposta);
            if (html) mostrarStatusLocalizacao_(`${html}<div><strong>Endereço aplicado ao formulário.</strong></div>`, 'info');
          } else {
            const html = enderecoLocalizacaoHtml_(resposta);
            if (html) mostrarStatusLocalizacao_(`${html}<div>O endereço encontrado não foi aplicado. As coordenadas foram preservadas.</div>`, 'info');
          }
          return resposta;
        } catch (erro) {
          if (sequencia !== localizacaoConsultaSequencia_) return null;
          if (!silencioso) {
            mostrarStatusLocalizacao_(
              '<strong>Localização capturada.</strong><div>O endereço não pôde ser identificado agora. As coordenadas foram preservadas.</div>',
              'error'
            );
          }
          return null;
        }
      }

      function restaurarStatusLocalizacao_() {
        if (!localizacaoValidaFormulario_()) {
          limparStatusLocalizacao_();
          return;
        }

        const enderecoIdentificado = String(localizacaoEnderecoIdentificadoInput?.value || '').trim();
        if (enderecoIdentificado) {
          const linhas = enderecoIdentificado.split(/\s*\|\s*/).filter(Boolean);
          mostrarStatusLocalizacao_(
            `<strong>Endereço identificado:</strong>${linhas.map(linha => `<div>${escapeHtml(linha)}</div>`).join('')}`,
            'info'
          );
          return;
        }

        if (!navigator.onLine) {
          mostrarStatusLocalizacao_(
            '<strong>Localização capturada.</strong><div>Sem internet para identificar o endereço neste momento.</div>',
            'info'
          );
          return;
        }

        mostrarStatusLocalizacao_(
          '<strong>Localização capturada.</strong><div>O endereço poderá ser identificado automaticamente.</div>',
          'info'
        );
      }

      async function usarLocalizacaoAtual_() {
        if (!navigator.geolocation) {
          await avisarGpv_('Este aparelho ou navegador não disponibiliza a localização atual.', 'Localização indisponível');
          return;
        }

        if (useCurrentLocationBtn) {
          useCurrentLocationBtn.disabled = true;
          useCurrentLocationBtn.querySelector('span')?.replaceChildren(document.createTextNode('Obtendo localização...'));
        }

        mostrarStatusLocalizacao_('<strong>Obtendo localização atual...</strong><div>Aguarde o posicionamento do aparelho.</div>', 'info');

        navigator.geolocation.getCurrentPosition(async posicao => {
          const lat = coordenadaDecimalTexto_(posicao?.coords?.latitude);
          const lon = coordenadaDecimalTexto_(posicao?.coords?.longitude);

          if (!lat || !lon) {
            mostrarStatusLocalizacao_(
              '<strong>Não foi possível obter a localização.</strong><div>Tente novamente em um local com melhor recepção do GPS.</div>',
              'error'
            );
          } else {
            if (localizacaoLatitudeInput) localizacaoLatitudeInput.value = lat;
            if (localizacaoLongitudeInput) localizacaoLongitudeInput.value = lon;
            if (localizacaoCoordenadasInput) localizacaoCoordenadasInput.value = `${lat}, ${lon}`;
            if (localizacaoPrecisaoInput) localizacaoPrecisaoInput.value = Number.isFinite(Number(posicao?.coords?.accuracy))
              ? String(Math.round(Number(posicao.coords.accuracy)))
              : '';
            if (localizacaoCapturadaEmInput) localizacaoCapturadaEmInput.value = new Date().toISOString();
            if (localizacaoEnderecoIdentificadoInput) localizacaoEnderecoIdentificadoInput.value = '';

            scheduleDraftSave();

            if (navigator.onLine) {
              await identificarEnderecoPorLocalizacao_(false);
            } else {
              mostrarStatusLocalizacao_(
                '<strong>Localização capturada.</strong><div>Sem internet para identificar o endereço agora. As coordenadas serão mantidas no registro.</div>',
                'info'
              );
            }

            // V23.9.99by — quando Endereço era a pendência atual, uma localização
            // GPS válida já satisfaz a mesma exigência e a validação segue para o
            // próximo campo sem obrigar o militar a tocar novamente em Registrar.
            if (validacaoGuiadaAtiva_ && validacaoGuiadaAtual_?.id === 'endereco' && localizacaoValidaFormulario_()) {
              setTimeout(() => validateRequired(true), 120);
            }
          }

          if (useCurrentLocationBtn) {
            useCurrentLocationBtn.disabled = false;
            useCurrentLocationBtn.querySelector('span')?.replaceChildren(document.createTextNode('Usar localização atual'));
          }
        }, async erro => {
          let mensagem = 'Não foi possível obter a localização atual.';
          if (erro?.code === 1) mensagem = 'A permissão de localização foi negada. Autorize o acesso à localização para usar esta função.';
          if (erro?.code === 2) mensagem = 'A localização não está disponível neste momento. Verifique se o GPS/localização do aparelho está ativado.';
          if (erro?.code === 3) mensagem = 'O aparelho demorou para obter a localização. Tente novamente.';

          mostrarStatusLocalizacao_(`<strong>Localização não capturada.</strong><div>${escapeHtml(mensagem)}</div>`, 'error');

          if (useCurrentLocationBtn) {
            useCurrentLocationBtn.disabled = false;
            useCurrentLocationBtn.querySelector('span')?.replaceChildren(document.createTextNode('Usar localização atual'));
          }
        }, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 60000
        });
      }

      function showCnpjStatus(message, type = 'info') {
        cnpjStatus.className = 'lookup-status show ' + type;
        cnpjStatus.textContent = message;
      }

      function clearCnpjStatus() {
        cnpjStatus.className = 'lookup-status';
        cnpjStatus.textContent = '';
      }

      function findCityOption(city) {
        const target = normalize(city);
        return Array.from(citySelect.options).find(opt => normalize(opt.value) === target);
      }

      function aplicarCidadeRetornadaCnpj_(cidadeRetornada) {
        const cidade = String(cidadeRetornada || '').trim();
        if (!cidade) return;
        const opcao = findCityOption(cidade);
        if (opcao) {
          citySelect.value = opcao.value;
          otherCity.value = '';
        } else {
          citySelect.value = 'Outro';
          otherCity.value = cidade;
        }
        syncOtherCity();
        citySelect.dispatchEvent(new Event('change', { bubbles: true }));
        otherCity.dispatchEvent(new Event('input', { bubbles: true }));
        scheduleDraftSave();
      }

      function confirmarCidadeRetornadaCnpj_(cidadeRetornada) {
        const retornada = String(cidadeRetornada || '').trim();
        const atual = cityValue();
        if (!retornada || !atual || normalize(retornada) === normalize(atual)) {
          return Promise.resolve({ alterada: false, divergencia: false });
        }

        if (!cityCheckModal || !cityCheckText || !cityCheckChangeBtn || !cityCheckKeepBtn) {
          return confirmarGpv_(
            `O CNPJ consultado está cadastrado em ${retornada}, mas a cidade selecionada é ${atual}.`,
            'Cidade divergente',
            { rotuloConfirmar: `Usar ${retornada}`, rotuloCancelar: `Manter ${atual}` }
          ).then(alterar => {
            if (alterar) aplicarCidadeRetornadaCnpj_(retornada);
            return { alterada: alterar, divergencia: true };
          });
        }

        cityCheckText.textContent = `O CNPJ consultado está cadastrado em ${retornada}, mas a cidade selecionada é ${atual}. Deseja alterar a cidade da vistoria para ${retornada}?`;
        // V23.9.4: a divergência é resolvida em popup; a página permanece na posição atual.
        cityCheckModal.hidden = false;
        document.body.classList.add('city-check-open');

        return new Promise(resolve => {
          let encerrado = false;
          const finalizar = alterada => {
            if (encerrado) return;
            encerrado = true;
            cityCheckModal.hidden = true;
            document.body.classList.remove('city-check-open');
            cityCheckChangeBtn.removeEventListener('click', onAlterar);
            cityCheckKeepBtn.removeEventListener('click', onManter);
            document.removeEventListener('keydown', onKeydown);
            resolve({ alterada, divergencia: true });
          };
          const onAlterar = () => {
            aplicarCidadeRetornadaCnpj_(retornada);
            finalizar(true);
          };
          const onManter = () => finalizar(false);
          const onKeydown = event => {
            if (event.key === 'Escape') onManter();
          };
          cityCheckChangeBtn.addEventListener('click', onAlterar);
          cityCheckKeepBtn.addEventListener('click', onManter);
          document.addEventListener('keydown', onKeydown);
          setTimeout(() => cityCheckChangeBtn.focus(), 30);
        });
      }

      function setFieldFromCnpj_(id, newValue, sobrescrever = false) {
        const el = document.getElementById(id);
        const text = String(newValue == null ? '' : newValue).trim();
        if (!el || !text) return false;
        if (!sobrescrever && String(el.value || '').trim()) return false;
        const mudou = String(el.value || '').trim() !== text;
        if (mudou) {
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return mudou;
      }

      function limparDadosEmpresaParaNovoCnpj_(novoCnpj) {
        const campos = ['nomeFantasia', 'razaoSocial', 'endereco', 'numero', 'complemento', 'bairro'];
        campos.forEach(id => {
          const el = document.getElementById(id);
          if (!el || !String(el.value || '').trim()) return;
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const correspondencia = document.getElementById('enderecoCorrespondencia');
        if (correspondencia) {
          correspondencia.value = appConfig?.padroes?.enderecoCorrespondencia || 'O Mesmo';
          correspondencia.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (document.getElementById('mesmoEnderecoResponsavel')?.checked) {
          syncResponsibleAddress();
        }

        ultimoCnpjConsultado = '';
        cnpjAssociadoDadosEmpresa = String(novoCnpj || '');
        esconderHistoricoEstabelecimento_();
        scheduleDraftSave();
      }

      function prepararNovoCnpj_(novoCnpj) {
        const atual = String(novoCnpj || '');
        if (!atual || atual.length !== 14) return;
        if (!cnpjAssociadoDadosEmpresa) {
          cnpjAssociadoDadosEmpresa = atual;
          return;
        }
        if (cnpjAssociadoDadosEmpresa !== atual) {
          limparDadosEmpresaParaNovoCnpj_(atual);
        }
      }

      function fillFromCnpj(result) {
        let count = 0;

        // Nome Fantasia e Razão Social identificam a empresa e, por isso,
        // o retorno do CNPJ prevalece sobre resíduos de rascunho/autopreenchimento.
        if (setFieldFromCnpj_('nomeFantasia', result.nomeFantasia, true)) count += 1;
        if (setFieldFromCnpj_('razaoSocial', result.razaoSocial, true)) count += 1;

        // Endereço pode corresponder ao local efetivamente vistoriado e não
        // necessariamente ao endereço cadastral do CNPJ. Após limpar um CNPJ
        // anterior, preenche somente se o usuário ainda não informou o local.
        if (setFieldFromCnpj_('endereco', result.endereco)) count += 1;
        if (setFieldFromCnpj_('numero', result.numero)) count += 1;
        if (setFieldFromCnpj_('complemento', result.complemento)) count += 1;
        if (setFieldFromCnpj_('bairro', result.bairro)) count += 1;
        // Telefone e e-mail pertencem ao responsável e não são preenchidos pela consulta do CNPJ.

        if (document.getElementById('mesmoEnderecoResponsavel').checked) {
          syncResponsibleAddress();
        }

        scheduleDraftSave();
        return count;
      }

      async function consultarCnpj(automatico = false) {
        if (tipoIdentificador_(value('cnpj')) !== 'cnpj') {
          if (!automatico) showCnpjStatus('A consulta automática é usada somente para CNPJ com 14 dígitos.', 'info');
          return;
        }
        if (!navigator.onLine) {
          if (!automatico) showCnpjStatus('Sem internet. Preencha os dados manualmente; a consulta automática ficará disponível quando a conexão voltar.', 'info');
          return;
        }

        const cnpj = digits(value('cnpj'));
        prepararNovoCnpj_(cnpj);
        if (automatico && cnpj === ultimoCnpjConsultado) return;

        const sequencia = ++cnpjConsultaSequencia;
        showCnpjStatus('CNPJ identificado. Consultando dados cadastrais...', 'info');

        try {
          const result = await apiRequest('cnpj', { cnpj }, 30000);

          // Proteção contra resposta atrasada: só aplica a resposta se o usuário
          // ainda estiver com o mesmo CNPJ que originou esta consulta.
          if (sequencia !== cnpjConsultaSequencia || digits(value('cnpj')) !== cnpj) return;

          ultimoCnpjConsultado = cnpj;
          cnpjAssociadoDadosEmpresa = cnpj;
          const alterados = fillFromCnpj(result || {});

          // Confere novamente antes de abrir a confirmação de cidade.
          if (digits(value('cnpj')) !== cnpj) return;
          const conferenciaCidade = await confirmarCidadeRetornadaCnpj_(result?.cidade);
          if (digits(value('cnpj')) !== cnpj) return;

          const complementoCidade = conferenciaCidade.divergencia
            ? (conferenciaCidade.alterada
                ? ` Cidade alterada para ${String(result?.cidade || '').trim()}.`
                : ` Cidade atual mantida em ${cityValue()}.`)
            : '';

          showCnpjStatus(
            alterados
              ? `Consulta concluída. ${alterados} campo(s) cadastral(is) foram atualizados para este CNPJ.${complementoCidade} Confira os dados antes de registrar.`
              : `Consulta concluída. Os dados cadastrais já correspondem a este CNPJ.${complementoCidade}`,
            'success'
          );
          consultarHistoricoEstabelecimento_({ silencioso: true }).catch(() => {});
          // Mantém a posição atual após validar o CNPJ. O usuário segue o formulário manualmente.
        } catch (error) {
          if (sequencia !== cnpjConsultaSequencia || digits(value('cnpj')) !== cnpj) return;
          showCnpjStatus(error?.message || 'Não foi possível consultar o CNPJ. Continue o preenchimento manualmente.', 'error');
        }
      }

      function sincronizarIdentificadorComCpf_(cpf) {
        const d = digits(cpf);
        if (d.length !== 11 || !cpfInput) return;
        const cpfAtual = digits(cpfInput.value);
        if (
          responsavelCamposEditadosManual_.has('cpf') ||
          (cpfAtual && cpfAtual !== d)
        ) {
          cpfCopiadoDoIdentificador = '';
          cpfInput.readOnly = false;
          cpfInput.classList.remove('cpf-synced-from-identifier');
          return;
        }
        preenchendoResponsavelLookup = true;
        try {
          cpfInput.value = formatarCpfTela_(d);
          cpfCopiadoDoIdentificador = d;
          cpfInput.readOnly = false;
          cpfInput.classList.add('cpf-synced-from-identifier');
          cpfInput.dispatchEvent(new Event('input', { bubbles: true }));
        } finally {
          preenchendoResponsavelLookup = false;
        }
        if (ehEventoDeclaratorio_()) agendarConsultaResponsavelPorCpf_();
      }

      function limparCpfCopiadoSeVirouCnpj_() {
        if (!cpfInput) return;
        if (cpfCopiadoDoIdentificador && digits(cpfInput.value) === cpfCopiadoDoIdentificador) cpfInput.value = '';
        cpfCopiadoDoIdentificador = '';
        cpfInput.readOnly = false;
        cpfInput.classList.remove('cpf-synced-from-identifier');
      }

      function atualizarInterfaceIdentificador_(tipo) {
        if (identificadorLabel) identificadorLabel.textContent = tipo === 'cnpj' ? 'CNPJ' : tipo === 'cpf' ? 'CPF' : 'CNPJ ou CPF';
        if (cpfInput && tipo !== 'cpf' && !cpfCopiadoDoIdentificador) {
          cpfInput.readOnly = false;
          cpfInput.classList.remove('cpf-synced-from-identifier');
        }
      }

      function applyIdentificadorMask(event) {
        const target = event?.target || identificadorInput;
        if (!target) return;
        const raw = digits(target.value).slice(0, 14);
        clearTimeout(cnpjTimer);
        cnpjConsultaSequencia += 1;

        if (raw.length <= 10) {
          target.value = raw;
          ultimoCnpjConsultado = '';
          atualizarInterfaceIdentificador_('');
          clearCnpjStatus();
          esconderHistoricoEstabelecimento_();
          return;
        }

        if (raw.length === 11) {
          if (cnpjAssociadoDadosEmpresa) {
            limparDadosEmpresaParaNovoCnpj_('');
          }
          target.value = formatarCpfTela_(raw);
          ultimoCnpjConsultado = '';
          atualizarInterfaceIdentificador_('cpf');
          cnpjTimer = setTimeout(() => {
            if (tipoIdentificador_(value('cnpj')) !== 'cpf') return;
            sincronizarIdentificadorComCpf_(raw);
            showCnpjStatus('CPF identificado. O número foi levado para o CPF do responsável.', 'success');
            scheduleDraftSave();
            consultarHistoricoEstabelecimento_({ silencioso: true }).catch(() => {});
          }, 650);
          return;
        }

        limparCpfCopiadoSeVirouCnpj_();
        target.value = formatarCnpjTela_(raw);
        atualizarInterfaceIdentificador_(raw.length === 14 ? 'cnpj' : '');
        clearCnpjStatus();
        if (raw.length === 14) {
          prepararNovoCnpj_(raw);
          cnpjTimer = setTimeout(() => consultarCnpj(true), 700);
        } else {
          ultimoCnpjConsultado = '';
          esconderHistoricoEstabelecimento_();
        }
      }

      function applyCpfMask(event) {
        let v = digits(event.target.value).slice(0, 11);
        v = v.replace(/^(\d{3})(\d)/, '$1.$2')
             .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
             .replace(/\.(\d{3})(\d)/, '.$1-$2');
        event.target.value = v;
        if (cpfCopiadoDoIdentificador && digits(v) !== cpfCopiadoDoIdentificador) cpfCopiadoDoIdentificador = '';
        if (ehEventoDeclaratorio_()) agendarConsultaResponsavelPorCpf_();
      }



      function esconderHistoricoEstabelecimento_() {
        historicoEstabelecimentoAtual = [];
        if (!establishmentHistoryPanel || !establishmentHistoryResults) return;
        establishmentHistoryResults.innerHTML = '';
        establishmentHistoryPanel.hidden = true;
      }

      function rotuloHistoricoEstabelecimento_(item) {
        const nome = item?.nomeFantasia || item?.razaoSocial || 'Estabelecimento anterior';
        const id = item?.cnpj ? formatarCnpjTela_(item.cnpj) : (item?.cpfEstabelecimento ? formatarCpfTela_(item.cpfEstabelecimento) : '');
        const endereco = [item?.endereco, item?.numero, item?.bairro].filter(Boolean).join(', ');
        return { nome, detalhe: [id, endereco, item?.carimbo ? formatarDataPainel_(item.carimbo) : ''].filter(Boolean).join(' • ') };
      }

      function renderizarHistoricoEstabelecimento_(resultados) {
        historicoEstabelecimentoAtual = Array.isArray(resultados) ? resultados : [];
        if (!establishmentHistoryPanel || !establishmentHistoryResults) return;
        if (!historicoEstabelecimentoAtual.length) {
          esconderHistoricoEstabelecimento_();
          return;
        }
        establishmentHistoryResults.innerHTML = historicoEstabelecimentoAtual.map((item, index) => {
          const rotulo = rotuloHistoricoEstabelecimento_(item);
          return `<div class="establishment-history-item">
            <div class="establishment-history-copy">
              <strong>${escapeHtml(rotulo.nome)}</strong>
              <span>${escapeHtml(rotulo.detalhe || 'Registro anterior encontrado')}</span>
            </div>
            <button class="establishment-history-use" type="button" data-history-establishment-index="${index}">Usar dados</button>
          </div>`;
        }).join('');
        establishmentHistoryPanel.hidden = false;
      }

      function setFieldHistoricoSeVazio_(id, valor, formatter = null) {
        const el = document.getElementById(id);
        if (!el) return false;
        let texto = String(valor == null ? '' : valor).trim();
        if (!texto || String(el.value || '').trim()) return false;
        if (formatter) texto = formatter(texto);
        el.value = texto;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      async function aplicarHistoricoEstabelecimento_(item) {
        if (!item) return;
        const nome = item.nomeFantasia || item.razaoSocial || 'este estabelecimento';
        if (!(await confirmarGpv_(
          `Os dados históricos de ${nome} serão usados somente nos campos que ainda estiverem vazios.`,
          'Usar dados históricos?',
          { rotuloConfirmar: 'Usar dados' }
        ))) return;

        let alterados = 0;
        const tipoAtual = tipoIdentificador_(value('cnpj'));
        if (!tipoAtual && item.cnpj) {
          identificadorInput.value = formatarCnpjTela_(item.cnpj);
          atualizarInterfaceIdentificador_('cnpj');
          cnpjAssociadoDadosEmpresa = digits(item.cnpj);
          alterados += 1;
        } else if (!tipoAtual && item.cpfEstabelecimento) {
          identificadorInput.value = formatarCpfTela_(item.cpfEstabelecimento);
          atualizarInterfaceIdentificador_('cpf');
          sincronizarIdentificadorComCpf_(item.cpfEstabelecimento);
          alterados += 1;
        }

        if (setFieldHistoricoSeVazio_('nomeFantasia', item.nomeFantasia)) alterados += 1;
        if (setFieldHistoricoSeVazio_('razaoSocial', item.razaoSocial)) alterados += 1;
        if (setFieldHistoricoSeVazio_('endereco', item.endereco)) alterados += 1;
        if (setFieldHistoricoSeVazio_('numero', item.numero)) alterados += 1;
        if (setFieldHistoricoSeVazio_('complemento', item.complemento)) alterados += 1;
        if (setFieldHistoricoSeVazio_('bairro', item.bairro)) alterados += 1;
        if (setFieldHistoricoSeVazio_('enderecoCorrespondencia', item.enderecoCorrespondencia)) alterados += 1;
        if (setFieldHistoricoSeVazio_('telefone', item.telefone, formatarTelefoneTela_)) alterados += 1;
        if (setFieldHistoricoSeVazio_('responsavel', item.responsavel)) alterados += 1;
        if (setFieldHistoricoSeVazio_('nomeResponsavel', item.nomeResponsavel)) alterados += 1;
        if (setFieldHistoricoSeVazio_('cpf', item.cpfResponsavel, formatarCpfTela_)) alterados += 1;
        if (setFieldHistoricoSeVazio_('email', item.email)) alterados += 1;

        if (!cityValue() && item.cidade) {
          aplicarCidadeRetornadaCnpj_(item.cidade);
          alterados += 1;
        }
        if (document.getElementById('mesmoEnderecoResponsavel')?.checked) syncResponsibleAddress();
        scheduleDraftSave();
        if (item.cnpj && digits(value('cnpj')) === digits(item.cnpj)) {
          setTimeout(() => consultarCnpj(true), 120);
        }
        appStatus.textContent = alterados
          ? `${alterados} dado(s) histórico(s) recuperado(s). Confira antes de registrar.`
          : 'Os campos atuais já estavam preenchidos; nenhum dado histórico foi substituído.';
      }

      async function consultarHistoricoEstabelecimento_(opcoes = {}) {
        if (!navigator.onLine) {
          esconderHistoricoEstabelecimento_();
          return;
        }
        const identificador = digits(value('cnpj'));
        const nome = String(value('nomeFantasia') || value('razaoSocial') || '').trim();
        const tipo = tipoIdentificador_(identificador);
        if (!tipo && nome.length < 3) {
          esconderHistoricoEstabelecimento_();
          return;
        }

        const sequencia = ++estabelecimentoLookupSequencia;
        try {
          const result = await apiRequest('config', {
            consulta: 'estabelecimento_historico',
            filtros: {
              identificador: tipo ? identificador : '',
              nome: tipo ? '' : nome
            }
          }, 30000);
          if (sequencia !== estabelecimentoLookupSequencia) return;
          renderizarHistoricoEstabelecimento_(result?.resultados || []);
        } catch (erro) {
          if (sequencia !== estabelecimentoLookupSequencia) return;
          if (!opcoes.silencioso) esconderHistoricoEstabelecimento_();
        }
      }

      function agendarHistoricoEstabelecimento_(delay = 650) {
        clearTimeout(estabelecimentoLookupTimer);
        estabelecimentoLookupTimer = setTimeout(() => consultarHistoricoEstabelecimento_({ silencioso: true }), delay);
      }

      function showResponsavelLookupStatus_(message, type = 'info') {
        if (!responsavelLookupStatus) return;
        responsavelLookupStatus.className = 'lookup-status show ' + type;
        responsavelLookupStatus.textContent = message;
      }

      function clearResponsavelLookupStatus_() {
        if (!responsavelLookupStatus) return;
        responsavelLookupStatus.className = 'lookup-status';
        responsavelLookupStatus.textContent = '';
      }

      function esconderResponsavelLookupResultados_() {
        responsaveisLookupAtual = [];
        if (!responsavelLookupResultados) return;
        responsavelLookupResultados.innerHTML = '';
        responsavelLookupResultados.classList.remove('show');
      }

      function formatarTelefoneTela_(valor) {
        const d = digits(valor).slice(-11);
        if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
        if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
        return String(valor || '');
      }

      function formatarDataNascimentoDigitacao_(valor) {
        const texto = String(valor || '').trim();

        // Compatibilidade com dados antigos no formato AAAA-MM-DD.
        const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

        const d = digits(texto).slice(0, 8);
        if (d.length <= 2) return d;
        if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
        return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
      }

      function dataNascimentoValida_(valor) {
        const texto = String(valor || '').trim();
        if (!texto) return true;

        const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return false;

        const dia = Number(m[1]);
        const mes = Number(m[2]);
        const ano = Number(m[3]);
        if (ano < 1900 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;

        const data = new Date(ano, mes - 1, dia);
        if (
          data.getFullYear() !== ano ||
          data.getMonth() !== mes - 1 ||
          data.getDate() !== dia
        ) return false;

        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);
        return data <= hoje;
      }

      function normalizarDataResponsavelParaInput_(valor) {
        return formatarDataNascimentoDigitacao_(valor);
      }

      function setResponsibleField_(id, valor, formatter = null, opcoes = {}) {
        const el = document.getElementById(id);
        if (!el) return false;
        const forcar = opcoes.forcar === true;
        if (!forcar && responsavelCamposEditadosManual_.has(id)) return false;

        let texto = String(valor == null ? '' : valor).trim();
        if (formatter) texto = formatter(texto);

        // Uma resposta automática nunca apaga um valor digitado manualmente.
        if (!forcar && responsavelEdicaoManualAtiva_ && String(el.value || '').trim() && !texto) return false;

        el.value = texto;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      function marcarCampoResponsavelEditadoManual_(id) {
        if (!RESPONSAVEL_EDITABLE_FIELDS_.has(String(id || '')) || preenchendoResponsavelLookup) return;
        responsavelCamposEditadosManual_.add(String(id));
        responsavelEdicaoManualAtiva_ = true;
        const el = document.getElementById(id);
        el?.classList.add('responsible-manual-edited');
      }

      function limparProtecaoEdicaoResponsavel_(preservar = []) {
        const manter = new Set(Array.isArray(preservar) ? preservar : []);
        Array.from(responsavelCamposEditadosManual_).forEach(id => {
          if (manter.has(id)) return;
          responsavelCamposEditadosManual_.delete(id);
          document.getElementById(id)?.classList.remove('responsible-manual-edited');
        });
        responsavelEdicaoManualAtiva_ = responsavelCamposEditadosManual_.size > 0;
      }

      function protegerCamposResponsavelPreenchidos_() {
        RESPONSAVEL_EDITABLE_FIELDS_.forEach(id => {
          const el = document.getElementById(id);
          if (!el || !String(el.value || '').trim()) return;
          responsavelCamposEditadosManual_.add(id);
          el.classList.add('responsible-manual-edited');
        });
        responsavelEdicaoManualAtiva_ = responsavelCamposEditadosManual_.size > 0;
      }

      function liberarProtecaoCampoResponsavel_(id) {
        const campo = String(id || '');
        responsavelCamposEditadosManual_.delete(campo);
        document.getElementById(campo)?.classList.remove('responsible-manual-edited');
        responsavelEdicaoManualAtiva_ = responsavelCamposEditadosManual_.size > 0;
      }

      function invalidarConsultasResponsavel_() {
        clearTimeout(responsavelLookupTimer);
        clearTimeout(responsavelCpfLookupTimer);
        responsavelLookupSequencia += 1;
        responsavelCpfLookupSequencia += 1;
      }

      function limparTodosDadosResponsavel_() {
        invalidarConsultasResponsavel_();
        preenchendoResponsavelLookup = true;
        try {
          RESPONSAVEL_EDITABLE_FIELDS_.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = '';
            el.classList.remove('responsible-manual-edited');
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          telefoneResponsavelAssociado = '';
          cpfResponsavelAssociado = '';
          cpfCopiadoDoIdentificador = '';
          const mesmoEndereco = document.getElementById('mesmoEnderecoResponsavel');
          if (mesmoEndereco) mesmoEndereco.checked = false;
          if (eventoResponsavelEhOrganizadorCheck) eventoResponsavelEhOrganizadorCheck.checked = false;
          const enderecoResponsavel = document.getElementById('enderecoResponsavel');
          if (enderecoResponsavel) {
            enderecoResponsavel.readOnly = false;
            enderecoResponsavel.style.background = '';
          }
          if (cpfInput) {
            cpfInput.readOnly = false;
            cpfInput.classList.remove('cpf-synced-from-identifier');
          }
          responsavelCamposEditadosManual_.clear();
          responsavelEdicaoManualAtiva_ = false;
          esconderResponsavelLookupResultados_();
          esconderResponsavelCpfLookupResultados_();
          clearResponsavelLookupStatus_();
          clearResponsavelCpfLookupStatus_();
        } finally {
          preenchendoResponsavelLookup = false;
        }
        scheduleDraftSave();
      }

      function limparDadosResponsavelExcetoTelefone_() {
        const campos = [
          'responsavel', 'nomeResponsavel', 'rg', 'cpf', 'mae', 'nascimento',
          'profissao', 'estadoCivil', 'escolaridade', 'email', 'enderecoResponsavel'
        ];
        preenchendoResponsavelLookup = true;
        try {
          campos.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          if (cpfInput) {
            cpfCopiadoDoIdentificador = '';
            cpfInput.readOnly = false;
            cpfInput.classList.remove('cpf-synced-from-identifier');
          }
        } finally {
          preenchendoResponsavelLookup = false;
        }
      }

      function aplicarResponsavelEncontrado_(item, opcoes = {}) {
        if (!item) return;
        const aplicacaoId = ++responsavelLookupAplicacaoId_;
        const forcar = opcoes.forcar === true;
        preenchendoResponsavelLookup = true;
        try {
          setResponsibleField_('telefone', item.telefone, formatarTelefoneTela_, { forcar });
          setResponsibleField_('responsavel', item.responsavel, null, { forcar });
          setResponsibleField_('nomeResponsavel', item.nomeResponsavel, null, { forcar });
          setResponsibleField_('rg', item.rg, null, { forcar });
          setResponsibleField_('cpf', item.cpf, formatarCpfTela_, { forcar });
          setResponsibleField_('mae', item.mae, null, { forcar });
          setResponsibleField_('nascimento', item.nascimento, normalizarDataResponsavelParaInput_, { forcar });
          setResponsibleField_('profissao', item.profissao, null, { forcar });
          setResponsibleField_('estadoCivil', item.estadoCivil, null, { forcar });
          setResponsibleField_('escolaridade', item.escolaridade, null, { forcar });
          setResponsibleField_('email', item.email, null, { forcar });
          if (!document.getElementById('mesmoEnderecoResponsavel')?.checked) {
            setResponsibleField_('enderecoResponsavel', item.enderecoResponsavel, null, { forcar });
          } else {
            syncResponsibleAddress();
          }
          telefoneResponsavelAssociado = digits(item.telefone);
          cpfResponsavelAssociado = digits(item.cpf);
          if (ehEventoDeclaratorio_()) {
            esconderResponsavelCpfLookupResultados_();
            showResponsavelCpfLookupStatus_(`Dados recuperados da planilha para ${item.nomeResponsavel || 'o responsável selecionado'}. Confira antes de registrar.`, 'success');
          } else {
            esconderResponsavelLookupResultados_();
            showResponsavelLookupStatus_(`Dados recuperados da planilha para ${item.nomeResponsavel || 'o responsável selecionado'}. Confira antes de registrar.`, 'success');
          }
          scheduleDraftSave();
        } finally {
          preenchendoResponsavelLookup = false;
        }
      }

      function renderizarResponsaveisEncontrados_(itens) {
        if (!responsavelLookupResultados) return;
        responsaveisLookupAtual = Array.isArray(itens) ? itens : [];
        responsavelLookupResultados.innerHTML = '';

        responsaveisLookupAtual.forEach((item, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'responsavel-lookup-option';
          btn.dataset.responsavelIndex = String(index);

          const info = document.createElement('span');
          const nome = document.createElement('strong');
          nome.textContent = item.nomeResponsavel || 'Responsável sem nome';
          const detalhes = document.createElement('small');
          detalhes.textContent = [item.cpf ? `CPF ${formatarCpfTela_(item.cpf)}` : '', item.responsavel || ''].filter(Boolean).join(' • ') || 'Dados existentes na planilha';
          info.append(nome, detalhes);

          const acao = document.createElement('span');
          acao.className = 'lookup-select-label';
          acao.textContent = 'Selecionar';

          btn.append(info, acao);
          responsavelLookupResultados.appendChild(btn);
        });

        responsavelLookupResultados.classList.toggle('show', responsaveisLookupAtual.length > 0);
      }

      async function consultarResponsavelPorTelefone_() {
        if (ehEventoDeclaratorio_()) return;
        if (!telefoneInput || preenchendoResponsavelLookup) return;
        const telefone = digits(telefoneInput.value);
        if (![10, 11].includes(telefone.length)) {
          esconderResponsavelLookupResultados_();
          clearResponsavelLookupStatus_();
          return;
        }

        if (!navigator.onLine) {
          esconderResponsavelLookupResultados_();
          showResponsavelLookupStatus_('Sem internet. A busca de responsável/RT na planilha fica disponível quando a conexão voltar.', 'info');
          return;
        }

        const sequencia = ++responsavelLookupSequencia;
        esconderResponsavelLookupResultados_();
        showResponsavelLookupStatus_('Procurando este telefone nos responsáveis/RTs já registrados...', 'info');

        try {
          const result = await apiRequest('config', { consulta: 'responsavel_telefone', telefone }, 30000);
          if (sequencia !== responsavelLookupSequencia || digits(telefoneInput.value) !== telefone) return;

          const itens = Array.isArray(result?.itens) ? result.itens : [];
          if (!itens.length) {
            telefoneResponsavelAssociado = telefone;
            showResponsavelLookupStatus_('Telefone não encontrado na planilha. Continue preenchendo os dados do novo responsável/RT.', 'info');
            return;
          }

          if (itens.length === 1) {
            aplicarResponsavelEncontrado_(itens[0]);
            return;
          }

          renderizarResponsaveisEncontrados_(itens);
          showResponsavelLookupStatus_(`Foram encontrados ${itens.length} responsáveis/RTs com este telefone. Escolha a pessoa correta.`, 'info');
        } catch (error) {
          if (sequencia !== responsavelLookupSequencia || digits(telefoneInput.value) !== telefone) return;
          showResponsavelLookupStatus_(error?.message || 'Não foi possível consultar os responsáveis agora. Continue o preenchimento manualmente.', 'error');
        }
      }

      function agendarConsultaResponsavelPorTelefone_() {
        if (ehEventoDeclaratorio_()) return;
        if (preenchendoResponsavelLookup) return;
        clearTimeout(responsavelLookupTimer);
        responsavelLookupSequencia += 1;
        const telefone = digits(telefoneInput?.value || '');

        if (![10, 11].includes(telefone.length)) {
          esconderResponsavelLookupResultados_();
          clearResponsavelLookupStatus_();
          return;
        }

        if (telefoneResponsavelAssociado && telefoneResponsavelAssociado !== telefone) {
          telefoneResponsavelAssociado = '';
          cpfResponsavelAssociado = '';
          // O novo telefone pode representar outra pessoa, mas campos já alterados
          // manualmente continuam protegidos contra respostas atrasadas ou automáticas.
        }

        responsavelLookupTimer = setTimeout(consultarResponsavelPorTelefone_, 550);
      }


      function showResponsavelCpfLookupStatus_(message, type = 'info') {
        if (!responsavelCpfLookupStatus) return;
        responsavelCpfLookupStatus.hidden = false;
        responsavelCpfLookupStatus.className = 'lookup-status show ' + type;
        responsavelCpfLookupStatus.textContent = message;
      }

      function clearResponsavelCpfLookupStatus_() {
        if (!responsavelCpfLookupStatus) return;
        responsavelCpfLookupStatus.className = 'lookup-status';
        responsavelCpfLookupStatus.textContent = '';
        responsavelCpfLookupStatus.hidden = !ehEventoDeclaratorio_();
      }

      function esconderResponsavelCpfLookupResultados_() {
        responsaveisCpfLookupAtual = [];
        if (!responsavelCpfLookupResultados) return;
        responsavelCpfLookupResultados.innerHTML = '';
        responsavelCpfLookupResultados.classList.remove('show');
        responsavelCpfLookupResultados.hidden = true;
      }

      function limparDadosResponsavelExcetoCpf_() {
        const campos = [
          'responsavel', 'nomeResponsavel', 'rg', 'mae', 'nascimento', 'profissao',
          'estadoCivil', 'escolaridade', 'telefone', 'email', 'enderecoResponsavel'
        ];
        preenchendoResponsavelLookup = true;
        try {
          campos.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          telefoneResponsavelAssociado = '';
        } finally {
          preenchendoResponsavelLookup = false;
        }
      }

      function renderizarResponsaveisEncontradosCpf_(itens) {
        if (!responsavelCpfLookupResultados) return;
        responsaveisCpfLookupAtual = Array.isArray(itens) ? itens : [];
        responsavelCpfLookupResultados.innerHTML = '';
        responsaveisCpfLookupAtual.forEach((item, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'responsavel-lookup-option';
          btn.dataset.responsavelCpfIndex = String(index);
          const info = document.createElement('span');
          const nome = document.createElement('strong');
          nome.textContent = item.nomeResponsavel || 'Responsável sem nome';
          const detalhes = document.createElement('small');
          detalhes.textContent = [item.telefone ? formatarTelefoneTela_(item.telefone) : '', item.responsavel || ''].filter(Boolean).join(' • ') || 'Dados existentes na planilha';
          info.append(nome, detalhes);
          const acao = document.createElement('span');
          acao.className = 'lookup-select-label';
          acao.textContent = 'Selecionar';
          btn.append(info, acao);
          responsavelCpfLookupResultados.appendChild(btn);
        });
        responsavelCpfLookupResultados.hidden = responsaveisCpfLookupAtual.length === 0;
        responsavelCpfLookupResultados.classList.toggle('show', responsaveisCpfLookupAtual.length > 0);
      }

      async function consultarResponsavelPorCpf_() {
        if (!ehEventoDeclaratorio_() || !cpfInput || preenchendoResponsavelLookup) return;
        const cpf = digits(cpfInput.value);
        if (cpf.length !== 11) {
          esconderResponsavelCpfLookupResultados_();
          clearResponsavelCpfLookupStatus_();
          return;
        }
        if (!navigator.onLine) {
          esconderResponsavelCpfLookupResultados_();
          showResponsavelCpfLookupStatus_('Sem internet. A busca pelo CPF fica disponível quando a conexão voltar.', 'info');
          return;
        }
        const sequencia = ++responsavelCpfLookupSequencia;
        esconderResponsavelCpfLookupResultados_();
        showResponsavelCpfLookupStatus_('Procurando este CPF nos responsáveis já registrados...', 'info');
        try {
          const result = await apiRequest('config', { consulta: 'responsavel_cpf', cpf }, 30000);
          if (sequencia !== responsavelCpfLookupSequencia || digits(cpfInput.value) !== cpf || !ehEventoDeclaratorio_()) return;
          const itens = Array.isArray(result?.itens) ? result.itens : [];
          if (!itens.length) {
            cpfResponsavelAssociado = cpf;
            showResponsavelCpfLookupStatus_('CPF não encontrado na planilha. Continue preenchendo os dados da pessoa que acompanhou a vistoria.', 'info');
            return;
          }
          if (itens.length === 1) {
            aplicarResponsavelEncontrado_(itens[0]);
            return;
          }
          renderizarResponsaveisEncontradosCpf_(itens);
          showResponsavelCpfLookupStatus_(`Foram encontrados ${itens.length} registros para este CPF. Escolha o cadastro correto.`, 'info');
        } catch (error) {
          if (sequencia !== responsavelCpfLookupSequencia || digits(cpfInput.value) !== cpf) return;
          showResponsavelCpfLookupStatus_(error?.message || 'Não foi possível consultar este CPF agora. Continue o preenchimento manualmente.', 'error');
        }
      }

      function agendarConsultaResponsavelPorCpf_() {
        if (!ehEventoDeclaratorio_() || preenchendoResponsavelLookup) return;
        clearTimeout(responsavelCpfLookupTimer);
        responsavelCpfLookupSequencia += 1;
        const cpf = digits(cpfInput?.value || '');
        if (cpf.length !== 11) {
          esconderResponsavelCpfLookupResultados_();
          clearResponsavelCpfLookupStatus_();
          return;
        }
        if (cpfResponsavelAssociado && cpfResponsavelAssociado !== cpf) {
          cpfResponsavelAssociado = '';
          telefoneResponsavelAssociado = '';
          // Mantém a proteção dos demais campos já conferidos/alterados pelo militar.
        }
        responsavelCpfLookupTimer = setTimeout(consultarResponsavelPorCpf_, 500);
      }


      function normalizarProcessoAntigo_(valor) {
        const texto = String(valor == null ? '' : valor)
          .trim()
          .toUpperCase()
          .replace(/^PRJ/i, '')
          .replace(/\s+/g, '');
        const m = texto.match(/^(\d{1,8})\/(\d{4})$/);
        return m ? `${m[1]}/${m[2]}` : '';
      }

      function analisarNumeroPscip_(valor) {
        const bruto = String(valor == null ? '' : valor).trim().toUpperCase();
        const processoAntigo = normalizarProcessoAntigo_(bruto);

        if (processoAntigo) {
          return {
            bruto,
            tipo: 'antigo',
            processoAntigo,
            identificador: processoAntigo,
            numeros: processoAntigo.replace(/\D/g, ''),
            projeto: '',
            completo: true,
            atualValido: false,
            antigoValido: true,
            excedente: false
          };
        }

        const temBarra = bruto.includes('/');
        const semPrefixo = bruto.replace(/^PRJ/i, '');
        const numeros = semPrefixo.replace(/\D/g, '');
        const explicitamentePrj = /^PRJ/i.test(bruto);
        const candidatoAtual = !temBarra && (explicitamentePrj || /^\d{10,}$/.test(bruto.replace(/\s+/g, '')));
        const projeto = candidatoAtual && numeros.length
          ? `PRJ${numeros.slice(0, 10)}`
          : '';

        return {
          bruto,
          tipo: candidatoAtual ? 'atual' : 'incompleto',
          processoAntigo: '',
          identificador: numeros.length === 10 && !temBarra ? `PRJ${numeros}` : projeto,
          numeros,
          projeto,
          completo: candidatoAtual && numeros.length === 10,
          atualValido: candidatoAtual && numeros.length === 10,
          antigoValido: false,
          excedente: candidatoAtual && numeros.length > 10
        };
      }

      function normalizarPscipExibicao_(valor, garantirPrefixo = false) {
        const analise = analisarNumeroPscip_(valor);
        if (analise.antigoValido) return analise.processoAntigo;
        if (analise.atualValido || analise.projeto) return analise.projeto;
        const texto = String(valor == null ? '' : valor).trim().toUpperCase();
        if (!texto) return garantirPrefixo ? 'PRJ' : '';
        return texto.replace(/^prj/i, 'PRJ');
      }

      function normalizarPscipInput_(garantirPrefixo = false) {
        if (!pscipInput) return '';
        const antes = String(pscipInput.value || '');
        const analise = analisarNumeroPscip_(antes);
        let depois = '';

        if (analise.antigoValido) depois = analise.processoAntigo;
        else if (analise.atualValido || analise.projeto) depois = analise.projeto;
        else depois = formatarDigitacaoPscip_(antes) || (garantirPrefixo ? 'PRJ' : '');

        if (depois !== antes) pscipInput.value = depois;
        return depois;
      }

      function normalizarPscipTela_(valor) {
        return String(valor == null ? '' : valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
      }

      function projetoPscipOperacional_(valor) {
        const analise = analisarNumeroPscip_(valor);
        if (analise.antigoValido) return analise.processoAntigo;
        if (analise.atualValido || analise.projeto) return analise.projeto;
        return '';
      }

      function pscipAtualValido_(valor) {
        return analisarNumeroPscip_(valor).atualValido;
      }

      function pscipProjetoValido_(valor) {
        const analise = analisarNumeroPscip_(valor);
        return analise.atualValido || analise.antigoValido;
      }

      function rotuloProjetoPscip_(valor) {
        return analisarNumeroPscip_(valor).antigoValido
          ? 'Processo antigo'
          : 'PSCIP';
      }

      function formatarDigitacaoPscip_(valor) {
        const bruto = String(valor == null ? '' : valor).trim().toUpperCase();

        // Permite digitar diretamente 44/2016 mesmo quando o campo começou com PRJ.
        if (bruto.includes('/')) {
          const semPrj = bruto.replace(/^PRJ/i, '');
          const limpo = semPrj.replace(/[^\d/]/g, '');
          const partes = limpo.split('/');
          const numero = String(partes[0] || '').replace(/\D/g, '').slice(0, 8);
          const ano = String(partes.slice(1).join('') || '').replace(/\D/g, '').slice(0, 4);
          return `${numero}/${ano}`;
        }

        if (/^PRJ/i.test(bruto)) {
          const numeros = bruto.replace(/^PRJ/i, '').replace(/\D/g, '').slice(0, 10);
          return `PRJ${numeros}`;
        }

        // Sem prefixo, mantém os dígitos durante a digitação.
        // Ao sair do campo, 10 dígitos são normalizados para PRJ.
        return bruto.replace(/\D/g, '').slice(0, 10);
      }

      function normalizarIdentificadorProjetoAoSair_(valor) {
        const analise = analisarNumeroPscip_(valor);
        if (analise.antigoValido) return analise.processoAntigo;
        if (analise.atualValido || analise.projeto) return analise.projeto;

        const digitos = String(valor == null ? '' : valor).replace(/\D/g, '');
        if (!String(valor || '').includes('/') && digitos.length === 10) {
          return `PRJ${digitos}`;
        }

        return formatarDigitacaoPscip_(valor);
      }

      function formatarDeclaracaoEvento_(valor) {
        return String(valor == null ? '' : valor).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
      }

      function declaracaoEventoValida_(valor) {
        return /^\d{4}[A-Z]+\d+$/.test(formatarDeclaracaoEvento_(valor));
      }

      function ehRenovacaoAvcbValor_(valor) {
        return normalize(valor).includes(normalize('Renovação AVCB'));
      }

      function ehDemandaRenovacaoAvcb_() {
        return ehFluxoFiscalizacao_() && !ehEventoDeclaratorio_() && ehRenovacaoAvcbValor_(value('demandaPrincipal'));
      }

      function ehRenovacaoAvcbPreparacao_() {
        return String(document.getElementById('prepareTipo')?.value || '') === 'fiscalizacao' &&
          ehRenovacaoAvcbValor_(document.getElementById('prepareDemanda')?.value || '');
      }

      function formatarDataRenovacaoAvcbDigitacao_(valor) {
        const texto = String(valor || '').trim();
        const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

        const d = texto.replace(/\D/g, '').slice(0, 8);
        if (d.length <= 2) return d;
        if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
        return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
      }

      function dataRenovacaoAvcbValida_(valor) {
        const texto = String(valor || '').trim();
        const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return false;
        const dia = Number(m[1]);
        const mes = Number(m[2]);
        const ano = Number(m[3]);
        if (ano < 1900 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
        const data = new Date(ano, mes - 1, dia);
        if (
          data.getFullYear() !== ano ||
          data.getMonth() !== mes - 1 ||
          data.getDate() !== dia
        ) return false;
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);
        return data <= hoje;
      }

      function instalarMascaraDataRenovacaoAvcb_(input, aoAlterar = null) {
        if (!input || input.dataset.renewalDateGuard === '1') return;
        input.dataset.renewalDateGuard = '1';
        input.addEventListener('input', event => {
          event.target.value = formatarDataRenovacaoAvcbDigitacao_(event.target.value);
          event.target.setCustomValidity('');
          event.target.classList.remove('invalid');
          if (typeof aoAlterar === 'function') aoAlterar();
        });
        input.addEventListener('blur', event => {
          const valor = String(event.target.value || '').trim();
          if (!valor) {
            event.target.setCustomValidity('');
            event.target.classList.remove('invalid');
            return;
          }
          const valido = dataRenovacaoAvcbValida_(valor);
          event.target.setCustomValidity(valido ? '' : 'Informe uma data válida no formato DD/MM/AAAA.');
          event.target.classList.toggle('invalid', !valido);
        });
      }

      function atualizarCampoRenovacaoAvcb_() {
        const wrap = document.getElementById('dataRenovacaoAvcbWrap');
        const input = document.getElementById('dataRenovacaoAvcb');
        const ativo = ehDemandaRenovacaoAvcb_();
        if (wrap) wrap.hidden = !ativo;
        if (input) {
          input.required = ativo;
          if (!ativo) {
            input.setCustomValidity('');
            input.classList.remove('invalid');
          }
        }
        return ativo;
      }

      function atualizarCampoRenovacaoAvcbPreparacao_() {
        const wrap = document.getElementById('prepareDataRenovacaoAvcbWrap');
        const input = document.getElementById('prepareDataRenovacaoAvcb');
        const ativo = ehRenovacaoAvcbPreparacao_();
        if (wrap) wrap.hidden = !ativo;
        if (input) {
          input.required = ativo;
          if (!ativo) {
            input.setCustomValidity('');
            input.classList.remove('invalid');
          }
        }
        return ativo;
      }

      function identificadoresProjetoFicha_(registro) {
        const candidatos = [];
        const direto = valorCampoFicha_(
          registro,
          'Nº do PSCIP / Projeto',
          'Nº PSCIP',
          'Nº do Projeto'
        );
        if (direto) candidatos.push(direto);

        (Array.isArray(registro?.historico) ? registro.historico : []).forEach(item => {
          if (item?.projeto) candidatos.push(item.projeto);
        });

        let atual = '';
        let antigo = '';

        candidatos.forEach(valor => {
          const normalizado = projetoPscipOperacional_(valor);
          const analise = analisarNumeroPscip_(normalizado || valor);
          if (analise.atualValido) atual = analise.projeto;
          if (analise.antigoValido && !antigo) antigo = analise.processoAntigo;
        });

        return { atual, antigo };
      }

      function valorPscipOperacionalFicha_(registro) {
        const ids = identificadoresProjetoFicha_(registro);
        return ids.atual || ids.antigo || '';
      }

      function ehEventoDeclaratorioPreparacao_() {
        return String(document.getElementById('prepareTipo')?.value || '') === 'fiscalizacao' &&
          normalize(document.getElementById('prepareDemanda')?.value || '') === normalize('Eventos declaratórios');
      }

      async function tratarPscipExcedente_(input, valorOriginal) {
        if (!input) return false;
        const analise = analisarNumeroPscip_(valorOriginal);
        if (!analise.excedente) return false;
        const usar = await confirmarGpv_(
          `O número informado possui mais dígitos que o padrão do PSCIP e pode corresponder ao Nº do AVCB.\n\nNº do Projeto identificado: ${analise.projeto}`,
          'Número maior que o padrão do PSCIP',
          { rotuloConfirmar: 'Usar nº do Projeto', rotuloCancelar: 'Corrigir' }
        );
        input.value = usar ? analise.projeto : 'PRJ';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (!usar) setTimeout(() => { input.focus(); try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {} }, 40);
        return true;
      }

      function instalarProtecaoPscip_(input, aoAlterar = null) {
        if (!input || input.dataset.pscipGuard === '1') return;
        input.dataset.pscipGuard = '1';
        input.maxLength = 13;
        input.addEventListener('input', event => {
          const formatado = formatarDigitacaoPscip_(event.target.value);
          if (event.target.value !== formatado) event.target.value = formatado;
          if (typeof aoAlterar === 'function') aoAlterar();
        });
        input.addEventListener('paste', event => {
          const texto = String(event.clipboardData?.getData('text') || '');
          const analise = analisarNumeroPscip_(texto);
          if (analise.antigoValido || !analise.excedente) return;
          event.preventDefault();
          tratarPscipExcedente_(input, texto).catch(() => {});
        });
        input.addEventListener('blur', () => {
          const normalizado = normalizarIdentificadorProjetoAoSair_(input.value);
          if (input.value !== normalizado) input.value = normalizado;
          if (typeof aoAlterar === 'function') aoAlterar();
        });
      }

      function showPscipLookupStatus_(texto, tipo = 'info') {
        if (!pscipLookupStatus) return;
        pscipLookupStatus.textContent = String(texto || '');
        pscipLookupStatus.className = `lookup-status ${texto ? 'show ' + tipo : ''}`.trim();
      }

      function clearPscipLookupStatus_() {
        if (!pscipLookupStatus) return;
        pscipLookupStatus.textContent = '';
        pscipLookupStatus.className = 'lookup-status';
      }

      function esconderHistoricoPscip_() {
        historicoPscipAtual = [];
        if (pscipHistoryResults) pscipHistoryResults.innerHTML = '';
        if (pscipHistoryPanel) pscipHistoryPanel.hidden = true;
      }

      function renderizarHistoricoPscip_(itens) {
        historicoPscipAtual = Array.isArray(itens) ? itens : [];
        if (!pscipHistoryPanel || !pscipHistoryResults) return;
        if (!historicoPscipAtual.length) {
          esconderHistoricoPscip_();
          return;
        }
        pscipHistoryResults.innerHTML = historicoPscipAtual.map((item, index) => {
          const identificador = item.cnpj
            ? formatarCnpjTela_(item.cnpj)
            : (item.cpfEstabelecimento ? formatarCpfTela_(item.cpfEstabelecimento) : '');
          const refs = [
            item.carimbo ? formatarDataPainel_(item.carimbo) : '',
            item.sancao ? `Situação: ${item.sancao}` : '',
            item.pf ? `PF: ${item.pf}` : '',
            identificador
          ].filter(Boolean).join(' • ');
          const endereco = [item.endereco, item.numero, item.bairro, item.cidade].filter(Boolean).join(', ');
          return `<div class="establishment-history-item">
            <div class="establishment-history-copy">
              <strong>${escapeHtml(item.nomeFantasia || item.razaoSocial || 'Registro do PSCIP')}</strong>
              <span>${escapeHtml(refs || 'Registro localizado')}</span>
              <span>${escapeHtml(endereco || '')}</span>
            </div>
            <button class="establishment-history-use" type="button" data-history-pscip-index="${index}">Usar dados</button>
          </div>`;
        }).join('');
        pscipHistoryPanel.hidden = false;
      }

      function preencherSeVazio_(id, valor) {
        const el = document.getElementById(id);
        if (!el || !String(valor || '').trim() || String(el.value || '').trim()) return;
        el.value = String(valor || '').trim();
      }

      function aplicarHistoricoPscip_(item) {
        if (!item) return;
        preencherSeVazio_('nomeFantasia', item.nomeFantasia);
        preencherSeVazio_('razaoSocial', item.razaoSocial);
        preencherSeVazio_('endereco', item.endereco);
        preencherSeVazio_('numero', item.numero);
        preencherSeVazio_('complemento', item.complemento);
        preencherSeVazio_('bairro', item.bairro);
        preencherSeVazio_('pf', item.pf);
        preencherSeVazio_('responsavel', item.responsavel);
        preencherSeVazio_('nomeResponsavel', item.nomeResponsavel);
        preencherSeVazio_('telefone', item.telefone);
        preencherSeVazio_('email', item.email);

        if (!value('cnpj')) {
          const identificador = item.cnpj || item.cpfEstabelecimento || '';
          if (identificador) {
            identificadorInput.value = identificador;
            const tipo = tipoIdentificador_(identificador);
            atualizarInterfaceIdentificador_(tipo);
            if (tipo === 'cpf') sincronizarIdentificadorComCpf_(identificador);
          }
        }

        showPscipLookupStatus_('Dados históricos aplicados somente nos campos que estavam vazios. Confira antes de continuar.', 'success');
        scheduleDraftSave();
        agendarConsultaEncerramentoFiscal_();
      }

      async function consultarHistoricoPscip_() {
        const pscip = value('pscip');
        const chave = normalizarPscipTela_(pscip);
        if (value('possuiPscip') !== 'sim' || chave.length < 4 || !navigator.onLine) {
          esconderHistoricoPscip_();
          if (!navigator.onLine && chave.length >= 4) showPscipLookupStatus_('Sem internet: a consulta histórica do PSCIP ficará disponível quando a conexão voltar.', 'info');
          else clearPscipLookupStatus_();
          return;
        }
        const sequencia = ++pscipLookupSequencia;
        showPscipLookupStatus_('Consultando Nº do PSCIP na planilha...', 'info');
        try {
          const resposta = await apiRequest('config', { consulta: 'pscip', pscip }, 7000);
          if (sequencia !== pscipLookupSequencia || normalizarPscipTela_(value('pscip')) !== chave) return;
          const resultados = Array.isArray(resposta?.resultados) ? resposta.resultados : [];
          renderizarHistoricoPscip_(resultados);
          if (!resultados.length) showPscipLookupStatus_('Nenhum registro anterior com este Nº do PSCIP foi localizado.', 'info');
          else showPscipLookupStatus_(`${resultados.length} registro${resultados.length === 1 ? '' : 's'} localizado${resultados.length === 1 ? '' : 's'} com este PSCIP.`, 'success');
        } catch (erro) {
          if (sequencia !== pscipLookupSequencia) return;
          esconderHistoricoPscip_();
          showPscipLookupStatus_(erro?.message || 'Não foi possível consultar o PSCIP agora.', 'error');
        }
      }

      function agendarConsultaPscip_() {
        clearTimeout(pscipLookupTimer);
        pscipLookupSequencia += 1;
        const chave = normalizarPscipTela_(value('pscip'));
        if (value('possuiPscip') !== 'sim' || chave.length < 4) {
          esconderHistoricoPscip_();
          clearPscipLookupStatus_();
          return;
        }
        pscipLookupTimer = setTimeout(consultarHistoricoPscip_, 600);
        agendarConsultaEncerramentoFiscal_();
      }


      function filtrosProcessoPf_(origem = 'form') {
        const g = id => String(document.getElementById(id)?.value || '').trim();
        if (origem === 'prepare') {
          const evento = ehEventoDeclaratorioPreparacao_();
          return {
            identificador: evento ? '' : digits(g('prepareCnpj')),
            pscip: evento ? '' : projetoPscipOperacional_(g('preparePscip')),
            cidade: g('prepareCidade'),
            endereco: g('prepareEndereco'),
            numero: g('prepareNumero'),
            eventoDeclaratorio: evento
          };
        }
        if (ehEventoDeclaratorio_()) {
          return {
            identificador: '',
            pscip: '',
            cidade: cityValue(),
            endereco: value('endereco'),
            numero: value('numero'),
            eventoDeclaratorio: true
          };
        }
        return {
          identificador: digits(value('cnpj')),
          pscip: value('pscip'),
          pf: value('pf'),
          cidade: cityValue(),
          endereco: value('endereco'),
          numero: value('numero'),
          eventoDeclaratorio: false,
          vistoriaAcessoria: ehVistoriaAcessoria_()
        };
      }

      function chaveFiltrosProcessoPf_(f) {
        const modo = f.eventoDeclaratorio ? 'evento' : (f.vistoriaAcessoria ? 'acessoria' : 'processo');
        return [modo, digits(f.identificador || ''), normalizarPscipTela_(f.pscip || ''), normalize(f.pf || ''), normalize(f.cidade || ''), normalize(f.endereco || ''), normalize(f.numero || '')].join('|');
      }

      function filtrosSuficientesProcessoPf_(f) {
        const d = digits(f.identificador || '');
        const docOk = d.length === 11 || d.length === 14;
        const pscipOk = normalizarPscipTela_(f.pscip || '').length > 3;
        const pfOk = String(f.pf || '').trim().length >= 5;
        const enderecoOk = !!(String(f.cidade || '').trim() && String(f.endereco || '').trim() && String(f.numero || '').trim());
        return docOk || pscipOk || pfOk || enderecoOk;
      }

      function textoPrazoProcessoAnterior_(item) {
        const alerta = String(item?.alertaPrazo || '').trim();
        if (alerta) return alerta;
        const acao = String(item?.acaoSugerida || '').trim();
        if (acao) return acao;
        const situacao = String(item?.sancao || '').trim();
        if (situacao) return `Situação registrada: ${situacao}`;
        return 'Conferir andamento no INFOSCIP Fiscalização.';
      }

      function renderizarAlertaProcessoAnterior_(candidatos) {
        if (!priorProcessAlert) return;
        const lista = Array.isArray(candidatos) ? candidatos : [];
        if (!lista.length) {
          priorProcessAlert.hidden = true;
          priorProcessAlert.innerHTML = '';
          return;
        }
        const principal = lista[0];
        const historicoEvento = Boolean(principal.eventoDeclaratorio);
        const situacaoMulta = String(principal.situacaoMultaInfoscip || 'Não conferido').trim() || 'Não conferido';
        const prazo = textoPrazoProcessoAnterior_(principal);
        const endereco = [principal.endereco, principal.numero, principal.bairro, principal.cidade].filter(Boolean).join(', ');
        const titulo = principal.estabelecimento || (historicoEvento ? 'Evento anteriormente fiscalizado' : 'Processo fiscalizatório localizado');
        const criterio = principal.criterio || 'Histórico compatível';
        const alertaForte = !historicoEvento && (Boolean(principal.aberto) || normalize(prazo).includes('multa') || normalize(prazo).includes('prazo'));
        priorProcessAlert.classList.toggle('is-critical', alertaForte);
        if (historicoEvento) {
          priorProcessAlert.innerHTML = `
            <div class="prior-process-alert-head">
              <div><span>📍 Histórico de evento neste endereço</span><strong>${escapeHtml(titulo)}</strong></div>
              <span class="prior-process-match">Mesmo endereço</span>
            </div>
            <div class="prior-process-alert-grid">
              <div><span>Declaração</span><strong>${escapeHtml(principal.declaracao || '—')}</strong></div>
              <div><span>Situação</span><strong>${escapeHtml(principal.sancao || '—')}</strong></div>
              <div><span>Última fiscalização</span><strong>${escapeHtml(principal.carimbo || '—')}</strong></div>
              <div><span>Tipo</span><strong>${escapeHtml(principal.classificacaoEvento || 'Evento declaratório')}</strong></div>
            </div>
            ${endereco ? `<div class="prior-process-address">${escapeHtml(endereco)}</div>` : ''}
            <div class="prior-process-alert-actions">
              <span>${lista.length > 1 ? `${lista.length} eventos declaratórios anteriores encontrados neste endereço.` : 'Há evento declaratório anterior registrado neste endereço.'}</span>
              ${principal.chave ? `<button type="button" class="btn btn-secondary prior-process-open-btn" data-open-prior-record="${escapeAttr(principal.chave)}" data-record-line="${Number(principal.linha || 0)}">Abrir Ficha</button>` : ''}
            </div>`;
          priorProcessAlert.hidden = false;
          return;
        }
        priorProcessAlert.innerHTML = `
          <div class="prior-process-alert-head">
            <div><span>⚠ Processo fiscalizatório existente</span><strong>${escapeHtml(titulo)}</strong></div>
            <span class="prior-process-match">${escapeHtml(criterio)}</span>
          </div>
          <div class="prior-process-alert-grid">
            <div><span>Situação atual</span><strong>${escapeHtml(principal.sancao || '—')}</strong></div>
            <div><span>Nº do PF</span><strong>${escapeHtml(principal.pf || '—')}</strong></div>
            <div><span>Última vistoria</span><strong>${escapeHtml(principal.carimbo || '—')}</strong></div>
            <div><span>Multa no INFOSCIP</span><strong>${escapeHtml(situacaoMulta)}</strong></div>
          </div>
          <div class="prior-process-next-action"><span>Prazo / acompanhamento</span><strong>${escapeHtml(prazo)}</strong></div>
          ${endereco ? `<div class="prior-process-address">${escapeHtml(endereco)}</div>` : ''}
          <div class="prior-process-alert-actions">
            ${lista.length > 1 ? `<span>${lista.length} processos compatíveis encontrados. Confira o PF correto.</span>` : '<span>Confira o processo antes de concluir a nova vistoria.</span>'}
            ${principal.chave ? `<button type="button" class="btn btn-secondary prior-process-open-btn" data-open-prior-record="${escapeAttr(principal.chave)}" data-record-line="${Number(principal.linha || 0)}">Abrir Ficha</button>` : ''}
          </div>`;
        priorProcessAlert.hidden = false;
      }

      function limparResultadoProcessoPf_(origem = 'form') {
        const prepare = origem === 'prepare';
        const status = prepare ? preparePfLookupStatus : processPfLookupStatus;
        const resultados = prepare ? preparePfLookupResults : processPfLookupResults;
        if (status) { status.textContent = ''; status.className = 'lookup-status'; }
        if (resultados) { resultados.innerHTML = ''; resultados.hidden = true; }
        if (prepare) preparePfCandidatos = [];
        else {
          processoPfCandidatos = [];
          renderizarAlertaProcessoAnterior_([]);
        }
      }

      function aplicarPfLocalizado_(origem, candidato, automatico = false) {
        if (!candidato) return;
        const prepare = origem === 'prepare';
        const inputPf = prepare ? preparePfInput : processPfInput;
        const pscipHistorico = candidato.pscip ? projetoPscipOperacional_(candidato.pscip) : '';
        let pscipAplicado = false;

        if (pscipHistorico && pscipProjetoValido_(pscipHistorico)) {
          if (prepare && !ehEventoDeclaratorioPreparacao_()) {
            const inputPscip = document.getElementById('preparePscip');
            if (inputPscip && !pscipProjetoValido_(inputPscip.value)) {
              inputPscip.value = pscipHistorico;
              inputPscip.dispatchEvent(new Event('input', { bubbles: true }));
              pscipAplicado = true;
            }
          } else if (!prepare && !ehEventoDeclaratorio_()) {
            if (pscipInput && !pscipProjetoValido_(pscipInput.value)) {
              if (possuiPscipSelect) possuiPscipSelect.value = 'sim';
              syncPscip_();
              pscipInput.value = pscipHistorico;
              pscipInput.dispatchEvent(new Event('input', { bubbles: true }));
              pscipAplicado = true;
            }
          }
        }

        if (inputPf && candidato.pf) {
          const autoAtual = prepare ? preparePfAutoAtual : processoPfAutoAtual;
          const atual = String(inputPf.value || '').trim();
          const pfCandidato = String(candidato.pf || '').trim();
          const atualEhMesmoPf = Boolean(atual && normalize(atual) === normalize(pfCandidato));

          // V23.9.99bm — na Vistoria Acessória, um PF já preenchido não pode
          // impedir o vínculo quando a consulta encontrou exatamente o mesmo PF.
          // Continua protegendo contra sobrescrever automaticamente um PF diferente.
          if (!(automatico && atual && atual !== autoAtual && !atualEhMesmoPf)) {
            inputPf.value = pfCandidato;
            if (prepare) preparePfAutoAtual = inputPf.value;
            else {
              processoPfAutoAtual = inputPf.value;
              if (ehVistoriaAcessoria_()) processoAcessoriaVinculado = { ...candidato };
              const demais = processoPfCandidatos.filter(item => String(item?.pf || '') !== String(candidato.pf || ''));
              renderizarAlertaProcessoAnterior_([candidato, ...demais]);
              atualizarOpcoesSancaoPorFluxo_();
              sincronizarVistoriaAcessoria_();
            }
            inputPf.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        const status = prepare ? preparePfLookupStatus : processPfLookupStatus;
        if (status) {
          const referencias = [
            candidato.pf ? `PF ${candidato.pf}` : '',
            pscipHistorico && pscipProjetoValido_(pscipHistorico) ? `${rotuloProjetoPscip_(pscipHistorico)} ${pscipHistorico}` : ''
          ].filter(Boolean).join(' • ');
          const ref = [candidato.criterio, candidato.estabelecimento, candidato.sancao].filter(Boolean).join(' • ');
          status.textContent = `${referencias || 'Processo'} localizado no histórico desde 02/07/2025${ref ? ` — ${ref}` : ''}${pscipAplicado ? ' — PSCIP preenchido automaticamente' : ''}.`;
          status.className = 'lookup-status show success';
        }
        const resultados = prepare ? preparePfLookupResults : processPfLookupResults;
        if (resultados) { resultados.innerHTML = ''; resultados.hidden = true; }
        if (!prepare) scheduleDraftSave();
      }

      function renderizarCandidatosProcessoPf_(origem, candidatos) {
        const prepare = origem === 'prepare';
        const status = prepare ? preparePfLookupStatus : processPfLookupStatus;
        const resultados = prepare ? preparePfLookupResults : processPfLookupResults;
        if (prepare) preparePfCandidatos = candidatos;
        else {
          processoPfCandidatos = candidatos;
          renderizarAlertaProcessoAnterior_(candidatos);
        }
        if (!resultados) return;
        if ((!prepare && ehEventoDeclaratorio_()) || (prepare && ehEventoDeclaratorioPreparacao_())) {
          resultados.innerHTML = '';
          resultados.hidden = true;
          if (status) {
            status.textContent = candidatos.length
              ? `${candidatos.length} evento(s) declaratório(s) anterior(es) localizado(s) neste endereço.`
              : 'Nenhum evento declaratório anterior localizado neste endereço.';
            status.className = `lookup-status show ${candidatos.length ? 'success' : 'info'}`;
          }
          return;
        }
        if (!candidatos.length) {
          if (!prepare && ehVistoriaAcessoria_()) { processoAcessoriaVinculado = null; sincronizarVistoriaAcessoria_(); }
          resultados.innerHTML = '';
          resultados.hidden = true;
          const input = prepare ? preparePfInput : processPfInput;
          const autoAtual = prepare ? preparePfAutoAtual : processoPfAutoAtual;
          if (input && autoAtual && String(input.value || '').trim() === autoAtual) input.value = '';
          if (prepare) preparePfAutoAtual = ''; else processoPfAutoAtual = '';
          if (status) { status.textContent = (!prepare && ehVistoriaAcessoria_())
            ? 'Nenhum processo fiscalizatório anterior autuado e ainda aberto foi localizado pelos dados informados.'
            : 'Nenhum processo fiscalizatório anterior localizado pelos dados informados.'; status.className = 'lookup-status show info'; }
          return;
        }
        if (!prepare && ehVistoriaAcessoria_()) {
          const pfDigitado = String(processPfInput?.value || '').trim();
          const candidatoExato = pfDigitado
            ? candidatos.find(item => normalize(item?.pf || '') === normalize(pfDigitado))
            : null;

          if (candidatoExato) {
            aplicarPfLocalizado_(origem, candidatoExato, true);
            return;
          }
        }

        if (candidatos.length === 1) {
          aplicarPfLocalizado_(origem, candidatos[0], true);
          return;
        }
        const inputAtual = prepare ? preparePfInput : processPfInput;
        const autoAtual = prepare ? preparePfAutoAtual : processoPfAutoAtual;
        if (inputAtual && autoAtual && String(inputAtual.value || '').trim() === autoAtual && !candidatos.some(item => String(item.pf || '').trim() === autoAtual)) inputAtual.value = '';
        if (prepare) preparePfAutoAtual = ''; else processoPfAutoAtual = '';
        if (status) {
          status.textContent = `${candidatos.length} processos compatíveis encontrados. Selecione o processo correto; PF e PSCIP serão aproveitados quando disponíveis.`;
          status.className = 'lookup-status show info';
        }
        resultados.innerHTML = candidatos.map((item,index) => {
          const endereco = [item.endereco,item.numero,item.cidade].filter(Boolean).join(', ');
          const pscip = item.pscip ? projetoPscipOperacional_(item.pscip) : '';
          const referencia = [item.pf ? `PF ${item.pf}` : '', pscip && pscipProjetoValido_(pscip) ? `${rotuloProjetoPscip_(pscip)} ${pscip}` : ''].filter(Boolean).join(' • ');
          const detalhe = [item.criterio,item.sancao,item.carimbo,endereco].filter(Boolean).join(' • ');
          return `<div class="establishment-history-item"><div class="establishment-history-copy"><strong>${escapeHtml(referencia || 'Processo localizado')}</strong><span>${escapeHtml(item.estabelecimento || 'Processo localizado')}</span><span>${escapeHtml(detalhe)}</span></div><button class="establishment-history-use" type="button" data-pf-origin="${prepare ? 'prepare' : 'form'}" data-pf-index="${index}">Usar processo</button></div>`;
        }).join('');
        resultados.hidden = false;
      }

      async function consultarProcessoPf_(origem = 'form') {
        if (!navigator.onLine) return;
        const filtros = filtrosProcessoPf_(origem);
        if (!filtrosSuficientesProcessoPf_(filtros)) { limparResultadoProcessoPf_(origem); return; }
        const prepare = origem === 'prepare';
        const seq = prepare ? ++preparePfLookupSequencia : ++processoPfLookupSequencia;
        const chave = chaveFiltrosProcessoPf_(filtros);
        const status = prepare ? preparePfLookupStatus : processPfLookupStatus;
        if (status) {
          status.textContent = ((!prepare && ehEventoDeclaratorio_()) || (prepare && ehEventoDeclaratorioPreparacao_()))
            ? 'Verificando histórico de eventos declaratórios pelo endereço do evento...'
            : (!prepare && ehVistoriaAcessoria_())
              ? 'Localizando processo fiscalizatório anterior de local já autuado...'
              : 'Verificando processo anterior por CNPJ/CPF, PSCIP e endereço...';
          status.className = 'lookup-status show info';
        }
        try {
          const resposta = await apiRequest('config', { consulta:'processo_pf', filtros }, 10000);
          if ((prepare ? preparePfLookupSequencia : processoPfLookupSequencia) !== seq) return;
          if (chaveFiltrosProcessoPf_(filtrosProcessoPf_(origem)) !== chave) return;
          const candidatos = Array.isArray(resposta?.candidatos) ? resposta.candidatos : [];
          renderizarCandidatosProcessoPf_(origem, candidatos);
        } catch (erro) {
          if ((prepare ? preparePfLookupSequencia : processoPfLookupSequencia) !== seq) return;
          if (status) { status.textContent = erro?.message || 'Não foi possível pesquisar o Nº do PF agora.'; status.className = 'lookup-status show error'; }
        }
      }

      function agendarConsultaProcessoPf_(origem = 'form', atraso = 650) {
        const prepare = origem === 'prepare';
        if (prepare) {
          clearTimeout(preparePfLookupTimer);
          preparePfLookupSequencia += 1;
          preparePfLookupTimer = setTimeout(() => consultarProcessoPf_('prepare'), atraso);
        } else {
          clearTimeout(processoPfLookupTimer);
          processoPfLookupSequencia += 1;
          processoPfLookupTimer = setTimeout(() => consultarProcessoPf_('form'), atraso);
        }
      }

      function situacaoAtualPodeEncerrarFiscalizacao_() {
        if (ehEventoDeclaratorio_()) return false;
        const final = situacaoFinalPorMulta_(value('sancao'), value('situacaoMultaInfoscip'));
        const n = normalize(final);
        return n === normalize('Regularizado') || n === normalize('Liberado');
      }

      function esconderAvisoEncerramentoFiscal_() {
        encerramentoFiscalAtual = null;
        if (processClosureNotice) {
          processClosureNotice.hidden = true;
          processClosureNotice.innerHTML = '';
        }
      }

      function renderizarAvisoEncerramentoFiscal_(resposta) {
        const candidatos = Array.isArray(resposta?.candidatos) ? resposta.candidatos : [];
        encerramentoFiscalAtual = candidatos.length ? resposta : null;
        if (!processClosureNotice) return;
        if (!candidatos.length) {
          esconderAvisoEncerramentoFiscal_();
          return;
        }
        const principal = candidatos[0];
        const ref = principal.pf ? `PF nº ${principal.pf}` : (principal.pscip ? `PSCIP ${principal.pscip}` : `registro de ${principal.carimbo || 'data anterior'}`);
        const outros = candidatos.length > 1 ? ` Há ${candidatos.length} processos em aberto compatíveis; confira antes de encerrar.` : '';
        processClosureNotice.innerHTML = `<strong>Possível processo fiscalizatório anterior em aberto</strong>
          <span>${escapeHtml(ref)} • ${escapeHtml(principal.sancao || 'situação anterior')} • ${escapeHtml(principal.carimbo || '')}</span>
          <p>A vistoria atual está marcada como ${escapeHtml(value('sancao') || 'regular')}. Verifique se o processo anterior deve ser encerrado.${escapeHtml(outros)}</p>`;
        processClosureNotice.hidden = false;
      }

      async function consultarEncerramentoFiscal_(payload = null) {
        const dados = payload || buildPayload();
        if (normalize(dados?.demandaPrincipal || '').includes(normalize('Eventos declaratórios'))) {
          esconderAvisoEncerramentoFiscal_();
          return null;
        }
        const n = normalize(String(dados?.sancao || value('sancao')));
        const pode = n === normalize('Regularizado') || n === normalize('Liberado');
        if (!navigator.onLine || !pode) {
          esconderAvisoEncerramentoFiscal_();
          return null;
        }
        const sequencia = ++encerramentoFiscalSequencia;
        try {
          const resposta = await apiRequest('config', { consulta: 'encerramento_fiscal', payload: dados }, 7000);
          if (sequencia !== encerramentoFiscalSequencia) return null;
          renderizarAvisoEncerramentoFiscal_(resposta);
          return resposta;
        } catch (erro) {
          if (sequencia !== encerramentoFiscalSequencia) return null;
          esconderAvisoEncerramentoFiscal_();
          return null;
        }
      }

      function agendarConsultaEncerramentoFiscal_() {
        clearTimeout(encerramentoFiscalTimer);
        encerramentoFiscalSequencia += 1;
        if (!situacaoAtualPodeEncerrarFiscalizacao_()) {
          esconderAvisoEncerramentoFiscal_();
          return;
        }
        encerramentoFiscalTimer = setTimeout(() => consultarEncerramentoFiscal_(), 650);
      }

      function applyPhoneMask(event) {
        let v = digits(event.target.value).slice(0, 11);
        if (v.length <= 10) {
          v = v.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
        } else {
          v = v.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
        }
        event.target.value = v;
        agendarConsultaResponsavelPorTelefone_();
      }

      let sharedDraftSyncTimer = null;
      async function sincronizarRascunhoCompartilhado_(estado = 'em_andamento', silencioso = true) {
        if (!usuarioPodeOperar_() || !navigator.onLine) return false;
        if (rascunhoFinalizadoLocal_(currentRecordId)) return false;
        const payload = buildPayload();
        if (assinaturaFinalizadaLocal_(payload)) return false;
        payload._appRegistroId = currentRecordId;
        try {
          await apiRequest('config', { consulta: 'rascunho_salvar', estado, payload }, 18000);
          atualizarEstadoSalvamentoIrregularidades_('synced', '✓ Salva e sincronizada');
          if (modoAcessoAuxiliarNotificacoesAtivo_() && auxNotificationsMeta) {
            const agora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
            const base = auxNotificationsMeta.textContent.split(' • Sincronizada às ')[0];
            auxNotificationsMeta.textContent = `${base} • Sincronizada às ${agora}`;
          }
          if (!silencioso) appStatus.textContent = estado === 'parcial' ? 'Vistoria concluída parcialmente e sincronizada.' : 'Rascunho compartilhado sincronizado.';
          return true;
        } catch (e) {
          atualizarEstadoSalvamentoIrregularidades_('offline', '☁ Salva — aguardando sincronização');
          if (!silencioso) appStatus.textContent = 'O rascunho continua salvo neste aparelho e será sincronizado quando houver conexão.';
          return false;
        }
      }

      let sharedDraftStateChecking=false;
      async function verificarEstadoRascunhoCompartilhado_(){
        if(sharedDraftStateChecking||!navigator.onLine||!preparacaoEmUsoId||!currentRecordId||!usuarioPodeOperar_()) return;
        sharedDraftStateChecking=true;
        try{
          const r=await apiRequest('config',{consulta:'rascunho_estado',id:String(currentRecordId)},8000);
          if(String(r?.estado||'').toLowerCase()==='cancelado'){
            const id=String(currentRecordId); removerRascunhoLocal_(id); resetForm(true);
            appStatus.textContent=`Este preenchimento foi cancelado${r?.atualizadoPor?` por ${r.atualizadoPor}`:' em outro aparelho'}. A vistoria programada permanece disponível.`;
            carregarPreparacoesVistoria_().catch(()=>{});
          }
        }catch(e){}finally{sharedDraftStateChecking=false;}
      }
      setInterval(verificarEstadoRascunhoCompartilhado_,8000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden) verificarEstadoRascunhoCompartilhado_();});
      window.addEventListener('focus',verificarEstadoRascunhoCompartilhado_);

      function agendarSincronizacaoRascunhoCompartilhado_() {
        clearTimeout(sharedDraftSyncTimer);
        sharedDraftSyncTimer = setTimeout(() => sincronizarRascunhoCompartilhado_('em_andamento', true), 1800);
      }

      async function concluirParcialmente_() {
        if (!usuarioPodeOperar_()) return;
        saveDraft();
        const ok = await sincronizarRascunhoCompartilhado_('parcial', false);
        if (!ok && !navigator.onLine) {
          appStatus.textContent = 'Conclusão parcial salva neste aparelho. Abra o app com internet para sincronizar antes de continuar em outro aparelho.';
        }
        successScreen.classList.add('partial-success');
        const closeBtn = document.getElementById('closeSuccessBtn');
        if (closeBtn) closeBtn.textContent = 'Fechar';
        mostrarSucesso(
          'Vistoria concluída parcialmente',
          ok
            ? 'Dados salvos e sincronizados. A vistoria poderá ser continuada posteriormente, inclusive em outro aparelho.'
            : 'Dados salvos neste aparelho. A sincronização ocorrerá quando houver internet.'
        );
      }

      async function continuarRascunhoCompartilhado_() {
        if (!navigator.onLine) { appStatus.textContent = 'É necessária internet para localizar vistorias compartilhadas.'; return; }
        try {
          const r = await apiRequest('config', { consulta: 'rascunhos' }, 20000);
          const lista = Array.isArray(r?.rascunhos) ? r.rascunhos : [];
          if (!lista.length) { appStatus.textContent = 'Nenhuma vistoria em andamento ou parcialmente concluída encontrada.'; return; }
          const opcoesRascunho = lista.slice(0, 20).map((x, i) => ({
            valor: i,
            titulo: x.nomeFantasia || x.razaoSocial || x.endereco || `Vistoria ${i + 1}`,
            subtitulo: [x.cidade || '', x.estado === 'parcial' ? 'Parcialmente concluída' : 'Em andamento']
              .filter(Boolean).join(' · ')
          }));
          const idx = await escolherOpcaoGpv_(
            'Selecione a vistoria que deseja continuar.',
            opcoesRascunho,
            'Continuar vistoria'
          );
          if (!Number.isInteger(idx) || idx < 0 || idx >= lista.length) return;
          const item = lista[idx];
          const detalhe = await apiRequest('config', { consulta: 'rascunho', id: item.id }, 20000);
          if (!detalhe?.payload) throw new Error('Rascunho não encontrado.');
          currentRecordId = String(item.id || currentRecordId);
          applyPayload(detalhe.payload, item.id);
          saveDraft();
          appStatus.textContent = `Vistoria compartilhada carregada${item.atualizadoPor ? ` — última atualização: ${item.atualizadoPor}` : ''}.`;
          document.getElementById('cidadeSecao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) { appStatus.textContent = e?.message || 'Não foi possível carregar as vistorias compartilhadas.'; }
      }

      function atualizarEstadoSalvamentoIrregularidades_(estado, texto) {
        document.querySelectorAll('[data-notification-save-state]').forEach(el => {
          el.dataset.state = estado;
          el.textContent = texto;
        });
      }

      function marcarIrregularidadeSalvando_(id) {
        const el = document.querySelector(`[data-notification-save-state="${CSS.escape(String(id || ''))}"]`);
        if (!el) return;
        el.dataset.state = 'saving';
        el.textContent = '⟳ Salvando...';
      }

      function scheduleDraftSave() {
        if (!usuarioPodeOperar_()) {
          clearTimeout(saveTimer);
          if (draftStatus) draftStatus.textContent = 'Preenchimento temporário';
          return;
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { saveDraft(); agendarSincronizacaoRascunhoCompartilhado_(); }, 350);
      }

      function saveDraft() {
        if (!usuarioPodeOperar_()) {
          if (draftStatus) draftStatus.textContent = 'Preenchimento temporário';
          return;
        }
        if (rascunhoFinalizadoLocal_(currentRecordId)) return;
        try {
          const payloadAtual = buildPayload();
          if (assinaturaFinalizadaLocal_(payloadAtual)) return;
          const savedAt = Date.now();
          localStorage.setItem(draftKeyAtual_(), JSON.stringify({ savedAt, recordId: currentRecordId, payload: payloadAtual }));
          registrarRascunhoLocal_(currentRecordId, savedAt);
          atualizarEstadoSalvamentoIrregularidades_(navigator.onLine ? 'local' : 'offline', navigator.onLine ? '✓ Salva neste aparelho' : '☁ Salva — aguardando sincronização');
          draftStatus.textContent = '✓ Rascunho salvo';
          setTimeout(() => { draftStatus.textContent = 'Rascunho automático'; }, 1600);
        } catch (e) {}
      }

      function applyPayload(p, recordId = '') {
        if (!p || typeof p !== 'object') return;
        limparProtecaoEdicaoResponsavel_();
        preparacaoEmUsoId = String(p._appPreparacaoId || '');
        dduEmUsoId = String(p._appDduId || '');
        dduEmUsoNumero = String(p._appDduNumero || p.dduProtocol || '');
        processoAcessoriaVinculado = p._appAcessoriaPfVinculado ? { pf: String(p._appAcessoriaPfVinculado), sancao: String(p._appAcessoriaSituacaoAnterior || p.acessoriaSituacaoAnterior || '') } : null;
        aplicarFluxoVistoria_(inferirFluxoDoRascunho_(p), { silencioso: true });
        currentRecordId = String(recordId || p._appRegistroId || currentRecordId || criarIdRegistro());
        atualizarBotaoCancelarPreenchimentoTopo_();
        sancaoAntesDoAutomatico = String(p._appSancaoAntesAuto || '');
        if (licenciamentoSelect) licenciamentoSelect.value = String(p._appLicenciamento || '');
        if (possuiPscipSelect) possuiPscipSelect.value = String(p._appPossuiPscip || (p.pscip ? 'sim' : ''));
        const cityOptions = Array.from(citySelect.options).map(o => o.value);
        if (cityOptions.includes(p.cidade)) citySelect.value = p.cidade;
        else if (p.cidade) { citySelect.value = 'Outro'; otherCity.value = p.cidade; }
        Object.entries(p).forEach(([key, val]) => {
          if (key === 'cidade' || key === 'ocupacao' || key === 'notificacoesLiberacao' || key.startsWith('_app')) return;
          const el = document.getElementById(key); if (el) el.value = val == null ? '' : val;
        });
        protegerCamposResponsavelPreenchidos_();
        restaurarNotificacoesLiberacao_(p.notificacoesLiberacao);
        restaurarRetornoLiberacaoDoPayload_(p);
        restaurarOcupacoesSelecionadas(p.ocupacao);
        restaurarStatusLocalizacao_();
        aplicarFluxoVistoria_(inferirFluxoDoRascunho_(p), { silencioso: true });
        if (sancaoSelect && p.sancao) sancaoSelect.value = String(p.sancao);
        syncOtherCity(); syncLicenciamento(); syncPscip_(); syncNotificado(); sincronizarDemandasEspeciais_(); atualizarCampoRenovacaoAvcb_(); atualizarVerificacaoMetasFiscalizacao_();
      }

      function restoreDraft() {
        try {
          let raw = obterRascunhoLocalMaisRecente_();
          // Migra eventual rascunho único das versões anteriores para o modelo multi-rascunho.
          if (!raw && authState.usuario?.id) {
            const chaveLegadaUsuario = `${DRAFT_KEY}:${draftUserId_()}`;
            const legado = localStorage.getItem(chaveLegadaUsuario) || localStorage.getItem(DRAFT_KEY);
            if (legado) {
              try {
                const d = JSON.parse(legado);
                const rid = String(d?.recordId || d?.payload?._appRegistroId || criarIdRegistro());
                d.recordId = rid;
                if (d?.payload && assinaturaFinalizadaLocal_(d.payload)) {
                  marcarRascunhoFinalizadoLocal_(rid);
                } else {
                  localStorage.setItem(draftKeyAtual_(rid), JSON.stringify(d));
                  registrarRascunhoLocal_(rid, d.savedAt || Date.now());
                  raw = JSON.stringify(d);
                }
              } catch (e) {}
              localStorage.removeItem(chaveLegadaUsuario);
              localStorage.removeItem(DRAFT_KEY);
            }
          }
          if (!raw) return;
          const draft = JSON.parse(raw);
          if (!draft?.payload) return;
          if (Date.now() - Number(draft.savedAt || 0) > 1000 * 60 * 60 * 24 * 3) {
            removerRascunhoLocal_(draft.recordId || draft.payload?._appRegistroId || currentRecordId);
            return;
          }
          const p = draft.payload;
          limparProtecaoEdicaoResponsavel_();
          preparacaoEmUsoId = String(p._appPreparacaoId || '');
          dduEmUsoId = String(p._appDduId || '');
          dduEmUsoNumero = String(p._appDduNumero || p.dduProtocol || '');
          processoAcessoriaVinculado = p._appAcessoriaPfVinculado ? { pf: String(p._appAcessoriaPfVinculado), sancao: String(p._appAcessoriaSituacaoAnterior || p.acessoriaSituacaoAnterior || '') } : null;
          aplicarFluxoVistoria_(inferirFluxoDoRascunho_(p), { silencioso: true });
          currentRecordId = String(draft.recordId || p._appRegistroId || currentRecordId || criarIdRegistro());
          atualizarBotaoCancelarPreenchimentoTopo_();
          sancaoAntesDoAutomatico = String(p._appSancaoAntesAuto || '');
          if (licenciamentoSelect) licenciamentoSelect.value = String(p._appLicenciamento || '');
          if (possuiPscipSelect) possuiPscipSelect.value = String(p._appPossuiPscip || (p.pscip ? 'sim' : ''));
          sancaoDefinidaAutomaticamente = ['nao_possui','vencido'].includes(String(p._appLicenciamento || '')) && normalize(p.demandaPrincipal) !== normalize('Vistoria Acessória');
          const cityOptions = Array.from(citySelect.options).map(o => o.value);
          if (cityOptions.includes(p.cidade)) {
            citySelect.value = p.cidade;
          } else if (p.cidade) {
            citySelect.value = 'Outro';
            otherCity.value = p.cidade;
          }
          Object.entries(p).forEach(([key, val]) => {
            if (key === 'cidade' || key === 'ocupacao' || key === 'notificacoesLiberacao' || key.startsWith('_app')) return;
            const el = document.getElementById(key);
            if (el) el.value = val == null ? '' : val;
          });
          protegerCamposResponsavelPreenchidos_();
          restaurarNotificacoesLiberacao_(p.notificacoesLiberacao);
          restaurarOcupacoesSelecionadas(p.ocupacao);
          restaurarStatusLocalizacao_();
          aplicarFluxoVistoria_(inferirFluxoDoRascunho_(p), { silencioso: true });
          if (sancaoSelect && p.sancao) sancaoSelect.value = String(p.sancao);
          syncOtherCity();
          syncLicenciamento();
          syncPscip_();
          const tipoId = tipoIdentificador_(value('cnpj'));
          atualizarInterfaceIdentificador_(tipoId);
          if (tipoId === 'cpf') sincronizarIdentificadorComCpf_(value('cnpj'));
          if (tipoId === 'cnpj') cnpjAssociadoDadosEmpresa = digits(value('cnpj'));
          telefoneResponsavelAssociado = digits(value('telefone'));
          syncNotificado();
          sincronizarDemandasEspeciais_();
          atualizarVerificacaoMetasFiscalizacao_();
          if (preparacaoEmUsoId) setTimeout(() => rolarParaFormularioProgramado_(), 0);
          appStatus.textContent = 'Rascunho anterior recuperado.';
        } catch (e) {}
      }

      function rascunhoEmAndamento_() {
        if (!usuarioPodeOperar_()) return false;
        try {
          const raw = obterRascunhoLocalMaisRecente_();
          if (!raw) return false;
          const draft = JSON.parse(raw);
          const p = draft && draft.payload ? draft.payload : null;
          if (!p) return false;
          if (Date.now() - Number(draft.savedAt || 0) > 1000 * 60 * 60 * 24 * 3) return false;
          const campos = [
            'tipoVistoria','nomeFantasia','razaoSocial','cnpj','pf','reds','endereco','numero','bairro','localizacaoCoordenadas',
            'demandaPrincipal','sancao','responsavel','nomeResponsavel','cpf','telefone','pscip','ocupacao',
            'eventoDeclaracaoNumero','eventoNome','eventoOrganizador','dduProtocol','acessoriaResultado',
            '_appPreparacaoId','_appDduId','_appAcessoriaPfVinculado'
          ];
          if (campos.some(chave => String(p[chave] == null ? '' : p[chave]).trim())) return true;
          const notificacoes = String(p.notificacoesLiberacao || '').trim();
          return !!(notificacoes && notificacoes !== '[]');
        } catch (e) {
          return false;
        }
      }

      function prepararFormularioNovaVistoria_(origem = 'Nova vistoria') {
        deduplicarRascunhosLocais_();
        if (rascunhoEmAndamento_()) {
          saveDraft();
          sincronizarRascunhoCompartilhado_('em_andamento', true).catch(() => {});
        }
        resetForm(true);
        if (appStatus) appStatus.textContent = `${origem}: novo preenchimento iniciado. Os demais rascunhos foram preservados.`;
        return true;
      }

      function encerrarEstadoLocalVistoria_(recordId, payloadFinal = null) {
        const rid = String(recordId || '').trim();
        if (!rid) return;

        marcarRascunhoFinalizadoLocal_(rid);
        if (payloadFinal && typeof payloadFinal === 'object') {
          marcarAssinaturaFinalizadaLocal_(payloadFinal);
        }

        clearTimeout(saveTimer);
        clearTimeout(sharedDraftSyncTimer);
        clearTimeout(cnpjTimer);
        clearTimeout(responsavelLookupTimer);
        clearTimeout(responsavelCpfLookupTimer);
        clearTimeout(estabelecimentoLookupTimer);
        clearTimeout(pscipLookupTimer);
        clearTimeout(encerramentoFiscalTimer);

        // Invalida respostas assíncronas iniciadas pelo formulário que acabou de ser encerrado.
        cnpjConsultaSequencia += 1;
        responsavelLookupSequencia += 1;
        responsavelCpfLookupSequencia += 1;
        estabelecimentoLookupSequencia += 1;
        pscipLookupSequencia += 1;
        encerramentoFiscalSequencia += 1;

        removerRascunhosLocaisRelacionados_(payloadFinal || { _appRegistroId: rid }, rid);
      }

      function limparCamposFormularioEncerrado_() {
        try {
          form.querySelectorAll('input, textarea, select').forEach(el => {
            const tipo = String(el.type || '').toLowerCase();
            if (tipo === 'button' || tipo === 'submit' || tipo === 'reset' || tipo === 'file') return;
            if (tipo === 'checkbox' || tipo === 'radio') {
              el.checked = false;
              return;
            }
            if (el.tagName === 'SELECT') {
              el.selectedIndex = 0;
              return;
            }
            el.value = '';
          });
        } catch (e) {}
      }

      function resetForm(preservarRascunhoAtual = false, limpezaForte = false) {
        restaurarPainelProgramadas_(false);
        preparacaoEmUsoId = '';
        dduEmUsoId = '';
        dduEmUsoNumero = '';
        processoAcessoriaVinculado = null;
        form.reset();
        if (limpezaForte) limparCamposFormularioEncerrado_();
        limparStatusLocalizacao_();
        if (!preservarRascunhoAtual) removerRascunhoLocal_(currentRecordId);
        currentRecordId = criarIdRegistro();
        citySelect.value = appConfig?.padroes?.cidade || 'Viçosa';
        otherCity.value = '';
        sancaoDefinidaAutomaticamente = false;
        sancaoAntesDoAutomatico = '';
        if (licenciamentoSelect) licenciamentoSelect.value = '';
        if (possuiPscipSelect) possuiPscipSelect.value = '';
        aplicarFluxoVistoria_('', { silencioso: true });
        if (pendenciaDocumentalSelect) pendenciaDocumentalSelect.value = '';
        if (tipoLiberacaoSelect) tipoLiberacaoSelect.value = 'final';
        if (situacaoMultaInfoscipSelect) situacaoMultaInfoscipSelect.value = 'Não conferido';
        syncPendenciaDocumental_();
        syncOtherCity();
        syncLicenciamento();
        syncPscip_();
        sincronizarDemandasEspeciais_();
        document.getElementById('enderecoCorrespondencia').value = appConfig?.padroes?.enderecoCorrespondencia || 'O Mesmo';
        document.getElementById('enderecoResponsavel').readOnly = false;
        document.getElementById('enderecoResponsavel').style.background = '';
        document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        hideError();
        clearCnpjStatus();
        ultimoCnpjConsultado = '';
        cnpjConsultaSequencia += 1;
        cnpjAssociadoDadosEmpresa = '';
        clearTimeout(responsavelLookupTimer);
        responsavelLookupSequencia += 1;
        telefoneResponsavelAssociado = '';
        responsavelCamposEditadosManual_.clear();
        responsavelEdicaoManualAtiva_ = false;
        RESPONSAVEL_EDITABLE_FIELDS_.forEach(id => document.getElementById(id)?.classList.remove('responsible-manual-edited'));
        esconderResponsavelLookupResultados_();
        clearTimeout(responsavelCpfLookupTimer);
        responsavelCpfLookupSequencia += 1;
        cpfResponsavelAssociado = '';
        esconderResponsavelCpfLookupResultados_();
        clearResponsavelCpfLookupStatus_();
        clearTimeout(estabelecimentoLookupTimer);
        estabelecimentoLookupSequencia += 1;
        esconderHistoricoEstabelecimento_();
        clearTimeout(pscipLookupTimer);
        pscipLookupSequencia += 1;
        esconderHistoricoPscip_();
        clearPscipLookupStatus_();
        clearTimeout(encerramentoFiscalTimer);
        encerramentoFiscalSequencia += 1;
        esconderAvisoEncerramentoFiscal_();
        clearResponsavelLookupStatus_();
        cpfCopiadoDoIdentificador = '';
        atualizarInterfaceIdentificador_('');
        ocupacaoSelecionada = null;
        ocupacoesSelecionadas = [];
        notificacoesLiberacaoDraft = [];
        renderizarNotificacoesLiberacao_();
        resetarRetornoLiberacao_();
        ocupacaoInput.value = '';
        renderizarOcupacoesSelecionadas();
        mostrarMetaOcupacao(null);
        esconderResultadosOcupacao();
        atualizarVerificacaoMetasFiscalizacao_();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }


      async function consultarDuplicidadeAntesEnvio_(payload) {
        if (!navigator.onLine) return null;
        try {
          return await apiRequest('config', { consulta: 'duplicidade', payload }, 7000);
        } catch (erro) {
          appStatus.textContent = 'Não foi possível conferir duplicidade agora; o registro poderá ser enviado normalmente.';
          return null;
        }
      }

      function textoLicenciamentoRevisao_(valor) {
        if (valor === 'possui') return 'Possui AVCB ou CLCB';
        if (valor === 'nao_possui') return 'Não possui';
        if (valor === 'vencido') return 'AVCB/CLCB vencido';
        if (valor === 'dispensado') return 'Dispensado de licenciamento';
        return valor || '—';
      }

      function mostrarRevisaoAntesEnvio_(payload, duplicidade, encerramentoFiscal) {
        const identificador = digits(payload?.cnpj);
        const idFormatado = identificador.length === 14
          ? formatarCnpjTela_(identificador)
          : (identificador.length === 11 ? formatarCpfTela_(identificador) : identificador);
        const eventoDeclaratorio = normalize(payload?.demandaPrincipal || '').includes(normalize('Eventos declaratórios'));
        const itens = eventoDeclaratorio ? [
          ['Nº da declaração INFOSCIP', payload?.eventoDeclaracaoNumero || '—'],
          ['Classificação', payload?.eventoClassificacao || '—'],
          ['Nome do evento', payload?.eventoNome || '—'],
          ['Início', payload?.eventoInicio || '—'],
          ['Término', payload?.eventoTermino || '—'],
          ['Público estimado', payload?.eventoPublicoEstimado || '—'],
          ['Organizador', payload?.eventoOrganizador || '—'],
          ['CPF/CNPJ do organizador', payload?.eventoOrganizadorDocumento || '—'],
          ['Telefone do organizador', payload?.eventoTelefoneOrganizador || '—'],
          ['Cidade', payload?.cidade || '—'],
          ['Local do evento', [payload?.endereco, payload?.numero, payload?.bairro].filter(Boolean).join(', ') || (String(payload?.localizacaoCoordenadas || '').trim() ? 'Localização capturada — endereço ainda não identificado' : '—')],
          ['Responsável que acompanhou', payload?.nomeResponsavel || '—'],
          ['CPF do responsável', payload?.cpf ? formatarCpfTela_(payload.cpf) : '—'],
          ['Telefone do responsável', payload?.telefone || '—'],
          ['Vínculo / função', payload?.responsavel || '—'],
          ['Demanda', 'Eventos declaratórios'],
          ['Categoria da meta', 'Eventos declaratórios'],
          ['Tipo de vistoria', payload?.tipoVistoria || '—'],
          ['Vistoriador responsável', payload?.vistoriadorResponsavel || '—'],
          [usuarioPodeOperar_() ? 'Situação final registrada' : 'Situação ao final do treinamento', payload?.sancao || '—'],
          ['Nº PF', payload?.pf || '—'],
          [usuarioPodeOperar_() ? 'Enviado por' : 'Preenchido por', authState.usuario?.nome || '—']
        ] : [
          ['Estabelecimento', payload?.nomeFantasia || payload?.razaoSocial || '—'],
          ['CNPJ / CPF', idFormatado || '—'],
          ['Cidade', payload?.cidade || '—'],
          ['Endereço', [payload?.endereco, payload?.numero, payload?.bairro].filter(Boolean).join(', ') || (String(payload?.localizacaoCoordenadas || '').trim() ? 'Localização capturada — endereço ainda não identificado' : '—')],
          ['Responsável / RT', payload?.nomeResponsavel || '—'],
          ['Telefone', payload?.telefone || '—'],
          ['Licenciamento', textoLicenciamentoRevisao_(payload?._appLicenciamento)],
          ['Possui PSCIP?', payload?._appPossuiPscip === 'sim'
            ? 'Sim'
            : (payload?._appPossuiPscip === 'nao'
              ? 'Não'
              : (payload?._appPossuiPscip === 'dispensado' ? 'Dispensado' : '—'))],
          ['Nº PSCIP', payload?.pscip || '—'],
          ['Situação atual do PSCIP', payload?.situacaoPscip || '—'],
          ...(normalize(payload?.demandaPrincipal || '') === normalize('DDU') ? [['Protocolo DDU', payload?.dduProtocol || '—']] : []),
          ...(normalize(payload?.demandaPrincipal || '') === normalize('Vistoria Acessória') ? [
            ['PF vinculado', payload?._appAcessoriaPfVinculado || payload?.pf || '—'],
            ['Situação anterior do PF', payload?.acessoriaSituacaoAnterior || '—'],
            ['Resultado da Vistoria Acessória', payload?.acessoriaResultado === 'sanadas' ? 'Irregularidades sanadas' : (payload?.acessoriaResultado === 'nao_sanadas' ? 'Irregularidades persistem' : '—')],
            ['Documento de licenciamento', payload?.acessoriaTipoLicenca || '—']
          ] : []),
          ...(normalize(payload?.tipoLiberacao || '') === normalize('parcial') ? [
            ['Tipo da liberação', 'Parcial'],
            ['Área/trecho liberado', payload?.liberacaoParcialDescricao || '—'],
            ['Área liberada parcialmente', payload?.liberacaoParcialArea ? `${payload.liberacaoParcialArea} m²` : '—']
          ] : []),
          ['Área da edificação', payload?.area ? `${payload.area} m²` : '—'],
          ['Demanda', [payload?.demandaPrincipal, categoriaMetaComAreaParaExibicao_(payload)].filter(Boolean).join(' | ') || '—'],
          ['Verificação de meta por área', normalize(payload?.tipoVistoria || '').includes('fiscalizacao')
            ? (numeroAreaM2_(payload?.area) > 930 ? 'Nível de risco III — enquadramento automático' : 'Não enquadra automaticamente em Nível de risco III pela área')
            : 'Não se aplica'],
          ['Tipo de vistoria', payload?.tipoVistoria || '—'],
          ['Vistoriador responsável', payload?.vistoriadorResponsavel || '—'],
          ['Situação pretendida', payload?._appSancaoPretendida || payload?.sancao || '—'],
          [usuarioPodeOperar_() ? 'Situação final registrada' : 'Situação ao final do treinamento', payload?.sancao || '—'],
          ['Situação de multa no INFOSCIP', payload?.situacaoMultaInfoscip || 'Não conferido'],
          ['Notificações da liberação', payload?.notificacoesLiberacao ? `${flattenNotificacoesLiberacao_(true).length} ${usuarioPodeOperar_() ? 'registrada(s)' : 'preenchida(s)'}` : '—'],
          ['Nº PF', payload?.pf || '—'],
          [usuarioPodeOperar_() ? 'Enviado por' : 'Preenchido por', authState.usuario?.nome || '—']
        ];


        const duplicados = Array.isArray(duplicidade?.encontrados) ? duplicidade.encontrados : [];
        const avisoDuplicidade = duplicidade?.duplicado && duplicados.length
          ? `Atenção: já existe vistoria recente deste CNPJ/CPF no mesmo endereço. Registro mais recente: ${duplicados[0].carimbo || 'data não informada'} — ${duplicados[0].estabelecimento || 'estabelecimento'}${duplicados[0].sancao ? ` — ${duplicados[0].sancao}` : ''}. Se esta é uma nova vistoria, você pode continuar.`
          : '';

        if (!reviewModal || !reviewList || !reviewConfirmBtn || !reviewCancelBtn) {
          const texto = itens.map(([r, v]) => `${r}: ${v}`).join('\n');
          return confirmarGpv_(
            `${avisoDuplicidade ? avisoDuplicidade + '\n\n' : ''}${texto}`,
            usuarioPodeOperar_() ? 'Confirmar registro' : 'Concluir treinamento',
            { rotuloConfirmar: usuarioPodeOperar_() ? 'Confirmar e registrar' : 'Concluir' }
          ).then(confirmado => ({ confirmado, encerrarProcesso: false, chaveProcesso: '' }));
        }

        reviewList.innerHTML = itens.map(([rotulo, valor]) =>
          `<div class="review-row"><span>${escapeHtml(rotulo)}</span><strong>${escapeHtml(valor)}</strong></div>`
        ).join('');
        if (reviewDuplicateNotice) {
          reviewDuplicateNotice.hidden = !avisoDuplicidade;
          reviewDuplicateNotice.textContent = avisoDuplicidade;
        }

        const candidatosEncerramento = Array.isArray(encerramentoFiscal?.candidatos) ? encerramentoFiscal.candidatos : [];
        if (reviewClosureNotice) {
          if (!candidatosEncerramento.length) {
            reviewClosureNotice.hidden = true;
            reviewClosureNotice.innerHTML = '';
          } else {
            const principal = candidatosEncerramento[0];
            const refPrincipal = principal.pf ? `PF nº ${principal.pf}` : (principal.pscip ? `PSCIP ${principal.pscip}` : `registro de ${principal.carimbo || 'data anterior'}`);
            const listaOutros = candidatosEncerramento.slice(1).map(item => {
              const ref = item.pf ? `PF ${item.pf}` : (item.pscip ? `PSCIP ${item.pscip}` : item.carimbo || 'registro');
              return `<li>${escapeHtml(ref)} — ${escapeHtml(item.sancao || '')}</li>`;
            }).join('');
            const unico = candidatosEncerramento.length === 1;
            const regularizacaoAutomatica = unico && normalize(payload?.sancao) === normalize('Regularizado');
            reviewClosureNotice.innerHTML = usuarioPodeOperar_()
              ? `<strong>Processo fiscalizatório anterior localizado</strong>
                <p>${escapeHtml(refPrincipal)} está em <b>${escapeHtml(principal.sancao || 'situação em aberto')}</b>. A vistoria atual está como <b>${escapeHtml(payload?.sancao || '')}</b>.</p>
                ${regularizacaoAutomatica
                  ? `<p><strong>Atualização automática:</strong> ao confirmar esta nova vistoria como Regularizado, o processo anterior será atualizado para <strong>Regularizado</strong>.</p>`
                  : (unico
                    ? `<label class="review-closure-check"><input type="checkbox" id="reviewClosureConfirm"> <span>Confirmar o encerramento deste processo anterior como <strong>Regularizado</strong> ao registrar a vistoria atual.</span></label>`
                    : `<p><strong>Atenção:</strong> foram encontrados ${candidatosEncerramento.length} processos compatíveis. Nenhum será encerrado automaticamente; confira qual PF corresponde ao processo.</p><ul>${listaOutros}</ul>`)}`
              : `<strong>Processo fiscalizatório anterior localizado</strong>
                <p>${escapeHtml(refPrincipal)} está em <b>${escapeHtml(principal.sancao || 'situação em aberto')}</b>. O sistema demonstra a análise normalmente, mas nenhuma situação ou processo será alterado neste acesso.</p>
                ${!unico ? `<p>Foram encontrados ${candidatosEncerramento.length} processos compatíveis. Confira qual PF corresponde ao processo.</p><ul>${listaOutros}</ul>` : ''}`;
            reviewClosureNotice.hidden = false;
          }
        }
        reviewConfirmBtn.textContent = usuarioPodeOperar_() ? 'Confirmar e registrar' : 'Concluir treinamento';
        reviewModal.hidden = false;
        document.body.classList.add('review-open');

        return new Promise(resolve => {
          let encerrado = false;
          const finalizar = confirmado => {
            if (encerrado) return;
            encerrado = true;
            const candidatos = Array.isArray(encerramentoFiscal?.candidatos) ? encerramentoFiscal.candidatos : [];
            const principal = candidatos[0] || null;
            const regularizacaoAutomatica = Boolean(usuarioPodeOperar_() && confirmado && candidatos.length === 1 && normalize(payload?.sancao) === normalize('Regularizado'));
            const encerramentoConfirmado = Boolean(usuarioPodeOperar_() && confirmado && candidatos.length === 1 && document.getElementById('reviewClosureConfirm')?.checked);
            const encerrarProcesso = regularizacaoAutomatica || encerramentoConfirmado;
            const chaveProcesso = encerrarProcesso ? String(principal?.chave || '') : '';
            reviewModal.hidden = true;
            document.body.classList.remove('review-open');
            reviewConfirmBtn.removeEventListener('click', onConfirmar);
            reviewCancelBtn.removeEventListener('click', onCancelar);
            reviewCancelTopBtn?.removeEventListener('click', onCancelar);
            document.removeEventListener('keydown', onKeydown);
            resolve({ confirmado, encerrarProcesso, chaveProcesso });
          };
          const onConfirmar = () => finalizar(true);
          const onCancelar = () => finalizar(false);
          const onKeydown = event => { if (event.key === 'Escape') onCancelar(); };

          reviewConfirmBtn.addEventListener('click', onConfirmar);
          reviewCancelBtn.addEventListener('click', onCancelar);
          reviewCancelTopBtn?.addEventListener('click', onCancelar);
          document.addEventListener('keydown', onKeydown);
          setTimeout(() => reviewConfirmBtn.focus(), 30);
        });
      }

      async function submit() {
        if (submitting || !validateRequired(true)) return;

        const nascimentoAtual = document.getElementById('nascimento');
        if (nascimentoAtual && !dataNascimentoValida_(nascimentoAtual.value)) {
          nascimentoAtual.setCustomValidity('Informe uma data válida no formato DD/MM/AAAA.');
          nascimentoAtual.classList.add('invalid');
          nascimentoAtual.focus();
          nascimentoAtual.reportValidity();
          appStatus.textContent = 'Confira a data de nascimento do responsável.';
          return;
        }

        if (!validarNotificacoesParaNotificado_(true)) return;

        const liberadoComRascunho = ehFluxoLiberacao_() &&
          normalize(value('sancao')) === normalize('Liberado') &&
          notificacoesPossuemConteudo_();

        if (liberadoComRascunho) {
          const mensagemLiberado = usuarioPodeOperar_()
            ? 'Existem irregularidades/notificações registradas no rascunho desta vistoria, mas o resultado está como Liberado.\n\n' +
              'Se continuar, a vistoria será concluída como Liberado e essas anotações permanecerão temporariamente na Ficha do Processo por até 15 dias.\n\n' +
              'Deseja realmente concluir como Liberado?'
            : 'Existem irregularidades/notificações preenchidas neste treinamento, mas o resultado está como Liberado.\n\n' +
              'Você pode continuar para conhecer a etapa de conferência. Nenhuma informação será enviada ou registrada.\n\n' +
              'Deseja continuar?';
          const continuar = await confirmarGpv_(
            mensagemLiberado,
            'Concluir como Liberado?',
            { rotuloConfirmar: 'Continuar', rotuloCancelar: 'Revisar notificações' }
          );
          if (!continuar) {
            notificacoesLiberacaoSecao?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            appStatus.textContent = 'Confira o rascunho das notificações antes de concluir como Liberado.';
            return;
          }
        }

        saveDraft();

        // V23.9.99: a revisão técnica não interrompe mais o encerramento em campo.
        // Texto original e pré-análise técnica seguem juntos para revisão posterior.
        const payload = buildPayload();
        payload._appRegistroId = currentRecordId;
        payload._appCriadoEm = payload._appCriadoEm || new Date().toISOString();

        if (navigator.onLine) appStatus.textContent = usuarioPodeOperar_()
          ? 'Conferindo duplicidade e processos anteriores antes do envio...'
          : 'Conferindo dados e processos anteriores para concluir o treinamento...';
        const [duplicidade, encerramentoFiscal] = await Promise.all([
          consultarDuplicidadeAntesEnvio_(payload),
          consultarEncerramentoFiscal_(payload)
        ]);
        const revisao = await mostrarRevisaoAntesEnvio_(payload, duplicidade, encerramentoFiscal);
        if (!revisao?.confirmado) {
          appStatus.textContent = 'Revise os campos e confirme novamente quando estiver pronto.';
          return;
        }
        if (revisao.encerrarProcesso && revisao.chaveProcesso) {
          payload._appEncerrarProcesso = 'sim';
          payload._appEncerrarProcessoChave = revisao.chaveProcesso;
        }

        if (!usuarioPodeOperar_()) {
          ultimoRegistroConsultaChave = '';
          ultimoRegistroParaOrientacoes = null;
          try { removerRascunhoLocal_(currentRecordId); } catch (_) {}
          resetForm();
          if (draftStatus) draftStatus.textContent = 'Preenchimento temporário';
          appStatus.textContent = 'Treinamento concluído — nenhuma informação foi enviada ou registrada.';
          await mostrarAvisoAcessoGeral_('conclusao');
          return;
        }

        ultimoRegistroConsultaChave = '';
        ultimoRegistroParaOrientacoes = { ...payload };

        // Estratégia local-first: antes de qualquer tentativa de internet, a vistoria
        // entra na fila do aparelho. Isso torna o botão praticamente imediato e
        // evita perda de dados caso a conexão oscile durante o envio.
        const registroEncerradoId = String(currentRecordId || payload._appRegistroId || '');
        enfileirarRegistro(payload);
        if (navigator.onLine) {
          apiRequest('config', {
            consulta: 'rascunho_encerrar',
            id: registroEncerradoId,
            payload
          }, 12000).catch(() => {});
        }
        encerrarEstadoLocalVistoria_(registroEncerradoId, payload);
        resetForm(true, true);

        if (!navigator.onLine) {
          mostrarSucesso(
            'Vistoria salva no aparelho',
            'Registro guardado offline. Você já pode iniciar outra vistoria; o envio ocorrerá quando a internet voltar.'
          );
          appStatus.textContent = 'Vistoria salva no aparelho — aguardando internet.';
          return;
        }

        mostrarSucesso(
          'Vistoria salva',
          'O registro já está seguro neste aparelho e está sendo enviado para a planilha. Você pode iniciar a próxima vistoria agora.'
        );
        appStatus.textContent = 'Vistoria salva no aparelho — sincronizando com a planilha.';
        setTimeout(() => enviarPendentes(true), 80);
      }

      function fecharMenuMais_() {
        if (!appMoreMenu) return;
        appMoreMenu.hidden = true;
        document.body.classList.remove('more-menu-open');
        moreMenuTriggers.forEach(btn => btn.setAttribute('aria-expanded', 'false'));
      }

      function posicionarMenuMais_(gatilho) {
        if (!appMoreMenu || !gatilho) return;
        const margem = 10;
        const rect = gatilho.getBoundingClientRect();

        if (window.innerWidth <= 900) {
          const lateral = 12;
          appMoreMenu.style.width = `${Math.max(260, window.innerWidth - (lateral * 2))}px`;
          appMoreMenu.style.right = 'auto';
          appMoreMenu.style.left = `${lateral}px`;
          appMoreMenu.style.top = `${lateral}px`;
          appMoreMenu.style.maxHeight = `${Math.max(280, window.innerHeight - (lateral * 2))}px`;
          return;
        }

        appMoreMenu.style.maxHeight = '';
        const largura = Math.min(330, Math.max(240, window.innerWidth - (margem * 2)));
        appMoreMenu.style.width = `${largura}px`;
        appMoreMenu.style.right = 'auto';
        appMoreMenu.style.left = `${Math.min(Math.max(margem, rect.right - largura), window.innerWidth - largura - margem)}px`;

        const altura = appMoreMenu.getBoundingClientRect().height || 280;
        let topo = rect.bottom + 8;
        if (topo + altura > window.innerHeight - margem) topo = Math.max(margem, rect.top - altura - 8);
        appMoreMenu.style.top = `${topo}px`;
      }

      function alternarMenuMais_(gatilho) {
        if (!appMoreMenu) return;
        const vaiAbrir = appMoreMenu.hidden;
        if (!vaiAbrir) {
          fecharMenuMais_();
          return;
        }
        appMoreMenu.hidden = false;
        document.body.classList.add('more-menu-open');
        moreMenuTriggers.forEach(btn => btn.setAttribute('aria-expanded', btn === gatilho ? 'true' : 'false'));
        posicionarMenuMais_(gatilho || navMoreMenuBtn || dashboardMoreMenuBtn);
      }

      function preparacoesDoUsuarioLogado_() {
        const nome = String(authState.usuario?.nome || '').trim();
        if (!nome) return [];
        return preparacoesVistoria.filter(item => normalize(item?.vistoriadorResponsavel) === normalize(nome));
      }

      function atualizarIndicadorPreparacoesUsuario_() {
        const usuario = authState.usuario;
        const nome = String(usuario?.nome || '').trim();
        const minhas = preparacoesDoUsuarioLogado_();
        const quantidade = minhas.length;
        const criticas = minhas.filter(item => {
          const dias = diasAteProgramacao_(item?.dataPrevista);
          return dias != null && (dias < 0 || (dias === 0 && item?.tipoPreparacao === 'liberacao'));
        }).length;

        if (loggedUserBadge) {
          loggedUserBadge.hidden = !nome;
          loggedUserBadge.classList.toggle('has-prepared-alert', quantidade > 0);
          loggedUserBadge.classList.toggle('has-critical-program', criticas > 0);
          loggedUserBadge.setAttribute('role', quantidade > 0 ? 'button' : 'status');
          loggedUserBadge.setAttribute('tabindex', quantidade > 0 ? '0' : '-1');
          loggedUserBadge.setAttribute('aria-label', quantidade > 0
            ? `${nome}. ${quantidade} vistoria${quantidade === 1 ? '' : 's'} programada${quantidade === 1 ? '' : 's'} para você.`
            : nome);
          loggedUserBadge.innerHTML = nome
            ? `<span class="logged-user-name">${escapeHtml(nome)}</span>${quantidade > 0 ? `<span class="prepared-alert-badge" aria-hidden="true">${quantidade}</span>` : ''}`
            : '';
        }

        if (programmedQuickAddBtn) programmedQuickAddBtn.hidden = !usuarioPodeOperar_();

        if (preparedForUserNotice) {
          preparedForUserNotice.hidden = quantidade <= 0;
          preparedForUserNotice.textContent = quantidade > 0
            ? `${quantidade} vistoria${quantidade === 1 ? '' : 's'} programada${quantidade === 1 ? '' : 's'} para você${criticas > 0 ? ` • ${criticas} com atenção de prazo` : ''}`
            : '';
        }
      }

      function definirFiltroPreparacoes_(filtro) {
        const permitido = ['minhas','todas','fiscalizacao','liberacao','sugestoes'];
        filtroPreparacoes = permitido.includes(filtro) ? filtro : 'todas';
        document.querySelectorAll('[data-prepared-filter]').forEach(b => {
          b.classList.toggle('is-active', b.dataset.preparedFilter === filtroPreparacoes);
        });
        if (desktopPrepareInspectionBtn) {
          desktopPrepareInspectionBtn.hidden = filtroPreparacoes === 'sugestoes' && !usuarioPodeOperar_();
        }
        if (inspectionSuggestionsRefreshBtn) {
          inspectionSuggestionsRefreshBtn.hidden = filtroPreparacoes !== 'sugestoes';
        }
      }

      function abrirListaProgramadas_(preferirMinhas = true, filtroInicial = '') {
        const minhas = preparacoesDoUsuarioLogado_();
        if (filtroInicial === 'sugestoes') definirFiltroPreparacoes_('sugestoes');
        else definirFiltroPreparacoes_(preferirMinhas && minhas.length ? 'minhas' : 'todas');
        renderizarPreparacoesVistoria_();
        if (programmedListModal) programmedListModal.hidden = false;
        if (navigator.onLine) {
          if (filtroPreparacoes === 'sugestoes') {
            carregarSugestoesFiscalizacao_().catch(() => {});
          } else {
            carregarPreparacoesVistoria_().catch(() => {});
            carregarResumoSugestoesFiscalizacao_().catch(() => {});
          }
        }
      }

      function abrirSugestoesFiscalizacao_() {
        const cacheLocal = lerCacheSugestoesFiscalizacaoLocal_();
        if (cacheLocal) aplicarCacheSugestoesFiscalizacaoLocal_(cacheLocal);
        abrirListaProgramadas_(false, 'sugestoes');
      }

      function fecharListaProgramadas_() {
        if (programmedListModal) programmedListModal.hidden = true;
      }

      function abrirPreparacoesDoUsuario_() {
        if (!preparacoesDoUsuarioLogado_().length) return;
        abrirListaProgramadas_(true);
      }

      function atualizarUsuarioLogadoUi_() {
        const usuario = authState.usuario;
        aplicarPermissoesInterface_();
        if (loggedUserMenuText) {
          loggedUserMenuText.textContent = usuario
            ? `${usuario.nome} · Nº BM ${usuario.bm}`
            : 'Encerrar o acesso neste aparelho';
        }
        if (forgetSavedPinBtn) {
          const temSenhaSalva = Boolean(usuario?.id && perfilTemSenhaSalvaBm_(usuario.id));
          forgetSavedPinBtn.hidden = !temSenhaSalva;
        }
        atualizarIndicadorPreparacoesUsuario_();
        atualizarPoliticaLoginBm_();
      }

      function limparEstadoPinLogin_() {
        authPendingUserId = '';
        authPendingBm = '';
        if (authPinSetup) authPinSetup.hidden = true;
        if (authNewPinInput) authNewPinInput.value = '';
        if (authConfirmPinInput) authConfirmPinInput.value = '';
        if (authPinInput) authPinInput.value = '';
        if (authSavePasswordCheck) authSavePasswordCheck.checked = false;
        if (authBmInput) authBmInput.readOnly = false;
      }

      function mostrarTelaLoginBm_(mensagem = '') {
        prepararLoginAcessoAuxiliar_();
        if (!authGate) return;
        authGate.classList.add('show');
        authGate.setAttribute('aria-hidden', 'false');
        document.body.classList.add('auth-locked');
        if (authManualLogin) authManualLogin.hidden = false;
        if (authDeviceChoice) authDeviceChoice.hidden = true;
        if (authSubtitle) authSubtitle.textContent = mensagem || 'Informe seu Nº BM e sua senha de 6 dígitos.';
        if (authMessage) authMessage.textContent = '';
        if (authProfileChoice) authProfileChoice.hidden = true;
        if (authPinSetup) authPinSetup.hidden = true;
        atualizarPoliticaLoginBm_();
        setTimeout(() => (authBmInput?.readOnly ? authPinInput : authBmInput)?.focus(), 30);
      }

      function mostrarEscolhaUsuariosDispositivo_(mensagem = '') {
        prepararLoginAcessoAuxiliar_();
        const perfis = carregarPerfisConhecidosBm_();
        if (!authGate) return;
        authGate.classList.add('show');
        authGate.setAttribute('aria-hidden', 'false');
        document.body.classList.add('auth-locked');
        if (authManualLogin) authManualLogin.hidden = true;
        if (authDeviceChoice) authDeviceChoice.hidden = false;
        if (authSubtitle) authSubtitle.textContent = mensagem || 'Escolha seu usuário e informe sua senha.';
        atualizarPoliticaLoginBm_();
        if (authDeviceProfileList) {
          authDeviceProfileList.innerHTML = perfis.map(item => `
            <button type="button" class="auth-device-profile-btn" data-device-user-id="${escapeHtml(item.usuario.id)}">
              <strong>${escapeHtml(item.usuario.nome)}</strong>
              <span>Nº BM ${escapeHtml(item.usuario.bm)}${item.savedPinCipher ? ' · senha salva' : ''}</span>
            </button>
          `).join('');
        }
      }

      function ocultarTelaLoginBm_() {
        if (!authGate) return;
        const acessoAuxiliar = Boolean(idAcessoAuxiliarNotificacoesUrl_());
        if (acessoAuxiliar) mostrarSplashAcessoAuxiliar_('Abrindo notificações da vistoria...');
        authGate.classList.remove('show');
        authGate.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('auth-locked');
        if (acessoAuxiliar) document.body.classList.remove('gpv-aux-auth-visible');
        if (authMessage) authMessage.textContent = '';
        if (authProfileChoice) authProfileChoice.hidden = true;
        if (authDeviceChoice) authDeviceChoice.hidden = true;
        if (authManualLogin) authManualLogin.hidden = false;
        if (authPinSetup) authPinSetup.hidden = true;
      }

      const MENSAGENS_MOTIVACIONAIS_DIARIAS_ = [
        'Cada vistoria bem realizada contribui para uma cidade mais segura.',
        'A prevenção começa com atenção aos detalhes. Bom serviço!',
        'Segurança se constrói com técnica, responsabilidade e constância.',
        'Seu trabalho de hoje ajuda a proteger vidas, patrimônios e histórias.',
        'Excelência no serviço é fazer bem feito, mesmo nos detalhes que poucos veem.',
        'Uma fiscalização cuidadosa hoje pode evitar uma emergência amanhã.',
        'Trabalhe com atenção, equilíbrio e segurança. Bom serviço!',
        'Cada orientação correta fortalece a prevenção contra incêndio e pânico.',
        'Profissionalismo e prevenção caminham juntos em cada vistoria.',
        'Seu compromisso com a prevenção faz diferença para toda a comunidade.',
        'Comece o dia com foco: observar, orientar, registrar e prevenir.',
        'A segurança de muitos também depende da qualidade de cada vistoria.',
        'Consistência no trabalho transforma prevenção em proteção real.',
        'Mais do que conferir medidas, cada vistoria fortalece uma cultura de segurança.',
        'Atenção técnica e boa orientação fazem parte de um serviço de excelência.',
        'Faça de cada vistoria uma oportunidade de fortalecer a prevenção.',
        'Segurança é resultado de preparo, responsabilidade e ação correta.',
        'O bom serviço aparece na precisão dos registros e na qualidade das decisões.',
        'Prevenir exige olhar atento, conhecimento técnico e compromisso.',
        'Que o serviço de hoje seja produtivo, seguro e bem executado.',
        'Cada processo bem conduzido é mais um passo para uma Viçosa mais segura.',
        'Responsabilidade no presente reduz riscos no futuro.',
        'Sua atenção durante a vistoria é parte essencial da proteção da comunidade.',
        'Técnica, clareza e responsabilidade: uma boa base para o serviço de hoje.',
        'O trabalho preventivo nem sempre aparece, mas seus resultados protegem vidas.',
        'Bom serviço! Mantenha o foco na segurança e na qualidade de cada registro.',
        'A prevenção ganha força quando cada vistoria é conduzida com excelência.',
        'Um dia produtivo começa com organização, atenção e propósito.',
        'Cada medida conferida corretamente aproxima a edificação de uma condição mais segura.',
        'Seu trabalho no GPV transforma conhecimento técnico em prevenção efetiva.'
      ];

      function dataLocalChaveMotivacional_() {
        const agora = new Date();
        const y = agora.getFullYear();
        const m = String(agora.getMonth() + 1).padStart(2, '0');
        const d = String(agora.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }

      function chaveMotivacionalUsuario_() {
        const id = String(authState.usuario?.id || authState.usuario?.bm || 'usuario').replace(/[^A-Za-z0-9_-]/g, '');
        return `gpv_mensagem_motivacional_${id}`;
      }

      function deveMostrarMotivacionalHoje_() {
        if (!authState.usuario?.id && !authState.usuario?.bm) return false;
        try {
          return localStorage.getItem(chaveMotivacionalUsuario_()) !== dataLocalChaveMotivacional_();
        } catch (_) {
          return true;
        }
      }

      function marcarMotivacionalHoje_() {
        try { localStorage.setItem(chaveMotivacionalUsuario_(), dataLocalChaveMotivacional_()); } catch (_) {}
      }

      function indiceMensagemMotivacional_() {
        const base = `${dataLocalChaveMotivacional_()}|${authState.usuario?.id || authState.usuario?.bm || ''}`;
        let hash = 0;
        for (let i = 0; i < base.length; i += 1) hash = ((hash << 5) - hash + base.charCodeAt(i)) | 0;
        return Math.abs(hash) % MENSAGENS_MOTIVACIONAIS_DIARIAS_.length;
      }

      function garantirOverlayMotivacional_() {
        let overlay = document.getElementById('dailyMotivationalOverlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'dailyMotivationalOverlay';
        overlay.className = 'daily-motivational-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
          <div class="daily-motivational-card" role="status" aria-live="polite">
            <div class="daily-motivational-mark" aria-hidden="true">✓</div>
            <span class="daily-motivational-kicker">GPV — 3º Pelotão Viçosa</span>
            <h2 id="dailyMotivationalGreeting">Bom serviço!</h2>
            <p id="dailyMotivationalMessage"></p>
            <div class="daily-motivational-loading" aria-hidden="true"><span></span></div>
            <small>Carregando seu ambiente de trabalho...</small>
          </div>`;
        document.body.appendChild(overlay);
        return overlay;
      }

      async function carregarInicialComMotivacional_(opcoes = {}) {
        if (idAcessoAuxiliarNotificacoesUrl_()) {
          await carregarAcessoAuxiliarRapido_();
          return;
        }
        const forcar = Boolean(opcoes.forcar);
        const mostrar = forcar || deveMostrarMotivacionalHoje_();
        if (!mostrar) {
          // V23.9.47: sem mensagem diária pendente, carrega o ambiente diretamente.
          // A versão anterior chamava esta própria função novamente, prolongando o estado de carregamento.
          await loadInitialData();
          return;
        }

        const overlay = garantirOverlayMotivacional_();
        const nomeCompleto = String(authState.usuario?.nome || '').trim();
        const primeiroNome = nomeCompleto || 'militar';
        const greeting = overlay.querySelector('#dailyMotivationalGreeting');
        const message = overlay.querySelector('#dailyMotivationalMessage');
        if (greeting) greeting.textContent = `Bom serviço, ${primeiroNome}!`;
        if (message) message.textContent = MENSAGENS_MOTIVACIONAIS_DIARIAS_[indiceMensagemMotivacional_()];

        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('daily-motivational-open');
        marcarMotivacionalHoje_();

        const inicio = Date.now();
        let erroCarga = null;
        try {
          await loadInitialData();
        } catch (erro) {
          erroCarga = erro;
        }
        const restante = Math.max(0, 1800 - (Date.now() - inicio));
        if (restante) await new Promise(resolve => setTimeout(resolve, restante));

        overlay.classList.add('leaving');
        await new Promise(resolve => setTimeout(resolve, 220));
        overlay.classList.remove('show', 'leaving');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('daily-motivational-open');
        if (erroCarga) throw erroCarga;
      }

      function normalizarBmCliente_(valor) {
        return String(valor || '').replace(/\D/g, '').slice(0, 7);
      }

      function prepararLoginPerfilBm_(perfil) {
        if (!perfil?.usuario) return;
        authPendingUserId = String(perfil.usuario.id || '');
        authPendingBm = normalizarBmCliente_(perfil.usuario.bm || '');
        if (authBmInput) { authBmInput.value = authPendingBm; authBmInput.readOnly = true; }
        if (authPinInput) authPinInput.value = '';
        if (authSavePasswordCheck) authSavePasswordCheck.checked = Boolean(perfil.savedPinCipher) && !dispositivoCompartilhadoBm_();
        mostrarTelaLoginBm_(`Olá, ${perfil.usuario.nome}. Informe sua senha de 6 dígitos.`);
        if (authBmInput) authBmInput.readOnly = true;
        setTimeout(() => authPinInput?.focus(), 30);
      }

      async function concluirLoginBm_(bm, userId = '', pin = '', newPin = '') {
        const numero = normalizarBmCliente_(bm);
        const senha = normalizarPinCliente_(pin);
        const novaSenha = normalizarPinCliente_(newPin);
        const alvoId = String(userId || authPendingUserId || '').trim();
        if (!/^\d{7}$/.test(numero)) {
          if (authMessage) authMessage.textContent = 'Informe um Nº BM com 7 dígitos.';
          return false;
        }

        if (!navigator.onLine) {
          const perfis = carregarPerfisConhecidosBm_().filter(p => String(p.usuario.bm || '') === numero);
          let perfil = alvoId ? perfis.find(p => String(p.usuario.id) === alvoId) : (perfis.length === 1 ? perfis[0] : null);
          if (!perfil) {
            if (authMessage) authMessage.textContent = perfis.length > 1 ? 'Escolha seu usuário antes de entrar offline.' : 'Este usuário ainda não possui acesso offline validado neste aparelho.';
            return false;
          }
          if (!/^\d{6}$/.test(senha)) {
            if (authMessage) authMessage.textContent = 'Informe sua senha de 6 dígitos.';
            return false;
          }
          const ok = await validarPinOfflineBm_(perfil, senha);
          if (!ok) {
            if (authMessage) authMessage.textContent = perfil.offlinePinVerifier ? 'Senha incorreta.' : 'Conecte-se à internet uma vez para habilitar o acesso offline com senha.';
            return false;
          }
          if (sessaoTokenExpiradaBm_(perfil.sessionToken)) {
            if (authMessage) authMessage.textContent = 'A sessão deste aparelho expirou. Conecte-se à internet para renovar o acesso.';
            return false;
          }
          if (dispositivoCompartilhadoBm_() && !tokenSessaoLimitada10hBm_(perfil.sessionToken)) {
            if (authMessage) authMessage.textContent = 'Este aparelho é compartilhado. Conecte-se à internet uma vez para renovar a sessão segura de 10 horas.';
            return false;
          }
          salvarSessaoLocalBm_(perfil.usuario, perfil.sessionToken);
          aplicarPermissoesInterface_();
          ocultarTelaLoginBm_();
          if (usuarioEmTreinamento_()) await mostrarAvisoAcessoGeral_('login');
          return true;
        }

        if (authEnterBtn) authEnterBtn.disabled = true;
        if (authMessage) authMessage.textContent = novaSenha ? 'Criando senha...' : 'Verificando acesso...';
        try {
          const sessaoLimitada10h = sessaoDeveSerLimitada10hBm_(numero, alvoId);
          if (sessaoLimitada10h && dispositivoCompartilhadoPrevistoBm_(numero, alvoId)) marcarDispositivoCompartilhadoBm_();
          const result = await authRequest_({
            bm: numero,
            userId: alvoId,
            pin: senha,
            newPin: novaSenha,
            sessionPolicy: sessaoLimitada10h ? 'limited_10h' : 'trusted_device'
          }, 30000);
          if (result?.requiresSelection) {
            authPendingBm = numero;
            if (authProfileChoice) authProfileChoice.hidden = false;
            if (authProfileList) {
              authProfileList.innerHTML = (result.usuarios || []).map(u => `
                <button type="button" class="auth-profile-btn" data-auth-user-id="${escapeHtml(u.id)}">
                  <strong>${escapeHtml(u.nome)}</strong><span>Nº BM ${escapeHtml(u.bm)}${u.provisorio ? ' · provisório' : ''}</span>
                </button>
              `).join('');
            }
            if (authMessage) authMessage.textContent = 'Escolha seu nome e depois informe sua senha.';
            return false;
          }
          if (result?.requiresPinSetup) {
            authPendingUserId = String(result.usuario?.id || alvoId || '');
            authPendingBm = numero;
            if (authPinSetup) authPinSetup.hidden = false;
            if (authProfileChoice) authProfileChoice.hidden = true;
            if (authBmInput) authBmInput.readOnly = true;
            if (authMessage) authMessage.textContent = 'Primeiro acesso com senha: crie uma senha de 6 dígitos.';
            setTimeout(() => authNewPinInput?.focus(), 30);
            return false;
          }
          if (!result?.autenticado || !result?.usuario || !result?.sessionToken) throw new Error('Não foi possível concluir o acesso.');
          salvarSessaoLocalBm_(result.usuario, result.sessionToken);
          aplicarPermissoesInterface_();
          await registrarCredencialOfflineBm_(result.usuario, novaSenha || senha);
          const senhaEfetiva = novaSenha || senha;
          if (authSavePasswordCheck?.checked && !dispositivoCompartilhadoBm_() && /^\d{6}$/.test(senhaEfetiva)) {
            await salvarSenhaLocalPerfilBm_(result.usuario.id, senhaEfetiva);
          } else if (result.usuario?.id && perfilTemSenhaSalvaBm_(result.usuario.id)) {
            apagarSenhaLocalPerfilBm_(result.usuario.id);
          }
          ocultarTelaLoginBm_();
          if (usuarioEmTreinamento_()) await mostrarAvisoAcessoGeral_('login');
          if (result.usuario.provisorio) {
            setTimeout(() => avisarGpv_('Seu Nº BM está cadastrado provisoriamente como 1234567. Atualize-o em Mais → Gerenciar usuários quando souber o número correto.', 'Nº BM provisório', { tom: 'warning' }), 250);
          }
          limparEstadoPinLogin_();
          return true;
        } catch (error) {
          if (authMessage) authMessage.textContent = error?.message || 'Não foi possível entrar.';
          return false;
        } finally {
          if (authEnterBtn) authEnterBtn.disabled = false;
        }
      }

      async function selecionarPerfilConhecidoBm_(userId) {
        const perfil = carregarPerfisConhecidosBm_().find(item => String(item.usuario.id) === String(userId || ''));
        if (!perfil) {
          mostrarEscolhaUsuariosDispositivo_('O usuário salvo neste aparelho não foi localizado.');
          return false;
        }
        if (perfil.savedPinCipher && !dispositivoCompartilhadoBm_()) {
          const senhaSalva = await descriptografarSenhaLocalBm_(perfil.savedPinCipher);
          if (/^\d{6}$/.test(senhaSalva)) {
            authPendingUserId = String(perfil.usuario.id || '');
            authPendingBm = normalizarBmCliente_(perfil.usuario.bm || '');
            if (authSavePasswordCheck) authSavePasswordCheck.checked = true;
            if (authMessage) authMessage.textContent = `Entrando como ${perfil.usuario.nome}...`;
            const entrou = await concluirLoginBm_(authPendingBm, authPendingUserId, senhaSalva);
            if (entrou) await carregarInicialComMotivacional_();
            return entrou;
          }
          apagarSenhaLocalPerfilBm_(perfil.usuario.id);
        }
        prepararLoginPerfilBm_(perfil);
        return false;
      }

      async function inicializarAutenticacaoBm_() {
        const sessao = carregarSessaoLocalBm_();
        const perfis = carregarPerfisConhecidosBm_();
        const acessoAuxiliarId = idAcessoAuxiliarNotificacoesUrl_();

        if (acessoAuxiliarId) {
          mostrarSplashAcessoAuxiliar_('Abrindo notificações da vistoria...');
        } else {
          loadingOverlay.classList.remove('show');
        }

        // Sessões sem senha salva expiram em 10 horas. Em aparelho compartilhado,
        // toda sessão também é limitada a 10 horas, mesmo que tenha existido uma senha salva antes.
        const sessaoCompartilhadaInvalida = Boolean(
          sessao?.sessionToken && dispositivoCompartilhadoBm_() && !tokenSessaoLimitada10hBm_(sessao.sessionToken)
        );
        if (sessaoCompartilhadaInvalida) {
          limparSessaoLocalBm_();
        }
        if (!sessaoCompartilhadaInvalida && sessao?.usuario?.id && String(sessao.sessionToken || '').trim() && !sessaoTokenExpiradaBm_(sessao.sessionToken)) {
          ocultarTelaLoginBm_();
          atualizarUsuarioLogadoUi_();
          aplicarPermissoesInterface_();
          if (acessoAuxiliarId) await carregarAcessoAuxiliarRapido_();
          else await loadInitialData();
          return;
        }

        // Sem sessão ativa, mostra o login antes de retirar o splash.
        if (perfis.length) mostrarEscolhaUsuariosDispositivo_();
        else mostrarTelaLoginBm_();
      }

      function resetarFormularioUsuario_() {
        if (userManagerId) userManagerId.value = '';
        if (userManagerName) userManagerName.value = '';
        if (userManagerBm) userManagerBm.value = '';
        if (userManagerProfile) userManagerProfile.value = 'GERAL';
        if (userManagerFormTitle) userManagerFormTitle.textContent = 'Adicionar usuário';
        if (userManagerSaveBtn) userManagerSaveBtn.textContent = 'Adicionar usuário';
        if (userManagerCancelBtn) userManagerCancelBtn.hidden = true;
        if (userManagerMessage) userManagerMessage.textContent = '';
      }

      function renderizarListaUsuarios_(usuarios = []) {
        if (!userManagerList) return;
        const atualId = String(authState.usuario?.id || '');
        userManagerList.innerHTML = usuarios.map(u => {
          const ehAtual = String(u.id || '') === atualId;
          return `<article class="user-manager-item${u.provisorio ? ' provisional' : ''}">
            <div class="user-manager-avatar" aria-hidden="true">${escapeHtml(String(u.nome || '?').charAt(0).toUpperCase())}</div>
            <div class="user-manager-item-copy">
              <strong>${escapeHtml(u.nome)}</strong>
              <span>Nº BM ${escapeHtml(u.bm)}${u.provisorio ? ' · provisório' : ''}${ehAtual ? ' · conectado' : ''} · ${u.senhaConfigurada ? 'senha ativa' : 'senha a criar'} · ${escapeHtml(String(u.perfil || 'GPV').toUpperCase())}</span>
            </div>
            <div class="user-manager-item-actions">
              <button type="button" class="user-edit-btn" data-user-edit="${escapeHtml(u.id)}" data-user-name="${escapeHtml(u.nome)}" data-user-bm="${escapeHtml(u.bm)}" data-user-profile="${escapeHtml(String(u.perfil || 'GPV').toUpperCase())}">Editar</button>
              <button type="button" class="user-reset-pin-btn" data-user-reset-pin="${escapeHtml(u.id)}" data-user-name="${escapeHtml(u.nome)}">Redefinir senha</button>
              <button type="button" class="user-delete-btn" data-user-delete="${escapeHtml(u.id)}" data-user-name="${escapeHtml(u.nome)}" ${ehAtual ? 'disabled title="Você está conectado com este usuário"' : ''}>Excluir</button>
            </div>
          </article>`;
        }).join('');
      }

      async function abrirGerenciadorUsuarios_() {
        fecharMenuMais_();
        if (!usuarioPodeOperar_()) return;
        if (!navigator.onLine) {
          avisarGpv_('Conecte o aparelho à internet para gerenciar usuários.', 'Sem internet', { tom: 'warning' });
          return;
        }
        if (userManagerModal) userManagerModal.hidden = false;
        document.body.classList.add('user-manager-open');
        resetarFormularioUsuario_();
        if (userManagerCurrent) userManagerCurrent.textContent = authState.usuario
          ? `Conectado como ${authState.usuario.nome} · Nº BM ${authState.usuario.bm}`
          : '';
        if (userManagerList) userManagerList.innerHTML = '<div class="user-manager-loading">Carregando usuários...</div>';
        try {
          const result = await apiRequest('users', {}, 30000);
          renderizarListaUsuarios_(result?.usuarios || []);
        } catch (error) {
          if (userManagerMessage) userManagerMessage.textContent = error?.message || 'Não foi possível carregar os usuários.';
        }
      }

      function fecharGerenciadorUsuarios_() {
        if (userManagerModal) userManagerModal.hidden = true;
        document.body.classList.remove('user-manager-open');
        resetarFormularioUsuario_();
      }

      async function salvarUsuarioGerenciado_(event) {
        event?.preventDefault();
        if (!navigator.onLine) return;
        const id = String(userManagerId?.value || '').trim();
        const nome = String(userManagerName?.value || '').trim();
        const bm = normalizarBmCliente_(userManagerBm?.value || '');
        const perfil = String(userManagerProfile?.value || 'GERAL').toUpperCase() === 'GPV' ? 'GPV' : 'GERAL';
        if (userManagerMessage) userManagerMessage.textContent = '';
        if (!nome || !/^\d{7}$/.test(bm)) {
          if (userManagerMessage) userManagerMessage.textContent = 'Informe nome e Nº BM com 7 dígitos.';
          return;
        }
        if (userManagerSaveBtn) userManagerSaveBtn.disabled = true;
        try {
          const action = id ? 'user_update' : 'user_add';
          const result = await apiRequest(action, { userId: id, nome, bm, perfil }, 30000);
          if (result?.sessionToken && result?.usuarioAtual) {
            salvarSessaoLocalBm_(result.usuarioAtual, result.sessionToken);
            aplicarPermissoesInterface_();
            if (!usuarioPodeOperar_()) {
              fecharGerenciadorUsuarios_();
              mostrarVistaPlanilha_();
              return;
            }
            if (userManagerCurrent) userManagerCurrent.textContent = `Conectado como ${result.usuarioAtual.nome} · Nº BM ${result.usuarioAtual.bm}`;
          }
          renderizarListaUsuarios_(result?.usuarios || []);
          resetarFormularioUsuario_();
          if (userManagerMessage) userManagerMessage.textContent = id ? 'Usuário atualizado.' : 'Usuário adicionado.';
        } catch (error) {
          if (userManagerMessage) userManagerMessage.textContent = error?.message || 'Não foi possível salvar o usuário.';
        } finally {
          if (userManagerSaveBtn) userManagerSaveBtn.disabled = false;
        }
      }

      async function excluirUsuarioGerenciado_(id, nome) {
        if (!id) return;
        if (!(await confirmarGpv_(
          `O usuário ${nome || 'selecionado'} será removido da lista de acesso.`,
          'Excluir usuário?',
          { tom: 'danger', rotuloConfirmar: 'Excluir' }
        ))) return;
        try {
          const result = await apiRequest('user_delete', { userId: id }, 30000);
          renderizarListaUsuarios_(result?.usuarios || []);
          if (userManagerMessage) userManagerMessage.textContent = 'Usuário excluído.';
        } catch (error) {
          if (userManagerMessage) userManagerMessage.textContent = error?.message || 'Não foi possível excluir o usuário.';
        }
      }

      function abrirAlterarSenha_() {
        fecharMenuMais_();
        if (!navigator.onLine) { avisarGpv_('Conecte o aparelho à internet para alterar a senha.', 'Sem internet', { tom: 'warning' }); return; }
        if (changePinMessage) changePinMessage.textContent = '';
        if (changePinCurrent) changePinCurrent.value = '';
        if (changePinNew) changePinNew.value = '';
        if (changePinConfirm) changePinConfirm.value = '';
        if (changePinModal) changePinModal.hidden = false;
        document.body.classList.add('user-manager-open');
        setTimeout(() => changePinCurrent?.focus(), 30);
      }

      function fecharAlterarSenha_() {
        if (changePinModal) changePinModal.hidden = true;
        document.body.classList.remove('user-manager-open');
      }

      async function salvarAlteracaoSenha_(event) {
        event?.preventDefault();
        const atual = normalizarPinCliente_(changePinCurrent?.value || '');
        const nova = normalizarPinCliente_(changePinNew?.value || '');
        const confirma = normalizarPinCliente_(changePinConfirm?.value || '');
        if (!/^\d{6}$/.test(atual) || !/^\d{6}$/.test(nova)) {
          if (changePinMessage) changePinMessage.textContent = 'As senhas devem ter 6 dígitos numéricos.';
          return;
        }
        if (nova !== confirma) {
          if (changePinMessage) changePinMessage.textContent = 'A confirmação da nova senha não confere.';
          return;
        }
        if (atual === nova) {
          if (changePinMessage) changePinMessage.textContent = 'Escolha uma nova senha diferente da atual.';
          return;
        }
        if (changePinSaveBtn) changePinSaveBtn.disabled = true;
        try {
          const result = await apiRequest('user_update', { mode: 'pin_change', currentPin: atual, newPin: nova }, 30000);
          if (result?.sessionToken && result?.usuarioAtual) {
            salvarSessaoLocalBm_(result.usuarioAtual, result.sessionToken);
            await registrarCredencialOfflineBm_(result.usuarioAtual, nova);
          }
          if (authState.usuario?.id) apagarSenhaLocalPerfilBm_(authState.usuario.id);
          if (changePinMessage) changePinMessage.textContent = 'Senha alterada com sucesso. Por segurança, a senha salva neste aparelho foi removida.';
          setTimeout(fecharAlterarSenha_, 600);
        } catch (error) {
          if (changePinMessage) changePinMessage.textContent = error?.message || 'Não foi possível alterar a senha.';
        } finally {
          if (changePinSaveBtn) changePinSaveBtn.disabled = false;
        }
      }

      async function redefinirSenhaUsuario_(id, nome) {
        if (!id) return;
        if (!(await confirmarGpv_(
          `No próximo acesso, ${nome || 'o usuário'} deverá criar uma nova senha de 6 dígitos.`,
          'Redefinir senha?',
          { rotuloConfirmar: 'Redefinir senha' }
        ))) return;
        try {
          const result = await apiRequest('user_update', { mode: 'pin_reset', userId: id }, 30000);
          invalidarCredenciaisLocaisPerfilBm_(id);
          renderizarListaUsuarios_(result?.usuarios || []);
          if (userManagerMessage) userManagerMessage.textContent = 'Senha redefinida. O usuário criará uma nova senha no próximo acesso.';
        } catch (error) {
          if (userManagerMessage) userManagerMessage.textContent = error?.message || 'Não foi possível redefinir a senha.';
        }
      }

      async function esquecerSenhaSalvaAtualBm_() {
        fecharMenuMais_();
        const usuario = authState.usuario;
        if (!usuario?.id || !perfilTemSenhaSalvaBm_(usuario.id)) return;
        if (!(await confirmarGpv_(
          `A senha salva de ${usuario.nome} será removida deste aparelho. O Nº BM continuará lembrado.`,
          'Esquecer senha salva?',
          { rotuloConfirmar: 'Esquecer senha' }
        ))) return;
        apagarSenhaLocalPerfilBm_(usuario.id);
        await avisarGpv_('O usuário continuará aparecendo na lista de acesso.', 'Senha removida', { tom: 'success' });
      }

      function prepararSaidaUsuarioBm_() {
        // Preserva o rascunho do usuário atual antes de encerrar a sessão.
        let rascunhoAtual = '';
        const chaveRascunho = draftKeyAtual_();
        try {
          saveDraft();
          rascunhoAtual = String(localStorage.getItem(chaveRascunho) || '');
        } catch (e) {}
        resetForm();
        try { if (rascunhoAtual) localStorage.setItem(chaveRascunho, rascunhoAtual); } catch (e) {}

        // Encerra somente a sessão. Perfis conhecidos e senha salva, quando
        // autorizada pelo usuário, permanecem no aparelho.
        limparSessaoLocalBm_();
        limparEstadoPinLogin_();
      }

      async function trocarUsuarioBm_() {
        fecharMenuMais_();
        if (!(await confirmarGpv_(
          'A sessão atual será encerrada e você poderá escolher outro usuário deste aparelho.',
          'Trocar usuário?',
          { rotuloConfirmar: 'Trocar usuário' }
        ))) return;
        prepararSaidaUsuarioBm_();
        const perfis = carregarPerfisConhecidosBm_();
        if (perfis.length) mostrarEscolhaUsuariosDispositivo_('Escolha o usuário que vai utilizar o aparelho.');
        else mostrarTelaLoginBm_();
      }

      async function sairUsuarioBm_() {
        fecharMenuMais_();
        if (!(await confirmarGpv_(
          'Sua sessão será encerrada neste aparelho. O Nº BM continuará lembrado.',
          'Sair do aplicativo?',
          { tom: 'danger', rotuloConfirmar: 'Sair' }
        ))) return;
        const usuarioAnterior = authState.usuario ? { ...authState.usuario } : null;
        prepararSaidaUsuarioBm_();

        // Ao sair, mantém o Nº BM lembrado. Se houver apenas um perfil conhecido,
        // abre diretamente a tela de senha desse perfil; com vários usuários,
        // volta para a escolha de usuário. A senha salva não é apagada.
        const perfis = carregarPerfisConhecidosBm_();
        const perfilAnterior = usuarioAnterior?.id
          ? perfis.find(p => String(p.usuario?.id || '') === String(usuarioAnterior.id))
          : null;
        if (perfis.length === 1 && perfilAnterior) {
          prepararLoginPerfilBm_(perfilAnterior);
          if (authMessage) authMessage.textContent = 'Sessão encerrada. Informe sua senha para entrar novamente.';
          return;
        }
        if (perfis.length) {
          mostrarEscolhaUsuariosDispositivo_('Sessão encerrada. Escolha um usuário para entrar novamente.');
          return;
        }
        mostrarTelaLoginBm_('Sessão encerrada.');
      }

      function renderizarTutorial_() {
        const total = tutorialStepEls.length || 1;
        tutorialStepIndex = Math.min(Math.max(0, tutorialStepIndex), total - 1);
        tutorialStepEls.forEach((el, i) => el.classList.toggle('active', i === tutorialStepIndex));
        if (tutorialStepCounter) tutorialStepCounter.textContent = `Etapa ${tutorialStepIndex + 1} de ${total}`;
        if (tutorialProgressBar) tutorialProgressBar.style.width = `${((tutorialStepIndex + 1) / total) * 100}%`;
        if (tutorialPrevBtn) tutorialPrevBtn.disabled = tutorialStepIndex === 0;
        if (tutorialNextBtn) tutorialNextBtn.textContent = tutorialStepIndex === total - 1 ? 'Começar a usar' : 'Próximo';
      }

      function abrirTutorial_() {
        fecharMenuMais_();
        tutorialStepIndex = 0;
        renderizarTutorial_();
        if (tutorialModal) tutorialModal.hidden = false;
        document.body.classList.add('tutorial-open');
        setTimeout(() => tutorialCloseBtn?.focus(), 0);
      }

      function fecharTutorial_() {
        if (tutorialModal) tutorialModal.hidden = true;
        document.body.classList.remove('tutorial-open');
      }

      async function atualizarAplicativo_() {
        fecharMenuMais_();
        if (!navigator.onLine) {
          avisarGpv_('Conecte o aparelho à internet para buscar a versão mais recente do aplicativo.', 'Sem internet', { tom: 'warning' });
          return;
        }

        appStatus.textContent = 'Buscando a versão mais recente do aplicativo...';
        if (updateAppBtn) updateAppBtn.disabled = true;

        try {
          if ('serviceWorker' in navigator) {
            const registros = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registros.map(registro => registro.update().catch(() => null)));
          }
          if ('caches' in window) {
            const chaves = await caches.keys();
            await Promise.all(
              chaves
                .filter(chave => String(chave).startsWith('gpv-vistorias-pwa-'))
                .map(chave => caches.delete(chave))
            );
          }
        } catch (erro) {
          console.log('Atualização manual do app:', erro && erro.message ? erro.message : erro);
        }

        const url = new URL(window.location.href);
        url.searchParams.set('atualizar', Date.now().toString());
        window.location.replace(url.toString());
      }


      function renderizarSobreSistema_(statusServidor = null) {
        if (!aboutSystemGrid) return;
        const pendentes = obterPendentes().length;
        const itens = [
          ['Versão do app', `V${APP_VERSION}`],
          ['Usuário', authState.usuario?.nome || 'Não identificado'],
          ['Aparelho', nomeDispositivo_() || 'Não identificado'],
          ['Conexão', navigator.onLine ? 'Online' : 'Offline'],
          ['Sincronização', pendentes ? `${pendentes} pendente${pendentes === 1 ? '' : 's'}` : 'Tudo sincronizado'],
          ['Servidor', statusServidor ? 'Disponível' : (navigator.onLine ? 'Verificando...' : 'Indisponível offline')],
          ['Auditoria', statusServidor?.auditoria ? 'Ativa' : (statusServidor ? 'Não confirmada' : '—')],
          ['Backup automático', statusServidor?.triggerBackup ? 'Ativo • diário' : (statusServidor ? 'Não confirmado' : '—')],
          ['Último backup', statusServidor?.ultimoBackup || 'Ainda não informado'],
          ['Retenção de backups', statusServidor?.retencaoBackups ? `${statusServidor.retencaoBackups} cópias` : '—']
        ];
        aboutSystemGrid.innerHTML = itens.map(([rotulo, valor]) =>
          `<div class="about-item"><span>${escapeHtml(rotulo)}</span><strong>${escapeHtml(valor)}</strong></div>`
        ).join('');
        if (aboutSystemNote) {
          aboutSystemNote.textContent = statusServidor?.aviso
            ? `Atenção administrativa: ${statusServidor.aviso}`
            : 'Os tokens, chaves e segredos do sistema não são exibidos nesta tela.';
        }
      }

      function abrirLinksUteis_() {
        fecharMenuMais_();
        if (usefulLinksModal) usefulLinksModal.hidden = false;
        document.body.classList.add('useful-links-open');
        setTimeout(() => usefulLinksCloseBtn?.focus(), 0);
      }

      function fecharLinksUteis_() {
        if (usefulLinksModal) usefulLinksModal.hidden = true;
        document.body.classList.remove('useful-links-open');
      }

      async function abrirSobreSistema_() {
        fecharMenuMais_();
        if (!aboutSystemModal) return;
        renderizarSobreSistema_(null);
        aboutSystemModal.hidden = false;
        document.body.classList.add('about-open');
        if (!navigator.onLine) return;
        try {
          const status = await apiRequest('config', { consulta: 'sistema_status' }, 35000);
          renderizarSobreSistema_(status || {});
        } catch (erro) {
          if (aboutSystemNote) aboutSystemNote.textContent = 'Não foi possível consultar o status administrativo agora. O aplicativo continua disponível.';
        }
      }

      function fecharSobreSistema_() {
        if (!aboutSystemModal) return;
        aboutSystemModal.hidden = true;
        document.body.classList.remove('about-open');
      }

      async function definirNomeDispositivo_() {
        fecharMenuMais_();
        const atual = nomeDispositivo_();
        const resposta = await solicitarTextoGpv_(
          'Use um nome curto para reconhecer este aparelho nos registros de auditoria.',
          'Identificar aparelho',
          {
            valorInicial: atual,
            placeholder: 'Ex.: Tablet GPV 01',
            maxLength: 60,
            rotuloConfirmar: 'Salvar nome'
          }
        );
        if (resposta == null) return;
        const salvo = salvarNomeDispositivo_(resposta);
        appStatus.textContent = salvo
          ? `Aparelho identificado como “${salvo}”.`
          : 'Identificação do aparelho removida.';
      }

      function aplicarConfig(data) {
        appConfig = data || DEFAULT_CONFIG;
        populateOptions(appConfig.opcoes || {});
        atualizarLinkPlanilha_(appConfig?.planilhaUrl || '');
        if (!value('enderecoCorrespondencia')) document.getElementById('enderecoCorrespondencia').value = appConfig?.padroes?.enderecoCorrespondencia || 'O Mesmo';
      }


      function dataHojeIso_() {
        const d = new Date();
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
      }

      function formatarDataPreparacao_(valor) {
        const v = String(valor || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v || 'Sem data';
        const [a,m,d] = v.split('-');
        return `${d}/${m}/${a}`;
      }

      function atualizarCamposPreparacaoPorTipo_() {
        const tipoSelecionado = String(prepareTipo?.value || '');
        const liberacao = tipoSelecionado === 'liberacao';
        const evento = ehEventoDeclaratorioPreparacao_();
        const pscipWrap = document.getElementById('preparePscipWrap');
        const eventoWrap = document.getElementById('prepareEventoDeclaracaoWrap');
        const demanda = document.getElementById('prepareDemanda');
        const pscip = document.getElementById('preparePscip');
        const declaracao = document.getElementById('prepareEventoDeclaracaoNumero');

        if (pscipWrap) {
          pscipWrap.hidden = evento;
          pscipWrap.classList.toggle('is-required-prep', liberacao && !evento);
        }
        if (eventoWrap) eventoWrap.hidden = !evento;
        atualizarCampoRenovacaoAvcbPreparacao_();
        const dataLabel = document.getElementById('prepareDataLabel');
        if (dataLabel) dataLabel.classList.toggle('required', liberacao);
        const dataHint = document.getElementById('prepareDataHint');
        if (dataHint) dataHint.hidden = !liberacao;

        if (liberacao && demanda && !String(demanda.value || '').trim()) demanda.value = 'Liberação';
        if (evento) {
          if (pscip) pscip.value = '';
        } else {
          if (pscip && !String(pscip.value || '').trim()) pscip.value = 'PRJ';
          if (declaracao && normalize(demanda?.value || '') !== normalize('Eventos declaratórios')) declaracao.value = '';
        }
        if (prepareDwgWrap) prepareDwgWrap.hidden = !liberacao;
      }

      function limparFormularioPreparacao_() {
        preparacaoEditandoId = '';
        ['prepareCnpj','prepareData','preparePf','prepareNomeFantasia','prepareRazaoSocial','prepareArea','prepareEndereco','prepareNumero','prepareBairro','prepareObservacao','prepareDemanda','prepareEventoDeclaracaoNumero','prepareDataRenovacaoAvcb'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        if (prepareTipo) prepareTipo.value = '';
        if (prepareDwgFile) prepareDwgFile.value = '';
        if (prepareDwgStatus) prepareDwgStatus.textContent = '';
        if (prepareVistoriador) prepareVistoriador.value = String(authState.usuario?.nome || '');
        const cidade = document.getElementById('prepareCidade'); if (cidade) cidade.value = 'Viçosa';
        const pscip = document.getElementById('preparePscip'); if (pscip) pscip.value = 'PRJ';
        const titulo = document.getElementById('prepareInspectionTitle'); if (titulo) titulo.textContent = 'Cadastrar vistoria';
        if (prepareInspectionSaveBtn) prepareInspectionSaveBtn.textContent = usuarioPodeOperar_() ? 'Cadastrar vistoria' : 'Finalizar treinamento';
        ultimoCnpjPreparacaoConsultado = '';
        clearPrepareCnpjStatus_();
        limparResultadoProcessoPf_('prepare');
        atualizarCamposPreparacaoPorTipo_();
      }


      function lerArquivoBase64_(file, maxBytes, extensao) {
        return new Promise((resolve, reject) => {
          if (!file) return resolve(null);
          if (file.size > maxBytes) return reject(new Error(`O arquivo excede o limite de ${Math.round(maxBytes/1024/1024)} MB.`));
          const extensoes = (Array.isArray(extensao) ? extensao : [extensao]).filter(Boolean).map(v => String(v).toLowerCase());
          const nomeArquivo = String(file.name || '').toLowerCase();
          if (extensoes.length && !extensoes.some(ext => nomeArquivo.endsWith(ext))) {
            const rotulo = extensoes.length > 1 ? extensoes.slice(0,-1).join(', ') + ' ou ' + extensoes[extensoes.length - 1] : extensoes[0];
            return reject(new Error(`Selecione um arquivo ${rotulo}.`));
          }
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
          reader.onload = () => resolve({ nome:file.name, tipo:file.type || '', tamanho:file.size, base64:String(reader.result||'').split(',').pop() || '' });
          reader.readAsDataURL(file);
        });
      }

      function preencherVistoriadoresDdu_() {
        const el=document.getElementById('dduVistoriador'); if(!el) return;
        const atual=el.value; const nomes=Array.from(new Set((usuariosAtivosApp||[]).map(u=>String(u?.nome||u||'').trim()).filter(Boolean)));
        el.innerHTML='<option value="">Não definido</option>'+nomes.map(n=>`<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join(''); if(atual) el.value=atual;
      }
      function abrirCadastroDdu_(){
        if(!dduRegisterModal) return; preencherVistoriadoresDdu_();
        const hoje=new Date(); const iso=new Date(hoje.getTime()-hoje.getTimezoneOffset()*60000).toISOString().slice(0,10);
        document.getElementById('dduRecebimento').value=iso; if(dduRegisterError){dduRegisterError.hidden=true;dduRegisterError.textContent='';}
        dduRegisterModal.hidden=false;
      }
      function fecharCadastroDdu_(){ if(dduRegisterModal) dduRegisterModal.hidden=true; }
      function classificarPrazoDdu_(d){ const hoje=new Date(); hoje.setHours(0,0,0,0); const dt=new Date(String(d||'')+'T00:00:00'); if(Number.isNaN(dt.getTime())) return {c:'',r:'Sem prazo'}; const dias=Math.round((dt-hoje)/86400000); if(dias<0)return{c:'is-overdue',r:`Atrasado ${Math.abs(dias)} dia(s)`}; if(dias===0)return{c:'is-today',r:'Vence hoje'}; if(dias<=2)return{c:'is-today',r:`Faltam ${dias} dia(s)`}; return{c:'',r:`Prazo ${dt.toLocaleDateString('pt-BR')}`}; }
      function renderizarDdUs_(){
        const todos=Array.isArray(ddusAtivos)?ddusAtivos:[];
        const ativos=todos.filter(x=>normalize(x.status)!==normalize('Concluído')&&normalize(x.status)!==normalize('Cancelado'));
        const concluidos=todos.filter(x=>normalize(x.status)===normalize('Concluído') && !x.arquivoRemovidoEm);
        let vencidos=0,criticos=0; ativos.forEach(x=>{const p=classificarPrazoDdu_(x.dataLimite); if(p.c==='is-overdue')vencidos++; else if(p.c==='is-today')criticos++;});
        // V23.9.54 — o atalho DDU só existe visualmente quando há demanda pendente.
        // Registros concluídos/cancelados continuam disponíveis na janela DDU, mas não geram alerta na vistoria.
        if (dduSummaryCard) dduSummaryCard.hidden = ativos.length === 0;
        if(dduSummaryCount)dduSummaryCount.textContent=String(ativos.length); if(dduSummaryText)dduSummaryText.textContent=ativos.length?`${ativos.length} demanda(s) pendente(s)${vencidos?` • ${vencidos} atrasada(s)`:criticos?` • ${criticos} próxima(s) do prazo`:''}`:'Nenhuma demanda pendente';
        dduSummaryCard?.classList.toggle('is-danger',vencidos>0); dduSummaryCard?.classList.toggle('is-warning',!vencidos&&criticos>0);
        if(!dduList)return;
        const card=(x,concluido=false)=>{const p=classificarPrazoDdu_(x.dataLimite); const end=[x.endereco,x.numero,x.bairro,x.cidade].filter(Boolean).join(', '); let ret=''; if(concluido&&x.excluirArquivoApos){const fim=new Date(x.excluirArquivoApos); if(!Number.isNaN(fim.getTime())){const h=Math.max(0,Math.ceil((fim-Date.now())/3600000));ret=`Concluído • PDF disponível por cerca de ${h} h`;}} return `<article class="ddu-item ${concluido?'is-completed':p.c}" data-ddu-id="${escapeAttr(x.id)}"><div class="ddu-item-head"><div><h3>${escapeHtml(x.numeroDdu||'DDU 181')}</h3><p>${escapeHtml(end)}</p><p>${x.vistoriadorResponsavel?`<b>Vistoriador:</b> ${escapeHtml(x.vistoriadorResponsavel)}`:'Vistoriador não definido'}</p></div><span class="ddu-deadline">${escapeHtml(concluido?(ret||'Concluído'):p.r)}</span></div><div class="ddu-file-note">${concluido?'O PDF será enviado automaticamente para a lixeira após 24 h.':'PDF disponível enquanto a demanda estiver aberta e por 24 h após a conclusão.'}</div><div class="ddu-item-actions">${x.arquivoUrl?`<a class="btn btn-secondary" href="${escapeAttr(x.arquivoUrl)}" target="_blank" rel="noopener">Ver PDF</a>`:''}${concluido?'':`<button class="btn btn-primary ddu-start-btn" type="button" data-ddu-start="${escapeAttr(x.id)}">Iniciar fiscalização</button>`}</div></article>`};
        const blocos=[]; if(ativos.length)blocos.push(`<section class="prepared-group"><h3>Pendentes</h3>${ativos.sort((a,b)=>String(a.dataLimite||'9999').localeCompare(String(b.dataLimite||'9999'))).map(x=>card(x,false)).join('')}</section>`); if(concluidos.length)blocos.push(`<section class="prepared-group"><h3>Concluídos — PDF disponível por 24 h</h3>${concluidos.map(x=>card(x,true)).join('')}</section>`); dduList.innerHTML=blocos.join('')||'<div class="prepared-empty">Nenhum DDU cadastrado.</div>';
      }
      function lerCacheDdus_() {
        try {
          const dados = JSON.parse(localStorage.getItem(DDU_CACHE_STORAGE) || 'null');
          return Array.isArray(dados?.itens) ? dados : null;
        } catch (_) {
          return null;
        }
      }

      function aplicarCacheDdus_(mensagem = '') {
        const cache = lerCacheDdus_();
        if (!cache) return false;
        ddusAtivos = cache.itens;
        renderizarDdUs_();
        if (dduListStatus) dduListStatus.textContent = mensagem || 'Exibindo a última lista sincronizada.';
        return true;
      }

      async function carregarDdUs_(){
        const inicioLoadingDdu = Date.now();
        const tempoMinimoLoading = 250;
        const tinhaCache = aplicarCacheDdus_(navigator.onLine ? 'Última lista sincronizada — atualizando...' : 'Offline — exibindo a última lista sincronizada.');

        if (!navigator.onLine) {
          if (!tinhaCache && dduSummaryCard) dduSummaryCard.hidden = true;
          return;
        }

        // Com cache disponível, mantém o conteúdo útil visível enquanto atualiza.
        // Sem cache, usa o indicador tradicional de carregamento.
        if (!tinhaCache) {
          if (dduSummaryCard) dduSummaryCard.hidden = true;
          dduSummaryCard?.classList.add('is-loading');
          if (dduSummaryCard && !dduSummaryCard.querySelector('.ddu-live-loading-bar')) {
            dduSummaryCard.insertAdjacentHTML('beforeend', '<span class="ddu-live-loading-bar" aria-hidden="true"><i></i></span>');
          }
          if(dduSummaryText)dduSummaryText.innerHTML='<span class="ddu-loading-label">Atualizando demandas...</span>';
          if(dduSummaryCount)dduSummaryCount.innerHTML='<span class="ddu-count-loading" aria-hidden="true"></span>';
        }

        try{
          const r=await apiRequest('config',{consulta:'ddus'},15000);
          const novosDdUs=Array.isArray(r?.itens)?r.itens:[];
          const espera=Math.max(0,tempoMinimoLoading-(Date.now()-inicioLoadingDdu));
          if(espera && !tinhaCache) await new Promise(resolve=>setTimeout(resolve,espera));
          ddusAtivos=novosDdUs;
          try { localStorage.setItem(DDU_CACHE_STORAGE, JSON.stringify({ salvoEm: Date.now(), itens: ddusAtivos })); } catch (_) {}
          dduSummaryCard?.classList.remove('is-loading');
          dduSummaryCard?.querySelector('.ddu-live-loading-bar')?.remove();
          renderizarDdUs_();
          if(dduListStatus)dduListStatus.textContent=`${ddusAtivos.length} registro(s) ativo(s).`;
        }catch(e){
          console.error('Falha ao carregar DDU:',e);
          const espera=Math.max(0,tempoMinimoLoading-(Date.now()-inicioLoadingDdu));
          if(espera && !tinhaCache) await new Promise(resolve=>setTimeout(resolve,espera));
          dduSummaryCard?.classList.remove('is-loading');
          dduSummaryCard?.querySelector('.ddu-live-loading-bar')?.remove();
          if (tinhaCache) {
            aplicarCacheDdus_('Não foi possível atualizar agora — exibindo a última lista sincronizada.');
          } else {
            if(dduSummaryText)dduSummaryText.textContent='Não foi possível carregar';
            if(dduSummaryCount)dduSummaryCount.textContent='';
            if (dduSummaryCard) dduSummaryCard.hidden = true;
            dduSummaryCard?.classList.remove('is-danger','is-warning');
            if(dduListStatus)dduListStatus.textContent='Não foi possível atualizar os DDU agora. Toque novamente no card DDU para tentar de novo.';
          }
        }
      }
      async function salvarDdu_(){
        if(!navigator.onLine){avisarGpv_('É necessário estar online para cadastrar o DDU e enviar o PDF.','Sem internet',{tom:'warning'});return;}
        const prazo=document.getElementById('dduPrazo').value, endereco=document.getElementById('dduEndereco').value.trim(), cidade=document.getElementById('dduCidade').value.trim(); const file=document.getElementById('dduPdfFile').files?.[0];
        if(!prazo||!endereco||!cidade||!file){if(dduRegisterError){dduRegisterError.textContent='Preencha data limite, cidade, endereço e selecione o PDF.';dduRegisterError.hidden=false;}return;}
        try{dduRegisterSaveBtn.disabled=true;dduRegisterSaveBtn.textContent='Enviando PDF...'; const arq=await lerArquivoBase64_(file,8*1024*1024,'.pdf');
          await apiRequest('config',{consulta:'ddu_salvar',payload:{numeroDdu:document.getElementById('dduNumero').value,dataRecebimento:document.getElementById('dduRecebimento').value,dataLimite:prazo,vistoriadorResponsavel:document.getElementById('dduVistoriador').value,cidade,endereco,numero:document.getElementById('dduEnderecoNumero').value,bairro:document.getElementById('dduBairro').value,complemento:document.getElementById('dduComplemento').value,observacao:document.getElementById('dduObservacao').value,arquivo:arq}},120000);
          fecharCadastroDdu_(); await carregarDdUs_(); if(dduListModal)dduListModal.hidden=false;
        }catch(e){if(dduRegisterError){dduRegisterError.textContent=e?.message||'Não foi possível cadastrar o DDU.';dduRegisterError.hidden=false;}}
        finally{dduRegisterSaveBtn.disabled=false;dduRegisterSaveBtn.textContent='Salvar DDU';}
      }
      function iniciarDdu_(item){ if(!item)return; if(!prepararFormularioNovaVistoria_('DDU')) return; dduEmUsoId=String(item.id||''); dduEmUsoNumero=String(item.numeroDdu||'').trim(); if(dduListModal)dduListModal.hidden=true; aplicarFluxoVistoria_('fiscalizacao',{silencioso:true}); const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!=null&&String(v)!=='')el.value=v}; set('demandaPrincipal','DDU'); set('dduProtocol',dduEmUsoNumero); set('endereco',item.endereco);set('numero',item.numero);set('bairro',item.bairro);set('complemento',item.complemento);set('vistoriadorResponsavel',item.vistoriadorResponsavel); if(item.cidade){const op=Array.from(citySelect.options).find(o=>normalize(o.value)===normalize(item.cidade)); if(op)citySelect.value=op.value; else{citySelect.value='Outro';if(otherCity)otherCity.value=item.cidade;} syncOtherCity();} aplicarModoEventoDeclaratorio_({silencioso:true}); sincronizarDemandasEspeciais_(); agendarConsultaProcessoPf_('form',180); scheduleDraftSave(); appStatus.textContent='DDU carregado em formulário limpo. Complete os dados da fiscalização.'; }

      function abrirModalPreparacao_(opcoes = {}) {
        fecharMenuMais_();
        if (!prepareInspectionModal) return;
        preparacaoRetornarProgramadas = Boolean(opcoes.retornarProgramadas);
        limparFormularioPreparacao_();
        if (prepareInspectionError) prepareInspectionError.hidden = true;
        prepareInspectionModal.hidden = false;
        document.body.classList.add('review-open');
      }

      function abrirEdicaoPreparacao_(item) {
        if (!item?.id || !prepareInspectionModal) return;
        fecharMenuMais_();
        preparacaoRetornarProgramadas = true;
        limparFormularioPreparacao_();
        preparacaoEditandoId = String(item.id);
        const set = (id, valor) => { const el = document.getElementById(id); if (el) el.value = String(valor ?? ''); };
        set('prepareCnpj', item.cnpj || item.cpf || '');
        set('prepareTipo', item.tipoPreparacao || '');
        set('prepareData', item.dataPrevista || '');
        set('prepareVistoriador', item.vistoriadorResponsavel || '');
        set('prepareCidade', item.cidade || 'Viçosa');
        set('prepareDemanda', item.demandaPrincipal || (item.eventoDeclaracaoNumero ? 'Eventos declaratórios' : ''));
        set('preparePscip', item.pscip ? projetoPscipOperacional_(item.pscip) : 'PRJ');
        set('prepareEventoDeclaracaoNumero', formatarDeclaracaoEvento_(item.eventoDeclaracaoNumero || ''));
        set('prepareDataRenovacaoAvcb', formatarDataRenovacaoAvcbDigitacao_(item.dataRenovacaoAvcb || ''));
        set('preparePf', item.pf || '');
        set('prepareNomeFantasia', item.nomeFantasia || '');
        set('prepareRazaoSocial', item.razaoSocial || '');
        set('prepareArea', item.area || '');
        set('prepareEndereco', item.endereco || '');
        set('prepareNumero', item.numero || '');
        set('prepareBairro', item.bairro || '');
        set('prepareObservacao', item.observacaoPrevia || '');
        const cnpjInput = document.getElementById('prepareCnpj');
        if (cnpjInput) {
          const numero = digits(cnpjInput.value || '').slice(0,14);
          cnpjInput.value = numero.length > 11 ? formatarCnpjTela_(numero) : numero;
          ultimoCnpjPreparacaoConsultado = numero.length === 14 ? numero : '';
        }
        const titulo = document.getElementById('prepareInspectionTitle'); if (titulo) titulo.textContent = 'Editar vistoria programada';
        if (prepareDwgStatus) prepareDwgStatus.textContent = item.arquivoDwgNome ? `Arquivo atual: ${item.arquivoDwgNome}. Selecione outro arquivo apenas para substituir.` : 'Nenhum arquivo anexado.';
        if (prepareInspectionSaveBtn) prepareInspectionSaveBtn.textContent = 'Salvar alterações';
        if (prepareInspectionError) prepareInspectionError.hidden = true;
        atualizarCamposPreparacaoPorTipo_();
        prepareInspectionModal.hidden = false;
        document.body.classList.add('review-open');
      }

      function fecharModalPreparacao_(opcoes = {}) {
        if (!prepareInspectionModal) return;
        const retornar = preparacaoRetornarProgramadas;
        preparacaoRetornarProgramadas = false;
        prepareInspectionModal.hidden = true;
        document.body.classList.remove('review-open');
        if (opcoes.restaurarContexto !== false && retornar) abrirListaProgramadas_(true);
      }

      function dadosPreparacaoFormulario_() {
        const g = id => String(document.getElementById(id)?.value || '').trim();
        const tipo = g('prepareTipo');
        const eventoDeclaratorio = tipo === 'fiscalizacao' && normalize(g('prepareDemanda')) === normalize('Eventos declaratórios');
        const pscipInformado = eventoDeclaratorio ? '' : projetoPscipOperacional_(g('preparePscip'));
        return {
          _appPreparacao: 'sim',
          _appPreparacaoEdicao: preparacaoEditandoId ? 'sim' : 'nao',
          _appPreparacaoId: preparacaoEditandoId || `prep_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          tipoPreparacao: tipo,
          tipoVistoria: tipo === 'liberacao' ? 'Vistoria de Liberação' : (tipo === 'fiscalizacao' ? 'Vistoria de Fiscalização' : ''),
          dataPrevista: g('prepareData'),
          vistoriadorResponsavel: g('prepareVistoriador'),
          cidade: g('prepareCidade') || 'Viçosa',
          demandaPrincipal: eventoDeclaratorio ? 'Eventos declaratórios' : g('prepareDemanda'),
          categoriaMeta: eventoDeclaratorio ? 'Eventos declaratórios' : '',
          eventoDeclaracaoNumero: eventoDeclaratorio ? formatarDeclaracaoEvento_(g('prepareEventoDeclaracaoNumero')) : '',
          dataRenovacaoAvcb: ehRenovacaoAvcbPreparacao_() ? formatarDataRenovacaoAvcbDigitacao_(g('prepareDataRenovacaoAvcb')) : '',
          _appPossuiPscip: eventoDeclaratorio ? 'nao' : (tipo === 'liberacao' ? 'sim' : (pscipProjetoValido_(pscipInformado) ? 'sim' : 'nao')),
          pscip: eventoDeclaratorio ? '' : pscipInformado,
          pf: g('preparePf'),
          cnpj: g('prepareCnpj'),
          nomeFantasia: g('prepareNomeFantasia'),
          razaoSocial: g('prepareRazaoSocial'),
          area: g('prepareArea'),
          endereco: g('prepareEndereco'),
          numero: g('prepareNumero'),
          bairro: g('prepareBairro'),
          observacaoPrevia: g('prepareObservacao'),
          _appUsuarioNome: String(authState.usuario?.nome || ''),
          _appDispositivo: nomeDispositivo_()
        };
      }


      async function preencherPreparacaoComHistorico_(identificador) {
        const doc = digits(identificador || '');
        if (!navigator.onLine || (doc.length !== 11 && doc.length !== 14)) return false;
        try {
          const r = await apiRequest('config', {
            consulta: 'estabelecimento_historico',
            filtros: { identificador: doc }
          }, 30000);
          const item = Array.isArray(r?.resultados) ? r.resultados[0] : null;
          if (!item) return false;

          const setSeVazio = (id, valor) => {
            const el = document.getElementById(id);
            if (!el || !String(valor || '').trim() || String(el.value || '').trim()) return false;
            el.value = String(valor);
            return true;
          };

          let alterados = 0;
          alterados += setSeVazio('prepareNomeFantasia', item.nomeFantasia) ? 1 : 0;
          alterados += setSeVazio('prepareRazaoSocial', item.razaoSocial) ? 1 : 0;
          alterados += setSeVazio('prepareCidade', item.cidade) ? 1 : 0;
          alterados += setSeVazio('prepareEndereco', item.endereco) ? 1 : 0;
          alterados += setSeVazio('prepareNumero', item.numero) ? 1 : 0;
          alterados += setSeVazio('prepareBairro', item.bairro) ? 1 : 0;
          alterados += setSeVazio('prepareArea', item.area) ? 1 : 0;

          const pscip = projetoPscipOperacional_(item.pscip || '');
          const pscipAtual = String(document.getElementById('preparePscip')?.value || '').trim();
          if (pscip && (!pscipAtual || pscipAtual === 'PRJ')) {
            document.getElementById('preparePscip').value = pscip;
            alterados += 1;
          }

          if (alterados && item.historico2024_2025) {
            showPrepareCnpjStatus_(
              `Dados complementados pela base histórica 2024-2025. Confira antes de salvar.${item.observacaoHistorica ? ' ' + item.observacaoHistorica : ''}`,
              'success'
            );
          }
          return alterados > 0;
        } catch (erro) {
          return false;
        }
      }

      let cnpjPreparacaoConsultaSequencia = 0;
      let cnpjPreparacaoEmAndamento = null;
      let cnpjPreparacaoEmAndamentoNumero = '';

      function showPrepareCnpjStatus_(message, type = 'info') {
        const el = document.getElementById('prepareCnpjStatus');
        if (!el) return;
        el.className = 'lookup-status show ' + type;
        el.textContent = message;
      }

      function clearPrepareCnpjStatus_() {
        const el = document.getElementById('prepareCnpjStatus');
        if (!el) return;
        el.className = 'lookup-status';
        el.textContent = '';
      }

      function preencherDadosCnpjPreparacao_(resultado) {
        const dados = resultado?.dados || resultado?.data || resultado?.resultado || resultado || {};
        const primeiro = (...valores) => {
          for (const valor of valores) {
            const texto = String(valor ?? '').trim();
            if (texto) return texto;
          }
          return '';
        };
        const mapa = {
          prepareRazaoSocial: primeiro(dados.razaoSocial, dados.razao_social, dados.nome, dados.nomeEmpresarial),
          prepareNomeFantasia: primeiro(dados.nomeFantasia, dados.nome_fantasia, dados.fantasia, dados.nome_fantasia_estabelecimento),
          prepareEndereco: primeiro(dados.endereco, dados.logradouro, dados.descricao_tipo_de_logradouro && dados.logradouro ? `${dados.descricao_tipo_de_logradouro} ${dados.logradouro}` : ''),
          prepareNumero: primeiro(dados.numero, dados.numeroEndereco),
          prepareBairro: primeiro(dados.bairro, dados.nome_bairro),
          prepareCidade: primeiro(dados.cidade, dados.municipio, dados.nome_municipio)
        };
        let alterados = 0;
        Object.entries(mapa).forEach(([id, valor]) => {
          const el = document.getElementById(id);
          if (!el || !valor) return;
          // Na preparação, os dados oficiais do CNPJ devem prevalecer sobre
          // valores residuais/autopreenchimento do navegador.
          if (String(el.value || '').trim() !== valor) {
            el.value = valor;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            alterados += 1;
          }
        });
        return alterados;
      }

      async function consultarCnpjPreparacao_() {
        const input = document.getElementById('prepareCnpj');
        const cnpj = digits(input?.value || '');
        if (cnpj.length !== 14) {
          clearPrepareCnpjStatus_();
          return false;
        }
        if (!navigator.onLine) {
          showPrepareCnpjStatus_('Sem internet. Preencha os dados manualmente e tente novamente quando a conexão voltar.', 'info');
          return false;
        }

        // V23.9.4: single-flight. Input, timer e blur podem pedir a mesma consulta,
        // mas somente uma requisição é enviada para o gateway por CNPJ.
        if (cnpjPreparacaoEmAndamento && cnpjPreparacaoEmAndamentoNumero === cnpj) {
          return cnpjPreparacaoEmAndamento;
        }

        const sequencia = ++cnpjPreparacaoConsultaSequencia;
        cnpjPreparacaoEmAndamentoNumero = cnpj;
        showPrepareCnpjStatus_('Consultando CNPJ...', 'info');

        const requisicao = (async () => {
          try {
            // Usa exatamente a mesma ação/rota do CNPJ do formulário principal.
            const resultado = await apiRequest('cnpj', { cnpj }, 30000);
            if (sequencia !== cnpjPreparacaoConsultaSequencia || digits(input?.value || '') !== cnpj) return false;

            const alterados = preencherDadosCnpjPreparacao_(resultado);
            if (digits(input?.value || '') !== cnpj) return false;

            showPrepareCnpjStatus_(
              alterados > 0
                ? `CNPJ localizado. ${alterados} dado(s) cadastral(is) preenchido(s) automaticamente.`
                : 'CNPJ localizado. Confira os dados cadastrais antes de salvar.',
              'success'
            );
            await preencherPreparacaoComHistorico_(cnpj);
            return true;
          } catch (erro) {
            if (sequencia !== cnpjPreparacaoConsultaSequencia || digits(input?.value || '') !== cnpj) return false;
            const recuperouHistorico = await preencherPreparacaoComHistorico_(cnpj);
            if (!recuperouHistorico) {
              showPrepareCnpjStatus_(erro?.message || 'Não foi possível consultar o CNPJ. Continue o preenchimento manualmente.', 'error');
            }
            return recuperouHistorico;
          } finally {
            if (cnpjPreparacaoEmAndamentoNumero === cnpj) {
              cnpjPreparacaoEmAndamento = null;
              cnpjPreparacaoEmAndamentoNumero = '';
            }
          }
        })();

        cnpjPreparacaoEmAndamento = requisicao;
        return requisicao;
      }

      async function salvarPreparacaoVistoria_() {
        const p = dadosPreparacaoFormulario_();
        const faltantes = [];
        const eventoDeclaratorio = p.tipoPreparacao === 'fiscalizacao' && normalize(p.demandaPrincipal) === normalize('Eventos declaratórios');
        if (!['fiscalizacao','liberacao'].includes(p.tipoPreparacao)) faltantes.push('Tipo de vistoria');
        if (p.tipoPreparacao === 'liberacao' && !p.dataPrevista) faltantes.push('Data prevista');
        if (!p.vistoriadorResponsavel) faltantes.push('Vistoriador responsável');
        if (p.tipoPreparacao === 'liberacao' && !pscipAtualValido_(p.pscip)) {
          faltantes.push('Nº do PSCIP atual (PRJ + 10 números)');
        }
        if (!eventoDeclaratorio && String(p.pscip || '').trim() && String(p.pscip || '').trim() !== 'PRJ' && !pscipProjetoValido_(p.pscip)) {
          faltantes.push('Nº do PSCIP / Projeto válido (PRJ + 10 números ou processo antigo, ex.: 44/2016)');
        }
        if (eventoDeclaratorio && !p.eventoDeclaracaoNumero) faltantes.push('Nº da declaração INFOSCIP');
        if (eventoDeclaratorio && p.eventoDeclaracaoNumero && !declaracaoEventoValida_(p.eventoDeclaracaoNumero)) faltantes.push('Nº da declaração INFOSCIP válido');
        const renovacaoAvcb = p.tipoPreparacao === 'fiscalizacao' && ehRenovacaoAvcbValor_(p.demandaPrincipal);
        if (renovacaoAvcb && !p.dataRenovacaoAvcb) faltantes.push('Data de renovação do AVCB');
        if (renovacaoAvcb && p.dataRenovacaoAvcb && !dataRenovacaoAvcbValida_(p.dataRenovacaoAvcb)) faltantes.push('Data de renovação do AVCB válida');
        if (faltantes.length) {
          if (prepareInspectionError) {
            prepareInspectionError.hidden = false;
            prepareInspectionError.textContent = `Preencha: ${faltantes.join(', ')}.`;
          }
          return;
        }
        if (!usuarioPodeOperar_()) {
          fecharModalPreparacao_({ restaurarContexto: false });
          limparFormularioPreparacao_();
          appStatus.textContent = 'Cadastro percorrido — nenhuma vistoria foi programada ou registrada.';
          await mostrarAvisoAcessoGeral_('cadastro');
          return;
        }
        if (!navigator.onLine) {
          if (prepareInspectionError) {
            prepareInspectionError.hidden = false;
            prepareInspectionError.textContent = 'É necessário estar online para salvar uma preparação compartilhada.';
          }
          return;
        }
        prepareInspectionSaveBtn.disabled = true;
        try {
          if (p.tipoPreparacao === 'liberacao' && prepareDwgFile?.files?.[0]) {
            p._appArquivoDwg = await lerArquivoBase64_(prepareDwgFile.files[0], 8 * 1024 * 1024, ['.dwg', '.pdf']);
          }
          const eraEdicao = Boolean(preparacaoEditandoId);
          if (eraEdicao) {
            // V23.9.7: edição usa a rota de config já liberada no gateway,
            // evitando o caminho de gravação de vistoria normal e garantindo JSON previsível.
            await apiRequest('config', { consulta: 'programada_editar', payload: p }, 30000);
          } else {
            await apiRequest('save', { payload: p }, 30000);
          }
          fecharModalPreparacao_({ restaurarContexto: false });
          limparFormularioPreparacao_();
          carregarPreparacoesVistoria_().catch(() => {});
          appStatus.textContent = eraEdicao ? 'Programação atualizada com sucesso.' : 'Vistoria cadastrada e compartilhada com a equipe.';
        } catch (erro) {
          if (prepareInspectionError) {
            prepareInspectionError.hidden = false;
            prepareInspectionError.textContent = erro?.message || 'Não foi possível salvar a preparação.';
          }
        } finally {
          prepareInspectionSaveBtn.disabled = false;
        }
      }

      function diasAteProgramacao_(valor) {
        const v = String(valor || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
        const [a, m, d] = v.split('-').map(Number);
        const alvo = new Date(a, m - 1, d, 12, 0, 0, 0);
        const hoje = new Date();
        const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0, 0);
        return Math.round((alvo.getTime() - base.getTime()) / 86400000);
      }

      function classificarPrazoProgramacao_(item) {
        const dias = diasAteProgramacao_(item?.dataPrevista);
        if (dias == null) return { classe: 'sem-data', rotulo: 'Sem data', prioridade: 50, dias: null };
        if (dias < 0) return { classe: 'atrasada', rotulo: `Atrasada ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`, prioridade: 0, dias };
        if (dias === 0) return { classe: 'hoje', rotulo: 'Hoje', prioridade: 1, dias };
        if (dias === 1) return { classe: 'amanha', rotulo: 'Amanhã', prioridade: 2, dias };
        return { classe: 'proxima', rotulo: dias <= 7 ? `Em ${dias} dias` : 'Próxima', prioridade: 10 + Math.min(dias, 30), dias };
      }

      function atualizarAlertaPrazosProgramados_() {
        if (!programDeadlineNotice) return;
        const pendentes = Array.isArray(preparacoesVistoria) ? preparacoesVistoria : [];
        const atrasadas = pendentes.filter(i => (diasAteProgramacao_(i?.dataPrevista) ?? 9999) < 0);
        const hoje = pendentes.filter(i => diasAteProgramacao_(i?.dataPrevista) === 0);
        const amanha = pendentes.filter(i => diasAteProgramacao_(i?.dataPrevista) === 1);
        const libAtrasadas = atrasadas.filter(i => i?.tipoPreparacao === 'liberacao');
        const libHoje = hoje.filter(i => i?.tipoPreparacao === 'liberacao');
        const partes = [];
        if (libAtrasadas.length) partes.push(`${libAtrasadas.length} liberação${libAtrasadas.length === 1 ? '' : 'ões'} atrasada${libAtrasadas.length === 1 ? '' : 's'}`);
        if (libHoje.length) partes.push(`${libHoje.length} liberação${libHoje.length === 1 ? '' : 'ões'} para hoje`);
        const outrasAtrasadas = atrasadas.length - libAtrasadas.length;
        if (outrasAtrasadas > 0) partes.push(`${outrasAtrasadas} fiscalização${outrasAtrasadas === 1 ? '' : 'ões'} atrasada${outrasAtrasadas === 1 ? '' : 's'}`);
        const outrasHoje = hoje.length - libHoje.length;
        if (outrasHoje > 0) partes.push(`${outrasHoje} fiscalização${outrasHoje === 1 ? '' : 'ões'} para hoje`);
        if (!partes.length && amanha.length) partes.push(`${amanha.length} vistoria${amanha.length === 1 ? '' : 's'} para amanhã`);
        programDeadlineNotice.hidden = partes.length === 0;
        programDeadlineNotice.classList.toggle('is-critical', atrasadas.length > 0 || libHoje.length > 0);
        programDeadlineNotice.innerHTML = partes.length ? `<strong>⚠ Atenção aos prazos:</strong> ${escapeHtml(partes.join(' • '))}` : '';
      }

      function atualizarVisibilidadeProgramadasMobile_() {
        const lista = Array.isArray(preparacoesVistoria) ? preparacoesVistoria : [];
        const total = lista.length;
        const minhas = preparacoesDoUsuarioLogado_().length;
        let criticas = 0;
        lista.forEach(item => {
          const prazo = classificarPrazoProgramacao_(item);
          if (prazo.classe === 'atrasada' || prazo.classe === 'hoje') criticas += 1;
        });

        if (programmedInspectionsBox) programmedInspectionsBox.setAttribute('data-program-count', String(total));
        if (programmedSummaryRow) programmedSummaryRow.hidden = total === 0;
        if (programmedSummaryCard) {
          programmedSummaryCard.classList.toggle('is-danger', criticas > 0);
          programmedSummaryCard.setAttribute('aria-label', total
            ? `Abrir Vistorias Programadas. ${total} pendente${total === 1 ? '' : 's'}${minhas ? `, ${minhas} para você` : ''}.`
            : 'Nenhuma vistoria programada pendente');
        }
        if (programmedSummaryCount) programmedSummaryCount.textContent = String(total);
        if (programmedSummaryText) programmedSummaryText.textContent = total
          ? `${total} pendente${total === 1 ? '' : 's'}${minhas ? ` • ${minhas} para você` : ''}`
          : 'Nenhuma vistoria pendente';
      }


      function classePrioridadeSugestao_(prioridade) {
        const n = normalize(prioridade);
        if (n === normalize('Alta')) return 'high';
        if (n === normalize('Média')) return 'medium';
        return 'watch';
      }

      // V23.9.99bf — Sugestões de Fiscalização do registro histórico
      // mais antigo para o mais novo. O fallback interpreta itens do cache
      // anterior, que ainda não possuíam ultimaVistoriaTimestamp.
      function timestampSugestaoFiscalizacao_(item) {
        const direto = Number(item?.ultimaVistoriaTimestamp || 0);
        if (Number.isFinite(direto) && direto > 0) return direto;

        const texto = String(item?.ultimaVistoria || '').trim();
        if (!texto) return 0;

        let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?/);
        if (m) {
          const data = new Date(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4] || 0),
            Number(m[5] || 0),
            Number(m[6] || 0),
            Number(String(m[7] || '0').padEnd(3, '0'))
          );
          return Number.isFinite(data.getTime()) ? data.getTime() : 0;
        }

        m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (m) {
          let dia = Number(m[1]);
          let mes = Number(m[2]);

          // Base antiga/importada pode chegar em MM/DD/AAAA.
          if (mes > 12 && dia >= 1 && dia <= 12) {
            const troca = dia;
            dia = mes;
            mes = troca;
          }

          const data = new Date(
            Number(m[3]),
            mes - 1,
            dia,
            Number(m[4] || 0),
            Number(m[5] || 0),
            Number(m[6] || 0),
            0
          );
          return Number.isFinite(data.getTime()) ? data.getTime() : 0;
        }

        const nativo = new Date(texto).getTime();
        return Number.isFinite(nativo) ? nativo : 0;
      }

      function ordenarSugestoesFiscalizacaoCronologicamente_(lista) {
        return (Array.isArray(lista) ? lista : [])
          .slice()
          .sort((a, b) => {
            const ta = timestampSugestaoFiscalizacao_(a);
            const tb = timestampSugestaoFiscalizacao_(b);

            if (ta > 0 && tb > 0 && ta !== tb) return ta - tb;
            if (ta > 0 && !(tb > 0)) return -1;
            if (!(ta > 0) && tb > 0) return 1;

            const tituloA = String(a?.nomeFantasia || a?.razaoSocial || '');
            const tituloB = String(b?.nomeFantasia || b?.razaoSocial || '');
            return tituloA.localeCompare(tituloB, 'pt-BR', { sensitivity: 'base' });
          });
      }

      function atualizarResumoSugestoesUi_() {
        const r = resumoSugestoesFiscalizacao || {};
        const total = Number(r.total || 0);
        const alta = Number(r.alta || 0);
        const media = Number(r.media || 0);

        const acompanhamento = Number(r.acompanhamento || 0);

        if (inspectionSuggestionsCount) inspectionSuggestionsCount.textContent = String(total);
        if (inspectionSuggestionsBadge) inspectionSuggestionsBadge.textContent = String(total);
        if (inspectionSuggestionsText) {
          inspectionSuggestionsText.textContent = total
            ? `${alta} alta prioridade • ${media} média • ${acompanhamento} acompanhamento`
            : 'Nenhum local sugerido com os critérios atuais.';
        }
        if (inspectionSuggestionsCard) {
          inspectionSuggestionsCard.classList.toggle('has-high', alta > 0);
          inspectionSuggestionsCard.hidden = false;
        }

        // O acesso na tela Vistoria permanece SEMPRE visível, inclusive quando
        // não há nenhuma vistoria programada.
        if (inspectionSuggestionsVistoriaCount) {
          inspectionSuggestionsVistoriaCount.textContent = String(total);
        }
        if (inspectionSuggestionsVistoriaSummary) {
          inspectionSuggestionsVistoriaSummary.textContent = total
            ? `${alta} alta • ${media} média • ${acompanhamento} acompanhamento`
            : 'Nenhuma sugestão pendente no momento';
        }
        if (inspectionSuggestionsVistoriaText) {
          inspectionSuggestionsVistoriaText.textContent = total
            ? 'Locais indicados para nova fiscalização com base no histórico e no risco.'
            : 'A lista continua disponível para consulta mesmo sem sugestões pendentes.';
        }
        if (inspectionSuggestionsVistoriaCard) {
          inspectionSuggestionsVistoriaCard.classList.toggle('has-high', alta > 0);
          inspectionSuggestionsVistoriaCard.classList.toggle('is-empty', total === 0);
          inspectionSuggestionsVistoriaCard.hidden = false;
        }
      }

      async function carregarResumoSugestoesFiscalizacao_() {
        const cacheLocal = lerCacheSugestoesFiscalizacaoLocal_();
        if (cacheLocal) {
          resumoSugestoesFiscalizacao = cacheLocal.resumo || resumoSugestoesFiscalizacao;
          sugestoesFiscalizacaoGeradoEm = String(cacheLocal.geradoEm || '');
          atualizarResumoSugestoesUi_();
          if (Date.now() - Number(cacheLocal.salvoEm || 0) < SUGGESTIONS_REFRESH_SOFT_MS) return;
        }
        if (!navigator.onLine) return;
        try {
          const r = await apiRequest('config', {
            consulta: 'sugestoes_fiscalizacao',
            filtros: { limite: 0 }
          }, 30000);
          resumoSugestoesFiscalizacao = r?.resumo || { total: 0, alta: 0, media: 0, acompanhamento: 0 };
          sugestoesFiscalizacaoGeradoEm = String(r?.geradoEm || sugestoesFiscalizacaoGeradoEm || '');
          atualizarResumoSugestoesUi_();
        } catch (erro) {
          if (!cacheLocal && inspectionSuggestionsText) inspectionSuggestionsText.textContent = 'Não foi possível atualizar as sugestões agora.';
        }
      }

      function renderizarSugestoesFiscalizacao_() {
        if (!preparedInspectionsList) return;
        atualizarResumoSugestoesUi_();

        if (!sugestoesFiscalizacaoCarregadas) {
          preparedInspectionsList.innerHTML = navigator.onLine
            ? '<div class="prepared-empty">Carregando sugestões de fiscalização...</div>'
            : '<div class="prepared-empty">As sugestões precisam de conexão para cruzar a base atual com 2024-2025.</div>';
          if (preparedInspectionsStatus) {
            preparedInspectionsStatus.textContent = 'Somente locais fiscalizados antes de 02/07/2025, sem nova vistoria e sem regularização posterior.';
          }
          return;
        }

        if (!sugestoesFiscalizacao.length) {
          preparedInspectionsList.innerHTML = '<div class="prepared-empty">Nenhum local pendente foi identificado pelos critérios atuais.</div>';
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = 'Nenhuma sugestão de nova fiscalização.';
          return;
        }

        if (preparedInspectionsStatus) {
          const atualizado = rotuloAtualizacaoSugestoes_();
          preparedInspectionsStatus.textContent =
            `${sugestoesFiscalizacao.length} local${sugestoesFiscalizacao.length === 1 ? '' : 'is'} sugerido${sugestoesFiscalizacao.length === 1 ? '' : 's'}${atualizado ? ` • ${atualizado}` : ''} • mais antigos primeiro.`;
        }

        sugestoesFiscalizacao = ordenarSugestoesFiscalizacaoCronologicamente_(sugestoesFiscalizacao);

        preparedInspectionsList.innerHTML = sugestoesFiscalizacao.map(item => {
          const titulo = item.nomeFantasia || item.razaoSocial || 'Edificação sem nome informado';
          const endereco = [item.endereco, item.numero, item.bairro, item.cidade].filter(Boolean).join(', ');
          const risco = classePrioridadeSugestao_(item.prioridade);
          const dimensoes = [
            item.area ? `${item.area} m²` : '',
            item.pavimentos ? `${item.pavimentos} pav.` : '',
            item.altura ? `${item.altura} m altura` : ''
          ].filter(Boolean).join(' • ');
          const marco = item.possuiRegistroAposMarco
            ? `Situação após 02/07/2025: ${item.ultimaSituacao || 'não informada'}`
            : 'Sem comprovação de regularização posterior a 02/07/2025';

          return `<article class="inspection-suggestion-card priority-${risco}">
            <div class="inspection-suggestion-head">
              <span class="inspection-priority priority-${risco}">${escapeHtml(item.prioridade || 'Acompanhamento')}</span>
              <span class="inspection-score">Prioridade ${Number(item.pontos || 0)}</span>
            </div>
            <h3>${escapeHtml(titulo)}</h3>
            <p class="inspection-suggestion-address">${escapeHtml(endereco || 'Endereço não informado')}</p>
            <div class="inspection-suggestion-meta">
              ${item.ocupacao ? `<span><b>Ocupação:</b> ${escapeHtml(item.ocupacao)}</span>` : ''}
              ${dimensoes ? `<span><b>Edificação:</b> ${escapeHtml(dimensoes)}</span>` : ''}
              ${item.reds ? `<span><b>REDS:</b> ${escapeHtml(item.reds)}</span>` : ''}
              ${item.pscip ? `<span><b>${escapeHtml(rotuloProjetoPscip_(item.pscip))}:</b> ${escapeHtml(projetoPscipOperacional_(item.pscip) || item.pscip)}</span>` : '<span><b>PSCIP / Projeto:</b> não identificado</span>'}
              <span><b>Última vistoria:</b> ${escapeHtml(formatarDataPainel_(item.ultimaVistoria) || item.ultimaVistoria || 'não informada')}</span>
              <span><b>Situação:</b> ${escapeHtml(marco)}</span>
            </div>
            <p class="inspection-suggestion-reason"><strong>Por que está na lista:</strong> ${escapeHtml(item.motivo || 'Histórico pendente para verificação.')}</p>
            ${Array.isArray(item.observacoesControle) && item.observacoesControle.length ? `<div class="inspection-suggestion-notes">
              <strong>Observações operacionais</strong>
              ${item.observacoesControle.slice(-3).map(obs => `<div class="inspection-suggestion-note">
                <span>${escapeHtml(obs.observacao || '')}</span>
                <small>${[obs.registradoEm, obs.usuario].filter(Boolean).map(escapeHtml).join(' • ')}</small>
              </div>`).join('')}
              ${item.observacoesControle.length > 3 ? `<small class="inspection-suggestion-notes-more">+ ${item.observacoesControle.length - 3} observação(ões) anterior(es)</small>` : ''}
            </div>` : ''}
            ${item.historicoAnteriorResetado ? '<p class="inspection-suggestion-reset">As sanções anteriores a 02/07/2025 aparecem somente como histórico e não são tratadas como sanção atual.</p>' : ''}
            <div class="inspection-suggestion-actions">
              ${usuarioPodeOperar_() ? `<button class="btn btn-primary" type="button" data-program-suggestion-id="${escapeAttr(item.identidade || '')}">Programar vistoria</button>` : ''}
              <button class="btn btn-secondary" type="button" data-search-suggestion="${escapeAttr(item.cnpj || item.pscip || titulo)}">Consultar no Painel</button>
              ${usuarioPodeOperar_() ? `<button class="btn btn-secondary inspection-suggestion-note-btn" type="button" data-note-suggestion-id="${escapeAttr(item.identidade || '')}">📝 Adicionar observação</button>` : ''}
              ${usuarioPodeOperar_() ? `<button class="btn btn-secondary inspection-suggestion-regularize-btn" type="button" data-regularize-suggestion-id="${escapeAttr(item.identidade || '')}">✓ Marcar regularizado</button>` : ''}
            </div>
          </article>`;
        }).join('');
      }


      function recalcularResumoSugestoesFiscalizacaoLocal_() {
        resumoSugestoesFiscalizacao = {
          total: sugestoesFiscalizacao.length,
          alta: sugestoesFiscalizacao.filter(i => normalize(i.prioridade) === normalize('Alta')).length,
          media: sugestoesFiscalizacao.filter(i => normalize(i.prioridade) === normalize('Média')).length,
          acompanhamento: sugestoesFiscalizacao.filter(i => normalize(i.prioridade) === normalize('Acompanhamento')).length
        };
        atualizarResumoSugestoesUi_();
      }

      function salvarEstadoAtualSugestoesNoCacheLocal_() {
        salvarCacheSugestoesFiscalizacaoLocal_({
          itens: sugestoesFiscalizacao,
          resumo: resumoSugestoesFiscalizacao,
          geradoEm: sugestoesFiscalizacaoGeradoEm || new Date().toISOString()
        });
      }

      function payloadControleSugestaoFiscalizacao_(item, observacao = '') {
        return {
          identidade: String(item?.identidade || ''),
          cidade: String(item?.cidade || ''),
          endereco: String(item?.endereco || ''),
          numero: String(item?.numero || ''),
          bairro: String(item?.bairro || ''),
          nomeFantasia: String(item?.nomeFantasia || ''),
          razaoSocial: String(item?.razaoSocial || ''),
          cnpj: String(item?.cnpj || ''),
          pscip: String(item?.pscip || ''),
          observacao: String(observacao || '').trim()
        };
      }


      async function adicionarObservacaoSugestaoFiscalizacao_(item) {
        if (!item || !usuarioPodeOperar_()) return;

        if (!navigator.onLine) {
          await avisarGpv_(
            'É necessário estar conectado para registrar uma observação nesta edificação.',
            'Sem conexão',
            { tom: 'warning' }
          );
          return;
        }

        const titulo = item.nomeFantasia || item.razaoSocial || 'Edificação';
        const endereco = [item.endereco, item.numero, item.bairro, item.cidade]
          .filter(Boolean)
          .join(', ');

        const observacao = await solicitarTextoGpv_(
          `Registre uma informação útil para a próxima fiscalização.\n\n${titulo}${endereco ? `\n${endereco}` : ''}`,
          'Adicionar observação',
          {
            placeholder: 'Ex.: Possui AVCB válido, porém a Brigada de Incêndio estava vencida na última fiscalização.',
            maxLength: 500,
            rotuloConfirmar: 'Salvar observação'
          }
        );

        if (observacao === null) return;
        const texto = String(observacao || '').trim();
        if (!texto) {
          await avisarGpv_(
            'Digite uma observação antes de salvar.',
            'Observação vazia',
            { tom: 'warning' }
          );
          return;
        }

        try {
          const resposta = await apiRequest('config', {
            consulta: 'sugestao_observacao',
            payload: payloadControleSugestaoFiscalizacao_(item, texto)
          }, 30000);

          const novaObservacao = {
            registradoEm: resposta?.controle?.registradoEm || '',
            usuario: resposta?.controle?.usuario || String(authState.usuario?.nome || ''),
            bm: resposta?.controle?.bm || '',
            observacao: texto
          };

          item.observacoesControle = Array.isArray(item.observacoesControle)
            ? item.observacoesControle.slice()
            : [];
          item.observacoesControle.push(novaObservacao);
          item.observacoesControle = item.observacoesControle.slice(-10);

          salvarEstadoAtualSugestoesNoCacheLocal_();
          renderizarSugestoesFiscalizacao_();

          await avisarGpv_(
            'A observação foi registrada e ficará disponível nas Sugestões, na Ficha e ao programar a vistoria.',
            'Observação salva',
            { tom: 'success' }
          );

          carregarSugestoesFiscalizacao_(true).catch(() => {});
        } catch (erro) {
          await avisarGpv_(
            erro?.message || 'Não foi possível registrar a observação.',
            'Não foi possível concluir',
            { tom: 'error' }
          );
        }
      }

      async function marcarSugestaoRegularizadaManual_(item) {
        if (!item || !usuarioPodeOperar_()) return;
        if (!navigator.onLine) {
          await avisarGpv_(
            'É necessário estar conectado para registrar a regularização desta edificação.',
            'Sem conexão',
            { tom: 'warning' }
          );
          return;
        }

        const titulo = item.nomeFantasia || item.razaoSocial || 'Edificação';
        const endereco = [item.endereco, item.numero, item.bairro, item.cidade]
          .filter(Boolean)
          .join(', ');

        const confirmou = await confirmarGpv_(
          `Confirma que esta edificação se encontra regularizada?\n\n${titulo}${endereco ? `\n${endereco}` : ''}\n\nEsta ação retira o local das Sugestões de Fiscalização, mas não altera a vistoria histórica.`,
          'Marcar como regularizado',
          {
            tom: 'warning',
            rotuloConfirmar: 'Sim, está regularizado'
          }
        );
        if (!confirmou) return;

        const observacao = await solicitarTextoGpv_(
          'Informe, se desejar, como a regularização foi conferida. Ex.: AVCB regularizado, conferido no INFOSCIP, situação verificada no local.',
          'Observação da regularização',
          {
            placeholder: 'Observação opcional',
            maxLength: 500,
            rotuloConfirmar: 'Registrar'
          }
        );
        if (observacao === null) return;

        try {
          const resposta = await apiRequest('config', {
            consulta: 'sugestao_regularizar',
            payload: payloadControleSugestaoFiscalizacao_(item, observacao)
          }, 30000);

          sugestoesFiscalizacao = sugestoesFiscalizacao.filter(
            s => String(s.identidade || '') !== String(item.identidade || '')
          );
          recalcularResumoSugestoesFiscalizacaoLocal_();
          salvarEstadoAtualSugestoesNoCacheLocal_();
          renderizarSugestoesFiscalizacao_();

          await avisarGpv_(
            `A edificação foi retirada das Sugestões de Fiscalização.${resposta?.controle?.usuario ? `\nRegistrado por: ${resposta.controle.usuario}.` : ''}`,
            'Regularização registrada',
            { tom: 'success' }
          );

          // Confere em segundo plano a lista integral já com o controle manual.
          carregarSugestoesFiscalizacao_(true).catch(() => {});
        } catch (erro) {
          await avisarGpv_(
            erro?.message || 'Não foi possível registrar a regularização.',
            'Não foi possível concluir',
            { tom: 'error' }
          );
        }
      }

      async function reabrirSugestaoFiscalizacaoManual_(controle) {
        if (!controle || !usuarioPodeOperar_()) return;
        if (!navigator.onLine) {
          await avisarGpv_(
            'É necessário estar conectado para reabrir esta sugestão.',
            'Sem conexão',
            { tom: 'warning' }
          );
          return;
        }

        const titulo = controle.nomeFantasia || 'Edificação';
        const endereco = [
          controle.endereco,
          controle.numero,
          controle.bairro,
          controle.cidade
        ].filter(Boolean).join(', ');

        const confirmou = await confirmarGpv_(
          `Deseja reabrir esta edificação nas Sugestões de Fiscalização?\n\n${titulo}${endereco ? `\n${endereco}` : ''}\n\nO registro anterior de regularização continuará preservado no histórico de controle.`,
          'Reabrir sugestão',
          {
            tom: 'warning',
            rotuloConfirmar: 'Reabrir sugestão'
          }
        );
        if (!confirmou) return;

        try {
          const resposta = await apiRequest('config', {
            consulta: 'sugestao_reabrir',
            payload: {
              identidade: controle.chave || '',
              cidade: controle.cidade || '',
              endereco: controle.endereco || '',
              numero: controle.numero || '',
              bairro: controle.bairro || '',
              nomeFantasia: controle.nomeFantasia || '',
              cnpj: controle.cnpj || '',
              pscip: controle.pscip || '',
              observacao: 'Reabertura manual da sugestão'
            }
          }, 30000);

          try { localStorage.removeItem(SUGGESTIONS_CACHE_STORAGE); } catch (erro) {}
          sugestoesFiscalizacaoCarregadas = false;
          sugestoesFiscalizacao = [];
          sugestoesFiscalizacaoGeradoEm = '';

          if (recordStatusRegistroAtual) {
            recordStatusRegistroAtual.controleSugestaoFiscalizacao =
              resposta?.controle || {
                ...controle,
                regularizadaManualmente: false,
                reaberta: true,
                acao: 'REABERTO'
              };
            renderizarFichaRegistro_(recordStatusRegistroAtual);
          }

          await avisarGpv_(
            'A edificação foi reaberta para voltar a ser considerada nas Sugestões de Fiscalização.',
            'Sugestão reaberta',
            { tom: 'success' }
          );

          carregarSugestoesFiscalizacao_(true).catch(() => {});
        } catch (erro) {
          await avisarGpv_(
            erro?.message || 'Não foi possível reabrir a sugestão.',
            'Não foi possível concluir',
            { tom: 'error' }
          );
        }
      }

      async function carregarSugestoesFiscalizacao_(forcarAtualizacao = false) {
        if (sugestoesFiscalizacaoAtualizando) return;

        const cacheLocal = lerCacheSugestoesFiscalizacaoLocal_();
        if (!sugestoesFiscalizacaoCarregadas && cacheLocal) {
          aplicarCacheSugestoesFiscalizacaoLocal_(cacheLocal);
          if (filtroPreparacoes === 'sugestoes') renderizarSugestoesFiscalizacao_();
        }

        if (!navigator.onLine) {
          renderizarSugestoesFiscalizacao_();
          return;
        }

        sugestoesFiscalizacaoAtualizando = true;
        if (inspectionSuggestionsRefreshBtn) {
          inspectionSuggestionsRefreshBtn.disabled = true;
          inspectionSuggestionsRefreshBtn.classList.add('is-loading');
          const span = inspectionSuggestionsRefreshBtn.querySelector('span');
          if (span) span.textContent = 'Atualizando...';
        }

        const exibindoCache = sugestoesFiscalizacaoCarregadas && sugestoesFiscalizacao.length >= 0;
        if (preparedInspectionsStatus && filtroPreparacoes === 'sugestoes') {
          preparedInspectionsStatus.textContent = forcarAtualizacao
            ? 'Recalculando as sugestões com os dados mais recentes...'
            : (exibindoCache
              ? 'Lista exibida imediatamente. Conferindo se há alterações em segundo plano...'
              : 'Localizando fiscalizações anteriores a 02/07/2025 ainda sem retorno...');
        }
        if (!exibindoCache) preparedInspectionsList?.classList.add('is-loading');

        try {
          const r = await apiRequest('config', {
            consulta: 'sugestoes_fiscalizacao',
            filtros: { limite: 200, forcarAtualizacao: Boolean(forcarAtualizacao) }
          }, 60000);
          sugestoesFiscalizacao = ordenarSugestoesFiscalizacaoCronologicamente_(
            Array.isArray(r?.itens) ? r.itens : []
          );
          resumoSugestoesFiscalizacao = r?.resumo || {
            total: sugestoesFiscalizacao.length,
            alta: sugestoesFiscalizacao.filter(i => normalize(i.prioridade) === normalize('Alta')).length,
            media: sugestoesFiscalizacao.filter(i => normalize(i.prioridade) === normalize('Média')).length,
            acompanhamento: sugestoesFiscalizacao.filter(i => normalize(i.prioridade) === normalize('Acompanhamento')).length
          };
          sugestoesFiscalizacaoGeradoEm = String(r?.geradoEm || new Date().toISOString());
          sugestoesFiscalizacaoCarregadas = true;
          salvarCacheSugestoesFiscalizacaoLocal_({
            itens: sugestoesFiscalizacao,
            resumo: resumoSugestoesFiscalizacao,
            geradoEm: sugestoesFiscalizacaoGeradoEm
          });
          atualizarResumoSugestoesUi_();
        } catch (erro) {
          if (sugestoesFiscalizacaoCarregadas && preparedInspectionsStatus && filtroPreparacoes === 'sugestoes') {
            preparedInspectionsStatus.textContent = 'Últimas sugestões válidas mantidas. A atualização do servidor está temporariamente indisponível.';
          } else if (preparedInspectionsStatus) {
            preparedInspectionsStatus.textContent = 'Não foi possível atualizar as sugestões agora. Tente novamente em instantes.';
          }
        } finally {
          sugestoesFiscalizacaoAtualizando = false;
          preparedInspectionsList?.classList.remove('is-loading');
          if (inspectionSuggestionsRefreshBtn) {
            inspectionSuggestionsRefreshBtn.disabled = false;
            inspectionSuggestionsRefreshBtn.classList.remove('is-loading');
            const span = inspectionSuggestionsRefreshBtn.querySelector('span');
            if (span) span.textContent = 'Atualizar agora';
          }
          if (filtroPreparacoes === 'sugestoes') renderizarSugestoesFiscalizacao_();
        }
      }

      function abrirSugestaoComoPreparacao_(item) {
        if (!item || !usuarioPodeOperar_()) return;
        fecharListaProgramadas_();
        abrirModalPreparacao_({ retornarProgramadas: true });

        const set = (id, valor) => {
          const el = document.getElementById(id);
          if (el && valor != null && String(valor).trim()) el.value = String(valor);
        };

        set('prepareTipo', 'fiscalizacao');
        set('prepareCidade', item.cidade || 'Viçosa');
        set('prepareDemanda', item.demandaPrincipal || 'Iniciativa');
        set('preparePscip', item.pscip ? projetoPscipOperacional_(item.pscip) : 'PRJ');
        set('prepareCnpj', item.cnpj || '');
        set('prepareNomeFantasia', item.nomeFantasia || '');
        set('prepareRazaoSocial', item.razaoSocial || '');
        set('prepareArea', item.area || '');
        set('prepareEndereco', item.endereco || '');
        set('prepareNumero', item.numero || '');
        set('prepareBairro', item.bairro || '');

        const observacoesOperacionais = Array.isArray(item.observacoesControle)
          ? item.observacoesControle
              .map(obs => {
                const cabecalho = [obs.registradoEm, obs.usuario].filter(Boolean).join(' • ');
                return `${cabecalho ? `[${cabecalho}] ` : ''}${String(obs.observacao || '').trim()}`;
              })
              .filter(Boolean)
              .join('\n')
          : '';

        set(
          'prepareObservacao',
          [
            item.observacaoPrevia || item.motivo || '',
            observacoesOperacionais
              ? `OBSERVAÇÕES OPERACIONAIS:\n${observacoesOperacionais}`
              : ''
          ].filter(Boolean).join('\n\n')
        );
        if (prepareVistoriador) prepareVistoriador.value = String(authState.usuario?.nome || '');

        const cnpjInput = document.getElementById('prepareCnpj');
        if (cnpjInput) {
          const numero = digits(cnpjInput.value || '').slice(0, 14);
          cnpjInput.value = numero.length > 11 ? formatarCnpjTela_(numero) : numero;
        }
        atualizarCamposPreparacaoPorTipo_();
        if (prepareInspectionError) prepareInspectionError.hidden = true;
        const titulo = document.getElementById('prepareInspectionTitle');
        if (titulo) titulo.textContent = 'Programar fiscalização sugerida';
      }

      function renderizarPreparacoesVistoria_() {
        if (filtroPreparacoes === 'sugestoes') {
          renderizarSugestoesFiscalizacao_();
          return;
        }
        atualizarVisibilidadeProgramadasMobile_();
        atualizarIndicadorPreparacoesUsuario_();
        atualizarAlertaPrazosProgramados_();
        if (!preparedInspectionsList) return;
        const meuNome = String(authState.usuario?.nome || '').trim();
        const lista = preparacoesVistoria
          .filter(item => {
            if (filtroPreparacoes === 'minhas') return Boolean(meuNome) && normalize(item?.vistoriadorResponsavel) === normalize(meuNome);
            return filtroPreparacoes === 'todas' || item.tipoPreparacao === filtroPreparacoes;
          })
          .slice()
          .sort((a, b) => {
            const aMinha = meuNome && normalize(a?.vistoriadorResponsavel) === normalize(meuNome) ? 0 : 1;
            const bMinha = meuNome && normalize(b?.vistoriadorResponsavel) === normalize(meuNome) ? 0 : 1;
            if (aMinha !== bMinha) return aMinha - bMinha;
            const pa = classificarPrazoProgramacao_(a);
            const pb = classificarPrazoProgramacao_(b);
            if (pa.prioridade !== pb.prioridade) return pa.prioridade - pb.prioridade;
            const aLib = a?.tipoPreparacao === 'liberacao' ? 0 : 1;
            const bLib = b?.tipoPreparacao === 'liberacao' ? 0 : 1;
            if (aLib !== bLib) return aLib - bLib;
            return String(a?.dataPrevista || '9999-12-31').localeCompare(String(b?.dataPrevista || '9999-12-31'));
          });
        if (!lista.length) {
          preparedInspectionsList.innerHTML = '<div class="prepared-empty">Nenhuma vistoria programada neste filtro.</div>';
          return;
        }
        const card = item => {
          const liberacao = item.tipoPreparacao === 'liberacao';
          const eventoDeclaratorio = normalize(item.demandaPrincipal || '') === normalize('Eventos declaratórios') || Boolean(item.eventoDeclaracaoNumero);
          const pscipCard = item.pscip ? projetoPscipOperacional_(item.pscip) : '';
          const identificadorPrincipal = eventoDeclaratorio
            ? (item.eventoDeclaracaoNumero ? `Declaração ${formatarDeclaracaoEvento_(item.eventoDeclaracaoNumero)}` : 'Evento declaratório')
            : (pscipCard || 'Sem PSCIP informado');
          const titulo = item.nomeFantasia || item.razaoSocial || (eventoDeclaratorio ? item.eventoDeclaracaoNumero : pscipCard) || 'Vistoria programada';
          const endereco = [item.endereco, item.numero, item.bairro, item.cidade].filter(Boolean).join(', ');
          const prazo = classificarPrazoProgramacao_(item);
          return `<article class="prepared-card programmed-card ${prazo.classe}${liberacao ? ' is-release' : ''}" data-preparacao-id="${escapeAttr(item.id)}" tabindex="0" role="button" aria-label="Abrir vistoria programada: ${escapeAttr(titulo)}">
            <div class="prepared-card-main">
              <div class="prepared-card-top"><span class="prepared-kind ${liberacao ? 'release' : 'inspection'}">${liberacao ? 'Liberação' : (eventoDeclaratorio ? 'Evento declaratório' : 'Fiscalização')}</span><span class="program-deadline-badge ${prazo.classe}">${escapeHtml(prazo.rotulo)}</span><strong>${escapeHtml(formatarDataPreparacao_(item.dataPrevista))}</strong></div>
              <h3>${escapeHtml(titulo)}</h3>
              <p class="prepared-identifiers">${escapeHtml(identificadorPrincipal)}${item.pf ? ` <span aria-hidden="true">•</span> PF ${escapeHtml(item.pf)}` : ''}${item.area && !eventoDeclaratorio ? ` <span aria-hidden="true">•</span> ${escapeHtml(item.area)} m²` : ''}</p>
              <p class="prepared-address">${escapeHtml(endereco || 'Endereço ainda não informado')}</p>
              <p class="prepared-inspector"><b>Vistoriador:</b> ${escapeHtml(item.vistoriadorResponsavel || 'Não definido')}</p>
            </div>
            <div class="prepared-card-actions">
              ${item.arquivoDwgUrl ? `<a class="btn btn-secondary" href="${escapeAttr(item.arquivoDwgUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Abrir arquivo</a>` : ''}
              <button type="button" class="btn btn-secondary prepared-edit-btn" data-preparacao-edit-id="${escapeAttr(item.id)}" aria-label="Editar programação de ${escapeAttr(titulo)}">Editar</button>
              <button type="button" class="btn btn-secondary prepared-delete-btn" data-preparacao-delete-id="${escapeAttr(item.id)}" aria-label="Excluir programação de ${escapeAttr(titulo)}">Excluir</button>
              ${item.vistoriaIniciada ? `<button type="button" class="btn btn-secondary prepared-cancel-fill-btn" data-preparacao-cancel-fill-id="${escapeAttr(item.id)}">Cancelar preenchimento</button>` : ''}
              <button type="button" class="btn btn-primary prepared-open-btn" data-preparacao-id="${escapeAttr(item.id)}">${item.vistoriaIniciada ? 'Continuar vistoria' : 'Abrir vistoria'}</button>
            </div>
          </article>`;
        };
        if (filtroPreparacoes === 'liberacao') {
          const grupos = ['Sgt Galliano', 'Sgt Buonicontro'];
          const blocos = grupos.map(nome => {
            const itens = lista.filter(item => normalize(item.vistoriadorResponsavel) === normalize(nome));
            return `<section class="prepared-group"><h3>${escapeHtml(nome)}</h3>${itens.length ? itens.map(card).join('') : '<div class="prepared-empty">Nenhuma liberação programada.</div>'}</section>`;
          });
          const outros = lista.filter(item => !grupos.some(nome => normalize(item.vistoriadorResponsavel) === normalize(nome)));
          if (outros.length) blocos.push(`<section class="prepared-group"><h3>Outros responsáveis</h3>${outros.map(card).join('')}</section>`);
          preparedInspectionsList.innerHTML = blocos.join('');
        } else {
          preparedInspectionsList.innerHTML = lista.map(card).join('');
        }
      }

      async function carregarPreparacoesVistoria_() {
        const inicioLoadingProgramadas = Date.now();
        const tempoMinimoLoading = 250;
        const cacheKey = 'gpv_preparacoes_cache_v1';
        let cachePreparacoes = [];
        try { cachePreparacoes = JSON.parse(localStorage.getItem(cacheKey) || '[]') || []; } catch (e) { cachePreparacoes = []; }
        const tinhaCache = Array.isArray(cachePreparacoes) && cachePreparacoes.length > 0;

        if (tinhaCache) {
          preparacoesVistoria = cachePreparacoes;
          renderizarPreparacoesVistoria_();
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = navigator.onLine
            ? 'Última lista sincronizada — atualizando...'
            : 'Offline — exibindo a última lista sincronizada.';
        }

        if (!navigator.onLine) {
          if (!tinhaCache) {
            preparacoesVistoria = [];
            renderizarPreparacoesVistoria_();
            if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = 'Offline — nenhuma programação armazenada neste aparelho.';
          }
          return;
        }

        if (!tinhaCache) {
          if (programmedSummaryRow) programmedSummaryRow.hidden = true;
          preparedInspectionsList?.classList.add('is-loading');
          if (preparedInspectionsList) {
            preparedInspectionsList.innerHTML = `
              <div class="prepared-loading-track" role="status" aria-live="polite" aria-label="Atualizando vistorias programadas">
                <span class="prepared-loading-track-knob" aria-hidden="true"></span>
              </div>`;
          }
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = 'Atualizando vistorias programadas...';
        }
        try {
          const r = await apiRequest('config', { consulta: 'programadas' }, 20000);
          const novasPreparacoes = Array.isArray(r?.itens) ? r.itens : [];
          const espera = Math.max(0, tempoMinimoLoading - (Date.now() - inicioLoadingProgramadas));
          if (espera && !tinhaCache) await new Promise(resolve => setTimeout(resolve, espera));
          preparacoesVistoria = novasPreparacoes;
          try { localStorage.setItem(cacheKey, JSON.stringify(preparacoesVistoria)); } catch (e) {}
          preparedInspectionsList?.classList.remove('is-loading');
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = preparacoesVistoria.length === 1 ? '1 vistoria pendente.' : `${preparacoesVistoria.length} vistorias pendentes.`;
          renderizarPreparacoesVistoria_();
        } catch (erro) {
          const espera = Math.max(0, tempoMinimoLoading - (Date.now() - inicioLoadingProgramadas));
          if (espera && !tinhaCache) await new Promise(resolve => setTimeout(resolve, espera));
          preparacoesVistoria = cachePreparacoes;
          preparedInspectionsList?.classList.remove('is-loading');
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = cachePreparacoes.length
            ? 'Não foi possível atualizar agora — exibindo a última lista sincronizada.'
            : 'Não foi possível atualizar as programações agora.';
          renderizarPreparacoesVistoria_();
        }
      }

      async function excluirPreparacaoVistoria_(item) {
        if (!item?.id) return;
        const titulo = item.nomeFantasia || item.razaoSocial || item.pscip || 'esta vistoria programada';
        const confirmar = await confirmarGpv_(
          `A programação de "${titulo}" sairá da lista de Vistorias Programadas. Nenhuma vistoria já concluída será apagada.`,
          'Excluir programação?',
          { tom: 'danger', rotuloConfirmar: 'Excluir programação' }
        );
        if (!confirmar) return;
        if (!navigator.onLine) {
          appStatus.textContent = 'É necessário estar online para excluir uma programação.';
          return;
        }
        appStatus.textContent = 'Excluindo programação...';
        try {
          await apiRequest('config', { consulta: 'programada_excluir', id: String(item.id) }, 20000);
          preparacoesVistoria = preparacoesVistoria.filter(p => String(p.id) !== String(item.id));
          try { localStorage.setItem('gpv_preparacoes_cache_v1', JSON.stringify(preparacoesVistoria)); } catch (e) {}
          renderizarPreparacoesVistoria_();
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = preparacoesVistoria.length === 1 ? '1 vistoria pendente.' : `${preparacoesVistoria.length} vistorias pendentes.`;
          appStatus.textContent = 'Programação excluída.';
        } catch (erro) {
          appStatus.textContent = erro?.message || 'Não foi possível excluir a programação.';
        }
      }

      // V23.9.61 — navegação e acabamento do modal de Vistorias Programadas.
      // Ao escolher uma vistoria, o painel inicial sai do fluxo e Cidade passa a ser o início do formulário.
      function garantirBarraRetornoProgramadas_() {
        const cidadeSecao = document.getElementById('cidadeSecao');
        if (!cidadeSecao) return null;
        let barra = document.getElementById('programmedReturnBar');
        if (!barra) {
          barra = document.createElement('div');
          barra.id = 'programmedReturnBar';
          barra.hidden = true;
          barra.className = 'programmed-return-bar';
          barra.setAttribute('aria-label', 'Navegação da vistoria programada');
          barra.innerHTML = `
            <button type="button" class="btn btn-secondary programmed-return-btn" id="returnToProgrammedBtn">
              <span aria-hidden="true">←</span><span>Vistorias programadas</span>
            </button>
            <button type="button" class="btn btn-secondary programmed-home-btn" id="returnToInspectionHomeBtn">
              <span class="programmed-home-icon" aria-hidden="true">⌂</span><span>Início da Vistoria</span>
            </button>`;
          cidadeSecao.insertBefore(barra, cidadeSecao.firstChild);
          barra.querySelector('#returnToProgrammedBtn')?.addEventListener('click', () => {
            restaurarPainelProgramadas_(true);
            abrirListaProgramadas_(true);
          });
          barra.querySelector('#returnToInspectionHomeBtn')?.addEventListener('click', () => {
            // Apenas volta ao início visual da aba Vistoria. Os dados carregados permanecem no formulário.
            restaurarPainelProgramadas_(true);
          });
        }

        // O cancelamento pertence à vistoria programada já iniciada. Reposiciona
        // o mesmo botão e preserva o fluxo compartilhado já validado.
        const cancelarInicioBtn = document.getElementById('activeInspectionCancelBtn');
        if (cancelarInicioBtn && cancelarInicioBtn.parentElement !== barra) {
          cancelarInicioBtn.classList.add('programmed-cancel-start-btn');
          cancelarInicioBtn.textContent = 'Cancelar início da vistoria';
          cancelarInicioBtn.title = 'Cancelar esta vistoria iniciada e manter a programação disponível';
          barra.appendChild(cancelarInicioBtn);
        }
        return barra;
      }

      function restaurarPainelProgramadas_(rolar = false) {
        const barra = document.getElementById('programmedReturnBar');
        if (barra) barra.hidden = true;
        document.body.classList.remove('programmed-form-focused');
        if (form) form.removeAttribute('data-programmed-fill-mode');
        if (tipoVistoriaSecao) {
          tipoVistoriaSecao.hidden = false;
          tipoVistoriaSecao.removeAttribute('aria-hidden');
        }
        document.documentElement.dataset.formProgramadoVersion = '23.9.61';
        if (rolar && tipoVistoriaSecao) requestAnimationFrame(() => {
          try { tipoVistoriaSecao.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {}
        });
      }

      function rolarParaFormularioProgramado_() {
        const cidadeSecao = document.getElementById('cidadeSecao');
        if (!cidadeSecao || !tipoVistoriaSecao) return;
        const barra = garantirBarraRetornoProgramadas_();
        fecharListaProgramadas_();
        try { document.activeElement?.blur?.(); } catch (e) {}
        tipoVistoriaSecao.hidden = true;
        tipoVistoriaSecao.setAttribute('aria-hidden', 'true');
        cidadeSecao.hidden = false;
        if (barra) barra.hidden = false;
        document.body.classList.remove('programmed-form-focused');
        form?.removeAttribute('data-programmed-fill-mode');
        document.documentElement.dataset.formProgramadoVersion = '23.9.61';

        // Como a lista saiu da página inicial, Cidade ocupa o espaço do painel removido.
        // O scroll é apenas um ajuste final; a navegação não depende dele para funcionar.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          try { cidadeSecao.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {}
        }));
      }

      function atualizarBotaoCancelarPreenchimentoTopo_() {
        const ativo = Boolean(preparacaoEmUsoId && currentRecordId && usuarioPodeOperar_());
        const btn = document.getElementById('activeInspectionCancelBtn');
        const notifBtn = document.getElementById('activeInspectionNotificationsBtn');
        const modoAuxiliar = modoAcessoAuxiliarNotificacoesAtivo_();
        if (btn) btn.hidden = !ativo || modoAuxiliar;
        if (notifBtn) notifBtn.hidden = !ativo || modoAuxiliar;
        if (notificacoesCompartilharAuxBtn) notificacoesCompartilharAuxBtn.hidden = modoAuxiliar;
        if (notificacoesRevisarBtn) notificacoesRevisarBtn.hidden = modoAuxiliar;
      }

      function atualizarTextoTecnicoIrregularidade_(item) {
        if(!item?.id) return;
        const box=document.querySelector(`[data-notification-technical="${CSS.escape(String(item.id))}"]`);
        if(!box) return;
        const titulo=box.querySelector('strong'), texto=box.querySelector('[data-notification-technical-text]'), nota=box.querySelector('[data-notification-technical-note]');
        if(titulo) titulo.textContent=item.statusTecnico==='sugerido'?'✓ Texto técnico fundamentado':'Referência normativa pendente';
        if(texto) texto.textContent=item.textoTecnico||'A redação técnica será preparada após a descrição da irregularidade.';
        if(nota) nota.hidden=item.statusTecnico!=='conferencia';
        box.classList.toggle('needs-review',item.statusTecnico==='conferencia');
      }

      function confirmarCancelamentoPreenchimento_(titulo) {
        return new Promise(resolve => {
          const modal = document.getElementById('cancelFillModal');
          const listaProgramadasEstavaAberta = Boolean(programmedListModal && !programmedListModal.hidden);
          if (listaProgramadasEstavaAberta) programmedListModal.hidden = true;
          const nome = document.getElementById('cancelFillName');
          const voltar = document.getElementById('cancelFillBackBtn');
          const confirmar = document.getElementById('cancelFillConfirmBtn');
          const fechar = document.getElementById('cancelFillCloseBtn');
          if (!modal || !voltar || !confirmar) return resolve(false);
          if (nome) nome.textContent = String(titulo || 'esta vistoria');
          modal.hidden = false;
          document.body.classList.add('review-open');
          let finalizado = false;
          const encerrar = resultado => {
            if (finalizado) return;
            finalizado = true;
            modal.hidden = true;
            document.body.classList.remove('review-open');
            if (!resultado && listaProgramadasEstavaAberta && programmedListModal) programmedListModal.hidden = false;
            voltar.removeEventListener('click', onVoltar);
            confirmar.removeEventListener('click', onConfirmar);
            fechar?.removeEventListener('click', onVoltar);
            modal.removeEventListener('click', onFundo);
            document.removeEventListener('keydown', onKey);
            resolve(resultado);
          };
          const onVoltar = () => encerrar(false);
          const onConfirmar = () => encerrar(true);
          const onFundo = e => { if (e.target === modal) onVoltar(); };
          const onKey = e => { if (e.key === 'Escape') onVoltar(); };
          voltar.addEventListener('click', onVoltar);
          confirmar.addEventListener('click', onConfirmar);
          fechar?.addEventListener('click', onVoltar);
          modal.addEventListener('click', onFundo);
          document.addEventListener('keydown', onKey);
          setTimeout(() => voltar.focus(), 30);
        });
      }

      async function cancelarPreenchimentoAtual_() {
        if (!preparacaoEmUsoId || !currentRecordId) return;
        const titulo = value('nomeFantasia') || value('razaoSocial') || value('endereco') || 'esta vistoria';
        if (!await confirmarCancelamentoPreenchimento_(titulo)) return;

        if (!navigator.onLine) {
          appStatus.textContent = 'É necessária internet para cancelar o preenchimento compartilhado.';
          return;
        }

        const preparacaoId = String(preparacaoEmUsoId);
        const rascunhoId = String(currentRecordId);
        const btn = document.getElementById('activeInspectionCancelBtn');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Cancelando...';
        }

        try {
          await apiRequest('config', {
            consulta: 'rascunho_cancelar',
            id: rascunhoId,
            preparacaoId
          }, 12000);

          removerRascunhoLocal_(rascunhoId);

          preparacoesVistoria = preparacoesVistoria.map(p => {
            if (String(p.id) !== preparacaoId) return p;
            return { ...p, vistoriaIniciada: false, rascunhoId: '' };
          });
          try {
            localStorage.setItem('gpv_preparacoes_cache_v1', JSON.stringify(preparacoesVistoria));
          } catch (e) {}

          resetForm(true);
          renderizarPreparacoesVistoria_();
          abrirListaProgramadas_(true);
          if (preparedInspectionsStatus) {
            preparedInspectionsStatus.textContent = '✓ Início cancelado. A vistoria programada foi mantida e pode ser iniciada pelo militar correto.';
          }
          appStatus.textContent = 'Início da vistoria cancelado. A programação foi mantida.';
        } catch (e) {
          appStatus.textContent = e?.message || 'Não foi possível cancelar o preenchimento.';
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Cancelar início da vistoria';
          }
        }
      }

      async function cancelarPreenchimentoPreparacao_(item) {
        if (!item?.vistoriaIniciada || !item?.rascunhoId) return;
        const titulo = item.nomeFantasia || item.razaoSocial || item.endereco || 'esta vistoria';
        const confirmar = await confirmarCancelamentoPreenchimento_(titulo);
        if (!confirmar) return;
        if (!navigator.onLine) {
          if (programmedListModal) programmedListModal.hidden = false;
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = 'É necessária internet para cancelar um preenchimento compartilhado.';
          return;
        }

        const preparacaoId = String(item.id || '');
        const rascunhoId = String(item.rascunhoId || '');
        try {
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = 'Cancelando preenchimento...';

          await apiRequest('config', {
            consulta: 'rascunho_cancelar',
            id: rascunhoId,
            preparacaoId
          }, 12000);

          removerRascunhoLocal_(rascunhoId);
          if (String(currentRecordId) === rascunhoId) resetForm(true);

          // Atualização visual imediata: não espera uma nova consulta para o usuário saber que cancelou.
          preparacoesVistoria = preparacoesVistoria.map(p => {
            if (String(p.id) !== preparacaoId) return p;
            return { ...p, vistoriaIniciada: false, rascunhoId: '' };
          });
          try {
            localStorage.setItem('gpv_preparacoes_cache_v1', JSON.stringify(preparacoesVistoria));
          } catch (e) {}

          renderizarPreparacoesVistoria_();
          if (programmedListModal) programmedListModal.hidden = false;
          if (preparedInspectionsStatus) {
            preparedInspectionsStatus.textContent = '✓ Preenchimento cancelado. A vistoria programada foi mantida e pode ser iniciada novamente.';
          }

          // Confere o estado oficial em segundo plano, sem bloquear a interface.
          carregarPreparacoesVistoria_().catch(() => {});
        } catch (erro) {
          if (programmedListModal) programmedListModal.hidden = false;
          if (preparedInspectionsStatus) {
            preparedInspectionsStatus.textContent = erro?.message || 'Não foi possível cancelar o preenchimento.';
          }
        }
      }


      function resetarEstadoEscolhaInicioVistoria_() {
        const modal = document.getElementById('inspectionStartChoiceModal');
        const fechar = document.getElementById('inspectionStartChoiceClose');
        const formBtn = document.getElementById('inspectionStartFormBtn');
        const notifBtn = document.getElementById('inspectionStartNotificationsBtn');

        [formBtn, notifBtn].forEach(btn => {
          if (!btn) return;
          btn.disabled = false;
          btn.classList.remove('is-loading');
          const strong = btn.querySelector('strong');
          if (strong) strong.textContent = btn === formBtn ? 'Iniciar preenchimento' : 'Lançar notificações';
        });
        if (fechar) fechar.disabled = false;
        if (modal) {
          modal.removeAttribute('data-loading');
          modal.removeAttribute('data-loading-at');
        }
      }

      function fecharEscolhaInicioVistoria_() {
        const modal = document.getElementById('inspectionStartChoiceModal');
        if (modal) modal.hidden = true;
        document.body.classList.remove('inspection-start-choice-open');
        resetarEstadoEscolhaInicioVistoria_();
      }

      function escolherInicioVistoriaProgramada_() {
        return new Promise(resolve => {
          const modal = document.getElementById('inspectionStartChoiceModal');
          const fechar = document.getElementById('inspectionStartChoiceClose');
          const formBtn = document.getElementById('inspectionStartFormBtn');
          const notifBtn = document.getElementById('inspectionStartNotificationsBtn');
          if (!modal || !formBtn || !notifBtn) return resolve('form');

          resetarEstadoEscolhaInicioVistoria_();
          modal.hidden = false;
          document.body.classList.add('inspection-start-choice-open');

          let finalizado = false;
          const limparEventos = () => {
            fechar?.removeEventListener('click', cancelar);
            formBtn.removeEventListener('click', iniciarForm);
            notifBtn.removeEventListener('click', iniciarNotif);
            modal.removeEventListener('click', clicarFundo);
            document.removeEventListener('keydown', tecla);
          };
          const concluir = escolha => {
            if (finalizado) return;
            finalizado = true;
            limparEventos();

            if (!escolha) {
              fecharEscolhaInicioVistoria_();
              resolve('');
              return;
            }

            modal.dataset.loading = '1';
            modal.dataset.loadingAt = String(Date.now());
            formBtn.disabled = true;
            notifBtn.disabled = true;
            if (fechar) fechar.disabled = true;

            const escolhido = escolha === 'notificacoes' ? notifBtn : formBtn;
            escolhido.classList.add('is-loading');
            const titulo = escolhido.querySelector('strong');
            if (titulo) titulo.textContent = 'Abrindo vistoria...';
            resolve(escolha);
          };

          const cancelar = () => concluir('');
          const iniciarForm = () => concluir('form');
          const iniciarNotif = () => concluir('notificacoes');
          const clicarFundo = event => {
            if (event.target === modal && modal.dataset.loading !== '1') cancelar();
          };
          const tecla = event => {
            if (event.key === 'Escape' && modal.dataset.loading !== '1') cancelar();
          };

          fechar?.addEventListener('click', cancelar);
          formBtn.addEventListener('click', iniciarForm);
          notifBtn.addEventListener('click', iniciarNotif);
          modal.addEventListener('click', clicarFundo);
          document.addEventListener('keydown', tecla);
          setTimeout(() => notifBtn.focus(), 30);
        });
      }

      function rolarParaNotificacoesProgramadas_() {
        const secao = document.getElementById('notificacoesLiberacaoSecao');
        if (!secao || secao.hidden) {
          appStatus.textContent = 'A área de notificações está disponível nas vistorias de liberação.';
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
          try { secao.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        }));
      }

      async function abrirPreparacaoComEscolha_(item) {
        if (!item) return;
        const ehLiberacao = item.tipoPreparacao === 'liberacao' || normalize(item.tipoVistoria || '').includes('liberacao');
        const escolha = ehLiberacao ? await escolherInicioVistoriaProgramada_() : 'form';
        if (!escolha) return;

        let carregou = false;
        try {
          carregou = await aplicarPreparacaoAoFormulario_(item);
        } finally {
          if (ehLiberacao) fecharEscolhaInicioVistoria_();
        }

        if (!carregou) {
          if (programmedListModal) programmedListModal.hidden = false;
          return;
        }

        if (escolha === 'notificacoes') {
          setTimeout(rolarParaNotificacoesProgramadas_, 140);
        }
      }

      async function aplicarPreparacaoAoFormulario_(item) {
        if (!item) return false;

        // V23.9.97: se a programação já foi iniciada em qualquer aparelho,
        // abre o rascunho compartilhado em vez de criar outra vistoria.
        if (item.vistoriaIniciada && item.rascunhoId && navigator.onLine) {
          try {
            if (rascunhoEmAndamento_()) {
              saveDraft();
              await sincronizarRascunhoCompartilhado_('em_andamento', true);
            }
            const detalhe = await apiRequest('config', { consulta: 'rascunho', id: String(item.rascunhoId) }, 20000);
            if (!detalhe?.payload) throw new Error('Rascunho compartilhado não encontrado.');
            currentRecordId = String(item.rascunhoId || currentRecordId);
            applyPayload(detalhe.payload, item.rascunhoId);
            preparacaoEmUsoId = String(item.id || preparacaoEmUsoId || '');
            atualizarBotaoCancelarPreenchimentoTopo_();
            saveDraft();
            rolarParaFormularioProgramado_();
            appStatus.textContent = `Vistoria em andamento carregada${detalhe.atualizadoPor ? ` — última atualização: ${detalhe.atualizadoPor}` : ''}.`;
            return true;
          } catch (erro) {
            appStatus.textContent = erro?.message || 'Não foi possível carregar a vistoria em andamento.';
            return false;
          }
        }

        if (!prepararFormularioNovaVistoria_('Vistoria programada')) return false;
        preparacaoEmUsoId = String(item.id || '');
        atualizarBotaoCancelarPreenchimentoTopo_();
        aplicarFluxoVistoria_(item.tipoPreparacao === 'liberacao' ? 'liberacao' : 'fiscalizacao', { silencioso: true });
        const set = (id, valor) => { const el = document.getElementById(id); if (el && valor != null && String(valor) !== '') el.value = String(valor); };
        set('vistoriadorResponsavel', item.vistoriadorResponsavel);
        set('nomeFantasia', item.nomeFantasia);
        set('razaoSocial', item.razaoSocial);
        set('cnpj', item.cnpj || item.cpf);
        set('endereco', item.endereco);
        set('numero', item.numero);
        set('bairro', item.bairro);
        set('pf', item.pf);
        set('area', item.area);
        const preparacaoEventoDeclaratorio = normalize(item.demandaPrincipal || '') === normalize('Eventos declaratórios') || Boolean(item.eventoDeclaracaoNumero);
        if (!preparacaoEventoDeclaratorio && item.demandaPrincipal) {
          set('demandaPrincipal', item.demandaPrincipal);
        }
        if (preparacaoEventoDeclaratorio) {
          set('demandaPrincipal', 'Eventos declaratórios');
          aplicarModoEventoDeclaratorio_({ silencioso: true });
          set('eventoDeclaracaoNumero', formatarDeclaracaoEvento_(item.eventoDeclaracaoNumero || ''));
          if (possuiPscipSelect) possuiPscipSelect.value = '';
          if (pscipInput) pscipInput.value = '';
          syncPscip_();
        } else if (item.pscip) {
          if (possuiPscipSelect) possuiPscipSelect.value='sim';
          set('pscip', projetoPscipOperacional_(item.pscip));
          syncPscip_();
        }
        if (item.dataRenovacaoAvcb) {
          set('dataRenovacaoAvcb', formatarDataRenovacaoAvcbDigitacao_(item.dataRenovacaoAvcb));
        }
        aplicarModoEventoDeclaratorio_({ silencioso: true });
        atualizarCampoRenovacaoAvcb_();
        if (item.cidade) {
          const existe = Array.from(citySelect.options).some(o => normalize(o.value) === normalize(item.cidade));
          if (existe) citySelect.value = Array.from(citySelect.options).find(o => normalize(o.value) === normalize(item.cidade)).value;
          else { citySelect.value = 'Outro'; if (otherCity) otherCity.value = item.cidade; }
          syncOtherCity();
        }
        applyIdentificadorMask();
        atualizarVerificacaoMetasFiscalizacao_();
        scheduleDraftSave();
        agendarConsultaProcessoPf_('form', 180);
        rolarParaFormularioProgramado_();
        appStatus.textContent = `Vistoria programada carregada${item.vistoriadorResponsavel ? ` — responsável: ${item.vistoriadorResponsavel}` : ''}.`;
        return true;
      }

      function conexaoAdequadaParaPreaquecimento_() {
        const conexao = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conexao?.saveData) return false;
        const tipo = String(conexao?.effectiveType || '').toLowerCase();
        return !['slow-2g', '2g'].includes(tipo);
      }

      function agendarCargaAuxiliarProgressiva_() {
        if (!navigator.onLine || !usuarioPodeOperar_()) return;

        // Após muitas horas/dias sem uso, evita três consultas simultâneas logo na abertura.
        // A interface usa o que estiver salvo e confirma os dados atuais em etapas.
        const longaPausa = appRetomadaAposLongaPausa_;
        const atrasos = longaPausa
          ? { usuarios: 900, programadas: 2200, ddu: 3800, painel: 16000 }
          : { usuarios: 350, programadas: 1000, ddu: 1900, painel: 8000 };

        setTimeout(() => { if (document.visibilityState === 'visible' && navigator.onLine) void carregarUsuariosVistoriadores_(); }, atrasos.usuarios);
        setTimeout(() => { if (document.visibilityState === 'visible' && navigator.onLine) void carregarPreparacoesVistoria_(); }, atrasos.programadas);
        setTimeout(() => { if (document.visibilityState === 'visible' && navigator.onLine) void carregarDdUs_(); }, atrasos.ddu);
        setTimeout(() => {
          if (
            document.visibilityState === 'visible' &&
            navigator.onLine &&
            !document.body.classList.contains('records-mode') &&
            conexaoAdequadaParaPreaquecimento_()
          ) void preaquecerPainel_();
        }, atrasos.painel);
      }

      async function loadInitialData() {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null'); } catch (e) {}
        aplicarConfig(cached || DEFAULT_CONFIG);
        aplicarPermissoesInterface_();
        if (usuarioPodeOperar_()) restoreDraft();
        else if (authState.usuario?.nome) {
          usuariosAtivosApp = [{ nome: authState.usuario.nome }];
          preencherVistoriadores_();
          if (vistoriadorResponsavelSelect) vistoriadorResponsavelSelect.value = authState.usuario.nome;
          if (prepareVistoriador) prepareVistoriador.value = authState.usuario.nome;
        }
        atualizarNomeDispositivoUi_();
        loadingOverlay.classList.remove('show');
        atualizarStatusConexao();
        appStatus.textContent = usuarioPodeOperar_()
          ? (navigator.onLine ? 'Aplicativo pronto. Sincronizando configurações...' : 'Modo offline — aplicativo pronto para preenchimento.')
          : (navigator.onLine ? 'Aplicativo pronto para consulta e treinamento. Atualizando dados...' : 'Sem internet — consultas salvas e preenchimento para conhecimento continuam disponíveis.');

        // Dados auxiliares armazenados são aplicados antes de qualquer consulta online.
        aplicarCacheVistoriadores_();
        if (usuarioPodeOperar_()) {
          try {
            const cacheProgramadas = JSON.parse(localStorage.getItem('gpv_preparacoes_cache_v1') || '[]');
            if (Array.isArray(cacheProgramadas) && cacheProgramadas.length) {
              preparacoesVistoria = cacheProgramadas;
              renderizarPreparacoesVistoria_();
            }
          } catch (_) {}
          aplicarCacheDdus_();
        }

        if (navigator.onLine) {
          const sincronizarConfigOnline_ = async () => {
            try {
              const data = await apiRequest('config', {}, 30000);
              aplicarConfig(data);
              try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
              appStatus.textContent = usuarioPodeOperar_() ? 'Sistema pronto para registrar vistoria.' : 'Sistema pronto para consulta e treinamento.';
            } catch (error) {
              appStatus.textContent = cached ? 'Aplicativo pronto com configuração armazenada.' : 'Aplicativo pronto com configuração padrão.';
              if (!cached) showError('A configuração online não pôde ser atualizada agora. O preenchimento continua disponível.');
            }
          };

          // V23.9.47: em aparelhos já sincronizados, a configuração armazenada libera a tela
          // imediatamente. A conferência online ocorre depois, sem prolongar o "Carregando".
          if (cached) setTimeout(() => { void sincronizarConfigOnline_(); }, 1600);
          else await sincronizarConfigOnline_();

          if (usuarioPodeOperar_() && obterPendentes().length) setTimeout(() => enviarPendentes(true), 900);
        }

        const vistaForcada = vistaInicialDaUrl_();
        const vistaInicial = usuarioPodeOperar_() ? (vistaForcada || vistaInicialPorDispositivo_()) : 'records';

        if (vistaInicial === 'records') {
          if (vistaForcada) mostrarVistaPlanilha_();
          else {
            marcarAbaApp_('records');
            carregarRegistros_(true, { forcar: true, motivo: 'restauração do Painel' });
          }
        } else {
          marcarAbaApp_('form');
        }
        inicializarNavegacaoGlobal_(vistaInicial);

        const acessoAuxiliarId = idAcessoAuxiliarNotificacoesUrl_();
        if (acessoAuxiliarId && usuarioPodeOperar_()) {
          await abrirAcessoAuxiliarNotificacoes_(acessoAuxiliarId);
        } else if (acessoAuxiliarId && !usuarioPodeOperar_()) {
          appStatus.textContent = 'Este link de notificações exige um usuário com perfil GPV.';
        }

        // V23.9.99bz: retomada rápida após horas/dias sem uso. Dados auxiliares
        // são confirmados de forma progressiva para não disputar a conexão na abertura.
        if (navigator.onLine && usuarioPodeOperar_()) {
          setTimeout(() => { void processarFilaFotosPendentes_(); }, appRetomadaAposLongaPausa_ ? 7000 : 3000);
          agendarCargaAuxiliarProgressiva_();
        }
      }

      fluxoFiscalizacaoBtn?.addEventListener('click', () => aplicarFluxoVistoria_('fiscalizacao'));
      fluxoLiberacaoBtn?.addEventListener('click', () => aplicarFluxoVistoria_('liberacao'));
      document.getElementById('partialBtn')?.addEventListener('click', concluirParcialmente_);
      document.getElementById('continueSharedBtn')?.addEventListener('click', continuarRascunhoCompartilhado_);
      loggedUserBadge?.addEventListener('click', abrirPreparacoesDoUsuario_);
      loggedUserBadge?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirPreparacoesDoUsuario_(); }
      });
      appMoreMenuCloseBtn?.addEventListener('click', fecharMenuMais_);
      goalsMenuBtn?.addEventListener('click', abrirMetas_);
      dashboardGoalsOpenBtn?.addEventListener('click', abrirMetas_);
      dashboardGoalsPanel?.addEventListener('dblclick', abrirMetas_);
      goalsModalCloseBtn?.addEventListener('click', fecharMetas_);
      goalsModalPrintBtn?.addEventListener('click', imprimirOuSalvarMetas_);
      goalsTabSummaryBtn?.addEventListener('click', () => selecionarAbaMetas_('resumo'));
      goalsTabDetailsBtn?.addEventListener('click', () => selecionarAbaMetas_('detalhes'));
      goalsModalDetails?.addEventListener('click', event => {
        const btn = event.target.closest('[data-goal-open-record]');
        if (!btn) return;
        const chave = String(btn.dataset.goalOpenRecord || '');
        if (!chave) return;
        fecharMetas_();
        abrirDetalheRegistro_(chave, Number(btn.dataset.recordLine || 0), { contexto: 'goals-details' });
      });
      goalsModal?.addEventListener('click', event => { if (event.target === goalsModal) fecharMetas_(); });
      registerDduBtn?.addEventListener('click', () => { fecharMenuMais_(); abrirCadastroDdu_(); });
      recordDetailLoading?.addEventListener('click', event => {
        const btn = event.target.closest('[data-retry-record-detail]');
        if (!btn || !recordsState.chaveSelecionada) return;
        abrirDetalheRegistro_(recordsState.chaveSelecionada, recordsState.linhaSelecionada || 0);
      });

      dduSummaryCard?.addEventListener('click', async () => { if(dduListModal)dduListModal.hidden=false; await carregarDdUs_(); });
      programmedSummaryCard?.addEventListener('click', () => abrirListaProgramadas_(true));
      inspectionSuggestionsCard?.addEventListener('click', abrirSugestoesFiscalizacao_);
      inspectionSuggestionsVistoriaCard?.addEventListener('click', abrirSugestoesFiscalizacao_);
      inspectionSuggestionsRefreshBtn?.addEventListener('click', () => carregarSugestoesFiscalizacao_(true));
      programmedQuickAddBtn?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        abrirModalPreparacao_();
      });
      const acionarFechamentoProgramadas_ = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        fecharListaProgramadas_();
      };
      programmedListCloseBtn?.addEventListener('click', acionarFechamentoProgramadas_);
      // Alguns navegadores Android/PWA podem atrasar ou suprimir o click em elementos de modal.
      // pointerup garante resposta imediata do botão sem depender do click sintetizado.
      programmedListCloseBtn?.addEventListener('pointerup', acionarFechamentoProgramadas_);
      programmedListModal?.addEventListener('click', event => { if (event.target === programmedListModal) fecharListaProgramadas_(); });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && programmedListModal && !programmedListModal.hidden) fecharListaProgramadas_();
      });
      dduRegisterCloseBtn?.addEventListener('click', fecharCadastroDdu_); dduRegisterCancelBtn?.addEventListener('click', fecharCadastroDdu_); dduRegisterSaveBtn?.addEventListener('click', salvarDdu_);
      dduListCloseBtn?.addEventListener('click', () => { if(dduListModal)dduListModal.hidden=true; });
      dduList?.addEventListener('click', e => { const b=e.target.closest('[data-ddu-start]'); if(!b)return; iniciarDdu_(ddusAtivos.find(x=>String(x.id)===String(b.dataset.dduStart))); });
      prepareInspectionBtn?.addEventListener('click', abrirModalPreparacao_);
      desktopPrepareInspectionBtn?.addEventListener('click', () => { fecharListaProgramadas_(); abrirModalPreparacao_({ retornarProgramadas: true }); });
      prepareInspectionCloseBtn?.addEventListener('click', fecharModalPreparacao_);
      prepareInspectionCancelBtn?.addEventListener('click', fecharModalPreparacao_);
      prepareInspectionSaveBtn?.addEventListener('click', salvarPreparacaoVistoria_);
      prepareTipo?.addEventListener('change', atualizarCamposPreparacaoPorTipo_);
      document.getElementById('prepareDemanda')?.addEventListener('input', () => { atualizarCamposPreparacaoPorTipo_(); agendarConsultaProcessoPf_('prepare', 180); });
      document.getElementById('prepareDemanda')?.addEventListener('change', () => { atualizarCamposPreparacaoPorTipo_(); agendarConsultaProcessoPf_('prepare', 100); });
      instalarProtecaoPscip_(document.getElementById('preparePscip'), () => agendarConsultaProcessoPf_('prepare'));
      document.getElementById('preparePscip')?.addEventListener('blur', () => {
        const el = document.getElementById('preparePscip');
        if (el && !ehEventoDeclaratorioPreparacao_()) el.value = normalizarIdentificadorProjetoAoSair_(el.value);
        agendarConsultaProcessoPf_('prepare', 100);
      });
      document.getElementById('prepareEventoDeclaracaoNumero')?.addEventListener('input', event => { event.target.value = formatarDeclaracaoEvento_(event.target.value); });
      instalarMascaraDataRenovacaoAvcb_(document.getElementById('prepareDataRenovacaoAvcb'));
      ['prepareCidade','prepareEndereco','prepareNumero'].forEach(id => document.getElementById(id)?.addEventListener('input', () => agendarConsultaProcessoPf_('prepare')));
      let timerConsultaCnpjPreparacao = null;
      let ultimoCnpjPreparacaoConsultado = '';
      const prepareCnpjInput = document.getElementById('prepareCnpj');
      const limparDadosEmpresaPreparacao_ = () => {
        ['prepareNomeFantasia','prepareRazaoSocial','prepareEndereco','prepareNumero','prepareBairro'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
      };
      const solicitarConsultaCnpjPreparacao_ = async numero => {
        if (numero.length !== 14 || numero === ultimoCnpjPreparacaoConsultado) return false;
        const ok = await consultarCnpjPreparacao_();
        if (ok && digits(prepareCnpjInput?.value || '') === numero) {
          ultimoCnpjPreparacaoConsultado = numero;
          agendarConsultaProcessoPf_('prepare', 120);
          return true;
        }
        return false;
      };
      prepareCnpjInput?.addEventListener('input', () => {
        const numero = digits(prepareCnpjInput.value || '').slice(0, 14);
        prepareCnpjInput.value = numero.length > 11 ? formatarCnpjTela_(numero) : numero;
        agendarConsultaProcessoPf_('prepare');
        if (timerConsultaCnpjPreparacao) {
          window.clearTimeout(timerConsultaCnpjPreparacao);
          timerConsultaCnpjPreparacao = null;
        }
        if (cnpjPreparacaoEmAndamentoNumero && numero !== cnpjPreparacaoEmAndamentoNumero) {
          // Invalida somente respostas referentes ao CNPJ anterior.
          cnpjPreparacaoConsultaSequencia += 1;
          cnpjPreparacaoEmAndamento = null;
          cnpjPreparacaoEmAndamentoNumero = '';
        }
        clearPrepareCnpjStatus_();
        if (ultimoCnpjPreparacaoConsultado && numero !== ultimoCnpjPreparacaoConsultado) {
          limparDadosEmpresaPreparacao_();
          ultimoCnpjPreparacaoConsultado = '';
        }
        if (numero.length === 14) {
          timerConsultaCnpjPreparacao = window.setTimeout(() => {
            timerConsultaCnpjPreparacao = null;
            solicitarConsultaCnpjPreparacao_(numero).catch(() => {});
          }, 500);
        }
      });
      prepareCnpjInput?.addEventListener('blur', () => {
        const numero = digits(prepareCnpjInput.value || '');
        if (numero.length !== 14 || numero === ultimoCnpjPreparacaoConsultado) return;
        // Se o timer ainda não disparou, o blur antecipa a MESMA consulta; se já
        // existe uma em andamento, single-flight apenas aguarda a Promise atual.
        if (timerConsultaCnpjPreparacao) {
          window.clearTimeout(timerConsultaCnpjPreparacao);
          timerConsultaCnpjPreparacao = null;
        }
        solicitarConsultaCnpjPreparacao_(numero).catch(() => {});
      });
      document.querySelectorAll('[data-prepared-filter]').forEach(btn => btn.addEventListener('click', () => {
        definirFiltroPreparacoes_(btn.dataset.preparedFilter || 'todas');
        renderizarPreparacoesVistoria_();
        if (filtroPreparacoes === 'sugestoes' && navigator.onLine) carregarSugestoesFiscalizacao_().catch(() => {});
      }));
      preparedInspectionsList?.addEventListener('click', event => {
        const observarSugestao = event.target.closest('[data-note-suggestion-id]');
        if (observarSugestao) {
          event.preventDefault();
          event.stopPropagation();
          const item = sugestoesFiscalizacao.find(s =>
            String(s.identidade || '') === String(observarSugestao.dataset.noteSuggestionId || '')
          );
          adicionarObservacaoSugestaoFiscalizacao_(item).catch(() => {});
          return;
        }

        const regularizarSugestao = event.target.closest('[data-regularize-suggestion-id]');
        if (regularizarSugestao) {
          event.preventDefault();
          event.stopPropagation();
          const item = sugestoesFiscalizacao.find(s =>
            String(s.identidade || '') === String(regularizarSugestao.dataset.regularizeSuggestionId || '')
          );
          marcarSugestaoRegularizadaManual_(item).catch(() => {});
          return;
        }

        const programarSugestao = event.target.closest('[data-program-suggestion-id]');
        if (programarSugestao) {
          event.preventDefault();
          event.stopPropagation();
          const item = sugestoesFiscalizacao.find(s =>
            String(s.identidade || '') === String(programarSugestao.dataset.programSuggestionId || '')
          );
          abrirSugestaoComoPreparacao_(item);
          return;
        }

        const pesquisarSugestao = event.target.closest('[data-search-suggestion]');
        if (pesquisarSugestao) {
          event.preventDefault();
          event.stopPropagation();
          fecharListaProgramadas_();
          recordsState.pagina = 1;
          mostrarVistaPlanilha_({
            busca: String(pesquisarSugestao.dataset.searchSuggestion || ''),
            carregar: true
          });
          return;
        }

        const editar = event.target.closest('[data-preparacao-edit-id]');
        if (editar) {
          event.preventDefault();
          event.stopPropagation();
          const item = preparacoesVistoria.find(p => String(p.id) === String(editar.dataset.preparacaoEditId));
          fecharListaProgramadas_();
          abrirEdicaoPreparacao_(item);
          return;
        }
        const excluir = event.target.closest('[data-preparacao-delete-id]');
        if (excluir) {
          event.preventDefault();
          event.stopPropagation();
          const item = preparacoesVistoria.find(p => String(p.id) === String(excluir.dataset.preparacaoDeleteId));
          excluirPreparacaoVistoria_(item);
          return;
        }
        const cancelarPreenchimento = event.target.closest('[data-preparacao-cancel-fill-id]');
        if (cancelarPreenchimento) {
          event.preventDefault();
          event.stopPropagation();
          const item = preparacoesVistoria.find(p => String(p.id) === String(cancelarPreenchimento.dataset.preparacaoCancelFillId));
          cancelarPreenchimentoPreparacao_(item);
          return;
        }
        const btn = event.target.closest('[data-preparacao-id]');
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        try { btn.blur(); } catch (e) {}
        try { document.activeElement?.blur?.(); } catch (e) {}
        const item = preparacoesVistoria.find(p => String(p.id) === String(btn.dataset.preparacaoId));
        abrirPreparacaoComEscolha_(item);
      });
      recordDetailGroups?.addEventListener('click', event => {
        const abrirRegistroRetorno = event.target.closest('[data-return-open-record]');
        if (abrirRegistroRetorno) {
          event.preventDefault();
          const chave = String(abrirRegistroRetorno.dataset.returnOpenRecord || '');
          const linha = Number(abrirRegistroRetorno.dataset.returnOpenLine || 0);
          if (chave) abrirDetalheRegistro_(chave, linha, { contexto: 'return-release-link' });
          return;
        }

        const abrirDocumentoRetorno = event.target.closest('[data-return-open-document]');
        if (abrirDocumentoRetorno) {
          event.preventDefault();
          void abrirDocumentoRetornoLiberacaoNoApp_({
            fileId: abrirDocumentoRetorno.dataset.returnFileId || '',
            nome: abrirDocumentoRetorno.dataset.returnDocumentName || 'Notificação da vistoria',
            url: abrirDocumentoRetorno.dataset.returnDocumentUrl || ''
          });
          return;
        }

        const reabrir = event.target.closest('[data-ficha-reopen-suggestion]');
        if (reabrir) {
          event.preventDefault();
          reabrirSugestaoFiscalizacaoManual_(
            recordStatusRegistroAtual?.controleSugestaoFiscalizacao
          ).catch(() => {});
          return;
        }

        const btn = event.target.closest('[data-ficha-program-suggestion]');
        if (!btn || !recordStatusRegistroAtual?.sugestaoFiscalizacao) return;
        abrirSugestaoComoPreparacao_(recordStatusRegistroAtual.sugestaoFiscalizacao);
      });

      preparedInspectionsList?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const alvo = event.target.closest('[data-preparacao-id]');
        if (!alvo) return;
        event.preventDefault();
        const item = preparacoesVistoria.find(p => String(p.id) === String(alvo.dataset.preparacaoId));
        abrirPreparacaoComEscolha_(item);
      });

      form.addEventListener('input', event => {
        if (RESPONSAVEL_EDITABLE_FIELDS_.has(String(event.target?.id || '')) && !preenchendoResponsavelLookup) {
          marcarCampoResponsavelEditadoManual_(event.target.id);
          if (event.target.id === 'enderecoResponsavel') {
            const mesmoEndereco = document.getElementById('mesmoEnderecoResponsavel');
            if (mesmoEndereco?.checked) mesmoEndereco.checked = false;
          }
          // Qualquer edição manual invalida respostas antigas ainda em trânsito.
          if (event.target.id !== 'telefone' && event.target.id !== 'cpf') invalidarConsultasResponsavel_();
        }
        if (event.target.classList.contains('invalid') && String(event.target.value || '').trim() && (!validacaoGuiadaAtiva_ || event.target !== validacaoGuiadaAtual_)) event.target.classList.remove('invalid');
        if (document.getElementById('mesmoEnderecoResponsavel').checked && ['endereco','numero','complemento','bairro'].includes(event.target.id)) syncResponsibleAddress();
        if (ehFluxoLiberacao_() && ['endereco','numero','cnpj','pscip'].includes(event.target.id)) {
          agendarConsultaRetornoLiberacao_(650);
        }
        scheduleDraftSave();
      });
      form.addEventListener('change', event => {
        if (ehFluxoLiberacao_() && ['endereco','numero','cnpj','pscip','cidade','cidadeOutro'].includes(event.target.id)) {
          agendarConsultaRetornoLiberacao_(250);
        }
        agendarAvancoValidacaoGuiada_(event);
        scheduleDraftSave();
      });
      form.addEventListener('focusout', event => {
        agendarAvancoValidacaoGuiada_(event);
      });
      areaInput?.addEventListener('input', () => { atualizarVerificacaoMetasFiscalizacao_(); scheduleDraftSave(); });
      areaInput?.addEventListener('change', () => { atualizarVerificacaoMetasFiscalizacao_(); scheduleDraftSave(); });
      categoriaMetaSelect?.addEventListener('change', () => { atualizarVerificacaoMetasFiscalizacao_(); scheduleDraftSave(); });
      document.getElementById('demandaPrincipal')?.addEventListener('input', () => { atualizarHintDemandaPorFluxo_(); aplicarModoEventoDeclaratorio_({ silencioso: true }); atualizarCampoRenovacaoAvcb_(); agendarConsultaProcessoPf_('form', 250); });
      document.getElementById('demandaPrincipal')?.addEventListener('change', () => { if (ehFluxoLiberacao_()) atualizarOpcoesDemandaPorFluxo_(); atualizarHintDemandaPorFluxo_(); aplicarModoEventoDeclaratorio_({ silencioso: true }); atualizarCampoRenovacaoAvcb_(); agendarConsultaProcessoPf_('form', 100); });
      categoriaMetaSelect?.addEventListener('change', atualizarConsultaTecnicaContextual_);
      consultaTecnicaSecao?.addEventListener('click', event => {
        const link = event.target.closest('a[data-it-context-link]');
        if (!link) return;
        try { saveDraft(); } catch (e) {}
      });
      eventoDeclaracaoNumeroInput?.addEventListener('input', event => { event.target.value = formatarDeclaracaoEvento_(event.target.value); });
      instalarMascaraDataRenovacaoAvcb_(document.getElementById('dataRenovacaoAvcb'), scheduleDraftSave);
      eventoOrganizadorDocumentoInput?.addEventListener('input', event => {
        event.target.value = formatarDocumentoEvento_(event.target.value);
        atualizarDisponibilidadeResponsavelOrganizadorEvento_();
        if (eventoResponsavelEhOrganizadorCheck?.checked) sincronizarResponsavelComOrganizadorEvento_();
      });
      eventoTelefoneOrganizadorInput?.addEventListener('input', event => {
        event.target.value = formatarTelefoneEvento_(event.target.value);
        if (eventoResponsavelEhOrganizadorCheck?.checked) sincronizarResponsavelComOrganizadorEvento_();
      });
      document.getElementById('eventoOrganizador')?.addEventListener('input', () => {
        if (eventoResponsavelEhOrganizadorCheck?.checked) sincronizarResponsavelComOrganizadorEvento_();
      });
      eventoResponsavelEhOrganizadorCheck?.addEventListener('change', () => {
        if (eventoResponsavelEhOrganizadorCheck.checked) sincronizarResponsavelComOrganizadorEvento_();
        scheduleDraftSave();
      });
      citySelect.addEventListener('change', () => { syncOtherCity(); scheduleDraftSave(); });
      licenciamentoSelect?.addEventListener('change', () => { syncLicenciamento(); scheduleDraftSave(); });
      licenciamentoSelect?.addEventListener('input', () => { syncLicenciamento(); scheduleDraftSave(); });
      tipoLiberacaoSelect?.addEventListener('change', () => { sincronizarTipoLiberacao_(); scheduleDraftSave(); });
      acessoriaResultadoSelect?.addEventListener('change', () => { atualizarOpcoesSancaoPorFluxo_(); sincronizarVistoriaAcessoria_(); agendarConsultaEncerramentoFiscal_(); scheduleDraftSave(); });
      acessoriaTipoLicencaSelect?.addEventListener('change', scheduleDraftSave);
      dduProtocolInput?.addEventListener('input', scheduleDraftSave);
      situacaoPscipInput?.addEventListener('input', scheduleDraftSave);
      possuiPscipSelect?.addEventListener('change', () => { syncPscip_(); scheduleDraftSave(); });
      possuiPscipSelect?.addEventListener('input', () => { syncPscip_(); scheduleDraftSave(); });
      instalarProtecaoPscip_(pscipInput, () => {
        agendarConsultaPscip_();
        agendarConsultaProcessoPf_('form');
        scheduleDraftSave();
      });
      pscipInput?.addEventListener('blur', () => {
        if (value('possuiPscip') === 'sim') normalizarPscipInput_(true);
        agendarConsultaPscip_();
        agendarConsultaProcessoPf_('form', 100);
        scheduleDraftSave();
      });
      processPfInput?.addEventListener('input', () => {
        if (
          ehVistoriaAcessoria_() &&
          processoAcessoriaVinculado &&
          normalize(processPfInput.value || '') !== normalize(processoAcessoriaVinculado.pf || '')
        ) {
          processoAcessoriaVinculado = null;
          sincronizarVistoriaAcessoria_();
        }
      });
      sancaoSelect?.addEventListener('change', () => { syncNotificado(); agendarConsultaEncerramentoFiscal_(); scheduleDraftSave(); });
      pendenciaDocumentalSelect?.addEventListener('change', scheduleDraftSave);
      situacaoMultaInfoscipSelect?.addEventListener('change', () => { scheduleDraftSave(); agendarConsultaEncerramentoFiscal_(); });
      recordInfoscipCopyBtn?.addEventListener('click', copiarHistoricoInfoscipFiscalizacao_);
      recordInfoscipModelSelect?.addEventListener('change', atualizarTextoHistoricoInfoscipFiscalizacao_);
      recordRedsCopyBtn?.addEventListener('click', copiarRelatorioReds_);
      recordRedsModelSelect?.addEventListener('change', () => {
        atualizarTextoRelatorioRedsFiscalizacao_();
        if (recordInfoscipModelSelect && HISTORICOS_INFOSCIP_FISCALIZACAO[recordRedsModelSelect.value]) {
          recordInfoscipModelSelect.value = recordRedsModelSelect.value;
          atualizarTextoHistoricoInfoscipFiscalizacao_();
        }
      });
      recordAutoNumberInput?.addEventListener('input', atualizarTextoRelatorioRedsFiscalizacao_);
      recordAutoNumberSaveBtn?.addEventListener('click', salvarNumeroAutoRegistro_);
      recordWhatsappPhoneInput?.addEventListener('input', atualizarWhatsAppFicha_);
      recordWhatsappSendBtn?.addEventListener('click', enviarWhatsAppFicha_);
      recordNotificationsCopyAllBtn?.addEventListener('click', copiarTodasNotificacoesFicha_);
      recordNotificationsList?.addEventListener('click', event => {
        const botao = event.target.closest('[data-record-notification-copy]');
        if (!botao) return;
        copiarNotificacaoFicha_(botao.dataset.recordNotificationCopy);
      });
      document.getElementById('activeInspectionCancelBtn')?.addEventListener('click', cancelarPreenchimentoAtual_);
      document.getElementById('notificationPhotoInput')?.addEventListener('change', async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try { await fotografarIrregularidadeSelecionada_(file); }
        catch (e) { appStatus.textContent = e?.message || 'Não foi possível processar a fotografia.'; }
      });
      document.getElementById('activeInspectionNotificationsBtn')?.addEventListener('click', rolarParaNotificacoesProgramadas_);
      notificacoesAdicionarLocalBtn?.addEventListener('click', () => {
        carregarBaseNormativaITS_();
        adicionarLocalNotificacao_(true);
      });
      notificacoesRevisarBtn?.addEventListener('click', abrirRevisaoTecnicaNotificacoes_);
      notificacoesCompartilharAuxBtn?.addEventListener('click', compartilharNotificacoesComAuxiliar_);
      auxNotificationsExitBtn?.addEventListener('click', sairAcessoAuxiliarNotificacoes_);
      auxNotificationsShareCloseBtn?.addEventListener('click', fecharModalCompartilharAuxiliar_);
      auxNotificationsShareCancelBtn?.addEventListener('click', fecharModalCompartilharAuxiliar_);
      auxNotificationsShareModal?.addEventListener('click', event => {
        if (event.target === auxNotificationsShareModal) fecharModalCompartilharAuxiliar_();
      });
      auxNotificationsCopyLinkBtn?.addEventListener('click', async () => {
        const ok = await copiarTextoClipboard_(auxNotificationsShareLink?.value || '');
        appStatus.textContent = ok ? '✓ Link copiado. Envie ao auxiliar.' : 'Não foi possível copiar automaticamente. Selecione o link e copie manualmente.';
        if (ok && auxNotificationsCopyLinkBtn) {
          const anterior = auxNotificationsCopyLinkBtn.textContent;
          auxNotificationsCopyLinkBtn.textContent = '✓ Copiado';
          setTimeout(() => { auxNotificationsCopyLinkBtn.textContent = anterior; }, 1400);
        }
      });
      auxNotificationsNativeShareBtn?.addEventListener('click', async () => {
        const link = String(auxNotificationsShareLink?.value || '');
        if (!link || typeof navigator.share !== 'function') return;
        try {
          await navigator.share({
            title: 'Notificações da vistoria',
            text: 'Acesse este link para lançar as notificações desta vistoria. Entre com seu Nº BM e senha.',
            url: link
          });
        } catch (e) {
          if (e?.name !== 'AbortError') appStatus.textContent = 'Não foi possível abrir o compartilhamento do aparelho.';
        }
      });

      notificacoesLiberacaoLista?.addEventListener('change',event=>{const a=event.target.closest('[data-notification-field]');if(!a||!/^(tipoIrregularidade|itemIrregular)$/.test(a.dataset.notificationField||''))return;const l=notificacoesLiberacao.find(x=>String(x.id)===String(a.dataset.notificationLocalId)),i=l?.irregularidades?.find(x=>String(x.id)===String(a.dataset.notificationId));if(!i)return;const c=a.dataset.notificationField;i[c]=a.value;if(c==='tipoIrregularidade')i.itemIrregular='';processarIrregularidadeTecnica_(l,i);agendarPersistenciaNotificacoesLiberacao_();renderNotificacoesLiberacao_();});
      notificacoesLiberacaoLista?.addEventListener('input', event => {
        const alvo = event.target.closest('[data-notification-field]');
        if (alvo) atualizarCampoNotificacao_(alvo);
      });
      notificacoesLiberacaoLista?.addEventListener('change', event => {
        const alvo = event.target.closest('[data-notification-field]');
        if (alvo) atualizarCampoNotificacao_(alvo);
      });
      notificacoesLiberacaoLista?.addEventListener('click', async event => {
        const adicionar = event.target.closest('[data-notification-add-irregularity]');
        if (adicionar) {
          adicionarIrregularidadeNotificacao_(adicionar.dataset.notificationAddIrregularity, true);
          return;
        }
        const removerLocal = event.target.closest('[data-notification-remove-local]');
        if (removerLocal) {
          removerLocalNotificacao_(removerLocal.dataset.notificationRemoveLocal);
          return;
        }
        const removerIrregularidade = event.target.closest('[data-notification-remove-irregularity]');
        if (removerIrregularidade) {
          removerIrregularidadeNotificacao_(removerIrregularidade.dataset.notificationLocalId, removerIrregularidade.dataset.notificationRemoveIrregularity);
          return;
        }
        const fotografar = event.target.closest('[data-notification-photo]');
        if (fotografar) {
          fotoIrregularidadeAlvo_ = {
            localId: fotografar.dataset.notificationLocalId,
            itemId: fotografar.dataset.notificationPhoto
          };
          document.getElementById('notificationPhotoInput')?.click();
          return;
        }
        const manterFoto = event.target.closest('[data-notification-photo-keep]');
        if (manterFoto) {
          try {
            await alterarRetencaoFoto_(
              manterFoto.dataset.notificationLocalId,
              manterFoto.dataset.notificationId,
              manterFoto.dataset.notificationPhotoKeep
            );
          } catch (e) {
            appStatus.textContent = e?.message || 'Não foi possível alterar a retenção da fotografia.';
          }
          return;
        }
        const excluirFoto = event.target.closest('[data-notification-photo-delete]');
        if (excluirFoto) {
          try {
            await excluirFotoIrregularidade_(
              excluirFoto.dataset.notificationLocalId,
              excluirFoto.dataset.notificationId,
              excluirFoto.dataset.notificationPhotoDelete
            );
          } catch (e) {
            appStatus.textContent = e?.message || 'Não foi possível excluir a fotografia.';
          }
          return;
        }
        const copiar = event.target.closest('[data-notification-copy]');
        if (copiar) {
          const local = localNotificacaoPorId_(copiar.dataset.notificationLocalId);
          const irregularidade = irregularidadeNotificacaoPorId_(local, copiar.dataset.notificationCopy);
          const ok = await copiarTextoCompat_(textoNotificacaoIndividual_(local, irregularidade, false));
          appStatus.textContent = ok ? 'Descrição da notificação copiada.' : 'Não foi possível copiar a descrição automaticamente.';
        }
      });
      document.getElementById('mesmoEnderecoResponsavel').addEventListener('change', event => {
        if (event.target.checked) liberarProtecaoCampoResponsavel_('enderecoResponsavel');
        syncResponsibleAddress();
        scheduleDraftSave();
      });
      document.getElementById('cnpj').addEventListener('input', applyIdentificadorMask);
      document.getElementById('cpf').addEventListener('input', applyCpfMask);
      document.getElementById('telefone').addEventListener('input', applyPhoneMask);

      const nascimentoInput = document.getElementById('nascimento');
      nascimentoInput?.addEventListener('input', event => {
        event.target.value = formatarDataNascimentoDigitacao_(event.target.value);
        event.target.setCustomValidity('');
        event.target.classList.remove('invalid');
      });
      nascimentoInput?.addEventListener('blur', event => {
        const valor = String(event.target.value || '').trim();
        if (!valor) {
          event.target.setCustomValidity('');
          event.target.classList.remove('invalid');
          return;
        }
        const valido = dataNascimentoValida_(valor);
        event.target.setCustomValidity(valido ? '' : 'Informe uma data válida no formato DD/MM/AAAA.');
        event.target.classList.toggle('invalid', !valido);
        if (!valido) appStatus.textContent = 'Confira a data de nascimento do responsável.';
      });
      ['cnpj','endereco','numero','pf','demandaPrincipal'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', agendarConsultaEncerramentoFiscal_);
      });
      ['cnpj','endereco','numero','pf'].forEach(id => document.getElementById(id)?.addEventListener('input', () => agendarConsultaProcessoPf_('form')));
      citySelect?.addEventListener('change', agendarConsultaEncerramentoFiscal_);
      citySelect?.addEventListener('change', () => agendarConsultaProcessoPf_('form'));
      [processPfLookupResults, preparePfLookupResults].forEach(container => container?.addEventListener('click', event => {
        const botao = event.target.closest('[data-pf-index]');
        if (!botao) return;
        const origem = botao.dataset.pfOrigin === 'prepare' ? 'prepare' : 'form';
        const lista = origem === 'prepare' ? preparePfCandidatos : processoPfCandidatos;
        const indice = Number(botao.dataset.pfIndex);
        if (!Number.isInteger(indice) || !lista[indice]) return;
        aplicarPfLocalizado_(origem, lista[indice], false);
      }));
      priorProcessAlert?.addEventListener('click', event => {
        const botao = event.target.closest('[data-open-prior-record]');
        if (!botao) return;
        const chave = String(botao.dataset.openPriorRecord || '').trim();
        if (!chave) return;
        abrirDetalheRegistro_(chave, Number(botao.dataset.recordLine || 0));
      });
      pscipHistoryResults?.addEventListener('click', event => {
        const botao = event.target.closest('[data-history-pscip-index]');
        if (!botao) return;
        const indice = Number(botao.dataset.historyPscipIndex);
        if (!Number.isInteger(indice) || !historicoPscipAtual[indice]) return;
        aplicarHistoricoPscip_(historicoPscipAtual[indice]);
      });
      document.getElementById('nomeFantasia')?.addEventListener('input', () => {
        if (!tipoIdentificador_(value('cnpj'))) agendarHistoricoEstabelecimento_(700);
      });
      document.getElementById('razaoSocial')?.addEventListener('input', () => {
        if (!tipoIdentificador_(value('cnpj'))) agendarHistoricoEstabelecimento_(700);
      });
      establishmentHistoryResults?.addEventListener('click', event => {
        const botao = event.target.closest('[data-history-establishment-index]');
        if (!botao) return;
        const indice = Number(botao.dataset.historyEstablishmentIndex);
        if (!Number.isInteger(indice) || !historicoEstabelecimentoAtual[indice]) return;
        aplicarHistoricoEstabelecimento_(historicoEstabelecimentoAtual[indice]);
      });
      responsavelLookupResultados?.addEventListener('click', event => {
        const botao = event.target.closest('[data-responsavel-index]');
        if (!botao) return;
        const indice = Number(botao.dataset.responsavelIndex);
        if (!Number.isInteger(indice) || !responsaveisLookupAtual[indice]) return;
        limparProtecaoEdicaoResponsavel_();
        aplicarResponsavelEncontrado_(responsaveisLookupAtual[indice], { forcar: true });
      });
      responsavelCpfLookupResultados?.addEventListener('click', event => {
        const botao = event.target.closest('[data-responsavel-cpf-index]');
        if (!botao) return;
        const indice = Number(botao.dataset.responsavelCpfIndex);
        if (!Number.isInteger(indice) || !responsaveisCpfLookupAtual[indice]) return;
        limparProtecaoEdicaoResponsavel_();
        aplicarResponsavelEncontrado_(responsaveisCpfLookupAtual[indice], { forcar: true });
      });
      ocupacaoInput.addEventListener('focus', () => pesquisarOcupacoes(ocupacaoInput.value));
      ocupacaoInput.addEventListener('input', () => {
        ocupacaoSelecionada = localizarOcupacaoPorValor(ocupacaoInput.value);
        mostrarMetaOcupacao(ocupacaoSelecionada);
        pesquisarOcupacoes(ocupacaoInput.value);
      });
      ocupacaoInput.addEventListener('blur', () => {
        setTimeout(() => {
          if (!document.activeElement?.closest?.('.occupancy-field')) esconderResultadosOcupacao();
        }, 280);
      });
      ocupacaoToggle?.addEventListener('click', event => {
        event.preventDefault();
        if (ocupacaoResultados.classList.contains('show') && ocupacaoToggle.getAttribute('aria-expanded') === 'true') {
          esconderResultadosOcupacao();
          return;
        }
        ocupacaoToggle.focus({ preventScroll: true });
        pesquisarOcupacoes(ocupacaoInput.value, true);
        ocupacaoResultados.scrollTop = 0;
      });
      ocupacaoResultados.addEventListener('touchstart', event => {
        ocupacaoArrastando = false;
        ocupacaoTouchStartY = event.touches && event.touches[0] ? event.touches[0].clientY : null;
      }, { passive: true });
      ocupacaoResultados.addEventListener('touchmove', event => {
        if (ocupacaoTouchStartY == null || !event.touches || !event.touches[0]) return;
        if (Math.abs(event.touches[0].clientY - ocupacaoTouchStartY) > 8) ocupacaoArrastando = true;
      }, { passive: true });
      ocupacaoResultados.addEventListener('touchend', () => {
        ocupacaoTouchStartY = null;
        if (ocupacaoArrastando) setTimeout(() => { ocupacaoArrastando = false; }, 120);
      }, { passive: true });
      document.addEventListener('click', event => {
        if (!event.target.closest('.occupancy-field')) esconderResultadosOcupacao();
      });
      submitBtn.addEventListener('click', submit);
      clearBtn.addEventListener('click', async () => {
        const mensagem = usuarioPodeOperar_()
          ? 'Todos os campos serão limpos e o rascunho deste aparelho será apagado.'
          : 'Todos os campos deste treinamento serão limpos.';
        const confirmou = await confirmarGpv_(
          mensagem,
          usuarioPodeOperar_() ? 'Limpar vistoria?' : 'Limpar treinamento?',
          { tom: 'danger', rotuloConfirmar: 'Limpar campos' }
        );
        if (confirmou) resetForm();
      });
      document.getElementById('newRecordBtn').addEventListener('click', () => { successScreen.classList.remove('show'); resetForm(); });
      document.getElementById('closeSuccessBtn').addEventListener('click', () => {
        const parcial = successScreen.classList.contains('partial-success');
        successScreen.classList.remove('show');
        if (!parcial) resetForm(false, true);
      });
      whatsappOrientacoesBtn?.addEventListener('click', abrirOrientacoesWhatsApp_);
      recordsSuccessBtn?.addEventListener('click', abrirRegistroSucessoNaPlanilha_);
      formTabBtn?.addEventListener('click', mostrarVistaFormulario_);
      dashboardNewInspectionBtn?.addEventListener('click', async () => {
        if (!prepararFormularioNovaVistoria_('Nova vistoria')) return;
        await mostrarVistaFormulario_();
      });
      recordsTabBtn?.addEventListener('click', () => mostrarVistaPlanilha_());
      recordsRefreshBtn?.addEventListener('click', () => carregarRegistros_(false, { forcar: true, motivo: 'atualização manual' }));
      recordsClearFiltersBtn?.addEventListener('click', () => {
        limparFiltrosVisiveisPainel_();
        recordsState.prazoMulta = '';
        atualizarEstadoCardsMulta_();
        carregarRegistros_(true, { forcar: true, motivo: 'limpeza de filtros' });
      });
      kpiMulta1Card?.addEventListener('click', () => filtrarPorPrazoMulta_('primeira'));
      kpiMulta2Card?.addEventListener('click', () => filtrarPorPrazoMulta_('segunda'));
      recordsSearch?.addEventListener('input', () => {
        clearTimeout(recordsSearchTimer);
        recordsState.prazoMulta = '';
        atualizarEstadoCardsMulta_();
        recordsSearchTimer = setTimeout(() => carregarRegistros_(true, { forcar: true, motivo: 'nova busca' }), 300);
      });
      [recordsCityFilter, recordsDemandFilter, recordsSanctionFilter, recordsTypeFilter, recordsInspectorFilter, recordsPeriodFilter].forEach(select => {
        select?.addEventListener('change', () => {
          recordsState.prazoMulta = '';
          atualizarEstadoCardsMulta_();
          carregarRegistros_(true, { forcar: true, motivo: 'alteração de filtro' });
        });
      });
      recordsPrevBtn?.addEventListener('click', () => { if (recordsState.pagina > 1) { recordsState.pagina -= 1; carregarRegistros_(false, { forcar: true, motivo: 'página anterior' }); } });
      recordsNextBtn?.addEventListener('click', () => { if (recordsState.pagina < recordsState.totalPaginas) { recordsState.pagina += 1; carregarRegistros_(false, { forcar: true, motivo: 'próxima página' }); } });
      recordsPageButtons?.addEventListener('click', event => {
        const botao = event.target.closest('[data-page]');
        const pagina = Number(botao?.dataset?.page || 0);
        if (!pagina || pagina === recordsState.pagina || recordsState.carregando) return;
        recordsState.pagina = pagina;
        carregarRegistros_(false, { forcar: true, motivo: 'seleção de página' });
      });
      recordsPageSize?.addEventListener('change', () => {
        const limite = Number(recordsPageSize.value || 25);
        recordsState.limite = [8, 15, 25].includes(limite) ? limite : 25;
        carregarRegistros_(true, { forcar: true, motivo: 'quantidade por página' });
      });
      recordsList?.addEventListener('click', event => {
        const card = event.target.closest('.records-card');
        if (card) abrirDetalheRegistro_(card.dataset.recordKey || '', Number(card.dataset.recordLine || 0));
      });
      recordsTableBody?.addEventListener('click', event => {
        const botaoFicha = event.target.closest('[data-open-record-detail]');
        if (botaoFicha) {
          event.stopPropagation();
          abrirDetalheRegistro_(botaoFicha.dataset.openRecordDetail || '', Number(botaoFicha.dataset.recordLine || 0));
          return;
        }
        if (event.target.closest('a, button, input, select, textarea')) return;
        const linha = event.target.closest('.records-table-row');
        if (linha) abrirDetalheRegistro_(linha.dataset.recordKey || '', Number(linha.dataset.recordLine || 0));
      });
      recordsTableBody?.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        if (event.target.closest('a, button, input, select, textarea')) return;
        const linha = event.target.closest('.records-table-row');
        if (!linha) return;
        event.preventDefault();
        abrirDetalheRegistro_(linha.dataset.recordKey || '', Number(linha.dataset.recordLine || 0));
      });
      recordDetailCloseBtn?.addEventListener('click', fecharDetalheRegistro_);
      recordDetailBackdrop?.addEventListener('click', fecharDetalheRegistro_);
      recordCorrectionBtn?.addEventListener('click', abrirCorrecaoRegistro_);
      recordCorrectionCloseBtn?.addEventListener('click', fecharCorrecaoRegistro_);
      recordCorrectionCancelBtn?.addEventListener('click', fecharCorrecaoRegistro_);
      recordCorrectionSaveBtn?.addEventListener('click', salvarCorrecaoRegistro_);
      recordCorrectionModal?.addEventListener('click', event => { if (event.target === recordCorrectionModal) fecharCorrecaoRegistro_(); });
      recordCorrectionFields?.addEventListener('change', event => {
        const campo = event.target.closest?.('[data-correction-id]');
        if (campo) campo.dataset.correctionTouched = '1';
      });
      recordInfoscipUpdateBtn?.addEventListener('click', abrirAtualizacaoSituacaoInfoscip_);
      recordStatusUpdateCloseBtn?.addEventListener('click', fecharAtualizacaoSituacaoInfoscip_);
      recordStatusUpdateCancelBtn?.addEventListener('click', fecharAtualizacaoSituacaoInfoscip_);
      recordStatusUpdateSaveBtn?.addEventListener('click', salvarAtualizacaoSituacaoInfoscip_);
      recordStatusUpdateModal?.addEventListener('click', event => { if (event.target === recordStatusUpdateModal) fecharAtualizacaoSituacaoInfoscip_(); });
      moreMenuTriggers.forEach(btn => btn.addEventListener('click', event => {
        event.stopPropagation();
        alternarMenuMais_(btn);
      }));
      appMoreMenu?.addEventListener('click', event => event.stopPropagation());
      tutorialMenuBtn?.addEventListener('click', abrirTutorial_);
      accessGuidanceContinueBtn?.addEventListener('click', fecharAvisoAcessoGeral_);
      limparResponsavelBtn?.addEventListener('click', async () => {
        const confirmar = await confirmarGpv_(
          'Serão apagados somente os dados do responsável. Endereço da edificação, PSCIP e demais dados da vistoria serão mantidos.',
          'Limpar dados do responsável?',
          { rotuloConfirmar: 'Limpar responsável', rotuloCancelar: 'Cancelar' }
        );
        if (confirmar) limparTodosDadosResponsavel_();
      });

      appDiagnosticsBtn?.addEventListener('click', abrirDiagnosticoApp_);
      appDiagnosticsCloseBtn?.addEventListener('click', fecharDiagnosticoApp_);
      appDiagnosticsRefreshBtn?.addEventListener('click', () => { void atualizarDiagnosticoApp_(); });
      appDiagnosticsRepairBtn?.addEventListener('click', () => { void repararInterfacePeloUsuario_(); });
      appDiagnosticsModal?.addEventListener('click', event => {
        if (event.target === appDiagnosticsModal) fecharDiagnosticoApp_();
      });

      useCurrentLocationBtn?.addEventListener('click', () => { void usarLocalizacaoAtual_(); });

      retornoLiberacaoAnteriorSelect?.addEventListener('change', () => {
        aplicarCandidatoRetornoLiberacao_(candidatoRetornoLiberacaoSelecionado_(), { preservarPendencias: false });
        if (respostaRetornoLiberacaoAtual_() === 'sim') scheduleDraftSave();
      });
      retornoLiberacaoSimBtn?.addEventListener('click', () => responderPerguntaRetornoLiberacao_('sim'));
      retornoLiberacaoNaoBtn?.addEventListener('click', () => responderPerguntaRetornoLiberacao_('nao'));
      retornoLiberacaoAbrirFichaBtn?.addEventListener('click', () => {
        const candidato = candidatoRetornoLiberacaoSelecionado_();
        if (candidato?.chave) abrirDetalheRegistro_(candidato.chave, Number(candidato.linha || 0), { contexto: 'return-release-form' });
      });
      retornoLiberacaoPendenciasLista?.addEventListener('change', event => {
        const select = event.target.closest('[data-return-pendency-status]');
        if (!select) return;
        const id = String(select.dataset.returnPendencyStatus || '');
        const itens = lerPendenciasRetornoLiberacaoCampo_();
        const item = itens.find(i => String(i.id || '') === id);
        if (item) {
          item.status = String(select.value || 'Não verificado');
          salvarPendenciasRetornoLiberacaoCampo_(itens);
        }
      });
      retornoLiberacaoNotificacoesManualInput?.addEventListener('input', scheduleDraftSave);
      retornoLiberacaoDocumentoLinkInput?.addEventListener('input', scheduleDraftSave);
      retornoLiberacaoPdfInput?.addEventListener('change', () => {
        const file = retornoLiberacaoPdfInput.files?.[0] || null;
        if (file) void anexarPdfRetornoLiberacao_(file);
      });
      retornoLiberacaoAbrirDocumentoBtn?.addEventListener('click', () => {
        void abrirDocumentoRetornoLiberacaoNoApp_({
          fileId: value('retornoLiberacaoDocumentoFileId'),
          nome: value('retornoLiberacaoDocumentoNome') || 'Notificação da vistoria',
          url: value('retornoLiberacaoDocumentoUrl')
        });
      });
      retornoLiberacaoAbrirLinkBtn?.addEventListener('click', abrirLinkRetornoLiberacao_);
      retornoLiberacaoPdfCloseBtn?.addEventListener('click', fecharVisualizadorRetornoLiberacao_);
      retornoLiberacaoPdfDoneBtn?.addEventListener('click', fecharVisualizadorRetornoLiberacao_);
      retornoLiberacaoPdfModal?.addEventListener('click', event => {
        if (event.target === retornoLiberacaoPdfModal) fecharVisualizadorRetornoLiberacao_();
      });
      retornoLiberacaoPdfExternalBtn?.addEventListener('click', () => {
        if (retornoLiberacaoDocumentoExterno_) window.open(retornoLiberacaoDocumentoExterno_, '_blank', 'noopener');
      });

      systemManualBtn?.addEventListener('click', abrirManualSistema_);
      redsTemplatesMenuBtn?.addEventListener('click', abrirHistoricosPadraoReds_);
      redsTemplatesCloseBtn?.addEventListener('click', fecharHistoricosPadraoReds_);
      redsTemplatesModal?.addEventListener('click', event => {
        if (event.target === redsTemplatesModal) fecharHistoricosPadraoReds_();
      });
      redsTemplatesList?.addEventListener('click', event => {
        const botao = event.target.closest('[data-reds-template-id]');
        if (botao) selecionarModeloReds_(String(botao.dataset.redsTemplateId || ''));
      });
      redsTemplateText?.addEventListener('input', () => {
        atualizarMarcadoresModeloReds_();
        if (redsTemplatePreviewPanel) redsTemplatePreviewPanel.hidden = true;
        definirMensagemModeloReds_('');
      });
      redsTemplatePreviewBtn?.addEventListener('click', visualizarExemploModeloReds_);
      redsTemplateSaveBtn?.addEventListener('click', salvarModeloRedsAtual_);
      redsTemplateRestoreBtn?.addEventListener('click', restaurarModeloRedsAtual_);
      duvidasMenuBtn?.addEventListener('click', abrirDuvidas_);
      duvidasCloseBtn?.addEventListener('click', fecharDuvidas_);
      duvidasNovaConversaBtn?.addEventListener('click', () => {
        resetarHistoricoDuvidas_(true);
        if (duvidasInput) duvidasInput.value = '';
        atualizarComposerDuvidas_();
        if (duvidasStatus) duvidasStatus.textContent = 'Nova conversa iniciada.';
        duvidasInput?.focus();
      });
      duvidasModal?.addEventListener('click', event => { if (event.target === duvidasModal) fecharDuvidas_(); });
      duvidasForm?.addEventListener('submit', event => { event.preventDefault(); enviarDuvida_(); });
      duvidasInput?.addEventListener('input', atualizarComposerDuvidas_);
      duvidasInput?.addEventListener('keydown', event => {
        const tecladoPc = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches;
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && tecladoPc) {
          event.preventDefault();
          enviarDuvida_();
        }
      });
      duvidasSuggestions?.addEventListener('click', event => {
        const botao = event.target.closest('[data-duvidas-prompt]');
        if (!botao || duvidasRespondendo_) return;
        if (duvidasInput) duvidasInput.value = String(botao.dataset.duvidasPrompt || '');
        atualizarComposerDuvidas_();
        enviarDuvida_();
      });
      duvidasConversation?.addEventListener('click', event => {
        const copiar = event.target.closest('[data-duvidas-copy-index]');
        if (copiar) { copiarRespostaDuvidas_(copiar.dataset.duvidasCopyIndex); return; }
        const repetir = event.target.closest('[data-duvidas-retry-index]');
        if (repetir) { reenviarDuvida_(repetir.dataset.duvidasRetryIndex); return; }
        const manual = event.target.closest('[data-duvidas-manual-id]');
        if (manual) abrirFonteManualDuvidas_(manual.dataset.duvidasManualId);
      });
      window.addEventListener('online', atualizarEstadoConexaoDuvidas_);
      window.addEventListener('offline', atualizarEstadoConexaoDuvidas_);
      systemManualCloseBtn?.addEventListener('click', fecharManualSistema_);
      systemManualModal?.addEventListener('click', event => { if (event.target === systemManualModal) fecharManualSistema_(); });
      systemManualModal?.addEventListener('click', event => {
        const alvo = event.target.closest('[data-manual-target]');
        if (alvo) navegarManualSistema_(alvo.dataset.manualTarget || '');
      });
      usefulLinksBtn?.addEventListener('click', abrirLinksUteis_);
      usefulLinksCloseBtn?.addEventListener('click', fecharLinksUteis_);
      usefulLinksModal?.addEventListener('click', event => { if (event.target === usefulLinksModal) fecharLinksUteis_(); });
      tutorialCloseBtn?.addEventListener('click', fecharTutorial_);
      tutorialModal?.addEventListener('click', event => { if (event.target === tutorialModal) fecharTutorial_(); });
      tutorialPrevBtn?.addEventListener('click', () => { tutorialStepIndex -= 1; renderizarTutorial_(); });
      tutorialNextBtn?.addEventListener('click', () => {
        if (tutorialStepIndex >= tutorialStepEls.length - 1) { fecharTutorial_(); return; }
        tutorialStepIndex += 1;
        renderizarTutorial_();
      });
      updateAppBtn?.addEventListener('click', atualizarAplicativo_);
      aboutSystemBtn?.addEventListener('click', abrirSobreSistema_);
      deviceNameBtn?.addEventListener('click', definirNomeDispositivo_);
      aboutSystemCloseBtn?.addEventListener('click', fecharSobreSistema_);
      aboutSystemModal?.addEventListener('click', event => { if (event.target === aboutSystemModal) fecharSobreSistema_(); });
      changePinBtn?.addEventListener('click', abrirAlterarSenha_);
      forgetSavedPinBtn?.addEventListener('click', esquecerSenhaSalvaAtualBm_);
      manageUsersBtn?.addEventListener('click', abrirGerenciadorUsuarios_);
      switchUserBtn?.addEventListener('click', trocarUsuarioBm_);
      logoutUserBtn?.addEventListener('click', sairUsuarioBm_);
      changePinCloseBtn?.addEventListener('click', fecharAlterarSenha_);
      changePinModal?.addEventListener('click', event => { if (event.target === changePinModal) fecharAlterarSenha_(); });
      changePinForm?.addEventListener('submit', salvarAlteracaoSenha_);
      [authPinInput, authNewPinInput, authConfirmPinInput, changePinCurrent, changePinNew, changePinConfirm].forEach(el => el?.addEventListener('input', () => { el.value = normalizarPinCliente_(el.value); }));
      authPinToggleBtn?.addEventListener('click', () => {
        if (!authPinInput) return;
        const mostrar = authPinInput.type === 'password';
        authPinInput.type = mostrar ? 'text' : 'password';
        authPinToggleBtn.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
        authPinToggleBtn.title = mostrar ? 'Ocultar senha' : 'Mostrar senha';
      });

      function invalidarConsultasAntigasAoRetornar_() {
        const agora = Date.now();
        if (agora - ultimaInvalidacaoRetornoInterface_ < 350) return;
        ultimaInvalidacaoRetornoInterface_ = agora;

        [
          cnpjTimer,
          responsavelLookupTimer,
          responsavelCpfLookupTimer,
          estabelecimentoLookupTimer,
          pscipLookupTimer,
          encerramentoFiscalTimer,
          processoPfLookupTimer,
          preparePfLookupTimer,
          retornoLiberacaoConsultaTimer_,
          timerConsultaCnpjPreparacao
        ].forEach(timer => clearTimeout(timer));

        cnpjConsultaSequencia += 1;
        responsavelLookupSequencia += 1;
        responsavelCpfLookupSequencia += 1;
        estabelecimentoLookupSequencia += 1;
        pscipLookupSequencia += 1;
        encerramentoFiscalSequencia += 1;
        processoPfLookupSequencia += 1;
        preparePfLookupSequencia += 1;
        retornoLiberacaoConsultaSequencia_ += 1;
        cnpjPreparacaoConsultaSequencia += 1;
        cnpjPreparacaoEmAndamento = null;
        cnpjPreparacaoEmAndamentoNumero = '';
        if (recordsState.carregando) cancelarConsultaPainelEmAndamento_('retorno ao app');

        // Reagenda somente consultas compatíveis com os valores atuais. Assim,
        // respostas antigas são descartadas e o formulário permanece intacto.
        setTimeout(() => {
          if (document.visibilityState !== 'visible') return;
          if (vistaAtualNavegacao_() === 'form') {
            if (tipoIdentificador_(value('cnpj')) === 'cnpj') {
              cnpjTimer = setTimeout(() => consultarCnpj(true), 250);
            }
            if (ehEventoDeclaratorio_()) agendarConsultaResponsavelPorCpf_();
            else agendarConsultaResponsavelPorTelefone_();
            agendarConsultaPscip_();
            agendarConsultaProcessoPf_('form', 350);
            agendarConsultaEncerramentoFiscal_();
            if (ehFluxoLiberacao_()) agendarConsultaRetornoLiberacao_(400);
          }

          const prepareModalAberto = prepareInspectionModal && !prepareInspectionModal.hidden;
          if (prepareModalAberto) {
            agendarConsultaProcessoPf_('prepare', 350);
            if (digits(prepareCnpjInput?.value || '').length === 14) {
              timerConsultaCnpjPreparacao = setTimeout(() => {
                timerConsultaCnpjPreparacao = null;
                void consultarCnpjPreparacao_();
              }, 350);
            }
          }
        }, 80);
      }

      // Evita disparos duplicados por dois toques rápidos no mesmo comando sem
      // interferir em campos de texto, seleções ou cliques programáticos.
      document.addEventListener('click', event => {
        if (!event.isTrusted) return;
        const acao = event.target?.closest?.('button, [role="button"], a.btn');
        if (!acao || acao.disabled || acao.dataset.allowRapidTap === 'true') return;
        const agora = performance.now();
        if (ultimoToqueAcao_.elemento === acao && agora - ultimoToqueAcao_.em < 550) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        ultimoToqueAcao_ = { elemento: acao, em: agora };
      }, true);

      let appOcultadoEm_ = 0;

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          appOcultadoEm_ = Date.now();
          marcarAtividadeApp_();
          return;
        }

        if (document.visibilityState === 'visible') {
          invalidarConsultasAntigasAoRetornar_();
          repararInterfaceOrfa_('retorno ao primeiro plano');
          if (authState.sessionToken) validarSessaoLocalAtivaBm_();
          agendarAtualizacaoPainelAoRetornar_('retorno ao primeiro plano');

          const ficouForaPor = appOcultadoEm_ ? Date.now() - appOcultadoEm_ : 0;
          const forcarVerificacao = ficouForaPor >= 15 * 60 * 1000;

          verificarAtualizacaoSilenciosaPwa_(forcarVerificacao);
          aplicarAtualizacaoSilenciosaSeSeguro_();
          appOcultadoEm_ = 0;
        }
      });

      window.addEventListener('focus', () => {
        invalidarConsultasAntigasAoRetornar_();
        repararInterfaceOrfa_('foco da janela');
        if (authState.sessionToken) validarSessaoLocalAtivaBm_();
        agendarAtualizacaoPainelAoRetornar_('foco da janela');
        verificarAtualizacaoSilenciosaPwa_();
        aplicarAtualizacaoSilenciosaSeSeguro_();
      });

      // Também cobre restauração da aba pelo histórico/BFCache do navegador.
      window.addEventListener('pageshow', event => {
        invalidarConsultasAntigasAoRetornar_();
        repararInterfaceOrfa_(event.persisted ? 'restauração BFCache' : 'pageshow');
        agendarAtualizacaoPainelAoRetornar_(event.persisted ? 'restauração BFCache' : 'pageshow');
        if (event.persisted) {
          verificarAtualizacaoSilenciosaPwa_(true);
          aplicarAtualizacaoSilenciosaSeSeguro_();
        }
      });
      authBmInput?.addEventListener('input', () => { authBmInput.value = normalizarBmCliente_(authBmInput.value); authPendingUserId = ''; authPendingBm = ''; });
      authForm?.addEventListener('submit', async event => {
        event.preventDefault();
        const entrou = await concluirLoginBm_(authBmInput?.value || '', authPendingUserId, authPinInput?.value || '');
        if (entrou) await carregarInicialComMotivacional_();
      });
      authCreatePinBtn?.addEventListener('click', async () => {
        const nova = normalizarPinCliente_(authNewPinInput?.value || '');
        const confirma = normalizarPinCliente_(authConfirmPinInput?.value || '');
        if (!/^\d{6}$/.test(nova)) { if (authMessage) authMessage.textContent = 'A nova senha deve ter 6 dígitos.'; return; }
        if (nova !== confirma) { if (authMessage) authMessage.textContent = 'A confirmação da senha não confere.'; return; }
        const entrou = await concluirLoginBm_(authPendingBm || authBmInput?.value || '', authPendingUserId, '', nova);
        if (entrou) await carregarInicialComMotivacional_();
      });
      authProfileList?.addEventListener('click', event => {
        const btn = event.target.closest('[data-auth-user-id]');
        if (!btn) return;
        authPendingUserId = String(btn.dataset.authUserId || '');
        authPendingBm = normalizarBmCliente_(authBmInput?.value || authPendingBm);
        if (authProfileChoice) authProfileChoice.hidden = true;
        if (authMessage) authMessage.textContent = 'Agora informe a senha de 6 dígitos.';
        authPinInput?.focus();
      });
      authDeviceProfileList?.addEventListener('click', event => {
        const btn = event.target.closest('[data-device-user-id]');
        if (!btn) return;
        selecionarPerfilConhecidoBm_(btn.dataset.deviceUserId || '');
      });
      authUseOtherBmBtn?.addEventListener('click', () => { limparEstadoPinLogin_(); mostrarTelaLoginBm_('Informe seu Nº BM e sua senha.'); });
      userManagerCloseBtn?.addEventListener('click', fecharGerenciadorUsuarios_);
      userManagerModal?.addEventListener('click', event => { if (event.target === userManagerModal) fecharGerenciadorUsuarios_(); });
      userManagerBm?.addEventListener('input', () => { userManagerBm.value = normalizarBmCliente_(userManagerBm.value); });
      userManagerCancelBtn?.addEventListener('click', resetarFormularioUsuario_);
      userManagerForm?.addEventListener('submit', salvarUsuarioGerenciado_);
      userManagerList?.addEventListener('click', event => {
        const resetPin = event.target.closest('[data-user-reset-pin]');
        if (resetPin) { redefinirSenhaUsuario_(resetPin.dataset.userResetPin || '', resetPin.dataset.userName || ''); return; }
        const editar = event.target.closest('[data-user-edit]');
        if (editar) {
          userManagerId.value = editar.dataset.userEdit || '';
          userManagerName.value = editar.dataset.userName || '';
          userManagerBm.value = editar.dataset.userBm || '';
          if (userManagerProfile) userManagerProfile.value = String(editar.dataset.userProfile || 'GPV').toUpperCase() === 'GERAL' ? 'GERAL' : 'GPV';
          userManagerFormTitle.textContent = 'Editar usuário';
          userManagerSaveBtn.textContent = 'Salvar alterações';
          userManagerCancelBtn.hidden = false;
          userManagerMessage.textContent = '';
          userManagerName.focus();
          return;
        }
        const excluir = event.target.closest('[data-user-delete]');
        if (excluir && !excluir.disabled) excluirUsuarioGerenciado_(excluir.dataset.userDelete || '', excluir.dataset.userName || '');
      });
      document.addEventListener('click', fecharMenuMais_);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { fecharAvisoAcessoGeral_(); fecharEscolhaMovel_(); fecharMenuMais_(); fecharTutorial_(); fecharDuvidas_(); fecharManualSistema_(); fecharDiagnosticoApp_(); fecharVisualizadorRetornoLiberacao_(); fecharDetalheRegistro_(); fecharGerenciadorUsuarios_(); fecharSobreSistema_(); fecharLinksUteis_(); }
      });
      window.addEventListener('resize', fecharMenuMais_);
      sendPendingBtn.addEventListener('click', () => enviarPendentes(false));
      window.addEventListener('offline', () => { atualizarStatusConexao(); if (authEnterBtn) authEnterBtn.disabled = true; if (authOfflineNote && authGate?.classList.contains('show')) authOfflineNote.hidden = false; });
      window.addEventListener('online', () => {
        atualizarStatusConexao();
        if (authEnterBtn) authEnterBtn.disabled = false;
        if (authOfflineNote) authOfflineNote.hidden = true;
        if (localizacaoValidaFormulario_() && !String(localizacaoEnderecoIdentificadoInput?.value || '').trim()) {
          setTimeout(() => { void identificarEnderecoPorLocalizacao_(true); }, 200);
        }
        if (ehFluxoLiberacao_()) setTimeout(() => { void consultarRetornoLiberacao_(); }, 450);
        appStatus.textContent = 'Internet restabelecida — verificando registros pendentes.';
        setTimeout(() => { void processarFilaFotosPendentes_(); }, 250);
        if (usuarioPodeOperar_()) {
          setTimeout(() => enviarPendentes(true), 650);
          setTimeout(() => verificarEstadoRascunhoCompartilhado_(), 150);
        }
        if (document.body.classList.contains('records-mode')) {
          setTimeout(() => agendarAtualizacaoPainelAoRetornar_('internet restabelecida', { forcar: true, atraso: 80 }), 900);
        }
        setTimeout(() => verificarAtualizacaoSilenciosaPwa_(true), 1200);
      });

      window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        installPanel.hidden = false;
        installText.textContent = 'Instale o Controle Fiscalizatório para abrir como aplicativo e trabalhar com a interface disponível offline.';
      });
      window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        installPanel.hidden = true;
        appStatus.textContent = 'Aplicativo instalado neste aparelho.';
      });
      installBtn?.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          try { await deferredInstallPrompt.userChoice; } catch (e) {}
          deferredInstallPrompt = null;
          installPanel.hidden = true;
          return;
        }
        installText.textContent = 'No iPhone/iPad: use Compartilhar → Adicionar à Tela de Início. No Android/Chrome: abra o menu do navegador → Instalar aplicativo.';
      });
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) installPanel.hidden = true;

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          swAtualizacaoPendente_ = true;
          aplicarAtualizacaoSilenciosaSeSeguro_();
        });
        window.addEventListener('load', async () => {
          try {
            const reg = await navigator.serviceWorker.register('./sw.js?v=23.9.99ca', { updateViaCache: 'none' });
            observarAtualizacaoSilenciosaPwa_(reg);
            await verificarAtualizacaoSilenciosaPwa_(true);
            // Verificação periódica para aparelhos/abas que permanecem abertos
            // por muitas horas ou dias.
            setInterval(() => {
              verificarAtualizacaoSilenciosaPwa_();
              aplicarAtualizacaoSilenciosaSeSeguro_();
            }, 30 * 60 * 1000);
          } catch (e) {}
        });
      }

      instalarEscolhaMovel_();
      iniciarWatchdogInterface_();
      iniciarAtualizacaoPeriodicaPainel_();
      repararInterfaceOrfa_('inicialização');
      inicializarCatalogoNotificacoes_();
      renderizarNotificacoesLiberacao_();
      atualizarStatusConexao();
      carregarSessaoLocalBm_();
      inicializarFilaOffline().then(inicializarAutenticacaoBm_).catch(inicializarAutenticacaoBm_);
    })();
