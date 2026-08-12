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
      const APP_VERSION = '23.9.43';
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
          sancao: ['Autuado','Notificado','Regularizado','Liberado'],
          tipoVistoria: [], natureza: [],
          demandaPrincipal: ['Alerta Vermelho','Liberação','Iniciativa'],
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
          if (error?.name === 'AbortError') throw new Error('A comunicação demorou mais que o esperado. O registro continua seguro neste aparelho.');
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
          return await gatewayRequest_(action, { ...data, sessionToken }, timeoutMs);
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
      const sancaoSelect = document.getElementById('sancao');
      const sancaoAutomaticaHint = document.getElementById('sancaoAutomaticaHint');
      const pendenciaDocumentalWrap = document.getElementById('pendenciaDocumentalWrap');
      const pendenciaDocumentalSelect = document.getElementById('pendenciaDocumental');
      const tipoVistoriaInput = document.getElementById('tipoVistoria');
      const vistoriadorResponsavelSelect = document.getElementById('vistoriadorResponsavel');
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
      const processPfLookupStatus = document.getElementById('processPfLookupStatus');
      const processPfLookupResults = document.getElementById('processPfLookupResults');
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

      let ocupacaoTouchStartY = null;
      let ocupacaoArrastando = false;

      let appConfig = {};
      let sancoesConfiguradas = [];
      let usuariosAtivosApp = [];
      let preparacoesVistoria = [];
      let filtroPreparacoes = 'todas';
      let preparacaoEmUsoId = '';
      let dduEmUsoId = '';
      let ddusAtivos = [];
      let metasMensaisAtual = null;
      let metasCarregando = false;
      let preparacaoEditandoId = '';
      let submitting = false;
      let ultimoRegistroParaOrientacoes = null;
      let recordWhatsappRegistroAtual = null;
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
        prazoMulta: ''
      };
      let saveTimer = null;
      let cnpjTimer = null;
      let ultimoCnpjConsultado = '';
      let cnpjConsultaSequencia = 0;
      let cnpjAssociadoDadosEmpresa = '';
      let responsavelLookupTimer = null;
      let responsavelLookupSequencia = 0;
      let telefoneResponsavelAssociado = '';
      let responsaveisLookupAtual = [];
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
        submitBtn.textContent = online ? 'Registrar vistoria' : 'Salvar no aparelho';
        if (!online) {
          appStatus.textContent = 'Sem internet — preenchimento salvo neste aparelho.';
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
        for (const item of [...lista]) {
          if (!navigator.onLine) break;
          try {
            const resultadoServidor = await chamarSalvarNoServidor(item.payload || {});
            if (item.id === String(ultimoRegistroParaOrientacoes?._appRegistroId || '')) {
              ultimoRegistroConsultaChave = String(resultadoServidor?.chaveConsulta || '');
              atualizarBotaoPlanilhaSucesso_();
            }
            removerPendente(item.id);
            enviados += 1;
          } catch (erro) {
            break;
          }
        }

        sendingQueue = false;
        atualizarPainelPendentes();
        if (enviados > 0) {
          atualizarPlanilhaEmSegundoPlano();
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
        linhas.push('https://gpvvicosa.github.io/controle-fiscalizatorio-gpv/manual');
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

        const mensagem = montarMensagemOrientacoes_(dados);
        const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

        try {
          window.location.assign(url);
        } catch (erro) {
          try {
            window.location.href = url;
          } catch (erro2) {
            const alternativa = `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensagem)}`;
            window.location.href = alternativa;
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
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
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

      function mostrarVistaFormulario_() {
        marcarAbaApp_('form');
        fecharDetalheRegistro_();
        atualizarVistaNaUrl_('form');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function mostrarVistaPlanilha_(opcoes = {}) {
        // Sempre entrar no Painel com a ficha fechada.
        fecharDetalheRegistro_();
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
          recordsTableBody.innerHTML = '<tr><td colspan="9" class="records-table-empty">Nenhum registro encontrado.</td></tr>';
          return;
        }

        recordsTableBody.innerHTML = itens.map(item => {
          const titulo = item.nomeFantasia || item.razaoSocial || 'Registro sem nome';
          const selecionado = recordsState.chaveSelecionada && recordsState.chaveSelecionada === item.chave ? ' selected' : '';
          return `<tr class="records-table-row${selecionado}" data-record-key="${escapeAttr(item.chave || '')}" tabindex="0">
            <td>${escapeHtml(formatarDataPainel_(item.carimbo))}</td>
            <td><strong>${escapeHtml(titulo)}</strong>${item.razaoSocial && normalize(item.razaoSocial) !== normalize(titulo) ? `<small>${escapeHtml(item.razaoSocial)}</small>` : ''}</td>
            <td>${escapeHtml(item.cidade || '—')}</td>
            <td class="records-mono">${escapeHtml(identificadorPainel_(item).valor)}</td>
            <td>${escapeHtml(item.demanda || '—')}</td>
            <td>${statusBadgeHtml_(item.sancao)}</td>
            <td class="records-mono">${escapeHtml(item.projeto || '—')}</td>
            <td>${escapeHtml(item.tipoVistoria || '—')}</td>
            <td class="records-ficha-cell"><button class="records-ficha-btn" type="button" data-open-record-detail="${escapeAttr(item.chave || '')}" title="Abrir Ficha do Processo" aria-label="Abrir ficha de ${escapeAttr(titulo)}">
              <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9.5L19 7v13.5H6z"/><path d="M15.5 3.5V7H19M9 11h7M9 15h5"/></svg>
            </button></td>
          </tr>`;
        }).join('');

        recordsList.innerHTML = itens.map(item => {
          const titulo = item.nomeFantasia || item.razaoSocial || 'Registro sem nome';
          const razao = item.razaoSocial && normalize(item.razaoSocial) !== normalize(titulo) ? item.razaoSocial : '';
          const endereco = [item.endereco, item.numero, item.bairro].filter(Boolean).join(', ');
          return `<button class="records-card" type="button" data-record-key="${escapeAttr(item.chave || '')}" aria-label="Abrir ficha de ${escapeAttr(titulo)}">
            <div class="records-card-top"><div class="records-card-title">${escapeHtml(titulo)}</div><div class="records-card-date">${escapeHtml(formatarDataPainel_(item.carimbo))}</div></div>
            ${razao ? `<div class="records-card-subtitle">${escapeHtml(razao)}</div>` : ''}
            <div class="records-card-status-row">${statusBadgeHtml_(item.sancao)}<span>${escapeHtml(item.demanda || 'Sem demanda')}</span></div>
            <div class="records-card-meta">
              <div class="records-meta-item"><span>Cidade</span><strong>${escapeHtml(item.cidade || '—')}</strong></div>
              <div class="records-meta-item"><span>${escapeHtml(identificadorPainel_(item).rotulo)}</span><strong>${escapeHtml(identificadorPainel_(item).valor)}</strong></div>
              <div class="records-meta-item"><span>Nº PSCIP</span><strong>${escapeHtml(item.projeto || '—')}</strong></div>
              <div class="records-meta-item"><span>Nº PF</span><strong>${escapeHtml(item.pf || '—')}</strong></div>
            </div>
            ${endereco ? `<div class="records-card-address">${escapeHtml(endereco)}</div>` : ''}
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
      }

      async function carregarMetas_(forcar = false) {
        if (metasCarregando) return;
        if (metasMensaisAtual && !forcar) { renderizarMetas_(metasMensaisAtual); return; }
        if (!navigator.onLine) {
          if (dashboardGoalsSubtitle) dashboardGoalsSubtitle.textContent = 'Conecte-se à internet para atualizar as metas.';
          return;
        }
        metasCarregando = true;
        try {
          const resposta = await apiRequest('config', { consulta: 'metas' }, 30000);
          renderizarMetas_(resposta || {});
        } catch (erro) {
          if (dashboardGoalsSubtitle) dashboardGoalsSubtitle.textContent = 'Não foi possível atualizar as metas agora.';
        } finally { metasCarregando = false; }
      }

      function abrirMetas_() {
        fecharMenuMais_();
        if (goalsModal) goalsModal.hidden = false;
        void carregarMetas_(true);
      }

      function fecharMetas_() { if (goalsModal) goalsModal.hidden = true; }

      async function carregarRegistros_(reiniciar = true) {
        if (recordsState.carregando) return;
        if (!navigator.onLine) {
          recordsStatus.className = 'records-status error';
          recordsStatus.textContent = 'Sem internet. O Painel Fiscalizatório é consultado somente online.';
          return;
        }

        if (reiniciar) recordsState.pagina = 1;
        recordsState.carregando = true;
        if (recordsRefreshBtn) recordsRefreshBtn.disabled = true;
        atualizarPaginacao_();
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

        const offset = (recordsState.pagina - 1) * recordsState.limite;
        const limiteApi = Math.max(10, recordsState.limite);
        try {
          const resposta = await apiRequest('config', {
            consulta: 'registros',
            filtros: { ...filtrosConsultaAtuais_(), offset, limite: limiteApi }
          }, 50000);

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

          // V23.9.12: carregar/atualizar o Painel nunca abre a Ficha do Processo sozinho.
          // A ficha só é aberta por uma ação explícita do usuário (ícone da linha/cartão).

          recordsStatus.className = 'records-status';
          const filtrosAtivos = Object.values(filtrosConsultaAtuais_()).some(Boolean);
          const rotuloMulta = recordsState.prazoMulta === 'primeira'
            ? 'sujeito à 1ª multa'
            : (recordsState.prazoMulta === 'segunda' ? 'sujeito à 2ª multa' : '');
          recordsStatus.innerHTML = rotuloMulta
            ? `<strong>${recordsState.total}</strong> ${recordsState.total === 1 ? 'edificação' : 'edificações'} ${rotuloMulta}${recordsState.total === 1 ? '' : 's'}. Clique novamente no card para remover o filtro.`
            : (filtrosAtivos
              ? `<strong>${recordsState.total}</strong> resultado${recordsState.total === 1 ? '' : 's'} com os filtros atuais. Os indicadores acima representam o total da base.`
              : `<strong>${recordsState.total}</strong> registro${recordsState.total === 1 ? '' : 's'} na consulta. Mais recentes primeiro.`);
        } catch (erro) {
          recordsStatus.className = 'records-status error';
          recordsStatus.textContent = erro?.message || 'Não foi possível carregar o Painel Fiscalizatório.';
          if (!recordsState.itens.length) {
            recordsList.innerHTML = '<div class="records-empty">O painel não pôde ser carregado agora.</div>';
            recordsTableBody.innerHTML = '<tr><td colspan="9" class="records-table-empty">Não foi possível carregar os registros.</td></tr>';
          }
        } finally {
          recordsState.carregando = false;
          if (recordsRefreshBtn) recordsRefreshBtn.disabled = false;
          atualizarPaginacao_();
        }
      }

      function fecharDetalheRegistro_() {
        if (!recordDetailScreen) return;
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
      }

      function descricaoSituacaoPainel_(situacao) {
        const n = normalize(situacao);
        if (n === 'liberado') return 'Processo de liberação concluído';
        if (n === 'regularizado') return 'Fiscalização regularizada';
        if (n === 'advertencia') return 'Prazo de regularização em acompanhamento';
        if (n === 'autuado') return 'Fiscalização com irregularidade registrada';
        if (n === 'notificado') return 'Pendência técnica no fluxo de liberação';
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

      function montarGrupoFicha_(titulo, campos) {
        const validos = (campos || []).filter(item => item && item[1]);
        if (!validos.length) return '';
        return `<section class="record-detail-group"><h3>${escapeHtml(titulo)}</h3><div class="record-detail-fields">${validos.map(([rotulo, valor]) => `<div class="record-detail-field"><label>${escapeHtml(rotulo)}</label><div>${escapeHtml(valor)}</div></div>`).join('')}</div></section>`;
      }

      function descricaoHistorico_(item) {
        const n = normalize(item?.sancao || '');
        let texto = '';
        if (n === 'autuado') texto = 'Irregularidades registradas na fiscalização.';
        else if (n === 'advertencia') texto = 'Prazo de regularização em acompanhamento.';
        else if (n === 'notificado') texto = 'Pendências técnicas registradas para liberação.';
        else if (n === 'regularizado') texto = 'Fiscalização regularizada.';
        else if (n === 'liberado') texto = 'Processo de liberação concluído.';
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
        notificado: {
          titulo: 'Notificado em vistoria de liberação',
          texto: `EM ATENDIMENTO À SOLICITAÇÃO DE VISTORIA FINAL PARA EMISSÃO DO AUTO DE VISTORIA DO CORPO DE BOMBEIROS (AVCB), DESLOCAMOS ATÉ O ENDEREÇO INFORMADO NESTE REDS. NO LOCAL TRATA-SE DE EDIFICAÇÃO VINCULADA AO PSCIP Nº {{PSCIP}}.

DURANTE A VISTORIA, FORAM CONSTATADAS IRREGULARIDADES NA EXECUÇÃO DAS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO, EM DESACORDO COM O PROJETO APROVADO. AS NÃO CONFORMIDADES IDENTIFICADAS FORAM LANÇADAS NO SISTEMA INFOSCIP. EM RAZÃO DAS IRREGULARIDADES VERIFICADAS, NÃO FOI POSSÍVEL EMITIR O AVCB.

O RESPONSÁVEL PODERÁ SANAR AS IRREGULARIDADES E SOLICITAR NOVA VISTORIA, BEM COMO APRESENTAR PEDIDO DE RECONSIDERAÇÃO DE ATO, NOS TERMOS DO ART. 16 DO DECRETO ESTADUAL Nº 47.998/2020, CABENDO RECURSO CONFORME ART. 17 DO MESMO DECRETO.

PARA ESCLARECIMENTOS, O GPV DO 3º PELOTÃO BM/VIÇOSA ESTÁ SEDIADO NA CASA Nº 38, VILA GIANNETTI – UFV – CENTRO, VIÇOSA/MG. TEL.: (31) 3612-3894. E-MAIL: VICOSA.GPV@BOMBEIROS.MG.GOV.BR.`
        }
      });

      const RELATORIOS_REDS_FISCALIZACAO = Object.freeze({
        irregular: {
          titulo: 'Fiscalização — irregularidade / autuação',
          texto: `EM AÇÃO FISCALIZADORA, COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, NOS TERMOS DO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E DO ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, FOI CONSTATADO QUE A EDIFICAÇÃO APRESENTA IRREGULARIDADES{{PSCIP_TRECHO}}, AS QUAIS FORAM REGISTRADAS NO PROCESSO FISCALIZATÓRIO Nº {{PF}}, CARACTERIZANDO INFRAÇÃO ADMINISTRATIVA.{{AUTO_PARAGRAFO}}

O RESPONSÁVEL FOI CIENTIFICADO QUANTO À NECESSIDADE DE REGULARIZAÇÃO DA EDIFICAÇÃO.`
        },
        semAvcb: {
          titulo: 'Fiscalização — sem AVCB/CLCB',
          texto: `EM AÇÃO FISCALIZADORA, COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO, NOS TERMOS DO ART. 4º, INCISO III, DO DECRETO ESTADUAL Nº 47.998/2020 E DO ITEM 5.1 DA INSTRUÇÃO TÉCNICA Nº 45/2025.

DURANTE A VISTORIA, FOI CONSTATADO QUE A EDIFICAÇÃO NÃO POSSUI AVCB/CLCB E APRESENTA IRREGULARIDADES QUANTO ÀS MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO. AS IRREGULARIDADES FORAM REGISTRADAS NO PROCESSO FISCALIZATÓRIO Nº {{PF}}.{{AUTO_PARAGRAFO}}

O RESPONSÁVEL FOI ORIENTADO QUANTO À NECESSIDADE DE REGULARIZAÇÃO DA EDIFICAÇÃO JUNTO AO CBMMG.`
        },
        comPscipSemAvcb: {
          titulo: 'Fiscalização — possui PSCIP, mas não possui AVCB',
          texto: `EM AÇÃO FISCALIZADORA, COMPARECEMOS AO ENDEREÇO MENCIONADO NESTE RELATÓRIO PARA A REALIZAÇÃO DE VISTORIA DE FISCALIZAÇÃO.

DURANTE A VISTORIA, CONSTATOU-SE QUE A EDIFICAÇÃO POSSUI PSCIP Nº {{PSCIP}}, PORÉM AINDA NÃO POSSUI AVCB. A IRREGULARIDADE FOI REGISTRADA NO PROCESSO FISCALIZATÓRIO Nº {{PF}}.{{AUTO_PARAGRAFO}}

O RESPONSÁVEL FOI ORIENTADO QUANTO À NECESSIDADE DE REGULARIZAÇÃO DA EDIFICAÇÃO JUNTO AO CBMMG.`
        },
        avcbVencido: {
          titulo: 'Fiscalização — AVCB vencido',
          texto: `EM AÇÃO FISCALIZADORA, FOI REALIZADA VISTORIA NO ENDEREÇO MENCIONADO NESTE RELATÓRIO, NOS TERMOS DA LEGISLAÇÃO DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO.

DURANTE A VISTORIA, CONSTATOU-SE QUE A EDIFICAÇÃO FUNCIONA SEM AVCB VÁLIDO JUNTO AO CBMMG, UMA VEZ QUE O AVCB/PSCIP Nº {{PSCIP}} ENCONTRA-SE COM PRAZO DE VALIDADE EXPIRADO. A IRREGULARIDADE FOI REGISTRADA NO PROCESSO FISCALIZATÓRIO Nº {{PF}}.{{AUTO_PARAGRAFO}}

O RESPONSÁVEL FOI ORIENTADO QUANTO À NECESSIDADE DE REGULARIZAÇÃO.`
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
        if (n === normalize('Notificado')) return RELATORIOS_REDS_LIBERACAO.notificado;
        if (n !== normalize('Liberado')) return null;
        const pendencia = normalize(valorCampoFicha_(registro, 'Pendência documental'));
        return pendencia === normalize('Sim') ? RELATORIOS_REDS_LIBERACAO.liberadoPendencia : RELATORIOS_REDS_LIBERACAO.liberado;
      }

      function sugestaoModeloFiscalizacao_(registro, situacao) {
        const n = normalize(situacao);
        const projeto = valorCampoFicha_(registro, 'Nº do PSCIP / Projeto');
        if (n === normalize('Regularizado')) return projeto ? 'regularizado' : 'dispensado';
        return projeto ? 'comPscipSemAvcb' : 'semAvcb';
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
        recordRedsModelSelect.hidden = false;
        if (label) label.hidden = false;
        const opcoes = [
          ['irregular', 'Fiscalização — irregularidade / autuação'],
          ['semAvcb', 'Fiscalização — sem AVCB/CLCB'],
          ['comPscipSemAvcb', 'Fiscalização — possui PSCIP, mas não possui AVCB'],
          ['avcbVencido', 'Fiscalização — AVCB vencido'],
          ['regularizado', 'Fiscalização — regularizado com AVCB/CLCB'],
          ['dispensado', 'Fiscalização — dispensado de licenciamento / regular'],
          ['localFechado', 'Fiscalização — local fechado / vistoria não realizada']
        ];
        opcoes.forEach(([valor, rotulo]) => {
          const option = document.createElement('option'); option.value = valor; option.textContent = rotulo; recordRedsModelSelect.appendChild(option);
        });
        const sugerido = sugestaoModeloFiscalizacao_(registro, situacao);
        recordRedsModelSelect.value = RELATORIOS_REDS_FISCALIZACAO[sugerido] ? sugerido : 'irregular';
        return recordRedsModelSelect.value;
      }

      function montarTextoRedsFiscalizacao_(modelo, registro) {
        const pscip = valorCampoFicha_(registro, 'Nº do PSCIP / Projeto');
        const pf = valorCampoFicha_(registro, 'Nº do PF') || 'NÃO INFORMADO';
        const numeroAuto = String(recordAutoNumberInput?.value || valorCampoFicha_(registro, 'Nº do Auto') || '').trim();
        const autoParagrafo = numeroAuto ? `\n\nPOSTERIORMENTE, FOI INFORMADO O AUTO DE INFRAÇÃO ADMINISTRATIVA Nº ${numeroAuto}, VINCULADO AO PROCESSO FISCALIZATÓRIO.` : '';
        const pscipTrecho = pscip ? `, VINCULADA AO PSCIP Nº ${pscip}` : '';
        const licenca = pscip ? `AVCB/CLCB Nº ${pscip}` : 'LICENCIAMENTO VÁLIDO';
        return modelo.texto
          .replaceAll('{{PSCIP}}', pscip || 'NÃO INFORMADO')
          .replaceAll('{{PF}}', pf)
          .replaceAll('{{AUTO_PARAGRAFO}}', autoParagrafo)
          .replaceAll('{{PSCIP_TRECHO}}', pscipTrecho)
          .replaceAll('{{LICENCA}}', licenca);
      }

      function atualizarTextoRelatorioRedsFiscalizacao_() {
        const registro = recordRedsRegistroAtual;
        if (!registro || !recordRedsReportText || !recordRedsReportModel) return;
        const tipo = normalize(valorCampoFicha_(registro, 'Tipo de vistoria'));
        const situacao = registro?.situacaoAtual || valorCampoFicha_(registro, 'Sanção');
        if (tipo.includes('liberacao') || [normalize('Liberado'), normalize('Notificado')].includes(normalize(situacao))) return;
        const chaveModelo = recordRedsModelSelect?.value || sugestaoModeloFiscalizacao_(registro, situacao);
        const modelo = RELATORIOS_REDS_FISCALIZACAO[chaveModelo] || RELATORIOS_REDS_FISCALIZACAO.irregular;
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

        if (recordAutoNumberWrap) recordAutoNumberWrap.hidden = ehLiberacao;
        if (recordAutoNumberInput) recordAutoNumberInput.value = ehLiberacao ? '' : valorCampoFicha_(registro, 'Nº do Auto');
        if (recordAutoNumberStatus) recordAutoNumberStatus.textContent = '';

        if (ehLiberacao) {
          const modelo = modeloRelatorioRedsLiberacao_(registro, situacao);
          if (!modelo || !pscip) {
            recordRedsReportPanel.hidden = true;
            recordRedsReportText.value = '';
            return;
          }
          preencherSelectModelosReds_(true, registro, situacao);
          recordRedsReportModel.textContent = modelo.titulo;
          recordRedsReportText.value = modelo.texto.replaceAll('{{PSCIP}}', pscip);
        } else {
          preencherSelectModelosReds_(false, registro, situacao);
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


      function renderizarFichaRegistro_(registro) {
        const situacao = registro?.situacaoAtual || 'Sem situação';
        const estabelecimento = registro?.titulo || valorCampoFicha_(registro, 'Nome Fantasia', 'Razão Social') || '—';
        const cnpj = valorCampoFicha_(registro, 'CNPJ');
        const cpfRegistro = valorCampoFicha_(registro, 'CPF');
        const identificadorRegistro = cnpj || (cpfRegistro ? formatarCpfTela_(cpfRegistro) : '');
        const rotuloIdentificador = cnpj ? 'CNPJ' : (cpfRegistro ? 'CPF' : 'CNPJ / CPF');
        const razaoSocial = valorCampoFicha_(registro, 'Razão Social');
        const processo = [
          ['Nº PSCIP', valorCampoFicha_(registro, 'Nº do PSCIP / Projeto')],
          ['Nº do PF', valorCampoFicha_(registro, 'Nº do PF')],
          ['Demanda', valorCampoFicha_(registro, 'Demanda')],
          ['Tipo de vistoria', valorCampoFicha_(registro, 'Tipo de vistoria')],
          ['Data da vistoria', valorCampoFicha_(registro, 'Data e hora')],
          ['REDS', valorCampoFicha_(registro, 'REDS')],
          ['Enviado por', valorCampoFicha_(registro, 'Enviado por')],
          ['Pendência documental', valorCampoFicha_(registro, 'Pendência documental')]
        ];
        const local = [
          ['Estabelecimento', estabelecimento],
          ['Razão Social', razaoSocial && normalize(razaoSocial) !== normalize(estabelecimento) ? razaoSocial : ''],
          ['Endereço', enderecoFicha_(registro)],
          [rotuloIdentificador, identificadorRegistro]
        ];
        const responsavel = [
          ['Responsável', valorCampoFicha_(registro, 'Responsável')],
          ['Nome', valorCampoFicha_(registro, 'Nome')],
          ['CPF', valorCampoFicha_(registro, 'CPF')],
          ['Telefone', valorCampoFicha_(registro, 'Telefone')],
          ['E-mail', valorCampoFicha_(registro, 'E-mail')]
        ];

        recordDetailGroups.innerHTML =
          montarGrupoFicha_('Processo', processo) +
          montarGrupoFicha_('Local', local) +
          montarGrupoFicha_('Responsável', responsavel);

        recordDetailTitle.textContent = 'Ficha do Processo';
        recordDetailSubtitle.textContent = descricaoSituacaoPainel_(situacao);
        recordDetailLine.textContent = [estabelecimento, identificadorRegistro].filter(Boolean).join(' • ');
        recordDetailStatusBadge.textContent = situacao;
        recordDetailStatusBadge.className = `status-badge ${classeStatus_(situacao)}`;
        if (recordCurrentStatus) recordCurrentStatus.className = `record-current-status ${classeStatus_(situacao)}`;
        renderizarRelatorioReds_(registro, situacao);
        renderizarWhatsAppFicha_(registro);
        renderizarHistorico_(registro?.historico || []);
        renderizarAuditoriaRegistro_(registro?.auditoria || []);
        atualizarLinkPlanilha_(registro?.planilhaUrl || '');
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

      async function consultarRegistroComRetry_(chave) {
        let ultimoErro = null;
        for (let tentativa = 0; tentativa < 2; tentativa += 1) {
          try {
            if (tentativa > 0) {
              estadoCarregandoFicha_('Tentando novamente...');
              await new Promise(resolve => setTimeout(resolve, 450));
            }
            return await apiRequest('config', { consulta: 'registro', chave }, 50000);
          } catch (erro) {
            ultimoErro = erro;
            if (!navigator.onLine) break;
          }
        }
        throw ultimoErro || new Error('Não foi possível consultar o processo.');
      }

      async function abrirDetalheRegistro_(chave) {
        if (!chave) return;
        if (!navigator.onLine) {
          alert('A Ficha do Processo precisa de internet para consultar os dados atualizados.');
          return;
        }
        recordsState.chaveSelecionada = chave;
        marcarLinhaSelecionada_();
        recordDetailScreen.classList.add('show');
        recordDetailScreen.setAttribute('aria-hidden', 'false');
        document.body.classList.add('detail-open');
        estadoCarregandoFicha_();
        if (recordRedsReportPanel) recordRedsReportPanel.hidden = true;
        if (recordRedsReportText) recordRedsReportText.value = '';
        if (recordWhatsappPanel) recordWhatsappPanel.hidden = true;
        if (recordWhatsappStatus) recordWhatsappStatus.textContent = '';
        recordWhatsappRegistroAtual = null;
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

        try {
          const registro = await consultarRegistroComRetry_(chave);
          recordDetailScreen.classList.remove('is-detail-loading', 'is-detail-error');
          recordDetailLoading.hidden = true;
          renderizarFichaRegistro_(registro);
        } catch (erro) {
          const msg = String(erro?.message || 'Não foi possível abrir a ficha.').replace('O registro continua seguro neste aparelho.', '').trim();
          estadoErroFicha_(msg);
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
        if (chave) await abrirDetalheRegistro_(chave);
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

      function pesquisarOcupacoes(termo) {
        const q = normalizarTermoOcupacao(termo);
        const oficiais = q
          ? OCUPACOES_CBMMG
              .map((item, indice) => ({ item, indice, pontos: pontuarOcupacao(item, q) }))
              .filter(resultado => resultado.pontos > 0)
              .filter(resultado => !ocupacaoJaSelecionada(valorOcupacao(resultado.item)))
              .sort((a, b) => b.pontos - a.pontos || a.indice - b.indice)
              .slice(0, 10)
              .map(resultado => resultado.item)
          : OCUPACOES_CBMMG
              .filter(item => !ocupacaoJaSelecionada(valorOcupacao(item)))
              .slice(0, 10);

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
          usuariosAtivosApp = Array.isArray(resposta?.usuarios) ? resposta.usuarios : [];
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

      function atualizarOpcoesSancaoPorFluxo_() {
        if (!sancaoSelect) return;
        const fluxo = fluxoVistoriaAtual_();
        const atual = String(sancaoSelect.value || '');
        let opcoes = [];
        if (fluxo === 'liberacao') {
          opcoes = ['Liberado', 'Notificado'];
        } else if (fluxo === 'fiscalizacao') {
          opcoes = (sancoesConfiguradas || []).filter(v => {
            const n = normalize(v);
            return n !== normalize('Advertência') && n !== normalize('Notificado') && n !== normalize('Liberado');
          });
          if (!opcoes.length) opcoes = ['Autuado', 'Regularizado'];
        } else {
          opcoes = [];
        }
        fillSelect('sancao', opcoes, fluxo ? 'Selecione' : 'Escolha primeiro o tipo de vistoria');
        if (atual && opcoes.some(v => normalize(v) === normalize(atual))) sancaoSelect.value = atual;
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
        if (vistoriaBottomBar) vistoriaBottomBar.hidden = !f;
        if (fluxoVistoriaAtualTexto) {
          fluxoVistoriaAtualTexto.hidden = !f;
          fluxoVistoriaAtualTexto.textContent = f === 'liberacao'
            ? 'Fluxo selecionado: Vistoria de Liberação — situação final: Liberado ou Notificado.'
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
          if (demanda && (!demanda.value || normalize(demanda.value) === normalize('Fiscalização'))) demanda.value = 'Liberação';
        } else {
          syncLicenciamento();
        }
        syncNotificado();
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

      function buildPayload() {
        return {
          _appRegistroId: currentRecordId,
          _appUsuarioId: String(authState.usuario?.id || ''),
          _appUsuarioNome: String(authState.usuario?.nome || ''),
          _appUsuarioSessao: String(authState.sessionToken || ''),
          _appDispositivo: nomeDispositivo_(),
          _appPreparacaoId: preparacaoEmUsoId,
          _appDduId: dduEmUsoId,
          vistoriadorResponsavel: value('vistoriadorResponsavel'),
          cidade: cityValue() || 'Viçosa',
          nomeFantasia: value('nomeFantasia'),
          razaoSocial: value('razaoSocial'),
          cnpj: value('cnpj'),
          _appIdentificadorTipo: tipoIdentificador_(value('cnpj')),
          _appLicenciamento: value('licenciamento'),
          _appPossuiPscip: value('possuiPscip'),
          _appSancaoAntesAuto: sancaoAntesDoAutomatico,
          sancao: value('sancao'),
          pendenciaDocumental: value('pendenciaDocumental'),
          pscip: value('possuiPscip') === 'sim' ? normalizarPscipExibicao_(value('pscip'), true) : '',
          pf: value('pf'),
          tipoVistoria: value('tipoVistoria'),
          reds: value('reds'),
          natureza: value('natureza'),
          enderecoCorrespondencia: value('enderecoCorrespondencia'),
          endereco: value('endereco'),
          numero: value('numero'),
          complemento: value('complemento'),
          bairro: value('bairro'),
          demandaPrincipal: value('demandaPrincipal'),
          categoriaMeta: value('categoriaMeta'),
          resim: value('resim'),
          area: value('area'),
          pavimentos: value('pavimentos'),
          altura: value('altura'),
          ocupacao: ocupacaoTextoFinal(),
          responsavel: value('responsavel'),
          nomeResponsavel: value('nomeResponsavel'),
          rg: value('rg'),
          cpf: value('cpf') || (tipoIdentificador_(value('cnpj')) === 'cpf' ? value('cnpj') : ''),
          mae: value('mae'),
          nascimento: value('nascimento'),
          profissao: value('profissao'),
          estadoCivil: value('estadoCivil'),
          escolaridade: value('escolaridade'),
          telefone: value('telefone'),
          email: value('email'),
          enderecoResponsavel: value('enderecoResponsavel')
        };
      }

      function openParentDetails(element) {
        if (!element) return;
        const details = element.closest('details');
        if (details) details.open = true;
      }

      function validateRequired(showMessage = true) {
        document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        const checks = [
          ['tipoVistoria', 'Tipo de vistoria'],
          ...(ehFluxoLiberacao_() ? [] : [['licenciamento', 'Situação do licenciamento'], ['possuiPscip', 'Possui PSCIP?']]),
          ['vistoriadorResponsavel', 'Vistoriador responsável'],
          ['cnpj', 'CNPJ ou CPF'],
          ['endereco', 'Endereço'],
          ['nomeResponsavel', 'Nome do responsável'],
          ['mae', 'Mãe']
        ];
        const missing = [];
        let first = null;
        if (ehFluxoLiberacao_() && normalize(value('sancao')) === normalize('Liberado') && !value('pendenciaDocumental')) {
          if (pendenciaDocumentalSelect) pendenciaDocumentalSelect.classList.add('invalid');
          missing.push('Pendência documental');
          first = first || pendenciaDocumentalSelect;
        }
        if (value('possuiPscip') === 'sim' && normalizarPscipTela_(value('pscip')).length <= 3) {
          const elPscip = document.getElementById('pscip');
          if (elPscip) elPscip.classList.add('invalid');
          missing.push('Nº do PSCIP');
          first = first || elPscip;
        }
        checks.forEach(([id, label]) => {
          const el = document.getElementById(id);
          if (!String(el.value || '').trim()) {
            missing.push(label);
            el.classList.add('invalid');
            if (!first) first = el;
          }
        });
        if (citySelect.value === 'Outro' && !value('outraCidade')) {
          missing.push('Outra cidade');
          otherCity.classList.add('invalid');
          if (!first) first = otherCity;
        }
        const identificador = digits(value('cnpj'));
        if (identificador && ![11, 14].includes(identificador.length)) {
          const el = document.getElementById('cnpj');
          el.classList.add('invalid');
          if (showMessage) showError('Informe um CNPJ com 14 dígitos ou um CPF com 11 dígitos.');
          openParentDetails(el);
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return false;
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
        const liberacao = ehFluxoLiberacao_();

        // Em vistoria de liberação, a constatação final é exclusivamente Liberado/Notificado.
        // A regra de autuação automática por ausência de AVCB/CLCB pertence somente ao fluxo fiscalizatório.
        if (liberacao) {
          if (sancaoSelect) sancaoSelect.disabled = false;
          sancaoDefinidaAutomaticamente = false;
          sancaoAntesDoAutomatico = '';
          if (sancaoAutomaticaHint) sancaoAutomaticaHint.hidden = true;
        } else if (naoPossui) {
          if (!sancaoDefinidaAutomaticamente) sancaoAntesDoAutomatico = value('sancao');
          sancaoDefinidaAutomaticamente = true;
          if (sancaoSelect) {
            sancaoSelect.value = 'Autuado';
            sancaoSelect.disabled = true;
          }
          if (sancaoAutomaticaHint) sancaoAutomaticaHint.hidden = false;
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
        const raw = digits(event.target.value).slice(0, 14);
        clearTimeout(cnpjTimer);
        cnpjConsultaSequencia += 1;

        if (raw.length <= 10) {
          event.target.value = raw;
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
          event.target.value = formatarCpfTela_(raw);
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
        event.target.value = formatarCnpjTela_(raw);
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
          esconderResponsavelLookupResultados_();
          showResponsavelLookupStatus_(`Dados recuperados da planilha para ${item.nomeResponsavel || 'o responsável selecionado'}. Confira antes de registrar.`, 'success');
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
        return {
          identificador: digits(value('cnpj')),
          pscip: value('pscip'),
          cidade: cityValue(),
          endereco: value('endereco'),
          numero: value('numero')
        };
      }

      function chaveFiltrosProcessoPf_(f) {
        return [digits(f.identificador || ''), normalizarPscipTela_(f.pscip || ''), normalize(f.cidade || ''), normalize(f.endereco || ''), normalize(f.numero || '')].join('|');
      }

      function filtrosSuficientesProcessoPf_(f) {
        const d = digits(f.identificador || '');
        const docOk = d.length === 11 || d.length === 14;
        const pscipOk = normalizarPscipTela_(f.pscip || '').length > 3;
        const enderecoOk = !!(String(f.cidade || '').trim() && String(f.endereco || '').trim() && String(f.numero || '').trim());
        return docOk || pscipOk || enderecoOk;
      }

      function limparResultadoProcessoPf_(origem = 'form') {
        const prepare = origem === 'prepare';
        const status = prepare ? preparePfLookupStatus : processPfLookupStatus;
        const resultados = prepare ? preparePfLookupResults : processPfLookupResults;
        if (status) { status.textContent = ''; status.className = 'lookup-status'; }
        if (resultados) { resultados.innerHTML = ''; resultados.hidden = true; }
        if (prepare) preparePfCandidatos = []; else processoPfCandidatos = [];
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
        if (prepare) preparePfAutoAtual = input.value; else processoPfAutoAtual = input.value;
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
        if (prepare) preparePfCandidatos = candidatos; else processoPfCandidatos = candidatos;
        if (!resultados) return;
        if (!candidatos.length) {
          resultados.innerHTML = '';
          resultados.hidden = true;
          const input = prepare ? preparePfInput : processPfInput;
          const autoAtual = prepare ? preparePfAutoAtual : processoPfAutoAtual;
          if (input && autoAtual && String(input.value || '').trim() === autoAtual) input.value = '';
          if (prepare) preparePfAutoAtual = ''; else processoPfAutoAtual = '';
          if (status) { status.textContent = 'Nenhum Nº do PF localizado no histórico desde 01/07/2025.'; status.className = 'lookup-status show info'; }
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
          status.textContent = `${candidatos.length} processos compatíveis encontrados desde 01/07/2025. Selecione o Nº do PF correto.`;
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
        if (status) { status.textContent = 'Pesquisando processo fiscalizatório desde 01/07/2025...'; status.className = 'lookup-status show info'; }
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
        const n = normalize(value('sancao'));
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
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 350);
      }

      function saveDraft() {
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
          aplicarFluxoVistoria_(inferirFluxoDoRascunho_(p), { silencioso: true });
          currentRecordId = String(draft.recordId || p._appRegistroId || currentRecordId || criarIdRegistro());
          sancaoAntesDoAutomatico = String(p._appSancaoAntesAuto || '');
          if (licenciamentoSelect) licenciamentoSelect.value = String(p._appLicenciamento || '');
          if (possuiPscipSelect) possuiPscipSelect.value = String(p._appPossuiPscip || (p.pscip ? 'sim' : ''));
          sancaoDefinidaAutomaticamente = String(p._appLicenciamento || '') === 'nao_possui';
          const cityOptions = Array.from(citySelect.options).map(o => o.value);
          if (cityOptions.includes(p.cidade)) {
            citySelect.value = p.cidade;
          } else if (p.cidade) {
            citySelect.value = 'Outro';
            otherCity.value = p.cidade;
          }
          Object.entries(p).forEach(([key, val]) => {
            if (key === 'cidade' || key === 'ocupacao' || key.startsWith('_app')) return;
            const el = document.getElementById(key);
            if (el) el.value = val == null ? '' : val;
          });
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
          appStatus.textContent = 'Rascunho anterior recuperado.';
        } catch (e) {}
      }

      function resetForm() {
        preparacaoEmUsoId = '';
        dduEmUsoId = '';
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
        syncPendenciaDocumental_();
        syncOtherCity();
        syncLicenciamento();
        syncPscip_();
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
        ocupacaoInput.value = '';
        renderizarOcupacoesSelecionadas();
        mostrarMetaOcupacao(null);
        esconderResultadosOcupacao();
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
        if (valor === 'dispensado') return 'Dispensado de licenciamento';
        return valor || '—';
      }

      function mostrarRevisaoAntesEnvio_(payload, duplicidade, encerramentoFiscal) {
        const identificador = digits(payload?.cnpj);
        const idFormatado = identificador.length === 14
          ? formatarCnpjTela_(identificador)
          : (identificador.length === 11 ? formatarCpfTela_(identificador) : identificador);
        const itens = [
          ['Estabelecimento', payload?.nomeFantasia || payload?.razaoSocial || '—'],
          ['CNPJ / CPF', idFormatado || '—'],
          ['Cidade', payload?.cidade || '—'],
          ['Endereço', [payload?.endereco, payload?.numero, payload?.bairro].filter(Boolean).join(', ') || '—'],
          ['Responsável / RT', payload?.nomeResponsavel || '—'],
          ['Telefone', payload?.telefone || '—'],
          ['Licenciamento', textoLicenciamentoRevisao_(payload?._appLicenciamento)],
          ['Possui PSCIP?', payload?._appPossuiPscip === 'sim' ? 'Sim' : (payload?._appPossuiPscip === 'nao' ? 'Não' : '—')],
          ['Nº PSCIP', payload?.pscip || '—'],
          ['Demanda', [payload?.demandaPrincipal, payload?.categoriaMeta].filter(Boolean).join(' | ') || '—'],
          ['Tipo de vistoria', payload?.tipoVistoria || '—'],
          ['Vistoriador responsável', payload?.vistoriadorResponsavel || '—'],
          ['Sanção', payload?.sancao || '—'],
          ['Nº PF', payload?.pf || '—'],
          ['Enviado por', authState.usuario?.nome || '—']
        ];

        const duplicados = Array.isArray(duplicidade?.encontrados) ? duplicidade.encontrados : [];
        const avisoDuplicidade = duplicidade?.duplicado && duplicados.length
          ? `Atenção: já existe vistoria recente deste CNPJ/CPF no mesmo endereço. Registro mais recente: ${duplicados[0].carimbo || 'data não informada'} — ${duplicados[0].estabelecimento || 'estabelecimento'}${duplicados[0].sancao ? ` — ${duplicados[0].sancao}` : ''}. Se esta é uma nova vistoria, você pode continuar.`
          : '';

        if (!reviewModal || !reviewList || !reviewConfirmBtn || !reviewCancelBtn) {
          const texto = itens.map(([r, v]) => `${r}: ${v}`).join('\n');
          const confirmou = window.confirm(`${avisoDuplicidade ? avisoDuplicidade + '\n\n' : ''}${texto}\n\nConfirmar e registrar?`);
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
            const podeConfirmar = candidatosEncerramento.length === 1;
            reviewClosureNotice.innerHTML = `<strong>Processo fiscalizatório anterior localizado</strong>
              <p>${escapeHtml(refPrincipal)} está em <b>${escapeHtml(principal.sancao || 'situação em aberto')}</b>. A vistoria atual está como <b>${escapeHtml(payload?.sancao || '')}</b>.</p>
              ${podeConfirmar
                ? `<label class="review-closure-check"><input type="checkbox" id="reviewClosureConfirm"> <span>Confirmar o encerramento deste processo anterior como <strong>Regularizado</strong> ao registrar a vistoria atual.</span></label>`
                : `<p><strong>Atenção:</strong> foram encontrados ${candidatosEncerramento.length} processos compatíveis. Nenhum será encerrado automaticamente; confira qual PF corresponde ao processo.</p><ul>${listaOutros}</ul>`}`;
            reviewClosureNotice.hidden = false;
          }
        }
        reviewModal.hidden = false;
        document.body.classList.add('review-open');

        return new Promise(resolve => {
          let encerrado = false;
          const finalizar = confirmado => {
            if (encerrado) return;
            encerrado = true;
            const candidatos = Array.isArray(encerramentoFiscal?.candidatos) ? encerramentoFiscal.candidatos : [];
            const principal = candidatos[0] || null;
            const encerrarProcesso = Boolean(confirmado && candidatos.length === 1 && document.getElementById('reviewClosureConfirm')?.checked);
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
        const payload = buildPayload();
        payload._appRegistroId = currentRecordId;
        payload._appCriadoEm = payload._appCriadoEm || new Date().toISOString();
        saveDraft();

        if (navigator.onLine) appStatus.textContent = 'Conferindo duplicidade e processos anteriores antes do envio...';
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

      function abrirPreparacoesDoUsuario_() {
        if (!preparacoesDoUsuarioLogado_().length) return;
        mostrarVistaFormulario_();
        filtroPreparacoes = 'todas';
        document.querySelectorAll('[data-prepared-filter]').forEach(b => b.classList.toggle('is-active', b.dataset.preparedFilter === 'todas'));
        renderizarPreparacoesVistoria_();
        window.setTimeout(() => {
          document.querySelector('.prepared-inspections-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }

      function atualizarUsuarioLogadoUi_() {
        const usuario = authState.usuario;
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
          await carregarInicialComMotivacional_();
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
        const restante = Math.max(0, 5000 - (Date.now() - inicio));
        if (restante) await new Promise(resolve => setTimeout(resolve, restante));

        overlay.classList.add('leaving');
        await new Promise(resolve => setTimeout(resolve, 360));
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
          ocultarTelaLoginBm_();
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
          await registrarCredencialOfflineBm_(result.usuario, novaSenha || senha);
          const senhaEfetiva = novaSenha || senha;
          if (authSavePasswordCheck?.checked && /^\d{6}$/.test(senhaEfetiva)) {
            await salvarSenhaLocalPerfilBm_(result.usuario.id, senhaEfetiva);
          } else if (result.usuario?.id && perfilTemSenhaSalvaBm_(result.usuario.id)) {
            apagarSenhaLocalPerfilBm_(result.usuario.id);
          }
          ocultarTelaLoginBm_();
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
              <span>Nº BM ${escapeHtml(u.bm)}${u.provisorio ? ' · provisório' : ''}${ehAtual ? ' · conectado' : ''} · ${u.senhaConfigurada ? 'senha ativa' : 'senha a criar'}</span>
            </div>
            <div class="user-manager-item-actions">
              <button type="button" class="user-edit-btn" data-user-edit="${escapeHtml(u.id)}" data-user-name="${escapeHtml(u.nome)}" data-user-bm="${escapeHtml(u.bm)}">Editar</button>
              <button type="button" class="user-reset-pin-btn" data-user-reset-pin="${escapeHtml(u.id)}" data-user-name="${escapeHtml(u.nome)}">Redefinir senha</button>
              <button type="button" class="user-delete-btn" data-user-delete="${escapeHtml(u.id)}" data-user-name="${escapeHtml(u.nome)}" ${ehAtual ? 'disabled title="Você está conectado com este usuário"' : ''}>Excluir</button>
            </div>
          </article>`;
        }).join('');
      }

      async function abrirGerenciadorUsuarios_() {
        fecharMenuMais_();
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
        if (userManagerMessage) userManagerMessage.textContent = '';
        if (!nome || !/^\d{7}$/.test(bm)) {
          if (userManagerMessage) userManagerMessage.textContent = 'Informe nome e Nº BM com 7 dígitos.';
          return;
        }
        if (userManagerSaveBtn) userManagerSaveBtn.disabled = true;
        try {
          const action = id ? 'user_update' : 'user_add';
          const result = await apiRequest(action, { userId: id, nome, bm }, 30000);
          if (result?.sessionToken && result?.usuarioAtual) {
            salvarSessaoLocalBm_(result.usuarioAtual, result.sessionToken);
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
        if (prepareInspectionSaveBtn) prepareInspectionSaveBtn.textContent = 'Cadastrar vistoria';
        ultimoCnpjPreparacaoConsultado = '';
        clearPrepareCnpjStatus_();
        limparResultadoProcessoPf_('prepare');
        atualizarCamposPreparacaoPorTipo_();
      }


      function lerArquivoBase64_(file, maxBytes, extensao) {
        return new Promise((resolve, reject) => {
          if (!file) return resolve(null);
          if (file.size > maxBytes) return reject(new Error(`O arquivo excede o limite de ${Math.round(maxBytes/1024/1024)} MB.`));
          if (extensao && !String(file.name || '').toLowerCase().endsWith(extensao)) return reject(new Error(`Selecione um arquivo ${extensao}.`));
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
        if(dduSummaryCount)dduSummaryCount.textContent=String(ativos.length); if(dduSummaryText)dduSummaryText.textContent=ativos.length?`${ativos.length} demanda(s) pendente(s)${vencidos?` • ${vencidos} atrasada(s)`:criticos?` • ${criticos} próxima(s) do prazo`:''}`:'Nenhuma demanda pendente';
        dduSummaryCard?.classList.toggle('is-danger',vencidos>0); dduSummaryCard?.classList.toggle('is-warning',!vencidos&&criticos>0);
        if(!dduList)return;
        const card=(x,concluido=false)=>{const p=classificarPrazoDdu_(x.dataLimite); const end=[x.endereco,x.numero,x.bairro,x.cidade].filter(Boolean).join(', '); let ret=''; if(concluido&&x.excluirArquivoApos){const fim=new Date(x.excluirArquivoApos); if(!Number.isNaN(fim.getTime())){const h=Math.max(0,Math.ceil((fim-Date.now())/3600000));ret=`Concluído • PDF disponível por cerca de ${h} h`;}} return `<article class="ddu-item ${concluido?'is-completed':p.c}" data-ddu-id="${escapeAttr(x.id)}"><div class="ddu-item-head"><div><h3>${escapeHtml(x.numeroDdu||'DDU 181')}</h3><p>${escapeHtml(end)}</p><p>${x.vistoriadorResponsavel?`<b>Vistoriador:</b> ${escapeHtml(x.vistoriadorResponsavel)}`:'Vistoriador não definido'}</p></div><span class="ddu-deadline">${escapeHtml(concluido?(ret||'Concluído'):p.r)}</span></div><div class="ddu-file-note">${concluido?'O PDF será enviado automaticamente para a lixeira após 24 h.':'PDF disponível enquanto a demanda estiver aberta e por 24 h após a conclusão.'}</div><div class="ddu-item-actions">${x.arquivoUrl?`<a class="btn btn-secondary" href="${escapeAttr(x.arquivoUrl)}" target="_blank" rel="noopener">Ver PDF</a>`:''}${concluido?'':`<button class="btn btn-primary ddu-start-btn" type="button" data-ddu-start="${escapeAttr(x.id)}">Iniciar fiscalização</button>`}</div></article>`};
        const blocos=[]; if(ativos.length)blocos.push(`<section class="prepared-group"><h3>Pendentes</h3>${ativos.sort((a,b)=>String(a.dataLimite||'9999').localeCompare(String(b.dataLimite||'9999'))).map(x=>card(x,false)).join('')}</section>`); if(concluidos.length)blocos.push(`<section class="prepared-group"><h3>Concluídos — PDF disponível por 24 h</h3>${concluidos.map(x=>card(x,true)).join('')}</section>`); dduList.innerHTML=blocos.join('')||'<div class="prepared-empty">Nenhum DDU cadastrado.</div>';
      }
      async function carregarDdUs_(){
        const inicioLoadingDdu = Date.now();
        const tempoMinimoLoading = 1200;
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
          if(dduSummaryText)dduSummaryText.textContent='Não foi possível carregar • toque para tentar novamente';
          if(dduSummaryCount)dduSummaryCount.textContent='!';
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
      function iniciarDdu_(item){ if(!item)return; dduEmUsoId=String(item.id||''); if(dduListModal)dduListModal.hidden=true; aplicarFluxoVistoria_('fiscalizacao',{silencioso:true}); const set=(id,v)=>{const el=document.getElementById(id);if(el&&v)el.value=v}; set('endereco',item.endereco);set('numero',item.numero);set('bairro',item.bairro);set('complemento',item.complemento);set('vistoriadorResponsavel',item.vistoriadorResponsavel); if(item.cidade){const op=Array.from(citySelect.options).find(o=>normalize(o.value)===normalize(item.cidade)); if(op)citySelect.value=op.value; else{citySelect.value='Outro';if(otherCity)otherCity.value=item.cidade;} syncOtherCity();} agendarConsultaProcessoPf_('form',180); appStatus.textContent='DDU carregado. Complete os dados da fiscalização.'; }

      function abrirModalPreparacao_() {
        fecharMenuMais_();
        if (!prepareInspectionModal) return;
        limparFormularioPreparacao_();
        if (prepareInspectionError) prepareInspectionError.hidden = true;
        prepareInspectionModal.hidden = false;
        document.body.classList.add('review-open');
      }

      function abrirEdicaoPreparacao_(item) {
        if (!item?.id || !prepareInspectionModal) return;
        fecharMenuMais_();
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
        if (prepareDwgStatus) prepareDwgStatus.textContent = item.arquivoDwgNome ? `Arquivo atual: ${item.arquivoDwgNome}. Selecione outro DWG apenas para substituir.` : 'Nenhum DWG anexado.';
        if (prepareInspectionSaveBtn) prepareInspectionSaveBtn.textContent = 'Salvar alterações';
        if (prepareInspectionError) prepareInspectionError.hidden = true;
        atualizarCamposPreparacaoPorTipo_();
        prepareInspectionModal.hidden = false;
        document.body.classList.add('review-open');
      }

      function fecharModalPreparacao_() {
        if (!prepareInspectionModal) return;
        prepareInspectionModal.hidden = true;
        document.body.classList.remove('review-open');
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
            p._appArquivoDwg = await lerArquivoBase64_(prepareDwgFile.files[0], 8 * 1024 * 1024, '.dwg');
          }
          const eraEdicao = Boolean(preparacaoEditandoId);
          if (eraEdicao) {
            // V23.9.7: edição usa a rota de config já liberada no gateway,
            // evitando o caminho de gravação de vistoria normal e garantindo JSON previsível.
            await apiRequest('config', { consulta: 'programada_editar', payload: p }, 30000);
          } else {
            await apiRequest('save', { payload: p }, 30000);
          }
          fecharModalPreparacao_();
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
        if (!programmedInspectionsBox) return;
        const semProgramacoes = !Array.isArray(preparacoesVistoria) || preparacoesVistoria.length === 0;
        programmedInspectionsBox.classList.toggle('mobile-hide-when-empty', semProgramacoes);
        programmedInspectionsBox.setAttribute('data-program-count', String(Array.isArray(preparacoesVistoria) ? preparacoesVistoria.length : 0));
      }

      function renderizarPreparacoesVistoria_() {
        atualizarVisibilidadeProgramadasMobile_();
        atualizarIndicadorPreparacoesUsuario_();
        atualizarAlertaPrazosProgramados_();
        if (!preparedInspectionsList) return;
        const meuNome = String(authState.usuario?.nome || '').trim();
        const lista = preparacoesVistoria
          .filter(item => filtroPreparacoes === 'todas' || item.tipoPreparacao === filtroPreparacoes)
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
              ${item.arquivoDwgUrl ? `<a class="btn btn-secondary" href="${escapeAttr(item.arquivoDwgUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Abrir DWG</a>` : ''}
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
        const tempoMinimoLoading = 1200;
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

      function rolarParaFormularioProgramado_() {
        const secao = document.getElementById('cidadeSecao');
        if (!secao) return;

        const alvo = secao.querySelector('.section-head') || secao;
        const scrollers = () => {
          const lista = [];
          let pai = alvo.parentElement;
          while (pai && pai !== document.documentElement) {
            const css = window.getComputedStyle(pai);
            const oy = css.overflowY;
            if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && pai.scrollHeight > pai.clientHeight + 2) lista.push(pai);
            pai = pai.parentElement;
          }
          return lista;
        };

        const offsetTopo = () => {
          let total = 12;
          const candidatos = ['.app-header', '.topbar', '.app-view-nav'];
          candidatos.forEach(sel => {
            const el = document.querySelector(sel);
            if (!el || el.offsetParent === null) return;
            const css = window.getComputedStyle(el);
            if (css.position === 'fixed' || css.position === 'sticky') total += el.getBoundingClientRect().height || 0;
          });
          return Math.min(total, 190);
        };

        const posicionar = (suave = false) => {
          if (secao.hidden || secao.offsetParent === null) return false;
          const offset = offsetTopo();

          // Navegador/documento principal.
          const scrolling = document.scrollingElement || document.documentElement;
          const rect = alvo.getBoundingClientRect();
          const destino = Math.max(0, (scrolling.scrollTop || window.pageYOffset || 0) + rect.top - offset);
          try { window.scrollTo({ top: destino, behavior: suave ? 'smooth' : 'auto' }); }
          catch (e) { scrolling.scrollTop = destino; }
          scrolling.scrollTop = destino;

          // Caso o PWA esteja usando algum contêiner interno rolável.
          scrollers().forEach(container => {
            const ar = alvo.getBoundingClientRect();
            const cr = container.getBoundingClientRect();
            const topo = Math.max(0, container.scrollTop + ar.top - cr.top - 10);
            try { container.scrollTo({ top: topo, behavior: suave ? 'smooth' : 'auto' }); }
            catch (e) { container.scrollTop = topo; }
            if (!suave) container.scrollTop = topo;
          });

          secao.classList.add('programmed-form-highlight');
          return true;
        };

        // O preenchimento da programação muda altura/visibilidade de vários campos.
        // Enquanto o layout estabiliza, mantemos o destino preso em "1. Cidade".
        requestAnimationFrame(() => requestAnimationFrame(() => posicionar(true)));
        const inicio = Date.now();
        const timer = window.setInterval(() => {
          posicionar(false);
          const rect = alvo.getBoundingClientRect();
          const esperado = offsetTopo();
          const acertou = Math.abs(rect.top - esperado) < 28;
          if ((acertou && Date.now() - inicio > 500) || Date.now() - inicio > 2400) {
            clearInterval(timer);
            window.setTimeout(() => secao.classList.remove('programmed-form-highlight'), 1400);
          }
        }, 140);
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
        scheduleDraftSave();
        agendarConsultaProcessoPf_('form', 180);
        rolarParaFormularioProgramado_();
        appStatus.textContent = `Vistoria programada carregada${item.vistoriadorResponsavel ? ` — responsável: ${item.vistoriadorResponsavel}` : ''}.`;
      }

      async function loadInitialData() {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null'); } catch (e) {}
        aplicarConfig(cached || DEFAULT_CONFIG);
        restoreDraft();
        atualizarNomeDispositivoUi_();
        loadingOverlay.classList.remove('show');
        atualizarStatusConexao();
        appStatus.textContent = navigator.onLine ? 'Aplicativo pronto. Sincronizando configurações...' : 'Modo offline — aplicativo pronto para preenchimento.';

        if (navigator.onLine) {
          try {
            const data = await apiRequest('config', {}, 30000);
            aplicarConfig(data);
            try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
            appStatus.textContent = 'Sistema pronto para registrar vistoria.';
          } catch (error) {
            appStatus.textContent = 'Aplicativo pronto com configuração armazenada.';
            if (!cached) showError('A configuração online não pôde ser atualizada agora. O preenchimento continua disponível.');
          }
          if (obterPendentes().length) setTimeout(() => enviarPendentes(true), 900);
        }

        const vistaForcada = vistaInicialDaUrl_();
        const vistaInicial = vistaForcada || vistaInicialPorDispositivo_();

        if (vistaInicial === 'records') {
          if (vistaForcada) mostrarVistaPlanilha_();
          else {
            marcarAbaApp_('records');
            carregarRegistros_(true);
          }
        } else {
          marcarAbaApp_('form');
        }

        // V23.9.38: só inicia os loaders de DDU/programações depois que a vista já está pintada.
        // Antes, as consultas começavam durante a inicialização e a animação terminava antes de a tela Vistoria aparecer.
        if (navigator.onLine) {
          if (vistaInicial === 'form') {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            await Promise.allSettled([carregarUsuariosVistoriadores_(), carregarPreparacoesVistoria_(), carregarDdUs_()]);
          } else {
            Promise.allSettled([carregarUsuariosVistoriadores_(), carregarPreparacoesVistoria_(), carregarDdUs_()]).catch(() => {});
          }
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
      goalsModal?.addEventListener('click', event => { if (event.target === goalsModal) fecharMetas_(); });
      registerDduBtn?.addEventListener('click', () => { fecharMenuMais_(); abrirCadastroDdu_(); });
      recordDetailLoading?.addEventListener('click', event => {
        const btn = event.target.closest('[data-retry-record-detail]');
        if (!btn || !recordsState.chaveSelecionada) return;
        abrirDetalheRegistro_(recordsState.chaveSelecionada);
      });

      dduSummaryCard?.addEventListener('click', async () => { if(dduListModal)dduListModal.hidden=false; await carregarDdUs_(); });
      dduRegisterCloseBtn?.addEventListener('click', fecharCadastroDdu_); dduRegisterCancelBtn?.addEventListener('click', fecharCadastroDdu_); dduRegisterSaveBtn?.addEventListener('click', salvarDdu_);
      dduListCloseBtn?.addEventListener('click', () => { if(dduListModal)dduListModal.hidden=true; });
      dduList?.addEventListener('click', e => { const b=e.target.closest('[data-ddu-start]'); if(!b)return; iniciarDdu_(ddusAtivos.find(x=>String(x.id)===String(b.dataset.dduStart))); });
      prepareInspectionBtn?.addEventListener('click', abrirModalPreparacao_);
      desktopPrepareInspectionBtn?.addEventListener('click', abrirModalPreparacao_);
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
        filtroPreparacoes = btn.dataset.preparedFilter || 'todas';
        document.querySelectorAll('[data-prepared-filter]').forEach(b => b.classList.toggle('is-active', b === btn));
        renderizarPreparacoesVistoria_();
      }));
      preparedInspectionsList?.addEventListener('click', event => {
        const editar = event.target.closest('[data-preparacao-edit-id]');
        if (editar) {
          event.preventDefault();
          event.stopPropagation();
          const item = preparacoesVistoria.find(p => String(p.id) === String(editar.dataset.preparacaoEditId));
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
      citySelect.addEventListener('change', () => { syncOtherCity(); scheduleDraftSave(); });
      licenciamentoSelect?.addEventListener('change', () => { syncLicenciamento(); scheduleDraftSave(); });
      licenciamentoSelect?.addEventListener('input', () => { syncLicenciamento(); scheduleDraftSave(); });
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
      sancaoSelect?.addEventListener('change', () => { syncNotificado(); agendarConsultaEncerramentoFiscal_(); scheduleDraftSave(); });
      pendenciaDocumentalSelect?.addEventListener('change', scheduleDraftSave);
      recordRedsCopyBtn?.addEventListener('click', copiarRelatorioReds_);
      recordRedsModelSelect?.addEventListener('change', atualizarTextoRelatorioRedsFiscalizacao_);
      recordAutoNumberInput?.addEventListener('input', atualizarTextoRelatorioRedsFiscalizacao_);
      recordAutoNumberSaveBtn?.addEventListener('click', salvarNumeroAutoRegistro_);
      recordWhatsappPhoneInput?.addEventListener('input', atualizarWhatsAppFicha_);
      recordWhatsappSendBtn?.addEventListener('click', enviarWhatsAppFicha_);
      document.getElementById('mesmoEnderecoResponsavel').addEventListener('change', () => { syncResponsibleAddress(); scheduleDraftSave(); });
      document.getElementById('cnpj').addEventListener('input', applyIdentificadorMask);
      document.getElementById('cpf').addEventListener('input', applyCpfMask);
      document.getElementById('telefone').addEventListener('input', applyPhoneMask);
      ['cnpj','endereco','numero','pf','demandaPrincipal'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', agendarConsultaEncerramentoFiscal_);
      });
      ['cnpj','endereco','numero'].forEach(id => document.getElementById(id)?.addEventListener('input', () => agendarConsultaProcessoPf_('form')));
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
      ocupacaoInput.addEventListener('focus', () => pesquisarOcupacoes(ocupacaoInput.value));
      ocupacaoInput.addEventListener('input', () => {
        ocupacaoSelecionada = localizarOcupacaoPorValor(ocupacaoInput.value);
        mostrarMetaOcupacao(ocupacaoSelecionada);
        pesquisarOcupacoes(ocupacaoInput.value);
      });
      ocupacaoInput.addEventListener('blur', () => setTimeout(esconderResultadosOcupacao, 280));
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
      clearBtn.addEventListener('click', () => { if (confirm('Limpar todos os campos e apagar o rascunho deste aparelho?')) resetForm(); });
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
        if (card) abrirDetalheRegistro_(card.dataset.recordKey || '');
      });
      recordsTableBody?.addEventListener('click', event => {
        const botaoFicha = event.target.closest('[data-open-record-detail]');
        if (!botaoFicha) return;
        event.stopPropagation();
        abrirDetalheRegistro_(botaoFicha.dataset.openRecordDetail || '');
      });
      recordDetailCloseBtn?.addEventListener('click', fecharDetalheRegistro_);
      recordDetailBackdrop?.addEventListener('click', fecharDetalheRegistro_);
      moreMenuTriggers.forEach(btn => btn.addEventListener('click', event => {
        event.stopPropagation();
        alternarMenuMais_(btn);
      }));
      appMoreMenu?.addEventListener('click', event => event.stopPropagation());
      tutorialMenuBtn?.addEventListener('click', abrirTutorial_);
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
        if (event.key === 'Escape') { fecharMenuMais_(); fecharTutorial_(); fecharDetalheRegistro_(); fecharGerenciadorUsuarios_(); fecharSobreSistema_(); fecharLinksUteis_(); }
      });
      window.addEventListener('resize', fecharMenuMais_);
      sendPendingBtn.addEventListener('click', () => enviarPendentes(false));
      window.addEventListener('offline', () => { atualizarStatusConexao(); if (authEnterBtn) authEnterBtn.disabled = true; if (authOfflineNote && authGate?.classList.contains('show')) authOfflineNote.hidden = false; });
      window.addEventListener('online', () => {
        atualizarStatusConexao();
        if (authEnterBtn) authEnterBtn.disabled = false;
        if (authOfflineNote) authOfflineNote.hidden = true;
        appStatus.textContent = 'Internet restabelecida — verificando registros pendentes.';
        setTimeout(() => enviarPendentes(true), 650);
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
            const reg = await navigator.serviceWorker.register('./sw.js?v=23.9.43', { updateViaCache: 'none' });
            await reg.update();
          } catch (e) {}
        });
      }

      atualizarStatusConexao();
      carregarSessaoLocalBm_();
      inicializarFilaOffline().then(inicializarAutenticacaoBm_).catch(inicializarAutenticacaoBm_);
    })();
