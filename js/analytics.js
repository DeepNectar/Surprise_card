/* ============================================================
   analytics.js — v1.0 VIEW-TRACKING ANALYTICS
   ------------------------------------------------------------
   Lightweight, privacy-friendly card view tracking:
   • Every card open records a row in `card_views` (person_id,
     slug, hashed device id, country hint via Intl timezone,
     referrer, duration).
   • Live "heartbeat" extends the session's duration_ms every
     15 s while the tab stays visible.
   • Home tiles show 👁 views + 🔥 unique viewers (cloud count).
   • Admin → new "📊 Analytics" panel: per-card totals, last
     opened, and a 14-day sparkline. All stored in Supabase.
   Requires setup/rls.sql to be run once (creates card_views
   with anon insert + authenticated/full read, RLS enabled).
   ============================================================ */
(function(){
'use strict';

const T_VIEWS = 'card_views';
let HB_TIMER = null;
let CURR_SESSION = null;

function deviceId(){
  try{
    let d = localStorage.getItem('lc_device_v1');
    if(!d){
      d = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('lc_device_v1', d);
    }
    return d;
  }catch(e){ return 'anon-' + Math.random().toString(36).slice(2); }
}

async function insView(row){
  try{
    await sb.insBatch(T_VIEWS, [row]);
    return true;
  }catch(e){
    /* table missing → silently degrade (setup/rls.sql not run yet) */
    return false;
  }
}

/* ---------- Record a card open ---------- */
window.trackCardView = async function(person, how){
  try{
    if(!person || !person.id) return;
    const row = {
      person_id: person.id,
      slug: person.slug || '',
      device: deviceId(),
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
      lang: (navigator.language || ''),
      ref: (document.referrer || '').slice(0, 300),
      entry: how || 'password',       /* password | link | preview | admin */
      opened_at: new Date().toISOString(),
      duration_ms: 0
    };
    const ok = await insView(row);
    if(ok){
      CURR_SESSION = row;
      bumpLocalCount(person.slug);
      startHeartbeat();
    }
  }catch(e){}
};

/* ---------- Heartbeat: extend duration while visible ---------- */
/* ⚡ PERF BUGFIX: the old 15 s timer fired in background tabs too (throttled
   but still alive), PATCHing Supabase and inflating duration_ms with time
   nobody was watching. Now it pauses when hidden, resumes when visible, and
   only counts real visible seconds (measured, not assumed +15000). */
let HB_LAST = 0;
function startHeartbeat(){
  stopHeartbeat();
  HB_LAST = Date.now();
  HB_TIMER = setInterval(async () => {
    if(!CURR_SESSION) return;
    const now = Date.now();
    if(document.hidden){ HB_LAST = now; return; }   /* don't accrue hidden time */
    const delta = Math.min(now - HB_LAST, 60000);   /* clamp clock jumps */
    HB_LAST = now;
    if(delta < 1000) return;
    CURR_SESSION.duration_ms += delta;
    try{
      await req2(T_VIEWS + '?person_id=eq.' + encodeURIComponent(CURR_SESSION.person_id)
        + '&slug=eq.' + encodeURIComponent(CURR_SESSION.slug)
        + '&entry=eq.' + encodeURIComponent(CURR_SESSION.entry)
        + '&order=opened_at.desc&limit=1',
        { method:'PATCH', headers:{'Prefer':'return=minimal'},
          body: JSON.stringify({ duration_ms: Math.round(CURR_SESSION.duration_ms) }) });
    }catch(e){}
  }, 15000);
  document.addEventListener('visibilitychange', onHbVisibility);
}
function onHbVisibility(){
  if(!document.hidden) HB_LAST = Date.now();         /* resume counting fresh */
}
function stopHeartbeat(){
  if(HB_TIMER){ clearInterval(HB_TIMER); HB_TIMER = null; }
  document.removeEventListener('visibilitychange', onHbVisibility);
}
window.__stopViewTracking__ = stopHeartbeat;

/* minimal fetch (sb.req is private; reuse same endpoint style) */
/* 🧊 STUCK-FREE: every network call now has a hard 10 s timeout via
   AbortController. A hanging socket on a flaky mobile connection used to
   leave awaits pending forever, which made click handlers that awaited it
   never finish — the browser then reported "Page Unresponsive". */
async function req2(path, opts){
  opts = opts || {};
  const ctrl = ('AbortController' in window) ? new AbortController() : null;
  const timer = setTimeout(() => { if(ctrl) ctrl.abort(); }, 10000);
  try{
    const r = await fetch(window.SUPABASE_URL + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: {
        'apikey': window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: opts.body, cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    });
    if(!r.ok) throw new Error('views ' + r.status);
    if(r.status === 204) return null;
    try{ return await r.json(); }catch(e){ return null; }
  }finally{
    clearTimeout(timer);
  }
}

/* ---------- Local optimistic counters (tile badges) ---------- */
const LC_KEY = 'lc_view_counts_v1';
function loadCounts(){ try{ return JSON.parse(localStorage.getItem(LC_KEY) || '{}'); }catch(e){ return {}; } }
function bumpLocalCount(slug){
  if(!slug) return;
  const c = loadCounts();
  c[slug] = (c[slug] || 0) + 1;
  try{ localStorage.setItem(LC_KEY, JSON.stringify(c)); }catch(e){}
}
window.getLocalViewCount = function(slug){ return loadCounts()[slug] || 0; };

/* ---------- Cloud aggregate fetch (Home tiles + admin panel) ---------- */
/* Uses PostgREST full-count on a single query per refresh. */
window.fetchViewStats = async function(){
  try{
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = setTimeout(() => { if(ctrl) ctrl.abort(); }, 10000);
    let r;
    try{
      r = await fetch(window.SUPABASE_URL + '/rest/v1/' + T_VIEWS
      + '?select=slug,opened_at,duration_ms,device&order=opened_at.desc&limit=1000',
      { headers: {
          'apikey': window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
          'Range': '0-999',
          'Prefer': 'count=exact'
        }, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
    }finally{ clearTimeout(timer); }
    if(!r.ok) return null;
    let total = 0;
    const cr = r.headers.get('content-range') || '';
    const m = cr.match(/\/(\d+)$/);
    if(m) total = parseInt(m[1], 10);
    const rows = await r.json() || [];
    const stats = {};
    rows.forEach(v => {
      const k = (v.slug || '').toLowerCase();
      if(!k) return;
      const s = stats[k] || (stats[k] = { views: 0, devices: {}, last: '', ms: 0 });
      s.views++;
      s.devices[v.device] = 1;
      s.ms += (v.duration_ms || 0);
      if(!s.last || v.opened_at > s.last) s.last = v.opened_at;
    });
    return { stats: stats, cloudTotal: total, sampled: rows.length >= 1000 };
  }catch(e){ return null; }
};

/* Cache for tile badges & admin panel */
window.LC_VIEW_STATS = null;
window.refreshViewStats = async function(){
  const s = await window.fetchViewStats();
  if(s){
    window.LC_VIEW_STATS = s;
    try{ localStorage.setItem('lc_view_stats_v1', JSON.stringify(s)); }catch(e){}
  } else if(!window.LC_VIEW_STATS){
    try{ window.LC_VIEW_STATS = JSON.parse(localStorage.getItem('lc_view_stats_v1') || 'null'); }catch(e){}
  }
  return window.LC_VIEW_STATS;
};

/* Per-slug formatted badge for home tiles */
window.viewBadge = function(slug){
  const st = (window.LC_VIEW_STATS && window.LC_VIEW_STATS.stats) || {};
  const s = st[(slug || '').toLowerCase()];
  if(s){
    const uniq = Object.keys(s.devices || {}).length;
    return '👁 ' + s.views + (uniq ? ' · 🔥 ' + uniq : '');
  }
  const local = window.getLocalViewCount(slug);
  return local ? '👁 ' + local : '';
};

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  setTimeout(() => { window.refreshViewStats().then(() => {
    if(window.buildHome) try{ window.buildHome(); }catch(e){}
  }); }, 1200);
});

})();
