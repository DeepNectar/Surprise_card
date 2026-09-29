/* ============================================================
   counters.js — Live counters for the card
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

window.updateCounters = function(){
  const s = S.CURR.shared || {};

  const fmt = iso => {
    if(!iso) return '—';
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    if(diff < 0) return 'Just started 💕';
    const sec = Math.floor(diff / 1000);
    const days = Math.floor(sec / 86400);
    const hrs  = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const ss   = sec % 60;
    return `<strong>${days}</strong> d <strong>${hrs}</strong> h <strong>${mins}</strong> m <strong>${ss}</strong> s`;
  };

  const el1 = $('counterTalkMain');    if(el1) el1.innerHTML = fmt(s.ct1_datetime);
  const el2 = $('counterYesMain');     if(el2) el2.innerHTML = fmt(s.ct2_datetime);
  const el3 = $('counterEngagedMain'); if(el3) el3.innerHTML = fmt(s.ct3_datetime);
};

document.addEventListener('DOMContentLoaded', () => {
  if(window.__counterInterval) clearInterval(window.__counterInterval);
  window.__counterInterval = setInterval(() => {
    const v = $('viewerScreen');
    if(v && v.classList.contains('active')) window.updateCounters();
  }, 1000);
});

})();