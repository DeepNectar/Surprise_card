/* ============================================================
   securitywire.js — v1.0 SECURITY & TRUST WIRE-IN
   ------------------------------------------------------------
   Glues the three standalone modules into the real login flow
   WITHOUT touching home.js (it re-wraps window.tryPersonPw):

     1) E2EE            → lcE2EELockIn(secret, person) so the
                          session key is derived the moment a
                          PIN/password unlocks a card.
     2) WebAuthn        → 🔑 "Unlock with passkey" button in the
   (viewer-focused)      login modal + "Save passkey on this
                          device" after a successful unlock.
     3) Secure links    → verifies the HMAC/expiry/view-limit of
                          #s/slug?e=…&v=…&sig=… BEFORE the card
                          opens; blocks expired / tampered /
                          exhausted links with a clear message.

   Everything degrades gracefully: if e2ee.js / passkeys.js /
   sharelinks.js are missing or the browser lacks support, the
   plain PIN+password path behaves exactly as before.
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
  else alert(msg);
}

/* ---------- passkey buttons in the login modal ---------- */
function ensurePkButtons(){
  const box = document.querySelector('#personLoginModal .pw-buttons');
  if(!box || $id('pkUnlockBtn')) return;
  const pk = document.createElement('button');
  pk.type = 'button'; pk.id = 'pkUnlockBtn'; pk.className = 'pw-btn confirm';
  pk.style.cssText = 'background:#0d5c4a;color:#fff;';
  pk.textContent = '🔑 Passkey';
  pk.title = 'Unlock with Face ID / fingerprint';
  box.insertBefore(pk, box.firstChild);

  const save = document.createElement('button');
  save.type = 'button'; save.id = 'pkSaveBtn'; save.className = 'pw-btn cancel';
  save.textContent = '💾 Save passkey';
  save.title = 'Store a passkey for this card on this device';
  box.appendChild(save);

  pk.onclick = async (e) => {
    if(e && e.preventDefault) e.preventDefault();
    const p = S.LOGIN_TARGET;
    if(!p) return;
    if(!window.lcPasskeysSupported || !window.lcPasskeysSupported()){
      showBlocked('🔑 Passkeys need an updated browser over https.'); return;
    }
    if(!window.lcPasskeyExists(p)){
      showBlocked('🔑 No passkey saved for this card yet — unlock once with your PIN/password, then tap "💾 Save passkey".'); return;
    }
    /* gate the arriving secure link first */
    const g = await window.lcShareLinkGate(p);
    if(g.block){ showBlocked(g.reason); return; }
    const r = await window.lcPasskeyUnlock(p);
    if(r.ok){
      hideErr();
      /* finishUnlock owns: modal hide, E2EE key prompt, load, lock/opening */
      await finishUnlock(p, null, 'passkey');
    } else if(r.cancelled){ /* user dismissed the biometric sheet */ }
    else showBlocked('🔑 Passkey did not verify — use your PIN or password.');
  };

  save.onclick = async (e) => {
    if(e && e.preventDefault) e.preventDefault();
    const p = S.LOGIN_TARGET;
    if(!p) return;
    if(!window.lcPasskeysSupported || !window.lcPasskeysSupported()){
      showBlocked('🔑 Passkeys need an updated browser over https.'); return;
    }
    const btn = $id('pkSaveBtn');
    btn.textContent = '⏳ Follow the prompt…';
    const r = await window.lcPasskeyEnroll(p);
    if(r && r.ok){ btn.textContent = '✅ Passkey saved!'; }
    else if(r && r.error){ btn.textContent = '❌ Cancelled'; }
    else btn.textContent = '🔑 Not supported';
    setTimeout(() => { btn.textContent = '💾 Save passkey'; }, 2200);
  };
}
function hideErr(){
  const err = $id('personPwError');
  if(err) err.classList.remove('show');
}

/* ---------- shared success path (PIN / password / passkey) ---------- */

