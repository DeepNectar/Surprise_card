/* ============================================================
   counters.js — Live counters for the card
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

window.updateCounters = function(){
  const S = window.__PAGE_STATE__;
  const s = (S && S.CURR && S.CURR.shared) || {};

  /* Cache Intl/Date work: only rebuild the HTML when the second value
     actually changed — avoids re-parsing dates and rewriting innerHTML
     on every tick of the 1 s interval. */
  const last = window.__counterLast__ || (window.__counterLast__ = {});
  const fmt = (iso, key) => {
    if(!iso) return '—';
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    if(diff < 0) return 'Just started 💕';
    const sec = Math.floor(diff / 1000);
    if(last[key] === sec) return null;         /* unchanged → no DOM write */
    last[key] = sec;
    const days = Math.floor(sec / 86400);
    const hrs  = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const ss   = sec % 60;
    return `<strong>${days}</strong> d <strong>${hrs}</strong> h <strong>${mins}</strong> m <strong>${ss}</strong> s`;
  };

  const set = (el, html) => { if(el && html != null) el.innerHTML = html; };
  set($('counterTalkMain'),    fmt(s.ct1_datetime, 'ct1'));
  set($('counterYesMain'),     fmt(s.ct2_datetime, 'ct2'));
  set($('counterEngagedMain'), fmt(s.ct3_datetime, 'ct3'));
};

/* ⚡ PERF: the old code ran a 1 s interval FOREVER (even on the home
   screen, even while the tab was hidden — browsers still fire timers in
   background tabs at their throttled rate). Now we only run the interval
   WHILE the viewer is actually visible: start/stop via visibilitychange +
   MutationObserver on #viewerScreen's class list, and skip ticks whenever
   the tab is hidden. Zero work when nobody is looking. */
(function(){
  let running = false;

  function shouldRun(){
    const v = $('viewerScreen');
    return !!(v && v.classList.contains('active')) && !document.hidden;
  }
  function stop(){
    if(running){ clearInterval(window.__counterInterval); window.__counterInterval = null; running = false; }
  }
  function sync(){
    if(shouldRun()){
      if(!running){
        window.updateCounters();               /* paint immediately */
        window.__counterInterval = setInterval(tick, 1000);
        running = true;
      }
    } else stop();
  }
  function tick(){
    if(document.hidden || !window.updateCounters){ stop(); return; }
    window.updateCounters();
  }

  document.addEventListener('visibilitychange', sync);

  function init(){
    const v = $('viewerScreen');
    if(v && window.MutationObserver){
      new MutationObserver(sync).observe(v, { attributes: true, attributeFilter: ['class'] });
    }
    /* closing.js stops timers by nulling window.__counterInterval — wrap it
       so our internal handle is cleared too (never leave a stale interval). */
    const stopName = '__stopEverything__';
    try{
      if(typeof window[stopName] === 'function' && !window[stopName].__counterWrapped){
        const orig = window[stopName];
        const wrapped = function(){
          try{ orig.apply(window, arguments); }
          finally{ stop(); }
        };
        wrapped.__counterWrapped = true;
        window[stopName] = wrapped;
      }
    }catch(e){}
    sync();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
})();
