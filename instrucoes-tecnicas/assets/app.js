
(()=>{
 const root=document.documentElement;
 const saved=localStorage.getItem('it-theme'); if(saved) root.dataset.theme=saved;
 document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.onclick=()=>{const n=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=n;localStorage.setItem('it-theme',n)});
 const side=document.querySelector('.sidebar');
 const openSide=()=>side?.classList.add('open'), closeSide=()=>side?.classList.remove('open');
 document.querySelectorAll('[data-open-sidebar]').forEach(b=>b.addEventListener('click',openSide));
 document.querySelectorAll('[data-close-sidebar]').forEach(b=>b.addEventListener('click',closeSide));
 document.querySelectorAll('.toc-item').forEach(a=>a.addEventListener('click',closeSide));
 const tf=document.getElementById('tocFilter');
 function norm(s){return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
 if(tf) tf.addEventListener('input',()=>{const q=norm(tf.value);document.querySelectorAll('.toc-item').forEach(a=>a.classList.toggle('hidden',q&&!norm(a.dataset.tocText||'').includes(q)))});
 const top=document.querySelector('[data-back-top]');
 const progress=document.querySelector('.reading-progress>span');
 function onScroll(){
   if(top) top.classList.toggle('show',scrollY>650);
   if(progress){const d=document.documentElement;const max=d.scrollHeight-d.clientHeight;progress.style.width=(max?Math.min(100,scrollY/max*100):0)+'%'}
 }
 addEventListener('scroll',onScroll,{passive:true}); onScroll();
 document.querySelectorAll('[data-back-top],[data-mobile-top]').forEach(b=>b.addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'})));
 const input=document.getElementById('inDocSearch'),status=document.getElementById('searchStatus'),clear=document.getElementById('clearSearch'),content=document.querySelector('.it-content');let hits=[],cur=-1,timer;
 function unmark(){content?.querySelectorAll('mark.search-hit').forEach(m=>m.replaceWith(document.createTextNode(m.textContent)));content?.normalize();hits=[];cur=-1}
 function mark(){if(!content||!input)return;unmark();const q=input.value.trim();if(q.length<2){status.textContent='Digite pelo menos 2 caracteres para pesquisar.';return}const needle=q.toLocaleLowerCase('pt-BR');const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT,{acceptNode(n){if(!n.nodeValue.trim()||n.parentElement.closest('script,style,mark'))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(node=>{let txt=node.nodeValue,low=txt.toLocaleLowerCase('pt-BR'),start=0,idx,frag=document.createDocumentFragment(),found=false;while((idx=low.indexOf(needle,start))>=0){found=true;frag.append(txt.slice(start,idx));const m=document.createElement('mark');m.className='search-hit';m.textContent=txt.slice(idx,idx+q.length);frag.append(m);start=idx+q.length}if(found){frag.append(txt.slice(start));node.replaceWith(frag)}});hits=[...content.querySelectorAll('mark.search-hit')];status.textContent=hits.length?`${hits.length} ocorrência${hits.length===1?'':'s'} encontrada${hits.length===1?'':'s'}. Enter avança; Shift + Enter volta.`:'Nenhuma ocorrência encontrada.';if(hits.length){cur=0;focusHit()}}
 function focusHit(){hits.forEach(x=>x.classList.remove('current'));if(cur>=0&&hits[cur]){hits[cur].classList.add('current');hits[cur].scrollIntoView({behavior:'smooth',block:'center'});status.textContent=`Ocorrência ${cur+1} de ${hits.length}. Enter avança; Shift + Enter volta.`}}
 if(input){input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(mark,220)});input.addEventListener('keydown',e=>{if(e.key==='Enter'&&hits.length){e.preventDefault();cur=(cur+(e.shiftKey?-1:1)+hits.length)%hits.length;focusHit()}});clear?.addEventListener('click',()=>{input.value='';unmark();status.textContent='Digite um termo para localizar dentro desta IT.';input.focus()});document.querySelectorAll('[data-focus-search]').forEach(b=>b.addEventListener('click',()=>{input.focus();input.scrollIntoView({behavior:'smooth',block:'center'})}))}
 const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){const id=e.target.id;document.querySelectorAll('.toc-item').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+id))}})},{rootMargin:'-20% 0px -70% 0px'});document.querySelectorAll('.doc-heading[id]').forEach(h=>observer.observe(h));
})();


