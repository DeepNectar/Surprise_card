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
   🔧 HD1.9.1 ROBUSTNESS: this function can now be called at ANY moment,
   even before privateview.js's DOMContentLoaded bindings have run (the
   old build silently did nothing when tapped early — that was the main
   reason "Our Private Memory appeared not to work"). Handlers are bound
   on demand right here, so Unlock / Cancel / Enter always respond. */
let PV_GATE_BOUND = false;
function pvBindGateHandlers(){
  if(PV_GATE_BOUND) return;
  const c2 = document.getElementById('pgOtpBtn');
  const cc = document.getElementById('pgCancel');
  const ot = document.getElementById('pgOtp');
  if(!c2 || !cc || !ot) return; /* controls missing in DOM — retry later */
  c2.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.pgCheckOtp(); };
  cc.onclick = (e) => {
    e.preventDefault();
    window.hide(document.getElementById('privateGateModal'));
  };
  ot.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); window.pgCheckOtp(); } });
  PV_GATE_BOUND = true;
}

window.openPrivateGate = function(){
  const m = document.getElementById('privateGateModal');
  if(!m){ console.warn('[privateview] #privateGateModal not in DOM yet.'); return; }
  pvBindGateHandlers(); /* bind NOW, regardless of DOMContentLoaded timing */
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
  if(err){ err.classList.remove('show'); err.textContent = ''; }
  pvBindGateHandlers(); /* re-try binding in case the first call raced page parse */
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

/* Step 2 — OTP check → burns the code and launches the slideshow */
window.pgCheckOtp = async function(){
  const p = S.CURRENT_PERSON;
  if(!p){ pgFail('⚠️ No card is open yet — unlock the card first, then enter the code.'); return; }
  /* 🔧 HD1.9.1: defensive fallback — some legacy paths set the gate
     grant on a different state object than the one this module closed
     over at load time. Always keep BOTH in sync so the private show
     can never dead-end after a correct code. */
  const sGlobal = window.__PAGE_STATE__;
  const grantPrivateOk = () => {
    S.PRIVATE_OK = true;
    if(sGlobal && sGlobal !== S) sGlobal.PRIVATE_OK = true;
  };
  const tid = window.lcOtpThrottleId(p);
  const th = window.lcThrottleCheck ? window.lcThrottleCheck(tid) : {blocked:false};
  if(th.blocked){ pgFail('🕒 Too many attempts — try again in ' + Math.ceil(th.secs / 60) + ' min.'); return; }
  const inp = document.getElementById('pgOtp');
  const code = ((inp && inp.value) || '').trim();
  const r = await window.lcVerifyOtp(p, code);
  if(!r.ok){
    const secs = window.lcThrottleFail ? window.lcThrottleFail(tid) : 0;
    pgFail(secs ? ('🕒 Code failed too many times — locked for ' + Math.ceil(secs / 60) + ' min.') : r.reason);
    return;
  }
  if(window.lcThrottleReset) window.lcThrottleReset(tid);
  window.hide(document.getElementById('privateGateModal'));
  window.lcPrivateShieldOn(true);
  __showToast('🎟️ Code accepted — private memories unlocked');
  /* Grant the slideshow gate exactly once for this unlock. */
  grantPrivateOk();
  if(window.pvRefreshViewerSecurity) try{ window.pvRefreshViewerSecurity(); }catch(e){}
  if(window.pv_launchSlideshow) window.pv_launchSlideshow();
};

/* Launch the standard photo & video slideshow programmatically.
   Calls SS_openShow() directly (js/slideshow.js) — the same code path
   as the 📸 "Our Memories" button, so the private show looks and
   behaves identical, just gated by the one-time code first. */
window.pv_launchSlideshow = async function(){
  if(window.SS_openShow){ await window.SS_openShow('private'); return; }
  /* 🔧 HD1.9.1: slideshow.js not loaded yet (deferred scripts) — wait a
     moment and retry instead of silently doing nothing after unlock. */
  let tries = 0;
  const retry = () => {
    if(window.SS_openShow){ window.SS_openShow('private'); return; }
    if(++tries < 20){ setTimeout(retry, 150); return; }
    const btn = document.getElementById('privateSlideshowBtn') || document.getElementById('openBtn');
    if(btn) btn.click();
  };
  setTimeout(retry, 150);
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
    /* 🔧 HD1.9.1: state.media is often EMPTY at this moment (the viewer
       loads media rows asynchronously AFTER the card opens, and the old
       build hid the button until then — so "Our Private Memory" simply
       never appeared / felt broken). Fix: keep the button visible while
       we don't know yet, and re-run this refresh once media arrives. */
    const mediaLoaded = !!(S.CURR && Array.isArray(S.CURR.media) && S.CURR.media.length);
    const hasPrivScenes = ((S.CURR && S.CURR.media) || [])
      .some(m => window.mediaIsPrivateRow && window.mediaIsPrivateRow(m));
    if(!mediaLoaded && !priv){
      /* unknown yet → show optimistically; async check confirms below */
      pb.style.display = '';
      window.lcHasPrivateScenesAsync(S.CURRENT_PERSON).then(has => {
        if(has){ pb.style.display = ''; }
        else if(!window.lcCardIsPrivate()){ pb.style.display = 'none'; }
        pvApplyViewerSecurity(); /* settle label + final visibility */
      }).catch(()=>{});
    } else {
      pb.style.display = (priv || hasPrivScenes) ? '' : 'none';
    }
    const lbl = document.getElementById('privateSlideshowBtnTextEl');
    const st = window.__PAGE_STATE__ || S;
    if(lbl && (st.PRIVATE_OK || S.PRIVATE_OK)) lbl.textContent = '🔓 Our Private Memory (unlocked)';
    else if(lbl) lbl.textContent = 'Our Private Memory';
  }
}
window.pvRefreshViewerSecurity = pvApplyViewerSecurity;
document.addEventListener('DOMContentLoaded', () => {
  pvApplyViewerSecurity();
});
/* 🔧 HD1.9.1: every time a card finishes loading its content into the
   shared state, re-evaluate the private button (viewer.js calls this
   hook after __loadPersonIntoState__ fills S.CURR.media). */
