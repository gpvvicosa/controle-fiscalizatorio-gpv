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
      const AUTH_CLIENT_VERSION = 'bm-v1';
      const APP_VERSION = '23.5';
      const DEVICE_NAME_STORAGE = 'gpvVistoriasNomeDispositivoV1';
      let authState = { usuario: null, sessionToken: '' };
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
            lastUsedAt: Number(item.lastUsedAt || 0)
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
        const lista = carregarPerfisConhecidosBm_().filter(item => String(item.usuario.id) !== String(usuario.id));
        lista.unshift({ usuario, sessionToken: String(sessionToken), lastUsedAt: Date.now() });
        salvarPerfisConhecidosBm_(lista);
      }

      function removerPerfilConhecidoBm_(userId) {
        if (!userId) return;
        salvarPerfisConhecidosBm_(carregarPerfisConhecidosBm_().filter(item => String(item.usuario.id) !== String(userId)));
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
      const manageUsersBtn = document.getElementById('manageUsersBtn');
      const logoutUserBtn = document.getElementById('logoutUserBtn');
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
      const manualAutuadoBtn = document.getElementById('manualAutuadoBtn');
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
      const recordAuditCount = document.getElementById('recordAuditCount');
      const recordAuditList = document.getElementById('recordAuditList');
      const connectionBanner = document.getElementById('connectionBanner');
      const connectionStateText = document.getElementById('connectionStateText');
      const syncSummary = document.getElementById('syncSummary');
      const pendingPanel = document.getElementById('pendingPanel');
      const pendingTitle = document.getElementById('pendingTitle');
      const pendingText = document.getElementById('pendingText');
      const sendPendingBtn = document.getElementById('sendPendingBtn');
      const installPanel = document.getElementById('installPanel');
      const installBtn = document.getElementById('installBtn');
      const installText = document.getElementById('installText');
      const appMoreMenu = document.getElementById('appMoreMenu');
      const navMoreMenuBtn = document.getElementById('navMoreMenuBtn');
      const dashboardMoreMenuBtn = document.getElementById('dashboardMoreMenuBtn');
      const dashboardSheetHeaderLink = document.getElementById('dashboardSheetHeaderLink');
      const tutorialMenuBtn = document.getElementById('tutorialMenuBtn');
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
      const aboutSystemModal = document.getElementById('aboutSystemModal');
      const aboutSystemCloseBtn = document.getElementById('aboutSystemCloseBtn');
      const aboutSystemGrid = document.getElementById('aboutSystemGrid');
      const aboutSystemNote = document.getElementById('aboutSystemNote');

      let ocupacaoTouchStartY = null;
      let ocupacaoArrastando = false;

      let appConfig = {};
      let submitting = false;
      let ultimoRegistroParaOrientacoes = null;
      let ultimoRegistroConsultaChave = '';
      let recordsSearchTimer = null;
      const recordsState = {
        pagina: 1,
        limite: 8,
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
        if (!syncSummary) return;
        const quantidade = obterPendentes().length;
        syncSummary.classList.remove('is-ok', 'is-pending', 'is-offline');
        if (!navigator.onLine) {
          syncSummary.classList.add('is-offline');
          syncSummary.textContent = quantidade
            ? `Offline • ${quantidade} vistoria${quantidade === 1 ? '' : 's'} aguardando envio`
            : 'Offline • nenhum envio pendente';
          return;
        }
        if (quantidade) {
          syncSummary.classList.add('is-pending');
          syncSummary.textContent = `${quantidade} vistoria${quantidade === 1 ? '' : 's'} aguardando sincronização`;
          return;
        }
        syncSummary.classList.add('is-ok');
        syncSummary.textContent = 'Tudo sincronizado';
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
        const data = valor ? new Date(valor) : new Date();
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
        linhas.push('Após esta mensagem, será encaminhado o Manual do Autuado em PDF, contendo orientações sobre o procedimento de fiscalização e as providências necessárias para regularização.');
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

      const MANUAL_AUTUADO_URL = './assets/manual-do-autuado-infoscip-fiscalizacao.pdf';
      const MANUAL_AUTUADO_NOME = 'Manual do Autuado - Infoscip Fiscalizacao.pdf';

      async function obterArquivoManualAutuado_() {
        const resposta = await fetch(MANUAL_AUTUADO_URL, { cache: 'force-cache' });
        if (!resposta.ok) throw new Error('Não foi possível carregar o Manual do Autuado.');
        const blob = await resposta.blob();
        return new File([blob], MANUAL_AUTUADO_NOME, { type: 'application/pdf' });
      }

      function abrirMensagemWhatsAppResponsavel_() {
        const payload = ultimoRegistroParaOrientacoes || {};
        const numero = telefoneWhatsApp_(payload.telefone);
        if (!numero) {
          alert('Telefone do responsável não informado ou inválido.');
          return;
        }
        if (!navigator.onLine) {
          alert('É necessário estar conectado à internet para abrir a conversa do responsável no WhatsApp.');
          return;
        }

        const mensagem = montarMensagemOrientacoes_(payload);
        const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
        try {
          window.location.assign(url);
        } catch (erro) {
          window.location.href = url;
        }
      }

      async function compartilharManualAutuado_() {
        try {
          const manual = await obterArquivoManualAutuado_();
          if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [manual] }))) {
            await navigator.share({
              title: 'Manual do Autuado — CBMMG',
              files: [manual]
            });
            return;
          }
        } catch (erro) {
          if (erro?.name === 'AbortError') return;
          console.warn('Compartilhamento do Manual indisponível; abrindo o PDF.', erro);
        }

        try {
          window.open(MANUAL_AUTUADO_URL, '_blank', 'noopener');
        } catch (erro) {
          window.location.href = MANUAL_AUTUADO_URL;
        }
      }

      function atualizarBotaoOrientacoes_() {
        if (!whatsappOrientacoesBtn) return;
        const numero = telefoneWhatsApp_(ultimoRegistroParaOrientacoes?.telefone);
        const label = whatsappOrientacoesBtn.querySelector('.whatsapp-btn-label');
        whatsappOrientacoesBtn.disabled = !numero;
        if (numero) {
          if (label) label.textContent = 'Enviar mensagem ao responsável';
          if (whatsappOrientacoesNote) whatsappOrientacoesNote.textContent = '1º envie a mensagem diretamente ao WhatsApp do responsável. Ao retornar ao app, toque em “Enviar Manual do Autuado”.';
        } else {
          if (label) label.textContent = 'WhatsApp — telefone não informado';
          if (whatsappOrientacoesNote) whatsappOrientacoesNote.textContent = 'Informe um telefone válido do responsável para abrir diretamente a conversa no WhatsApp.';
        }
        if (manualAutuadoBtn) manualAutuadoBtn.disabled = false;
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
          recordsTableBody.innerHTML = '<tr><td colspan="8" class="records-table-empty">Nenhum registro encontrado.</td></tr>';
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
        recordsStatus.textContent = 'Atualizando Painel Fiscalizatório...';

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
          preencherPeriodosConsulta_(disponiveis.anos);
          atualizarLinkPlanilha_(resposta?.planilhaUrl || '');
          atualizarKpis_(resposta?.resumo || {});
          const chaveAindaVisivel = recordsState.itens.some(item => item.chave === recordsState.chaveSelecionada);
          if (!chaveAindaVisivel) recordsState.chaveSelecionada = recordsState.itens[0]?.chave || '';
          renderizarRegistros_();
          atualizarPaginacao_();

          if (window.innerWidth >= 1181 && recordsState.chaveSelecionada) {
            await abrirDetalheRegistro_(recordsState.chaveSelecionada);
          }

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
            recordsTableBody.innerHTML = '<tr><td colspan="8" class="records-table-empty">Não foi possível carregar os registros.</td></tr>';
          }
        } finally {
          recordsState.carregando = false;
          if (recordsRefreshBtn) recordsRefreshBtn.disabled = false;
          atualizarPaginacao_();
        }
      }

      function fecharDetalheRegistro_() {
        if (!recordDetailScreen) return;
        if (document.body.classList.contains('records-mode') && window.innerWidth >= 1181) return;
        recordDetailScreen.classList.remove('show');
        recordDetailScreen.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('detail-open');
        recordDetailGroups.innerHTML = '';
        recordHistoryTimeline.innerHTML = '';
        recordHistoryPanel.hidden = true;
        recordDetailLoading.hidden = false;
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
          ['Enviado por', valorCampoFicha_(registro, 'Enviado por')]
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
        renderizarHistorico_(registro?.historico || []);
        renderizarAuditoriaRegistro_(registro?.auditoria || []);
        atualizarLinkPlanilha_(registro?.planilhaUrl || '');
      }

      async function abrirDetalheRegistro_(chave) {
        if (!chave || !navigator.onLine) return;
        recordsState.chaveSelecionada = chave;
        marcarLinhaSelecionada_();
        recordDetailScreen.classList.add('show');
        recordDetailScreen.setAttribute('aria-hidden', 'false');
        document.body.classList.add('detail-open');
        recordDetailLoading.hidden = false;
        recordDetailLoading.textContent = 'Carregando ficha do processo...';
        recordDetailGroups.innerHTML = '';
        recordHistoryTimeline.innerHTML = '';
        recordHistoryPanel.hidden = true;
        if (recordAuditList) recordAuditList.innerHTML = '';
        if (recordAuditPanel) recordAuditPanel.hidden = true;

        try {
          const registro = await apiRequest('config', { consulta: 'registro', chave }, 50000);
          recordDetailLoading.hidden = true;
          renderizarFichaRegistro_(registro);
        } catch (erro) {
          recordDetailLoading.hidden = false;
          recordDetailLoading.textContent = erro?.message || 'Não foi possível abrir a ficha.';
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
        const sancoesManuais = (op.sancao || []).filter(v => normalize(v) !== normalize('Advertência'));
        fillSelect('sancao', sancoesManuais, 'Selecione');
        fillDatalist('dlTipoVistoria', op.tipoVistoria);
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

      function buildPayload() {
        return {
          _appRegistroId: currentRecordId,
          _appUsuarioId: String(authState.usuario?.id || ''),
          _appUsuarioNome: String(authState.usuario?.nome || ''),
          _appUsuarioSessao: String(authState.sessionToken || ''),
          _appDispositivo: nomeDispositivo_(),
          cidade: cityValue() || 'Viçosa',
          nomeFantasia: value('nomeFantasia'),
          razaoSocial: value('razaoSocial'),
          cnpj: value('cnpj'),
          _appIdentificadorTipo: tipoIdentificador_(value('cnpj')),
          _appLicenciamento: value('licenciamento'),
          _appPossuiPscip: value('possuiPscip'),
          _appSancaoAntesAuto: sancaoAntesDoAutomatico,
          sancao: value('sancao'),
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
          ['licenciamento', 'Situação do licenciamento'],
          ['possuiPscip', 'Possui PSCIP?'],
          ['cnpj', 'CNPJ ou CPF'],
          ['endereco', 'Endereço'],
          ['nomeResponsavel', 'Nome do responsável'],
          ['mae', 'Mãe']
        ];
        const missing = [];
        let first = null;
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

        if (naoPossui) {
          if (!sancaoDefinidaAutomaticamente) {
            sancaoAntesDoAutomatico = value('sancao');
          }
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

      function syncNotificado() {
        const isNotificado = normalize(value('sancao')) === normalize('Notificado');
        document.getElementById('noticeNotificado').classList.toggle('show', isNotificado);
        if (isNotificado && !value('demandaPrincipal')) document.getElementById('demandaPrincipal').value = 'Liberação';
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
        form.reset();
        localStorage.removeItem(draftKeyAtual_());
        currentRecordId = criarIdRegistro();
        citySelect.value = appConfig?.padroes?.cidade || 'Viçosa';
        otherCity.value = '';
        sancaoDefinidaAutomaticamente = false;
        sancaoAntesDoAutomatico = '';
        if (licenciamentoSelect) licenciamentoSelect.value = '';
        if (possuiPscipSelect) possuiPscipSelect.value = '';
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
        moreMenuTriggers.forEach(btn => btn.setAttribute('aria-expanded', 'false'));
      }

      function posicionarMenuMais_(gatilho) {
        if (!appMoreMenu || !gatilho) return;
        const margem = 10;
        const rect = gatilho.getBoundingClientRect();
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
        moreMenuTriggers.forEach(btn => btn.setAttribute('aria-expanded', btn === gatilho ? 'true' : 'false'));
        posicionarMenuMais_(gatilho || navMoreMenuBtn || dashboardMoreMenuBtn);
      }

      function atualizarUsuarioLogadoUi_() {
        const usuario = authState.usuario;
        if (loggedUserMenuText) {
          loggedUserMenuText.textContent = usuario
            ? `${usuario.nome} · Nº BM ${usuario.bm}`
            : 'Encerrar o acesso neste aparelho';
        }
        if (loggedUserBadge) {
          loggedUserBadge.textContent = usuario ? String(usuario.nome || '') : '';
          loggedUserBadge.hidden = !usuario?.nome;
        }
      }

      function mostrarTelaLoginBm_(mensagem = '') {
        if (!authGate) return;
        authGate.classList.add('show');
        authGate.setAttribute('aria-hidden', 'false');
        document.body.classList.add('auth-locked');
        if (authManualLogin) authManualLogin.hidden = false;
        if (authDeviceChoice) authDeviceChoice.hidden = true;
        if (authSubtitle) authSubtitle.innerHTML = 'Informe seu <strong>Nº BM</strong> para acessar o aplicativo.';
        if (authMessage) authMessage.textContent = mensagem;
        if (authProfileChoice) authProfileChoice.hidden = true;
        if (authProfileList) authProfileList.innerHTML = '';
        if (authOfflineNote) authOfflineNote.hidden = navigator.onLine;
        if (authEnterBtn) authEnterBtn.disabled = !navigator.onLine;
        setTimeout(() => authBmInput?.focus(), 30);
      }

      function mostrarEscolhaUsuariosDispositivo_(mensagem = '') {
        const perfis = carregarPerfisConhecidosBm_();
        if (!perfis.length) {
          mostrarTelaLoginBm_(mensagem);
          return;
        }
        if (!authGate) return;
        authGate.classList.add('show');
        authGate.setAttribute('aria-hidden', 'false');
        document.body.classList.add('auth-locked');
        if (authManualLogin) authManualLogin.hidden = true;
        if (authDeviceChoice) authDeviceChoice.hidden = false;
        if (authSubtitle) authSubtitle.textContent = mensagem || 'Escolha quem está utilizando este aparelho.';
        if (authDeviceProfileList) {
          authDeviceProfileList.innerHTML = perfis.map(item => `
            <button type="button" class="auth-device-profile-btn" data-device-user-id="${escapeHtml(item.usuario.id)}">
              ${escapeHtml(item.usuario.nome)}
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
      }

      function normalizarBmCliente_(valor) {
        return String(valor || '').replace(/\D/g, '').slice(0, 7);
      }

      async function concluirLoginBm_(bm, userId = '') {
        if (!navigator.onLine) {
          mostrarTelaLoginBm_('Primeiro acesso neste aparelho exige internet.');
          return false;
        }
        const numero = normalizarBmCliente_(bm);
        if (!/^\d{7}$/.test(numero)) {
          if (authMessage) authMessage.textContent = 'Informe um Nº BM com 7 dígitos.';
          return false;
        }
        if (authEnterBtn) authEnterBtn.disabled = true;
        if (authMessage) authMessage.textContent = 'Verificando Nº BM...';
        try {
          const result = await authRequest_({ bm: numero, userId }, 30000);
          if (result?.requiresSelection) {
            if (authProfileChoice) authProfileChoice.hidden = false;
            if (authProfileList) {
              authProfileList.innerHTML = (result.usuarios || []).map(u => `
                <button type="button" class="auth-profile-btn" data-auth-user-id="${escapeHtml(u.id)}">
                  <strong>${escapeHtml(u.nome)}</strong><span>Nº BM ${escapeHtml(u.bm)}${u.provisorio ? ' · provisório' : ''}</span>
                </button>
              `).join('');
            }
            if (authMessage) authMessage.textContent = 'Escolha seu nome para continuar.';
            return false;
          }
          if (!result?.autenticado || !result?.usuario || !result?.sessionToken) throw new Error('Não foi possível concluir a identificação.');
          salvarSessaoLocalBm_(result.usuario, result.sessionToken);
          ocultarTelaLoginBm_();
          if (result.usuario.provisorio) {
            setTimeout(() => alert('Seu Nº BM está cadastrado provisoriamente como 1234567. Atualize-o em Mais → Gerenciar usuários quando souber o número correto.'), 250);
          }
          return true;
        } catch (error) {
          if (authMessage) authMessage.textContent = error?.message || 'Não foi possível entrar.';
          return false;
        } finally {
          if (authEnterBtn) authEnterBtn.disabled = !navigator.onLine;
        }
      }

      async function selecionarPerfilConhecidoBm_(userId) {
        const perfis = carregarPerfisConhecidosBm_();
        const perfil = perfis.find(item => String(item.usuario.id) === String(userId || ''));
        if (!perfil) {
          mostrarEscolhaUsuariosDispositivo_('O usuário salvo neste aparelho não foi localizado.');
          return false;
        }

        // Offline: um perfil já validado neste aparelho pode ser selecionado sem rede.
        if (!navigator.onLine) {
          salvarSessaoLocalBm_(perfil.usuario, perfil.sessionToken);
          ocultarTelaLoginBm_();
          return true;
        }

        try {
          const result = await authRequest_({ sessionToken: perfil.sessionToken }, 20000);
          if (!result?.autenticado || !result?.usuario) throw new Error('Não foi possível confirmar este usuário.');
          salvarSessaoLocalBm_(result.usuario, result.sessionToken || perfil.sessionToken);
          ocultarTelaLoginBm_();
          return true;
        } catch (error) {
          if (error?.code === 'AUTH_REQUIRED' || error?.status === 401) {
            removerPerfilConhecidoBm_(perfil.usuario.id);
            limparSessaoLocalBm_();
            const restantes = carregarPerfisConhecidosBm_();
            if (restantes.length) mostrarEscolhaUsuariosDispositivo_('Esse acesso precisa ser validado novamente. Escolha outro usuário ou entre com o Nº BM.');
            else mostrarTelaLoginBm_('Esse acesso precisa ser validado novamente. Informe o Nº BM.');
            return false;
          }
          // Se a internet estiver instável, mantém o perfil já validado no aparelho.
          salvarSessaoLocalBm_(perfil.usuario, perfil.sessionToken);
          ocultarTelaLoginBm_();
          return true;
        }
      }

      async function inicializarAutenticacaoBm_() {
        carregarSessaoLocalBm_();
        const perfis = carregarPerfisConhecidosBm_();
        atualizarUsuarioLogadoUi_();

        // Tablet compartilhado: mais de um perfil conhecido sempre exige escolha
        // na abertura, evitando atribuir a vistoria ao último usuário por engano.
        if (perfis.length > 1) {
          loadingOverlay.classList.remove('show');
          mostrarEscolhaUsuariosDispositivo_();
          return;
        }

        if (perfis.length === 1) {
          const entrou = await selecionarPerfilConhecidoBm_(perfis[0].usuario.id);
          if (entrou) return loadInitialData();
          loadingOverlay.classList.remove('show');
          return;
        }

        if (authState.usuario && authState.sessionToken) {
          const entrou = await selecionarPerfilConhecidoBm_(authState.usuario.id);
          if (entrou) return loadInitialData();
        }

        loadingOverlay.classList.remove('show');
        mostrarTelaLoginBm_();
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
              <span>Nº BM ${escapeHtml(u.bm)}${u.provisorio ? ' · provisório' : ''}${ehAtual ? ' · conectado' : ''}</span>
            </div>
            <div class="user-manager-item-actions">
              <button type="button" class="user-edit-btn" data-user-edit="${escapeHtml(u.id)}" data-user-name="${escapeHtml(u.nome)}" data-user-bm="${escapeHtml(u.bm)}">Editar</button>
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

      function sairUsuarioBm_() {
        fecharMenuMais_();
        if (!confirm('Trocar o usuário que está usando este aparelho?')) return;

        // Em tablet compartilhado, preserva o rascunho do usuário atual e limpa
        // somente a tela antes de entregar o aparelho ao próximo usuário.
        let rascunhoAtual = '';
        const chaveRascunho = draftKeyAtual_();
        try {
          saveDraft();
          rascunhoAtual = String(localStorage.getItem(chaveRascunho) || '');
        } catch (e) {}
        resetForm();
        try { if (rascunhoAtual) localStorage.setItem(chaveRascunho, rascunhoAtual); } catch (e) {}

        limparSessaoLocalBm_();
        const perfis = carregarPerfisConhecidosBm_();
        if (perfis.length) mostrarEscolhaUsuariosDispositivo_('Escolha seu usuário.');
        else mostrarTelaLoginBm_();
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
      }

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
      sancaoSelect?.addEventListener('change', () => { syncNotificado(); agendarConsultaEncerramentoFiscal_(); scheduleDraftSave(); });
      document.getElementById('mesmoEnderecoResponsavel').addEventListener('change', () => { syncResponsibleAddress(); scheduleDraftSave(); });
      document.getElementById('cnpj').addEventListener('input', applyIdentificadorMask);
      document.getElementById('cpf').addEventListener('input', applyCpfMask);
      document.getElementById('telefone').addEventListener('input', applyPhoneMask);
      ['cnpj','endereco','numero','pf','demandaPrincipal'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', agendarConsultaEncerramentoFiscal_);
      });
      citySelect?.addEventListener('change', agendarConsultaEncerramentoFiscal_);
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
      manualAutuadoBtn?.addEventListener('click', compartilharManualAutuado_);
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
      [recordsCityFilter, recordsDemandFilter, recordsSanctionFilter, recordsTypeFilter, recordsPeriodFilter].forEach(select => {
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
        const limite = Number(recordsPageSize.value || 8);
        recordsState.limite = [8, 15, 25].includes(limite) ? limite : 8;
        carregarRegistros_(true);
      });
      recordsList?.addEventListener('click', event => {
        const card = event.target.closest('.records-card');
        if (card) abrirDetalheRegistro_(card.dataset.recordKey || '');
      });
      recordsTableBody?.addEventListener('click', event => {
        const row = event.target.closest('.records-table-row');
        if (row) abrirDetalheRegistro_(row.dataset.recordKey || '');
      });
      recordsTableBody?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target.closest('.records-table-row');
        if (!row) return;
        event.preventDefault();
        abrirDetalheRegistro_(row.dataset.recordKey || '');
      });
      recordDetailCloseBtn?.addEventListener('click', fecharDetalheRegistro_);
      recordDetailBackdrop?.addEventListener('click', fecharDetalheRegistro_);
      moreMenuTriggers.forEach(btn => btn.addEventListener('click', event => {
        event.stopPropagation();
        alternarMenuMais_(btn);
      }));
      appMoreMenu?.addEventListener('click', event => event.stopPropagation());
      tutorialMenuBtn?.addEventListener('click', abrirTutorial_);
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
      manageUsersBtn?.addEventListener('click', abrirGerenciadorUsuarios_);
      logoutUserBtn?.addEventListener('click', sairUsuarioBm_);
      authBmInput?.addEventListener('input', () => { authBmInput.value = normalizarBmCliente_(authBmInput.value); });
      authForm?.addEventListener('submit', async event => {
        event.preventDefault();
        await concluirLoginBm_(authBmInput?.value || '');
        if (authState.usuario && authState.sessionToken) await loadInitialData();
      });
      authProfileList?.addEventListener('click', async event => {
        const btn = event.target.closest('[data-auth-user-id]');
        if (!btn) return;
        const entrou = await concluirLoginBm_(authBmInput?.value || '', btn.dataset.authUserId || '');
        if (entrou) await loadInitialData();
      });
      authDeviceProfileList?.addEventListener('click', async event => {
        const btn = event.target.closest('[data-device-user-id]');
        if (!btn) return;
        const entrou = await selecionarPerfilConhecidoBm_(btn.dataset.deviceUserId || '');
        if (entrou) await loadInitialData();
      });
      authUseOtherBmBtn?.addEventListener('click', () => mostrarTelaLoginBm_('Informe seu Nº BM para adicionar ou trocar o usuário deste aparelho.'));
      userManagerCloseBtn?.addEventListener('click', fecharGerenciadorUsuarios_);
      userManagerModal?.addEventListener('click', event => { if (event.target === userManagerModal) fecharGerenciadorUsuarios_(); });
      userManagerBm?.addEventListener('input', () => { userManagerBm.value = normalizarBmCliente_(userManagerBm.value); });
      userManagerCancelBtn?.addEventListener('click', resetarFormularioUsuario_);
      userManagerForm?.addEventListener('submit', salvarUsuarioGerenciado_);
      userManagerList?.addEventListener('click', event => {
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
        if (event.key === 'Escape') { fecharMenuMais_(); fecharTutorial_(); fecharDetalheRegistro_(); fecharGerenciadorUsuarios_(); fecharSobreSistema_(); }
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
            const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
            await reg.update();
          } catch (e) {}
        });
      }

      atualizarStatusConexao();
      carregarSessaoLocalBm_();
      inicializarFilaOffline().then(inicializarAutenticacaoBm_).catch(inicializarAutenticacaoBm_);
    })();