// Integração GPV V23.9.80 — somente apresentação/navegação.
// O texto normativo existente em .page-content não é reescrito por este código.
(()=>{
  const inIt = /\/its\//.test(location.pathname);
  const topActions = document.querySelector('.top-actions');
  if (topActions && !document.querySelector('[data-gpv-return]')) {
    const a = document.createElement('a');
    a.className = 'nav-btn gpv-return-btn';
    a.href = inIt ? '../../index.html' : '../index.html';
    a.setAttribute('data-gpv-return','');
    a.textContent = '← GPV';
    a.title = 'Voltar ao Controle Fiscalizatório GPV';
    topActions.insertBefore(a, topActions.firstChild);
  }

  const hero = document.querySelector('.portal-hero .hero-main');
  if (hero && !document.querySelector('.gpv-source-note')) {
    const note = document.createElement('div');
    note.className = 'gpv-source-note';
    note.innerHTML = '<strong>Texto normativo preservado.</strong> O acervo foi organizado para pesquisa e leitura no celular. A reconstrução visual de tabelas, figuras, esquemas e fórmulas é incorporada progressivamente sem anexar os PDFs.';
    hero.appendChild(note);
  }

  const m = document.title.match(/^IT\s+(\d+)/i);
  const it = m ? Number(m[1]) : 0;
  if (!it) return;

  // Marcador discreto de preservação textual (fora do conteúdo normativo).
  const compactHero = document.querySelector('.hero.compact');
  if (compactHero && !compactHero.querySelector('.gpv-source-note')) {
    const note = document.createElement('div');
    note.className = 'gpv-source-note';
    note.innerHTML = '<strong>Texto normativo preservado sem alterações.</strong> Recursos visuais são reconstruídos apenas na apresentação.';
    compactHero.appendChild(note);
  }

  function esconderFonteEntre(sec, inicio, fim) {
    const filhos = [...sec.querySelectorAll('.page-content > *')];
    let ativo = false;
    for (const el of filhos) {
      const t = (el.textContent || '').trim();
      if (!ativo && t === inicio) ativo = true;
      if (ativo) el.classList.add('visual-source-hidden');
      if (ativo && (t === fim || t.startsWith(fim))) break;
    }
  }

  function inserirReconstrucao(sec, html, beforeText) {
    const alvo = [...sec.querySelectorAll('.page-content > *')].find(el => (el.textContent || '').trim() === beforeText);
    const wrap = document.createElement('div');
    wrap.className = 'technical-reconstruction';
    wrap.setAttribute('data-visual-reconstruction','');
    wrap.innerHTML = html;
    if (alvo) alvo.parentNode.insertBefore(wrap, alvo);
    else sec.querySelector('.page-content')?.appendChild(wrap);
  }

  if (it === 33) {
    const p7 = document.querySelector('.pdf-page[data-page="7"]');
    if (p7) {
      esconderFonteEntre(p7, 'Quadro 01 – Classificação de risco em eventos', 'Acima de 10.000 RISCO MÉDIO RISCO ALTO RISCO ALTO');
      inserirReconstrucao(p7, `
        <div class="reconstruction-kicker">Quadro reconstruído para preservar a estrutura visual</div>
        <div class="technical-table-scroll">
          <table class="technical-table risk-table" aria-label="Quadro 01 – Classificação de risco em eventos">
            <caption>Quadro 01 – Classificação de risco em eventos</caption>
            <thead>
              <tr><th rowspan="3">Público total do evento <sup>(1)</sup></th><th colspan="3">Estrutura do evento <sup>(2) (5)</sup></th></tr>
              <tr><th colspan="2">Ao ar livre ou local descoberto <sup>(3)</sup></th><th rowspan="2">Estruturas provisórias com previsão de público <sup>(7) (8)</sup></th></tr>
              <tr><th>Sem delimitação por barreiras <sup>(4)</sup></th><th>Com delimitação por barreiras</th></tr>
            </thead>
            <tbody>
              <tr><th>De 251 a 1.000</th><td class="risk-min">RISCO MÍNIMO <sup>(6)</sup></td><td class="risk-low">RISCO BAIXO <sup>(6)</sup></td><td class="risk-high">RISCO ALTO</td></tr>
              <tr><th>1.001 a 3.000</th><td class="risk-low">RISCO BAIXO <sup>(6)</sup></td><td class="risk-low">RISCO BAIXO <sup>(6)</sup></td><td class="risk-high">RISCO ALTO</td></tr>
              <tr><th>3.001 a 10.000</th><td class="risk-med">RISCO MÉDIO</td><td class="risk-med">RISCO MÉDIO</td><td class="risk-high">RISCO ALTO</td></tr>
              <tr><th>Acima de 10.000</th><td class="risk-med">RISCO MÉDIO</td><td class="risk-high">RISCO ALTO</td><td class="risk-high">RISCO ALTO</td></tr>
            </tbody>
          </table>
        </div>`, 'Quadro 01 – Classificação de risco em eventos');
    }

    const p19 = document.querySelector('.pdf-page[data-page="19"]');
    if (p19) {
      esconderFonteEntre(p19, 'Quadro 02 – Exigências complementares para eventos temporários', 'Ambulância - - - X (1) X (1) Aviso de segurança');
      inserirReconstrucao(p19, `
        <div class="reconstruction-kicker">Quadro reconstruído para preservar linhas e colunas</div>
        <div class="technical-table-scroll">
          <table class="technical-table requirements-table" aria-label="Quadro 02 – Exigências complementares para eventos temporários">
            <caption>Quadro 02 – Exigências complementares para eventos temporários</caption>
            <thead>
              <tr><th rowspan="2">Exigências complementares</th><th colspan="5">Público previsto</th></tr>
              <tr><th>Até 1.000</th><th>1.001 a 1.500</th><th>1.501 a 3.000</th><th>3.001 a 10.000</th><th>Acima de 10.000</th></tr>
            </thead>
            <tbody>
              <tr><th>Ambulância</th><td>-</td><td>-</td><td>-</td><td>X<sup>(1)</sup></td><td>X<sup>(1)</sup></td></tr>
              <tr><th>Aviso de segurança <sup>(3)</sup></th><td>X<sup>(2)</sup></td><td>X<sup>(2)</sup></td><td>X<sup>(2)</sup></td><td>X<sup>(2)</sup></td><td>X</td></tr>
              <tr><th>Controle de entrada <sup>(2)</sup></th><td>X</td><td>X</td><td>X</td><td>X</td><td>X</td></tr>
              <tr><th>Corredor de segurança</th><td>-</td><td>-</td><td>-</td><td>-</td><td>X<sup>(2)</sup></td></tr>
              <tr><th>DEA</th><td>-</td><td>X<sup>(4)</sup></td><td>X</td><td>X</td><td>X</td></tr>
              <tr><th>Grupo gerador de energia</th><td>-</td><td>-</td><td>-</td><td>X</td><td>X</td></tr>
              <tr><th>Posto médico</th><td>-</td><td>-</td><td>-</td><td>X</td><td>X</td></tr>
              <tr><th>Setorização de público</th><td>-</td><td>-</td><td>-</td><td>-</td><td>X<sup>(2)</sup></td></tr>
              <tr><th>Barreira antiesmagamento</th><td>-</td><td>-</td><td>-</td><td>X<sup>(5)</sup></td><td>X<sup>(5)</sup></td></tr>
            </tbody>
          </table>
        </div>
        <div class="technical-notes"><strong>Notas específicas:</strong><br>1 – Observar item A.1.3.1.1.<br>2 – Exigido para locais delimitados por barreiras.<br>3 – O aviso de segurança será produzido e divulgado pelo organizador do evento.<br>4 – Concentração ou circulação diária igual ou superior a 1.500 pessoas.<br>5 – Quando houver previsão de público próximo ao palco.</div>`, 'Quadro 02 – Exigências complementares para eventos temporários');
    }
  }

  const visualPages = {
    1: [77,78,79],
    3: [65,89,90,91,92,93,94],
    10: [27,28],
    15: [17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32],
    17: [18,21,23,24,27,30],
    23: [47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67],
    28: [5],
    29: [5,6,7],
    33: [21,26,45,46,50,51,52,54,55,66,67,69],
    35: [23,27,28],
    38: [6,8],
    39: [14,15,16,17],
    41: [69,70,71]
  };
  const visualPagesOpen = {
    1: [77,78,79],
    3: [89,90,91,92,93,94],
    10: [27,28],
    15: [17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32],
    17: [18,21,23,24,27,30],
    23: [47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67],
    28: [5],
    29: [5,6,7],
    35: [27,28],
    38: [6,8],
    39: [14,15,16,17]
  };
  for (const page of (visualPages[it] || [])) {
    const sec = document.querySelector(`.pdf-page[data-page="${page}"]`);
    if (!sec || sec.querySelector('.technical-page-visual')) continue;
    const details = document.createElement('details');
    details.className = 'technical-page-visual';
    if ((visualPagesOpen[it] || []).includes(page)) details.open = true;
    const num = String(page).padStart(2,'0');
    let rotulo = `Ver visual fiel da página ${page}`;
    if (it === 41 && [69,70,71].includes(page)) rotulo = `Ver equações com formatação fiel — página ${page}`;
    if (it === 3 && page === 65) rotulo = 'Ver memorial de avaliação de risco com estrutura fiel';
    if (it === 17 && [18,21,23,24,27,30].includes(page)) rotulo = `Ver esquema/tabela de hidrantes — página ${page}`;
    if (it === 23 && page >= 47 && page <= 67) rotulo = `Ver figura técnica de GLP — página ${page}`;
    if (it === 38 && [6,8].includes(page)) rotulo = `Ver quadro/tabela de CMAR — página ${page}`;
    details.innerHTML = `<summary>${rotulo}</summary><div class="technical-page-visual-inner"><p>Reprodução visual incorporada ao acervo para preservar a estrutura técnica, sem anexar o PDF e sem alterar o texto normativo pesquisável.</p><img loading="lazy" decoding="async" src="../assets/visual/it-${String(it).padStart(2,'0')}-p${num}.webp" alt="Visual fiel da página ${page} da IT ${String(it).padStart(2,'0')}"></div>`;
    sec.appendChild(details);
  }
})();


