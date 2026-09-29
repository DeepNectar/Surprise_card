/* ============================================================
   supabase.js — REST helpers with atomic upserts (V2.3)
   ============================================================ */
(function(){
'use strict';

const URL = window.SUPABASE_URL;
const KEY = window.SUPABASE_ANON_KEY;
const S   = window.__PAGE_STATE__;

function hdr(extra){
  const h = {
    'apikey': KEY,
    'Authorization': 'Bearer ' + KEY,
    'Content-Type': 'application/json'
  };
  if(extra) Object.assign(h, extra);
  return h;
}

/* Very short timeout budgets so loading never hangs (configurable in config.js). */
const TMO_GET = window.SB_TIMEOUT_GET_MS || 3500;
const TMO_MUT = window.SB_TIMEOUT_MUT_MS || 6000;

async function once(path, opts, ms){
  const ctrl = ('AbortController' in window) ? new AbortController() : null;
  const timer = setTimeout(() => { if(ctrl) ctrl.abort(); }, ms);
  try{
    const r = await fetch(URL + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: hdr(opts.headers),
      body: opts.body,
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    });
    if(!r.ok){
      let t = '';
      try{ t = await r.text(); }catch(e){}
      throw new Error((opts.label || path) + ' ' + r.status + ' ' + (t || '').slice(0, 200));
    }
    if(opts.raw) return r;
    if(r.status === 204) return null;
    try{ return await r.json(); }catch(e){ return null; }
  }catch(err){
    if(err && err.name === 'AbortError'){
      throw new Error((opts.label || path) + ' timed out after ' + ms + 'ms');
    }
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

async function req(path, opts){
  opts = opts || {};
  const isGet = !opts.method || opts.method === 'GET';
  const ms = isGet ? TMO_GET : TMO_MUT;
  try{
    return await once(path, opts, ms);
  }catch(e){
    /* Reads get ONE fast retry — still bounded by the same short budget.
       Writes are never retried automatically (keeps rules exactly as before). */
    if(isGet){
      try{ return await once(path, opts, ms); }catch(e2){ throw e2; }
    }
    throw e;
  }
}

window.sb = {
  h(){ return hdr({'Prefer':'return=representation'}); },
  hd(){ return hdr(); },

  /* ---------- People ---------- */
  async people(){
    try{ return await req(T_PEOPLE + '?select=*&order=sort_order.asc,id.asc'); }
    catch(e){ console.warn('people()', e.message); return []; }
  },
  async insPerson(row){
    return req(T_PEOPLE, {
      method:'POST',
      headers:{'Prefer':'return=representation'},
      body: JSON.stringify(row),
      label:'insert person'
    });
  },
  async updPerson(id, patch){
    return req(T_PEOPLE + '?id=eq.' + encodeURIComponent(id), {
      method:'PATCH',
      headers:{'Prefer':'return=representation'},
      body: JSON.stringify(patch),
      label:'update person'
    });
  },
  async delPerson(id){
    await req(T_PEOPLE + '?id=eq.' + encodeURIComponent(id), {
      method:'DELETE',
      headers:{'Prefer':'return=minimal'},
      label:'delete person'
    });
  },
  async findPersonBySlug(slug){
    try{
      const rows = await req(T_PEOPLE + '?select=id,slug&slug=eq.'
        + encodeURIComponent(slug) + '&limit=1');
      return (rows && rows[0]) || null;
    }catch(e){ return null; }
  },

  /* ---------- Generic row operations ---------- */
  async rows(table, pid){
    try{
      let u = table + '?select=*';
      if(pid != null) u += '&person_id=eq.' + encodeURIComponent(pid);
      return await req(u) || [];
    }catch(e){ return []; }
  },
  async insBatch(table, rows){
    if(!rows || !rows.length) return null;
    return req(table, {
      method:'POST',
      headers:{'Prefer':'return=minimal'},
      body: JSON.stringify(rows),
      label:'insert ' + table
    });
  },
  async upd(table, id, patch){
    return req(table + '?id=eq.' + encodeURIComponent(id), {
      method:'PATCH',
      headers:{'Prefer':'return=representation'},
      body: JSON.stringify(patch),
      label:'update ' + table
    });
  },
  async wipe(table, pid){
    try{
      await req(table + '?person_id=eq.' + encodeURIComponent(pid), {
        method:'DELETE',
        headers:{'Prefer':'return=minimal'}
      });
    }catch(e){}
  },
  async wipeAll(table){
    try{
      await req(table + '?id=gt.0', {
        method:'DELETE',
        headers:{'Prefer':'return=minimal'}
      });
    }catch(e){}
  },

  /* ---------- Settings (key/value per person) ---------- */
  async getSet(pid){
    try{
      let u = T_SETTINGS + '?select=key,value';
      if(pid === null) u += '&person_id=is.null';
      else if(pid != null) u += '&person_id=eq.' + encodeURIComponent(pid);
      const rows = await req(u) || [];
      const o = {};
      rows.forEach(x => { o[x.key] = x.value; });
      return o;
    }catch(e){ return {}; }
  },

  async upSet(obj, pid){
    const keys = Object.keys(obj || {});
    if(!keys.length) return null;
    const rows = keys.map(k => {
      const r = {key: k, value: String(obj[k])};
      if(pid != null) r.person_id = pid;
      return r;
    });
    const url = T_SETTINGS + '?on_conflict=key,person_id';
    try{
      return await req(url, {
        method:'POST',
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
        body: JSON.stringify(rows),
        label:'upsert settings'
      });
    }catch(e){
      console.warn('upSet upsert failed, falling back', e.message);
      const keyList = keys.map(k => '"' + k.replace(/"/g, '""') + '"').join(',');
      let delUrl = T_SETTINGS + '?key=in.(' + encodeURIComponent(keyList) + ')';
      if(pid != null) delUrl += '&person_id=eq.' + encodeURIComponent(pid);
      else delUrl += '&person_id=is.null';
      await req(delUrl, {method:'DELETE', headers:{'Prefer':'return=minimal'}});
      return req(T_SETTINGS, {
        method:'POST',
        headers:{'Prefer':'return=minimal'},
        body: JSON.stringify(rows),
        label:'insert settings'
      });
    }
  },

  /* ---------- Guests ---------- */
  async guests(){
    try{ return await req(T_GUEST + '?select=*&order=created_at.desc') || []; }
    catch(e){ return []; }
  },
  async insGuest(row){
    return req(T_GUEST, {
      method:'POST',
      headers:{'Prefer':'return=representation'},
      body: JSON.stringify(row),
      label:'insert guest'
    });
  },
  async updGuest(id, patch){
    return this.upd(T_GUEST, id, patch);
  },

  /* ---------- Wipe expired people (returns the rows that were wiped) ---------- */
  async wipeExpiredAndReturn(){
    try{
      const nowIso = new Date().toISOString();
      // Fetch people that are due to be wiped
      const due = await req(
        T_PEOPLE + '?select=id,slug,display_name,birthday,requester_name,requester_whatsapp,wipe_iso'
        + '&wipe_iso=not.is.null&wipe_iso=lte.' + encodeURIComponent(nowIso)
      ) || [];

      if(!due.length) return [];

      // For each due person, wipe their tables + person row
      for(const p of due){
        try{
          await Promise.all([
            this.wipe(T_MEDIA,    p.id),
            this.wipe(T_GIFTS,    p.id),
            this.wipe(T_STORY,    p.id),
            this.wipe(T_EVENTS,   p.id),
            this.wipe(T_VOICE,    p.id),
            this.wipe(T_VIDEO,    p.id),
            this.wipe(T_PINS,     p.id),
            this.wipe(T_UPLOADS,  p.id),
            this.wipe(T_SETTINGS, p.id)
          ]);
          await this.delPerson(p.id);

          // Remember in local finished list
          if(window.addFinishedPerson){
            window.addFinishedPerson({
              id: p.id,
              slug: p.slug,
              display_name: p.display_name,
              birthday: p.birthday,
              requester_name: p.requester_name || ''
            });
          }
        }catch(e){ console.warn('wipe due person', p.id, e.message); }
      }
      return due;
    }catch(e){
      console.warn('wipeExpiredAndReturn', e.message);
      return [];
    }
  },

  /* Keep old name as a thin wrapper for backward compatibility */
  async wipeExpired(){
    try{
      const rows = await this.wipeExpiredAndReturn();
      return rows.length;
    }catch(e){ return 0; }
  },

  /* ---------- Reviews ---------- */
  async reviews(){
    try{ return await req(T_REVIEWS + '?select=*&order=created_at.desc') || []; }
    catch(e){ return []; }
  },
  async upsertReview(row){
    const slug = (row.person_slug || '').toLowerCase();
    let existing = [];
    try{
      existing = await req(T_REVIEWS + '?select=id&person_slug=ilike.'
        + encodeURIComponent(slug)) || [];
    }catch(e){}
    if(existing && existing[0]){
      return this.upd(T_REVIEWS, existing[0].id, row);
    }
    return this.insBatch(T_REVIEWS, [row]);
  },
  async delReview(id){
    await req(T_REVIEWS + '?id=eq.' + encodeURIComponent(id), {
      method:'DELETE',
      headers:{'Prefer':'return=minimal'}
    });
  }
};

/* ---------- Wipe one person completely ---------- */
window.wipeOnePerson = async function(pid){
  if(!pid) return;
  try{
    await Promise.all([
      sb.wipe(T_MEDIA,   pid),
      sb.wipe(T_GIFTS,   pid),
      sb.wipe(T_STORY,   pid),
      sb.wipe(T_EVENTS,  pid),
      sb.wipe(T_VOICE,   pid),
      sb.wipe(T_VIDEO,   pid),
      sb.wipe(T_PINS,    pid),
      sb.wipe(T_UPLOADS, pid),
      sb.wipe(T_SETTINGS,pid)
    ]);
    await sb.delPerson(pid);
  }catch(e){ console.warn('[wipe] failed for ' + pid, e.message); }
};

window.checkWipe = async function(){
  try{
    const rows = await sb.wipeExpiredAndReturn();
    if(!rows || !rows.length) return;
    S.PEOPLE = await sb.people() || [];
    if(window.buildHome) window.buildHome();
  }catch(e){}
};

})();