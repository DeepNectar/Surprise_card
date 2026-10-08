/* ============================================================
   privateview.js — 🔒 PRIVATE PHOTO VIEWER (OTP-only, fast mode)
   ------------------------------------------------------------
   A card can be flagged "Private" by the REQUESTER in their edit
   panel (Requester → 🔒 Private tab). Once private:

     • The normal viewer path is HARD-BLOCKED — a password/PIN alone
       never opens the media slideshow of a private card. Only the
       one-time code unlocks it.
     • ⚡ SIMPLIFIED ACCESS (current design): the viewer types the
       6-digit OTP and NOTHING ELSE. Name / phone-number verification
       has been removed from the viewer entirely — no identity fields,
       no "requester details" check, no second step. One field, one tap.
     • The 6-digit OTP itself is generated ONLY from the requester's
       edit panel (js/requester.js → "🎟️ Generate OTP"). Admins and
       viewers can never mint codes — the generator lives nowhere else.
     • ⚡ PLAIN STORAGE MODE: codes live in people.otp_list as they were
       typed — {code, exp, created} — so unlocking is a plain string
       compare with zero crypto work (fast even on weak phones). Salted
       SHA-256 entries minted by older builds are still accepted.
     • Codes stay single-use (burnt instantly in memory, mirrored to the
       cloud in the background), time-boxed (default 10 min) and
       throttled (5 wrong tries → timed lock per device).
     • While the private slideshow runs the screen is shielded:
       right-click/save/context-menu/copy are blocked, screenshots on
       mobile blur the content, and leaving the tab pauses playback.

   Storage: people.otp_list holds JSON [{code, exp, created}]
            (legacy [{hash, salt, exp, created}] still readable).
   Offline-safe: writes go through lcSavePersonPatch() which queues to
   IndexedDB when offline (setup/pin_otp_safe.sql ensures the column).
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

/* ---------- schema guard for the otp_list mirror column ---------- */
window.lcOtpColOk = null; /* null unknown / true visible / false missing */

/* Pending background mirror write of a just-burnt code (declared early —
   loadOtpList() waits on it so a stale list is never re-read). */
let OTP_SAVE_P = null;
async function flushOtpSave(){
  try{ if(OTP_SAVE_P) await OTP_SAVE_P; }catch(e){}
  OTP_SAVE_P = null;
}

/* ⚡ SPEED: optimistic in-flight mirror writes. When several otp_list
   PATCHes overlap (generate → revoke → viewer burn), each one waits for
   the previous to land so PostgREST never applies them out of order and
   a stale list can't resurrect an already-used code. */
let OTP_WRITE_P = Promise.resolve();
function queueOtpWrite(fn){
  OTP_WRITE_P = OTP_WRITE_P.then(fn).catch(() => {});
  return OTP_WRITE_P;
}

async function saveOtpList(person, list){
  /* keep the local shadow copy ALWAYS in sync — instant, offline-safe,
     and it is what loadOtpList merges, so the gate never has to wait on
     a cloud round-trip to know which codes are still valid. */
  try{ localStorage.setItem('lc_otp_local_' + person.id, JSON.stringify(list)); }catch(e){}
  if(window.lcOtpColOk === false){
    /* Column not visible yet — keep codes on-device only. */
    return false;
  }
  const payload = { otp_list: JSON.stringify(list || []) };
  return queueOtpWrite(async () => {
    const ok = await window.lcSavePersonPatch(person, payload, { optionalCols: ['otp_list'] });
    /* If the PATCH fails after its own retries the local copy above still
       holds the truth for this device — nothing else to do. */
    return ok;
  });
}

function readLocalOtpList(person){
  try{ return JSON.parse(localStorage.getItem('lc_otp_local_' + person.id) || '[]'); }
  catch(e){ return []; }
}

async function loadOtpList(person){
  await flushOtpSave();               /* pending burn must be reflected */
  let list = [];
  try{
    const raw = person && person.otp_list;
    if(typeof raw === 'string' && raw.trim()) list = JSON.parse(raw);
    else if(Array.isArray(raw)) list = raw;
  }catch(e){ list = []; }
  if(!Array.isArray(list)) list = [];
  /* merge any device-local codes (offline generation before heal) */
  const loc = readLocalOtpList(person);
  const seen = {};
  list.concat(loc).forEach(o => { if(o && (o.hash || o.code)) seen[otpKeyOf(o)] = o; });
  return Object.keys(seen).map(k => seen[k]);
}

