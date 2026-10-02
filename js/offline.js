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
  const base = window.SUPABASE_URL + '/rest/v1/';
  const headers = {
    'apikey': window.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  };
  if(item.method === 'PATCH'){
    headers['Prefer'] = 'return=minimal';
    const r = await fetch(base + item.table + '?' + item.filter, { method:'PATCH', headers, body: JSON.stringify(item.body) });
    if(!r.ok) throw new Error('PATCH ' + r.status);
    return true;
  }
  headers['Prefer'] = (item.table === 'push_subs' || item.table === 'reviews')
    ? 'resolution=ignore-duplicates,return=minimal' : 'return=minimal';
  const r = await fetch(base + item.table, { method:'POST', headers, body: JSON.stringify(item.body) });
  if(!r.ok) throw new Error('POST ' + r.status);
  return true;
}

window.lcFlushOffline = async function(){
  if(flushing) return;
  flushing = true;
  try{
    const rows = await allQueued();
    let sent = 0, failed = 0;
    for(const item of rows){
      if(!navigator.onLine) break;
      try{
        await sendNow(item);
        await remove(item.qid);
        sent++;
      }catch(e){
        failed++;
        /* keep in queue; stop early so we don't hammer a broken table */
        break;
      }
    }
    if(sent){
      listeners.forEach(fn => { try{ fn({ sent, remaining: (await count()) }); }catch(e){} });
    }
    paint();
    return { sent, failed, remaining: await count() };
  } finally { flushing = false; }
};

async function count(){
  const rows = await allQueued();
  return rows.length;
}

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
    }catch(e){ /* fall through → queue it */ }
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
async function paint(){
  try{
    ensureStyle();
    if(!pill){
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'lc-off-pill';
      pill.setAttribute('aria-live', 'polite');
      pill.addEventListener('click', () => { window.lcFlushOffline(); });
      document.body.appendChild(pill);
    }
    const n = await count();
    if(n > 0){
      pill.textContent = '📴 ' + n + ' change' + (n > 1 ? 's' : '') + ' queued — tap to sync';
      pill.classList.remove('ok');
      pill.classList.add('show');
    } else if(pill.classList.contains('show')){
      pill.textContent = '✅ All changes synced';
      pill.classList.add('ok');
      setTimeout(() => pill.classList.remove('show', 'ok'), 2500);
    } else {
      pill.classList.remove('show');
    }
  }catch(e){}
}

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
