(()=>{
 const IT_VISUALS={
  1:{icon:'📁',topic:'Procedimentos'},2:{icon:'📘',topic:'Terminologia'},3:{icon:'🗂️',topic:'PSCIP'},4:{icon:'🚒',topic:'Viaturas'},5:{icon:'🧱',topic:'Isolamento'},6:{icon:'🏗️',topic:'Estrutural'},7:{icon:'🧩',topic:'Compartimentação'},8:{icon:'🚪',topic:'Saídas'},9:{icon:'🔥',topic:'Carga de incêndio'},10:{icon:'🌀',topic:'Pressurização'},11:{icon:'📋',topic:'Plano'},12:{icon:'👨‍🚒',topic:'Brigada'},13:{icon:'💡',topic:'Iluminação'},14:{icon:'🚨',topic:'Detecção'},15:{icon:'🪧',topic:'Sinalização'},16:{icon:'🧯',topic:'Extintores'},17:{icon:'🚰',topic:'Hidrantes'},18:{icon:'🚿',topic:'Chuveiros'},19:{icon:'❄️',topic:'Resfriamento'},20:{icon:'🫧',topic:'Espuma'},21:{icon:'🧪',topic:'Gases'},22:{icon:'🛢️',topic:'Inflamáveis'},23:{icon:'🔥',topic:'GLP'},24:{icon:'⛽',topic:'Gás natural'},25:{icon:'🎆',topic:'Pirotecnia'},26:{icon:'🚁',topic:'Heliponto'},27:{icon:'☣️',topic:'Perigosos'},28:{icon:'🛖',topic:'Cobertura'},29:{icon:'💧',topic:'Hidrante público'},30:{icon:'⚡',topic:'Elétricas'},31:{icon:'📦',topic:'Contêineres'},32:{icon:'🍳',topic:'Cozinhas'},33:{icon:'🎪',topic:'Eventos'},34:{icon:'🪪',topic:'Cadastro'},35:{icon:'🏛️',topic:'Patrimônio'},36:{icon:'⚡',topic:'SPDA'},37:{icon:'🏟️',topic:'Centros esportivos'},38:{icon:'🧱',topic:'CMAR'},39:{icon:'🥁',topic:'Vias públicas'},40:{icon:'🛠️',topic:'Adequação'},41:{icon:'🌫️',topic:'Fumaça'},42:{icon:'🔒',topic:'Restrição'},43:{icon:'🌾',topic:'Silos'},44:{icon:'🚜',topic:'Agronegócio'},45:{icon:'📝',topic:'Fiscalização'}
 };
 window.IT_VISUALS=IT_VISUALS;
 const q=document.getElementById('globalSearch'),res=document.getElementById('searchResults'),status=document.getElementById('globalStatus'),cards=[...document.querySelectorAll('.it-card')],buttons=[...document.querySelectorAll('[data-filter]')];let filter='all',timer;
 const norm=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const esc=s=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML};
 const getItNumber=card=>{const m=(card.querySelector('.num')?.textContent||'').match(/(\d+)/);return m?Number(m[1]):0};
 function decorateCards(){
  cards.forEach(card=>{
   if(card.querySelector('.it-card-symbol')) return;
   const it=getItNumber(card),v=IT_VISUALS[it]||{icon:'📘',topic:'IT'};
   const badge=document.createElement('div');
   badge.className='it-card-visual';
   badge.innerHTML=`<span class="it-card-symbol" aria-hidden="true">${v.icon}</span><span class="it-card-topic">${v.topic}</span>`;
   card.insertBefore(badge, card.firstChild);
   card.dataset.quickTopic=v.topic;
   card.dataset.searchBlob=(card.dataset.title||'')+' '+v.topic;
  });
  document.querySelectorAll('.quick-chip').forEach(btn=>{
   if(btn.dataset.decorated) return;
   btn.dataset.decorated='1';
   const txt=norm(btn.textContent);
   const icon = txt.includes('pscip')?'🗂️':txt.includes('saida')?'🚪':txt.includes('extintor')?'🧯':txt.includes('hidrante')?'🚰':txt.includes('evento')?'🎪':txt.includes('fiscaliza')?'📝':'⌕';
   btn.innerHTML=`<span class="quick-chip-icon" aria-hidden="true">${icon}</span><span>${esc(btn.textContent)}</span>`;
  });
 }
 function cardFilter(){const s=norm(q.value);cards.forEach(c=>{let ok=!s||norm(c.dataset.searchBlob||c.dataset.title).includes(s);if(filter==='current')ok=ok&&c.dataset.revoked==='0';if(filter==='revoked')ok=ok&&c.dataset.revoked==='1';c.classList.toggle('hidden',!ok)})}
 function search(){const s=norm(q.value);cardFilter();if(s.length<2){res.classList.remove('visible');res.innerHTML='';status.textContent=cards.filter(c=>!c.classList.contains('hidden')).length+' ITs disponíveis';return}const terms=s.split(/\s+/).filter(Boolean),matches=[];for(const r of window.SEARCH_INDEX){const text=norm(r.text+' '+(r.section||''));if(terms.every(t=>text.includes(t))){let score=terms.reduce((a,t)=>a+(text.split(t).length-1),0);matches.push([score,r])}}matches.sort((a,b)=>b[0]-a[0]||a[1].it-b[1].it||a[1].page-b[1].page);const top=matches.slice(0,60);res.innerHTML=top.map(([,r])=>{const nt=norm(r.text),pos=Math.max(0,nt.indexOf(terms[0])),start=Math.max(0,pos-90),snippet=r.text.slice(start,start+300).replace(/\s+/g,' ');const v=IT_VISUALS[r.it]||{icon:'📘'};return `<a class="result-card" href="its/it-${String(r.it).padStart(2,'0')}.html#pagina-${r.page}"><div class="result-it"><span class="result-it-icon" aria-hidden="true">${v.icon}</span><span>IT ${String(r.it).padStart(2,'0')}</span></div><div><div class="result-top"><b>${esc(r.section||'Trecho localizado')}</b><span>• página ${r.page}</span></div><p>${esc(snippet)}</p></div><span class="result-arrow">→</span></a>`}).join('');res.classList.toggle('visible',top.length>0);status.textContent=matches.length?`${matches.length} página${matches.length===1?'':'s'} encontrada${matches.length===1?'':'s'} no conteúdo`:'Nenhuma página encontrada'}
 decorateCards();
 q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,160)});
 document.getElementById('globalClear').onclick=()=>{q.value='';search();q.focus()};
 buttons.forEach(b=>b.onclick=()=>{filter=b.dataset.filter;buttons.forEach(x=>x.classList.toggle('active',x===b));search()});
 document.querySelectorAll('[data-quick-query]').forEach(b=>b.onclick=()=>{q.value=b.dataset.quickQuery;search();q.focus();q.scrollIntoView({behavior:'smooth',block:'center'})});
})();
