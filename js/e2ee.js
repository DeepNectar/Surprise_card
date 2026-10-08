/* ============================================================
   e2ee.js — v1.0 END-TO-END ENCRYPTION (Security & Trust)
   ------------------------------------------------------------
   Client-side AES-256-GCM for messages & photos using keys
   DERIVED FROM THE CARD SECRET (PIN / password) via PBKDF2:

     key = PBKDF2-SHA256( secret, salt(person_id||'lovecards-e2ee'),
                          150000 iters ) → 256-bit AES-GCM key

   The derived key NEVER leaves the device; only ciphertext
   travels to / rests in Supabase. A viewer who knows the card
   secret can decrypt everything; anyone without it sees blobs.

   Wire-in (all additive, graceful when crypto.subtle is absent):
     • media.src values           "lcgcm:v1:<base64>"  (photos)
     • gift.message               "lcmsg:v1:<base64>"  (messages)
     • story.body                 "lcmsg:v1:<base64>"
     • uploads.message            "lcmsg:v1:<base64>"
     • guest payload texts        "lcmsg:v1:<base64>"
   js/offline.js mirrors the same person-row patch pattern used
   by security.js, so encrypted writes queue offline too.

   Admin panel offers 🔒 Encrypt / 🔓 Decrypt actions per card
   ("Encrypt this card's secrets" — one tap rewrites every
   marked field in place as ciphertext).
   ============================================================ */
(function(){
'use strict';

const MK      = 'lovecards-e2ee';       /* domain separation   */
const ITER    = 150000;                 /* PBKDF2 rounds       */
const PREFIX_MSG  = 'lcmsg:v1:';        /* ciphertext envelope */
const PREFIX_MEDIA= 'lcgcm:v1:';

const S = window.__PAGE_STATE__;

/* ---------- availability ---------- */
window.lcE2EEAvailable = function(){
  return !!(window.crypto && crypto.subtle && typeof Blob !== 'undefined');
};

/* ---------- base64url-ish helpers (compact, URL/JSON safe) ---------- */
function b64(u8){
  let s = '';
  const CH = 0x8000;
  for(let i = 0; i < u8.length; i += CH){
    s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length)));
  }
  return btoa(s);
}
function unb64(str){
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- key derivation (cached per person+secret) ---------- */
let _keyCache = { pid: null, secret: null, key: null };

async function deriveKey(secret, personId){
  if(!window.lcE2EEAvailable()) throw new Error('crypto.subtle unavailable');
  if(_keyCache.key && _keyCache.pid === String(personId || '') && _keyCache.secret === secret){
    return _keyCache.key;
  }
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(String(secret || '')), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2',
      salt: enc.encode(MK + '|' + String(personId || '')),
      iterations: ITER, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']);
  _keyCache = { pid: String(personId || ''), secret: secret, key: key };
  return key;
}

window.lcE2EESetSecret = async function(secret, personId){
  const s = String(secret || '');
  if(!s){ _keyCache = { pid: null, secret: null, key: null }; return false; }
  try{ await deriveKey(s, personId); return true; }catch(e){ return false; }
};
window.lcE2EEHasSecret = function(){ return !!_keyCache.key; };
window.lcE2EEClearSecret = function(){ _keyCache = { pid: null, secret: null, key: null }; };

/* ---------- raw primitives ---------- */
window.lcEncryptBytes = async function(bytes, personId){
  const secret = _keyCache.secret;
  if(secret == null) throw new Error('no card secret loaded');
  const key = await deriveKey(secret, personId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv }, key, bytes));
  const pack = new Uint8Array(iv.length + ct.length);
  pack.set(iv, 0); pack.set(ct, iv.length);
  return b64(pack);
};

window.lcDecryptBytes = async function(b64str, personId){
  const secret = _keyCache.secret;
  if(secret == null) throw new Error('no card secret loaded');
  const key = await deriveKey(secret, personId);
  const pack = unb64(b64str);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: pack.subarray(0, 12) }, key, pack.subarray(12)));
};

/* ---------- text envelopes ---------- */
window.lcIsEncryptedMsg  = function(v){ return typeof v === 'string' && v.indexOf(PREFIX_MSG) === 0; };
window.lcIsEncryptedMedia= function(v){ return typeof v === 'string' && v.indexOf(PREFIX_MEDIA) === 0; };
window.lcIsEncryptedAny  = function(v){ return window.lcIsEncryptedMsg(v) || window.lcIsEncryptedMedia(v); };

window.lcEncryptText = async function(text, personId){
  if(!text || window.lcIsEncryptedMsg(text)) return text;
  if(!window.lcE2EEAvailable() || !_keyCache.key) return text; /* never lose plaintext on failure */
  const b = await window.lcEncryptBytes(new TextEncoder().encode(String(text)), personId);
  return PREFIX_MSG + b;
};

window.lcDecryptText = async function(env, personId){
  if(!window.lcIsEncryptedMsg(env)) return env;
  const bytes = await window.lcDecryptBytes(env.slice(PREFIX_MSG.length), personId);
  return new TextDecoder().decode(bytes);
};

