/* ============================================================
   privateview.js — 🔒 PRIVATE PHOTO VIEWER (high-security mode)
   ------------------------------------------------------------
   A card can be flagged "Private" by the REQUESTER in their edit
   panel (Requester → 🔒 Private tab). Once private:

     • The normal viewer path is HARD-BLOCKED — a password/PIN alone
       never opens the media slideshow of a private card. Only an
       OTP unlocks it, so nobody who merely knows the password can
       see the photos/videos.
     • To watch the slideshow the guest must verify their NAME and
       PHONE NUMBER against the requester details saved on the card.
     • The 6-digit OTP itself is generated ONLY from the requester's
       edit panel (js/requester.js → "🎟️ Generate OTP"). Admins and
       viewers can never mint codes — the generator lives nowhere else.
     • Codes are hashed (salted SHA-256 via security.js), single-use,
       time-boxed (default 10 min), throttled (5 wrong tries → lock).
     • While the private slideshow runs the screen is shielded:
       right-click/save/context-menu/copy are blocked, screenshots on
       mobile blur the content, and leaving the tab pauses playback.

   Storage: people.otp_list holds JSON [{hash, salt, exp, created}].
   Offline-safe: writes go through lcSavePersonPatch() which queues to
   IndexedDB when offline (setup/pin_otp_safe.sql ensures the column).
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

/* ---------- schema guard for the otp_list mirror column ---------- */
window.lcOtpColOk = null; /* null unknown / true visible / false missing */

async function saveOtpList(person, list){
  const payload = { otp_list: JSON.stringify(list || []) };
  if(window.lcOtpColOk === false){
    /* Column not visible yet — keep codes on-device only. */
    try{ localStorage.setItem('lc_otp_local_' + person.id, JSON.stringify(list)); }catch(e){}
    return false;
  }
  const ok = await window.lcSavePersonPatch(person, payload, { optionalCols: ['otp_list'] });
  if(!ok){
    try{ localStorage.setItem('lc_otp_local_' + person.id, JSON.stringify(list)); }catch(e){}
  }
  return ok;
}

function readLocalOtpList(person){
  try{ return JSON.parse(localStorage.getItem('lc_otp_local_' + person.id) || '[]'); }
  catch(e){ return []; }
}

async function loadOtpList(person){
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
  list.concat(loc).forEach(o => { if(o && o.hash) seen[o.hash] = o; });
  return Object.keys(seen).map(k => seen[k]);
}

