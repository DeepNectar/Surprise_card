/* ============================================================
   events.js — Event countdowns
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
let EV_T = null;

window.renderEvents = function(){
  const sec = $('eventSection');
  const w = $('eventRow');
  if(!sec || !w) return;

  const ev = S.CURR.events || [];
  const s = S.CURR.shared || {};

  if(s.enableEventCount !== 'true' || !ev.length){
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
  txt($('eventSectionTitleEl'), (S.CURR.texts || {}).eventSectionTitle || 'Coming up');

  function tick(){
    w.innerHTML = ev.map(e => {
      const t = new Date(e.target_iso);
      if(isNaN(t.getTime())) return '';
      const d = t - Date.now();
      if(d <= 0){
        return `<div class="event-row">
          <div class="event-icon">${e.icon || '📅'}</div>
          <div class="event-body">
            <div class="event-label">${esc(e.label || '')}</div>
            <div class="event-time">🎉 Today!</div>
          </div>
        </div>`;
      }
      const days = Math.floor(d / 86400000);
      const hrs  = Math.floor((d % 86400000) / 3600000);
      const mins = Math.floor((d % 3600000) / 60000);
      return `<div class="event-row">
        <div class="event-icon">${e.icon || '📅'}</div>
        <div class="event-body">
          <div class="event-label">${esc(e.label || '')}</div>
          <div class="event-time"><strong>${days}</strong>d <strong>${hrs}</strong>h <strong>${mins}</strong>m</div>
        </div>
      </div>`;
    }).join('');
  }

  tick();
  if(EV_T) clearInterval(EV_T);
  EV_T = setInterval(tick, 60000);
  window.__eventsInterval = EV_T;
};

})();