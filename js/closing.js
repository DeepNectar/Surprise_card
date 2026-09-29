/* ============================================================
   closing.js — Closing modal + review flow
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
let RV_STARS = 0;

function releaseBalloons(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const pool = ['🎈','💖','💕','🌹','✨','🎀','🌸','💝'];
  for(let i = 0; i < 18; i++){
    const b = document.createElement('div');
    b.className = 'balloon';
    b.textContent = pool[Math.floor(Math.random() * pool.length)];
    b.style.left = (Math.random() * 100) + '%';
    b.style.fontSize = (1.6 + Math.random() * 1.6) + 'rem';
    b.style.animationDuration = (4.5 + Math.random() * 3) + 's';
    b.style.animationDelay = (Math.random() * 0.8) + 's';
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 9000);
  }
}

/* ---------- Full stop: music, timers, slideshow, everything ---------- */
window.__stopEverything__ = function(){
  // Stop music + clear playlist
  try{ if(window.stopMusic) window.stopMusic(); }catch(e){}
  const a = $('audioPlayer');
  if(a){
    try{ a.pause(); a.currentTime = 0; a.removeAttribute('src'); a.load(); }catch(e){}
  }

  // Stop slideshow timers + floaters
  try{ if(window.SS_clearTimers) window.SS_clearTimers(); }catch(e){}
  try{ if(window.SS_stopFloaters) window.SS_stopFloaters(); }catch(e){}

  // Abort typewriter
  try{ if(window.restartTypewriter) { /* noop */ } }catch(e){}

  // Stop card counters
  if(window.__counterInterval){
    clearInterval(window.__counterInterval);
    window.__counterInterval = null;
  }

  // Stop event countdown interval
  if(window.__eventsInterval){
    clearInterval(window.__eventsInterval);
    window.__eventsInterval = null;
  }

  // Stop lock countdown
  try{ if(window.stopCountdownFull) window.stopCountdownFull(); }catch(e){}
};

/* ---------- Open closing modal (music keeps playing) ---------- */
window.openClosingModal = function(){
  const t = S.CURR.texts || {};
  txt($('closingTitleEl'), t.closeTitle || '💖 With Love');

  const parts = [t.close1, t.close2, t.close3, t.close4].filter(Boolean);
  const body = $('closingBody');
  if(body){
    body.innerHTML = parts.length
      ? parts.map(p => '<p style="margin-bottom:.8rem;">' + esc(p).replace(/\n/g, '<br>') + '</p>').join('')
      : '<p style="text-align:center;font-style:italic;color:var(--c-text-muted);">Thank you for watching 💕</p>';
  }

  txt($('closingSignoff'), t.closeSignoff || '');
  txt($('closingDoneBtn'), t.closeBtn || '💛 Continue');

  // Music continues playing under the closing modal — no stop here.

  releaseBalloons();
  show($('closingModal'));
};

function advanceAfterClosing(){
  hide($('closingModal'));
  const p = S.CURRENT_PERSON;
  if(!p){ window.goHomeClean(); return; }
  if(window.hasReviewFor && window.hasReviewFor(p.slug)){
    // Already reviewed — stop everything and go home
    window.goHomeClean();
    return;
  }
  window.openReviewModal();
}

/* ---------- Go home clean (stops everything) ---------- */
window.goHomeClean = function(){
  // Full stop: music, timers, slideshow, everything
  if(window.__stopEverything__) window.__stopEverything__();

  try{ if(window.__closeAllModals__) window.__closeAllModals__(); }catch(e){}

  hide($('slideshowOverlay'));
  hide($('viewerScreen'));
  hide($('lockScreen'));
  hide($('openingScreen'));

  S.CARD_STARTED = false;
  S.PREVIEW_MODE = false;
  S.REQUESTER_MODE = false;
  S.CURRENT_PERSON = null;

  // Reset viewer theme + dark mode to defaults
  const viewer = $('viewerScreen');
  if(viewer){
    viewer.setAttribute('data-theme', 'romantic');
    viewer.setAttribute('data-darkmode', 'false');
  }
  if(window.setDarkMode) window.setDarkMode(false);

  window.scrollTo(0, 0);
  const hs = $('homeScreen');
  if(hs) hs.classList.remove('hidden');
};