/* purge expired entries whenever we touch the list */
function prune(list){
  const now = Date.now();
  return (list || []).filter(o => o && o.exp && o.exp > now);
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
  const salt = Array.from({length:8}, () => Math.floor(Math.random()*256).toString(16).padStart(2,'0')).join('');
  const hash = await window.lcHashPw('OTP:' + salt + ':' + code);
  const ttlMin = parseInt(((S.CURR && S.CURR.shared) || {}).privateOtpTtlMin || '10', 10) || 10;
  const entry = { hash: hash, salt: salt, exp: Date.now() + ttlMin * 60000, created: Date.now() };
  const list = prune(await loadOtpList(person)).concat([entry]);
  /* write back onto the row copy too */
  person.otp_list = JSON.stringify(list);
  await saveOtpList(person, list);
  try{ if(window.__loadPersonIntoState__) await window.__loadPersonIntoState__(person, {fresh:true}); }catch(e){}
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

/* ---------- VERIFY identity + OTP ---------- */
function normPhone(v){
  return String(v || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
}
function normName(v){
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

window.lcVerifyPrivateIdentity = function(person, name, phone){
  const wantName = normName(person.requester_name || '');
  const wantPhone = normPhone(person.requester_whatsapp || person.requester_phone || '');
  const gotName = normName(name);
  const gotPhone = normPhone(phone);
  if(!wantName || !wantPhone){
    /* No identity on file — cannot verify. Ask admin/requester to fill it. */
    return { ok:false, reason:'⚠️ This card has no verified requester details on file. Ask the sender to confirm your access.' };
  }
  const nameOk = gotName === wantName ||
                 (gotName && wantName.indexOf(gotName) === 0) ||
                 (wantName && gotName.indexOf(wantName.split(' ')[0]) === 0 && gotName.split(' ')[0] === wantName.split(' ')[0]);
  const phoneOk = gotPhone === wantPhone ||
                  (gotPhone.length >= 8 && (wantPhone.endsWith(gotPhone) || gotPhone.endsWith(wantPhone)));
  if(!nameOk) return { ok:false, reason:'❌ Name does not match the requester record.' };
  if(!phoneOk) return { ok:false, reason:'❌ Phone number does not match the requester record.' };
  return { ok:true };
};

window.lcVerifyOtp = async function(person, code){
  const list = prune(await loadOtpList(person));
  const given = String(code || '').trim();
  if(!/^\d{6}$/.test(given)) return { ok:false, reason:'Enter the full 6-digit code.' };
  let matched = null;
  for(const o of list){
    const h = await window.lcHashPw('OTP:' + (o.salt || '') + ':' + given);
    if(h === String(o.hash).toLowerCase()){ matched = o; break; }
  }
  if(!matched) return { ok:false, reason:'❌ Wrong or expired code.' };
  /* SINGLE USE — burn it immediately, even before opening the show. */
  const rest = list.filter(o => o !== matched);
  person.otp_list = JSON.stringify(rest);
  await saveOtpList(person, rest);
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

/* Does this card have ANY media flagged Private? Async — reads the media
   table straight from the cloud/queue so it works even before the viewer
   state (S.CURR.media) has been populated. Used by js/home.js to decide
   whether a correct password/PIN on a NON-private card should still be
   routed through the OTP gate (private scenes must never leak). */
window.lcHasPrivateScenesAsync = async function(p){
  p = p || (S && S.CURRENT_PERSON);
  if(!p || !p.id) return false;
  /* fast path: state already loaded */
  try{
    const rows = (S.CURR && S.CURR.media) || [];
    if(rows.length && rows.some(m => window.mediaIsPrivateRow && window.mediaIsPrivateRow(m))) return true;
    if(rows.length) return false;
  }catch(e){}
  /* slow path: query the media table directly */
  try{
    if(window.sb && window.T_MEDIA){
      const rows = await window.sb.rows(window.T_MEDIA, p.id);
      return (rows || []).some(m => window.mediaIsPrivateRow && window.mediaIsPrivateRow(m));
    }
  }catch(e){}
  return false;
};

/* Open the private verification modal.
   🔓 HD1.9: name + phone identity verification is NO LONGER required —
   the only gate for "Our Private Memory" is the 6-digit OTP minted by
   the requester. Step 1 (pgStep1 / pgName / pgPhone) has been removed
   from the markup entirely.
   ⚡ HD1.9.2 ROBUSTNESS: privateview.js is loaded with `defer`, so a fast
   tap on the 🔒 button can reach this function BEFORE our own DOMContentLoaded
   bindings have run. Previously the buttons had no click handlers yet and the
   modal never opened — the exact "site gets stuck / nothing happens" symptom.
   Now we bind lazily right here, and if the modal markup is missing entirely
   we fall back to an inline prompt so the flow NEVER dead-ends. */
let PG_BOUND = false;
function pgEnsureBound(){
  if(PG_BOUND) return;
  PG_BOUND = true;
  const c2 = document.getElementById('pgOtpBtn');
  if(c2 && !c2.onclick) c2.onclick = (e) => { e.preventDefault(); window.pgCheckOtp(); };
  const cc = document.getElementById('pgCancel');
  if(cc && !cc.onclick) cc.onclick = (e) => {
    e.preventDefault();
    window.hide(document.getElementById('privateGateModal'));
  };
  const ot = document.getElementById('pgOtp');
  if(ot && !ot._pgKeyBound){
    ot._pgKeyBound = true;
    ot.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); window.pgCheckOtp(); } });
  }
}

async function pgInlineFallback(){
  /* Last-resort, non-blocking path when the modal markup is absent. */
  const p = S.CURRENT_PERSON;
  if(!p) return;
  const code = window.prompt('🔒 Enter the 6-digit one-time code the sender generated for you:');
  if(code == null) return;
  const r = await window.lcVerifyOtp(p, String(code).trim());
  if(!r || !r.ok){
    if(window.__showToast) window.__showToast('❌ Invalid or expired code.', false);
    return;
  }
  S.PRIVATE_OK = true;
  if(window.__showToast) window.__showToast('🎟️ Code accepted — private memories unlocked');
  if(window.pv_launchSlideshow) await window.pv_launchSlideshow();
}

window.openPrivateGate = function(){
  const m = document.getElementById('privateGateModal');
  if(!m){
    if(window.__showToast) window.__showToast('🔒 Opening the private code entry…', false);
    try{ pgInlineFallback(); }catch(e){ console.error(e); }
    return;
  }
  pgEnsureBound();
  const t = document.getElementById('privateGateTitle');
  if(t) t.textContent = '🔒 Private Memories — One-Time Code Required';
  const sub = document.getElementById('privateGateSub');
  if(sub) sub.innerHTML = 'This gallery is locked with <strong>maximum security</strong>.<br>' +
    'Enter the <strong>6-digit one-time code</strong> the sender generated for you.';
  const s2 = document.getElementById('pgStep2');
  if(s2) s2.style.display = 'block';
  const s2sub = document.getElementById('pgStep2Sub');
  if(s2sub) s2sub.textContent = 'Ask the sender to generate a fresh one-time code from their edit panel and enter it below (valid ~10 minutes, usable once).';
  const gO = document.getElementById('pgOtp'); if(gO) gO.value = '';
  const err = document.getElementById('pgError');
  err.classList.remove('show'); err.textContent = '';
  window.show(m);
  setTimeout(() => { const o = document.getElementById('pgOtp'); if(o) o.focus(); }, 120);
};

