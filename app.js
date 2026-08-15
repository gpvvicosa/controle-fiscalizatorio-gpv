(() => {
      'use strict';

      const DRAFT_KEY = 'appVistoriaGpvUmaPaginaV2';
      const PENDING_KEY = 'appVistoriaGpvPendentesV1';
      const CONFIG_CACHE_KEY = 'appVistoriaGpvConfigPwaV1';
      const DB_NAME = 'ControleVistoriasGPV';
      const DB_VERSION = 1;
      const DB_STORE = 'pendentes';
      const API_URL = String(window.GPV_PUBLIC_CONFIG?.apiUrl || '').trim();
      const AUTH_USER_STORAGE = 'gpvVistoriasUsuarioBmV1';
      const AUTH_SESSION_STORAGE = 'gpvVistoriasSessaoBmV1';
      const AUTH_PROFILES_STORAGE = 'gpvVistoriasPerfisBmV1';
      const AUTH_DEVICE_PIN_KEY_STORAGE = 'gpvVistoriasChaveSenhaLocalV1';
      const AUTH_CLIENT_VERSION = 'bm-v1';
      const APP_VERSION = '23.9.89';
      const PANEL_CACHE_STORAGE = 'gpvPainelCacheV1';
      const RECORD_CACHE_STORAGE = 'gpvFichaCacheV1';
      const GOALS_CACHE_STORAGE = 'gpvMetasCacheV1';
      const PANEL_CACHE_TTL_MS = 10 * 60 * 1000;
      const RECORD_CACHE_TTL_MS = 10 * 60 * 1000;
      const GOALS_CACHE_TTL_MS = 10 * 60 * 1000;
      const DEVICE_NAME_STORAGE = 'gpvVistoriasNomeDispositivoV1';
      let authState = { usuario: null, sessionToken: '' };
      let authPendingUserId = '';
      let authPendingBm = '';
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
          demandaPrincipal: ['Alerta Vermelho','DDU','Liberação','Iniciativa','Eventos declaratórios','Vistoria Acessória'],
          categoriaMeta: ['', 'Brigada','CLCB','Renovação AVCB','Eventos declaratórios','Nível de risco III'],
          ocupacao: [], responsavel: [], profissao: [], estadoCivil: [], escolaridade: [],
          enderecoCorrespondencia: ['O Mesmo']
        },
        padroes: { cidade: 'Viçosa', enderecoCorrespondencia: 'O Mesmo' }
      });

      function carregarSessaoLocalBm_() {
        let usuario = null;
        let sessionToken = '';
        try { usuario = JSON.parse(localStorage.getItem(AUTH_USER_STORAGE) || 'null'); } catch (e) {}
        try { sessionToken = String(localStorage.getItem(AUTH_SESSION_STORAGE) || '').trim(); } catch (e) {}
        authState = { usuario: usuario && usuario.id ? usuario : null, sessionToken };
        return authState;
      }

      function carregarPerfisConhecidosBm_() {
        let lista = [];
        try {
          const bruto = JSON.parse(localStorage.getItem(AUTH_PROFILES_STORAGE) || '[]');
          if (Array.isArray(bruto)) lista = bruto;
        } catch (e) {}

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
        atualizarUsuarioLogadoUi_();
      }

      function limparSessaoLocalBm_() {
        // Limpa apenas o usuário ativo. A lista de perfis conhecidos permanece para
        // permitir a escolha rápida em tablets compartilhados.
        salvarSessaoLocalBm_(null, '');
      }

      function draftKeyAtual_() {
        const id = String(authState.usuario?.id || 'sem-usuario').replace(/[^A-Za-z0-9_-]/g, '');
        return `${DRAFT_KEY}:${id || 'sem-usuario'}`;
      }

      async function gatewayRequest_(action, data = {}, timeoutMs = 30000) {
        if (!navigator.onLine) throw new Error('Sem conexão com a internet.');
        if (!API_URL || API_URL.includes('COLE_AQUI')) {
          throw new Error('A URL da API ainda não foi configurada em config.js.');
        }
        const controller = new AbortController();
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
          let result = null;
          try { result = await response.json(); } catch (e) {}
          if (!response.ok || !result || result.ok === false) {
            const message = result?.error || result?.message || `Falha na comunicação (HTTP ${response.status}).`;
            const error = new Error(message);
            error.code = String(result?.code || '');
            error.status = response.status;
            throw error;
          }
          return result;
        } catch (error) {
          if (error?.name === 'AbortError') {
            const timeoutError = new Error('A comunicação demorou mais que o esperado. O registro continua seguro neste aparelho.');
            timeoutError.code = 'REQUEST_TIMEOUT';
            throw timeoutError;
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }

      async function apiRequest(action, data = {}, timeoutMs = 30000) {
        const sessionToken = String(authState.sessionToken || '').trim();
        if (!sessionToken) {
          const error = new Error('Entre com seu Nº BM para continuar.');
          error.code = 'AUTH_REQUIRED';
          throw error;
        }
        try {
          const result = await gatewayRequest_(action, { ...data, sessionToken }, timeoutMs);
          atualizarPerfilLocalPorResposta_(result);
          return result;
        } catch (error) {
          if (error?.code === 'AUTH_REQUIRED' || error?.status === 401) {
            limparSessaoLocalBm_();
            mostrarTelaLoginBm_('Sua identificação precisa ser confirmada novamente.');
          }
          throw error;
        }
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
      const systemManualBtn = document.getElementById('systemManualBtn');
      const systemManualModal = document.getElementById('systemManualModal');
      const systemManualCloseBtn = document.getElementById('systemManualCloseBtn');
      const systemManualScroll = document.getElementById('systemManualScroll');
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
      const recordHistoryPanel = document.getElementById('recordHistoryPanel');
      const recordHistoryCount = document.getElementById('recordHistoryCount');
      const recordHistoryTimeline = document.getElementById('recordHistoryTimeline');
      const recordAuditPanel = document.getElementById('recordAuditPanel');
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
      const dlNotificacaoTiposLocal = document.getElementById('dlNotificacaoTiposLocal');
      const dlNotificacaoCategorias = document.getElementById('dlNotificacaoCategorias');
      const notificationReviewModal = document.getElementById('notificationReviewModal');
      const notificationReviewCloseBtn = document.getElementById('notificationReviewCloseBtn');
      const notificationReviewBackBtn = document.getElementById('notificationReviewBackBtn');
      const notificationReviewAddBtn = document.getElementById('notificationReviewAddBtn');
      const notificationReviewConfirmBtn = document.getElementById('notificationReviewConfirmBtn');
      const notificationReviewSummary = document.getElementById('notificationReviewSummary');
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

      const programmedSummaryCard = document.getElementById('programmedSummaryCard');
      const programmedSummaryText = document.getElementById('programmedSummaryText');
      const programmedSummaryCount = document.getElementById('programmedSummaryCount');
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
      let usuariosAtivosApp = [];
      let preparacoesVistoria = [];
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
      let recordDetailReturnContext = '';
      let ultimoRegistroConsultaChave = '';
      let recordsSearchTimer = null;
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

      function perfilAcessoAtual_() {
        return String(authState.usuario?.perfil || 'GPV').trim().toUpperCase() === 'GERAL' ? 'GERAL' : 'GPV';
      }

      function usuarioPodeOperar_() {
        return perfilAcessoAtual_() === 'GPV';
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
          if (syncSummary) syncSummary.hidden = false;
        } else {
          if (draftStatus) draftStatus.textContent = 'Preenchimento temporário';
          if (submitBtn) submitBtn.textContent = 'Finalizar treinamento';
          if (prepareInspectionSaveBtn && !preparacaoEditandoId) prepareInspectionSaveBtn.textContent = 'Finalizar treinamento';
        }
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
      let saveTimer = null;
      let cnpjTimer = null;
      let ultimoCnpjConsultado = '';
      let cnpjConsultaSequencia = 0;
      let cnpjAssociadoDadosEmpresa = '';
      let responsavelLookupTimer = null;
      let responsavelLookupSequencia = 0;
      let telefoneResponsavelAssociado = '';
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

      function identificadorPainel_(item) {
        const cnpj = String(item?.cnpj || '').trim();
        const cpf = String(item?.cpf || '').trim();
        if (cnpj) return { rotulo: 'CNPJ', valor: cnpj };
        if (cpf) return { rotulo: 'CPF', valor: formatarCpfTela_(cpf) };
        return { rotulo: 'CNPJ / CPF', valor: '—' };
      }

      function cityValue() {
        return citySelect.value === 'Outro' ? value('outraCidade') : citySelect.value;
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
        if (!navigator.onLine) return;
        setTimeout(() => { apiRequest('update', {}, 90000).catch(() => {}); }, 120);
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
          atualizarPlanilhaEmSegundoPlano();
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

      function montarMensagemOrientacoes_(p) {
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

      function abrirMensagemWhatsAppResponsavel_(payload = ultimoRegistroParaOrientacoes, telefoneAlternativo = '') {
        if (!navigator.onLine) {
          alert('Sem internet no momento. A mensagem poderá ser aberta no WhatsApp quando a conexão voltar.');
          return false;
        }

        const dados = payload || {};
        const numero = telefoneWhatsApp_(telefoneAlternativo || dados.telefone);
        if (!numero) {
          alert('Telefone do responsável não informado ou inválido.');
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
        const numero = telefoneWhatsApp_(ultimoRegistroParaOrientacoes?.telefone);
        const label = whatsappOrientacoesBtn.querySelector('.whatsapp-btn-label');
        whatsappOrientacoesBtn.disabled = !numero;
        if (numero) {
          if (label) label.textContent = 'Enviar mensagem ao responsável';
          if (whatsappOrientacoesNote) whatsappOrientacoesNote.textContent = 'A mensagem será aberta diretamente no WhatsApp do responsável e já inclui o acesso ao Manual do Autuado.';
        } else {
          if (label) label.textContent = 'WhatsApp — telefone não informado';
          if (whatsappOrientacoesNote) whatsappOrientacoesNote.textContent = 'Informe um telefone válido do responsável para abrir diretamente a conversa no WhatsApp.';
        }
      }

      function abrirOrientacoesWhatsApp_() {
        abrirMensagemWhatsAppResponsavel_();
      }

      function mostrarSucesso(titulo, mensagem) {
        successTitle.textContent = titulo;
        document.getElementById('successText').textContent = mensagem;
        atualizarBotaoOrientacoes_();
        atualizarBotaoPlanilhaSucesso_();
        successScreen.classList.add('show');
      }


      function atualizarLinkPlanilha_(url) {
        const destino = String(url || '').trim();
        if (destino) recordsState.planilhaUrl = destino;
        const finalUrl = recordsState.planilhaUrl || String(appConfig?.planilhaUrl || '').trim();

        [recordsOpenSheetLink, recordDetailSheetLink, adminSheetMenuLink, dashboardSheetHeaderLink].forEach(link => {
          if (!link) return;
          if (!usuarioPodeOperar_()) {
            link.href = '#';
            link.hidden = true;
            return;
          }
          if (finalUrl) {
            link.href = finalUrl;
            link.hidden = false;
          } else {
            link.href = '#';
            link.hidden = true;
          }
        });
      }

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
      }

      function atualizarVistaNaUrl_(modo) {
        try {
          const url = new URL(window.location.href);
          if (modo === 'records') url.searchParams.set('view', 'painel');
          else url.searchParams.set('view', 'vistoria');
          window.history.replaceState({ ...(window.history.state || {}), gpvApp: true }, '', url.pathname + url.search + url.hash);
        } catch (e) {}
      }

      function vistaInicialDaUrl_() {
        try {
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
        if (elementoVisivelNavegacao_(recordStatusUpdateModal)) return { id: 'status-infoscip', fechar: () => fecharAtualizacaoSituacaoInfoscip_() };
        if (elementoVisivelNavegacao_(notificationReviewModal)) return { id: 'notification-review', fechar: () => notificationReviewBackBtn?.click() };
        if (elementoVisivelNavegacao_(reviewModal)) return { id: 'review', fechar: () => reviewCancelBtn?.click() };
        if (elementoVisivelNavegacao_(cityCheckModal)) return { id: 'city-check', fechar: () => cityCheckKeepBtn?.click() };
        if (elementoVisivelNavegacao_(changePinModal)) return { id: 'change-pin', fechar: () => fecharAlterarSenha_() };
        if (elementoVisivelNavegacao_(userManagerModal)) return { id: 'user-manager', fechar: () => fecharGerenciadorUsuarios_() };
        if (elementoVisivelNavegacao_(prepareInspectionModal)) return { id: 'prepare-inspection', fechar: () => fecharModalPreparacao_() };
        if (elementoVisivelNavegacao_(dduRegisterModal)) return { id: 'ddu-register', fechar: () => fecharCadastroDdu_() };
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
        if (opcoes.carregar !== false) carregarRegistros_(true);
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
        carregarRegistros_(true);
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
        const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (br) return `${br[1].padStart(2, '0')}/${br[2].padStart(2, '0')}/${br[3]}`;
        const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
        return texto || '—';
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
          const titulo = item.nomeFantasia || item.razaoSocial || 'Registro sem nome';
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
            <td class="records-mono">${escapeHtml(item.projeto || '—')}</td>
            <td>${escapeHtml(item.tipoVistoria || '—')}</td>
            <td class="records-ficha-cell"><button class="records-ficha-btn" type="button" data-open-record-detail="${escapeAttr(item.chave || '')}" data-record-line="${Number(item.linha || 0)}" title="Abrir Ficha do Processo" aria-label="Abrir ficha de ${escapeAttr(titulo)}">
              <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9.5L19 7v13.5H6z"/><path d="M15.5 3.5V7H19M9 11h7M9 15h5"/></svg>
            </button></td>
          </tr>`;
        }).join('');

        recordsList.innerHTML = itens.map(item => {
          const titulo = item.nomeFantasia || item.razaoSocial || 'Registro sem nome';
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
              <div class="records-meta-item"><span>Nº PSCIP</span><strong>${escapeHtml(item.projeto || '—')}</strong></div>
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
          dashboardGoalsGrid.innerHTML = categorias.map(item => {
            const meta = Number(item?.meta || 0);
            const realizado = Number(item?.realizado || 0);
            const totalReal = Number(item?.totalReal || realizado);
            const pct = meta > 0 ? Math.max(0, Math.min(100, Number(item?.percentual || 0))) : 100;
            const valor = meta > 0 ? `${realizado}/${meta}` : `${totalReal}`;
            const rodape = meta > 0
              ? (realizado >= meta ? 'Meta atingida' : `Faltam ${Math.max(0, meta - realizado)}`)
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
        const cacheValido = cache?.resposta && cache?.salvoEm && (Date.now() - Number(cache.salvoEm) <= GOALS_CACHE_TTL_MS);
        if (metasMensaisAtual && !forcar) { renderizarMetas_(metasMensaisAtual); return; }
        if (!metasMensaisAtual && cacheValido) {
          metasMensaisAtual = cache.resposta;
          renderizarMetas_(metasMensaisAtual);
        }
        if (!navigator.onLine) {
          if (!cacheValido && dashboardGoalsSubtitle) dashboardGoalsSubtitle.textContent = 'Conecte-se à internet para atualizar as metas.';
          return;
        }
        metasCarregando = true;
        try {
          const resposta = await apiRequest('config', { consulta: 'metas' }, 30000);
          metasMensaisAtual = resposta || {};
          gravarStorageJson_(GOALS_CACHE_STORAGE, { salvoEm: Date.now(), resposta: metasMensaisAtual });
          renderizarMetas_(metasMensaisAtual);
        } catch (erro) {
          if (!cacheValido && dashboardGoalsSubtitle) dashboardGoalsSubtitle.textContent = 'Não foi possível atualizar as metas agora.';
        } finally { metasCarregando = false; }
      }

      function abrirMetas_() {
        fecharMenuMais_();
        selecionarAbaMetas_('resumo');
        if (goalsModal) goalsModal.hidden = false;
        void carregarMetas_(true);
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

      function chaveCachePainel_(filtros, offset, limite) {
        return JSON.stringify({ filtros: filtros || {}, offset: Number(offset || 0), limite: Number(limite || 25) });
      }

      function lerCachePainel_(chave) {
        const mapa = lerStorageJson_(PANEL_CACHE_STORAGE, {});
        const item = mapa[chave];
        if (!item || !item.salvoEm || !item.resposta) return null;
        if (Date.now() - Number(item.salvoEm) > PANEL_CACHE_TTL_MS) return null;
        return item;
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
          recordsStatus.innerHTML = navigator.onLine
            ? `<strong>Painel aberto com a última consulta.</strong> Atualizando os dados em segundo plano...`
            : `<strong>Offline:</strong> exibindo a última consulta salva neste aparelho.`;
          return;
        }
        recordsStatus.innerHTML = rotuloMulta
          ? `<strong>${recordsState.total}</strong> ${recordsState.total === 1 ? 'edificação' : 'edificações'} ${rotuloMulta}${recordsState.total === 1 ? '' : 's'}. Clique novamente no card para remover o filtro.`
          : (filtrosAtivos
            ? `<strong>${recordsState.total}</strong> resultado${recordsState.total === 1 ? '' : 's'} com os filtros atuais. Os indicadores acima representam o total da base.`
            : `<strong>${recordsState.total}</strong> registro${recordsState.total === 1 ? '' : 's'} na consulta. Mais recentes primeiro.`);
      }

      async function carregarRegistros_(reiniciar = true) {
        if (recordsState.carregando) return;
        if (reiniciar) recordsState.pagina = 1;

        const offset = (recordsState.pagina - 1) * recordsState.limite;
        const limiteApi = Math.max(10, recordsState.limite);
        const filtros = filtrosConsultaAtuais_();
        const chaveCache = chaveCachePainel_(filtros, offset, limiteApi);
        const cache = lerCachePainel_(chaveCache);
        if (cache?.resposta) aplicarRespostaPainel_(cache.resposta, { cache: true });

        if (!navigator.onLine) {
          if (!cache?.resposta) {
            recordsStatus.className = 'records-status error';
            recordsStatus.textContent = 'Sem internet e sem consulta recente salva neste aparelho.';
          }
          return;
        }

        recordsState.carregando = true;
        if (recordsRefreshBtn) recordsRefreshBtn.disabled = true;
        atualizarPaginacao_();
        if (!cache?.resposta) {
          recordsStatus.className = 'records-status loading';
          recordsStatus.innerHTML = `
            <div class="panel-loading-visual" role="status" aria-live="polite">
              <div class="panel-loading-icon" aria-hidden="true">
                <span class="panel-loading-sheet"></span>
                <span class="panel-loading-pen"></span>
              </div>
              <strong>Atualizando Painel Fiscalizatório...</strong>
              <small>Carregando dados da planilha</small>
              <span class="panel-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            </div>`;
        }

        try {
          const resposta = await apiRequest('config', {
            consulta: 'registros',
            filtros: { ...filtros, offset, limite: limiteApi }
          }, 50000);
          salvarCachePainel_(chaveCache, resposta || {});
          aplicarRespostaPainel_(resposta || {});
        } catch (erro) {
          if (cache?.resposta) {
            recordsStatus.className = 'records-status cached';
            recordsStatus.innerHTML = `<strong>Não foi possível atualizar agora.</strong> A última consulta salva continua disponível.`;
          } else {
            recordsStatus.className = 'records-status error';
            recordsStatus.textContent = erro?.message || 'Não foi possível carregar o Painel Fiscalizatório.';
            if (!recordsState.itens.length) {
              recordsList.innerHTML = '<div class="records-empty">O painel não pôde ser carregado agora.</div>';
              recordsTableBody.innerHTML = '<tr><td colspan="9" class="records-table-empty">Não foi possível carregar os registros.</td></tr>';
            }
          }
        } finally {
          recordsState.carregando = false;
          if (recordsRefreshBtn) recordsRefreshBtn.disabled = false;
          atualizarPaginacao_();
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
        if (recordRedsReportPanel) recordRedsReportPanel.hidden = true;
        if (recordRedsReportText) recordRedsReportText.value = '';
        if (recordWhatsappPanel) recordWhatsappPanel.hidden = true;
        if (recordWhatsappPhoneInput) recordWhatsappPhoneInput.value = '';
        if (recordWhatsappStatus) recordWhatsappStatus.textContent = '';
        recordWhatsappRegistroAtual = null;
        recordStatusRegistroAtual = null;
        if (recordInfoscipUpdatePanel) recordInfoscipUpdatePanel.hidden = true;
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

      function montarGrupoFicha_(titulo, campos, classeExtra = '') {
        const validos = (campos || []).filter(item => item && item[1]);
        if (!validos.length) return '';
        return `<section class="record-detail-group${classeExtra ? ` ${escapeAttr(classeExtra)}` : ''}"><h3>${escapeHtml(titulo)}</h3><div class="record-detail-fields">${validos.map(([rotulo, valor]) => `<div class="record-detail-field"><label>${escapeHtml(rotulo)}</label><div>${escapeHtml(valor)}</div></div>`).join('')}</div></section>`;
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
          ['Nº do PSCIP', valorCampoFicha_(registro, 'Nº do PSCIP / Projeto')],
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
          item?.projeto ? `PSCIP ${item.projeto}` : '',
          item?.pf ? `PF ${item.pf}` : '',
          item?.reds ? `REDS ${item.reds}` : ''
        ].filter(Boolean);
        return complementos.length ? `${texto} ${complementos.join(' · ')}` : texto;
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
          return `<article class="history-item ${classeStatus_(item.sancao)}">
            <div class="history-marker" aria-hidden="true"></div>
            <div class="history-body"><time>${escapeHtml(item.carimbo || '')}</time><strong>${escapeHtml(titulo)}</strong><p>${escapeHtml(descricaoHistorico_(item))}</p></div>
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

      let recordRedsRegistroAtual = null;

      function modeloRelatorioRedsLiberacao_(registro, situacao) {
        const n = normalize(situacao);
        const tipoLiberacao = normalize(valorCampoFicha_(registro, 'Tipo da liberação'));
        const parcial = tipoLiberacao === normalize('Parcial');
        if (n === normalize('Notificado')) return parcial ? null : RELATORIOS_REDS_LIBERACAO.notificado;
        if (n !== normalize('Liberado')) return null;
        if (parcial) return RELATORIOS_REDS_LIBERACAO.parcial;
        const pendencia = normalize(valorCampoFicha_(registro, 'Pendência documental'));
        return pendencia === normalize('Sim') ? RELATORIOS_REDS_LIBERACAO.liberadoPendencia : RELATORIOS_REDS_LIBERACAO.liberado;
      }

      function sugestaoModeloFiscalizacao_(registro, situacao) {
        const n = normalize(situacao);
        const demanda = normalize(valorCampoFicha_(registro, 'Demanda'));
        const projeto = valorCampoFicha_(registro, 'Nº do PSCIP / Projeto');
        const licenciamento = normalize(valorCampoFicha_(registro, 'Situação do licenciamento'));
        const acessoria = demanda.includes(normalize('Vistoria Acessória'));
        if (acessoria) {
          if (n !== normalize('Regularizado')) return '';
          return [normalize('dispensado'), normalize('Dispensado de licenciamento')].includes(licenciamento) ? 'acessoriaDispensado' : 'acessoriaLicenciado';
        }
        if (demanda.includes(normalize('Eventos declaratórios')) && n === normalize('Regularizado')) return 'eventoDeclaratorioConforme';
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
        const opcoes = [
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
        recordRedsModelSelect.value = RELATORIOS_REDS_FISCALIZACAO[sugerido] ? sugerido : opcoes[0][0];
        return recordRedsModelSelect.value;
      }

      function montarTextoRedsFiscalizacao_(modelo, registro) {
        const pscip = valorCampoFicha_(registro, 'Nº do PSCIP / Projeto');
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
        const ocupacao = String(valorCampoFicha_(registro, 'Ocupação') || 'NÃO INFORMADO').replace(/\s*\|\s*/g, ', ').toUpperCase();
        const area = valorCampoFicha_(registro, 'Área m²') || 'NÃO INFORMADA';
        const situacaoPscip = String(valorCampoFicha_(registro, 'Situação atual do PSCIP') || 'NÃO INFORMADA').toUpperCase();
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
        const modelo = RELATORIOS_REDS_FISCALIZACAO[chaveModelo];
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
        recordRedsRegistroAtual = registro;
        const tipo = normalize(valorCampoFicha_(registro, 'Tipo de vistoria'));
        const demanda = normalize(valorCampoFicha_(registro, 'Demanda'));
        const ehLiberacao = tipo.includes('liberacao') || demanda.includes('liberacao') || [normalize('Liberado'), normalize('Notificado')].includes(normalize(situacao));
        const pscip = valorCampoFicha_(registro, 'Nº do PSCIP / Projeto');
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
          if (document.body.classList.contains('records-mode')) void carregarRegistros_(false);
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
              if (document.body.classList.contains('records-mode')) void carregarRegistros_(false);
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
        const processo = [
          ['Nº PSCIP', valorCampoFicha_(registro, 'Nº do PSCIP / Projeto')],
          ['Nº do PF', valorCampoFicha_(registro, 'Nº do PF')],
          ['Demanda', valorCampoFicha_(registro, 'Demanda')],
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
          ['Endereço', enderecoFicha_(registro)],
          [rotuloIdentificador, identificadorRegistro]
        ];
        const responsavel = [
          ['Responsável / vínculo', valorCampoFicha_(registro, 'Responsável')],
          ['Nome', valorCampoFicha_(registro, 'Nome')],
          ['RG', valorCampoFicha_(registro, 'RG')],
          ['CPF', valorCampoFicha_(registro, 'CPF')],
          ['Mãe', valorCampoFicha_(registro, 'Mãe')],
          ['Data de nascimento', valorCampoFicha_(registro, 'Nascimento', 'Data de nascimento')],
          ['Profissão', valorCampoFicha_(registro, 'Profissão')],
          ['Estado civil', valorCampoFicha_(registro, 'Estado civil')],
          ['Escolaridade', valorCampoFicha_(registro, 'Escolaridade')],
          ['Telefone', valorCampoFicha_(registro, 'Telefone')],
          ['E-mail', valorCampoFicha_(registro, 'E-mail')],
          ['Endereço do responsável', valorCampoFicha_(registro, 'Endereço do responsável')]
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

        recordDetailGroups.innerHTML =
          montarGrupoFicha_('Resumo operacional', resumoOperacionalFicha_(registro, situacao), 'record-operational-summary') +
          montarGrupoFicha_('Processo', processo) +
          montarGrupoFicha_('Evento declaratório', eventoDeclaratorio) +
          montarGrupoFicha_('Local', local) +
          montarGrupoFicha_(eventoFicha ? 'Responsável que acompanhou a vistoria' : 'Responsável', responsavel);

        recordDetailTitle.textContent = 'Ficha do Processo';
        recordDetailSubtitle.textContent = descricaoSituacaoPainel_(situacao);
        recordDetailLine.textContent = [estabelecimento, eventoFicha && eventoDeclaracaoFicha ? `Declaração ${eventoDeclaracaoFicha}` : identificadorRegistro].filter(Boolean).join(' • ');
        recordDetailStatusBadge.textContent = situacao;
        recordDetailStatusBadge.className = `status-badge ${classeStatus_(situacao)}`;
        if (recordCurrentStatus) recordCurrentStatus.className = `record-current-status ${classeStatus_(situacao)}`;
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
          const completo = { ...(registroBase || {}), historico: extras.historico || [], auditoria: extras.auditoria || [], parcial: false };
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
          alert('O Painel Fiscalizatório precisa de internet. O registro continua seguro no aparelho e será sincronizado quando a conexão voltar.');
          return;
        }
        const p = ultimoRegistroParaOrientacoes || {};
        const busca = p.cnpj || p.nomeFantasia || p.razaoSocial || '';
        mostrarVistaPlanilha_({ busca, carregar: false });
        recordsStatus.className = 'records-status loading';
        recordsStatus.textContent = 'Confirmando o registro enviado...';
        const chave = await aguardarChaveUltimoRegistro_();
        await carregarRegistros_(true);
        if (chave) {
          const item = (recordsState.itens || []).find(registro => registro.chave === chave);
          await abrirDetalheRegistro_(chave, Number(item?.linha || 0));
        }
      }

      function salvarRegistroOffline(payload) {
        payload._appCriadoEm = payload._appCriadoEm || new Date().toISOString();
        ultimoRegistroConsultaChave = '';
        ultimoRegistroParaOrientacoes = { ...payload };
        enfileirarRegistro(payload);
        localStorage.removeItem(draftKeyAtual_());
        resetForm();
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
        atualizarOpcoesSancaoPorFluxo_();
        fillDatalist('dlNatureza', op.natureza);
        fillDatalist('dlDemanda', op.demandaPrincipal);
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

      async function carregarUsuariosVistoriadores_() {
        if (!navigator.onLine) return;
        try {
          const resposta = await apiRequest('users', {}, 15000);
          usuariosAtivosApp = Array.isArray(resposta?.usuarios)
            ? resposta.usuarios.filter(u => String(u?.perfil || 'GPV').toUpperCase() !== 'GERAL')
            : [];
          preencherVistoriadores_();
        } catch (erro) {
          if (authState.usuario?.nome) {
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
        const vinculado = processoAcessoriaVinculado && pf && String(processoAcessoriaVinculado.pf || '').trim() === pf;
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
        setResponsibleField_('cpf', cpfOrganizador, formatarCpfTela_);
        setResponsibleField_('nomeResponsavel', value('eventoOrganizador'));
        setResponsibleField_('telefone', value('eventoTelefoneOrganizador'), formatarTelefoneTela_);
        if (!value('responsavel')) setResponsibleField_('responsavel', 'Organizador do evento');
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
        if (demandaFiscalizacaoWrap) demandaFiscalizacaoWrap.hidden = fluxo === 'liberacao' || !fluxo;
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
          descricao: ''
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
          descricao: String(item?.descricao || '').slice(0, 6000)
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
              descricao: String(item.descricao || '').trim()
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

      function renderizarNotificacoesLiberacao_() {
        if (!notificacoesLiberacaoLista) return;
        if (!notificacoesLiberacaoDraft.length) {
          notificacoesLiberacaoLista.innerHTML = '<div class="notification-draft-notice"><strong>Rascunho vazio</strong><span>Adicione um local somente quando encontrar uma irregularidade na vistoria.</span></div>';
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
                    <strong>Irregularidade ${indiceItem + 1}</strong>
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
                  <div class="notification-irregularity-actions">
                    <button class="notification-mini-btn" type="button" data-notification-copy="${escapeAttr(item.id)}" data-notification-local-id="${escapeAttr(local.id)}">Copiar descrição</button>
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
          if (mostrarMensagem) showError('Para concluir a vistoria de liberação como Notificado, registre ao menos uma irregularidade no Rascunho das notificações.');
          notificacoesLiberacaoSecao?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return false;
        }

        const faltantes = [];
        let primeiro = null;
        candidatos.forEach(({ local, irregularidade }, indice) => {
          const verificar = (campo, rotulo, seletor) => {
            if (String(campo || '').trim()) return;
            faltantes.push(`Notificação ${indice + 1}: ${rotulo}`);
            const el = notificacoesLiberacaoLista?.querySelector(seletor);
            if (el) {
              el.classList.add('notification-field-invalid');
              primeiro = primeiro || el;
            }
          };
          verificar(local.tipoLocal, 'Tipo do Local', `[data-notification-field="tipoLocal"][data-notification-local-id="${CSS.escape(local.id)}"]`);
          verificar(local.complemento, 'Complemento', `[data-notification-field="complemento"][data-notification-local-id="${CSS.escape(local.id)}"]`);
          verificar(irregularidade.tipoIrregularidade, 'Tipo de Irregularidade', `[data-notification-field="tipoIrregularidade"][data-notification-irregularity-id="${CSS.escape(irregularidade.id)}"]`);
          verificar(irregularidade.itemIrregular, 'Item Irregular', `[data-notification-field="itemIrregular"][data-notification-irregularity-id="${CSS.escape(irregularidade.id)}"]`);
          verificar(irregularidade.descricao, 'Descrição', `[data-notification-field="descricao"][data-notification-irregularity-id="${CSS.escape(irregularidade.id)}"]`);
        });

        if (faltantes.length) {
          if (mostrarMensagem) showError(`Complete o rascunho antes de concluir como Notificado: ${faltantes.slice(0, 5).join('; ')}${faltantes.length > 5 ? '...' : ''}.`);
          primeiro?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          focarCampoCompatEscolhaMovel_(primeiro);
          return false;
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

      function mostrarConferenciaNotificacoes_() {
        const ehNotificado = ehFluxoLiberacao_() && normalize(value('sancao')) === normalize('Notificado');
        if (!ehNotificado) return Promise.resolve(true);
        if (!notificationReviewModal || !notificationReviewList || !notificationReviewConfirmBtn) return Promise.resolve(true);

        const render = () => {
          const itens = flattenNotificacoesLiberacao_(true);
          if (notificationReviewSummary) {
            const locais = new Set(itens.map(item => item.local.id)).size;
            notificationReviewSummary.textContent = `${itens.length} irregularidade${itens.length === 1 ? '' : 's'} em ${locais} local${locais === 1 ? '' : 'is'}. Confira antes de continuar.`;
          }
          notificationReviewConfirmBtn.disabled = !itens.length;
          notificationReviewList.innerHTML = itens.map((item, indice) => {
            const local = item.local;
            const irregularidade = item.irregularidade;
            return `<article class="notification-review-item">
              <div class="notification-review-item-head">
                <div>
                  <strong>${indice + 1}. ${escapeHtml([local.tipoLocal, local.complemento].filter(Boolean).join(' — ') || 'Local não informado')}</strong>
                  <small>${escapeHtml(irregularidade.tipoIrregularidade || 'Tipo não informado')} • ${escapeHtml(irregularidade.itemIrregular || 'Item não informado')}</small>
                </div>
                <div class="notification-review-tools">
                  <button type="button" data-notification-review-copy="${escapeAttr(irregularidade.id)}" data-notification-local-id="${escapeAttr(local.id)}">Copiar</button>
                  <button type="button" data-notification-review-edit="${escapeAttr(irregularidade.id)}" data-notification-local-id="${escapeAttr(local.id)}">Editar</button>
                  <button type="button" data-notification-review-delete="${escapeAttr(irregularidade.id)}" data-notification-local-id="${escapeAttr(local.id)}">Excluir</button>
                </div>
              </div>
              <p>${escapeHtml(irregularidade.descricao || '')}</p>
            </article>`;
          }).join('');
        };

        render();
        notificationReviewModal.hidden = false;
        document.body.classList.add('review-open');

        return new Promise(resolve => {
          let finalizado = false;

          const encerrar = resultado => {
            if (finalizado) return;
            finalizado = true;
            notificationReviewModal.hidden = true;
            document.body.classList.remove('review-open');
            notificationReviewConfirmBtn.removeEventListener('click', onConfirmar);
            notificationReviewBackBtn?.removeEventListener('click', onVoltar);
            notificationReviewCloseBtn?.removeEventListener('click', onVoltar);
            notificationReviewAddBtn?.removeEventListener('click', onAdicionar);
            notificationReviewList.removeEventListener('click', onLista);
            document.removeEventListener('keydown', onKeydown);
            resolve(resultado);
          };

          const onConfirmar = () => {
            if (!validarNotificacoesParaNotificado_(true)) {
              encerrar(false);
              return;
            }
            encerrar(true);
          };
          const onVoltar = () => encerrar(false);
          const onAdicionar = () => {
            encerrar(false);
            const local = adicionarLocalNotificacao_(false);
            rolarParaNotificacao_(local?.id || '', '');
          };
          const onKeydown = event => { if (event.key === 'Escape') onVoltar(); };
          const onLista = async event => {
            const copiar = event.target.closest('[data-notification-review-copy]');
            if (copiar) {
              const local = localNotificacaoPorId_(copiar.dataset.notificationLocalId);
              const irregularidade = irregularidadeNotificacaoPorId_(local, copiar.dataset.notificationReviewCopy);
              await copiarTextoCompat_(textoNotificacaoIndividual_(local, irregularidade, false));
              return;
            }
            const editar = event.target.closest('[data-notification-review-edit]');
            if (editar) {
              const localId = editar.dataset.notificationLocalId;
              const irregularId = editar.dataset.notificationReviewEdit;
              encerrar(false);
              rolarParaNotificacao_(localId, irregularId);
              return;
            }
            const excluir = event.target.closest('[data-notification-review-delete]');
            if (excluir) {
              const localId = excluir.dataset.notificationLocalId;
              const irregularId = excluir.dataset.notificationReviewDelete;
              removerIrregularidadeNotificacao_(localId, irregularId);
              const local = localNotificacaoPorId_(localId);
              if (local && !(local.irregularidades || []).length && !String(local.tipoLocal || '').trim() && !String(local.complemento || '').trim()) {
                removerLocalNotificacao_(localId);
              }
              render();
            }
          };

          notificationReviewConfirmBtn.addEventListener('click', onConfirmar);
          notificationReviewBackBtn?.addEventListener('click', onVoltar);
          notificationReviewCloseBtn?.addEventListener('click', onVoltar);
          notificationReviewAddBtn?.addEventListener('click', onAdicionar);
          notificationReviewList.addEventListener('click', onLista);
          document.addEventListener('keydown', onKeydown);
          setTimeout(() => notificationReviewConfirmBtn.focus(), 30);
        });
      }

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
          pscip: eventoDeclaratorio ? '' : (value('possuiPscip') === 'sim' ? normalizarPscipExibicao_(value('pscip'), true) : ''),
          pf: value('pf'),
          tipoVistoria: value('tipoVistoria'),
          reds: value('reds'),
          natureza: value('natureza'),
          enderecoCorrespondencia: eventoDeclaratorio ? '' : value('enderecoCorrespondencia'),
          endereco: value('endereco'),
          numero: value('numero'),
          complemento: value('complemento'),
          bairro: value('bairro'),
          demandaPrincipal: eventoDeclaratorio ? 'Eventos declaratórios' : value('demandaPrincipal'),
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
          notificacoesLiberacao: ehFluxoLiberacao_() ? serializarNotificacoesLiberacao_() : ''
        };
      }

      function openParentDetails(element) {
        if (!element) return;
        const details = element.closest('details');
        if (details) details.open = true;
      }

      function validateRequired(showMessage = true) {
        document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        const eventoDeclaratorio = ehEventoDeclaratorio_();
        const checks = [
          ['tipoVistoria', 'Tipo de vistoria'],
          ['sancao', 'Situação / resultado'],
          ['vistoriadorResponsavel', 'Vistoriador responsável'],
          ['endereco', eventoDeclaratorio ? 'Endereço do evento' : 'Endereço'],
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
        if (!eventoDeclaratorio && value('possuiPscip') === 'sim' && normalizarPscipTela_(value('pscip')).length <= 3) {
          const elPscip = document.getElementById('pscip');
          if (elPscip) elPscip.classList.add('invalid');
          missing.push('Nº do PSCIP');
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
          const vinculoOk = processoAcessoriaVinculado && pfAtual && String(processoAcessoriaVinculado.pf || '').trim() === pfAtual;
          if (!pfAtual) { processPfInput?.classList.add('invalid'); missing.push('Nº do PF anterior'); first = first || processPfInput; }
          if (!vinculoOk) {
            if (showMessage) showError('Vistoria Acessória exige selecionar um processo fiscalizatório anterior de local já autuado. Use a busca do PF antes de concluir.');
            processPfInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
          }
          const resultadoAcessoria = normalize(value('acessoriaResultado'));
          if (!resultadoAcessoria) { acessoriaResultadoSelect?.classList.add('invalid'); missing.push('Resultado da Vistoria Acessória'); first = first || acessoriaResultadoSelect; }
          if (resultadoAcessoria === normalize('sanadas')) {
            const lic = value('licenciamento');
            if (!['possui','dispensado'].includes(lic)) {
              licenciamentoSelect?.classList.add('invalid');
              if (showMessage) showError('Para concluir a Vistoria Acessória com irregularidades sanadas, informe licenciamento válido ou dispensado de licenciamento.');
              licenciamentoSelect?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return false;
            }
            if (lic === 'possui') {
              if (!String(value('acessoriaTipoLicenca') || '').trim()) { acessoriaTipoLicencaSelect?.classList.add('invalid'); missing.push('Documento de licenciamento'); first = first || acessoriaTipoLicencaSelect; }
              if (normalizarPscipTela_(value('pscip')).length <= 3) { pscipInput?.classList.add('invalid'); missing.push('Nº do PSCIP / licenciamento'); first = first || pscipInput; }
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
            if (showMessage) showError('Informe uma área válida da edificação em metros quadrados.');
            if (areaInput) { openParentDetails(areaInput); areaInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            return false;
          }
        }
        if (!eventoDeclaratorio) {
          const identificador = digits(value('cnpj'));
          if (identificador && ![11, 14].includes(identificador.length)) {
            const el = document.getElementById('cnpj');
            el.classList.add('invalid');
            if (showMessage) showError('Informe um CNPJ com 14 dígitos ou um CPF com 11 dígitos.');
            openParentDetails(el);
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
          }
        } else {
          const documentoOrganizador = digits(value('eventoOrganizadorDocumento'));
          if (documentoOrganizador && ![11, 14].includes(documentoOrganizador.length)) {
            eventoOrganizadorDocumentoInput?.classList.add('invalid');
            if (showMessage) showError('Informe o CPF/CNPJ do organizador com 11 ou 14 dígitos, ou deixe o campo em branco.');
            eventoOrganizadorDocumentoInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
          }
          const cpfResponsavel = digits(value('cpf'));
          if (cpfResponsavel && cpfResponsavel.length !== 11) {
            cpfInput?.classList.add('invalid');
            if (showMessage) showError('Informe o CPF do responsável que acompanhou a vistoria com 11 dígitos, ou deixe o campo em branco.');
            cpfInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
          }
          const inicio = value('eventoInicio');
          const termino = value('eventoTermino');
          if (inicio && termino && new Date(termino).getTime() < new Date(inicio).getTime()) {
            document.getElementById('eventoTermino')?.classList.add('invalid');
            if (showMessage) showError('O término do evento não pode ser anterior ao início.');
            document.getElementById('eventoTermino')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
          }
        }
        if (missing.length) {
          if (showMessage) showError('Preencha os campos obrigatórios: ' + missing.join(', ') + '.');
          if (first) { openParentDetails(first); first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          return false;
        }
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
        const possui = value('possuiPscip') === 'sim';
        const mostrarSituacao = ehFluxoFiscalizacao_() && !ehEventoDeclaratorio_() && possui;
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
        if (checked) {
          field.value = [value('endereco'), value('numero'), value('complemento'), value('bairro')].filter(Boolean).join(', ');
          field.readOnly = true;
          field.style.background = '#f9fafb';
        } else {
          field.readOnly = false;
          field.style.background = '';
        }
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
          const alterar = window.confirm(`O CNPJ consultado está cadastrado em ${retornada}, mas a cidade selecionada é ${atual}. Deseja alterar a cidade para ${retornada}?`);
          if (alterar) aplicarCidadeRetornadaCnpj_(retornada);
          return Promise.resolve({ alterada: alterar, divergencia: true });
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
        cpfInput.value = formatarCpfTela_(d);
        cpfCopiadoDoIdentificador = d;
        cpfInput.readOnly = true;
        cpfInput.classList.add('cpf-synced-from-identifier');
        cpfInput.dispatchEvent(new Event('input', { bubbles: true }));
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
        return { nome, detalhe: [id, endereco, item?.carimbo].filter(Boolean).join(' • ') };
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

      function aplicarHistoricoEstabelecimento_(item) {
        if (!item) return;
        const nome = item.nomeFantasia || item.razaoSocial || 'este estabelecimento';
        if (!window.confirm(`Usar os dados históricos de ${nome}? Os campos já preenchidos não serão substituídos.`)) return;

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

      function normalizarDataResponsavelParaInput_(valor) {
        const texto = String(valor || '').trim();
        if (!texto) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
        const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        return '';
      }

      function setResponsibleField_(id, valor, formatter = null) {
        const el = document.getElementById(id);
        if (!el) return;
        let texto = String(valor == null ? '' : valor).trim();
        if (formatter) texto = formatter(texto);
        el.value = texto;
        el.dispatchEvent(new Event('input', { bubbles: true }));
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

      function aplicarResponsavelEncontrado_(item) {
        if (!item) return;
        preenchendoResponsavelLookup = true;
        try {
          setResponsibleField_('telefone', item.telefone, formatarTelefoneTela_);
          setResponsibleField_('responsavel', item.responsavel);
          setResponsibleField_('nomeResponsavel', item.nomeResponsavel);
          setResponsibleField_('rg', item.rg);
          setResponsibleField_('cpf', item.cpf, formatarCpfTela_);
          setResponsibleField_('mae', item.mae);
          setResponsibleField_('nascimento', item.nascimento, normalizarDataResponsavelParaInput_);
          setResponsibleField_('profissao', item.profissao);
          setResponsibleField_('estadoCivil', item.estadoCivil);
          setResponsibleField_('escolaridade', item.escolaridade);
          setResponsibleField_('email', item.email);
          if (!document.getElementById('mesmoEnderecoResponsavel')?.checked) {
            setResponsibleField_('enderecoResponsavel', item.enderecoResponsavel);
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
          limparDadosResponsavelExcetoTelefone_();
          telefoneResponsavelAssociado = '';
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
          limparDadosResponsavelExcetoCpf_();
          cpfResponsavelAssociado = '';
        }
        responsavelCpfLookupTimer = setTimeout(consultarResponsavelPorCpf_, 500);
      }


      function normalizarPscipExibicao_(valor, garantirPrefixo = false) {
        let texto = String(valor == null ? '' : valor).trim();
        if (!texto) return garantirPrefixo ? 'PRJ' : '';
        texto = texto.replace(/^prj/i, 'PRJ');
        if (garantirPrefixo && !/^PRJ/i.test(texto)) texto = `PRJ${texto}`;
        return texto.replace(/^prj/i, 'PRJ');
      }

      function normalizarPscipInput_(garantirPrefixo = false) {
        if (!pscipInput) return '';
        const antes = String(pscipInput.value || '');
        const depois = normalizarPscipExibicao_(antes, garantirPrefixo);
        if (depois !== antes) pscipInput.value = depois;
        return depois;
      }

      function normalizarPscipTela_(valor) {
        return String(valor == null ? '' : valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
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
            item.carimbo || '',
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
          return {
            identificador: digits(g('prepareCnpj')),
            pscip: g('preparePscip'),
            cidade: g('prepareCidade'),
            endereco: g('prepareEndereco'),
            numero: g('prepareNumero')
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
        if (!candidato?.pf) return;
        const prepare = origem === 'prepare';
        const input = prepare ? preparePfInput : processPfInput;
        if (!input) return;
        const autoAtual = prepare ? preparePfAutoAtual : processoPfAutoAtual;
        const atual = String(input.value || '').trim();
        if (automatico && atual && atual !== autoAtual) return;
        input.value = String(candidato.pf).trim();
        if (prepare) preparePfAutoAtual = input.value;
        else {
          processoPfAutoAtual = input.value;
          if (ehVistoriaAcessoria_()) processoAcessoriaVinculado = { ...candidato };
          const demais = processoPfCandidatos.filter(item => String(item?.pf || '') !== String(candidato.pf || ''));
          renderizarAlertaProcessoAnterior_([candidato, ...demais]);
          atualizarOpcoesSancaoPorFluxo_();
          sincronizarVistoriaAcessoria_();
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const status = prepare ? preparePfLookupStatus : processPfLookupStatus;
        if (status) {
          const ref = [candidato.criterio, candidato.estabelecimento, candidato.sancao].filter(Boolean).join(' • ');
          status.textContent = `PF ${candidato.pf} localizado no histórico desde 01/07/2025${ref ? ` — ${ref}` : ''}.`;
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
        if (!prepare && ehEventoDeclaratorio_()) {
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
        if (candidatos.length === 1) {
          aplicarPfLocalizado_(origem, candidatos[0], true);
          return;
        }
        const inputAtual = prepare ? preparePfInput : processPfInput;
        const autoAtual = prepare ? preparePfAutoAtual : processoPfAutoAtual;
        if (inputAtual && autoAtual && String(inputAtual.value || '').trim() === autoAtual && !candidatos.some(item => String(item.pf || '').trim() === autoAtual)) inputAtual.value = '';
        if (prepare) preparePfAutoAtual = ''; else processoPfAutoAtual = '';
        if (status) {
          status.textContent = `${candidatos.length} processos compatíveis encontrados. Selecione o Nº do PF correto e confira a situação.`;
          status.className = 'lookup-status show info';
        }
        resultados.innerHTML = candidatos.map((item,index) => {
          const endereco = [item.endereco,item.numero,item.cidade].filter(Boolean).join(', ');
          const detalhe = [item.criterio,item.sancao,item.carimbo,endereco].filter(Boolean).join(' • ');
          return `<div class="establishment-history-item"><div class="establishment-history-copy"><strong>PF ${escapeHtml(item.pf)}</strong><span>${escapeHtml(item.estabelecimento || 'Processo localizado')}</span><span>${escapeHtml(detalhe)}</span></div><button class="establishment-history-use" type="button" data-pf-origin="${prepare ? 'prepare' : 'form'}" data-pf-index="${index}">Usar PF</button></div>`;
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
          status.textContent = (!prepare && ehEventoDeclaratorio_())
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

      function scheduleDraftSave() {
        if (!usuarioPodeOperar_()) {
          clearTimeout(saveTimer);
          if (draftStatus) draftStatus.textContent = 'Preenchimento temporário';
          return;
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 350);
      }

      function saveDraft() {
        if (!usuarioPodeOperar_()) {
          if (draftStatus) draftStatus.textContent = 'Preenchimento temporário';
          return;
        }
        try {
          localStorage.setItem(draftKeyAtual_(), JSON.stringify({ savedAt: Date.now(), recordId: currentRecordId, payload: buildPayload() }));
          draftStatus.textContent = '✓ Rascunho salvo';
          setTimeout(() => { draftStatus.textContent = 'Rascunho automático'; }, 1600);
        } catch (e) {}
      }

      function restoreDraft() {
        try {
          const chaveAtual = draftKeyAtual_();
          let raw = localStorage.getItem(chaveAtual);
          // Migra um eventual rascunho da V19 para o usuário atualmente identificado.
          if (!raw && authState.usuario?.id) {
            const legado = localStorage.getItem(DRAFT_KEY);
            if (legado) {
              raw = legado;
              localStorage.setItem(chaveAtual, legado);
              localStorage.removeItem(DRAFT_KEY);
            }
          }
          if (!raw) return;
          const draft = JSON.parse(raw);
          if (!draft?.payload) return;
          if (Date.now() - Number(draft.savedAt || 0) > 1000 * 60 * 60 * 24 * 3) {
            localStorage.removeItem(draftKeyAtual_());
            return;
          }
          const p = draft.payload;
          preparacaoEmUsoId = String(p._appPreparacaoId || '');
          dduEmUsoId = String(p._appDduId || '');
          dduEmUsoNumero = String(p._appDduNumero || p.dduProtocol || '');
          processoAcessoriaVinculado = p._appAcessoriaPfVinculado ? { pf: String(p._appAcessoriaPfVinculado), sancao: String(p._appAcessoriaSituacaoAnterior || p.acessoriaSituacaoAnterior || '') } : null;
          aplicarFluxoVistoria_(inferirFluxoDoRascunho_(p), { silencioso: true });
          currentRecordId = String(draft.recordId || p._appRegistroId || currentRecordId || criarIdRegistro());
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
          restaurarNotificacoesLiberacao_(p.notificacoesLiberacao);
          restaurarOcupacoesSelecionadas(p.ocupacao);
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

      function resetForm() {
        restaurarPainelProgramadas_(false);
        preparacaoEmUsoId = '';
        dduEmUsoId = '';
        dduEmUsoNumero = '';
        processoAcessoriaVinculado = null;
        form.reset();
        localStorage.removeItem(draftKeyAtual_());
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
          ['Local do evento', [payload?.endereco, payload?.numero, payload?.bairro].filter(Boolean).join(', ') || '—'],
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
          ['Endereço', [payload?.endereco, payload?.numero, payload?.bairro].filter(Boolean).join(', ') || '—'],
          ['Responsável / RT', payload?.nomeResponsavel || '—'],
          ['Telefone', payload?.telefone || '—'],
          ['Licenciamento', textoLicenciamentoRevisao_(payload?._appLicenciamento)],
          ['Possui PSCIP?', payload?._appPossuiPscip === 'sim' ? 'Sim' : (payload?._appPossuiPscip === 'nao' ? 'Não' : '—')],
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
          const confirmou = window.confirm(`${avisoDuplicidade ? avisoDuplicidade + '\n\n' : ''}${texto}\n\n${usuarioPodeOperar_() ? 'Confirmar e registrar?' : 'Concluir treinamento?'}`);
          return Promise.resolve({ confirmado: confirmou, encerrarProcesso: false, chaveProcesso: '' });
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
          const continuar = window.confirm(mensagemLiberado);
          if (!continuar) {
            notificacoesLiberacaoSecao?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            appStatus.textContent = 'Confira o rascunho das notificações antes de concluir como Liberado.';
            return;
          }
        }

        saveDraft();

        const notificacoesConferidas = await mostrarConferenciaNotificacoes_();
        if (!notificacoesConferidas) {
          appStatus.textContent = 'Revise as notificações e conclua novamente quando estiverem conferidas.';
          return;
        }

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
          try { localStorage.removeItem(draftKeyAtual_()); } catch (_) {}
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
        enfileirarRegistro(payload);
        localStorage.removeItem(draftKeyAtual_());
        resetForm();

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

        if (preparedForUserNotice) {
          preparedForUserNotice.hidden = quantidade <= 0;
          preparedForUserNotice.textContent = quantidade > 0
            ? `${quantidade} vistoria${quantidade === 1 ? '' : 's'} programada${quantidade === 1 ? '' : 's'} para você${criticas > 0 ? ` • ${criticas} com atenção de prazo` : ''}`
            : '';
        }
      }

      function definirFiltroPreparacoes_(filtro) {
        const permitido = ['minhas','todas','fiscalizacao','liberacao'];
        filtroPreparacoes = permitido.includes(filtro) ? filtro : 'todas';
        document.querySelectorAll('[data-prepared-filter]').forEach(b => {
          b.classList.toggle('is-active', b.dataset.preparedFilter === filtroPreparacoes);
        });
      }

      function abrirListaProgramadas_(preferirMinhas = true) {
        const minhas = preparacoesDoUsuarioLogado_();
        definirFiltroPreparacoes_(preferirMinhas && minhas.length ? 'minhas' : 'todas');
        renderizarPreparacoesVistoria_();
        if (programmedListModal) programmedListModal.hidden = false;
        if (navigator.onLine) carregarPreparacoesVistoria_().catch(() => {});
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
        setTimeout(() => (authBmInput?.readOnly ? authPinInput : authBmInput)?.focus(), 30);
      }

      function mostrarEscolhaUsuariosDispositivo_(mensagem = '') {
        const perfis = carregarPerfisConhecidosBm_();
        if (!authGate) return;
        authGate.classList.add('show');
        authGate.setAttribute('aria-hidden', 'false');
        document.body.classList.add('auth-locked');
        if (authManualLogin) authManualLogin.hidden = true;
        if (authDeviceChoice) authDeviceChoice.hidden = false;
        if (authSubtitle) authSubtitle.textContent = mensagem || 'Escolha seu usuário e informe sua senha.';
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
        authGate.classList.remove('show');
        authGate.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('auth-locked');
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
        if (authSavePasswordCheck) authSavePasswordCheck.checked = Boolean(perfil.savedPinCipher);
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
          salvarSessaoLocalBm_(perfil.usuario, perfil.sessionToken);
          aplicarPermissoesInterface_();
          ocultarTelaLoginBm_();
          if (usuarioEmTreinamento_()) await mostrarAvisoAcessoGeral_('login');
          return true;
        }

        if (authEnterBtn) authEnterBtn.disabled = true;
        if (authMessage) authMessage.textContent = novaSenha ? 'Criando senha...' : 'Verificando acesso...';
        try {
          const result = await authRequest_({ bm: numero, userId: alvoId, pin: senha, newPin: novaSenha }, 30000);
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
          if (authSavePasswordCheck?.checked && /^\d{6}$/.test(senhaEfetiva)) {
            await salvarSenhaLocalPerfilBm_(result.usuario.id, senhaEfetiva);
          } else if (result.usuario?.id && perfilTemSenhaSalvaBm_(result.usuario.id)) {
            apagarSenhaLocalPerfilBm_(result.usuario.id);
          }
          ocultarTelaLoginBm_();
          if (usuarioEmTreinamento_()) await mostrarAvisoAcessoGeral_('login');
          if (result.usuario.provisorio) {
            setTimeout(() => alert('Seu Nº BM está cadastrado provisoriamente como 1234567. Atualize-o em Mais → Gerenciar usuários quando souber o número correto.'), 250);
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
        if (perfil.savedPinCipher) {
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
        loadingOverlay.classList.remove('show');

        // V23.9.30: recarregar/atualizar o PWA não encerra mais uma sessão válida.
        // A sessão só é limpa por Sair/Trocar usuário ou quando a API devolve 401.
        if (sessao?.usuario?.id && String(sessao.sessionToken || '').trim()) {
          ocultarTelaLoginBm_();
          atualizarUsuarioLogadoUi_();
          aplicarPermissoesInterface_();
          await loadInitialData();
          return;
        }

        // Sem sessão ativa, mantém o comportamento de aparelho compartilhado:
        // lembra os perfis/Nº BM e pede a senha conforme a configuração de cada usuário.
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
          alert('Conecte o aparelho à internet para gerenciar usuários.');
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
        if (!id || !confirm(`Excluir ${nome || 'este usuário'} da lista de acesso?`)) return;
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
        if (!navigator.onLine) { alert('Conecte o aparelho à internet para alterar a senha.'); return; }
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
        if (!id || !confirm(`Redefinir a senha de ${nome || 'este usuário'}? No próximo acesso ele deverá criar uma nova senha de 6 dígitos.`)) return;
        try {
          const result = await apiRequest('user_update', { mode: 'pin_reset', userId: id }, 30000);
          invalidarCredenciaisLocaisPerfilBm_(id);
          renderizarListaUsuarios_(result?.usuarios || []);
          if (userManagerMessage) userManagerMessage.textContent = 'Senha redefinida. O usuário criará uma nova senha no próximo acesso.';
        } catch (error) {
          if (userManagerMessage) userManagerMessage.textContent = error?.message || 'Não foi possível redefinir a senha.';
        }
      }

      function esquecerSenhaSalvaAtualBm_() {
        fecharMenuMais_();
        const usuario = authState.usuario;
        if (!usuario?.id || !perfilTemSenhaSalvaBm_(usuario.id)) return;
        if (!confirm(`Esquecer a senha salva de ${usuario.nome} neste aparelho? O Nº BM continuará lembrado.`)) return;
        apagarSenhaLocalPerfilBm_(usuario.id);
        alert('Senha removida deste aparelho. O usuário continuará aparecendo na lista de acesso.');
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

      function trocarUsuarioBm_() {
        fecharMenuMais_();
        if (!confirm('Trocar o usuário que está usando este aparelho?')) return;
        prepararSaidaUsuarioBm_();
        const perfis = carregarPerfisConhecidosBm_();
        if (perfis.length) mostrarEscolhaUsuariosDispositivo_('Escolha o usuário que vai utilizar o aparelho.');
        else mostrarTelaLoginBm_();
      }

      function sairUsuarioBm_() {
        fecharMenuMais_();
        if (!confirm('Deseja sair do aplicativo?')) return;
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
          alert('Conecte o aparelho à internet para buscar a versão mais recente do aplicativo.');
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

      function definirNomeDispositivo_() {
        fecharMenuMais_();
        const atual = nomeDispositivo_();
        const resposta = window.prompt(
          'Digite um nome simples para identificar este aparelho na auditoria. Ex.: Tablet GPV 01 ou Celular Galliano.',
          atual
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
        const wrap = document.getElementById('preparePscipWrap');
        if (wrap) wrap.classList.toggle('is-required-prep', liberacao);
        const dataLabel = document.getElementById('prepareDataLabel');
        if (dataLabel) dataLabel.classList.toggle('required', liberacao);
        const dataHint = document.getElementById('prepareDataHint');
        if (dataHint) dataHint.hidden = !liberacao;
        const input = document.getElementById('preparePscip');
        if (liberacao && input && !String(input.value || '').trim()) input.value = 'PRJ';
        if (prepareDwgWrap) prepareDwgWrap.hidden = !liberacao;
      }

      function limparFormularioPreparacao_() {
        preparacaoEditandoId = '';
        ['prepareCnpj','prepareData','preparePf','prepareNomeFantasia','prepareRazaoSocial','prepareArea','prepareEndereco','prepareNumero','prepareBairro','prepareObservacao'].forEach(id => {
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
      async function carregarDdUs_(){
        const inicioLoadingDdu = Date.now();
        const tempoMinimoLoading = 450;
        // Até o servidor confirmar uma pendência, não exibimos o ícone DDU.
        if (dduSummaryCard) dduSummaryCard.hidden = true;
        dduSummaryCard?.classList.add('is-loading');
        if (dduSummaryCard && !dduSummaryCard.querySelector('.ddu-live-loading-bar')) {
          dduSummaryCard.insertAdjacentHTML('beforeend', '<span class="ddu-live-loading-bar" aria-hidden="true"><i></i></span>');
        }
        if(dduSummaryText)dduSummaryText.innerHTML='<span class="ddu-loading-label">Atualizando demandas...</span>';
        if(dduSummaryCount)dduSummaryCount.innerHTML='<span class="ddu-count-loading" aria-hidden="true"></span>';
        try{
          const r=await apiRequest('config',{consulta:'ddus'},20000);
          const novosDdUs=Array.isArray(r?.itens)?r.itens:[];
          const espera=Math.max(0,tempoMinimoLoading-(Date.now()-inicioLoadingDdu));
          if(espera) await new Promise(resolve=>setTimeout(resolve,espera));
          ddusAtivos=novosDdUs;
          dduSummaryCard?.classList.remove('is-loading');
          dduSummaryCard?.querySelector('.ddu-live-loading-bar')?.remove();
          renderizarDdUs_();
          if(dduListStatus)dduListStatus.textContent=`${ddusAtivos.length} registro(s) ativo(s).`;
        }catch(e){
          console.error('Falha ao carregar DDU:',e);
          const espera=Math.max(0,tempoMinimoLoading-(Date.now()-inicioLoadingDdu));
          if(espera) await new Promise(resolve=>setTimeout(resolve,espera));
          dduSummaryCard?.classList.remove('is-loading');
          dduSummaryCard?.querySelector('.ddu-live-loading-bar')?.remove();
          if(dduSummaryText)dduSummaryText.textContent='Não foi possível carregar';
          if(dduSummaryCount)dduSummaryCount.textContent='';
          if (dduSummaryCard) dduSummaryCard.hidden = true;
          dduSummaryCard?.classList.remove('is-danger','is-warning');
          if(dduListStatus)dduListStatus.textContent='Não foi possível atualizar os DDU agora. Toque novamente no card DDU para tentar de novo.';
        }
      }
      async function salvarDdu_(){
        if(!navigator.onLine){alert('É necessário estar online para cadastrar o DDU e enviar o PDF.');return;}
        const prazo=document.getElementById('dduPrazo').value, endereco=document.getElementById('dduEndereco').value.trim(), cidade=document.getElementById('dduCidade').value.trim(); const file=document.getElementById('dduPdfFile').files?.[0];
        if(!prazo||!endereco||!cidade||!file){if(dduRegisterError){dduRegisterError.textContent='Preencha data limite, cidade, endereço e selecione o PDF.';dduRegisterError.hidden=false;}return;}
        try{dduRegisterSaveBtn.disabled=true;dduRegisterSaveBtn.textContent='Enviando PDF...'; const arq=await lerArquivoBase64_(file,8*1024*1024,'.pdf');
          await apiRequest('config',{consulta:'ddu_salvar',payload:{numeroDdu:document.getElementById('dduNumero').value,dataRecebimento:document.getElementById('dduRecebimento').value,dataLimite:prazo,vistoriadorResponsavel:document.getElementById('dduVistoriador').value,cidade,endereco,numero:document.getElementById('dduEnderecoNumero').value,bairro:document.getElementById('dduBairro').value,complemento:document.getElementById('dduComplemento').value,observacao:document.getElementById('dduObservacao').value,arquivo:arq}},120000);
          fecharCadastroDdu_(); await carregarDdUs_(); if(dduListModal)dduListModal.hidden=false;
        }catch(e){if(dduRegisterError){dduRegisterError.textContent=e?.message||'Não foi possível cadastrar o DDU.';dduRegisterError.hidden=false;}}
        finally{dduRegisterSaveBtn.disabled=false;dduRegisterSaveBtn.textContent='Salvar DDU';}
      }
      function iniciarDdu_(item){ if(!item)return; dduEmUsoId=String(item.id||''); dduEmUsoNumero=String(item.numeroDdu||'').trim(); if(dduListModal)dduListModal.hidden=true; aplicarFluxoVistoria_('fiscalizacao',{silencioso:true}); const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!=null&&String(v)!=='')el.value=v}; set('demandaPrincipal','DDU'); set('dduProtocol',dduEmUsoNumero); set('endereco',item.endereco);set('numero',item.numero);set('bairro',item.bairro);set('complemento',item.complemento);set('vistoriadorResponsavel',item.vistoriadorResponsavel); if(item.cidade){const op=Array.from(citySelect.options).find(o=>normalize(o.value)===normalize(item.cidade)); if(op)citySelect.value=op.value; else{citySelect.value='Outro';if(otherCity)otherCity.value=item.cidade;} syncOtherCity();} aplicarModoEventoDeclaratorio_({silencioso:true}); sincronizarDemandasEspeciais_(); agendarConsultaProcessoPf_('form',180); appStatus.textContent='DDU carregado. Complete os dados da fiscalização.'; }

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
        set('preparePscip', item.pscip || 'PRJ');
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
        return {
          _appPreparacao: 'sim',
          _appPreparacaoEdicao: preparacaoEditandoId ? 'sim' : 'nao',
          _appPreparacaoId: preparacaoEditandoId || `prep_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          tipoPreparacao: tipo,
          tipoVistoria: tipo === 'liberacao' ? 'Vistoria de Liberação' : (tipo === 'fiscalizacao' ? 'Vistoria de Fiscalização' : ''),
          dataPrevista: g('prepareData'),
          vistoriadorResponsavel: g('prepareVistoriador'),
          cidade: g('prepareCidade') || 'Viçosa',
          _appPossuiPscip: tipo === 'liberacao' ? 'sim' : (normalizarPscipTela_(g('preparePscip')).length > 3 ? 'sim' : 'nao'),
          pscip: normalizarPscipExibicao_(g('preparePscip'), tipo === 'liberacao'),
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
            return true;
          } catch (erro) {
            if (sequencia !== cnpjPreparacaoConsultaSequencia || digits(input?.value || '') !== cnpj) return false;
            showPrepareCnpjStatus_(erro?.message || 'Não foi possível consultar o CNPJ. Continue o preenchimento manualmente.', 'error');
            return false;
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
        if (!['fiscalizacao','liberacao'].includes(p.tipoPreparacao)) faltantes.push('Tipo de vistoria');
        if (p.tipoPreparacao === 'liberacao' && !p.dataPrevista) faltantes.push('Data prevista');
        if (!p.vistoriadorResponsavel) faltantes.push('Vistoriador responsável');
        if (p.tipoPreparacao === 'liberacao' && normalizarPscipTela_(p.pscip).length <= 3) faltantes.push('Nº do PSCIP');
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
          await carregarPreparacoesVistoria_();
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
        if (programmedSummaryCard) {
          programmedSummaryCard.hidden = total === 0;
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

      function renderizarPreparacoesVistoria_() {
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
          const titulo = item.nomeFantasia || item.razaoSocial || item.pscip || 'Vistoria programada';
          const endereco = [item.endereco, item.numero, item.bairro, item.cidade].filter(Boolean).join(', ');
          const prazo = classificarPrazoProgramacao_(item);
          return `<article class="prepared-card programmed-card ${prazo.classe}${liberacao ? ' is-release' : ''}" data-preparacao-id="${escapeAttr(item.id)}" tabindex="0" role="button" aria-label="Abrir vistoria programada: ${escapeAttr(titulo)}">
            <div class="prepared-card-main">
              <div class="prepared-card-top"><span class="prepared-kind ${liberacao ? 'release' : 'inspection'}">${liberacao ? 'Liberação' : 'Fiscalização'}</span><span class="program-deadline-badge ${prazo.classe}">${escapeHtml(prazo.rotulo)}</span><strong>${escapeHtml(formatarDataPreparacao_(item.dataPrevista))}</strong></div>
              <h3>${escapeHtml(titulo)}</h3>
              <p class="prepared-identifiers">${escapeHtml(item.pscip || 'Sem PSCIP informado')}${item.pf ? ` <span aria-hidden="true">•</span> PF ${escapeHtml(item.pf)}` : ''}${item.area ? ` <span aria-hidden="true">•</span> ${escapeHtml(item.area)} m²` : ''}</p>
              <p class="prepared-address">${escapeHtml(endereco || 'Endereço ainda não informado')}</p>
              <p class="prepared-inspector"><b>Vistoriador:</b> ${escapeHtml(item.vistoriadorResponsavel || 'Não definido')}</p>
            </div>
            <div class="prepared-card-actions">
              ${item.arquivoDwgUrl ? `<a class="btn btn-secondary" href="${escapeAttr(item.arquivoDwgUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Abrir arquivo</a>` : ''}
              <button type="button" class="btn btn-secondary prepared-edit-btn" data-preparacao-edit-id="${escapeAttr(item.id)}" aria-label="Editar programação de ${escapeAttr(titulo)}">Editar</button>
              <button type="button" class="btn btn-secondary prepared-delete-btn" data-preparacao-delete-id="${escapeAttr(item.id)}" aria-label="Excluir programação de ${escapeAttr(titulo)}">Excluir</button>
              <button type="button" class="btn btn-primary prepared-open-btn" data-preparacao-id="${escapeAttr(item.id)}">Abrir vistoria</button>
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
        if (programmedSummaryCard && navigator.onLine) programmedSummaryCard.hidden = true;
        const tempoMinimoLoading = 450;
        const cacheKey = 'gpv_preparacoes_cache_v1';
        let cachePreparacoes = [];
        try { cachePreparacoes = JSON.parse(localStorage.getItem(cacheKey) || '[]') || []; } catch (e) { cachePreparacoes = []; }

        if (!navigator.onLine) {
          preparacoesVistoria = cachePreparacoes;
          renderizarPreparacoesVistoria_();
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = 'Offline — exibindo a última lista sincronizada.';
          return;
        }

        preparedInspectionsList?.classList.add('is-loading');
        if (preparedInspectionsList) {
          preparedInspectionsList.innerHTML = `
            <div class="prepared-loading-track" role="status" aria-live="polite" aria-label="Atualizando vistorias programadas">
              <span class="prepared-loading-track-knob" aria-hidden="true"></span>
            </div>`;
        }
        if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = 'Atualizando vistorias programadas...';
        try {
          const r = await apiRequest('config', { consulta: 'programadas' }, 20000);
          const novasPreparacoes = Array.isArray(r?.itens) ? r.itens : [];
          const espera = Math.max(0, tempoMinimoLoading - (Date.now() - inicioLoadingProgramadas));
          if (espera) await new Promise(resolve => setTimeout(resolve, espera));
          preparacoesVistoria = novasPreparacoes;
          try { localStorage.setItem(cacheKey, JSON.stringify(preparacoesVistoria)); } catch (e) {}
          preparedInspectionsList?.classList.remove('is-loading');
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = `${preparacoesVistoria.length} vistoria(s) programada(s) pendente(s).`;
          renderizarPreparacoesVistoria_();
        } catch (erro) {
          const espera = Math.max(0, tempoMinimoLoading - (Date.now() - inicioLoadingProgramadas));
          if (espera) await new Promise(resolve => setTimeout(resolve, espera));
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
        const confirmar = window.confirm(`Excluir a programação de "${titulo}"?\n\nEla sairá da lista de Vistorias Programadas. Nenhuma vistoria já concluída será apagada.`);
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
          if (preparedInspectionsStatus) preparedInspectionsStatus.textContent = `${preparacoesVistoria.length} vistoria(s) programada(s) pendente(s).`;
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
        if (barra) return barra;
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

      function aplicarPreparacaoAoFormulario_(item) {
        if (!item) return;
        preparacaoEmUsoId = String(item.id || '');
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
        if (item.pscip) { if (possuiPscipSelect) possuiPscipSelect.value='sim'; set('pscip', item.pscip); syncPscip_(); }
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
            carregarRegistros_(true);
          }
        } else {
          marcarAbaApp_('form');
        }
        inicializarNavegacaoGlobal_(vistaInicial);

        // V23.9.47: DDU, programações e lista de vistoriadores são dados auxiliares.
        // A tela principal não fica mais presa ao "Carregando" aguardando essas três consultas.
        // Cada área mantém seu próprio indicador e termina a atualização em segundo plano.
        if (navigator.onLine && usuarioPodeOperar_()) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            Promise.allSettled([
              carregarUsuariosVistoriadores_(),
              carregarPreparacoesVistoria_(),
              carregarDdUs_()
            ]).catch(() => {});
          }));
          // V23.9.65: aquece consultas pesadas sem bloquear a tela de vistoria.
          setTimeout(() => { void preaquecerPainel_(); }, 4500);
        }
      }

      fluxoFiscalizacaoBtn?.addEventListener('click', () => aplicarFluxoVistoria_('fiscalizacao'));
      fluxoLiberacaoBtn?.addEventListener('click', () => aplicarFluxoVistoria_('liberacao'));
      loggedUserBadge?.addEventListener('click', abrirPreparacoesDoUsuario_);
      loggedUserBadge?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirPreparacoesDoUsuario_(); }
      });
      appMoreMenuCloseBtn?.addEventListener('click', fecharMenuMais_);
      goalsMenuBtn?.addEventListener('click', abrirMetas_);
      dashboardGoalsOpenBtn?.addEventListener('click', abrirMetas_);
      dashboardGoalsPanel?.addEventListener('dblclick', abrirMetas_);
      goalsModalCloseBtn?.addEventListener('click', fecharMetas_);
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
      document.getElementById('preparePscip')?.addEventListener('input', event => { event.target.value = String(event.target.value || '').replace(/^prj/i, 'PRJ'); agendarConsultaProcessoPf_('prepare'); });
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
      }));
      preparedInspectionsList?.addEventListener('click', event => {
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
        const btn = event.target.closest('[data-preparacao-id]');
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        try { btn.blur(); } catch (e) {}
        try { document.activeElement?.blur?.(); } catch (e) {}
        const item = preparacoesVistoria.find(p => String(p.id) === String(btn.dataset.preparacaoId));
        aplicarPreparacaoAoFormulario_(item);
      });
      preparedInspectionsList?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const alvo = event.target.closest('[data-preparacao-id]');
        if (!alvo) return;
        event.preventDefault();
        const item = preparacoesVistoria.find(p => String(p.id) === String(alvo.dataset.preparacaoId));
        aplicarPreparacaoAoFormulario_(item);
      });

      form.addEventListener('input', event => {
        if (event.target.classList.contains('invalid') && String(event.target.value || '').trim()) event.target.classList.remove('invalid');
        if (document.getElementById('mesmoEnderecoResponsavel').checked && ['endereco','numero','complemento','bairro'].includes(event.target.id)) syncResponsibleAddress();
        scheduleDraftSave();
      });
      form.addEventListener('change', scheduleDraftSave);
      areaInput?.addEventListener('input', () => { atualizarVerificacaoMetasFiscalizacao_(); scheduleDraftSave(); });
      areaInput?.addEventListener('change', () => { atualizarVerificacaoMetasFiscalizacao_(); scheduleDraftSave(); });
      categoriaMetaSelect?.addEventListener('change', () => { atualizarVerificacaoMetasFiscalizacao_(); scheduleDraftSave(); });
      document.getElementById('demandaPrincipal')?.addEventListener('input', () => { aplicarModoEventoDeclaratorio_({ silencioso: true }); agendarConsultaProcessoPf_('form', 250); });
      document.getElementById('demandaPrincipal')?.addEventListener('change', () => { aplicarModoEventoDeclaratorio_({ silencioso: true }); agendarConsultaProcessoPf_('form', 100); });
      categoriaMetaSelect?.addEventListener('change', atualizarConsultaTecnicaContextual_);
      consultaTecnicaSecao?.addEventListener('click', event => {
        const link = event.target.closest('a[data-it-context-link]');
        if (!link) return;
        try { saveDraft(); } catch (e) {}
      });
      eventoDeclaracaoNumeroInput?.addEventListener('input', event => { event.target.value = String(event.target.value || '').toUpperCase().replace(/\s+/g, ''); });
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
      pscipInput?.addEventListener('input', () => {
        const atual = String(pscipInput.value || '');
        const corrigido = atual.replace(/^prj/i, 'PRJ');
        if (corrigido !== atual) pscipInput.value = corrigido;
        agendarConsultaPscip_();
        scheduleDraftSave();
      });
      pscipInput?.addEventListener('blur', () => {
        if (value('possuiPscip') === 'sim') normalizarPscipInput_(true);
        agendarConsultaPscip_();
        scheduleDraftSave();
      });
      pscipInput?.addEventListener('input', () => agendarConsultaProcessoPf_('form'));
      pscipInput?.addEventListener('blur', () => agendarConsultaProcessoPf_('form', 100));
      processPfInput?.addEventListener('input', () => {
        if (ehVistoriaAcessoria_() && processoAcessoriaVinculado && String(processPfInput.value || '').trim() !== String(processoAcessoriaVinculado.pf || '').trim()) {
          processoAcessoriaVinculado = null;
          sincronizarVistoriaAcessoria_();
        }
      });
      sancaoSelect?.addEventListener('change', () => { syncNotificado(); agendarConsultaEncerramentoFiscal_(); scheduleDraftSave(); });
      pendenciaDocumentalSelect?.addEventListener('change', scheduleDraftSave);
      situacaoMultaInfoscipSelect?.addEventListener('change', () => { scheduleDraftSave(); agendarConsultaEncerramentoFiscal_(); });
      recordRedsCopyBtn?.addEventListener('click', copiarRelatorioReds_);
      recordRedsModelSelect?.addEventListener('change', atualizarTextoRelatorioRedsFiscalizacao_);
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
      notificacoesAdicionarLocalBtn?.addEventListener('click', () => adicionarLocalNotificacao_(true));
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
        const copiar = event.target.closest('[data-notification-copy]');
        if (copiar) {
          const local = localNotificacaoPorId_(copiar.dataset.notificationLocalId);
          const irregularidade = irregularidadeNotificacaoPorId_(local, copiar.dataset.notificationCopy);
          const ok = await copiarTextoCompat_(textoNotificacaoIndividual_(local, irregularidade, false));
          appStatus.textContent = ok ? 'Descrição da notificação copiada.' : 'Não foi possível copiar a descrição automaticamente.';
        }
      });
      document.getElementById('mesmoEnderecoResponsavel').addEventListener('change', () => { syncResponsibleAddress(); scheduleDraftSave(); });
      document.getElementById('cnpj').addEventListener('input', applyIdentificadorMask);
      document.getElementById('cpf').addEventListener('input', applyCpfMask);
      document.getElementById('telefone').addEventListener('input', applyPhoneMask);
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
        aplicarResponsavelEncontrado_(responsaveisLookupAtual[indice]);
      });
      responsavelCpfLookupResultados?.addEventListener('click', event => {
        const botao = event.target.closest('[data-responsavel-cpf-index]');
        if (!botao) return;
        const indice = Number(botao.dataset.responsavelCpfIndex);
        if (!Number.isInteger(indice) || !responsaveisCpfLookupAtual[indice]) return;
        aplicarResponsavelEncontrado_(responsaveisCpfLookupAtual[indice]);
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
      clearBtn.addEventListener('click', () => {
        const mensagem = usuarioPodeOperar_()
          ? 'Limpar todos os campos e apagar o rascunho deste aparelho?'
          : 'Limpar todos os campos deste treinamento?';
        if (confirm(mensagem)) resetForm();
      });
      document.getElementById('newRecordBtn').addEventListener('click', () => { successScreen.classList.remove('show'); resetForm(); });
      document.getElementById('closeSuccessBtn').addEventListener('click', () => successScreen.classList.remove('show'));
      whatsappOrientacoesBtn?.addEventListener('click', abrirOrientacoesWhatsApp_);
      recordsSuccessBtn?.addEventListener('click', abrirRegistroSucessoNaPlanilha_);
      formTabBtn?.addEventListener('click', mostrarVistaFormulario_);
      dashboardNewInspectionBtn?.addEventListener('click', mostrarVistaFormulario_);
      recordsTabBtn?.addEventListener('click', () => mostrarVistaPlanilha_());
      recordsRefreshBtn?.addEventListener('click', () => carregarRegistros_(false));
      recordsClearFiltersBtn?.addEventListener('click', () => {
        limparFiltrosVisiveisPainel_();
        recordsState.prazoMulta = '';
        atualizarEstadoCardsMulta_();
        carregarRegistros_(true);
      });
      kpiMulta1Card?.addEventListener('click', () => filtrarPorPrazoMulta_('primeira'));
      kpiMulta2Card?.addEventListener('click', () => filtrarPorPrazoMulta_('segunda'));
      recordsSearch?.addEventListener('input', () => {
        clearTimeout(recordsSearchTimer);
        recordsState.prazoMulta = '';
        atualizarEstadoCardsMulta_();
        recordsSearchTimer = setTimeout(() => carregarRegistros_(true), 420);
      });
      [recordsCityFilter, recordsDemandFilter, recordsSanctionFilter, recordsTypeFilter, recordsInspectorFilter, recordsPeriodFilter].forEach(select => {
        select?.addEventListener('change', () => {
          recordsState.prazoMulta = '';
          atualizarEstadoCardsMulta_();
          carregarRegistros_(true);
        });
      });
      recordsPrevBtn?.addEventListener('click', () => { if (recordsState.pagina > 1) { recordsState.pagina -= 1; carregarRegistros_(false); } });
      recordsNextBtn?.addEventListener('click', () => { if (recordsState.pagina < recordsState.totalPaginas) { recordsState.pagina += 1; carregarRegistros_(false); } });
      recordsPageButtons?.addEventListener('click', event => {
        const botao = event.target.closest('[data-page]');
        const pagina = Number(botao?.dataset?.page || 0);
        if (!pagina || pagina === recordsState.pagina || recordsState.carregando) return;
        recordsState.pagina = pagina;
        carregarRegistros_(false);
      });
      recordsPageSize?.addEventListener('change', () => {
        const limite = Number(recordsPageSize.value || 25);
        recordsState.limite = [8, 15, 25].includes(limite) ? limite : 25;
        carregarRegistros_(true);
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
      systemManualBtn?.addEventListener('click', abrirManualSistema_);
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
        if (event.key === 'Escape') { fecharAvisoAcessoGeral_(); fecharEscolhaMovel_(); fecharMenuMais_(); fecharTutorial_(); fecharManualSistema_(); fecharDetalheRegistro_(); fecharGerenciadorUsuarios_(); fecharSobreSistema_(); fecharLinksUteis_(); }
      });
      window.addEventListener('resize', fecharMenuMais_);
      sendPendingBtn.addEventListener('click', () => enviarPendentes(false));
      window.addEventListener('offline', () => { atualizarStatusConexao(); if (authEnterBtn) authEnterBtn.disabled = true; if (authOfflineNote && authGate?.classList.contains('show')) authOfflineNote.hidden = false; });
      window.addEventListener('online', () => {
        atualizarStatusConexao();
        if (authEnterBtn) authEnterBtn.disabled = false;
        if (authOfflineNote) authOfflineNote.hidden = true;
        appStatus.textContent = 'Internet restabelecida — verificando registros pendentes.';
        if (usuarioPodeOperar_()) setTimeout(() => enviarPendentes(true), 650);
        if (document.body.classList.contains('records-mode')) {
          setTimeout(() => carregarRegistros_(true), 900);
        }
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
        window.addEventListener('load', async () => {
          try {
            const reg = await navigator.serviceWorker.register('./sw.js?v=23.9.71', { updateViaCache: 'none' });
            await reg.update();
          } catch (e) {}
        });
      }

      instalarEscolhaMovel_();
      inicializarCatalogoNotificacoes_();
      renderizarNotificacoesLiberacao_();
      atualizarStatusConexao();
      carregarSessaoLocalBm_();
      inicializarFilaOffline().then(inicializarAutenticacaoBm_).catch(inicializarAutenticacaoBm_);
    })();
