/* ============================================================
   boot.js — Main boot sequence
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

/* Keep the social-preview URL in sync with the CURRENT page URL. */
(function(){
  try{
    const og = document.getElementById('ogUrlMeta');
    if(og) og.setAttribute('content', location.href.split('#')[0]);
  }catch(e){}
})();

/* ---------- Home floaters ---------- */
function initHomeFloaters(){
  const fl = $('homeFloaters');
  if(!fl) return;
  fl.innerHTML = '';
  const pool = ['❤️','💕','✨','🌹','💖','⭐','💛','🎀','🦋','💫','🌸','🎈','💝','🕊️'];
  for(let i = 0; i < 18; i++){
    const s = document.createElement('span');
    s.className = 'hf';
    s.textContent = pool[Math.floor(Math.random() * pool.length)];
    s.style.left = (Math.random() * 100) + '%';
    s.style.fontSize = (0.9 + Math.random() * 1.3) + 'rem';
    s.style.animationDuration = (9 + Math.random() * 10) + 's';
    s.style.animationDelay = (Math.random() * 10) + 's';
    fl.appendChild(s);
  }
}

/* ---------- Body floaters ---------- */
function initBodyFloaters(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const emo = ['❤️','💛','🌹','💕','✨','💗','🌺','💝','🌸','💞'];
  for(let i = 0; i < 12; i++){
    const sp = document.createElement('span');
    sp.className = 'float-item';
    sp.textContent = emo[Math.floor(Math.random() * emo.length)];
    sp.style.left = (Math.random() * 100) + '%';
    sp.style.fontSize = (1.2 + Math.random() * 1.4) + 'rem';
    sp.style.animationDuration = (9 + Math.random() * 9) + 's';
    sp.style.animationDelay = (Math.random() * 8) + 's';
    document.body.appendChild(sp);
  }
}

/* ---------- Boot ---------- */

/* Show the real home instantly from a local snapshot while fresh data loads. */
const HOME_SNAP_KEY = 'homeSnapshotV1';
function saveHomeSnapshot(){
  try{
    localStorage.setItem(HOME_SNAP_KEY, JSON.stringify({
      people: S.PEOPLE || [],
      shared: (S.CURR && S.CURR.shared) || null,
      reviews: S.REVIEWS || []
    }));
  }catch(e){}
}
/* Drop the cached home snapshot (e.g. right after a hard reload / upgrade). */
window.clearHomeSnapshot = function(){
  try{ localStorage.removeItem(HOME_SNAP_KEY); }catch(e){}
}
function loadHomeSnapshot(){
  try{
    const raw = localStorage.getItem(HOME_SNAP_KEY);
    if(!raw) return false;
    const snap = JSON.parse(raw);
    if(snap && Array.isArray(snap.people)){
      S.PEOPLE = snap.people;
      /* NOTE: shared/adminPassword is intentionally NOT trusted from cache —
         it is always loaded fresh below, so password rules never change. */
      if(Array.isArray(snap.reviews)) S.REVIEWS = snap.reviews;
      return true;
    }
  }catch(e){}
  return false;
}

async function boot(){
  document.body.setAttribute('data-theme', 'romantic');
  const viewer = document.getElementById('viewerScreen');
  if(viewer){
    viewer.setAttribute('data-theme', 'romantic');
    viewer.setAttribute('data-darkmode', 'false');
  }

  initAllTzSelects();
  initBodyFloaters();
  initHomeFloaters();

  /* ✅ Instant paint: render home from last visit's cached snapshot first,
     then refresh with live data in the background (no flash of "Loading…"). */
  let paintedFromCache = false;
  if(loadHomeSnapshot()){
    if(window.buildHome) window.buildHome();
    paintedFromCache = true;
  } else {
    if(window.renderHomeSkeleton) window.renderHomeSkeleton();
  }

  /* Kick off ALL independent reads in parallel — total wait ≈ one round trip. */
  const wipeP   = sb.wipeExpiredAndReturn().catch(() => []);
  const ledgerP = (window.pullFinishedLedger ? pullFinishedLedger() : Promise.resolve(false)).catch(() => false);
  const peopleP = sb.people().catch(() => null);
  const setP    = sb.getSet(null).catch(() => null);
  /* Reviews are fetched directly (same query as loadReviews) so boot does not
     depend on the deferred reviews.js finishing first; we render them with
     buildHome exactly like before. */
  const revP    = sb.reviews().then(r => { S.REVIEWS = r || []; }).catch(() => { S.REVIEWS = []; });

  const wiped = await wipeP;
  if(wiped && wiped.length) S.__justWiped = wiped;

  /* Merge finished people wiped by OTHER tabs/browsers into the local list,
     so the home "Finished" section shows ALL auto-wiped people on load. */
  try{
    /* 1) CLOUD LEDGER (Supabase Storage): the permanent master copy of all
          finished people — it survives every database wipe, so the 💐 Finished
          tab is ALWAYS there on the home screen. */
    const fromLedger = await ledgerP;
    /* 2) Also merge anything due/overdue still sitting in the people table */
    let synced = false;
    if(window.syncFinishedFromCloud){
      synced = await window.syncFinishedFromCloud();
    }
    if((fromLedger || synced) && window.clearHomeSnapshot) window.clearHomeSnapshot();
  }catch(e){}

  const freshPeople = await peopleP;
  if(freshPeople !== null) S.PEOPLE = freshPeople || [];

  const gs = await setP;
  S.CURR.shared = {
    adminPassword: (gs && gs['shared__adminPassword']) || FALLBACK_ADMIN_PW,
    adminLoginEnabled: (gs && gs['shared__adminLoginEnabled'])
  };

  /* ✅ Load reviews BEFORE building home screen so they appear on first paint */
  try{ await revP; }
  catch(e){
    console.warn('loadReviews failed', e && e.message);
    S.REVIEWS = [];
  }

  if(window.buildHome) window.buildHome();
  /* keep the 💐 Finished tab badge in the admin panel fresh on load */
  if(window.updateFinishedBadge) window.updateFinishedBadge();
  saveHomeSnapshot();

  if(window.SS_restoreSession && window.SS_restoreSession()) return;

  setInterval(window.checkWipe, 60000);

  const urlP = new URLSearchParams(location.search).get('person');
  if(urlP){
    const p = S.PEOPLE.find(x => x.slug === urlP);
    if(p){
      setTimeout(() => {
        const btns = document.querySelectorAll('#homeGrid .home-btn:not(.guest)');
        /* Match by slug (order-independent — safe even with favourites sorting) */
        const target = Array.from(btns).find(b => b.getAttribute('data-slug') === p.slug);
        if(target) target.click();
      }, paintedFromCache ? 80 : 250);
    }
  }
}

window.__closeAllModals__ = function(){
  ['closingModal','adminPanel','guestPanel','guestEditModal','requesterEditModal',
   'addPersonModal','personLoginModal','adminLoginModal','reviewModal',
   'storyModal','mapModal','pinModal','uploadModal',
   'personDetailsModal','shareModal'].forEach(id => {
    const el = $(id);
    if(el) el.classList.remove('active');
  });
  const ss = $('slideshowOverlay');
  if(ss) ss.classList.remove('active');
};

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();