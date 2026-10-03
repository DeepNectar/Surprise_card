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

/* ---------- Supabase Storage (finished-people cloud ledger) ----------
   Finished people are ALSO saved as a JSON file in the project's cloud
   storage bucket, so the 💐 Finished list survives even when every
   database table is wiped out on the scheduled date & time. */
const FINISHED_BUCKET = window.FINISHED_BUCKET || 'site-ledger';
const FINISHED_FILE   = 'finished_people.json';

function sbStoragePath(p){ return URL + '/storage/v1/' + p; }

window.sbPutFinishedJson = async function(data){
  try{
    const fd = new FormData();
    fd.append('cache-control', '30');
    fd.append('content-type', 'application/json');
    fd.append('bucketId', FINISHED_BUCKET);
    fd.append('objectPath', FINISHED_FILE);
    fd.append('file', new Blob([JSON.stringify(data)], {type:'application/json'}));
    const r = await fetch(sbStoragePath('object/' + FINISHED_BUCKET + '/' + FINISHED_FILE + '?x-upsert=true'), {
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY },
      body: fd,
      cache: 'no-store'
    });
    return r.ok;
  }catch(e){ return false; }
};

window.sbGetFinishedJson = async function(){
  try{
    const r = await fetch(sbStoragePath('object/public/' + FINISHED_BUCKET + '/' + FINISHED_FILE + '?cb=' + Date.now()), { cache:'no-store' });
    if(!r.ok) return null;
    const j = await r.json();
    return (j && Array.isArray(j.people)) ? j : null;
  }catch(e){ return null; }
};

/* ---------- Settings-table mirror of the finished ledger ----------
   The 'site-ledger' Storage bucket requires one-time SQL setup (bucket +
   anon RLS policies). If that was never run — or a new custom domain hits
   the site before any browser has seeded the bucket — the 💐 Finished tab
   would be empty for those visitors. These two helpers keep a second copy
   of the SAME JSON in the settings table (key: shared__finished_ledger),
   which already works under the existing anon policies, so finished people
   sync across EVERY domain & device no matter what. */
const FINISHED_LEDGER_KEY = 'shared__finished_ledger';

window.sbPutFinishedToSettings = async function(data){
  try{
    const payload = JSON.stringify(data);
    const filt = "?key=eq." + encodeURIComponent(FINISHED_LEDGER_KEY) + '&person_id=is.null';
    /* Preferred: atomic upsert via sb.upSet (delete+insert — anon can do both) */
    try{ await sb.upSet({ [FINISHED_LEDGER_KEY]: payload }, null); }catch(e){}
    try{
      const check = await req(T_SETTINGS + "?select=value&key=eq." + encodeURIComponent(FINISHED_LEDGER_KEY) + '&person_id=is.null&order=id.desc&limit=1');
      if(check && check.length && check[0].value === payload) return true;
      if(check && check.length){
        /* row exists but holds an older value — force-overwrite it */
        await req(T_SETTINGS + filt, {
          method:'PATCH',
          headers:{'Prefer':'return=minimal'},
          body: JSON.stringify({ value: payload }),
          label:'patch finished ledger'
        });
      }else{
        /* no row yet — plain insert (anon INSERT works on settings) */
        await req(T_SETTINGS, {
          method:'POST',
          headers:{'Prefer':'return=minimal'},
          body: JSON.stringify([{ key: FINISHED_LEDGER_KEY, value: payload, person_id: null }]),
          label:'insert finished ledger'
        });
      }
      return true;
    }catch(e){ return false; }
  }catch(e){ return false; }
};

/* Legacy alias used by js/utils.js fallback branches: upsert one
   shared setting key directly into the settings table. Implemented
   via sb.upSet so it works under the anon RLS policies in setup/rls.sql. */
window.__sbUpSetShared = async function(key, value){
  if(!window.sb) return;
  await window.sb.upSet({ [key]: String(value) }, null);
};

/* Read the LATEST mirror row (in case duplicates exist from plain inserts) */
window.sbGetFinishedFromSettings = async function(){
  try{
    const rows = await req(T_SETTINGS + "?select=value&key=eq." + encodeURIComponent(FINISHED_LEDGER_KEY) + '&person_id=is.null&order=id.desc&limit=1');
    const v = (rows && rows[0] && rows[0].value) || '';
    if(!v) return null;
    const j = JSON.parse(v);
    return (j && Array.isArray(j.people)) ? j : null;
  }catch(e){ return null; }
};

/* One-time setup helper: creates the public 'site-ledger' bucket and the
   anon write / public read policies.  Paste this into Supabase Dashboard →
   SQL Editor and run it once. */
