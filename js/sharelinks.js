/* ============================================================
   sharelinks.js — v1.0 SECURE SHARE LINKS (Security & Trust)
   ------------------------------------------------------------
   HMAC-SHA256 signed, expiring share links with per-link view
   limits — minted by the ADMIN, consumed transparently by the
   VIEWER:

     • Create (admin panel → 🔐 Security → Secure Share Links):
       pick card + expiry + max views → link like
         https://site/#s/slug?e=<expEpochMs>&v=<maxViews>&sig=<b64u>
     • The signature covers slug|expiry|maxViews and is derived
       (PBKDF2, 120k iters) from the card's OWN secret — so only
       someone who can open the card can mint valid links for it,
       and a tampered link fails verification instantly.
     • On open, the viewer verifies sig / expiry / integrity and
       enforces the view limit via a localStorage counter keyed
       to the signature (one "view" = one page load).
     • Verified links are mirrored into the existing HD short-link
       resolver (#s/slug), so nothing else changes on the happy
       path; unsigned plain #s/ links keep working exactly as
       before (they simply carry no extra guarantees).

   NOTE: client-side capability links deter casual forwarding;
   for server-enforced revocation point lcVerifyShareLink at a
   Supabase Edge Function (same interface).
   ============================================================ */
(function(){
'use strict';

const MK   = 'lovecards-sharelink-v1';
const ITER = 120000;
const PREFIX = 'lcshare:v1:';
const CTR_PREFIX = PREFIX + 'views::';

const S = window.__PAGE_STATE__;

function ok(){ return !!(window.crypto && crypto.subtle); }
window.lcShareLinksSupported = ok;

/* ---------- base64url helpers ---------- */
function bufToB64u(buf){
  const b = new Uint8Array(buf);
  let s = '';
  for(let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64uToBuf(u){
  u = String(u).replace(/-/g,'+').replace(/_/g,'/');
  while(u.length % 4) u += '=';
  const bin = atob(u);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function $id(id){ return document.getElementById(id); }

/* ---------- signing key: PBKDF2(card secret) — cached per card ---------- */
let _kc = { pid: null, secret: null, key: null };

async function signKey(secret, personId){
  if(!ok()) throw new Error('crypto.subtle unavailable');
  if(_kc.key && _kc.pid === String(personId || '') && _kc.secret === secret) return _kc.key;
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(String(secret || '')),
    'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(MK + '|' + String(personId || '')),
      iterations: ITER, hash: 'SHA-256' },
    base, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  _kc = { pid: String(personId || ''), secret: secret, key: key };
  return key;
}

/* securitywire.js calls this right after a successful PIN/password unlock */
window.lcShareLinkLockIn = async function(secret, person){
  try{
    if(secret && person && person.id) await signKey(String(secret), person.id);
  }catch(e){}
};

async function hmac(slug, exp, maxV){
  if(!_kc.key) throw new Error('no card secret loaded');
  const msg = new TextEncoder().encode(slug + '|' + exp + '|' + maxV);
  const sig = await crypto.subtle.sign('HMAC', _kc.key, msg);
  return bufToB64u(sig);
}

/* ---------- CREATE (admin) ---------- */
window.lcCreateSecureLink = async function(person, secret, opts){
  opts = opts || {};
  const slug = person && person.slug;
  if(!slug) throw new Error('Card has no slug.');
  if(!ok()) throw new Error('WebCrypto unavailable (needs https).');
  const ttlDays = Math.max(1, Math.min(365, Number(opts.days) || 7));
  const exp = Date.now() + ttlDays * 86400000;
  const maxV = Math.max(1, Math.min(9999, parseInt(opts.maxViews, 10) || 5));
  await signKey(String(secret || ''), person.id);
  const sig = await hmac(slug, exp, maxV);
  const base = (window.getShareBaseUrl ? window.getShareBaseUrl() : location.origin);
  const url = base + '/#s/' + encodeURIComponent(slug) +
              '?e=' + exp + '&v=' + maxV + '&sig=' + sig;
  const env = PREFIX + JSON.stringify({ slug: slug, e: exp, v: maxV, s: sig });
  /* best-effort cloud mirror (optional column — never blocks) */
  try{
    if(window.lcSavePersonPatch){
      window.lcSavePersonPatch(person, { secure_share_link: env },
        { optionalCols: ['secure_share_link'] });
    }
  }catch(e){}
  return { url: url, exp: exp, maxViews: maxV, sig: sig };
};

/* ---------- PARSE current URL params ---------- */
function readParams(){
  const h = location.hash || '';
  const qi = h.indexOf('?');
  if(qi < 0) return null;
  try{ return new URLSearchParams(h.slice(qi + 1)); }catch(e){ return null; }
}

/* constant-ish compare */
function eqStr(a, b){
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

/* ---------- VERIFY (viewer, before the card opens) ---------- */
window.lcVerifyShareLink = async function(person){
  const p = readParams();
  if(!p || !p.get('sig')) return { unsigned: true };
  const slug = person && person.slug;
  const exp = Number(p.get('e') || 0);
  const maxV = parseInt(p.get('v') || '0', 10);
  const sig = String(p.get('sig') || '');
  if(!slug || !exp || !maxV || !sig) return { invalid: 'malformed link' };
  if(Date.now() > exp) return { expired: true };
  const secret = String((person && (person.pin_plain || person.password)) || '');
  if(!secret) return { unverifiable: true };
  let expect;
  try{
    await signKey(secret, person.id);
    expect = await hmac(slug, exp, maxV);
  }catch(e){ return { unverifiable: true }; }
  if(!eqStr(expect, sig)) return { invalid: 'bad signature' };

  /* ---- view limit (per device, keyed to the exact signature) ---- */
  const key = CTR_PREFIX + sig;
  let used = 0;
  try{ used = parseInt(localStorage.getItem(key) || '0', 10) || 0; }catch(e){}
  if(used >= maxV) return { exhausted: true, used: used, max: maxV };
  try{ localStorage.setItem(key, String(used + 1)); }catch(e){}
  return { ok: true, used: used + 1, max: maxV, daysLeft: Math.ceil((exp - Date.now()) / 86400000) };
};

/* ---------- strip the token once the card is open (clean history) ---------- */
window.lcCleanShareParams = function(){
  try{
    const h = location.hash || '';
    const qi = h.indexOf('?');
    if(qi >= 0) history.replaceState(null, '', location.pathname + h.slice(0, qi));
  }catch(e){}
};

/* ============================================================
   ADMIN UI: inject "Secure Share Link" box into admin → Security
   ============================================================ */
function injectPanel(){
  const pane = $id('pane-security');
  if(!pane || $id('lcs-share-box')) return;
  const box = document.createElement('div');
  box.className = 'panel-section';
  box.id = 'lcs-share-box';
  box.innerHTML =
    '<div class="panel-section-title">🔗 Secure Share Link</div>' +
    '<div class="panel-field" style="font-size:.75rem;color:var(--c-text-muted);">' +
      'HMAC-signed link that EXPIRES and stops working after a set number of views. ' +
      'Open the card first (its secret signs the link).</div>' +
    '<div class="panel-field"><label class="panel-label">Expires in (days)</label>' +
      '<input type="number" class="panel-input" id="lcsDays" value="7" min="1" max="365"></div>' +
    '<div class="panel-field"><label class="panel-label">Max views</label>' +
      '<input type="number" class="panel-input" id="lcsViews" value="5" min="1" max="999"></div>' +
    '<button type="button" class="panel-btn" id="lcsCreateBtn" style="min-width:0;padding:.4rem .9rem;font-size:.8rem;">🔐 Create secure link</button>' +
    '<div id="lcsOut" style="margin-top:.5rem;font-size:.75rem;word-break:break-all;"></div>';
  pane.appendChild(box);

  const btn = $id('lcsCreateBtn');
  if(btn) btn.onclick = async () => {
    const out = $id('lcsOut');
    const P = S && S.CURRENT_PERSON;
    if(!P || !P.slug){ out.textContent = '⚠️ Open a card first (People tab).'; return; }
    const secret = String(P.pin_plain || P.password || '');
    if(!secret){ out.textContent = '⚠️ This card has no password/PIN to sign with.'; return; }
    btn.disabled = true; btn.textContent = '⏳ Signing…';
    try{
      const r = await window.lcCreateSecureLink(P, secret, {
        days: $id('lcsDays').value, maxViews: $id('lcsViews').value });
      out.innerHTML =
        '<div style="background:rgba(0,0,0,.18);padding:.4rem .5rem;border-radius:8px;margin-bottom:.4rem;">' + esc(r.url) + '</div>' +
        '<button type="button" class="panel-btn" id="lcsCopy" style="min-width:0;padding:.3rem .7rem;font-size:.75rem;">📋 Copy</button> ' +
        '<span style="opacity:.8;">⏳ ' + esc(String(Math.round((r.exp - Date.now()) / 86400000))) +
        ' days · 👁️ ' + esc(String(r.maxViews)) + ' views max</span>';
      const cp = $id('lcsCopy');
      if(cp) cp.onclick = async () => {
        try{ await navigator.clipboard.writeText(r.url); cp.textContent = '✅ Copied'; }
        catch(e){ window.__prompt({message: 'Copy the secure link:', okText: 'Done'}, r.url); }
        setTimeout(() => { cp.textContent = '📋 Copy'; }, 1500);
      };
    }catch(e){
      out.textContent = '❌ ' + ((e && e.message) || 'Could not sign link.');
    }
    btn.disabled = false; btn.textContent = '🔐 Create secure link';
  };
}

/* ============================================================
   VIEWER notice chip when arriving through a verified link
   ============================================================ */
function showNotice(v){
  try{
    let n = $id('lcs-notice');
    if(!n){
      n = document.createElement('div');
      n.id = 'lcs-notice';
      n.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:2147483000;' +
        'background:rgba(13,92,74,.92);color:#fff;font-size:.72rem;padding:.4rem .8rem;border-radius:999px;' +
        'font-family:Georgia,serif;box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none;';
      document.body.appendChild(n);
    }
    n.textContent = '🔐 Secure link verified — view ' + v.used + ' of ' + v.max +
                    ' · expires in ' + v.daysLeft + 'd';
    setTimeout(() => { if(n) n.remove(); }, 5000);
  }catch(e){}
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(injectPanel, 1900);
});

})();