/* ---------- photo/blob envelopes ---------- */
window.lcEncryptBlob = async function(blob, personId){
  if(!blob || !window.lcE2EEAvailable() || !_keyCache.key) return blob;
  const buf = new Uint8Array(await blob.arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(_keyCache.secret, personId);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, buf));
  const pack = new Uint8Array(4 + iv.length + ct.length);
  const typeLen = Math.min(255, (blob.type || '').length);
  pack[0] = typeLen;
  pack.set(new TextEncoder().encode((blob.type || '').slice(0, typeLen)), 1);
  pack[1 + typeLen] = 0;
  pack.set(iv, 4); pack.set(ct, 16);
  return PREFIX_MEDIA + b64(pack);
};

window.lcDecryptToSrc = async function(env, personId){
  /* returns an object-URL string ready for <img src>, or null */
  if(!window.lcIsEncryptedMedia(env)) return null;
  const pack = unb64(env.slice(PREFIX_MEDIA.length));
  const typeLen = pack[0];
  const type = new TextDecoder().decode(pack.subarray(1, 1 + typeLen));
  const key = await deriveKey(_keyCache.secret, personId);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: pack.subarray(4, 16) }, key, pack.subarray(16));
  const blob = new Blob([raw], { type: type || 'image/jpeg' });
  return URL.createObjectURL(blob);
};

/* transparently resolve a possibly-encrypted media src */
window.lcResolveMediaSrc = async function(src, personId){
  if(window.lcIsEncryptedMedia(src)){
    try{ return await window.lcDecryptToSrc(src, personId); }catch(e){ return ''; }
  }
  return src || '';
};

/* ---------- auto-unlock hook: remember the secret that opened the card ----------
   boot.js re-wraps tryPersonPw at runtime, so instead of wrapping we expose a
   tiny helper the login flow calls with the secret that just succeeded. */
window.lcE2EELockIn = function(secret, person){
  try{
    if(secret && person && person.id) window.lcE2EESetSecret(String(secret), person.id);
  }catch(e){}
};

/* ---------- decrypt-on-render helpers (used by gifts/story/slideshow) ---------- */
window.lcDecryptRows = async function(rows, fields){
  /* returns a shallow copy of rows with any lcmsg:/lcgcm: values decrypted.
     Never throws — undecryptable envelopes are replaced by a lock notice. */
  const out = [];
  for(const r of (rows || [])){
    const c = Object.assign({}, r);
    for(const f of (fields || [])){
      const v = c[f];
      if(window.lcIsEncryptedMsg(v)){
        try{ c[f] = await window.lcDecryptText(v, r.person_id); }
        catch(e){ c[f] = '🔒 Encrypted — open this card with your PIN/password to read it.'; }
      } else if(window.lcIsEncryptedMedia(v)){
        try{ c[f] = (await window.lcDecryptToSrc(v, r.person_id)) || ''; }
        catch(e){ c[f] = ''; }
      }
    }
    out.push(c);
  }
  return out;
};

/* ---------- whole-card encrypt / decrypt (admin action) ---------- */
window.lcEncryptCardData = async function(mode){
  /* mode: 'encrypt' | 'decrypt'. Returns {changed, failed}.
     Runs over the currently-loaded card (S.CURR rows), rewriting
     gift messages, story bodies and local photo blobs in place. */
  const P = S && S.CURRENT_PERSON;
  if(!P || !P.id) throw new Error('Open a card first (Admin → select person).');
  if(!_keyCache.key) throw new Error('Enter your PIN/password first — the key lives only in this session.');
  const wantEnc = (mode === 'encrypt');
  let changed = 0, failed = 0;

  /* messages: gift.message, story.body */
  async function runMsg(table, rows, field){
    for(const row of (rows || [])){
      if(!row || !row.id || typeof row[field] !== 'string') continue;
      const v = row[field];
      try{
        if(wantEnc && v.trim() && !window.lcIsEncryptedMsg(v)){
          await sb.upd(table, row.id, { [field]: await window.lcEncryptText(v, P.id) });
          changed++;
        } else if(!wantEnc && window.lcIsEncryptedMsg(v)){
          await sb.upd(table, row.id, { [field]: await window.lcDecryptText(v, P.id) });
          changed++;
        }
      }catch(e){ failed++; }
    }
  }
  await runMsg(T_GIFTS, S.CURR.gifts, 'message');
  await runMsg(T_STORY, S.CURR.story, 'body');

  /* photos: locally-stored media.src blobs/data-URLs */
  for(const row of (S.CURR.media || [])){
    if(!row || !row.id || typeof row.src !== 'string') continue;
    const v = row.src;
    try{
      if(wantEnc && v.trim() && !window.lcIsEncryptedMedia(v) && /^(data:|blob:)/.test(v)){
        const blob = await (await fetch(v)).blob();
        const env = await window.lcEncryptBlob(blob, P.id);
        if(typeof env === 'string' && window.lcIsEncryptedMedia(env)){
          await sb.upd(T_MEDIA, row.id, { src: env });
          changed++;
        }
      } else if(!wantEnc && window.lcIsEncryptedMedia(v)){
        const url = await window.lcDecryptToSrc(v, P.id);
        if(url){
          const blob = await (await fetch(url)).blob();
          const fr = new FileReader();
          const durl = await new Promise(res => { fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
          await sb.upd(T_MEDIA, row.id, { src: durl });
          URL.revokeObjectURL(url);
          changed++;
        }
      }
    }catch(e){ failed++; }
  }

  /* reload the card so the freshly-encrypted/decrypted rows render */
  if(changed && window.__loadPersonIntoState__){
    try{ await window.__loadPersonIntoState__(P); }catch(e){}
  }
  return { changed: changed, failed: failed };
};

})();
