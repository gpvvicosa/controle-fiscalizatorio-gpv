(() => {
      'use strict';

      const DRAFT_KEY = 'appVistoriaGpvUmaPaginaV2';
      const PENDING_KEY = 'appVistoriaGpvPendentesV1';
      const CONFIG_CACHE_KEY = 'appVistoriaGpvConfigPwaV1';
      const DB_NAME = 'ControleVistoriasGPV';
      const DB_VERSION = 1;
      const DB_STORE = 'pendentes';
      const API_URL = String(window.GPV_PUBLIC_CONFIG?.apiUrl || '').trim();
      const ACCESS_KEY_STORAGE = 'gpvVistoriasAccessKeyV1';
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

      function obterCodigoAcessoGpv() {
        let chave = '';
        try { chave = String(localStorage.getItem(ACCESS_KEY_STORAGE) || '').trim(); } catch (e) {}
        if (chave) return chave;
        const informado = window.prompt('Informe o código de acesso do GPV para conectar este aparelho ao sistema:');
        chave = String(informado || '').trim();
        if (!chave) throw new Error('Código de acesso do GPV não informado. O preenchimento offline continua disponível.');
        try { localStorage.setItem(ACCESS_KEY_STORAGE, chave); } catch (e) {}
        return chave;
      }

      function esquecerCodigoAcessoGpv() {
        try { localStorage.removeItem(ACCESS_KEY_STORAGE); } catch (e) {}
      }

      async function apiRequest(action, data = {}, timeoutMs = 30000) {
        if (!navigator.onLine) throw new Error('Sem conexão com a internet.');
        if (!API_URL || API_URL.includes('COLE_AQUI')) {
          throw new Error('A URL da API ainda não foi configurada em config.js.');
        }
        const codigoAcesso = obterCodigoAcessoGpv();
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
              'X-GPV-Access-Key': codigoAcesso,
              'X-GPV-App-Version': String(window.GPV_PUBLIC_CONFIG?.appVersion || 'pwa')
            },
            body: JSON.stringify({ action, ...data }),
            cache: 'no-store',
            signal: controller.signal
          });
          let result = null;
          try { result = await response.json(); } catch (e) {}
          if (response.status === 401) {
            esquecerCodigoAcessoGpv();
            throw new Error('Código de acesso do GPV inválido. Na próxima tentativa, informe o código correto.');
          }
          if (!response.ok || !result || result.ok === false) {
            const message = result?.error || result?.message || `Falha na comunicação (HTTP ${response.status}).`;
            throw new Error(message);
          }
          return result;
        } catch (error) {
          if (error?.name === 'AbortError') throw new Error('A comunicação demorou mais que o esperado. O registro continua seguro neste aparelho.');
          throw error;
        } finally {
          clearTimeout(timer);
        }
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
      const connectionBanner = document.getElementById('connectionBanner');
      const connectionStateText = document.getElementById('connectionStateText');
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
      const licenciamentoSelect = document.getElementById('licenciamento');
      const pscipLicenciamentoWrap = document.getElementById('pscipLicenciamentoWrap');
      const pscipInput = document.getElementById('pscip');
      const sancaoSelect = document.getElementById('sancao');
      const sancaoAutomaticaHint = document.getElementById('sancaoAutomaticaHint');
      const consultarCnpjBtn = document.getElementById('consultarCnpjBtn');
      const cnpjStatus = document.getElementById('cnpjStatus');
      const ocupacaoInput = document.getElementById('ocupacao');
      const ocupacaoResultados = document.getElementById('ocupacaoResultados');
      const ocupacaoMeta = document.getElementById('ocupacaoMeta');
      const ocupacoesSelecionadasBox = document.getElementById('ocupacoesSelecionadasBox');
      const ocupacoesSelecionadasLista = document.getElementById('ocupacoesSelecionadasLista');

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
        chaveSelecionada: ''
      };
      let saveTimer = null;
      let cnpjTimer = null;
      let ultimoCnpjConsultado = '';
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

      function value(id) {
        const el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
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
        linhas.push('');
        linhas.push(`Foi realizada uma vistoria pelo GPV Viçosa${estabelecimento ? ` no estabelecimento ${estabelecimento}` : ''}${data ? ` em ${data}` : ''}.`);

        const referencias = [];
        if (p?.pscip) referencias.push(`Nº do PSCIP: ${p.pscip}`);
        if (p?.pf) referencias.push(`Nº do PF: ${p.pf}`);
        if (p?.sancao) referencias.push(`Situação registrada: ${p.sancao}`);
        if (referencias.length) {
          linhas.push('');
          linhas.push(referencias.join(' | '));
        }

        linhas.push('');
        linhas.push('Orientamos que acompanhe as providências e eventuais exigências referentes ao processo de segurança contra incêndio e pânico, observando os prazos e documentos informados durante a vistoria.');
        linhas.push('');
        linhas.push('Em caso de dúvidas, utilize os canais oficiais do Corpo de Bombeiros Militar de Minas Gerais.');
        linhas.push('');
        linhas.push('Esta mensagem tem caráter orientativo e não substitui notificações, autos ou demais documentos oficiais do processo.');
        return linhas.join('\n');
      }

      function atualizarBotaoOrientacoes_() {
        if (!whatsappOrientacoesBtn) return;
        const numero = telefoneWhatsApp_(ultimoRegistroParaOrientacoes?.telefone);
        const label = whatsappOrientacoesBtn.querySelector('.whatsapp-btn-label');
        whatsappOrientacoesBtn.disabled = !numero;
        if (numero) {
          if (label) label.textContent = 'Enviar orientações pelo WhatsApp';
          if (whatsappOrientacoesNote) whatsappOrientacoesNote.textContent = 'O WhatsApp será aberto com a mensagem pronta para conferência e envio.';
        } else {
          if (label) label.textContent = 'WhatsApp — telefone não informado';
          if (whatsappOrientacoesNote) whatsappOrientacoesNote.textContent = 'Informe um telefone válido do responsável para usar o envio de orientações pelo WhatsApp.';
        }
      }

      function abrirOrientacoesWhatsApp_() {
        if (!navigator.onLine) {
          alert('Sem internet no momento. As orientações poderão ser abertas no WhatsApp quando a conexão voltar.');
          return;
        }
        const payload = ultimoRegistroParaOrientacoes || {};
        const numero = telefoneWhatsApp_(payload.telefone);
        if (!numero) {
          alert('Telefone do responsável não informado ou inválido.');
          return;
        }
        const mensagem = montarMensagemOrientacoes_(payload);
        const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

        // Navegação direta, disparada pelo toque do vistoriador. Em PWA instalado no
        // Android isso é mais confiável que window.open(), que pode ser bloqueado
        // como pop-up. O sistema operacional encaminha o link para o WhatsApp quando
        // o aplicativo está disponível.
        try {
          window.location.assign(url);
        } catch (erro) {
          window.location.href = url;
        }
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
          periodo: String(recordsPeriodFilter?.value || '').trim()
        };
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
            <td class="records-mono">${escapeHtml(item.cnpj || '—')}</td>
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
              <div class="records-meta-item"><span>CNPJ</span><strong>${escapeHtml(item.cnpj || '—')}</strong></div>
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
          recordsStatus.innerHTML = filtrosAtivos
            ? `<strong>${recordsState.total}</strong> resultado${recordsState.total === 1 ? '' : 's'} com os filtros atuais. Os indicadores acima representam o total da base.`
            : `<strong>${recordsState.total}</strong> registro${recordsState.total === 1 ? '' : 's'} na consulta. Mais recentes primeiro.`;
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

      function renderizarFichaRegistro_(registro) {
        const situacao = registro?.situacaoAtual || 'Sem situação';
        const estabelecimento = registro?.titulo || valorCampoFicha_(registro, 'Nome Fantasia', 'Razão Social') || '—';
        const cnpj = valorCampoFicha_(registro, 'CNPJ');
        const razaoSocial = valorCampoFicha_(registro, 'Razão Social');
        const processo = [
          ['Nº PSCIP', valorCampoFicha_(registro, 'Nº do PSCIP / Projeto')],
          ['Nº do PF', valorCampoFicha_(registro, 'Nº do PF')],
          ['Demanda', valorCampoFicha_(registro, 'Demanda')],
          ['Tipo de vistoria', valorCampoFicha_(registro, 'Tipo de vistoria')],
          ['Data da vistoria', valorCampoFicha_(registro, 'Data e hora')],
          ['REDS', valorCampoFicha_(registro, 'REDS')]
        ];
        const local = [
          ['Estabelecimento', estabelecimento],
          ['Razão Social', razaoSocial && normalize(razaoSocial) !== normalize(estabelecimento) ? razaoSocial : ''],
          ['Endereço', enderecoFicha_(registro)],
          ['CNPJ', cnpj]
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
        recordDetailLine.textContent = [estabelecimento, cnpj].filter(Boolean).join(' • ');
        recordDetailStatusBadge.textContent = situacao;
        recordDetailStatusBadge.className = `status-badge ${classeStatus_(situacao)}`;
        if (recordCurrentStatus) recordCurrentStatus.className = `record-current-status ${classeStatus_(situacao)}`;
        renderizarHistorico_(registro?.historico || []);
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
        localStorage.removeItem(DRAFT_KEY);
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
          cidade: cityValue() || 'Viçosa',
          nomeFantasia: value('nomeFantasia'),
          razaoSocial: value('razaoSocial'),
          cnpj: value('cnpj'),
          _appLicenciamento: value('licenciamento'),
          _appSancaoAntesAuto: sancaoAntesDoAutomatico,
          sancao: value('sancao'),
          pscip: value('pscip'),
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
          cpf: value('cpf'),
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
          ['endereco', 'Endereço'],
          ['nomeResponsavel', 'Nome do responsável'],
          ['mae', 'Mãe']
        ];
        const missing = [];
        let first = null;
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
        const possui = situacao === 'possui';
        const naoPossui = situacao === 'nao_possui';

        if (pscipLicenciamentoWrap) {
          pscipLicenciamentoWrap.hidden = !possui;
          pscipLicenciamentoWrap.classList.toggle('is-visible', possui);
          pscipLicenciamentoWrap.setAttribute('aria-hidden', possui ? 'false' : 'true');
          // Redundância proposital: garante a exibição mesmo se uma versão antiga
          // do CSS/HTML ainda estiver temporariamente em cache no PWA.
          pscipLicenciamentoWrap.style.display = possui ? 'block' : 'none';
        }
        if (pscipInput) {
          pscipInput.disabled = !possui;
          if (!possui) pscipInput.value = '';
        }

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

      function setFieldIfBlank(id, newValue) {
        const el = document.getElementById(id);
        const text = String(newValue == null ? '' : newValue).trim();
        if (!el || !text || String(el.value || '').trim()) return false;
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      function fillFromCnpj(result) {
        let count = 0;

        if (setFieldIfBlank('nomeFantasia', result.nomeFantasia)) count += 1;
        if (setFieldIfBlank('razaoSocial', result.razaoSocial)) count += 1;
        if (setFieldIfBlank('endereco', result.endereco)) count += 1;
        if (setFieldIfBlank('numero', result.numero)) count += 1;
        if (setFieldIfBlank('complemento', result.complemento)) count += 1;
        if (setFieldIfBlank('bairro', result.bairro)) count += 1;
        // Telefone e e-mail pertencem ao responsável e não são preenchidos pela consulta do CNPJ.

        if (document.getElementById('mesmoEnderecoResponsavel').checked) {
          syncResponsibleAddress();
        }

        scheduleDraftSave();
        return count;
      }

      async function consultarCnpj(automatico = false) {
        if (!navigator.onLine) {
          if (!automatico) showCnpjStatus('Sem internet. Preencha os dados manualmente; a consulta automática ficará disponível quando a conexão voltar.', 'info');
          return;
        }
        const cnpj = digits(value('cnpj'));
        if (cnpj.length !== 14) {
          if (!automatico) showCnpjStatus('Informe os 14 dígitos do CNPJ.', 'error');
          return;
        }
        if (automatico && cnpj === ultimoCnpjConsultado) return;
        consultarCnpjBtn.disabled = true;
        showCnpjStatus('Consultando dados cadastrais...', 'info');
        try {
          const result = await apiRequest('cnpj', { cnpj }, 30000);
          consultarCnpjBtn.disabled = false;
          ultimoCnpjConsultado = cnpj;
          const preenchidos = fillFromCnpj(result || {});
          showCnpjStatus(
            preenchidos
              ? `Consulta concluída. ${preenchidos} campo(s) vazio(s) foram preenchidos automaticamente. Confira os dados antes de registrar.`
              : 'Consulta concluída. Os campos retornados já estavam preenchidos; nenhum valor foi sobrescrito.',
            'success'
          );
          setTimeout(() => document.getElementById('responsavelSecao')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 900);
        } catch (error) {
          consultarCnpjBtn.disabled = false;
          showCnpjStatus(error?.message || 'Não foi possível consultar o CNPJ. Continue o preenchimento manualmente.', 'error');
        }
      }

      function applyCnpjMask(event) {
        let v = digits(event.target.value).slice(0, 14);
        v = v.replace(/^(\d{2})(\d)/, '$1.$2')
             .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
             .replace(/\.(\d{3})(\d)/, '.$1/$2')
             .replace(/(\d{4})(\d)/, '$1-$2');
        event.target.value = v;

        clearTimeout(cnpjTimer);
        if (digits(v).length === 14) {
          cnpjTimer = setTimeout(() => consultarCnpj(true), 700);
        } else {
          ultimoCnpjConsultado = '';
          clearCnpjStatus();
        }
      }

      function applyCpfMask(event) {
        let v = digits(event.target.value).slice(0, 11);
        v = v.replace(/^(\d{3})(\d)/, '$1.$2')
             .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
             .replace(/\.(\d{3})(\d)/, '.$1-$2');
        event.target.value = v;
      }

      function applyPhoneMask(event) {
        let v = digits(event.target.value).slice(0, 11);
        if (v.length <= 10) {
          v = v.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
        } else {
          v = v.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
        }
        event.target.value = v;
      }

      function scheduleDraftSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 350);
      }

      function saveDraft() {
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), recordId: currentRecordId, payload: buildPayload() }));
          draftStatus.textContent = '✓ Rascunho salvo';
          setTimeout(() => { draftStatus.textContent = 'Rascunho automático'; }, 1600);
        } catch (e) {}
      }

      function restoreDraft() {
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (!raw) return;
          const draft = JSON.parse(raw);
          if (!draft?.payload) return;
          if (Date.now() - Number(draft.savedAt || 0) > 1000 * 60 * 60 * 24 * 3) {
            localStorage.removeItem(DRAFT_KEY);
            return;
          }
          const p = draft.payload;
          currentRecordId = String(draft.recordId || p._appRegistroId || currentRecordId || criarIdRegistro());
          sancaoAntesDoAutomatico = String(p._appSancaoAntesAuto || '');
          if (licenciamentoSelect) licenciamentoSelect.value = String(p._appLicenciamento || '');
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
          syncNotificado();
          appStatus.textContent = 'Rascunho anterior recuperado.';
        } catch (e) {}
      }

      function resetForm() {
        form.reset();
        localStorage.removeItem(DRAFT_KEY);
        currentRecordId = criarIdRegistro();
        citySelect.value = appConfig?.padroes?.cidade || 'Viçosa';
        otherCity.value = '';
        sancaoDefinidaAutomaticamente = false;
        sancaoAntesDoAutomatico = '';
        if (licenciamentoSelect) licenciamentoSelect.value = '';
        syncOtherCity();
        syncLicenciamento();
        document.getElementById('enderecoCorrespondencia').value = appConfig?.padroes?.enderecoCorrespondencia || 'O Mesmo';
        document.getElementById('enderecoResponsavel').readOnly = false;
        document.getElementById('enderecoResponsavel').style.background = '';
        document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        hideError();
        clearCnpjStatus();
        ultimoCnpjConsultado = '';
        ocupacaoSelecionada = null;
        ocupacoesSelecionadas = [];
        ocupacaoInput.value = '';
        renderizarOcupacoesSelecionadas();
        mostrarMetaOcupacao(null);
        esconderResultadosOcupacao();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      async function submit() {
        if (submitting || !validateRequired(true)) return;
        const payload = buildPayload();
        payload._appRegistroId = currentRecordId;
        payload._appCriadoEm = payload._appCriadoEm || new Date().toISOString();
        ultimoRegistroConsultaChave = '';
        ultimoRegistroParaOrientacoes = { ...payload };
        saveDraft();

        // Estratégia local-first: antes de qualquer tentativa de internet, a vistoria
        // entra na fila do aparelho. Isso torna o botão praticamente imediato e
        // evita perda de dados caso a conexão oscile durante o envio.
        enfileirarRegistro(payload);
        localStorage.removeItem(DRAFT_KEY);
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

      function aplicarConfig(data) {
        appConfig = data || DEFAULT_CONFIG;
        populateOptions(appConfig.opcoes || {});
        document.getElementById('receitaCnpjLink').href = appConfig.receitaCnpjUrl || DEFAULT_CONFIG.receitaCnpjUrl;
        atualizarLinkPlanilha_(appConfig?.planilhaUrl || '');
        if (!value('enderecoCorrespondencia')) document.getElementById('enderecoCorrespondencia').value = appConfig?.padroes?.enderecoCorrespondencia || 'O Mesmo';
      }

      async function loadInitialData() {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null'); } catch (e) {}
        aplicarConfig(cached || DEFAULT_CONFIG);
        restoreDraft();
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
      sancaoSelect?.addEventListener('change', () => { syncNotificado(); scheduleDraftSave(); });
      document.getElementById('mesmoEnderecoResponsavel').addEventListener('change', () => { syncResponsibleAddress(); scheduleDraftSave(); });
      document.getElementById('cnpj').addEventListener('input', applyCnpjMask);
      consultarCnpjBtn.addEventListener('click', () => consultarCnpj(false));
      document.getElementById('cpf').addEventListener('input', applyCpfMask);
      document.getElementById('telefone').addEventListener('input', applyPhoneMask);
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
        recordsSearch.value = '';
        recordsCityFilter.value = '';
        recordsDemandFilter.value = '';
        recordsSanctionFilter.value = '';
        recordsTypeFilter.value = '';
        recordsPeriodFilter.value = '';
        carregarRegistros_(true);
      });
      recordsSearch?.addEventListener('input', () => {
        clearTimeout(recordsSearchTimer);
        recordsSearchTimer = setTimeout(() => carregarRegistros_(true), 420);
      });
      [recordsCityFilter, recordsDemandFilter, recordsSanctionFilter, recordsTypeFilter, recordsPeriodFilter].forEach(select => {
        select?.addEventListener('change', () => carregarRegistros_(true));
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
      document.addEventListener('click', fecharMenuMais_);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { fecharMenuMais_(); fecharTutorial_(); fecharDetalheRegistro_(); }
      });
      window.addEventListener('resize', fecharMenuMais_);
      sendPendingBtn.addEventListener('click', () => enviarPendentes(false));
      window.addEventListener('offline', atualizarStatusConexao);
      window.addEventListener('online', () => {
        atualizarStatusConexao();
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
        window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
      }

      atualizarStatusConexao();
      inicializarFilaOffline().then(loadInitialData).catch(loadInitialData);
    })();
