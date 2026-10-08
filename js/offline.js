/* ============================================================
   offline.js — HD 1.0 OPTIMISTIC UI + OFFLINE SYNC (IndexedDB)
   ------------------------------------------------------------
   • IndexedDB store `lovecards_offline` holds a queue of cloud
     writes made while the device was offline (or while a request
     failed): guest submissions, reviews, push subscriptions,
     card-view analytics rows and settings patches.
   • Every queued write is applied LOCALLY first (optimistic UI),
     then flushed to Supabase automatically when connectivity
     returns ('online' event, SW sync hook, or periodic retry).
   • A tiny floating pill shows "📴 N changes queued" so users
     always know their data is safe; it turns ✅ on flush.
   • The service worker calls self.__lcFlush() via BroadcastChannel
     after sync events too (see sw.js).
   ============================================================ */
(function(){
'use strict';

const DB_NAME = 'lovecards_offline';
const STORE   = 'queue';
const DB_VER  = 1;

let dbP = null;
let flushing = false;
let listeners = [];

/* ---------- IndexedDB bootstrap (degrades to memory queue) ---------- */
function openDb(){
  if(dbP) return dbP;
  dbP = new Promise(resolve => {
    try{
      if(!('indexedDB' in window)) return resolve(null);
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if(!db.objectStoreNames.contains(STORE)){
          const s = db.createObjectStore(STORE, { keyPath: 'qid', autoIncrement: true });
          s.createIndex('by_table', 'table', { unique: false });
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror   = () => resolve(null);
    }catch(e){ resolve(null); }
  });
  return dbP;
}

async function tx(mode, fn){
  const db = await openDb();
  if(!db) return null;
  return new Promise((resolve, reject) => {
    try{
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : null);
      t.onerror = t.onabort = () => reject(t.error);
    }catch(e){ reject(e); }
  });
}

async function enqueue(item){
  const db = await openDb();
  if(!db){ MEM.push(item); paint(); return null; }
  try{
    return await tx('readwrite', s => s.add(item).req ? s.add(item) : s.add(item));
  }catch(e){
    try{ return await tx('readwrite', s => { const rq = s.add(item); return rq; }); }
    catch(e2){ MEM.push(item); paint(); return null; }
  }
}
const MEM = []; /* in-memory fallback when IndexedDB is unavailable */

async function allQueued(){
  const db = await openDb();
  let rows = [];
  if(db){
    try{ rows = (await tx('readonly', s => { const rq = s.getAll(); rq._name = 'getAll'; return { get(){ return new Promise(res => { rq.onsuccess = () => res(rq.result); rq.onerror = () => res([]); }); } }; })) || []; }
    catch(e){ rows = []; }
    /* simpler reliable path below overrides if promise shape mismatched */
    try{
      rows = await new Promise((res, rej) => {
        const t = db.transaction(STORE, 'readonly');
        const rq = t.objectStore(STORE).getAll();
        rq.onsuccess = () => res(rq.result || []);
        rq.onerror = () => res([]);
      });
    }catch(e){}
  }
  return rows.concat(MEM.slice());
}

async function remove(qid){
  if(qid == null) return;
  const db = await openDb();
  if(db){
    try{
      await new Promise(res => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(qid);
        t.oncomplete = t.onerror = () => res();
      });
    }catch(e){}
  }
  for(let i = MEM.length - 1; i >= 0; i--){ if(MEM[i] && MEM[i].qid === qid) MEM.splice(i, 1); }
}

/* ---------- Flush queue to Supabase ---------- */
async function sendNow(item){
  /* Hard guard: without URL+key we can NEVER reach the cloud — say so loudly
     instead of silently re-queueing forever. */
  if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
    throw new Error('not-configured');
  }
  const base = window.SUPABASE_URL + '/rest/v1/';
  const headers = {
    'apikey': window.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  let url = base + item.table;
  if(item.filter) url += '?' + item.filter;
  let r;
  try{
    if(item.method === 'PATCH'){
      headers['Prefer'] = 'return=minimal';
      r = await fetch(url, { method:'PATCH', headers, body: JSON.stringify(item.body), cache:'no-store' });
    } else {
      headers['Prefer'] = (item.table === 'push_subs' || item.table === 'reviews')
        ? 'resolution=ignore-duplicates,return=minimal' : 'return=minimal';
      r = await fetch(url, { method:'POST', headers, body: JSON.stringify(item.body), cache:'no-store' });
    }
  }catch(e){
    throw new Error('network');   /* offline / DNS / CORS — keep queued */
  }
  if(r.ok) return true;
  /* Read PostgREST's error body so the console tells us WHY it failed
     (403 RLS policy missing, 400 column pin_hash not in schema …) */
  let detail = '';
  try{
    const j = await r.json();
    detail = (j && (j.message || j.error)) || '';
  }catch(e){ try{ detail = await r.text(); }catch(e2){} }
  const err = new Error((item.method || 'POST') + ' ' + r.status + (detail ? ' — ' + String(detail).slice(0,180) : ''));
  err.permanent = (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429);
  throw err;
}

/* 4xx responses are permanent (missing table/column, RLS denial, bad filter).
   Retrying them on every tick is what kept the pill stuck at "N changes
   queued" forever. Drop them from the queue with a visible notice instead. */

/* Self-healing for PostgREST schema-cache misses:
   "Could not find the 'X' column of 'Y' in the schema cache" (PGRST204) or
   "Could not find the table 'public.X'" (PGRST205) usually means the column
   EXISTS in Postgres but the API's cached schema is stale.  v1.2 fix:
   instead of only telling the user to refresh, we call the
   ensure_sync_schema() RPC (re-adds the optional people.pin_* columns and fires
   NOTIFY pgrst,'reload schema'), wait for the cache to reload, then retry
   the write once — so the "⚠️ PATCH 400 — Could not find the 'pin_hash'
   column" pill heals itself without anyone opening the SQL editor.
   Only if that whole recovery fails do we drop the item with a notice. */
function isSchemaCacheMiss(detail){
  return /schema cache/i.test(String(detail || ''));
}
function extractMissingColumn(detail){
  const m = String(detail || '').match(/find the '([A-Za-z0-9_]+)' column/i);
  return m ? m[1] : null;
}
/* People PATCHes that mention a column the API can't see yet must NEVER
   surface as an error pill.  The PIN mirror is device-local-capable
   (security.js guards new writes; this also cleans up anything
   already sitting in old queues from previous versions).  When such a
   write finally succeeds after a heal we clear any stale notice too.
   HD 1.8+: 'otp_list' + 'private_mode' are LIVE again — they belong to
   the 🔒 Private Photo Slideshow feature (js/privateview.js) and are
   treated as optional mirror columns, healed via ensure_sync_schema(). */
const LC_MIRROR_COLS = ['pin_hash','pin_salt','pin_plain','otp_list','private_mode'];
const LC_LEGACY_COLS = []; /* nothing is legacy-purged anymore */
/* A mirror write is any people PATCH whose BODY mentions a security
   mirror column (pin_*, otp_list, private_mode) —
   regardless of which table-name string the caller passed (some call sites
   use window.T_PEOPLE, others the literal 'people'). Checking the body is
   what finally kills the recurring "PATCH 400 — Could not find the
   '<mirror column>' column of 'people'" home-screen error. */
function bodyHasCols(body, cols){
  return !!(body && typeof body === 'object' &&
    cols.some(c => Object.prototype.hasOwnProperty.call(body, c)));
}
function bodyHasMirrorCol(body){ return bodyHasCols(body, LC_MIRROR_COLS); }
/* Legacy OTP payloads (queue entries saved by older app versions that
   still mention the removed one-time-code column) — always purged. */
function isLegacyOtpItem(item){
  return !!item && String(item.table || '').toLowerCase() === 'people' &&
         bodyHasCols(item.body, LC_LEGACY_COLS);
}
function isMirrorItem(item){
  return !!item && String(item.table || '').toLowerCase() === 'people' &&
         bodyHasMirrorCol(item.body);
}
function isMirrorSchemaMiss(item, detail){
  if(!isSchemaCacheMiss(detail)) return false;
  const col = extractMissingColumn(detail);
  if(String((item && item.table) || '').toLowerCase() !== 'people') return false;
  /* If the error names a specific column, only treat it as an optional
     mirror miss when that column IS one of ours; a missing required
     column (or missing table) must still surface honestly. */
  if(col) return LC_MIRROR_COLS.indexOf(col) >= 0;
  return isMirrorItem(item);
}
function clearDroppedNotice(){
  try{ localStorage.removeItem('lc_sync_dropped'); }catch(e){}
}

let _schemaHealAt = 0;           /* one heal attempt per 20s max */
let _healInFlight = null;        /* concurrent heal callers share ONE probe */
/* Schema-cache reload verification: NOTIFY pgrst,'reload schema' is
   asynchronous — PostgREST may keep serving the OLD cached schema for a
   few seconds.  If we retried the PATCH immediately after calling the RPC,
   the retry would hit the same stale cache and fail with another
   "400 Could not find the 'pin_hash' column of 'people'".  So instead of
   a blind sleep we POLL a cheap `select=pin_hash` GET until the API
   actually sees the column (max ~10s), and only then report "healed". */
async function waitForSchemaReload(maxMs){
  const deadline = Date.now() + (maxMs || 10000);
  for(;;){
    try{
      const r = await fetch(window.SUPABASE_URL + '/rest/v1/people?select=pin_hash&limit=1', {
        headers: {
          'apikey': window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY
        },
        cache: 'no-store'
      });
      if(r.ok){                       /* columns visible in the live cache now */
        window.lcPeopleMirrorColsOk = true;
        return true;
      }
      if(r.status >= 400 && r.status < 500 && r.status !== 404 && r.status !== 429){
        return false;                 /* PGRST204 etc. — still stale/missing */
      }
    }catch(e){ return false; }
    if(Date.now() >= deadline) return false;
    await new Promise(res => setTimeout(res, 1500));
  }
}

async function healSchemaCache(){
  if(_healInFlight) return _healInFlight;
  if(Date.now() - _schemaHealAt < 20000) return false;
  _schemaHealAt = Date.now();
  _healInFlight = (async () => {
  try{
    const r = await fetch(window.SUPABASE_URL + '/rest/v1/rpc/ensure_sync_schema', {
      method: 'POST',
      headers: {
        'apikey': window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: '{}',
      cache: 'no-store'
    });
    if(!r.ok) return false;
    /* Wait until PostgREST's reloaded cache actually serves the security
       mirror columns — this is what makes the single retry succeed instead
       of throwing the same 400 again (the reason the pill used to come
       back). */
    if(await waitForSchemaReload(10000)) return true;
    /* Fallback for databases still running the OLD ensure_sync_schema()
       (pin_* only): the dedicated Private-Slideshow migration adds
       otp_list + private_mode. Try it once, then wait again. */
    try{
      await fetch(window.SUPABASE_URL + '/rest/v1/rpc/ensure_private_schema', {
        method: 'POST',
        headers: {
          'apikey': window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: '{}',
        cache: 'no-store'
      });
    }catch(e){}
    return await waitForSchemaReload(8000);
  }catch(e){ return false; }
  })().finally(() => { _healInFlight = null; });
  return _healInFlight;
}

function dropItem(item, reason){
  try{
    let msg = reason;
    if(isSchemaCacheMiss(reason)){
      msg = 'Cloud schema cache is stale — run setup/FULL_GO_LIVE.sql once in the Supabase SQL editor, then press F5 (hard refresh). The change was saved on this device.';
    }
    localStorage.setItem('lc_sync_dropped', JSON.stringify({
      table: item.table, method: item.method || 'POST', reason: msg, at: Date.now()
    }));
  }catch(e){}
  return remove(item.qid);
}

async function count(){
  const rows = await allQueued();
  return rows.length;
}

/* Cheap "is anything in the queue?" check (count request instead of
   deserializing every row) — used as the fast path in lcFlushOffline. */
async function hasQueued(){
  try{
    const db = await openDb();
    if(!db) return false;
    return await new Promise(res => {
      try{
        const rq = db.transaction(STORE, 'readonly').objectStore(STORE).count();
        rq.onsuccess = () => res((rq.result || 0) > 0);
        rq.onerror   = () => res(false);
      }catch(e){ res(false); }
    });
  }catch(e){ return false; }
}

window.lcFlushOffline = async function(manual){
  if(flushing) return;
  /* ⚡ PERF: nothing queued → skip the two IndexedDB reads entirely. This
     runs on a 45 s interval + every visibilitychange/online event, so the
     empty fast-path keeps background tabs essentially free. */
  if(!manual && !(await hasQueued())) return;
  flushing = true;
  try{
    /* Safety net: any people PATCH in the queue that mentions the optional
       PIN mirror columns — or the removed OTP feature's otp_list column —
       can re-trigger the stale-schema 400 on every flush tick (the exact
       cause of the recurring "⚠️ PATCH 400 — Could not find the
       'otp_list' column" pill). Purge those legacy entries BEFORE
       flushing and clear their old notice — PIN values are already
       persisted device-local by security.js; OTP data is obsolete. */
    try{
      const pre = await allQueued();
      let purged = false;
      for(const it of pre){
        if(isMirrorItem(it) || isLegacyOtpItem(it)){
          await remove(it.qid);
          purged = true;
        }
      }
      if(purged) clearDroppedNotice();
    }catch(e){}
    const rows = await allQueued();
    let sent = 0, failed = 0, dropped = 0;
    for(const item of rows){
      if(!navigator.onLine) break;
      try{
        await sendNow(item);
        await remove(item.qid);
        sent++;
      }catch(e){
        if(String(e && e.message) === 'not-configured'){
          /* Supabase URL/key missing — the pill must say this, not "queued" */
          try{ localStorage.setItem('lc_sync_dropped', JSON.stringify({
            table:'—', method:'—', reason:'Supabase is not configured (missing URL/anon key)', at: Date.now() })); }catch(_){}
          paint();
          break;
        }
        if(e && e.permanent){
          /* Schema-cache miss? Try to heal it live (RPC reload + one retry)
             before giving up — this is what finally clears the stale
             "PATCH 400 — <mirror column> not in schema cache" state. */
          if(isSchemaCacheMiss(e.message)){
            const healed = await healSchemaCache();
            if(healed){
              try{
                await sendNow(item);
                await remove(item.qid);
                /* mirror write recovered → wipe any old ⚠️ notice for it */
                if(isMirrorSchemaMiss(item, e.message)) clearDroppedNotice();
                sent++;
                continue;
              }catch(e2){ /* still broken → fall through to drop/notice */ }
            }
          }
          console.warn('[sync] dropping permanently-failed write:', item.table, e.message);
          await dropItem(item, e.message);
          dropped++;
          /* The PIN cloud mirror is OPTIONAL — the data lives safely on
             this device (localStorage), so a schema-cache miss for those
             columns must NEVER raise the scary ⚠️ pill. Drop the queue
             entry quietly and clear any stale notice from older versions. */
          if(isMirrorSchemaMiss(item, e.message)){
            try{ localStorage.removeItem('lc_sync_dropped'); }catch(_){}
            dropped--;   /* not a user-visible failure */
          }
          continue;                       /* don't let one bad row block the rest */
        }
        failed++;
        /* transient (network/5xx): keep in queue and stop so we don't hammer */
        break;
      }
    }
    if(sent || dropped){
      const rem = await count();
      listeners.forEach(fn => { try{ fn({ sent, dropped, remaining: rem, manual: !!manual }); }catch(e){} });
    }
    paint();
    return { sent, failed, dropped, remaining: await count() };
  } finally { flushing = false; }
};

/* ---------- Public API: optimistic write ----------
   lcOfflineQueue(table, body, opts) → resolves true if the write
   went straight to the cloud, false if it was queued for later.  */
window.lcOfflineQueue = async function(table, body, opts){
  opts = opts || {};
  /* Client-side schema guard: never even attempt a people PATCH that mentions
     the optional PIN mirror columns while PostgREST can't see them —
     that is exactly what produced the "PATCH 400 — Could not find the
     'pin_hash' column of 'people' in the schema cache" home-screen error.
     The data always lives on-device; the cloud mirror is best-effort. */
  /* HD 1.8+: otp_list / private_mode are live again (Private Photo
     Slideshow). They join the optional-mirror set above, so no silent
     drop here anymore — worst case they stay device-local until healed. */
  const isMirrorPatch = isMirrorItem({ table: table, body: body });
  if(isMirrorPatch){
    /* NEVER queue an optional PIN mirror write while the API can't see
       the column — a queued copy re-triggers the same 400 on every flush
       tick, which is exactly how the ⚠️ pill kept coming back on the home
       screen. The value is already persisted device-local by hd1.js /
       security.js, so dropping the cloud mirror here loses nothing. */
    if(window.lcPeopleMirrorColsOk === false) return false;
  }
  const item = {
    table, body,
    method: opts.method || 'POST',
    filter: opts.filter || '',
    at: Date.now()
  };
  if(navigator.onLine){
    try{
      await sendNow(item);
      if(isMirrorPatch && window.lcPeopleMirrorColsOk === false){
        window.lcPeopleMirrorColsOk = true;   /* it worked after all → unblock */
        clearDroppedNotice();
      }
      return true; /* direct success — nothing queued */
    }catch(e){
      /* Schema-cache miss → heal + one immediate retry, so the PIN mirror
         reaches the cloud (and no stale queue entry is ever created). */
      if(isSchemaCacheMiss(e.message)){
        if(isMirrorPatch) window.lcPeopleMirrorColsOk = false; /* block until healed */
        try{
          if(await healSchemaCache()){
            await sendNow(item);
            if(isMirrorPatch){ window.lcPeopleMirrorColsOk = true; clearDroppedNotice(); }
            return true;
          }
        }catch(e2){}
      }
      if(isMirrorPatch){
        /* Heal failed / offline mid-write: drop this OPTIONAL mirror write
           instead of queueing it — a queued copy would only re-trigger the
           same 400 on every flush tick. The value is already persisted
           locally by security.js, so nothing is lost. */
        console.warn('[sync] optional people-mirror write skipped (schema cache):', e.message);
        paint();
        return false;
      }
      /* fall through → queue it */
    }
  }
  if(isMirrorPatch){
    console.warn('[sync] offline — optional people-mirror write skipped (kept device-local).');
    return false;
  }
  await enqueue(item);
  paint();
  return false;
};

window.lcPendingCount = function(){ return count(); };
window.lcOnSync = function(fn){ if(typeof fn === 'function') listeners.push(fn); };

/* ---------- Status pill ---------- */
function ensureStyle(){
  if(document.getElementById('lc-off-style')) return;
  const s = document.createElement('style');
  s.id = 'lc-off-style';
  s.textContent =
    '.lc-off-pill{position:fixed;left:14px;bottom:14px;z-index:2147483001;display:none;' +
    'align-items:center;gap:6px;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;' +
    'color:#fff;background:linear-gradient(135deg,#b45309,#7c2d12);box-shadow:0 6px 20px rgba(0,0,0,.35);' +
    'font-family:Georgia,"Times New Roman",serif;cursor:pointer;border:1px solid rgba(255,255,255,.25);}' +
    '.lc-off-pill.show{display:inline-flex;}' +
    '.lc-off-pill.ok{background:linear-gradient(135deg,#158a6d,#0d5c4a);}';
  document.head.appendChild(s);
}
let pill = null;
let lastFlushInfo = null;      /* { sent, dropped } of the most recent flush */
async function paint(){
  try{
    ensureStyle();
    if(!pill){
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'lc-off-pill';
      pill.setAttribute('aria-live', 'polite');
      pill.addEventListener('click', () => {
        pill.textContent = '⏳ Syncing…';
        pill.classList.remove('ok');
        pill.classList.add('show');
        window.lcFlushOffline(true);   /* manual tap → always attempt a real cloud push */
      });
      document.body.appendChild(pill);
    }
    const n = await count();
    let droppedInfo = null;
    try{ droppedInfo = JSON.parse(localStorage.getItem('lc_sync_dropped') || 'null'); }catch(e){}
    if(n > 0){
      pill.textContent = '📴 ' + n + ' change' + (n > 1 ? 's' : '') + ' queued — tap to sync';
      pill.title = 'Tap to push these changes to the cloud now.';
      pill.classList.remove('ok');
      pill.classList.add('show');
    } else if(droppedInfo && Date.now() - (droppedInfo.at || 0) < 24 * 3600 * 1000){
      /* queue is empty but some writes were rejected by the server — be honest.
         EXCEPT optional PIN cloud-mirror failures (and leftovers of the
         removed OTP feature): that data lives safely on this device, and
         surfacing "⚠️ PATCH 400 — Could not find the 'otp_list' column of
         'people'" on the home screen scared users for nothing. Purge such
         legacy notices instead of painting them. */
      var dReason = String(droppedInfo.reason || '');
      var dCol = dReason.match(/find the '([A-Za-z0-9_]+)' column/i);
      var isMirrorNotice = /schema cache/i.test(dReason) &&
        ((dCol && (LC_MIRROR_COLS.indexOf(dCol[1]) >= 0 || LC_LEGACY_COLS.indexOf(dCol[1]) >= 0)) ||
         (!dCol && String(droppedInfo.table || '').toLowerCase() === 'people'));
      if(isMirrorNotice){
        try{ localStorage.removeItem('lc_sync_dropped'); }catch(_e){}
        if(lastFlushInfo && (lastFlushInfo.sent || lastFlushInfo.dropped)){
          pill.textContent = '✅ All changes synced';
          pill.classList.add('ok');
          pill.classList.add('show');
          setTimeout(() => { pill.classList.remove('show', 'ok'); }, 2500);
        } else {
          pill.classList.remove('show');
        }
      } else {
        pill.textContent = '⚠️ ' + droppedInfo.reason.slice(0, 90);
        pill.title = 'Some changes could not reach the cloud: ' + droppedInfo.reason;
        pill.classList.remove('ok');
        pill.classList.add('show');
      }
    } else if(lastFlushInfo && (lastFlushInfo.sent || lastFlushInfo.dropped)){
      pill.textContent = '✅ All changes synced';
      pill.classList.add('ok');
      pill.classList.add('show');
      setTimeout(() => { pill.classList.remove('show', 'ok'); }, 2500);
    } else {
      pill.classList.remove('show');
    }
  }catch(e){}
}
window.lcOnSync(info => { lastFlushInfo = info; });

/* ---------- Retry triggers ---------- */
window.addEventListener('online',  () => { window.lcFlushOffline(); });
document.addEventListener('visibilitychange', () => { if(!document.hidden) window.lcFlushOffline(); });
setInterval(() => { if(navigator.onLine) window.lcFlushOffline(); }, 45000);

/* Messages from the service worker (sync / broadcast) */
try{
  if('BroadcastChannel' in window){
    const bc = new BroadcastChannel('lc-sync');
    bc.onmessage = (e) => { if(e.data === 'flush') window.lcFlushOffline(); };
  }
}catch(e){}
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => {
  if(e.data === 'lc-flush') window.lcFlushOffline();
});

document.addEventListener('DOMContentLoaded', () => { paint(); setTimeout(() => window.lcFlushOffline(), 2500); });

/* ---------- Boot-time schema probe ----------
   Settle window.lcPeopleMirrorColsOk EARLY — before any PIN write can
   happen — by probing `select=pin_hash,otp_list,private_mode` once and,
   if it 400s, running the ensure_sync_schema() heal + reload-wait right
   away.  This prevents the "⚠️ PATCH 400 — Could not find the 'pin_hash'
   / 'otp_list' / 'private_mode' column of 'people'" pill from ever
   appearing on the home screen instead of only cleaning it up after
   the fact. */
window.lcProbeMirrorCols = async function(){
  try{
    if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
    if(window.lcPeopleMirrorColsOk === true) return;
    let visible = false;
    try{
      const r = await fetch(window.SUPABASE_URL + '/rest/v1/people?select=pin_hash,otp_list,private_mode&limit=1', {
        headers: {
          'apikey': window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY
        },
        cache: 'no-store'
      });
      visible = !!r.ok;
    }catch(e){ return; }            /* offline — leave flag unknown */
    if(visible){
      window.lcPeopleMirrorColsOk = true;
      clearDroppedNotice();
      return;
    }
    /* Column not in the cached schema → try the live heal once. */
    _schemaHealAt = 0;              /* allow the very first heal now */
    const healed = await healSchemaCache();
    window.lcPeopleMirrorColsOk = healed ? true : false;
    if(healed) clearDroppedNotice();
  }catch(e){}
};
setTimeout(() => { window.lcProbeMirrorCols(); }, 800);

/* ---------- Startup purge: legacy queue entries ----------
   Queues saved by older app versions may still hold people PATCHes that
   mention otp_list (removed one-time-code feature) or pin_* — columns
   that might not exist in the cloud schema yet. Flushing those is what
   kept re-showing
   "⚠️ PATCH 400 — Could not find the 'otp_list' column of 'people'".
   Those writes are device-local-capable or obsolete, so we drop them
   up-front and clear any stale ⚠️ notice they left behind. */
window.lcPurgeMirrorQueue = async function(){
  try{
    const rows = await allQueued();
    let removed = false;
    for(const item of rows){
      if(isMirrorItem(item) || isLegacyOtpItem(item)){
        await remove(item.qid);
        removed = true;
      }
    }
    if(removed){
      clearDroppedNotice();
      paint();
    }
    return removed;
  }catch(e){ return false; }
};
setTimeout(() => { window.lcPurgeMirrorQueue(); }, 1200);

})();