async function pgFail(msg){
  const err = document.getElementById('pgError');
  if(err){ err.textContent = msg; err.classList.add('show'); }
}

/* 🔓 HD1.9: Step 1 (name + phone identity check) has been removed —
   the gate is OTP-only. This stub stays so any legacy callers / inline
   handlers never throw; it simply jumps straight to the code step. */
window.pgCheckIdentity = function(){
  const s2 = document.getElementById('pgStep2');
  if(s2) s2.style.display = 'block';
  const o = document.getElementById('pgOtp');
  if(o) setTimeout(() => o.focus(), 120);
};

async function pgCheckOtp(){
  const p = S.CURRENT_PERSON;
  if(!p) return;
  const codeEl = document.getElementById('pgOtp');
  const btn = document.getElementById('pgOtpBtn');
  const code = ((codeEl && codeEl.value) || '').trim();
  if(!/^\d{4,8}$/.test(code)){
    pgFail('🎟️ Please enter the 6-digit one-time code from the sender.');
    return;
  }
  /* ⚡ HD1.9.2: disable the button while verifying so a double-tap can
     never fire two cloud checks (the old "tap does nothing / stuck" feel). */
  if(btn){ btn.disabled = true; btn.dataset.origLabel = btn.textContent; btn.textContent = '⏳ Verifying…'; }
  let r = null;
  try{
    const tid = window.lcOtpThrottleId ? window.lcOtpThrottleId(p) : null;
    const th = (tid != null && window.lcThrottleCheck) ? window.lcThrottleCheck(tid) : {blocked:false};
    if(th.blocked){ pgFail('🕒 Too many attempts — try again in ' + Math.ceil(th.secs / 60) + ' min.'); return; }
    r = await window.lcVerifyOtp(p, code);
    if(!r || !r.ok){
      const secs = (tid != null && window.lcThrottleFail) ? window.lcThrottleFail(tid) : 0;
      pgFail(secs ? ('🕒 Code failed — locked for ' + Math.ceil(secs / 60) + ' min.') : ((r && r.reason) || '❌ Invalid or expired code.'));
      return;
    }
    if(tid != null && window.lcThrottleReset) window.lcThrottleReset(tid);
    if(window.hide) window.hide(document.getElementById('privateGateModal'));
    if(window.lcPrivateShieldOn) window.lcPrivateShieldOn(true);
    if(window.__showToast) window.__showToast('🎟️ Code accepted — private memories unlocked');
    /* Grant the slideshow gate exactly once for this unlock. */
    S.PRIVATE_OK = true;
    if(window.pv_launchSlideshow) await window.pv_launchSlideshow();
  }catch(e){
    console.error('OTP verify failed:', e);
    pgFail('❌ Verification hiccup — please try again.');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = btn.dataset.origLabel || '🎟️ Unlock Slideshow'; }
  }
}

/* Step 2 — OTP check → burns the code and launches the slideshow.
   Exposed on window (the gate buttons + Enter key call window.pgCheckOtp). */
window.pgCheckOtp = pgCheckOtp;

/* Launch the standard photo & video slideshow programmatically.
   Calls SS_openShow() directly (js/slideshow.js) — the same code path
   as the 📸 "Our Memories" button, so the private show looks and
   behaves identical, just gated by the one-time code first. */
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
     It appears whenever at least one photo/video was uploaded as a
     Private scene in the edit panel (or the card is flagged private).
     One tap → OTP code only (🔓 HD1.9: no name/phone verification) →
     private slideshow. */
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
           fresh one-time-code pass. Codes are already single-use in
           people.otp_list; this is the session-side half of that rule. */
        if(window.lcCardIsPrivate() && S.PRIVATE_OK){
          S.PRIVATE_OK = false;
          pvApplyViewerSecurity();
        }
      }
    }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  }

  const c2 = document.getElementById('pgOtpBtn');
  if(c2) c2.onclick = (e) => { e.preventDefault(); window.pgCheckOtp(); };
  const cc = document.getElementById('pgCancel');
  if(cc) cc.onclick = (e) => {
    e.preventDefault();
    window.hide(document.getElementById('privateGateModal'));
  };
  const ot = document.getElementById('pgOtp');
  if(ot && !ot._pgKeyBound){
    ot._pgKeyBound = true;
    ot.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); window.pgCheckOtp(); } });
  }
  pgEnsureBound(); /* keep the lazy flag in sync */
});

})();
