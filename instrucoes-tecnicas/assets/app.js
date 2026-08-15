
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

  if (false && it === 33) {
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


// GPV V23.9.84 — reprodução visual fiel das tabelas e quadros das 45 ITs.
// Nenhum texto normativo HTML é reescrito. Os visuais são renderizados a partir dos documentos
// originais e armazenados como imagens WebP; o aplicativo não depende de PDFs para exibi-los.
(()=>{
  const TABLE_VISUALS = {"7":{"17":[{"src":"../assets/tabelas/tabela-it-07-p017-t01.webp","kind":"table","n":1}]},"5":{"6":[{"src":"../assets/tabelas/tabela-it-05-p006-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-05-p006-t02.webp","kind":"table","n":2}],"8":[{"src":"../assets/tabelas/tabela-it-05-p008-t01.webp","kind":"table","n":1}],"12":[{"src":"../assets/tabelas/tabela-it-05-p012-t01.webp","kind":"table","n":1}],"13":[{"src":"../assets/tabelas/tabela-it-05-p013-t01.webp","kind":"table","n":1}]},"8":{"34":[{"src":"../assets/tabelas/tabela-it-08-p034-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-08-p034-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-08-p034-t03.webp","kind":"table","n":3}],"35":[{"src":"../assets/tabelas/tabela-it-08-p035-t01.webp","kind":"table","n":1}],"37":[{"src":"../assets/tabelas/tabela-it-08-p037-t01.webp","kind":"table","n":1}],"38":[{"src":"../assets/tabelas/tabela-it-08-p038-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-08-p038-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-08-p038-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-08-p038-t04.webp","kind":"table","n":4},{"src":"../assets/tabelas/tabela-it-08-p038-t05.webp","kind":"table","n":5},{"src":"../assets/tabelas/tabela-it-08-p038-t06.webp","kind":"table","n":6}]},"10":{"23":[{"src":"../assets/tabelas/tabela-it-10-p023-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-10-p023-t02.webp","kind":"table","n":2}],"24":[{"src":"../assets/tabelas/tabela-it-10-p024-t01.webp","kind":"table","n":1}],"25":[{"src":"../assets/tabelas/tabela-it-10-p025-t01.webp","kind":"table","n":1}],"29":[{"src":"../assets/tabelas/tabela-it-10-p029-t01.webp","kind":"table","n":1}],"1":[{"src":"../assets/tabelas/tabela-it-10-p001-pagina.webp","kind":"page","n":1}]},"12":{"10":[{"src":"../assets/tabelas/tabela-it-12-p010-t01.webp","kind":"table","n":1}],"11":[{"src":"../assets/tabelas/tabela-it-12-p011-t01.webp","kind":"table","n":1}],"12":[{"src":"../assets/tabelas/tabela-it-12-p012-t01.webp","kind":"table","n":1}],"13":[{"src":"../assets/tabelas/tabela-it-12-p013-t01.webp","kind":"table","n":1}]},"19":{"8":[{"src":"../assets/tabelas/tabela-it-19-p008-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-19-p008-t02.webp","kind":"table","n":2}]},"16":{"6":[{"src":"../assets/tabelas/tabela-it-16-p006-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-16-p006-t02.webp","kind":"table","n":2}],"7":[{"src":"../assets/tabelas/tabela-it-16-p007-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-16-p007-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-16-p007-t03.webp","kind":"table","n":3}],"8":[{"src":"../assets/tabelas/tabela-it-16-p008-t01.webp","kind":"table","n":1}]},"17":{"11":[{"src":"../assets/tabelas/tabela-it-17-p011-t01.webp","kind":"table","n":1}],"16":[{"src":"../assets/tabelas/tabela-it-17-p016-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-17-p016-t02.webp","kind":"table","n":2}],"17":[{"src":"../assets/tabelas/tabela-it-17-p017-t01.webp","kind":"table","n":1}],"20":[{"src":"../assets/tabelas/tabela-it-17-p020-t01.webp","kind":"table","n":1}],"24":[{"src":"../assets/tabelas/tabela-it-17-p024-t01.webp","kind":"table","n":1}]},"20":{"5":[{"src":"../assets/tabelas/tabela-it-20-p005-t01.webp","kind":"table","n":1}],"16":[{"src":"../assets/tabelas/tabela-it-20-p016-t01.webp","kind":"table","n":1}],"17":[{"src":"../assets/tabelas/tabela-it-20-p017-t01.webp","kind":"table","n":1}],"18":[{"src":"../assets/tabelas/tabela-it-20-p018-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-20-p018-t02.webp","kind":"table","n":2}],"22":[{"src":"../assets/tabelas/tabela-it-20-p022-t01.webp","kind":"table","n":1}],"26":[{"src":"../assets/tabelas/tabela-it-20-p026-t01.webp","kind":"table","n":1}],"27":[{"src":"../assets/tabelas/tabela-it-20-p027-t01.webp","kind":"table","n":1}]},"22":{"12":[{"src":"../assets/tabelas/tabela-it-22-p012-t01.webp","kind":"table","n":1}],"14":[{"src":"../assets/tabelas/tabela-it-22-p014-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-22-p014-t02.webp","kind":"table","n":2}],"15":[{"src":"../assets/tabelas/tabela-it-22-p015-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-22-p015-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-22-p015-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-22-p015-t04.webp","kind":"table","n":4}],"16":[{"src":"../assets/tabelas/tabela-it-22-p016-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-22-p016-t02.webp","kind":"table","n":2}],"17":[{"src":"../assets/tabelas/tabela-it-22-p017-t01.webp","kind":"table","n":1}]},"6":{"11":[{"src":"../assets/tabelas/tabela-it-06-p011-t01.webp","kind":"table","n":1}],"14":[{"src":"../assets/tabelas/tabela-it-06-p014-t01.webp","kind":"table","n":1}],"15":[{"src":"../assets/tabelas/tabela-it-06-p015-t01.webp","kind":"table","n":1}],"16":[{"src":"../assets/tabelas/tabela-it-06-p016-t01.webp","kind":"table","n":1}],"17":[{"src":"../assets/tabelas/tabela-it-06-p017-t01.webp","kind":"table","n":1}],"18":[{"src":"../assets/tabelas/tabela-it-06-p018-t01.webp","kind":"table","n":1}],"19":[{"src":"../assets/tabelas/tabela-it-06-p019-t01.webp","kind":"table","n":1}],"20":[{"src":"../assets/tabelas/tabela-it-06-p020-t01.webp","kind":"table","n":1}],"21":[{"src":"../assets/tabelas/tabela-it-06-p021-t01.webp","kind":"table","n":1}],"22":[{"src":"../assets/tabelas/tabela-it-06-p022-t01.webp","kind":"table","n":1}],"23":[{"src":"../assets/tabelas/tabela-it-06-p023-t01.webp","kind":"table","n":1}],"8":[{"src":"../assets/tabelas/tabela-it-06-p008-pagina.webp","kind":"page","n":1}]},"25":{"8":[{"src":"../assets/tabelas/tabela-it-25-p008-t01.webp","kind":"table","n":1}],"9":[{"src":"../assets/tabelas/tabela-it-25-p009-t01.webp","kind":"table","n":1}],"11":[{"src":"../assets/tabelas/tabela-it-25-p011-t01.webp","kind":"table","n":1}],"12":[{"src":"../assets/tabelas/tabela-it-25-p012-t01.webp","kind":"table","n":1}],"13":[{"src":"../assets/tabelas/tabela-it-25-p013-t01.webp","kind":"table","n":1}]},"15":{"12":[{"src":"../assets/tabelas/tabela-it-15-p012-t01.webp","kind":"table","n":1}],"14":[{"src":"../assets/tabelas/tabela-it-15-p014-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-15-p014-t02.webp","kind":"table","n":2}],"15":[{"src":"../assets/tabelas/tabela-it-15-p015-t01.webp","kind":"table","n":1}],"16":[{"src":"../assets/tabelas/tabela-it-15-p016-t01.webp","kind":"table","n":1}],"17":[{"src":"../assets/tabelas/tabela-it-15-p017-t01.webp","kind":"table","n":1}],"18":[{"src":"../assets/tabelas/tabela-it-15-p018-t01.webp","kind":"table","n":1}],"19":[{"src":"../assets/tabelas/tabela-it-15-p019-t01.webp","kind":"table","n":1}],"20":[{"src":"../assets/tabelas/tabela-it-15-p020-t01.webp","kind":"table","n":1}],"21":[{"src":"../assets/tabelas/tabela-it-15-p021-t01.webp","kind":"table","n":1}],"23":[{"src":"../assets/tabelas/tabela-it-15-p023-t01.webp","kind":"table","n":1}],"24":[{"src":"../assets/tabelas/tabela-it-15-p024-t01.webp","kind":"table","n":1}],"25":[{"src":"../assets/tabelas/tabela-it-15-p025-t01.webp","kind":"table","n":1}]},"26":{"6":[{"src":"../assets/tabelas/tabela-it-26-p006-t01.webp","kind":"table","n":1}]},"29":{"6":[{"src":"../assets/tabelas/tabela-it-29-p006-t01.webp","kind":"table","n":1}]},"32":{"5":[{"src":"../assets/tabelas/tabela-it-32-p005-t01.webp","kind":"table","n":1}]},"31":{"2":[{"src":"../assets/tabelas/tabela-it-31-p002-pagina.webp","kind":"page","n":1}]},"1":{"28":[{"src":"../assets/tabelas/tabela-it-01-p028-t01.webp","kind":"table","n":1}],"29":[{"src":"../assets/tabelas/tabela-it-01-p029-t01.webp","kind":"table","n":1}],"30":[{"src":"../assets/tabelas/tabela-it-01-p030-t01.webp","kind":"table","n":1}],"31":[{"src":"../assets/tabelas/tabela-it-01-p031-t01.webp","kind":"table","n":1}],"32":[{"src":"../assets/tabelas/tabela-it-01-p032-t01.webp","kind":"table","n":1}],"33":[{"src":"../assets/tabelas/tabela-it-01-p033-t01.webp","kind":"table","n":1}],"34":[{"src":"../assets/tabelas/tabela-it-01-p034-t01.webp","kind":"table","n":1}],"35":[{"src":"../assets/tabelas/tabela-it-01-p035-t01.webp","kind":"table","n":1}],"36":[{"src":"../assets/tabelas/tabela-it-01-p036-t01.webp","kind":"table","n":1}],"37":[{"src":"../assets/tabelas/tabela-it-01-p037-t01.webp","kind":"table","n":1}],"38":[{"src":"../assets/tabelas/tabela-it-01-p038-t01.webp","kind":"table","n":1}],"39":[{"src":"../assets/tabelas/tabela-it-01-p039-t01.webp","kind":"table","n":1}],"40":[{"src":"../assets/tabelas/tabela-it-01-p040-t01.webp","kind":"table","n":1}],"41":[{"src":"../assets/tabelas/tabela-it-01-p041-t01.webp","kind":"table","n":1}],"42":[{"src":"../assets/tabelas/tabela-it-01-p042-t01.webp","kind":"table","n":1}],"43":[{"src":"../assets/tabelas/tabela-it-01-p043-t01.webp","kind":"table","n":1}],"44":[{"src":"../assets/tabelas/tabela-it-01-p044-t01.webp","kind":"table","n":1}],"45":[{"src":"../assets/tabelas/tabela-it-01-p045-t01.webp","kind":"table","n":1}],"50":[{"src":"../assets/tabelas/tabela-it-01-p050-t01.webp","kind":"table","n":1}],"51":[{"src":"../assets/tabelas/tabela-it-01-p051-t01.webp","kind":"table","n":1}],"64":[{"src":"../assets/tabelas/tabela-it-01-p064-t01.webp","kind":"table","n":1}],"80":[{"src":"../assets/tabelas/tabela-it-01-p080-t01.webp","kind":"table","n":1}],"81":[{"src":"../assets/tabelas/tabela-it-01-p081-t01.webp","kind":"table","n":1}],"82":[{"src":"../assets/tabelas/tabela-it-01-p082-t01.webp","kind":"table","n":1}],"83":[{"src":"../assets/tabelas/tabela-it-01-p083-t01.webp","kind":"table","n":1}],"84":[{"src":"../assets/tabelas/tabela-it-01-p084-t01.webp","kind":"table","n":1}],"85":[{"src":"../assets/tabelas/tabela-it-01-p085-t01.webp","kind":"table","n":1}],"86":[{"src":"../assets/tabelas/tabela-it-01-p086-t01.webp","kind":"table","n":1}]},"34":{"3":[{"src":"../assets/tabelas/tabela-it-34-p003-t01.webp","kind":"table","n":1}]},"9":{"5":[{"src":"../assets/tabelas/tabela-it-09-p005-t01.webp","kind":"table","n":1}],"6":[{"src":"../assets/tabelas/tabela-it-09-p006-t01.webp","kind":"table","n":1}],"7":[{"src":"../assets/tabelas/tabela-it-09-p007-t01.webp","kind":"table","n":1}],"8":[{"src":"../assets/tabelas/tabela-it-09-p008-t01.webp","kind":"table","n":1}],"9":[{"src":"../assets/tabelas/tabela-it-09-p009-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-09-p009-t02.webp","kind":"table","n":2}],"10":[{"src":"../assets/tabelas/tabela-it-09-p010-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-09-p010-t02.webp","kind":"table","n":2}],"11":[{"src":"../assets/tabelas/tabela-it-09-p011-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-09-p011-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-09-p011-t03.webp","kind":"table","n":3}],"12":[{"src":"../assets/tabelas/tabela-it-09-p012-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-09-p012-t02.webp","kind":"table","n":2}],"13":[{"src":"../assets/tabelas/tabela-it-09-p013-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-09-p013-t02.webp","kind":"table","n":2}],"14":[{"src":"../assets/tabelas/tabela-it-09-p014-t01.webp","kind":"table","n":1}],"15":[{"src":"../assets/tabelas/tabela-it-09-p015-t01.webp","kind":"table","n":1}],"16":[{"src":"../assets/tabelas/tabela-it-09-p016-t01.webp","kind":"table","n":1}],"17":[{"src":"../assets/tabelas/tabela-it-09-p017-t01.webp","kind":"table","n":1}],"18":[{"src":"../assets/tabelas/tabela-it-09-p018-t01.webp","kind":"table","n":1}],"19":[{"src":"../assets/tabelas/tabela-it-09-p019-t01.webp","kind":"table","n":1}],"20":[{"src":"../assets/tabelas/tabela-it-09-p020-t01.webp","kind":"table","n":1}],"21":[{"src":"../assets/tabelas/tabela-it-09-p021-t01.webp","kind":"table","n":1}],"22":[{"src":"../assets/tabelas/tabela-it-09-p022-t01.webp","kind":"table","n":1}],"23":[{"src":"../assets/tabelas/tabela-it-09-p023-t01.webp","kind":"table","n":1}],"24":[{"src":"../assets/tabelas/tabela-it-09-p024-t01.webp","kind":"table","n":1}],"25":[{"src":"../assets/tabelas/tabela-it-09-p025-t01.webp","kind":"table","n":1}],"27":[{"src":"../assets/tabelas/tabela-it-09-p027-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-09-p027-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-09-p027-t03.webp","kind":"table","n":3}],"28":[{"src":"../assets/tabelas/tabela-it-09-p028-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-09-p028-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-09-p028-t03.webp","kind":"table","n":3}]},"27":{"9":[{"src":"../assets/tabelas/tabela-it-27-p009-t01.webp","kind":"table","n":1}],"10":[{"src":"../assets/tabelas/tabela-it-27-p010-t01.webp","kind":"table","n":1}]},"36":{"1":[{"src":"../assets/tabelas/tabela-it-36-p001-t01.webp","kind":"table","n":1}],"2":[{"src":"../assets/tabelas/tabela-it-36-p002-t01.webp","kind":"table","n":1}]},"37":{"21":[{"src":"../assets/tabelas/tabela-it-37-p021-pagina.webp","kind":"page","n":1}]},"38":{"6":[{"src":"../assets/tabelas/tabela-it-38-p006-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-38-p006-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-38-p006-t03.webp","kind":"table","n":3}],"7":[{"src":"../assets/tabelas/tabela-it-38-p007-t01.webp","kind":"table","n":1}],"8":[{"src":"../assets/tabelas/tabela-it-38-p008-t01.webp","kind":"table","n":1}]},"40":{"10":[{"src":"../assets/tabelas/tabela-it-40-p010-t01.webp","kind":"table","n":1}],"21":[{"src":"../assets/tabelas/tabela-it-40-p021-t01.webp","kind":"table","n":1}],"22":[{"src":"../assets/tabelas/tabela-it-40-p022-t01.webp","kind":"table","n":1}],"23":[{"src":"../assets/tabelas/tabela-it-40-p023-t01.webp","kind":"table","n":1}]},"39":{"4":[{"src":"../assets/tabelas/tabela-it-39-p004-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-39-p004-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-39-p004-t03.webp","kind":"table","n":3}],"8":[{"src":"../assets/tabelas/tabela-it-39-p008-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-39-p008-t02.webp","kind":"table","n":2}],"9":[{"src":"../assets/tabelas/tabela-it-39-p009-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-39-p009-t02.webp","kind":"table","n":2}],"11":[{"src":"../assets/tabelas/tabela-it-39-p011-t01.webp","kind":"table","n":1}],"19":[{"src":"../assets/tabelas/tabela-it-39-p019-t01.webp","kind":"table","n":1}]},"35":{"15":[{"src":"../assets/tabelas/tabela-it-35-p015-t01.webp","kind":"table","n":1}],"21":[{"src":"../assets/tabelas/tabela-it-35-p021-t01.webp","kind":"table","n":1}],"23":[{"src":"../assets/tabelas/tabela-it-35-p023-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-35-p023-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-35-p023-t03.webp","kind":"table","n":3}],"24":[{"src":"../assets/tabelas/tabela-it-35-p024-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-35-p024-t02.webp","kind":"table","n":2}],"25":[{"src":"../assets/tabelas/tabela-it-35-p025-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-35-p025-t02.webp","kind":"table","n":2}],"26":[{"src":"../assets/tabelas/tabela-it-35-p026-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-35-p026-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-35-p026-t03.webp","kind":"table","n":3}],"27":[{"src":"../assets/tabelas/tabela-it-35-p027-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-35-p027-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-35-p027-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-35-p027-t04.webp","kind":"table","n":4},{"src":"../assets/tabelas/tabela-it-35-p027-t05.webp","kind":"table","n":5}],"28":[{"src":"../assets/tabelas/tabela-it-35-p028-t01.webp","kind":"table","n":1}],"29":[{"src":"../assets/tabelas/tabela-it-35-p029-t01.webp","kind":"table","n":1}]},"33":{"7":[{"src":"../assets/tabelas/tabela-it-33-p007-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-33-p007-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-33-p007-t03.webp","kind":"table","n":3}],"19":[{"src":"../assets/tabelas/tabela-it-33-p019-t01.webp","kind":"table","n":1}],"56":[{"src":"../assets/tabelas/tabela-it-33-p056-t01.webp","kind":"table","n":1}],"66":[{"src":"../assets/tabelas/tabela-it-33-p066-t01.webp","kind":"table","n":1}],"67":[{"src":"../assets/tabelas/tabela-it-33-p067-t01.webp","kind":"table","n":1}],"36":[{"src":"../assets/tabelas/tabela-it-33-p036-pagina.webp","kind":"page","n":1}]},"45":{"3":[{"src":"../assets/tabelas/tabela-it-45-p003-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-45-p003-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-45-p003-t03.webp","kind":"table","n":3}],"6":[{"src":"../assets/tabelas/tabela-it-45-p006-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-45-p006-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-45-p006-t03.webp","kind":"table","n":3}],"8":[{"src":"../assets/tabelas/tabela-it-45-p008-t01.webp","kind":"table","n":1}],"15":[{"src":"../assets/tabelas/tabela-it-45-p015-t01.webp","kind":"table","n":1}],"16":[{"src":"../assets/tabelas/tabela-it-45-p016-t01.webp","kind":"table","n":1}],"17":[{"src":"../assets/tabelas/tabela-it-45-p017-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-45-p017-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-45-p017-t03.webp","kind":"table","n":3}],"18":[{"src":"../assets/tabelas/tabela-it-45-p018-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-45-p018-t02.webp","kind":"table","n":2}],"19":[{"src":"../assets/tabelas/tabela-it-45-p019-t01.webp","kind":"table","n":1}]},"30":{"14":[{"src":"../assets/tabelas/tabela-it-30-p014-t01.webp","kind":"table","n":1}],"15":[{"src":"../assets/tabelas/tabela-it-30-p015-t01.webp","kind":"table","n":1}],"16":[{"src":"../assets/tabelas/tabela-it-30-p016-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-30-p016-t02.webp","kind":"table","n":2}],"21":[{"src":"../assets/tabelas/tabela-it-30-p021-t01.webp","kind":"table","n":1}],"22":[{"src":"../assets/tabelas/tabela-it-30-p022-t01.webp","kind":"table","n":1}],"25":[{"src":"../assets/tabelas/tabela-it-30-p025-t01.webp","kind":"table","n":1}],"26":[{"src":"../assets/tabelas/tabela-it-30-p026-t01.webp","kind":"table","n":1}],"31":[{"src":"../assets/tabelas/tabela-it-30-p031-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-30-p031-t02.webp","kind":"table","n":2}],"32":[{"src":"../assets/tabelas/tabela-it-30-p032-t01.webp","kind":"table","n":1}],"33":[{"src":"../assets/tabelas/tabela-it-30-p033-t01.webp","kind":"table","n":1}],"34":[{"src":"../assets/tabelas/tabela-it-30-p034-t01.webp","kind":"table","n":1}]},"23":{"8":[{"src":"../assets/tabelas/tabela-it-23-p008-t01.webp","kind":"table","n":1}],"9":[{"src":"../assets/tabelas/tabela-it-23-p009-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-23-p009-t02.webp","kind":"table","n":2}],"10":[{"src":"../assets/tabelas/tabela-it-23-p010-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-23-p010-t02.webp","kind":"table","n":2}],"11":[{"src":"../assets/tabelas/tabela-it-23-p011-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-23-p011-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-23-p011-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-23-p011-t04.webp","kind":"table","n":4},{"src":"../assets/tabelas/tabela-it-23-p011-t05.webp","kind":"table","n":5},{"src":"../assets/tabelas/tabela-it-23-p011-t06.webp","kind":"table","n":6},{"src":"../assets/tabelas/tabela-it-23-p011-t07.webp","kind":"table","n":7},{"src":"../assets/tabelas/tabela-it-23-p011-t08.webp","kind":"table","n":8}],"12":[{"src":"../assets/tabelas/tabela-it-23-p012-t01.webp","kind":"table","n":1}],"13":[{"src":"../assets/tabelas/tabela-it-23-p013-t01.webp","kind":"table","n":1}],"17":[{"src":"../assets/tabelas/tabela-it-23-p017-t01.webp","kind":"table","n":1}],"23":[{"src":"../assets/tabelas/tabela-it-23-p023-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-23-p023-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-23-p023-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-23-p023-t04.webp","kind":"table","n":4},{"src":"../assets/tabelas/tabela-it-23-p023-t05.webp","kind":"table","n":5},{"src":"../assets/tabelas/tabela-it-23-p023-t06.webp","kind":"table","n":6},{"src":"../assets/tabelas/tabela-it-23-p023-t07.webp","kind":"table","n":7},{"src":"../assets/tabelas/tabela-it-23-p023-t08.webp","kind":"table","n":8},{"src":"../assets/tabelas/tabela-it-23-p023-t09.webp","kind":"table","n":9},{"src":"../assets/tabelas/tabela-it-23-p023-t10.webp","kind":"table","n":10}],"24":[{"src":"../assets/tabelas/tabela-it-23-p024-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-23-p024-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-23-p024-t03.webp","kind":"table","n":3}],"25":[{"src":"../assets/tabelas/tabela-it-23-p025-t01.webp","kind":"table","n":1}],"26":[{"src":"../assets/tabelas/tabela-it-23-p026-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-23-p026-t02.webp","kind":"table","n":2}],"31":[{"src":"../assets/tabelas/tabela-it-23-p031-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-23-p031-t02.webp","kind":"table","n":2}],"32":[{"src":"../assets/tabelas/tabela-it-23-p032-t01.webp","kind":"table","n":1}],"38":[{"src":"../assets/tabelas/tabela-it-23-p038-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-23-p038-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-23-p038-t03.webp","kind":"table","n":3}],"56":[{"src":"../assets/tabelas/tabela-it-23-p056-t01.webp","kind":"table","n":1}],"20":[{"src":"../assets/tabelas/tabela-it-23-p020-pagina.webp","kind":"page","n":1}]},"41":{"6":[{"src":"../assets/tabelas/tabela-it-41-p006-t01.webp","kind":"table","n":1}],"8":[{"src":"../assets/tabelas/tabela-it-41-p008-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-41-p008-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-41-p008-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-41-p008-t04.webp","kind":"table","n":4}],"21":[{"src":"../assets/tabelas/tabela-it-41-p021-t01.webp","kind":"table","n":1}],"24":[{"src":"../assets/tabelas/tabela-it-41-p024-t01.webp","kind":"table","n":1}],"25":[{"src":"../assets/tabelas/tabela-it-41-p025-t01.webp","kind":"table","n":1}],"26":[{"src":"../assets/tabelas/tabela-it-41-p026-t01.webp","kind":"table","n":1}],"27":[{"src":"../assets/tabelas/tabela-it-41-p027-t01.webp","kind":"table","n":1}],"28":[{"src":"../assets/tabelas/tabela-it-41-p028-t01.webp","kind":"table","n":1}],"29":[{"src":"../assets/tabelas/tabela-it-41-p029-t01.webp","kind":"table","n":1}],"30":[{"src":"../assets/tabelas/tabela-it-41-p030-t01.webp","kind":"table","n":1}],"31":[{"src":"../assets/tabelas/tabela-it-41-p031-t01.webp","kind":"table","n":1}],"32":[{"src":"../assets/tabelas/tabela-it-41-p032-t01.webp","kind":"table","n":1}],"33":[{"src":"../assets/tabelas/tabela-it-41-p033-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-41-p033-t02.webp","kind":"table","n":2}],"34":[{"src":"../assets/tabelas/tabela-it-41-p034-t01.webp","kind":"table","n":1}],"35":[{"src":"../assets/tabelas/tabela-it-41-p035-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-41-p035-t02.webp","kind":"table","n":2}],"36":[{"src":"../assets/tabelas/tabela-it-41-p036-t01.webp","kind":"table","n":1}],"37":[{"src":"../assets/tabelas/tabela-it-41-p037-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-41-p037-t02.webp","kind":"table","n":2}],"38":[{"src":"../assets/tabelas/tabela-it-41-p038-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-41-p038-t02.webp","kind":"table","n":2}],"39":[{"src":"../assets/tabelas/tabela-it-41-p039-t01.webp","kind":"table","n":1}],"40":[{"src":"../assets/tabelas/tabela-it-41-p040-t01.webp","kind":"table","n":1}],"42":[{"src":"../assets/tabelas/tabela-it-41-p042-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-41-p042-t02.webp","kind":"table","n":2}],"43":[{"src":"../assets/tabelas/tabela-it-41-p043-t01.webp","kind":"table","n":1}],"44":[{"src":"../assets/tabelas/tabela-it-41-p044-t01.webp","kind":"table","n":1}],"45":[{"src":"../assets/tabelas/tabela-it-41-p045-t01.webp","kind":"table","n":1}],"48":[{"src":"../assets/tabelas/tabela-it-41-p048-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-41-p048-t02.webp","kind":"table","n":2}],"51":[{"src":"../assets/tabelas/tabela-it-41-p051-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-41-p051-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-41-p051-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-41-p051-t04.webp","kind":"table","n":4},{"src":"../assets/tabelas/tabela-it-41-p051-t05.webp","kind":"table","n":5}],"69":[{"src":"../assets/tabelas/tabela-it-41-p069-t01.webp","kind":"table","n":1}],"22":[{"src":"../assets/tabelas/tabela-it-41-p022-pagina.webp","kind":"page","n":1}]},"3":{"38":[{"src":"../assets/tabelas/tabela-it-03-p038-t01.webp","kind":"table","n":1}],"39":[{"src":"../assets/tabelas/tabela-it-03-p039-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p039-t02.webp","kind":"table","n":2}],"40":[{"src":"../assets/tabelas/tabela-it-03-p040-t01.webp","kind":"table","n":1}],"41":[{"src":"../assets/tabelas/tabela-it-03-p041-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p041-t02.webp","kind":"table","n":2}],"42":[{"src":"../assets/tabelas/tabela-it-03-p042-t01.webp","kind":"table","n":1}],"43":[{"src":"../assets/tabelas/tabela-it-03-p043-t01.webp","kind":"table","n":1}],"44":[{"src":"../assets/tabelas/tabela-it-03-p044-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p044-t02.webp","kind":"table","n":2}],"45":[{"src":"../assets/tabelas/tabela-it-03-p045-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p045-t02.webp","kind":"table","n":2}],"46":[{"src":"../assets/tabelas/tabela-it-03-p046-t01.webp","kind":"table","n":1}],"47":[{"src":"../assets/tabelas/tabela-it-03-p047-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p047-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-03-p047-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-03-p047-t04.webp","kind":"table","n":4}],"48":[{"src":"../assets/tabelas/tabela-it-03-p048-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p048-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-03-p048-t03.webp","kind":"table","n":3}],"49":[{"src":"../assets/tabelas/tabela-it-03-p049-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p049-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-03-p049-t03.webp","kind":"table","n":3}],"50":[{"src":"../assets/tabelas/tabela-it-03-p050-t01.webp","kind":"table","n":1}],"51":[{"src":"../assets/tabelas/tabela-it-03-p051-t01.webp","kind":"table","n":1}],"52":[{"src":"../assets/tabelas/tabela-it-03-p052-t01.webp","kind":"table","n":1}],"53":[{"src":"../assets/tabelas/tabela-it-03-p053-t01.webp","kind":"table","n":1}],"54":[{"src":"../assets/tabelas/tabela-it-03-p054-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p054-t02.webp","kind":"table","n":2}],"55":[{"src":"../assets/tabelas/tabela-it-03-p055-t01.webp","kind":"table","n":1}],"56":[{"src":"../assets/tabelas/tabela-it-03-p056-t01.webp","kind":"table","n":1}],"57":[{"src":"../assets/tabelas/tabela-it-03-p057-t01.webp","kind":"table","n":1}],"58":[{"src":"../assets/tabelas/tabela-it-03-p058-t01.webp","kind":"table","n":1}],"59":[{"src":"../assets/tabelas/tabela-it-03-p059-t01.webp","kind":"table","n":1}],"60":[{"src":"../assets/tabelas/tabela-it-03-p060-t01.webp","kind":"table","n":1}],"61":[{"src":"../assets/tabelas/tabela-it-03-p061-t01.webp","kind":"table","n":1}],"62":[{"src":"../assets/tabelas/tabela-it-03-p062-t01.webp","kind":"table","n":1}],"63":[{"src":"../assets/tabelas/tabela-it-03-p063-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p063-t02.webp","kind":"table","n":2}],"65":[{"src":"../assets/tabelas/tabela-it-03-p065-t01.webp","kind":"table","n":1}],"66":[{"src":"../assets/tabelas/tabela-it-03-p066-t01.webp","kind":"table","n":1}],"67":[{"src":"../assets/tabelas/tabela-it-03-p067-t01.webp","kind":"table","n":1}],"68":[{"src":"../assets/tabelas/tabela-it-03-p068-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p068-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-03-p068-t03.webp","kind":"table","n":3},{"src":"../assets/tabelas/tabela-it-03-p068-t04.webp","kind":"table","n":4},{"src":"../assets/tabelas/tabela-it-03-p068-t05.webp","kind":"table","n":5}],"69":[{"src":"../assets/tabelas/tabela-it-03-p069-t01.webp","kind":"table","n":1}],"70":[{"src":"../assets/tabelas/tabela-it-03-p070-t01.webp","kind":"table","n":1}],"71":[{"src":"../assets/tabelas/tabela-it-03-p071-t01.webp","kind":"table","n":1}],"72":[{"src":"../assets/tabelas/tabela-it-03-p072-t01.webp","kind":"table","n":1}],"73":[{"src":"../assets/tabelas/tabela-it-03-p073-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p073-t02.webp","kind":"table","n":2}],"74":[{"src":"../assets/tabelas/tabela-it-03-p074-t01.webp","kind":"table","n":1}],"75":[{"src":"../assets/tabelas/tabela-it-03-p075-t01.webp","kind":"table","n":1}],"76":[{"src":"../assets/tabelas/tabela-it-03-p076-t01.webp","kind":"table","n":1}],"77":[{"src":"../assets/tabelas/tabela-it-03-p077-t01.webp","kind":"table","n":1}],"78":[{"src":"../assets/tabelas/tabela-it-03-p078-t01.webp","kind":"table","n":1}],"79":[{"src":"../assets/tabelas/tabela-it-03-p079-t01.webp","kind":"table","n":1}],"80":[{"src":"../assets/tabelas/tabela-it-03-p080-t01.webp","kind":"table","n":1}],"81":[{"src":"../assets/tabelas/tabela-it-03-p081-t01.webp","kind":"table","n":1}],"82":[{"src":"../assets/tabelas/tabela-it-03-p082-t01.webp","kind":"table","n":1},{"src":"../assets/tabelas/tabela-it-03-p082-t02.webp","kind":"table","n":2},{"src":"../assets/tabelas/tabela-it-03-p082-t03.webp","kind":"table","n":3}],"83":[{"src":"../assets/tabelas/tabela-it-03-p083-t01.webp","kind":"table","n":1}],"87":[{"src":"../assets/tabelas/tabela-it-03-p087-t01.webp","kind":"table","n":1}],"95":[{"src":"../assets/tabelas/tabela-it-03-p095-t01.webp","kind":"table","n":1}],"96":[{"src":"../assets/tabelas/tabela-it-03-p096-t01.webp","kind":"table","n":1}],"97":[{"src":"../assets/tabelas/tabela-it-03-p097-t01.webp","kind":"table","n":1}],"98":[{"src":"../assets/tabelas/tabela-it-03-p098-t01.webp","kind":"table","n":1}],"99":[{"src":"../assets/tabelas/tabela-it-03-p099-t01.webp","kind":"table","n":1}],"100":[{"src":"../assets/tabelas/tabela-it-03-p100-t01.webp","kind":"table","n":1}],"101":[{"src":"../assets/tabelas/tabela-it-03-p101-t01.webp","kind":"table","n":1}],"102":[{"src":"../assets/tabelas/tabela-it-03-p102-t01.webp","kind":"table","n":1}],"103":[{"src":"../assets/tabelas/tabela-it-03-p103-t01.webp","kind":"table","n":1}],"34":[{"src":"../assets/tabelas/tabela-it-03-p034-pagina.webp","kind":"page","n":1}]}};
  const match = document.title.match(/^IT\s+(\d+)/i);
  const it = match ? String(Number(match[1])) : '';
  const pages = TABLE_VISUALS[it];
  if (!pages) return;
  Object.entries(pages).forEach(([pageNum,items])=>{
    const sec=document.querySelector(`.pdf-page[data-page="${pageNum}"]`);
    if(!sec||sec.querySelector('[data-faithful-table-visuals]')) return;
    const wrap=document.createElement('section');
    wrap.className='faithful-table-visuals';wrap.setAttribute('data-faithful-table-visuals','');
    wrap.setAttribute('aria-label',`Tabelas e quadros da página ${pageNum}`);
    const head=document.createElement('div');head.className='faithful-table-heading';
    head.innerHTML=`<span aria-hidden="true">▦</span><strong>Tabela/Quadro — reprodução fiel</strong><small>Página ${pageNum}</small>`;
    wrap.appendChild(head);
    items.forEach((item,idx)=>{
      const figure=document.createElement('figure');figure.className='faithful-table-figure';
      const label=item.kind==='page'
        ? `Visual integral da página ${pageNum}, preservado porque a tabela ou quadro não pôde ser isolado automaticamente.`
        : `Reprodução fiel ${items.length>1?`${idx+1} de ${items.length}`:''} da estrutura tabular da página ${pageNum}.`;
      figure.innerHTML=`<div class="faithful-table-scroll"><img loading="lazy" decoding="async" src="${item.src}" alt="${label}"></div><figcaption>${label}</figcaption>`;
      wrap.appendChild(figure);
    });
    const older=sec.querySelector('.technical-page-visual');
    if(older) sec.insertBefore(wrap,older); else sec.appendChild(wrap);
  });
})();


// GPV V23.9.85 — figuras, gráficos, esquemas, plantas e fórmulas preservados visualmente.
// Este bloco não altera o texto normativo de .page-content.
(()=>{
  const TECHNICAL_VISUALS = {"3":[{"page":40,"src":"../assets/visuais-tecnicos/it-03-p040.webp","kind":"visual"},{"page":46,"src":"../assets/visuais-tecnicos/it-03-p046.webp","kind":"visual"},{"page":55,"src":"../assets/visuais-tecnicos/it-03-p055.webp","kind":"visual"},{"page":58,"src":"../assets/visuais-tecnicos/it-03-p058.webp","kind":"visual"},{"page":60,"src":"../assets/visuais-tecnicos/it-03-p060.webp","kind":"visual"}],"4":[{"page":3,"src":"../assets/visuais-tecnicos/it-04-p003.webp","kind":"visual"}],"5":[{"page":2,"src":"../assets/visuais-tecnicos/it-05-p002.webp","kind":"visual"},{"page":3,"src":"../assets/visuais-tecnicos/it-05-p003.webp","kind":"visual"},{"page":4,"src":"../assets/visuais-tecnicos/it-05-p004.webp","kind":"visual"},{"page":5,"src":"../assets/visuais-tecnicos/it-05-p005.webp","kind":"visual"},{"page":7,"src":"../assets/visuais-tecnicos/it-05-p007.webp","kind":"formula"},{"page":8,"src":"../assets/visuais-tecnicos/it-05-p008.webp","kind":"visual"},{"page":11,"src":"../assets/visuais-tecnicos/it-05-p011.webp","kind":"visual"}],"6":[{"page":18,"src":"../assets/visuais-tecnicos/it-06-p018.webp","kind":"formula"}],"7":[{"page":14,"src":"../assets/visuais-tecnicos/it-07-p014.webp","kind":"visual"},{"page":15,"src":"../assets/visuais-tecnicos/it-07-p015.webp","kind":"visual"},{"page":16,"src":"../assets/visuais-tecnicos/it-07-p016.webp","kind":"visual"}],"8":[{"page":4,"src":"../assets/visuais-tecnicos/it-08-p004.webp","kind":"formula"},{"page":5,"src":"../assets/visuais-tecnicos/it-08-p005.webp","kind":"visual"},{"page":10,"src":"../assets/visuais-tecnicos/it-08-p010.webp","kind":"visual"},{"page":11,"src":"../assets/visuais-tecnicos/it-08-p011.webp","kind":"formula"},{"page":12,"src":"../assets/visuais-tecnicos/it-08-p012.webp","kind":"formula"},{"page":13,"src":"../assets/visuais-tecnicos/it-08-p013.webp","kind":"formula"},{"page":14,"src":"../assets/visuais-tecnicos/it-08-p014.webp","kind":"visual"},{"page":15,"src":"../assets/visuais-tecnicos/it-08-p015.webp","kind":"visual"},{"page":16,"src":"../assets/visuais-tecnicos/it-08-p016.webp","kind":"visual"},{"page":17,"src":"../assets/visuais-tecnicos/it-08-p017.webp","kind":"visual"},{"page":18,"src":"../assets/visuais-tecnicos/it-08-p018.webp","kind":"visual"},{"page":19,"src":"../assets/visuais-tecnicos/it-08-p019.webp","kind":"visual"},{"page":20,"src":"../assets/visuais-tecnicos/it-08-p020.webp","kind":"formula"},{"page":22,"src":"../assets/visuais-tecnicos/it-08-p022.webp","kind":"visual"},{"page":24,"src":"../assets/visuais-tecnicos/it-08-p024.webp","kind":"visual"},{"page":25,"src":"../assets/visuais-tecnicos/it-08-p025.webp","kind":"visual"},{"page":26,"src":"../assets/visuais-tecnicos/it-08-p026.webp","kind":"visual"},{"page":28,"src":"../assets/visuais-tecnicos/it-08-p028.webp","kind":"visual"},{"page":29,"src":"../assets/visuais-tecnicos/it-08-p029.webp","kind":"visual"},{"page":30,"src":"../assets/visuais-tecnicos/it-08-p030.webp","kind":"visual"},{"page":31,"src":"../assets/visuais-tecnicos/it-08-p031.webp","kind":"visual"}],"9":[{"page":32,"src":"../assets/visuais-tecnicos/it-09-p032.webp","kind":"formula"},{"page":33,"src":"../assets/visuais-tecnicos/it-09-p033.webp","kind":"formula"},{"page":34,"src":"../assets/visuais-tecnicos/it-09-p034.webp","kind":"formula"},{"page":35,"src":"../assets/visuais-tecnicos/it-09-p035.webp","kind":"formula"},{"page":37,"src":"../assets/visuais-tecnicos/it-09-p037.webp","kind":"formula"},{"page":38,"src":"../assets/visuais-tecnicos/it-09-p038.webp","kind":"formula"}],"10":[{"page":4,"src":"../assets/visuais-tecnicos/it-10-p004.webp","kind":"formula"},{"page":5,"src":"../assets/visuais-tecnicos/it-10-p005.webp","kind":"formula"},{"page":6,"src":"../assets/visuais-tecnicos/it-10-p006.webp","kind":"formula"},{"page":7,"src":"../assets/visuais-tecnicos/it-10-p007.webp","kind":"formula"},{"page":8,"src":"../assets/visuais-tecnicos/it-10-p008.webp","kind":"formula"},{"page":9,"src":"../assets/visuais-tecnicos/it-10-p009.webp","kind":"formula"},{"page":30,"src":"../assets/visuais-tecnicos/it-10-p030.webp","kind":"formula"}],"15":[{"page":11,"src":"../assets/visuais-tecnicos/it-15-p011.webp","kind":"visual"}],"17":[{"page":7,"src":"../assets/visuais-tecnicos/it-17-p007.webp","kind":"visual"},{"page":10,"src":"../assets/visuais-tecnicos/it-17-p010.webp","kind":"formula"},{"page":11,"src":"../assets/visuais-tecnicos/it-17-p011.webp","kind":"formula"},{"page":22,"src":"../assets/visuais-tecnicos/it-17-p022.webp","kind":"formula"},{"page":28,"src":"../assets/visuais-tecnicos/it-17-p028.webp","kind":"visual"},{"page":29,"src":"../assets/visuais-tecnicos/it-17-p029.webp","kind":"visual"},{"page":33,"src":"../assets/visuais-tecnicos/it-17-p033.webp","kind":"visual"}],"18":[{"page":6,"src":"../assets/visuais-tecnicos/it-18-p006.webp","kind":"visual"},{"page":7,"src":"../assets/visuais-tecnicos/it-18-p007.webp","kind":"visual"}],"20":[{"page":29,"src":"../assets/visuais-tecnicos/it-20-p029.webp","kind":"visual"}],"22":[{"page":18,"src":"../assets/visuais-tecnicos/it-22-p018.webp","kind":"visual"}],"23":[{"page":15,"src":"../assets/visuais-tecnicos/it-23-p015.webp","kind":"visual"},{"page":16,"src":"../assets/visuais-tecnicos/it-23-p016.webp","kind":"visual"},{"page":18,"src":"../assets/visuais-tecnicos/it-23-p018.webp","kind":"visual"},{"page":19,"src":"../assets/visuais-tecnicos/it-23-p019.webp","kind":"visual"},{"page":27,"src":"../assets/visuais-tecnicos/it-23-p027.webp","kind":"visual"},{"page":31,"src":"../assets/visuais-tecnicos/it-23-p031.webp","kind":"visual"},{"page":32,"src":"../assets/visuais-tecnicos/it-23-p032.webp","kind":"visual"},{"page":33,"src":"../assets/visuais-tecnicos/it-23-p033.webp","kind":"visual"},{"page":36,"src":"../assets/visuais-tecnicos/it-23-p036.webp","kind":"visual"},{"page":37,"src":"../assets/visuais-tecnicos/it-23-p037.webp","kind":"visual"}],"24":[{"page":6,"src":"../assets/visuais-tecnicos/it-24-p006.webp","kind":"visual"},{"page":8,"src":"../assets/visuais-tecnicos/it-24-p008.webp","kind":"visual"}],"25":[{"page":9,"src":"../assets/visuais-tecnicos/it-25-p009.webp","kind":"visual"},{"page":10,"src":"../assets/visuais-tecnicos/it-25-p010.webp","kind":"visual"}],"30":[{"page":3,"src":"../assets/visuais-tecnicos/it-30-p003.webp","kind":"visual"},{"page":12,"src":"../assets/visuais-tecnicos/it-30-p012.webp","kind":"visual"},{"page":13,"src":"../assets/visuais-tecnicos/it-30-p013.webp","kind":"visual"},{"page":17,"src":"../assets/visuais-tecnicos/it-30-p017.webp","kind":"visual"},{"page":19,"src":"../assets/visuais-tecnicos/it-30-p019.webp","kind":"visual"},{"page":20,"src":"../assets/visuais-tecnicos/it-30-p020.webp","kind":"visual"},{"page":24,"src":"../assets/visuais-tecnicos/it-30-p024.webp","kind":"visual"},{"page":27,"src":"../assets/visuais-tecnicos/it-30-p027.webp","kind":"visual"},{"page":28,"src":"../assets/visuais-tecnicos/it-30-p028.webp","kind":"visual"},{"page":29,"src":"../assets/visuais-tecnicos/it-30-p029.webp","kind":"visual"},{"page":35,"src":"../assets/visuais-tecnicos/it-30-p035.webp","kind":"visual"},{"page":37,"src":"../assets/visuais-tecnicos/it-30-p037.webp","kind":"visual"},{"page":38,"src":"../assets/visuais-tecnicos/it-30-p038.webp","kind":"visual"},{"page":39,"src":"../assets/visuais-tecnicos/it-30-p039.webp","kind":"visual"},{"page":40,"src":"../assets/visuais-tecnicos/it-30-p040.webp","kind":"visual"},{"page":41,"src":"../assets/visuais-tecnicos/it-30-p041.webp","kind":"visual"},{"page":42,"src":"../assets/visuais-tecnicos/it-30-p042.webp","kind":"visual"}],"33":[{"page":24,"src":"../assets/visuais-tecnicos/it-33-p024.webp","kind":"formula"},{"page":25,"src":"../assets/visuais-tecnicos/it-33-p025.webp","kind":"formula"},{"page":27,"src":"../assets/visuais-tecnicos/it-33-p027.webp","kind":"formula"},{"page":37,"src":"../assets/visuais-tecnicos/it-33-p037.webp","kind":"formula"},{"page":63,"src":"../assets/visuais-tecnicos/it-33-p063.webp","kind":"formula"},{"page":65,"src":"../assets/visuais-tecnicos/it-33-p065.webp","kind":"formula"}],"35":[{"page":22,"src":"../assets/visuais-tecnicos/it-35-p022.webp","kind":"formula"},{"page":25,"src":"../assets/visuais-tecnicos/it-35-p025.webp","kind":"formula"},{"page":26,"src":"../assets/visuais-tecnicos/it-35-p026.webp","kind":"formula"}],"37":[{"page":6,"src":"../assets/visuais-tecnicos/it-37-p006.webp","kind":"visual"},{"page":7,"src":"../assets/visuais-tecnicos/it-37-p007.webp","kind":"visual"},{"page":10,"src":"../assets/visuais-tecnicos/it-37-p010.webp","kind":"visual"},{"page":13,"src":"../assets/visuais-tecnicos/it-37-p013.webp","kind":"visual"},{"page":14,"src":"../assets/visuais-tecnicos/it-37-p014.webp","kind":"formula"},{"page":16,"src":"../assets/visuais-tecnicos/it-37-p016.webp","kind":"visual"},{"page":17,"src":"../assets/visuais-tecnicos/it-37-p017.webp","kind":"visual"}],"39":[{"page":9,"src":"../assets/visuais-tecnicos/it-39-p009.webp","kind":"formula"}],"40":[{"page":7,"src":"../assets/visuais-tecnicos/it-40-p007.webp","kind":"visual"},{"page":11,"src":"../assets/visuais-tecnicos/it-40-p011.webp","kind":"visual"},{"page":14,"src":"../assets/visuais-tecnicos/it-40-p014.webp","kind":"visual"},{"page":15,"src":"../assets/visuais-tecnicos/it-40-p015.webp","kind":"visual"},{"page":19,"src":"../assets/visuais-tecnicos/it-40-p019.webp","kind":"visual"}],"41":[{"page":10,"src":"../assets/visuais-tecnicos/it-41-p010.webp","kind":"visual"},{"page":11,"src":"../assets/visuais-tecnicos/it-41-p011.webp","kind":"visual"},{"page":12,"src":"../assets/visuais-tecnicos/it-41-p012.webp","kind":"visual"},{"page":13,"src":"../assets/visuais-tecnicos/it-41-p013.webp","kind":"visual"},{"page":14,"src":"../assets/visuais-tecnicos/it-41-p014.webp","kind":"visual"},{"page":15,"src":"../assets/visuais-tecnicos/it-41-p015.webp","kind":"visual"},{"page":16,"src":"../assets/visuais-tecnicos/it-41-p016.webp","kind":"visual"},{"page":17,"src":"../assets/visuais-tecnicos/it-41-p017.webp","kind":"visual"},{"page":22,"src":"../assets/visuais-tecnicos/it-41-p022.webp","kind":"visual"},{"page":23,"src":"../assets/visuais-tecnicos/it-41-p023.webp","kind":"formula"},{"page":40,"src":"../assets/visuais-tecnicos/it-41-p040.webp","kind":"visual"},{"page":42,"src":"../assets/visuais-tecnicos/it-41-p042.webp","kind":"formula"},{"page":43,"src":"../assets/visuais-tecnicos/it-41-p043.webp","kind":"formula"},{"page":44,"src":"../assets/visuais-tecnicos/it-41-p044.webp","kind":"formula"},{"page":45,"src":"../assets/visuais-tecnicos/it-41-p045.webp","kind":"formula"},{"page":46,"src":"../assets/visuais-tecnicos/it-41-p046.webp","kind":"formula"},{"page":47,"src":"../assets/visuais-tecnicos/it-41-p047.webp","kind":"formula"},{"page":48,"src":"../assets/visuais-tecnicos/it-41-p048.webp","kind":"formula"},{"page":49,"src":"../assets/visuais-tecnicos/it-41-p049.webp","kind":"formula"},{"page":51,"src":"../assets/visuais-tecnicos/it-41-p051.webp","kind":"formula"},{"page":55,"src":"../assets/visuais-tecnicos/it-41-p055.webp","kind":"visual"},{"page":56,"src":"../assets/visuais-tecnicos/it-41-p056.webp","kind":"visual"},{"page":57,"src":"../assets/visuais-tecnicos/it-41-p057.webp","kind":"visual"},{"page":58,"src":"../assets/visuais-tecnicos/it-41-p058.webp","kind":"visual"},{"page":59,"src":"../assets/visuais-tecnicos/it-41-p059.webp","kind":"visual"},{"page":60,"src":"../assets/visuais-tecnicos/it-41-p060.webp","kind":"visual"},{"page":61,"src":"../assets/visuais-tecnicos/it-41-p061.webp","kind":"visual"},{"page":62,"src":"../assets/visuais-tecnicos/it-41-p062.webp","kind":"visual"},{"page":63,"src":"../assets/visuais-tecnicos/it-41-p063.webp","kind":"visual"},{"page":65,"src":"../assets/visuais-tecnicos/it-41-p065.webp","kind":"visual"},{"page":66,"src":"../assets/visuais-tecnicos/it-41-p066.webp","kind":"visual"},{"page":68,"src":"../assets/visuais-tecnicos/it-41-p068.webp","kind":"formula"}],"43":[{"page":4,"src":"../assets/visuais-tecnicos/it-43-p004.webp","kind":"visual"},{"page":5,"src":"../assets/visuais-tecnicos/it-43-p005.webp","kind":"visual"},{"page":6,"src":"../assets/visuais-tecnicos/it-43-p006.webp","kind":"visual"},{"page":7,"src":"../assets/visuais-tecnicos/it-43-p007.webp","kind":"visual"},{"page":8,"src":"../assets/visuais-tecnicos/it-43-p008.webp","kind":"visual"},{"page":9,"src":"../assets/visuais-tecnicos/it-43-p009.webp","kind":"visual"}]};
  const match=document.title.match(/^IT\\s+(\\d+)/i);
  const it=match?String(Number(match[1])):'';
  const items=TECHNICAL_VISUALS[it];
  if(!items||!items.length) return;

  let overlay=document.querySelector('[data-technical-visual-overlay]');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.className='technical-visual-overlay';
    overlay.hidden=true;
    overlay.setAttribute('data-technical-visual-overlay','');
    overlay.innerHTML=`<button type="button" class="technical-visual-overlay-close" aria-label="Fechar visual">×</button><div class="technical-visual-overlay-stage"><img alt=""></div>`;
    document.body.appendChild(overlay);
    const close=()=>{overlay.hidden=true;document.documentElement.classList.remove('technical-visual-open');};
    overlay.querySelector('.technical-visual-overlay-close').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.classList.contains('technical-visual-overlay-stage')) close();});
    addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden) close();});
  }
  const showZoom=(img)=>{const target=overlay.querySelector('img');target.src=img.currentSrc||img.src;target.alt=img.alt||'Visual técnico ampliado';overlay.hidden=false;document.documentElement.classList.add('technical-visual-open');};

  items.forEach(item=>{
    const sec=document.querySelector(`.pdf-page[data-page="${item.page}"]`);
    if(!sec||sec.querySelector(`[data-technical-visual-v2385="${item.page}"]`)) return;
    const details=document.createElement('details');
    details.className='technical-page-visual technical-page-visual-v2385';
    details.setAttribute('data-technical-visual-v2385',String(item.page));
    const isFormula=item.kind==='formula';
    const title=isFormula?`Fórmulas/equações — reprodução fiel da página ${item.page}`:`Figura, gráfico ou esquema — reprodução fiel da página ${item.page}`;
    details.innerHTML=`<summary>${title}</summary><div class="technical-page-visual-inner"><p>Visual técnico preservado a partir do documento original, incorporado ao acervo sem anexar o PDF e sem alterar o texto normativo pesquisável. Toque na imagem para ampliar.</p><img loading="lazy" decoding="async" src="${item.src}" alt="${title}"></div>`;
    const img=details.querySelector('img');
    img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label',`${title}. Toque para ampliar.`);
    img.addEventListener('click',()=>showZoom(img));
    img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showZoom(img);}});
    sec.appendChild(details);
  });
})();
