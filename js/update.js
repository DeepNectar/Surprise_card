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
/* Rolling deployment history shown in the home "✨ What's new" tab:
   we ALWAYS keep only the last MAX_DEPLOYS deployments — when a new one
   arrives it goes on top and the oldest (bottom-most) one is removed. */
const MAX_DEPLOYS    = 5;
const DEPLOYS_KEY    = 'whatsNewDeploysV1';

let checking    = false;
let popupOpen   = false;
let remoteInfo  = null;   /* last version.json payload {version,date,changes} */
let listenersOn = false;

/* ---------- helpers ---------- */
function vNum(v){ return parseFloat(String(v == null ? '' : v)) || 0; }
/* Human-friendly deploy date, e.g. "2 Oct 2026". Falls back to the raw
   string if it can't be parsed. */
function prettyDate(iso){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return String(iso || '');
  try{
    return d.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
  }catch(e){
    return d.toISOString().slice(0,10);
  }
}
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

/* ---------- the upgrade popup ----------
   The "✨ What's new" list inside the popup must describe what the visitor
   GETS after pressing ⬆️ — i.e. the changelog bundled with the deployment
   on the server. We only serve that popup when remote > local, so the
   CURRENT build's CHANGELOG_LIVE is exactly the right list. Anything baked
   into an older cached copy of this file is overwritten here on every
   check, so the text is always fresh — never a stale description of some
   previous release. */
function refreshPopupChangelog(){
  let el = document.getElementById(POPUP_ID);
  if(!el){
    el = ensurePopupDom();
    if(!el) return;
  }
  /* Canonical list + canonical version name — identical to what the home
     screen "✨ What's new" shows, so every surface agrees on one version. */
  const src = canonicalChanges();
  const items = src.slice(0, 4).map(t =>
    '<div class="um-item"><span class="um-dot">✦</span><span>' + E(t) + '</span></div>'
  ).join('');
  const titleEl = el.querySelector('.um-title');
  if(titleEl){
    const v = canonicalVersion() || (window.APP_VERSION || 0);
    titleEl.textContent = 'HD' + v + ' Version upgraded';
  }
  let list = el.querySelector('.um-list');
  if(!list){
    /* cached/older markup without the hook — rebuild the whole card once */
    if(el.remove) el.remove(); else el.innerHTML = '';
    el = ensurePopupDom();
    if(!el) return;
    list = el.querySelector('.um-list');
  }
  if(list && items) list.innerHTML = items;
}

