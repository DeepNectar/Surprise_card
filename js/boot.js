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
  /* ⚡ Perf + a11y fix: these 18 emoji run a GPU animation FOREVER (the CSS
     has no reduced-motion rule for .hf). On low-end phones they cost frames
     on every screen; users who ask for reduced motion now get none at all,
     and everyone else gets half as many. */
  if(REDUCED_MOTION) return;
  const fl = $('homeFloaters');
  if(!fl) return;
  fl.innerHTML = '';
  const pool = ['❤️','💕','✨','🌹','💖','⭐','💛','🎀','🦋','💫','🌸','🎈','💝','🕊️'];
  for(let i = 0; i < 9; i++){
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

const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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

  /* ⚡ Perf fix: previously boot AWAITED the expired-wipe scan and the cloud
     ledger pulls before painting anything — on slow connections that added
     several seconds of dead time to first paint. Now only the three reads the
     home screen truly needs run first (≈ one round trip, in parallel); the
     wipe scan + ledger sync run fully in the BACKGROUND and repaint the home
     when they land. The page feels instant, nothing is lost. */
  const peopleP = sb.people().catch(() => null);
  const setP    = sb.getSet(null).catch(() => null);
  /* Reviews are fetched directly (same query as loadReviews) so boot does not
     depend on the deferred reviews.js finishing first; we render them with
     buildHome exactly like before. */
  const revP    = sb.reviews().then(r => { S.REVIEWS = r || []; }).catch(() => { S.REVIEWS = []; });

  const freshPeople = await peopleP;
  if(freshPeople !== null) S.PEOPLE = freshPeople || [];

  const gs = await setP;
  S.CURR.shared = {
    adminPassword: (gs && gs['shared__adminPassword']) || FALLBACK_ADMIN_PW,
    /* v1.0 SECURITY: preferred hash-only admin passphrase (settings key
       shared__adminPwHash = sha256('lovecards::v1::salt::' + password)) */
    adminPwHash: (gs && gs['shared__adminPwHash']) || '',
    adminLoginEnabled: (gs && gs['shared__adminLoginEnabled'])
  };

  /* ✅ Load reviews BEFORE building home screen so they appear on first paint */
  try{ await revP; }
  catch(e){
    console.warn('loadReviews failed', e && e.message);
    S.REVIEWS = [];
  }

  /* HD1.1 — pull the cloud 💐 Finished ledger BEFORE the first home paint, so
     people the admin already moved to Finished never flash on the active grid
     (and Finished tiles are complete on first render). Best-effort: boot
     continues even offline. */
  try{ if(window.pullFinishedLedger) await pullFinishedLedger(); }catch(e){}

  if(window.buildHome) window.buildHome();
  /* keep the 💐 Finished tab badge in the admin panel fresh on load */
  if(window.updateFinishedBadge) window.updateFinishedBadge();
  saveHomeSnapshot();

  /* ---------- Background maintenance (never blocks the UI) ---------- */
  (async () => {
    try{
      const wiped = await sb.wipeExpiredAndReturn().catch(() => []);
      if(wiped && wiped.length) S.__justWiped = wiped;

      /* Merge finished people wiped by OTHER tabs/browsers into the local list,
         so the home "Finished" section shows ALL auto-wiped people. */
      try{
        /* 1) CLOUD LEDGER (Storage + settings mirror + permanent table): the
              master copy of all finished people — survives every DB wipe. */
        const fromLedger = (window.pullFinishedLedger
          ? await pullFinishedLedger().catch(() => false) : false);
        /* 2) Also merge anything due/overdue still sitting in the people table */
        let synced = false;
        if(window.syncFinishedFromCloud){
          try{ synced = await window.syncFinishedFromCloud(); }catch(e){}
        }
        if(fromLedger || synced){
          if(window.clearHomeSnapshot) window.clearHomeSnapshot();
          /* Finished list changed → quietly repaint the 💐 section. */
          if(window.renderFinishedSection) window.renderFinishedSection();
        }
      }catch(e){}
    }catch(e){}
  })();

  if(window.SS_restoreSession && window.SS_restoreSession()) return;

  startWipeWatchdog();

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

/* ---------- Wipe watchdog (⚡ perf: pauses while the tab is hidden) ----------
   A hidden tab used to hammer Supabase every 60s forever — battery drain on
   phones and wasted requests. Now: paused while hidden; on return we do ONE
   immediate catch-up check and resume the gentle 60s cadence. */
let WIPE_INT = null;
function startWipeWatchdog(){
  if(WIPE_INT == null && !document.hidden) WIPE_INT = setInterval(window.checkWipe, 60000);
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){
      if(WIPE_INT != null){ clearInterval(WIPE_INT); WIPE_INT = null; }
    } else if(WIPE_INT == null){
      try{ window.checkWipe(); }catch(e){}                    /* catch up now */
      WIPE_INT = setInterval(window.checkWipe, 60000);
    }
  });
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