window.LEDGER_SETUP_SQL =
  "insert into storage.buckets (id, name, public) values ('" + FINISHED_BUCKET + "','" + FINISHED_BUCKET + "',true) on conflict (id) do nothing;\n" +
  "drop policy if exists \"ledger_public_read\" on storage.objects;\n" +
  "create policy \"ledger_public_read\" on storage.objects for select to public using (bucket_id = '" + FINISHED_BUCKET + "');\n" +
  "drop policy if exists \"ledger_anon_write\" on storage.objects;\n" +
  /* upsert sends POST when the file is new and PUT when it already exists —
     so this single INSERT-or-UPDATE policy covers every browser pushing
     finished people to the shared cloud ledger */
  "create policy \"ledger_anon_write\" on storage.objects for insert to anon with check (bucket_id = '" + FINISHED_BUCKET + "');\n" +
  "drop policy if exists \"ledger_anon_update\" on storage.objects;\n" +
  "create policy \"ledger_anon_update\" on storage.objects for update to anon using (bucket_id = '" + FINISHED_BUCKET + "') with check (bucket_id = '" + FINISHED_BUCKET + "');";

window.ledgerBucketExists = async function(){
  try{
    const r = await fetch(sbStoragePath('bucket/' + FINISHED_BUCKET), { headers: hdr(), cache:'no-store' });
    return r.ok;
  }catch(e){ return false; }
};

/* ---------- Self-healing ledger table (cloud, survives every wipe) ----------
   The 💐 Finished list normally lives in the 'site-ledger' Storage bucket —
   but that bucket and its anon RLS policies require a ONE-TIME SQL setup.
   If it was never run (or the bucket/policies were deleted), finished
   people used to fall back to the settings table, which IS cleared whenever
   all card data is wiped out on the scheduled date & time — so the Finished
   tab could disappear from the home screen on brand-new devices.

   This helper creates (idempotently, straight from the browser via the anon
   key) a dedicated Postgres table `finished_ledger` that NO wipe routine
   ever touches, plus permissive anon RLS on it. After this succeeds, the
   cloud copy of the Finished list is permanent across EVERY device/domain. */
const LEDGER_TABLE = 'finished_ledger';
let _ledgerTableOk = null; /* cached tri-state: true / false / in-flight promise */