function ensurePopupDom(){
  let el = document.getElementById(POPUP_ID);
  if(el) return el;
  const v   = canonicalVersion() || (window.APP_VERSION || 0);
  /* Canonical highlights — the exact same "what's new" list the home
     screen shows for this deployment. */
  const chg = canonicalChanges();
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
        '<div class="um-list-title">✨ What\'s new</div>' +
        (items ? '<div class="um-list">' + items + '</div>'
               : '<div class="um-list"></div><div class="um-sub">Fresh content has been deployed — one tap loads the latest version.</div>') +
        '<div class="um-actions">' +
          '<button type="button" class="um-btn primary" id="umUpdateNow">⬆️ Update now</button>' +
          '<button type="button" class="um-btn ghost" id="umLater">Not now</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  el = wrap.firstElementChild || { querySelector(){ return null; } };
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
         nag about it again — only a NEWER deployment can pop up. NOTE: the
         checks below return BEFORE openPopup() builds its DOM, so the list
         is rebuilt from THIS build's own CHANGELOG_LIVE — which describes
         exactly the code the visitor will get after reloading. */
      if(upgradeAlreadyUsedFor(j.version)) return;
      let seen = '';
      try{ seen = localStorage.getItem(LS_KEY) || ''; }catch(e){}
      if(seen === String(j.version)) return;
      refreshPopupChangelog();  /* rewrite any stale text before showing it */
      openPopup();
    }
  }catch(e){
    /* Offline / file:// / blocked — stay silent about the popup, but still
       paint the home "What's new" tab from THIS build's own changelog. */
    try{
      const local = localDeployment();
      if(local) applyDeployedToHome(local);
    }catch(_){}
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

/* THE VERSION NAME IS ALWAYS CONSISTENT — single source of truth.
   /version.json and config.js APP_VERSION are mirrored on every deploy;
   whichever is authoritative right now wins, and if the two disagree we
   show the NEWER one so the home screen, popup and admin panel can never
   display different version names to the same visitor. */
function canonicalVersion(){
  const rv = remoteInfo && remoteInfo.version != null ? String(remoteInfo.version) : '';
  const lv = window.APP_VERSION != null ? String(window.APP_VERSION) : '';
  if(!rv) return lv;
  if(!lv) return rv;
  return vNum(rv) >= vNum(lv) ? rv : lv;
}
function canonicalDate(){
  if(remoteInfo && remoteInfo.date) return String(remoteInfo.date);
  return String(window.RELEASE_DATE || '');
}
/* Changelog that matches the canonical version exactly: when the live
   deployment equals THIS build, our bundled CHANGELOG_LIVE is by
   definition "what's new in this version". */
function canonicalChanges(){
  const cv = canonicalVersion();
  const sameAsThisBuild = cv && window.APP_VERSION != null && String(cv) === String(window.APP_VERSION);
  const remoteChg = remoteInfo && Array.isArray(remoteInfo.changes) ? remoteInfo.changes : [];
  const localChg  = Array.isArray(window.CHANGELOG_LIVE) ? window.CHANGELOG_LIVE : [];
  if(sameAsThisBuild && localChg.length) return localChg;
  if(remoteChg.length) return remoteChg;
  return localChg;
}

/* ---------- surface "latest deployed" on the HOME screen ----------
   The "✨ What's new" tab contains ONLY the rolling deployment history:
   the last MAX_DEPLOYS (5) deployments, newest on top. Nothing else is
   ever shown there. When a NEW deployment arrives it is recorded, added
   at the top, and the OLDEST entry (the last one at the bottom) is
   removed automatically — so the list always stays fresh and never grows
   beyond five deployments. */

/* Load / save the rolling history (newest first) from localStorage. */
function loadDeploys(){
  try{
    const raw = JSON.parse(localStorage.getItem(DEPLOYS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  }catch(e){ return []; }
}
function saveDeploys(list){
  try{ localStorage.setItem(DEPLOYS_KEY, JSON.stringify(list)); }catch(e){}
}

/* The deployment this build itself ships with — used as a fallback when
   /version.json can't be fetched (offline / file://). */
function localDeployment(){
  if(window.APP_VERSION == null) return null;
  return {
    version: String(window.APP_VERSION),
    date: window.RELEASE_DATE || '',
    changes: Array.isArray(window.CHANGELOG_LIVE) ? window.CHANGELOG_LIVE.slice(0, 8) : []
  };
}

/* Merge a deployment into the rolling history: newest on top, deduplicated
   by version, capped at MAX_DEPLOYS — when a NEW one comes in, the OLDEST
   (last) entry is removed automatically. Only deployments we actually know
   about are kept: anything left over from an older app version that isn't
   part of the current release list gets purged, so the tab is always
   rewritten to reflect what's live now. */
function mergeDeployInPlace(hist, entry){
  if(!entry || entry.version == null) return hist;
  const vKey = String(entry.version);
  for(let i = hist.length - 1; i >= 0; i--){
    if(String(hist[i].version) === vKey) hist.splice(i, 1);   /* dedupe */
  }
  hist.unshift({                       /* brand-new deployment goes on top */
    version: vKey,
    date: entry.date || '',
    changes: Array.isArray(entry.changes) ? entry.changes.slice(0, 8) : []
  });
  return hist;
}

function recordDeployment(j){
  /* Rolling window: newest on top, oldest falls off past MAX_DEPLOYS. */
  const hist = loadDeploys();
  const fresh = [];
  if(j && j.version != null) fresh.push(j);
  const local = localDeployment();
  if(local) fresh.push(local);
  /* only deployments newer than everything we already know are recorded —
     an old cached tab must never re-add its own stale version on top of a
     newer deployment that's already in the list */
  const newest = hist.length ? String(hist[0].version) : null;
  const isNewer = v => newest == null || vNum(v) > vNum(newest);
  fresh.filter(e => isNewer(e.version))
       .sort((a,b) => vNum(b.version) - vNum(a.version))   /* newest first */
       .forEach(e => mergeDeployInPlace(hist, e));
  while(hist.length > MAX_DEPLOYS) hist.pop();             /* drop the last one */
  saveDeploys(hist);
  return hist;
}

/* Render one deployment group exactly like the static markup used to be,
   but generated live so it is ALWAYS up to date. Newest = 🆕 label. */
function deployGroupHtml(d, isNewest){
  const items = (Array.isArray(d.changes) ? d.changes : []).map(t =>
    '<div class="hcl-item' + (isNewest ? ' hcl-live' : '') + '">' +
      '<span class="hcl-ico">' + (isNewest ? '🚀' : '✦') + '</span><span>' + E(t) + '</span>' +
    '</div>'
  ).join('');
  /* The newest group is titled with the CANONICAL version name — the very
     same string used in the badge, the popup and the admin panel — so the
     home screen always shows one consistent version. */
  const title = isNewest
    ? '🆕 New in HD ' + E(canonicalVersion() || d.version) +
      (canonicalDate() ? ' (deployed on ' + E(prettyDate(canonicalDate())) + ')' : '')
    : 'HD ' + E(d.version) + (d.date ? ' · deployed on ' + E(prettyDate(d.date)) : '');
  return '<div class="hcl-group">' +
           '<div class="hcl-group-title">' + title + '</div>' +
           '<div class="hcl-list">' + (items || '<div class="hcl-item"><span class="hcl-ico">✦</span><span>Fresh content deployed.</span></div>') + '</div>' +
         '</div>';
}

function renderDeploys(hist){
  const wrap = document.getElementById('hclDeploys');
  if(!wrap) return;
  /* Pin the newest group's text to the canonical changelog for THIS build
     whenever the live deployment matches it — guarantees "What's new"
     always describes the exact version shown on the home screen. */
  const cv = canonicalVersion();
  if(cv && hist.length && String(hist[0].version) === String(cv)){
    hist[0] = Object.assign({}, hist[0], {
      date: canonicalDate() || hist[0].date,
      changes: canonicalChanges().slice(0, 8)
    });
  }
  wrap.innerHTML = hist.map((d, i) => deployGroupHtml(d, i === 0)).join('');
}

function applyDeployedToHome(j){
  const head = document.getElementById('homeChangelogHead');
  const cv = canonicalVersion();
  const cd = canonicalDate();
  if(head){
    head.setAttribute('data-deployed', 'v' + cv);
    if(cd) head.setAttribute('data-date', cd);
  }
  const badge = document.querySelector('#homeChangelog .hcl-badge');
  if(badge){
    /* Home shows WHAT'S NEW; badge names the new deployment once.
       Always the SAME version name as everywhere else in the app. */
    badge.textContent = 'HD' + cv + ' Version upgraded';
    badge.title = 'Latest deployed version' + (cd ? ' · ' + cd : '');
  }
  /* Rebuild the whole tab from the rolling history (max 5 deployments). */
  renderDeploys(recordDeployment(j));
}

/* ---------- surface "latest deployed" in the ADMIN panel ---------- */
function applyDeployedToAdmin(j){
  const box = document.getElementById('adminDeployedBox');
  if(!box) return;
  /* Same canonical version name as the home screen — one truth everywhere. */
  const cv = canonicalVersion();
  const cd = canonicalDate();
  const localTxt = 'This admin console build: ' + versionLabel(window.APP_VERSION || '?');
  const rows = canonicalChanges().slice(0, 3)
    .map(t => '<div class="adb-item">🚀 ' + E(t) + '</div>').join('');
  box.innerHTML =
    '<div class="adb-main">' +
      '<span class="adb-badge">' + versionLabel(cv) + '</span>' +
      '<span class="adb-text">Latest deployed' + (cd ? ' · ' + E(cd) : '') + '</span>' +
    '</div>' +
    '<div class="adb-local">' + E(localTxt) + '</div>' +
    (rows ? '<div class="adb-list">' + rows + '</div>' : '');
  box.style.display = '';
}

/* ---------- auto-refresh when the tab comes back to life ---------- */
/* 🏠 HOME SCREEN ALWAYS SHOWS THE VERSION NAME — painted instantly from
   this build's own constants (APP_VERSION / RELEASE_DATE / CHANGELOG_LIVE,
   which are mirrored 1:1 with /version.json on every deploy). Without
   this, a visitor opening the site offline — or before the first
   version.json response lands — would see an empty "✨ What's new" tab.
   When the live check later confirms a newer deployment, the canonical
   renderer re-paints the very same UI with the deployed values, so the
   version name shown is always one consistent string everywhere. */
function paintHomeAlways(){
  try{
    const local = localDeployment();
    if(local) applyDeployedToHome(local);
  }catch(e){}
}
document.addEventListener('DOMContentLoaded', paintHomeAlways);
if(document.readyState !== 'loading') paintHomeAlways();

/* ⚡ PERF: focus + visibilitychange fire together on every alt-tab, and the
   old code did a fresh no-store fetch each time (double network hit). Now a
   single debounced check with a 10 s cooldown. */
let lastCheckAt = 0;
let pendingCheckT = null;
function scheduleCheck(){
  const now = Date.now();
  if(now - lastCheckAt < 10000) return;            /* already checked recently */
  if(pendingCheckT) return;                        /* one queued is enough */
  pendingCheckT = setTimeout(() => {
    pendingCheckT = null;
    lastCheckAt = Date.now();
    checkForUpdate(false);
  }, 800);
}
function attachVisibilityRefresh(){
  if(listenersOn) return;
  listenersOn = true;
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible'){
      /* returning after a long absence → make sure we're on the latest deploy */
      scheduleCheck();
    }
  });
  window.addEventListener('focus', scheduleCheck);
}

/* One-time cleanup: the very first time the rolling system runs in a
   browser, wipe whatever legacy static markup might still be cached in
   #hclDeploys — from then on this tab is generated ONLY from deployment
   records (max 5). */
function seedOnce(){
  try{
    if(localStorage.getItem(DEPLOYS_KEY + '_seeded')) return false;
    localStorage.setItem(DEPLOYS_KEY + '_seeded', '1');
    return true;
  }catch(e){ return true; }
}

/* ---------- kick off ---------- */
function start(){
  /* Paint the rolling deployment history immediately (from localStorage)
     so the "What's new" tab is never empty while we fetch version.json. */
  const seeded = seedOnce();
  renderDeploys(seeded ? [] : loadDeploys());
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
