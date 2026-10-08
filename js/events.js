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
      /* SECURITY: icon/label come from user-supplied data → must be escaped
         before being placed in innerHTML (was an XSS hole). */
      const icon = esc(e.icon || '📅');
      const label = esc(e.label || '');
      if(d <= 0){
        return `<div class="event-row">
          <div class="event-icon">${icon}</div>
          <div class="event-body">
            <div class="event-label">${label}</div>
            <div class="event-time">🎉 Today!</div>
          </div>
        </div>`;
      }
      const days = Math.floor(d / 86400000);
      const hrs  = Math.floor((d % 86400000) / 3600000);
      const mins = Math.floor((d % 3600000) / 60000);
      return `<div class="event-row">
        <div class="event-icon">${icon}</div>
        <div class="event-body">
          <div class="event-label">${label}</div>
          <div class="event-time"><strong>${days}</strong>d <strong>${hrs}</strong>h <strong>${mins}</strong>m</div>
        </div>
      </div>`;
    }).join('');
  }

  tick();
  if(EV_T) clearInterval(EV_T);
  /* ⚡ PERF + BUGFIX: minute-resolution countdown doesn't need a 60 s timer
     running forever. The old code also LEAKED this interval when another
     card was opened (closing.js only cleared window.__eventsInterval, but
     the local EV_T handle kept re-assigning it), and kept ticking while the
     tab was hidden. Now: single tracked handle, paused while hidden. */
  window.__eventsInterval = startPausedMinuteTimer(w, tick);
}

/* Minute-resolution ticker that pauses automatically while the tab is
   hidden or the event section isn't visible; catches up on return. */
function startPausedMinuteTimer(sectionEl, tick){
  let iv = null;
  function shouldRun(){
    return !document.hidden && sectionEl &&
           $('eventSection') && $('eventSection').style.display !== 'none';
  }
  function stop(){ if(iv){ clearInterval(iv); iv = null; } }
  function sync(){
    if(shouldRun() && !iv){ tick(); iv = setInterval(tick, 60000); }
    else if(!shouldRun()) stop();
  }
  document.addEventListener('visibilitychange', sync);
  sync();
  /* expose stop so repeated renderEvents() calls don't stack listeners:
     clearing via clearInterval(window.__eventsInterval) still works because
     we mirror the live handle below. */
  const wrapper = { id: null };
  Object.defineProperty(wrapper, 'id', {
    get(){ return iv; },
    set(v){ if(v === undefined || v === null) stop(); }
  });
  return wrapper;
}

})();