/* The E2EE key must be derived from the SAME secret that opened the card.
   Passkeys never reveal the secret themselves, so after a biometric unlock
   we ask the viewer ONCE for their PIN/password to derive the decryption
   key (the passkey already proved identity — this step only unlocks the
   encrypted content). We deliberately do NOT read the secret from the
   person row (pin_plain / password fields): pulling the key out of the
   same record it protects would defeat end-to-end encryption. */
async function promptForSecret(person){
  const q = '🔐 Enter your PIN or password once to decrypt this card\'s ' +
            'private messages & photos.\n(Your passkey unlocked the card; ' +
            'this unlocks the encrypted content.)';
  let s = null;
  try{ s = window.prompt(q, ''); }catch(e){ return null; }
  if(s == null) return null;                       /* cancelled */
  s = String(s);
  if(!s.trim()) return null;
  /* validate against the real card secret before trusting it as a key */
  if(window.lcVerifyPin){
    try{ if(await window.lcVerifyPin(person, s)) return s; }catch(e){}
  }
  const expected = String((person && person.password) || '');
  if(expected && s === expected) return s;
  showBlocked('🔑 Wrong PIN/password — card opened but encrypted content stays locked.');
  return null;
}

async function finishUnlock(person, secret, how){
  /* utils.js convention: .pw-modal is visible while it has .active —
     hide by REMOVING 'active' (window.hide does exactly that). */
  const m = $id('personLoginModal');
  if(m){
    if(window.hide) window.hide(m);
    else m.classList.remove('active');
  }
  S.PREVIEW_MODE = false;
  /* 1) E2EE session key — passkey path asks the viewer once for their
        PIN/password (never reads it from the person row). */
  if(secret == null && how === 'passkey'){
    try{ secret = await promptForSecret(person); }catch(e){ secret = null; }
  }
  if(secret != null && window.lcE2EELockIn){
    try{ window.lcE2EELockIn(String(secret), person); }catch(e){}
  }
  if(window.lcShareLinkLockIn && secret != null){
    try{ await window.lcShareLinkLockIn(String(secret), person); }catch(e){}
  }
  try{ if(window.trackCardView) window.trackCardView(person, how || 'password'); }catch(e){}
  await window.__loadPersonIntoState__(person);
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

  /* 2) offer passkey enrollment once per card per device */
  try{
    if(how !== 'passkey' && secret &&
       window.lcPasskeysSupported && window.lcPasskeysSupported() &&
       !window.lcPasskeyExists(person)){
      const KEY = 'lovecards::passkey::asked::' + person.id;
      if(!localStorage.getItem(KEY)){
        localStorage.setItem(KEY, '1');
        setTimeout(() => {
          if(confirm('🔐 Save a passkey for this card?\n\nNext time you can unlock with Face ID / fingerprint instead of typing your PIN.')){
            window.lcPasskeyEnroll(person).then(r => {
              if(r && r.ok && window.__showToast) window.__showToast('✅ Passkey saved — biometric unlock enabled 💚', true);
            });
          }
        }, 1600);
      }
    }
  }catch(e){}
}
function hide(el){ if(el) el.classList.add('hidden'); }

/* ---------- wrap tryPersonPw (runs AFTER home.js defined it) ---------- */
let wrapped = false;
function install(){
  if(wrapped) return;
  const orig = window.tryPersonPw;
  if(typeof orig !== 'function'){ setTimeout(install, 300); return; }
  wrapped = true;

  ensurePkButtons();

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
    if(pw && p && S.ADMIN_MODE && !beforeAdmin){
      /* admin just opened a card — expose one-tap encrypt/decrypt UI */
      try{ if(window.lcInjectE2eeAdminUi) window.lcInjectE2eeAdminUi(); }catch(e){}
    }
  };
}

document.addEventListener('DOMContentLoaded', () => setTimeout(install, 2600));

})();