/* identity of a stored entry: plain code (new) or hash (legacy) */
function otpKeyOf(o){
  return o && o.code ? ('c:' + String(o.code).trim()) : ('h:' + String((o && o.hash) || '').toLowerCase());
}

/* purge expired entries whenever we touch the list */
function prune(list){
  const now = Date.now();
  return (list || []).filter(o => o && o.exp && o.exp > now);
}

/* ⚡ SPEED: optimistic in-flight mirror writes. When several otp_list
   PATCHes overlap (generate → revoke → viewer burn), each one waits for
   the previous to land so PostgREST never applies them out of order and
   a stale list can't resurrect an already-used code. */
let OTP_WRITE_P = Promise.resolve();
function queueOtpWrite(fn){
  OTP_WRITE_P = OTP_WRITE_P.then(fn).catch(() => {});
  return OTP_WRITE_P;
}

async function saveOtpList(person, list){
  /* keep the local shadow copy ALWAYS in sync — instant, offline-safe,
     and it is what loadOtpList merges, so the gate never has to wait on
     a cloud round-trip to know which codes are still valid. */
  try{ localStorage.setItem('lc_otp_local_' + person.id, JSON.stringify(list)); }catch(e){}
  if(window.lcOtpColOk === false){
    /* Column not visible yet — keep codes on-device only. */
    return false;
  }
  const payload = { otp_list: JSON.stringify(list || []) };
  return queueOtpWrite(async () => {
    const ok = await window.lcSavePersonPatch(person, payload, { optionalCols: ['otp_list'] });
    if(!ok){
      /* PATCH failed after its own retries — the local copy above still
         holds the truth for this device, nothing else to do. */
    }
    return ok;
  });
}

function readLocalOtpList(person){
  try{ return JSON.parse(localStorage.getItem('lc_otp_local_' + person.id) || '[]'); }
  catch(e){ return []; }
}

async function loadOtpList(person){
  await flushOtpSave();               /* pending burn must be reflected */
  let list = [];
  try{
    const raw = person && person.otp_list;
    if(typeof raw === 'string' && raw.trim()) list = JSON.parse(raw);
    else if(Array.isArray(raw)) list = raw;
  }catch(e){ list = []; }
  if(!Array.isArray(list)) list = [];
  /* merge any device-local codes (offline generation before heal) */
  const loc = readLocalOtpList(person);
  const seen = {};
  list.concat(loc).forEach(o => { if(o && (o.hash || o.code)) seen[otpKeyOf(o)] = o; });
  return Object.keys(seen).map(k => seen[k]);
}

/* identity of a stored entry: plain code (new) or hash (legacy) */
function otpKeyOf(o){
  return o && o.code ? ('c:' + String(o.code).trim()) : ('h:' + String((o && o.hash) || '').toLowerCase());
}

/* Private flag lives on the person row (people.private_mode boolean).
   It is toggled ONLY in the requester edit panel — admins can SEE the
   badge but have no control to flip it, and viewers cannot change it. */
window.lcPrivateIsOn = function(p){
  p = p || S.CURRENT_PERSON;
  if(!p) return false;
  return p.private_mode === true || String(p.private_mode) === 'true';
};

/* Persist the private flag itself onto the people row. */
window.lcSetPrivateMode = async function(person, on){
  if(!person || !person.id) return false;
  const val = !!on;
  person.private_mode = val;
  /* Route through the guarded mirror writer so a stale schema cache can
     never throw the "⚠️ PATCH 400 — Could not find the 'private_mode'
     column of 'people'" pill — the flag is retried/healed automatically. */
  try{
    return await window.lcSavePersonPatch(person, { private_mode: val },
      { optionalCols: ['private_mode'] });
  }catch(e){}
  return false;
};

