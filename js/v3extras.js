/* ============================================================
   v3extras.js — V3.0 additive features (no rules changed)
   • Konami easter egg                • Cake bonus confetti
   • Native Web Share API             • Scheduled-unlock toast
   • Save progress bar                • PWA install + manifest
   (Favourites ❤️ + search live natively in home.js)
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

/* ---------- Scheduled unlock: friendly "opens in" toast on home ---------- */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    try{
      if(!S.PEOPLE || !S.PEOPLE.length) return;
      /* unlock date lives in each person's settings row (shared__unlockDateISO) */
      let rows = [];
      for(const p of S.PEOPLE.filter(x => x.enabled !== false)){
        try{
          const set = await sb.getSet(p.id);
          const iso = set && set['shared__unlockDateISO'];
          if(iso){
            const d = new Date(iso);
            if(d > new Date()) rows.push({name: p.display_name || p.slug || '', d});
          }
        }catch(e){}
      }
      if(!rows.length) return;
      rows.sort((a,b) => a.d - b.d);
      const soon = rows[0];
      const mins = Math.round((soon.d - new Date()) / 60000);
      let human;
      if(mins < 60) human = mins + ' minutes';
      else if(mins < 1440) human = Math.round(mins/60) + ' hours';
      else human = Math.round(mins/1440) + ' days';
      __showToast('⏰ ' + soon.name + '\'s card opens in ~' + human + ' 🎁', true);
    }catch(e){}
  }, 3200);
});

/* ---------- Native Web Share API (mobile) with WhatsApp fallback ---------- */
window.v3NativeShare = async function(title, text, url){
  if(navigator.share){
    try{ await navigator.share({title, text, url}); return true; }
    catch(e){ if(e && e.name === 'AbortError') return false; }
  }
  return false;
};

/* ---------- Konami code easter egg → secret aurora dance ---------- */
(function(){
  const SEQ = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let pos = 0;
  document.addEventListener('keydown', (e) => {
    if(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key;
    if(k === SEQ[pos]){ pos++; }
    else if(k === SEQ[0]){ pos = 1; }
    else { pos = 0; }
    if(pos === SEQ.length){
      pos = 0;
      document.body.classList.add('konami-dance');
      if(window.v3PlaySound) window.v3PlaySound('magic');
      __showToast('🥨 Secret code! You found the hidden magic ✨', true);
      try{ fireworksBurst(window.innerWidth/2, window.innerHeight/3); }catch(e){}
      setTimeout(() => document.body.classList.remove('konami-dance'), 9000);
    }
  });
})();

/* ---------- Hidden surprise: tap the home emoji 5 times → bonus confetti ----------
   (3 taps still opens the admin prompt exactly as before — we only add a
   celebration when the user keeps tapping past that.) */
document.addEventListener('DOMContentLoaded', () => {
  const el = $('homeEmoji');
  if(!el) return;
  let extraTaps = 0, timer = null;
  function celebrate(){
    if(window.confettiCannon){
      try{
        confettiCannon(window.innerWidth * 0.25, window.innerHeight * 0.4, 110);
        confettiCannon(window.innerWidth * 0.75, window.innerHeight * 0.4, 110);
      }catch(e){}
    }
    if(window.v3PlaySound) window.v3PlaySound('magic');
    __showToast('🎂🎉 You found the sweet tooth! Bonus confetti!', true);
  }
  el.addEventListener('click', () => {
    /* capture phase runs BEFORE home.js's bubble handler:
       count===3 → admin prompt fires there and resets its own counter;
       count===6 → this means the user kept tapping → celebrate. */
    extraTaps++;
    clearTimeout(timer);
    timer = setTimeout(() => { extraTaps = 0; }, 2000);
    if(extraTaps >= 6){ extraTaps = 0; celebrate(); }
  }, true);
});

/* ---------- Live save-progress bar (top of screen during any fetch) ---------- */
(function(){
  let bar = null, pending = 0, hideT = null;
  function makeBar(){
    bar = document.createElement('div');
    bar.id = 'v3ProgressBar';
    document.body.appendChild(bar);
  }
  function start(){
    pending++;
    if(!bar) makeBar();
    clearTimeout(hideT);
    bar.classList.add('on');
  }
  function done(){
    pending = Math.max(0, pending - 1);
    if(pending === 0){
      hideT = setTimeout(() => { if(bar) bar.classList.remove('on'); }, 250);
    }
  }
  /* Hook fetch transparently — purely visual, returns the exact same promise. */
  const _fetch = window.fetch;
  if(typeof _fetch === 'function'){
    window.fetch = function(){
      if(String(arguments[0] || '').indexOf(SUPABASE_URL) === 0) start();
      const p = _fetch.apply(this, arguments);
      if(String(arguments[0] || '').indexOf(SUPABASE_URL) === 0){
        p.then(done, done);
      }
      return p;
    };
  }
})();

/* ---------- PWA: runtime-generated manifest + install prompt ---------- */
(function(){
  try{
    if(location.protocol === 'http:' || location.protocol === 'https:'){
      const icon = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c41e3a"/><stop offset="1" stop-color="#4a0016"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><path d="M256 400c-72-52-136-104-136-168a68.8 68.8 0 0 1 136-20.8A68.8 68.8 0 0 1 392 232c0 64-64 116-136 168z" fill="#ffd700"/></svg>');
      const manifest = {
        name: 'Surprise Card 💝', short_name: 'Surprise',
        start_url: '.', display: 'standalone', background_color: '#1a0510',
        theme_color: '#c41e3a',
        icons: [{src: icon, sizes: '512x512', type: 'image/svg+xml', purpose: 'any'}]
      };
      const blob = new Blob([JSON.stringify(manifest)], {type: 'application/manifest+json'});
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = URL.createObjectURL(blob);
      document.head.appendChild(link);
    }
  }catch(e){}

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'v3InstallChip';
    chip.textContent = '📲 Install app';
    chip.onclick = async () => {
      chip.remove();
      if(!deferredPrompt) return;
      try{ deferredPrompt.prompt(); await deferredPrompt.userChoice; }catch(e){}
      deferredPrompt = null;
    };
    document.body.appendChild(chip);
  });
  window.addEventListener('appinstalled', () => {
    const c = $('v3InstallChip'); if(c) c.remove();
  });
})();

})();
