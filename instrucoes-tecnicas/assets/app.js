
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
    3: [65,89,90,91,92,93,94],
    10: [27,28],
    15: [26,27,28,29,30,31,32],
    33: [21,26,45,46,50,51,52,54,55,66,67,69],
    41: [69,70,71]
  };
  const visualPagesOpen = {
    3: [89,90,91,92,93,94],
    10: [27,28],
    15: [26,27,28,29,30,31,32]
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
    details.innerHTML = `<summary>${rotulo}</summary><div class="technical-page-visual-inner"><p>Reprodução visual incorporada ao acervo para preservar a estrutura técnica, sem anexar o PDF e sem alterar o texto normativo pesquisável.</p><img loading="lazy" decoding="async" src="../assets/visual/it-${String(it).padStart(2,'0')}-p${num}.webp" alt="Visual fiel da página ${page} da IT ${String(it).padStart(2,'0')}"></div>`;
    sec.appendChild(details);
  }
})();
