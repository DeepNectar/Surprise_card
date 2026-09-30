/* ============================================================
   utils.js — DOM helpers, timezone, escaping, dialogs
   ============================================================ */
(function(){
'use strict';

/* ---------- DOM helpers ---------- */
window.$    = function(id){ return document.getElementById(id); };
window.txt  = function(el, v){ if(el) el.textContent = v == null ? '' : String(v); };
window.show = function(el){ if(el) el.classList.add('active'); };
window.hide = function(el){ if(el) el.classList.remove('active'); };

/* ---------- HTML / attribute escaping ---------- */
window.esc = function(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
};
window.escAttr = window.esc;

/* ---------- Timezone (DST-safe, two-pass) ---------- */
function tzOffsetMs(tz, utcMs){
  try{
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit',
      hour12:false
    });
    const parts = dtf.formatToParts(new Date(utcMs));
    const g = k => +parts.find(p => p.type === k).value;
    const asUTC = Date.UTC(
      g('year'), g('month') - 1, g('day'),
      g('hour') % 24, g('minute'), g('second')
    );
    return asUTC - utcMs;
  }catch(e){ return 0; }
}

window.zonedToUTC = function(localStr, tz){
  if(!localStr) return null;
  const m = String(localStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(!m) return null;
  const y = +m[1], mo = +m[2]-1, d = +m[3], h = +m[4], mi = +m[5], s = +(m[6]||0);
  tz = tz || window.DEFAULT_TZ;
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let offset  = tzOffsetMs(tz, guess);
  let candidate = guess - offset;
  const offset2 = tzOffsetMs(tz, candidate);
  if(offset2 !== offset) candidate = guess - offset2;
  return new Date(candidate).toISOString();
};

window.utcToZonedLocal = function(iso, tz){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  tz = tz || window.DEFAULT_TZ;
  try{
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:false
    });
    const parts = dtf.formatToParts(d);
    const g = k => parts.find(p => p.type === k).value;
    let hour = g('hour');
    if(hour === '24') hour = '00';
    return g('year') + '-' + g('month') + '-' + g('day') + 'T' + hour + ':' + g('minute');
  }catch(e){ return ''; }
};

window.fillTzSelect = function(el, current){
  if(!el) return;
  const cur = current || window.DEFAULT_TZ;
  if(el.options.length === 0){
    window.TZ_OPTIONS.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.l;
      el.appendChild(opt);
    });
  }
  el.value = window.TZ_OPTIONS.find(o => o.v === cur) ? cur : window.DEFAULT_TZ;
};

window.initAllTzSelects = function(){
  document.querySelectorAll('.tz-select').forEach(el => {
    fillTzSelect(el, el.dataset.currentTz || window.DEFAULT_TZ);
  });
};

/* ---------- Media helpers ---------- */
window.dedupeMedia = function(rows){
  const seen = new Set();
  const out = [];
  (rows || []).forEach(r => {
    if(!r) return;
    const key = ((r.drive_id || '').trim().toLowerCase())
             || ((r.src      || '').trim().toLowerCase());
    if(!key) return;
    if(seen.has(key)) return;
    seen.add(key);
    out.push(r);
  });
  return out;
};

window.splitDriveIds = function(raw){
  return String(raw || '').split(',').map(x => x.trim()).filter(Boolean);
};

window.driveImg = function(id, w){
  return 'https://lh3.googleusercontent.com/d/' + id + '=w' + (w || 2000);
};

/* ---------- Requester / edit password ---------- */
window.last4Digits = function(s){
  const digits = String(s || '').replace(/\D/g, '');
  if(digits.length < 4) return digits.padStart(4, '0');
  return digits.slice(-4);
};

window.firstNameOf = function(name){
  const n = String(name || '').trim();
  if(!n) return '';
  return n.split(/\s+/)[0].replace(/[^A-Za-z]/g, '') || '';
};

window.makeRequesterEditPassword = function(requesterName, requesterWhatsapp, slug){
  const fn = firstNameOf(requesterName);
  const l4 = last4Digits(requesterWhatsapp);
  const sl = String(slug || '').toLowerCase().replace(/[^a-z0-9\-_]/g, '');
  if(!fn || !l4 || !sl) return '';
  return fn + '-EDIT-' + l4 + '-' + sl;
};