// GPV V23.9.83 — índice e navegação rápida entre ITs.
// Este bloco atua somente na navegação do acervo; não altera .page-content nem o texto normativo.
(()=>{
  const FALLBACK_ITS = [{"it":1,"title":"PROCEDIMENTOS ADMINISTRATIVOS","revoked":false,"file":"its/it-01.html"},{"it":2,"title":"TERMINOLOGIA DE PROTEÇÃO CONTRA INCÊNDIO E PÂNICO","revoked":false,"file":"its/it-02.html"},{"it":3,"title":"COMPOSIÇÃO DO PROCESSO DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO (PSCIP)","revoked":false,"file":"its/it-03.html"},{"it":4,"title":"ACESSO DE VIATURAS NAS EDIFICAÇÕES E ÁREAS DE RISCO","revoked":false,"file":"its/it-04.html"},{"it":5,"title":"SEPARAÇÃO ENTRE EDIFICAÇÕES (ISOLAMENTO DE RISCO)","revoked":false,"file":"its/it-05.html"},{"it":6,"title":"SEGURANÇA ESTRUTURAL DAS EDIFICAÇÕES","revoked":false,"file":"its/it-06.html"},{"it":7,"title":"COMPARTIMENTAÇÃO HORIZONTAL E COMPARTIMENTAÇÃO VERTICAL","revoked":false,"file":"its/it-07.html"},{"it":8,"title":"SAÍDAS DE EMERGÊNCIA EM EDIFICAÇÕES","revoked":false,"file":"its/it-08.html"},{"it":9,"title":"CARGA DE INCÊNDIO NAS EDIFICAÇÕES E ESPAÇOS DESTINADOS AO USO COLETIVO","revoked":false,"file":"its/it-09.html"},{"it":10,"title":"PRESSURIZAÇÃO DE ESCADA DE SEGURANÇA","revoked":false,"file":"its/it-10.html"},{"it":11,"title":"PLANO DE INTERVENÇÃO DE INCÊNDIO","revoked":false,"file":"its/it-11.html"},{"it":12,"title":"BRIGADA DE INCÊNDIO","revoked":false,"file":"its/it-12.html"},{"it":13,"title":"ILUMINAÇÃO DE EMERGÊNCIA","revoked":false,"file":"its/it-13.html"},{"it":14,"title":"SISTEMAS DE DETECÇÃO E ALARME DE INCÊNDIO","revoked":false,"file":"its/it-14.html"},{"it":15,"title":"SINALIZAÇÃO DE EMERGÊNCIA","revoked":false,"file":"its/it-15.html"},{"it":16,"title":"SISTEMA DE PROTEÇÃO POR EXTINTORES DE INCÊNDIO","revoked":false,"file":"its/it-16.html"},{"it":17,"title":"SISTEMA DE HIDRANTES E MANGOTINHOS PARA COMBATE A INCÊNDIO","revoked":false,"file":"its/it-17.html"},{"it":18,"title":"SISTEMA DE CHUVEIROS AUTOMÁTICOS","revoked":false,"file":"its/it-18.html"},{"it":19,"title":"SISTEMA DE RESFRIAMENTO PARA LÍQUIDOS E GASES","revoked":true,"file":"its/it-19.html"},{"it":20,"title":"SISTEMA DE PROTEÇÃO POR ESPUMA","revoked":true,"file":"its/it-20.html"},{"it":21,"title":"SISTEMA FIXO DE GASES PARA COMBATE A INCÊNDIO","revoked":false,"file":"its/it-21.html"},{"it":22,"title":"ARMAZENAMENTO DE LÍQUIDOS INFLAMÁVEIS E COMBUSTÍVEIS","revoked":false,"file":"its/it-22.html"},{"it":23,"title":"MANIPULAÇÃO, ARMAZENAMENTO, COMERCIALIZAÇÃO E UTILIZAÇÃO DE GÁS LIQUEFEITO DE PETRÓLEO (GLP)","revoked":false,"file":"its/it-23.html"},{"it":24,"title":"COMERCIALIZAÇÃO, DISTRIBUIÇÃO E UTILIZAÇÃO DE GÁS NATURAL","revoked":false,"file":"its/it-24.html"},{"it":25,"title":"FOGOS DE ARTIFÍCIO E PIROTECNIA","revoked":false,"file":"its/it-25.html"},{"it":26,"title":"HELIPONTO E HELIPORTO","revoked":false,"file":"its/it-26.html"},{"it":27,"title":"MEDIDAS DE SEGURANÇA PARA PRODUTOS PERIGOSOS","revoked":false,"file":"its/it-27.html"},{"it":28,"title":"COBERTURA DE SAPÉ, PIAÇAVA E SIMILARES","revoked":false,"file":"its/it-28.html"},{"it":29,"title":"HIDRANTE PÚBLICO","revoked":false,"file":"its/it-29.html"},{"it":30,"title":"INSTALAÇÕES E EQUIPAMENTOS ELÉTRICOS","revoked":false,"file":"its/it-30.html"},{"it":31,"title":"PÁTIO DE CONTÊINERES","revoked":false,"file":"its/it-31.html"},{"it":32,"title":"PROTEÇÃO CONTRA INCÊNDIO EM COZINHAS PROFISSIONAIS","revoked":false,"file":"its/it-32.html"},{"it":33,"title":"EVENTOS TEMPORÁRIOS","revoked":false,"file":"its/it-33.html"},{"it":34,"title":"CADASTRAMENTO DE EMPRESAS RESPONSÁVEIS TÉCNICOS","revoked":false,"file":"its/it-34.html"},{"it":35,"title":"SEGURANÇA CONTRA INCÊNDIO EM EDIFICAÇÕES QUE COMPÕEM O PATRIMÔNIO CULTURAL","revoked":false,"file":"its/it-35.html"},{"it":36,"title":"SISTEMA DE PROTEÇÃO CONTRA DESCARGAS ATMOSFÉRICAS","revoked":true,"file":"its/it-36.html"},{"it":37,"title":"CENTROS ESPORTIVOS E DE EXIBIÇÃO: REQUISITOS DE SEGURANÇA CONTRA INCÊNDIO E PÂNICO","revoked":false,"file":"its/it-37.html"},{"it":38,"title":"CONTROLE DE MATERIAIS DE ACABAMENTO E DE REVESTIMENTO (CMAR)","revoked":false,"file":"its/it-38.html"},{"it":39,"title":"BLOCOS DE CARNAVAL E OUTRAS MANIFESTAÇÕES CULTURAIS EM VIAS PÚBLICAS","revoked":false,"file":"its/it-39.html"},{"it":40,"title":"ADEQUAÇÃO DE MEDIDAS DE SEGURANÇA PARA EDIFICAÇÕES","revoked":false,"file":"its/it-40.html"},{"it":41,"title":"CONTROLE DE FUMAÇA","revoked":false,"file":"its/it-41.html"},{"it":42,"title":"ESTABELECIMENTOS DESTINADOS À RESTRIÇÃO DE LIBERDADE","revoked":false,"file":"its/it-42.html"},{"it":43,"title":"ARMAZENAGEM EM SILOS","revoked":false,"file":"its/it-43.html"},{"it":44,"title":"EDIFICAÇÕES E INSTALAÇÕES DE AGRONEGÓCIO","revoked":false,"file":"its/it-44.html"},{"it":45,"title":"FISCALIZAÇÃO EM EDIFICAÇÕES, ESPAÇOS DESTINADOS AO USO COLETIVO E EVENTOS TEMPORÁRIOS","revoked":false,"file":"its/it-45.html"}];
  const its = Array.isArray(window.ITS) && window.ITS.length ? window.ITS : FALLBACK_ITS;
  if (!its.length || document.querySelector('[data-quick-its-overlay]')) return;

  const isReader = document.body.classList.contains('it-page') || !!document.querySelector('.it-content');
  const hrefFor = item => isReader ? `it-${String(item.it).padStart(2,'0')}.html` : item.file;
  const homeHref = isReader ? '../index.html' : 'index.html';
  const currentMatch = document.title.match(/^IT\s+(\d+)/i);
  const currentIt = currentMatch ? Number(currentMatch[1]) : 0;
  const favoriteNums = [45,33,12,15,16,17];

  const overlay = document.createElement('div');
  overlay.className = 'quick-its-overlay';
  overlay.hidden = true;
  overlay.setAttribute('data-quick-its-overlay','');
  overlay.innerHTML = `
    <div class="quick-its-backdrop" data-quick-its-close></div>
    <aside class="quick-its-panel" role="dialog" aria-modal="true" aria-labelledby="quickItsTitle">
      <header class="quick-its-head">
        <div><span class="quick-its-kicker">ACESSO RÁPIDO</span><h2 id="quickItsTitle">Consultar outras ITs</h2></div>
        <button type="button" class="quick-its-close" data-quick-its-close aria-label="Fechar índice rápido">×</button>
      </header>
      <div class="quick-its-home-row">
        <a class="quick-its-home" href="${homeHref}">🏠 Tela inicial do acervo</a>
      </div>
      <div class="quick-its-search-wrap">
        <label for="quickItsSearch">Buscar IT</label>
        <input id="quickItsSearch" type="search" inputmode="search" autocomplete="off" placeholder="Número ou assunto: 45, eventos, hidrantes...">
      </div>
      <section class="quick-its-favorites" aria-labelledby="quickItsFavTitle">
        <h3 id="quickItsFavTitle">Acessos frequentes</h3>
        <div class="quick-its-fav-grid"></div>
      </section>
      <section class="quick-its-all" aria-labelledby="quickItsAllTitle">
        <div class="quick-its-section-head"><h3 id="quickItsAllTitle">Todas as Instruções Técnicas</h3><span>${its.length} ITs</span></div>
        <div class="quick-its-list"></div>
        <p class="quick-its-empty" hidden>Nenhuma IT encontrada para esse termo.</p>
      </section>
    </aside>`;
  document.body.appendChild(overlay);

  const panel = overlay.querySelector('.quick-its-panel');
  const search = overlay.querySelector('#quickItsSearch');
  const list = overlay.querySelector('.quick-its-list');
  const fav = overlay.querySelector('.quick-its-fav-grid');
  const empty = overlay.querySelector('.quick-its-empty');
  let previousFocus = null;

  const normalize = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const itemHtml = item => {
    const current = currentIt === Number(item.it);
    const revoked = item.revoked ? '<span class="quick-it-revoked">REVOGADA</span>' : '';
    const currentBadge = current ? '<span class="quick-it-current">ABERTA</span>' : '';
    return `<a class="quick-it-item${current?' is-current':''}" href="${hrefFor(item)}" data-quick-search="${String(item.it).padStart(2,'0')} ${item.title}">
      <span class="quick-it-num">IT ${String(item.it).padStart(2,'0')}</span>
      <span class="quick-it-title">${item.title}</span>
      <span class="quick-it-badges">${currentBadge}${revoked}</span>
    </a>`;
  };

  fav.innerHTML = favoriteNums.map(num => its.find(x => Number(x.it) === num)).filter(Boolean).map(itemHtml).join('');
  list.innerHTML = its.map(itemHtml).join('');

  const filter = () => {
    const q = normalize(search.value);
    let visible = 0;
    list.querySelectorAll('.quick-it-item').forEach(a => {
      const show = !q || normalize(a.dataset.quickSearch).includes(q);
      a.hidden = !show;
      if (show) visible++;
    });
    empty.hidden = visible !== 0;
  };
  search.addEventListener('input', filter);

  const open = () => {
    previousFocus = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add('quick-its-open');
    requestAnimationFrame(()=>overlay.classList.add('is-open'));
    search.value = '';
    filter();
    setTimeout(()=>search.focus(), 80);
  };
  const close = () => {
    overlay.classList.remove('is-open');
    document.documentElement.classList.remove('quick-its-open');
    setTimeout(()=>{overlay.hidden = true; previousFocus?.focus?.();}, 180);
  };
  overlay.querySelectorAll('[data-quick-its-close]').forEach(el=>el.addEventListener('click', close));
  document.addEventListener('keydown', e=>{if(e.key==='Escape' && !overlay.hidden){e.preventDefault();close();}});
  panel.addEventListener('keydown', e=>{
    if(e.key!=='Tab') return;
    const focusable=[...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')].filter(el=>!el.hidden && el.offsetParent!==null);
    if(!focusable.length) return;
    const first=focusable[0], last=focusable[focusable.length-1];
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  });

  // Acesso rápido no cabeçalho, tanto na tela inicial quanto dentro de qualquer IT.
  const topActions = document.querySelector('.top-actions');
  if (topActions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-btn quick-its-trigger';
    btn.setAttribute('data-quick-its-trigger','');
    btn.innerHTML = isReader ? '<span aria-hidden="true">📚</span><span class="quick-trigger-label">Outras ITs</span>' : '<span aria-hidden="true">☰</span><span class="quick-trigger-label">Índice rápido</span>';
    btn.title = isReader ? 'Consultar outras Instruções Técnicas' : 'Abrir índice rápido das Instruções Técnicas';
    btn.addEventListener('click', open);
    const theme = topActions.querySelector('[data-theme-toggle]');
    topActions.insertBefore(btn, theme || null);
  }

  // Em uma IT individual, torna explícita a volta à tela inicial do acervo.
  if (isReader) {
    const home = document.querySelector('.top-actions .home-btn');
    if (home) {
      home.textContent = '🏠 Tela inicial';
      home.title = 'Voltar à tela inicial das Instruções Técnicas';
    }

    // Atalho persistente no rodapé móvel para trocar de IT sem sair da leitura.
    const mobileNav = document.querySelector('.mobile-nav');
    if (mobileNav && !mobileNav.querySelector('[data-mobile-other-its]')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-mobile-other-its','');
      btn.innerHTML = '<strong>▦</strong>ITs';
      btn.title = 'Consultar outras ITs';
      btn.addEventListener('click', open);
      const sectionIndex = mobileNav.querySelector('[data-open-sidebar]');
      mobileNav.insertBefore(btn, sectionIndex || mobileNav.children[1] || null);
    }
  }
})();
