/* ============================================================
   language.js — Language toggle on viewer
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

window.applyLangFull = function(){
  const byLang = S.CURR.textsByLang || {};
  S.CURR.texts = byLang[S.CURR_LANG] || {};
  const v = $('viewerScreen');
  if(v && v.classList.contains('active')) window.renderCardFull();
};

document.addEventListener('DOMContentLoaded', () => {
  const lt = $('langToggle');
  if(!lt) return;

  lt.onclick = () => {
    const order = ['en', 'gu', 'hi'];
    const i = order.indexOf(S.CURR_LANG);
    S.CURR_LANG = order[(i + 1) % order.length];
    lt.textContent = S.CURR_LANG === 'en' ? 'EN' : (S.CURR_LANG === 'gu' ? 'ગુ' : 'हि');
    lt.dataset.state = S.CURR_LANG;
    applyLangFull();
  };
});

})();