window.getEditPasswordForPerson = function(p){
  if(!p) return '';
  return makeRequesterEditPassword(
    p.requester_name || '',
    p.requester_whatsapp || '',
    p.slug || ''
  );
};

/* ---------- Misc ---------- */
window.shuffleArray = function(arr){
  const a = (arr || []).slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
};

window.getShared = function(k, def){
  const s = window.__PAGE_STATE__.CURR.shared || {};
  return s[k] !== undefined ? s[k] : def;
};

window.getText = function(k, def){
  const t = window.__PAGE_STATE__.CURR.texts || {};
  return t[k] !== undefined ? t[k] : def;
};

window.clampDuration = function(v, def, min, max){
  let n = parseFloat(v);
  if(!isFinite(n) || n <= 0) n = def;
  return Math.max(min, Math.min(max, n));
};

/* ---------- Queued toast (fast, deduped) ---------- */
(function(){
  let queue = [], showing = false, lastMsg = '', lastTime = 0;

  window.__showToast = function(msg, ok){
    const now = Date.now();
    // dedupe rapid identical toasts within 800ms
    if(msg === lastMsg && now - lastTime < 800) return;
    lastMsg = msg; lastTime = now;
    queue.push({msg: msg || '', ok: ok !== false});
    if(!showing) next();
  };

  function next(){
    if(!queue.length){ showing = false; return; }
    showing = true;
    const item = queue.shift();
    const t = $('globalToast');
    if(!t){ showing = false; return; }
    t.textContent = item.msg;
    t.classList.toggle('err', !item.ok);
    t.classList.add('show');
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(next, 180);
    }, Math.max(1100, Math.min(2400, item.msg.length * 35)));
  }
})();

/* ---------- Custom confirm dialog ---------- */
window.__confirm = function(opts){
  return new Promise(resolve => {
    const o = typeof opts === 'string' ? {message: opts} : (opts || {});
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="confirm-box">'
      + '<div class="cf-icon">' + (o.icon || '❓') + '</div>'
      + '<div class="cf-title">' + (o.title ? esc(o.title) : 'Are you sure?') + '</div>'
      + '<div class="cf-msg">' + esc(o.message || '').replace(/\n/g, '<br>') + '</div>'
      + '<div class="cf-btns">'
      +   '<button type="button" class="cf-cancel">' + esc(o.cancelText || 'Cancel') + '</button>'
      +   '<button type="button" class="' + (o.danger ? 'cf-danger' : 'cf-ok') + '">' + esc(o.okText || 'Confirm') + '</button>'
      + '</div></div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    function close(val){
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    }
    function onKey(e){
      if(e.key === 'Escape') close(false);
      if(e.key === 'Enter')  close(true);
    }
    overlay.querySelector('.cf-cancel').onclick = () => close(false);
    overlay.querySelector('.cf-ok, .cf-danger').onclick = () => close(true);
    overlay.addEventListener('click', e => { if(e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);
    setTimeout(() => overlay.querySelector('.cf-ok, .cf-danger').focus(), 30);
  });
};

/* ---------- Button loading state ---------- */
window.__btnLoading = function(btn, on, label){
  if(!btn) return;
  if(on){
    if(!btn.dataset._orig) btn.dataset._orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="prog-ring"></span> ' + esc(label || 'Loading…');
  } else {
    btn.disabled = false;
    if(btn.dataset._orig){
      btn.innerHTML = btn.dataset._orig;
      delete btn.dataset._orig;
    }
  }
};

window.refreshPage = function(){
  try{ window.location.reload(); }
  catch(e){ location.href = location.href; }
};

/* ---------- Safe storage wrapper ---------- */
window.safeStore = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, v); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
  sget(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },
  sset(k, v){ try{ sessionStorage.setItem(k, v); return true; }catch(e){ return false; } },
  sdel(k){ try{ sessionStorage.removeItem(k); }catch(e){} }
};