function paintReviewStars(n){
  document.querySelectorAll('#reviewStars .star').forEach(s => {
    s.classList.toggle('on', +s.dataset.v <= n);
  });
  const hint = $('reviewStarHint');
  if(hint){
    hint.textContent = n ? ('You rated ' + n + '/5 ' + '★'.repeat(n)) : 'Tap a star to rate';
  }
}

window.openReviewModal = function(){
  const p = S.CURRENT_PERSON;
  if(!p){ window.goHomeClean(); return; }

  txt($('reviewForWho'),
    'Review for ' + (p.display_name || p.slug || '') +
    (p.slug ? ' · #' + p.slug : '') +
    (p.requester_name ? ' · Requested by ' + p.requester_name : ''));

  RV_STARS = 0;
  S.REVIEW_STARS = 0;
  paintReviewStars(0);

  const rm = $('reviewMessage'); if(rm) rm.value = '';
  const re = $('reviewEmail');   if(re) re.value = '';

  const st = $('reviewStatus');
  if(st){ st.textContent = ''; st.className = 'panel-status'; }

  show($('reviewModal'));
};

document.addEventListener('DOMContentLoaded', () => {
  const cc = $('closingClose');
  if(cc) cc.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); advanceAfterClosing(); };
  const cd = $('closingDoneBtn');
  if(cd) cd.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); advanceAfterClosing(); };

  document.querySelectorAll('#reviewStars .star').forEach(s => {
    s.onclick = (e) => {
      if(e && e.preventDefault) e.preventDefault();
      RV_STARS = +s.dataset.v;
      S.REVIEW_STARS = RV_STARS;
      paintReviewStars(RV_STARS);
    };
    s.onmouseenter = () => paintReviewStars(+s.dataset.v);
  });
  const stars = $('reviewStars');
  if(stars) stars.onmouseleave = () => paintReviewStars(RV_STARS);

  const submit = $('reviewSubmit');
  if(submit) submit.onclick = async (e) => {
    if(e && e.preventDefault) e.preventDefault();
    const st = $('reviewStatus');

    if(!RV_STARS){
      st.textContent = '❌ Please tap a star to rate.';
      st.className = 'panel-status err';
      return;
    }

    const msg = $('reviewMessage').value.trim();
    if(!msg){
      st.textContent = '❌ Review message is required.';
      st.className = 'panel-status err';
      return;
    }

    const email = $('reviewEmail').value.trim();
    if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
      st.textContent = '❌ Invalid email.';
      st.className = 'panel-status err';
      return;
    }

    const p = S.CURRENT_PERSON;
    if(!p){
      st.textContent = '❌ No person to review.';
      st.className = 'panel-status err';
      return;
    }

    const reqName = p.requester_name || 'Admin';
    const row = {
      person_id: p.id || null,
      person_slug: p.slug || '',
      person_name: p.display_name || p.slug || '',
      requester_name: reqName,
      requester_wa: '',
      guest_id: null,
      stars: RV_STARS,
      message: msg,
      email: email || null
    };

    st.textContent = '⏳ Saving…';
    st.className = 'panel-status';

    try{
      await sb.upsertReview(row);
      st.textContent = '✅ Thank you! Returning home…';
      st.className = 'panel-status ok';
      __showToast('💛 Review submitted');

      // Stop everything, then go home clean
      if(window.__stopEverything__) window.__stopEverything__();
      setTimeout(() => {
        hide($('reviewModal'));
        window.goHomeClean();
        if(window.loadReviews) window.loadReviews().catch(() => {});
      }, 700);
    }catch(err){
      st.textContent = '❌ ' + (err.message || 'Could not save');
      st.className = 'panel-status err';
    }
  };
});

})();