document.addEventListener('lc-card-loaded', () => { try{ pvApplyViewerSecurity(); }catch(e){} });

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

  const privBtn = document.getElementById('privateSlideshowBtn');
  if(privBtn){
    /* 🔧 HD1.9.1: safety-net click handler. privateview.js loads BEFORE
       slideshow.js, but slideshow.js assigns privBtn.onclick afterwards —
       an onclick assignment does NOT cancel addEventListener listeners,
       so BOTH would fire on one tap. Guarded with a short debounce flag
       so the gate can never open twice; when slideshow.js is present and
       healthy its onclick does the real work and this listener idles out.
       Also force-shows the button at load (pvApplyViewerSecurity runs
       before media rows are loaded, which otherwise hides it). */
    privBtn.style.display = '';
    let BUSY = false;
    privBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      if(BUSY) return;
      setTimeout(() => { BUSY = false; }, 700);
      BUSY = true;
      try{
        const st = window.__PAGE_STATE__ || S;
        if(st.PRIVATE_OK || S.PRIVATE_OK) return; /* slideshow.js handles unlocked taps */
        const p = S.CURRENT_PERSON || st.CURRENT_PERSON;
        if(!p){ __showToast('🔒 Unlock the card first.', false); return; }
        const hasPriv = await window.lcHasPrivateScenesAsync(p);
        if(!hasPriv){
          __showToast('🔒 No private memories yet — the sender must add photos in the 🔒 Private Media tab of the edit panel.', false);
          return;
        }
      }catch(err){ console.warn('[privateview] pre-gate check failed:', err); }
      try{ window.openPrivateGate(); }
      catch(err){ console.error('[privateview] gate open failed:', err); __showToast('❌ Could not open the private lock.', false); }
    });
  }

  /* 🔧 HD1.9.1: gate modal handlers bound on demand as well (they were
     previously bound only at DOMContentLoaded — now openPrivateGate()
     binds them itself, so early calls work too). */
  pvBindGateHandlers();
});

})();