window.sbEnsureLedgerTable = async function(){
  if(_ledgerTableOk === true || _ledgerTableOk === false) return _ledgerTableOk;
  try{
    const rpcUrl = URL + '/rest/v1/rpc/ensure_finished_ledger_table';
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = setTimeout(() => { if(ctrl) ctrl.abort(); }, TMO_MUT);
    let r;
    try{
      r = await fetch(rpcUrl, {
        method: 'POST',
        headers: hdr(),
        body: '{}',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
    }finally{ clearTimeout(timer); }
    if(!r.ok){
      /* 404 → the one-time SQL (setup/ledger.sql) has not been run yet.
         Silent fallback: the settings-table mirror keeps working as before. */
      _ledgerTableOk = false;
      return false;
    }
    _ledgerTableOk = true;
    return true;
  }catch(e){
    _ledgerTableOk = false;
    return false;
  }
};

window.sbPutFinishedToTable = async function(data){
  try{
    const ok = await window.sbEnsureLedgerTable();
    if(!ok) return false;
    await req(LEDGER_TABLE, {
      method:'POST',
      headers:{'Prefer':'return=minimal'},
      body: JSON.stringify([{ id: 1, value: JSON.stringify(data) }]),
      label:'insert finished ledger table'
    });
    return true;
  }catch(e){ return false; }
};

window.sbGetFinishedFromTable = async function(){
  try{
    const rows = await req(LEDGER_TABLE + '?select=value&id=eq.1&order=updated_at.desc&limit=1');
    const v = (rows && rows[0] && rows[0].value) || '';
    if(!v) return null;
    const j = JSON.parse(v);
    return (j && Array.isArray(j.people)) ? j : null;
  }catch(e){ return null; }
};

async function req(path, opts){
  opts = opts || {};
  const isGet = !opts.method || opts.method === 'GET';
  const ms = isGet ? TMO_GET : TMO_MUT;
  try{
    return await once(path, opts, ms);
  }catch(e){
    /* Self-heal: "Could not find the 'X' column of 'Y' in the schema cache"
       (PGRST204) means PostgREST is serving a STALE cached schema even
       though the column exists in Postgres. Ask the DB to re-add the
       columns and reload the cache, wait briefly, then retry ONCE. This
       clears the error without anyone having to open the SQL editor. */
    if(/schema cache/i.test(String(e && e.message))){
      try{
        await once('rpc/ensure_sync_schema', { method:'POST', body:'{}', label:'ensure_sync_schema' }, TMO_MUT);
        await new Promise(res => setTimeout(res, 1500));
        return await once(path, opts, ms);
      }catch(e2){ throw e; /* keep the original, clearer error */ }
    }
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
    /* HD0.6 — SAFETY GUARD: the finished_ledger table is the permanent cloud
       home of the 💐 Finished list. No wipe routine may EVER clear it, so
       finished people stay on the home screen for every visitor on every
       device — even after all card data is wiped out. */
    if(String(table) === 'finished_ledger'){
      console.warn('[wipeAll] refused: finished_ledger is protected');
      return;
    }
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
  /* HD0.5 — hard-delete a guest submission row (admin "Delete from database"
     in the ✅ Completed tab). Returns true when the DELETE went through. */
  async delGuest(id){
    try{
      await req(T_GUEST + '?id=eq.' + encodeURIComponent(id), {
        method:'DELETE',
        headers:{'Prefer':'return=minimal'}
      });
      return true;
    }catch(e){ console.warn('[delGuest] failed for ' + id, e.message); return false; }
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

      /* Remember in the local finished list BEFORE deleting, so a failure
         halfway through can never lose a person from the home screen.
         Stamp with the scheduled wipe date/time ("said" date & time). */
      if(window.addFinishedPerson){
        due.forEach(p => {
          try{
            window.addFinishedPerson({
              id: p.id,
              slug: p.slug,
              display_name: p.display_name,
              birthday: p.birthday,
              requester_name: p.requester_name || '',
              wiped_at: p.wipe_iso || null
            });
          }catch(e){}
        });
      }

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

/* ---------- Wipe one person completely ----------
   Also files them in the FINISHED list so they show up on the home screen
   (with the date/time their data was wiped out), just like auto-expired ones. */
window.wipeOnePerson = async function(pid){
  if(!pid) return;
  /* Grab the row BEFORE deleting so we know who to remember. */
  let person = null;
  try{
    const rows = await req(T_PEOPLE + '?select=id,slug,display_name,birthday,requester_name,wipe_iso&person_id=eq.' + encodeURIComponent(pid));
    person = (rows && rows[0]) || null;
  }catch(e){}
  if(!person){
    try{ person = (S.PEOPLE || []).find(p => String(p.id) === String(pid)) || null; }catch(e){}
  }
  /* Remember on the finished list — stamped with the scheduled wipe date/time
     when known (the moment the data is set to be wiped out), else right now. */
  if(person && window.addFinishedPerson){
    try{
      addFinishedPerson({
        id: person.id,
        slug: person.slug,
        display_name: person.display_name,
        birthday: person.birthday,
        requester_name: person.requester_name || '',
        wiped_at: person.wipe_iso || null
      });
    }catch(e){}
  }
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

/* Merge anything wiped by OTHER tabs/browsers since our last sync into the
   local finished list, so every visitor sees all finished people — not only
   the ones wiped while their own tab happened to be open. */
window.syncFinishedFromCloud = async function syncFinishedFromCloud(){
  try{
    const rows = await req(
      T_PEOPLE + '?select=id,slug,display_name,birthday,requester_name,wipe_iso'
      + '&wipe_iso=not.is.null&wipe_iso=lte.' + encodeURIComponent(new Date().toISOString())
      + '&order=wipe_iso.desc&limit=200'
    ) || [];
    if(!rows.length) return false;
    const known = {};
    (window.getFinishedPeople ? getFinishedPeople() : []).forEach(f => { known[String(f.slug)] = 1; });
    let added = 0;
    rows.forEach(p => {
      if(!p.slug || known[String(p.slug)]) return;
      if(window.addFinishedPerson){
        addFinishedPerson({
          id: p.id, slug: p.slug, display_name: p.display_name,
          birthday: p.birthday, requester_name: p.requester_name || '',
          /* stamp with the ACTUAL scheduled wipe date/time */
          wiped_at: p.wipe_iso || null
        });
        added++;
      }
    });
    return added > 0;
  }catch(e){ return false; }
}

window.checkWipe = async function(){
  try{
    const rows = await sb.wipeExpiredAndReturn();
    /* keep the 💐 Finished tab in sync with the CLOUD ledger, so entries
       finished in another browser/device appear here without a reload */
    let pulled = false;
    if(window.pullFinishedLedger){
      try{ pulled = await pullFinishedLedger(); }catch(e){}
    }
    const synced = await syncFinishedFromCloud();
    if((!rows || !rows.length) && !synced && !pulled) return;
    S.PEOPLE = await sb.people() || [];
    if(window.clearHomeSnapshot) window.clearHomeSnapshot();
    if(window.buildHome) window.buildHome();
  }catch(e){}
};

})();