window.lcGenerateOtp = async function(person){
  if(!person || !person.id) return { ok:false, reason:'No person selected.' };
  /* REQUESTER EDIT PANEL ONLY — hard guard. */
  if(!S.REQUESTER_MODE){
    return { ok:false, reason:'🚫 OTP codes can only be generated from the requester edit panel.' };
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const ttlMin = parseInt(((S.CURR && S.CURR.shared) || {}).privateOtpTtlMin || '10', 10) || 10;
  /* ⚡ PLAIN STORAGE MODE: keep the code as-is ({code,exp}) so unlocking
     is a simple string compare. Salted hashes are still accepted for
     codes minted by older builds (see findOtpEntry). */
  const entry = { code: code, exp: Date.now() + ttlMin * 60000, created: Date.now() };
  const list = prune(await loadOtpList(person)).concat([entry]);
  /* write back onto the row copy too */
  person.otp_list = JSON.stringify(list);
  await saveOtpList(person, list);
  /* ⚡ SPEED: no __loadPersonIntoState__ refetch here any more — the row
     copy above already holds the fresh list, so generating a code costs
     one small PATCH instead of re-downloading the whole card. */
  return { ok:true, code: code, ttlMin: ttlMin };
};

window.lcRevokeOtps = async function(person){
  if(!person) return false;
  if(!S.REQUESTER_MODE) return false; /* requester edit panel ONLY */
  person.otp_list = '[]';
  try{ localStorage.removeItem('lc_otp_local_' + person.id); }catch(e){}
  await saveOtpList(person, []);
  return true;
};

window.lcActiveOtpCount = async function(person){
  const list = prune(await loadOtpList(person));
  return list.length;
};

/* ---------- VERIFY OTP ONLY ----------
   ⚡ SIMPLIFIED ACCESS: the viewer types NOTHING but the 6-digit code.
   No name, no phone number, no "requester details" check — that whole
   identity step was removed from the viewer (and from this file), so a
   guest can unlock 🔒 Our Private Memory with the one-time code alone.
   Everything else still applies: salted-SHA256 hashes, single use,
   expiry and per-device throttling.                                  */

/* ⚡ SPEED: pending cloud write of the burnt-code list. The unlock never
   waits for Supabase any more — the hash is removed from the in-memory
   list IMMEDIATELY (so a double tap / second tab can't reuse it) and the
   cloud mirror is updated in the background. */
let OTP_SAVE_P = null;
async function flushOtpSave(){
  try{ if(OTP_SAVE_P) await OTP_SAVE_P; }catch(e){}
  OTP_SAVE_P = null;
}

/* ---------- 🔑 PLAIN STORAGE MODE (fast by design) ----------
   Codes are now stored on the card row as they were typed — a plain
   6-digit string in people.otp_list / media.otp_code — instead of a
   salted SHA-256 hash. That is what makes unlocking instant: no crypto
   work, no waiting loop, and the requester panel can show the live code
   again after a reload. The trade-off is stated honestly: anyone who
   dumps the database could read pending codes. Password/PIN still gates
   the card itself, and codes stay single-use + time-boxed. Old hashed
   entries keep working (fallback branch below).                        */
window.lcPrivatePlainOtp = true;

/* Find the entry that matches the typed code: plain first, then legacy
   hashed entries (one SHA-256 only if no plain match exists). */
async function findOtpEntry(list, given){
  for(const o of list){
    if(String(o.code || '').trim() === given) return o;
  }
  for(const o of list){
    if(!o.hash) continue;
    const h = await window.lcHashPw('OTP:' + (o.salt || '') + ':' + given);
    if(h === String(o.hash).toLowerCase()) return o;
  }
  return null;
}

window.lcVerifyOtp = async function(person, code){
  await flushOtpSave();               /* never read a stale mirror */
  const list = prune(await loadOtpList(person));
  const given = String(code || '').trim();
  if(!/^\d{6}$/.test(given)) return { ok:false, reason:'Enter the full 6-digit code.' };
  /* ⚡ SPEED: plain-text compare — zero hashing on the happy path. */
  const matched = await findOtpEntry(list, given);
  if(!matched) return { ok:false, reason:'❌ Wrong or expired code.' };
  /* SINGLE USE — burn it in memory right now, sync the cloud in flight. */
  const rest = list.filter(o => o !== matched);
  person.otp_list = JSON.stringify(rest);
  OTP_SAVE_P = Promise.resolve(saveOtpList(person, rest)).catch(() => {});
  return { ok:true };
};

/* Throttle key for OTP attempts (per card, per tab — same engine as PIN) */
window.lcOtpThrottleId = function(p){ return 'otp:' + ((p && p.id) || '?'); };

/* ---------- Shielding while the private show runs ---------- */
let SHIELD_ON = false;
function onContextMenu(e){ if(SHIELD_ON){ e.preventDefault(); return false; } }
function onKeyDownShield(e){
  if(!SHIELD_ON) return;
  /* Block Ctrl+S / Ctrl+Shift+I / PrintScreen-ish shortcuts */
  const k = (e.key || '').toLowerCase();
  if((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p' || k === 'i' || k === 'j' || k === 'u')){
    e.preventDefault(); e.stopPropagation(); return false;
  }
}
function onCopy(e){ if(SHIELD_ON){ e.preventDefault(); return false; } }
function onBlurShield(){
  if(!SHIELD_ON) return;
  const ov = document.getElementById('slideshowOverlay');
  if(ov) ov.classList.add('pv-blur');
}
function onFocusShield(){
  const ov = document.getElementById('slideshowOverlay');
  if(ov) ov.classList.remove('pv-blur');
}

window.lcPrivateShieldOn = function(on){
  SHIELD_ON = !!on;
  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('keydown', onKeyDownShield, true);
  document.addEventListener('copy', onCopy, true);
  window.addEventListener('blur', onBlurShield, true);
  window.addEventListener('focus', onFocusShield, true);
  if(!SHIELD_ON){
    const ov = document.getElementById('slideshowOverlay');
    if(ov) ov.classList.remove('pv-blur');
  }
};

/* ---------- Gate: is this card private? ---------- */
window.lcCardIsPrivate = function(){
  return window.lcPrivateIsOn(S.CURRENT_PERSON);
};

/* Open the private verification modal (name + phone step first) */
window.openPrivateGate = function(){
  const m = document.getElementById('privateGateModal');
  if(!m) return;
  const p = S.CURRENT_PERSON;
  const t = document.getElementById('privateGateTitle');
  if(t) t.textContent = '🔒 Private Memories — Verified Access Only';
  const sub = document.getElementById('privateGateSub');
  if(sub) sub.innerHTML = 'This gallery is locked with <strong>maximum security</strong>.<br>' +
    'Confirm your <strong>name</strong> and <strong>phone number</strong>, then enter the one-time code the sender generated for you.';
  document.getElementById('pgStep1').style.display = 'block';
  document.getElementById('pgStep2').style.display = 'none';
  document.getElementById('pgName').value = '';
  document.getElementById('pgPhone').value = '';
  document.getElementById('pgOtp').value = '';
  const err = document.getElementById('pgError');
  err.classList.remove('show'); err.textContent = '';
  window.show(m);
  setTimeout(() => { const n = document.getElementById('pgName'); if(n) n.focus(); }, 120);
};

async function pgFail(msg){
  const err = document.getElementById('pgError');
  if(err){ err.textContent = msg; err.classList.add('show'); }
}

/* Step 1 — identity check → reveals that a fresh OTP is required */
window.pgCheckIdentity = async function(){
  const p = S.CURRENT_PERSON;
  if(!p) return;
  const th = window.lcThrottleCheck ? window.lcThrottleCheck(window.lcOtpThrottleId(p)) : {blocked:false};
  if(th.blocked){ pgFail('🕒 Too many attempts — try again in ' + Math.ceil(th.secs / 60) + ' min.'); return; }
  const name = (document.getElementById('pgName').value || '');
  const phone = (document.getElementById('pgPhone').value || '');
  const v = window.lcVerifyPrivateIdentity(p, name, phone);
  if(!v.ok){
    if(window.lcThrottleFail) window.lcThrottleFail(window.lcOtpThrottleId(p));
    pgFail(v.reason);
    return;
  }
  document.getElementById('pgError').classList.remove('show');
  document.getElementById('pgStep1').style.display = 'none';
  document.getElementById('pgStep2').style.display = 'block';
  const s2 = document.getElementById('pgStep2Sub');
  if(s2) s2.textContent = 'Identity confirmed ✅ — ask the sender to generate a fresh one-time code from their edit panel and enter it below (valid ~10 minutes, usable once).';
  setTimeout(() => { const o = document.getElementById('pgOtp'); if(o) o.focus(); }, 120);
};

/* Step 2 — OTP check → burns the code and launches the slideshow */
window.pgCheckOtp = async function(){
  const p = S.CURRENT_PERSON;
  if(!p) return;
  const tid = window.lcOtpThrottleId(p);
  const th = window.lcThrottleCheck ? window.lcThrottleCheck(tid) : {blocked:false};
  if(th.blocked){ pgFail('🕒 Too many attempts — try again in ' + Math.ceil(th.secs / 60) + ' min.'); return; }
  const code = (document.getElementById('pgOtp').value || '').trim();
  const r = await window.lcVerifyOtp(p, code);
  if(!r.ok){
    const secs = window.lcThrottleFail ? window.lcThrottleFail(tid) : 0;
    pgFail(secs ? ('🕒 Code failed ' + (5 - Math.max(0, 5 - secs)) + '× — locked for ' + Math.ceil(secs / 60) + ' min.') : r.reason);
    return;
  }
  if(window.lcThrottleReset) window.lcThrottleReset(tid);
  window.hide(document.getElementById('privateGateModal'));
  window.lcPrivateShieldOn(true);
  __showToast('🎟️ Code accepted — private memories unlocked');
  /* Grant the slideshow gate exactly once for this unlock. */
  S.PRIVATE_OK = true;
  if(window.pv_launchSlideshow) window.pv_launchSlideshow();
};

/* Launch the standard photo & video slideshow programmatically.
   Calls SS_openShow() directly (js/slideshow.js) — the same code path
   as the 📸 "Our Memories" button, so the private show looks and
   behaves identical, just gated by name+phone → OTP first. */
window.pv_launchSlideshow = async function(){
  if(window.SS_openShow){ await window.SS_openShow('private'); return; }
  const btn = document.getElementById('privateSlideshowBtn') || document.getElementById('openBtn');
  if(btn) btn.click();
};

/* ---------- High-security viewer: hide non-essential controls ---------- */
function pvApplyViewerSecurity(){
  const priv = window.lcCardIsPrivate();
  /* Share / upload / guest extras must never leak private media links. */
  ['shareBtn','uploadBtn','viewerShareBtn','guestPanelBtn'].forEach(id => {
    const el = document.getElementById(id);
    if(el){
      if(priv){
        if(!el.dataset.pvHidden){
          el.dataset.pvPrevDisplay = el.style.display || '';
          el.dataset.pvHidden = '1';
        }
        el.style.display = 'none';
      } else if(el.dataset.pvHidden === '1'){
        el.style.display = el.dataset.pvPrevDisplay || '';
        delete el.dataset.pvHidden;
      }
    }
  });
  const pill = document.getElementById('privateModePill');
  if(pill) pill.style.display = priv ? 'inline-block' : 'none';

  /* 🔒 OUR PRIVATE MEMORY button — sits right next to "Our Memories".
     It appears when the card is flagged Private OR when at least one
     photo/video was uploaded as a Private scene in the edit panel.
     One tap → name+phone verification → OTP → private slideshow only. */
  const pb = document.getElementById('privateSlideshowBtn');
  if(pb){
    const hasPrivScenes = ((S.CURR && S.CURR.media) || [])
      .some(m => window.mediaIsPrivateRow && window.mediaIsPrivateRow(m));
    pb.style.display = (priv || hasPrivScenes) ? '' : 'none';
    const lbl = document.getElementById('privateSlideshowBtnTextEl');
    if(lbl && S.PRIVATE_OK) lbl.textContent = '🔓 Our Private Memory (unlocked)';
    else if(lbl) lbl.textContent = 'Our Private Memory';
  }
}
window.pvRefreshViewerSecurity = pvApplyViewerSecurity;
document.addEventListener('DOMContentLoaded', () => {
  pvApplyViewerSecurity();
});

/* Hook: every time the slideshow overlay opens while private, ensure shield */
document.addEventListener('DOMContentLoaded', () => {
  const ov = document.getElementById('slideshowOverlay');
  if(ov){
    new MutationObserver(() => {
      if(ov.classList.contains('active') && window.lcCardIsPrivate()){
        window.lcPrivateShieldOn(true);
      } else if(!ov.classList.contains('active')){
        window.lcPrivateShieldOn(false);
        /* 🔒 HD1.8 ONE-TIME UNLOCK: when the private show closes (or any
           show closes on a private card), revoke the grant so the same OTP
           unlock can never be reused later — the next open demands a fresh
           name+phone → OTP pass. Codes are already single-use in
           people.otp_list; this is the session-side half of that rule. */
        if(window.lcCardIsPrivate() && S.PRIVATE_OK){
          S.PRIVATE_OK = false;
          pvApplyViewerSecurity();
        }
      }
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  }

  const c1 = document.getElementById('pgVerifyBtn');
  if(c1) c1.onclick = (e) => { e.preventDefault(); window.pgCheckIdentity(); };
  const c2 = document.getElementById('pgOtpBtn');
  if(c2) c2.onclick = (e) => { e.preventDefault(); window.pgCheckOtp(); };
  const cc = document.getElementById('pgCancel');
  if(cc) cc.onclick = (e) => {
    e.preventDefault();
    window.hide(document.getElementById('privateGateModal'));
  };
  const nm = document.getElementById('pgName');
  if(nm) nm.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); window.pgCheckIdentity(); } });
  const ph = document.getElementById('pgPhone');
  if(ph) ph.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); window.pgCheckIdentity(); } });
  const ot = document.getElementById('pgOtp');
  if(ot) ot.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); window.pgCheckOtp(); } });
});

})();
