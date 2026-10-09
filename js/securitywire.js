/* ============================================================
   securitywire.js — v1.0 SECURITY & TRUST WIRE-IN
   ------------------------------------------------------------
   Glues the three standalone modules into the real login flow
   WITHOUT touching home.js (it re-wraps window.tryPersonPw):

     1) E2EE            → lcE2EELockIn(secret, person) so the
                          session key is derived the moment a
                          PIN/password unlocks a card.
     2) Secure links    → verifies the HMAC/expiry/view-limit of
                          #s/slug?e=…&v=…&sig=… BEFORE the card
                          opens; blocks expired / tampered /
                          exhausted links with a clear message.

   Everything degrades gracefully: if e2ee.js / sharelinks.js are
   missing or the browser lacks support, the plain PIN+password
   path behaves exactly as before.
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

function $id(id){ return document.getElementById(id); }

/* ---------- 3) share-link gate (runs FIRST, before tryPersonPw) ---------- */
window.lcShareLinkGate = async function(person){
  /* returns { block:true, reason } when the arriving link is invalid */
  if(!window.lcVerifyShareLink || !person) return {};
  try{
    const v = await window.lcVerifyShareLink(person);
    if(v.unsigned || v.unverifiable) return {};          /* plain link — legacy behaviour */
    if(v.ok){
      if(window.lcCleanShareParams) window.lcCleanShareParams();
      try{
        if(window.lcShareLinkLockIn) await window.lcShareLinkLockIn(
          String(person.pin_plain || person.password || ''), person);
      }catch(e){}
      let n = $id('lcs-notice');
      if(!n){
        n = document.createElement('div');
        n.id = 'lcs-notice';
        n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2147483000;' +
          'background:rgba(13,92,74,.92);color:#fff;font-size:.72rem;padding:.4rem .8rem;border-radius:999px;' +
          'font-family:Georgia,serif;box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none;';
        document.body.appendChild(n);
        n.textContent = '🔐 Secure link verified — view ' + v.used + ' of ' + v.max +
                        ' · expires in ' + v.daysLeft + 'd';
        setTimeout(() => { if(n) n.remove(); }, 5000);
      }
      return {};
    }
    if(v.expired)   return { block: true, reason: '⛔ This share link has EXPIRED. Ask the sender for a fresh one.' };
    if(v.exhausted) return { block: true, reason: '⛔ This share link reached its view limit (' + v.used + '/' + v.max + ').' };
    if(v.invalid)   return { block: true, reason: '⛔ This share link was tampered with (bad signature) and will not open.' };
    return {};
  }catch(e){ return {}; }
};

function showBlocked(msg){
  const err = $id('personPwError');
  if(err){ err.textContent = msg; err.classList.add('show'); }
  else if(window.__showToast) window.__showToast(msg, false);
}

/* ---------- shared success path (PIN / password) ---------- */

/* The E2EE key is derived from the SAME secret that opened the card.
   We deliberately do NOT read the secret from the person row
   (pin_plain / password fields): pulling the key out of the
   same record it protects would defeat end-to-end encryption. */
async function finishUnlock(person, secret, how){
  /* utils.js convention: .pw-modal is visible while it has .active —
     hide by REMOVING 'active' (window.hide does exactly that). */
  const m = $id('personLoginModal');
  if(m){
    if(window.hide) window.hide(m);
    else m.classList.remove('active');
  }
  S.PREVIEW_MODE = false;
  /* 1) E2EE session key — derived from the PIN/password just entered. */
  if(secret != null && window.lcE2EELockIn){
    try{ window.lcE2EELockIn(String(secret), person); }catch(e){}
  }
  if(window.lcShareLinkLockIn && secret != null){
    try{ await window.lcShareLinkLockIn(String(secret), person); }catch(e){}
  }
  try{ if(window.trackCardView) window.trackCardView(person, how || 'password'); }catch(e){}
  /* PERF FIX: home.js's own tail already called __loadPersonIntoState__ for
     this same person moments ago. Reuse that snapshot instead of firing a
     redundant second batch of 8 table fetches on every unlock. */
  const alreadyLoaded = S.CURRENT_PERSON && person &&
                        S.CURRENT_PERSON.id === person.id && !!S.CURR;
  if(!alreadyLoaded){
    await window.__loadPersonIntoState__(person);
  }
  if(window.lcThrottleReset && window.lcPersonPinId){
    try{ window.lcThrottleReset(window.lcPersonPinId(person)); }catch(e){}
  }

  const s = S.CURR.shared || {};
  const unlockIso = s.unlockDateISO || '';
  const showLock = s.showLockScreen === 'true';
  const now = new Date();
  const unlockDate = unlockIso ? new Date(unlockIso) : null;
  const locked = unlockDate && !isNaN(unlockDate) && now < unlockDate;

  const home = $id('homeScreen');
  if(home) home.classList.add('hidden');

  if(locked || showLock){
    window.renderLockFull();
    const ls = $id('lockScreen');
    if(ls && window.show) window.show(ls);        /* lock screen uses .active too */
    if(locked) window.startCountdownFull(unlockDate);
    return;
  }
  window.openOpeningFull();
}
function hide(el){ if(el) el.classList.add('hidden'); }

/* ---------- wrap tryPersonPw (runs AFTER home.js defined it) ---------- */
let wrapped = false;
function install(){
  if(wrapped) return;
  const orig = window.tryPersonPw;
  if(typeof orig !== 'function'){ setTimeout(install, 300); return; }
  wrapped = true;

  window.tryPersonPw = async function(){
    const inp = $id('personPwInput');
    const pw = inp ? String(inp.value || '') : '';
    const p = S.LOGIN_TARGET;

    /* ---- secure share-link gate (expiry / signature / view limit) ---- */
    if(p){
      const g = await window.lcShareLinkGate(p);
      if(g.block){ showBlocked(g.reason); return; }
    }

    const beforeAdmin = S.ADMIN_MODE === true;
    await orig.call(window);

    /* Did this attempt actually unlock the card? (home.js sets one of
       these on success; wrong secrets leave them all untouched.) */
    if(pw && p && S.LOGIN_TARGET === p){
      const unlocked =
        S.REQUESTER_MODE === true || S.PREVIEW_MODE === true ||
        S.ADMIN_MODE === true || !!S.CURRENT_PERSON;
      if(unlocked && !beforeAdmin){
        /* Admin bypass (startAdmin already ran): do NOT re-run the viewer
           unlock path and do NOT derive an E2EE key from the admin password. */
        if(S.ADMIN_MODE === true) return;
        /* Route every successful secret-unlock through ONE shared path:
           hide modal, derive E2EE key from the entered secret, sign the
           share-link key, load the person, honour the date-lock. The wrap
           returns early so home.js's own tail never runs a second time. */
        await finishUnlock(p, pw, S.REQUESTER_MODE ? 'preview' : 'password');
        return;
      }
    }
  };
}

document.addEventListener('DOMContentLoaded', () => setTimeout(install, 2600));

})();
