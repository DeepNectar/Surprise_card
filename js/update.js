/* ============================================================
   update.js — "New deployment → upgrade popup" system

   How it works (no service worker needed):
   • Every deploy ships a fresh /version.json (see config.js APP_VERSION,
     CHANGELOG_LIVE, RELEASE_DATE). css/js are cached immutably by the CDN,
     so a long-open tab can keep running OLD code after you deploy.
   • On boot we fetch version.json (cache-busted, no-store) and compare its
     version with the APP_VERSION baked into the JS running in THIS tab.
   • If the server has something NEWER than what's loaded here → the tab is
     stale → we pop up an "upgrade" modal telling the user the new version +
     what's new, with a button that hard-reloads to the latest deployed site.
   • A background poll re-checks every 5 minutes, and we re-check whenever
     the tab regains focus/visibility — so even a tab left open all day gets
     the popup right after you deploy.
   • The same "latest deployed version + newest changelog entries" is shown
     on the home screen ("✨ What's new" LIVE badge + 🚀 rows injected from
     version.json) and in the admin panel ("🚀 Latest deployed" box), so the
     upgrade target is always visible in the app.
   ============================================================ */
(function(){
'use strict';

const CHECK_EVERY_MS = 5 * 60 * 1000; /* re-poll while the tab stays open */
const FIRST_CHECK_DELAY_MS = 2500;    /* let the UI paint before checking */
const LS_KEY         = 'lastSeenVerV1';
const USED_KEY       = 'upgradeUsedForV1'; /* versions whose ⬆️ button was already used */
const POPUP_ID       = 'updateModal';

let checking    = false;
let popupOpen   = false;
let remoteInfo  = null;   /* last version.json payload {version,date,changes} */
let listenersOn = false;

/* ---------- helpers ---------- */
function vNum(v){ return parseFloat(String(v == null ? '' : v)) || 0; }
/* esc() lives in utils.js; keep a local fallback so this file never throws. */
function E(s){
  if(typeof window.esc === 'function') return window.esc(s);
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

async function fetchVersionJson(){
  const res = await fetch('/version.json?cb=' + Date.now(), {
    cache: 'no-store',
    headers: { 'Accept': 'application/json' }
  });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ---------- the upgrade popup ---------- */
function ensurePopupDom(){
  let el = document.getElementById(POPUP_ID);
  if(el) return el;
  const v   = remoteInfo && remoteInfo.version != null ? remoteInfo.version : (window.APP_VERSION || 0);
  /* Prefer the freshly fetched highlights; fall back to the bundled changelog. */
  const chg = Array.isArray(remoteInfo && remoteInfo.changes) && remoteInfo.changes.length
              ? remoteInfo.changes
              : (Array.isArray(window.CHANGELOG) ? window.CHANGELOG : []);
  const items = chg.slice(0, 4).map(t =>
    '<div class="um-item"><span class="um-dot">✦</span><span>' + E(t) + '</span></div>'
  ).join('');

  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="panel-modal um-overlay" id="' + POPUP_ID + '" role="dialog" aria-modal="true" aria-label="Site update available">' +
      '<div class="panel-content um-card">' +
        '<div class="um-rocket">🚀</div>' +
        '<div class="um-title">HD' + E(v) + ' Version upgraded</div>' +
        /* The popup's ONLY purpose: show what's NEW in this deployment. */
        (items ? '<div class="um-list-title">✨ What\'s new</div><div class="um-list">' + items + '</div>'
               : '<div class="um-sub">Fresh content has been deployed — one tap loads the latest version.</div>') +
        '<div class="um-actions">' +
          '<button type="button" class="um-btn primary" id="umUpdateNow">⬆️ Update now</button>' +
          '<button type="button" class="um-btn ghost" id="umLater">Not now</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  el = wrap.firstElementChild;
  document.body.appendChild(el);

  el.querySelector('#umUpdateNow').addEventListener('click', doHardReload);
  el.querySelector('#umLater').addEventListener('click', () => {
    /* remember: don't nag about THIS version again in this browser */
    try{ localStorage.setItem(LS_KEY, String(v)); }catch(e){}
    closePopup();
  });
  /* Esc key also dismisses */
  el._escHandler = e => { if(e.key === 'Escape') el.querySelector('#umLater').click(); };
  document.addEventListener('keydown', el._escHandler);
  /* click on backdrop = dismiss (same as "Not now") */
  el.addEventListener('click', e => { if(e.target === el) el.querySelector('#umLater').click(); });
  return el;
}

function openPopup(){
  if(popupOpen) return;
  const el = ensurePopupDom();
  if(!el) return;
  popupOpen = true;
  el.classList.add('active');
  /* focus the primary action for keyboard/screen-reader users */
  const btn = el.querySelector('#umUpdateNow');
  if(btn) setTimeout(() => { try{ btn.focus({ preventScroll:true }); }catch(e){ btn.focus(); } }, 250);
}

function closePopup(){
  const el = document.getElementById(POPUP_ID);
  if(el){
    el.classList.remove('active');
    if(el._escHandler){
      document.removeEventListener('keydown', el._escHandler);
      el._escHandler = null;
    }
  }
  popupOpen = false;
}

/* Nuclear reload: bypass the immutable-cache copies of css/js entirely.
   The ⬆️ button is ONE-SHOT per deployed version: we mark this version as
   "used" BEFORE reloading, so after the refresh the popup never offers the
   same deployment again — only a NEWER one will. */
function doHardReload(){
  const vKey = String(remoteInfo && remoteInfo.version != null ? remoteInfo.version : '');
  try{
    if(vKey){
      const used = JSON.parse(localStorage.getItem(USED_KEY) || '[]');
      if(!Array.isArray(used)) throw 0;
      if(used.indexOf(vKey) < 0) used.push(vKey);
      localStorage.setItem(USED_KEY, JSON.stringify(used));
    }
  }catch(e){
    try{ localStorage.setItem(USED_KEY, JSON.stringify([vKey])); }catch(_){}
  }
  /* Drop the cached home snapshot so the fresh load paints real data
     (including any people wiped while this tab was away). */
  try{ if(window.clearHomeSnapshot) window.clearHomeSnapshot(); }catch(e){}
  try{
    if(window.caches && caches.keys){
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
    }
  }catch(e){}
  const u = new URL(location.href);
  /* unique cache-buster so the CDN/browser can't hand back stale files */
  u.searchParams.set('_v', (remoteInfo && remoteInfo.version ? 'v' + remoteInfo.version + '-' : '') + Date.now());
  u.searchParams.delete('nocache');
  location.replace(u.toString());
}

/* Has the ⬆️ upgrade button already been used for this deployed version? */
function upgradeAlreadyUsedFor(version){
  try{
    const used = JSON.parse(localStorage.getItem(USED_KEY) || '[]');
    return Array.isArray(used) && used.indexOf(String(version)) >= 0;
  }catch(e){ return false; }
}

/* ---------- version check ---------- */
async function checkForUpdate(force){
  if(checking || popupOpen) return;
  checking = true;
  try{
    const j = await fetchVersionJson();
    remoteInfo = { version: j.version, date: j.date, changes: j.changes };

    /* 1) Home screen: show the LATEST DEPLOYED version in "What's new". */
    applyDeployedToHome(j);

    /* 2) Admin panel: same info in the dedicated section. */
    applyDeployedToAdmin(j);

    /* 3) Popup only when the SERVER has something newer than what's RUNNING
          here (i.e. this tab holds stale code). Fresh page loads match, so
          visitors never see the popup — only tabs that missed a deploy. */
    const rv = vNum(j.version), lv = vNum(window.APP_VERSION);
    if(rv > lv){
      /* The upgrade button may be used only ONCE for what has been deployed:
         once this version was applied (or dismissed with "Not now"), never
         nag about it again — only a NEWER deployment can pop up. */
      if(upgradeAlreadyUsedFor(j.version)) return;
      let seen = '';
      try{ seen = localStorage.getItem(LS_KEY) || ''; }catch(e){}
      if(seen === String(j.version)) return;
      openPopup();
    }
  }catch(e){
    /* Offline / file:// / blocked — stay silent, retry on next poll. */
  }finally{
    checking = false;
  }
}

/* ---------- display label for a deployed version ----------
   Version labels are shown as "HD<x> Version" everywhere in the UI
   (home badge, admin panel). The upgrade popup uses its own fixed
   "HD<x> Version upgraded" title. Numeric comparisons still use
   parseFloat-friendly values from version.json / APP_VERSION. */
function versionLabel(v){
  return 'HD' + E(v) + ' Version';
}

/* ---------- surface "latest deployed" on the HOME screen ---------- */
function applyDeployedToHome(j){
  const head = document.getElementById('homeChangelogHead');
  if(head){
    head.setAttribute('data-deployed', 'v' + j.version);
    if(j.date) head.setAttribute('data-date', j.date);
  }
  const badge = document.querySelector('#homeChangelog .hcl-badge');
  if(badge){
    /* Home shows WHAT'S NEW; badge names the new deployment once. */
    badge.textContent = 'HD' + j.version + ' Version upgraded';
    badge.title = 'Latest deployed version' + (j.date ? ' · ' + j.date : '');
  }
  /* Prepend the freshly deployed highlights (from version.json) so the
     "What's new" list ALWAYS reflects the latest deployment — even if this
     visitor's cached index.html is from an older release. */
  const list = document.querySelector('#homeChangelog .hcl-list');
  if(list && Array.isArray(j.changes) && j.changes.length){
    const sig = j.changes.join('|');
    if(list.getAttribute('data-live-sig') !== sig){
      list.setAttribute('data-live-sig', sig);
      Array.from(list.querySelectorAll('.hcl-live')).forEach(n => n.remove());
      j.changes.forEach(t => {
        const row = document.createElement('div');
        row.className = 'hcl-item hcl-live';
        row.innerHTML = '<span class="hcl-ico">🚀</span><span>' + E(t) + '</span>';
        list.insertBefore(row, list.firstChild);
      });
    }
  }
}

/* ---------- surface "latest deployed" in the ADMIN panel ---------- */
function applyDeployedToAdmin(j){
  const box = document.getElementById('adminDeployedBox');
  if(!box) return;
  const localTxt = 'This admin console build: ' + versionLabel(window.APP_VERSION || '?');
  const rows = (Array.isArray(j.changes) ? j.changes : []).slice(0, 3)
    .map(t => '<div class="adb-item">🚀 ' + E(t) + '</div>').join('');
  box.innerHTML =
    '<div class="adb-main">' +
      '<span class="adb-badge">' + versionLabel(j.version) + '</span>' +
      '<span class="adb-text">Latest deployed' + (j.date ? ' · ' + E(j.date) : '') + '</span>' +
    '</div>' +
    '<div class="adb-local">' + E(localTxt) + '</div>' +
    (rows ? '<div class="adb-list">' + rows + '</div>' : '');
  box.style.display = '';
}

/* ---------- auto-refresh when the tab comes back to life ---------- */
function attachVisibilityRefresh(){
  if(listenersOn) return;
  listenersOn = true;
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible'){
      /* returning after a long absence → make sure we're on the latest deploy */
      checkForUpdate(false);
    }
  });
  window.addEventListener('focus', () => { checkForUpdate(false); });
}

/* ---------- kick off ---------- */
function start(){
  setTimeout(() => checkForUpdate(false), FIRST_CHECK_DELAY_MS); /* first check after paint */
  setInterval(() => checkForUpdate(false), CHECK_EVERY_MS);       /* while tab is open */
  attachVisibilityRefresh();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

})();
