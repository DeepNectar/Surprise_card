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
     (403 RLS policy missing, 400 column pin_hash/otp_list not in schema …) */
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
   ensure_sync_schema() RPC (re-adds people.pin_* / otp_list and fires
   NOTIFY pgrst,'reload schema'), wait for the cache to reload, then retry
   the write once — so the "⚠️ PATCH 400 — Could not find the 'otp_list'
   column" pill heals itself without anyone opening the SQL editor.
   Only if that whole recovery fails do we drop the item with a notice. */
function isSchemaCacheMiss(detail){
  return /schema cache/i.test(String(detail || ''));
}
function extractMissingColumn(detail){
  const m = String(detail || '').match(/find the '([A-Za-z0-9_]+)' column/i);
  return m ? m[1] : null;
}
/* People PATCHes that mention a column the API can't see yet must be dropped
   silently-ish: OTP mirrors are device-local-capable (hd1.js guards new ones;
   this cleans up anything already sitting in old queues). */
function isHealableSchemaDrop(item, detail){
  if(!isSchemaCacheMiss(detail)) return false;
  const col = extractMissingColumn(detail);
  if(item.table === 'people' && (!col || ['otp_list','pin_hash','pin_salt','pin_plain'].indexOf(col) >= 0)) return true;
  return false;
}

let _schemaHealAt = 0;           /* one heal attempt per minute max */
async function healSchemaCache(){
  if(Date.now() - _schemaHealAt < 60000) return false;
  _schemaHealAt = Date.now();
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
    await new Promise(res => setTimeout(res, 2000)); /* let pgrst re-read */
    return true;
  }catch(e){ return false; }
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

window.lcFlushOffline = async function(manual){
  if(flushing) return;
  flushing = true;
  try{
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
             "PATCH 400 — otp_list not in schema cache" state. */
          if(isSchemaCacheMiss(e.message)){
            const healed = await healSchemaCache();
            if(healed){
              try{
                await sendNow(item);
                await remove(item.qid);
                sent++;
                continue;
              }catch(e2){ /* still broken → fall through to drop/notice */ }
            }
          }
          console.warn('[sync] dropping permanently-failed write:', item.table, e.message);
          await dropItem(item, e.message);
          dropped++;
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
  const item = {
    table, body,
    method: opts.method || 'POST',
    filter: opts.filter || '',
    at: Date.now()
  };
  if(navigator.onLine){
    try{
      await sendNow(item);
      return true; /* direct success — nothing queued */
    }catch(e){
      /* Schema-cache miss → heal + one immediate retry, so OTP/PIN mirrors
         reach the cloud (and no stale queue entry is ever created). */
      if(isSchemaCacheMiss(e.message)){
        try{
          if(await healSchemaCache()){
            await sendNow(item);
            return true;
          }
        }catch(e2){}
      }
      /* fall through → queue it */
    }
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
      /* queue is empty but some writes were rejected by the server — be honest */
      pill.textContent = '⚠️ ' + droppedInfo.reason.slice(0, 90);
      pill.title = 'Some changes could not reach the cloud: ' + droppedInfo.reason;
      pill.classList.remove('ok');
      pill.classList.add('show');
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

})();