/* ---------- Login rate limiter ---------- */
window.__loginRate = (function(){
  const KEY = 'login_attempts';
  const WINDOW_MS = 60000;
  const MAX = 5;
  function load(){ try{ return JSON.parse(safeStore.get(KEY) || '[]') || []; }catch(e){ return []; } }
  function save(a){ safeStore.set(KEY, JSON.stringify(a)); }
  return {
    canAttempt(){
      const now = Date.now();
      const arr = load().filter(t => now - t < WINDOW_MS);
      save(arr);
      return arr.length < MAX;
    },
    record(){
      const now = Date.now();
      const arr = load().filter(t => now - t < WINDOW_MS);
      arr.push(now);
      save(arr);
    },
    retryIn(){
      const arr = load();
      if(!arr.length) return 0;
      const oldest = Math.min(...arr);
      return Math.max(0, Math.ceil((WINDOW_MS - (Date.now() - oldest)) / 1000));
    },
    clear(){ safeStore.del(KEY); }
  };
})();

/* ---------- Focus trap for modals ---------- */
window.__trapFocus = function(container){
  if(!container) return;
  const sel = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
  function onKey(e){
    if(e.key !== 'Tab') return;
    const list = Array.from(container.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
    if(!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
};

/* ============================================================
   FINISHED PEOPLE — cloud ledger + local cache of auto-wiped persons

   The master copy lives in Supabase Storage (cloud): a public JSON file
   in the 'site-ledger' bucket.  That file is NEVER touched by table
   wipes, so finished people stay on the home screen forever — even after
   all their data has been wiped out on the scheduled date & time.
   localStorage is only a fast offline mirror of that cloud ledger.
   ============================================================ */
const FINISHED_KEY = 'surprise_finished_people_v1';

/* ---------- Shared helpers used across home / admin / guests ----------
   daysUntilBirthday: whole days until the NEXT occurrence of a
   'YYYY-MM-DD' birthday (0 = today). Works for finished-ledger entries
   too, so the 💐 Finished tab can show "🎂 in N days" for everyone. */
window.daysUntilBirthday = function(birthday){
  if(!birthday) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const parts = String(birthday).slice(0,10).split('-');
  if(parts.length !== 3) return null;
  const m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
  if(isNaN(m) || isNaN(d)) return null;
  let next = new Date(today.getFullYear(), m - 1, d);
  if(next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
};

/* Format a birthday date (or its next occurrence) as a human date string. */
window.formatBirthdayDate = function(birthday){
  if(!birthday) return '';
  const parts = String(birthday).slice(0,10).split('-');
  if(parts.length !== 3) return String(birthday);
  const m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
  if(isNaN(m) || isNaN(d)) return String(birthday);
  const today = new Date(); today.setHours(0,0,0,0);
  let next = new Date(today.getFullYear(), m - 1, d);
  if(next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  try{ return next.toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'}); }
  catch(e){ return parts.join('-'); }
};

/* Person / finished-ledger lookup by slug (case-insensitive). */
window.findPersonBySlug = function(slug){
  if(!slug) return null;
  const S = window.__PAGE_STATE__ || {};
  const low = String(slug).toLowerCase();
  const ppl = (S.PEOPLE || []).find(p => p && p.slug && String(p.slug).toLowerCase() === low);
  if(ppl) return ppl;
  if(window.getFinishedPeople){
    return (getFinishedPeople() || []).find(f => f && f.slug && String(f.slug).toLowerCase() === low) || null;
  }
  return null;
};

window.getFinishedPeople = function(){
  try{
    const raw = localStorage.getItem(FINISHED_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
};

/* Merge two finished-person lists (cloud + local), de-duplicating by slug.
   The EARLIEST known wipe stamp wins (that's the scheduled "said" time),
   and any record present in only one of the lists is kept.

   HD0.5 — DELETED people stay as tiny "tombstones" ({deleted:true}).
   A person the admin deletes from the 💐 Finished tab must NEVER come back
   to the home screen through the ledger mirror, the settings-table copy or
   a stale localStorage cache — so the deletion itself is what syncs.
   deleted === true always wins over an ordinary record for the same slug. */
window.mergeTwoListsRaw = function(a, b){ return mergeTwoLists(a, b); };
function mergeTwoLists(a, b){
  const out = [];
  const idx = {};
  [].concat(a || [], b || []).forEach(p => {
    if(!p || !p.slug) return;
    const k = String(p.slug);
    if(idx[k] !== undefined){
      const old = out[idx[k]];
      /* a DELETE marker always beats a live record (and vice-versa: never
         let an older tombstone be resurrected by a plain entry… unless the
         plain entry was stamped AFTER the delete, i.e. genuinely re-added) */
      if(old.deleted && !p.deleted) return;
      if(p.deleted && old.deleted) return;
      const keepWiped = [old.wiped_at, p.wiped_at].filter(Boolean).sort()[0];
      out[idx[k]] = Object.assign({}, old, p, { wiped_at: keepWiped || old.wiped_at });
    }else{
      idx[k] = out.length;
      out.push(Object.assign({}, p));
    }
  });
  out.sort((x, y) => String(y.wiped_at || '').localeCompare(String(x.wiped_at || '')));
  return out.slice(0, 400);
}

/* Public helper: strip the private requester fields off a tombstone so the
   cloud ledger only carries {slug, deleted, wiped_at}. */
window.purgedLedgerEntry = function(slug, wiped_at){
  return {
    slug: String(slug || ''),
    display_name: '', birthday: null, requester_name: '',
    requester_relation: '', requester_whatsapp: '',
    id: null, finished_manually: false,
    deleted: true,
    wiped_at: wiped_at || new Date().toISOString()
  };
};

/* Push the merged (cloud ∪ local) list up to BOTH cloud stores (debounced):
     1. Supabase Storage bucket 'site-ledger' — the permanent master copy
        (survives every database wipe), and
     2. the settings table key 'shared__finished_ledger' — a fallback mirror
        that works even when the storage bucket / RLS policies are missing,
        so the 💐 Finished tab syncs across EVERY domain & device.
   Merging with the cloud before writing prevents one browser from
   overwriting another browser's finished entries. */
const FINISHED_LEDGER_SETTING = 'shared__finished_ledger';
let _ledgerPushT = null;
window.pushFinishedLedger = function(){
  clearTimeout(_ledgerPushT);
  _ledgerPushT = setTimeout(async () => {
    try{
      let cloudList = [];
      if(window.sbGetFinishedJson){
        try{
          const cloud = await sbGetFinishedJson();
          if(cloud && Array.isArray(cloud.people)) cloudList = cloud.people;
        }catch(e){}
      }
      /* also fold in the settings-table mirror (covers browsers whose only
         successful write path was the DB) */
      if(window.sbGetFinishedFromSettings){
        try{
          const mirror = await window.sbGetFinishedFromSettings();
          if(mirror && Array.isArray(mirror.people)){
            cloudList = mergeTwoLists(cloudList, mirror.people);
          }
        }catch(e){}
      }
      const merged = mergeTwoLists(cloudList, getFinishedPeople());
      /* HD0.5 — carry the DELETE tombstones along so deletions propagate to
         every browser/domain instead of being resurrected by the cloud copy */
      const payload = mergeTwoLists(merged, window.getPurgedSlugs ? getPurgedSlugs() : []);
      /* persist the merged view locally too, so this browser sees others' entries */
      localStorage.setItem(FINISHED_KEY, JSON.stringify(payload.filter(x => !x.deleted)));
      let wroteStorage = false;
      if(window.sbPutFinishedJson){
        try{ wroteStorage = await sbPutFinishedJson({ updated_at: new Date().toISOString(), people: payload }); }catch(e){}
      }
      /* ALWAYS keep the DB mirror in sync as well (cheap, reliable under
         existing anon policies) — never let it go stale. */
      if(window.sbPutFinishedToSettings){
        try{ await window.sbPutFinishedToSettings({ updated_at: new Date().toISOString(), people: payload }); }catch(e){}
      }else if(wroteStorage === false && window.__sbUpSetShared){
        /* legacy path: only write DB mirror if storage failed */
        try{ await window.__sbUpSetShared(FINISHED_LEDGER_SETTING, JSON.stringify({ updated_at: new Date().toISOString(), people: payload })); }catch(e){}
      }
    }catch(e){}
  }, 800);
};

/* ============================================================
   DELETE MARKERS ("tombstones") FOR THE FINISHED LEDGER  (HD0.5)

   When the admin deletes a finished person, that deletion must reach every
   browser / domain and must NEVER be undone by an older cloud copy. So the
   ledger carries tiny markers — {slug, deleted:true} with ALL personal data
   stripped (no name, birthday, relation or WhatsApp) — instead of simply
   dropping the row. The markers live in their own localStorage key so they
   are never rendered anywhere; the wiped-out archive keeps the full private
   record so the admin can still restore someone later.
   ============================================================ */
const FINISHED_PURGED_KEY = 'surprise_finished_purged_v1';

window.getPurgedSlugs = function(){
  try{
    const raw = localStorage.getItem(FINISHED_PURGED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
};

/* Private wipe-ledger archive: EVERY finished entry ever seen on this
   device is mirrored here and NEVER cleared — including deleted ones.
   ⚠️ Device-local only: it survives table wipes but not a different
   browser/device. Deleting from the 💐 Finished tab therefore also files a
   delete marker in the CLOUD ledger (see removeFinishedPerson). */
const WIPED_ARCHIVE_KEY = 'surprise_wiped_archive_v1';

window.getWipedArchive = function(){
  try{
    /* merged view: archive ∪ current finished list ∪ delete markers
       (the archive always wins for a slug, and a deleted person stays
        visible to the ADMIN inside 🗑️ Wiped Out, never on the home screen) */
    const raw = localStorage.getItem(WIPED_ARCHIVE_KEY);
    const arch = raw ? (JSON.parse(raw) || []) : [];
    const list = Array.isArray(arch) ? arch : [];
    const cur = window.getFinishedPeople ? getFinishedPeople() : [];
    const purged = window.getPurgedSlugs ? getPurgedSlugs() : [];
    let out = window.mergeTwoListsRaw
      ? window.mergeTwoListsRaw(list, cur)
      : list.concat(cur.filter(c => !list.some(l => String(l.slug) === String(c.slug))));
    purged.forEach(t => {
      if(!t || !t.slug) return;
      const i = out.findIndex(x => x && String(x.slug) === String(t.slug));
      if(i >= 0) out[i] = Object.assign({}, out[i], { deleted: true, deleted_at: t.wiped_at || null });
      else out.push(Object.assign({}, t, { deleted: true, deleted_at: t.wiped_at || null }));
    });
    return out;
  }catch(e){ return window.getFinishedPeople ? getFinishedPeople() : []; }
};

function isPurged(slug){
  if(!slug) return false;
  const low = String(slug).toLowerCase();
  return window.getPurgedSlugs().some(x => x && String(x.slug).toLowerCase() === low);
}

function rememberPurged(entry){
  try{
    const list = window.getPurgedSlugs();
    const i = list.findIndex(x => x && String(x.slug) === String(entry.slug));
    if(i >= 0) list[i] = Object.assign({}, list[i], entry);
    else list.unshift(entry);
    localStorage.setItem(FINISHED_PURGED_KEY, JSON.stringify(list.slice(0, 400)));
  }catch(e){}
}

function forgetPurged(slug){
  try{
    const low = String(slug || '').toLowerCase();
    const list = window.getPurgedSlugs().filter(x => x && String(x.slug).toLowerCase() !== low);
    localStorage.setItem(FINISHED_PURGED_KEY, JSON.stringify(list));
  }catch(e){}
}

/* Merge one finished-person record into the local mirror. Returns true if new.
   A delete marker ({deleted:true}) goes to the purged key + the private
   archive instead of the visible finished list. */
function mergeFinishedEntry(p){
  if(!p || !p.slug) return false;
  /* DELETION marker → file it in the purged list, drop any live copy */
  if(p.deleted){
    const tomb = window.purgedLedgerEntry(p.slug, p.wiped_at);
    rememberPurged(tomb);
    try{
      const list = getFinishedPeople().filter(x => String(x.slug) !== String(p.slug));
      localStorage.setItem(FINISHED_KEY, JSON.stringify(list));
    }catch(e){}
    return false;
  }
  /* a previously deleted slug must not be resurrected by cloud sync */
  if(isPurged(p.slug)) return false;
  const list = getFinishedPeople();
  const i = list.findIndex(x => String(x.slug) === String(p.slug));
  if(i >= 0){
    /* keep the EARLIEST known wipe stamp (the "said" date & time) */
    const old = list[i];
    const keepWiped = [old.wiped_at, p.wiped_at].filter(Boolean).sort()[0];
    list[i] = Object.assign({}, old, p, { wiped_at: keepWiped || old.wiped_at });
    localStorage.setItem(FINISHED_KEY, JSON.stringify(list.slice(0, 200)));
    return false;
  }
  list.unshift(Object.assign({}, p, { wiped_at: p.wiped_at || new Date().toISOString() }));
  localStorage.setItem(FINISHED_KEY, JSON.stringify(list.slice(0, 200)));
  return true;
}

/* ---------- Wiped-out archive (private admin section) ----------
   The reader (window.getWipedArchive, defined above together with the
   delete markers) merges this NEVER-cleared key with the current finished
   list, so every finished / auto-wiped / deleted person stays re-selectable
   by the admin and can be restored back into 💐 Finished. */
function archiveWipedEntry(entry){
  try{
    const raw = localStorage.getItem(WIPED_ARCHIVE_KEY);
    const list = raw ? (JSON.parse(raw) || []) : [];
    const arr = Array.isArray(list) ? list : [];
    const i = arr.findIndex(x => x && String(x.slug) === String(entry.slug));
    if(i >= 0){
      arr[i] = Object.assign({}, arr[i], entry);
    }else{
      arr.unshift(entry);
    }
    localStorage.setItem(WIPED_ARCHIVE_KEY, JSON.stringify(arr.slice(0, 500)));
  }catch(e){}
}

/* Restore an archived person INTO the 💐 Finished tab (cloud-synced).
   HD0.5 — restoring also lifts the DELETE marker for that slug, so the
   person legitimately comes back everywhere instead of being filtered out. */
window.restoreFromWipedArchive = async function(slug){
  if(!slug) return false;
  const arch = (window.getWipedArchive ? getWipedArchive() : [])
    .find(x => x && String(x.slug).toLowerCase() === String(slug).toLowerCase());
  if(!arch) return false;
  forgetPurged(arch.slug);
  mergeFinishedEntry(Object.assign({}, arch));
  pushFinishedLedger();
  return true;
};

window.addFinishedPerson = function(person){
  if(!person || !person.slug) return;
  try{
    const entry = {
      id: person.id,
      slug: person.slug,
      display_name: person.display_name,
      birthday: person.birthday,
      requester_name: person.requester_name || '',
      /* relation + WhatsApp are kept in the background (private ledger copy)
         so the admin can message the requester ~10–15 days before the
         birthday — they are never shown publicly on the review cards */
      requester_relation: person.requester_relation || '',
      requester_whatsapp: person.requester_whatsapp || '',
      finished_manually: !!person.finished_manually,
      /* honour an explicit wipe date/time when given (the scheduled "said
         date and time" the data is wiped out at); otherwise stamp now */
      wiped_at: person.wiped_at || new Date().toISOString()
    };
    const added = mergeFinishedEntry(entry);
    /* ALWAYS mirror into the permanent wiped-out archive too, so the admin
       "🗑️ Wiped Out" section can restore anyone back into 💐 Finished. */
    archiveWipedEntry(entry);
    if(added){ pushFinishedLedger(); }  /* keep the cloud ledger in sync */
  }catch(e){}
};

/* ============================================================
   DELETE A FINISHED PERSON  (admin action — 💐 Finished tab & home screen)

   HD0.5 — the deletion is written as a private "tombstone" into BOTH cloud
   copies of the ledger (Storage bucket + settings-table mirror), so the
   person disappears from the 💐 Finished list on the home screen for EVERY
   visitor, on every domain and device — and never comes back through sync.
   The requester's WhatsApp / relation are stripped from the tombstone, so
   no personal data stays in the public ledger; the full record remains in
   the private admin archive (🗑️ Wiped Out) for a later restore.
   ============================================================ */
window.removeFinishedPerson = async function(slug){
  if(!slug) return;
  const key = String(slug);
  try{
    /* find the entry first (we need its wipe stamp for the marker) */
    const cur = getFinishedPeople().find(x => String(x.slug) === key);
    const tomb = window.purgedLedgerEntry(key, cur && cur.wiped_at);

    /* 1. local: drop from the visible list, remember the deletion */
    localStorage.setItem(FINISHED_KEY, JSON.stringify(getFinishedPeople()
      .filter(x => String(x.slug) !== key)));
    rememberPurged(tomb);

    /* 2. cloud: fetch-merge-write the ledger WITHOUT this slug, then append
          the delete marker so other browsers stay deleted too */
    let cloudList = [];
    if(window.sbGetFinishedJson){
      try{
        const cloud = await sbGetFinishedJson();
        if(cloud && Array.isArray(cloud.people)) cloudList = cloudList.concat(cloud.people);
      }catch(e){}
    }
    if(window.sbGetFinishedFromSettings){
      try{
        const mirror = await window.sbGetFinishedFromSettings();
        if(mirror && Array.isArray(mirror.people)) cloudList = cloudList.concat(mirror.people);
      }catch(e){}
    }
    const kept = mergeTwoLists(cloudList, getFinishedPeople())
      .filter(x => String(x.slug) !== key);
    const payload = mergeTwoLists(kept, [tomb]);

    localStorage.setItem(FINISHED_KEY, JSON.stringify(payload.filter(x => !x.deleted)));

    if(window.sbPutFinishedJson){
      try{ await sbPutFinishedJson({ updated_at: new Date().toISOString(), people: payload }); }catch(e){}
    }
    if(window.sbPutFinishedToSettings){
      try{ await window.sbPutFinishedToSettings({ updated_at: new Date().toISOString(), people: payload }); }catch(e){}
    }else if(window.__sbUpSetShared){
      try{ await window.__sbUpSetShared(FINISHED_LEDGER_SETTING, JSON.stringify({ updated_at: new Date().toISOString(), people: payload })); }catch(e){}
    }
  }catch(e){}
};

/* Same thing for MANY slugs at once (admin multi-select delete). */
window.removeFinishedPeople = async function(slugs){
  const list = (slugs || []).filter(Boolean);
  for(const s of list){ await window.removeFinishedPerson(s); }
  return list.length;
};

window.clearFinishedPeople = function(){
  try{ localStorage.removeItem(FINISHED_KEY); }catch(e){}
};

/* Pull the cloud ledger (Storage bucket + settings-table mirror) and merge
   it into the local mirror.
   Returns true if anything new appeared (callers can repaint the home).
   If the cloud file does not exist yet but we have local entries,
   bootstrap them upward so other browsers/devices can see them too. */
window.pullFinishedLedger = async function(){
  try{
    let gotCloud = false;
    let changed = false;
    let anyPeople = [];
    if(window.sbGetFinishedJson){
      const cloud = await sbGetFinishedJson();
      if(cloud && Array.isArray(cloud.people)){
        gotCloud = true;
        anyPeople = anyPeople.concat(cloud.people);
      }
    }
    if(window.sbGetFinishedFromSettings){
      try{
        const mirror = await window.sbGetFinishedFromSettings();
        if(mirror && Array.isArray(mirror.people)){
          gotCloud = true;
          anyPeople = anyPeople.concat(mirror.people);
        }
      }catch(e){}
    }
    if(!gotCloud){
      /* first run: seed the cloud ledger from this browser's local list */
      if(getFinishedPeople().length && window.pushFinishedLedger){
        pushFinishedLedger();
      }
      return false;
    }
    /* oldest first so newest ends up on top after unshift-merges */
    anyPeople.slice().reverse().forEach(p => {
      if(mergeFinishedEntry(p)) changed = true;
    });
    return changed;
  }catch(e){ return false; };
};

})();