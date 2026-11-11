/* GPV 23.9.99ln — Menu mobile de atalhos ja existentes na Ficha.
   Somente navegacao: nao chama endpoints nem altera registros. */
(() => {
  'use strict';
  const root = document.getElementById('recordDetailScreen');
  const menu = document.getElementById('recordDetailTopActions');
  const toggle = document.getElementById('gpvLnMoreButton');
  if (!root || !menu || !toggle) return;
  const closeMenu = () => {
    menu.classList.remove('gpv-ln-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    if (window.innerWidth > 680) return;
    const open = !menu.classList.contains('gpv-ln-menu-open');
    menu.classList.toggle('gpv-ln-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('.record-detail-top-actions a, .record-detail-top-actions .record-detail-summary-copy, .record-detail-section-nav, .record-detail-back')) closeMenu();
    else if (!event.target.closest('.record-detail-top-actions')) closeMenu();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 680) closeMenu(); }, {passive:true});
})();
