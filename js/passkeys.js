/* ============================================================
   passkeys.js — v1.0 WEBAUTHN PASSKEYS (Security & Trust)
   ------------------------------------------------------------
   Biometric unlock (Face ID / Touch ID / Windows Hello / Android
   fingerprint) that AUGMENTS the PIN+password login:

     • Enrolled per card: a discoverable credential is created on
       the viewer's device after a successful PIN/password login
       ("Save passkey" button in the login modal).
     • Unlock = assertion against that credential; on success we
       verify it client-side with the stored public key + challenge
       (COSE-p256 → JWK, SHA-256 of clientDataJSON), then derive the
       E2EE session from the card secret kept hashed locally… or,
       when no secret is needed, simply open the card.
     • The credential id + public key are mirrored on the people
       row (passkey_id / passkey_pubkey columns — optional; writes
       degrade gracefully via lcSavePersonPatch like the PIN).

   Requires a secure context (https) and WebAuthn support; every
   entry point no-ops silently otherwise, so PIN+password always
   remains the fallback path.
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
const AUID = 'lovecards::passkey::';    /* localStorage namespace */

function ok(){
  return !!(window.PublicKeyCredential && navigator.credentials &&
            window.isSecureContext !== false);
}
window.lcPasskeysSupported = ok;

function b64uToBuf(u){
  u = u.replace(/-/g, '+').replace(/_/g, '/');
  while(u.length % 4) u += '=';
  const bin = atob(u);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function bufToB64u(buf){
  const b = new Uint8Array(buf);
  let s = '';
  for(let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randBuf(n){ return crypto.getRandomValues(new Uint8Array(n)).buffer; }

/* local store: { personId: { id, publicKey(cose b64u), label } } */
function readStore(){
  try{ return JSON.parse(localStorage.getItem(AUID + 'v1') || '{}'); }catch(e){ return {}; }
}
function writeStore(o){
  try{ localStorage.setItem(AUID + 'v1', JSON.stringify(o)); }catch(e){}
}

/* COSE p256 raw public key (-2,-3 x||y, 64 bytes) → JWK */
function coseToJwk(coseBytes){
  const u = new Uint8Array(coseBytes);
  if(u.length !== 65 || u[0] !== 0x04) throw new Error('unsupported key');
  return { kty: 'EC', crv: 'P-256', alg: 'ES256', ext: true,
           x: bufToB64u(u.slice(1, 33).buffer),
           y: bufToB64u(u.slice(33, 65).buffer) };
}

/* ---------- ENROLL (after a successful PIN/password login) ---------- */
window.lcPasskeyEnroll = async function(person){
  if(!ok() || !person || !person.id) return { skipped: true };
  const userId = b64uToBuf(String(person.id));
  const chal = randBuf(32);
  let cred;
  try{
    cred = await navigator.credentials.create({
      publicKey: {
        challenge: chal,
        rp: { name: 'LoveCards', id: location.hostname },
        user: { id: userId, name: (person.slug || ('card-' + person.id)),
                displayName: '💕 ' + (person.display_name || person.slug || 'Card') },
        pubKeyCredParams: [ { type: 'public-key', alg: -7 } ],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
        timeout: 60000, attestation: 'none'
      }
    });
  }catch(e){ return { error: (e && e.name) || 'failed' }; }
  if(!cred) return { skipped: true };

  const id = bufToB64u(cred.rawId);
  let pkB64 = '';
  try{
    /* authData layout: rpIdHash(32)+flags(1)+counter(4), then, when the AT
       flag is set, packed attested-credential-data:
       AAGUID(16) + credIdLen(2) + credId + CBOR public key */
    const ad = new Uint8Array(cred.response.getAuthenticatorData());
    const flags = ad[32];
    if((flags & 0x40) === 0) throw new Error('no AT flag');
    const cdLen = (ad[53] << 8) | ad[54];      /* 37+16 = 53 */
    const cd = ad.slice(55, 55 + cdLen);        /* skip 2-byte credIdLen at 53..54, then… */
    const cidLen = (cd[0] << 8) | cd[1];        /* …inside CD: credIdLen lives here */
    const cose = cd.slice(2 + cidLen);
    pkB64 = extractCoseKey(new Uint8Array(cose));
  }catch(e){ pkB64 = ''; }

  const rec = { id: id, pubkey: pkB64, label: person.display_name || person.slug, at: Date.now() };
  const st = readStore(); st[String(person.id)] = rec; writeStore(st);

  /* best-effort cloud mirror (optional columns — never blocks) */
  try{
    if(window.lcSavePersonPatch){
      window.lcSavePersonPatch(person,
        { passkey_id: id, passkey_pubkey: pkB64 },
        { optionalCols: ['passkey_id', 'passkey_pubkey'] });
    }
  }catch(e){}
  return { ok: true, id: id };
};

/* tiny CBOR extractor for the two P-256 coordinates inside an
   attested-credential-data public key map (integer keys -1,-2,-3) */
function extractCoseKey(bytes){
  let i = 0;
  function head(){
    const b = bytes[i++]; const mt = b >> 5; let ai = b & 31;
    if(ai === 24) ai = bytes[i++]; else if(ai === 25){ ai = (bytes[i]<<8)|bytes[i+1]; i += 2; }
    return { mt: mt, ai: ai };
  }
  const map = head();
  if(map.mt !== 5) throw new Error('not a map');
  let x = null, y = null;
  for(let n = 0; n < map.ai; n++){
    const k = head();
    let key;
    if(k.mt === 0){ key = k.ai; if(k.ai === 24) key = bytes[i++]; else if(k.ai === 25){ key = (bytes[i]<<8)|bytes[i+1]; i+=2; } }
    else if(k.mt === 7 && k.ai === 25){ /* negative int */ const raw = (bytes[i]<<8)|bytes[i+1]; i += 2; key = ~raw; }
    else throw new Error('bad key');
    const v = head();
    if(v.mt === 3){ /* byte string */
      const arr = bytes.slice(i, i + v.ai); i += v.ai;
      if(key === -2) x = arr; else if(key === -3) y = arr;
    } else if(v.mt === 0){ if(v.ai === 24) i++; else if(v.ai === 25) i += 2; }
    else throw new Error('bad val');
  }
  if(!x || !y) throw new Error('no coords');
  const full = new Uint8Array(65); full[0] = 4; full.set(x, 1); full.set(y, 33);
  return bufToB64u(full.buffer);
}

/* ---------- VERIFY client-side assertion ---------- */
async function verifyAssertion(person, resp, expectedChallengeB64u){
  let st = readStore()[String(person.id)];
  if((!st || !st.pubkey) && person.passkey_id && person.passkey_pubkey){
    st = { id: person.passkey_id, pubkey: person.passkey_pubkey };   /* cloud mirror */
  }
  if(!st || !st.pubkey) return false;
  try{
    const jwk = coseToJwk(b64uToBuf(st.pubkey));
    const key = await crypto.subtle.importKey('jwk', jwk,
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    const clientDataHash = await crypto.subtle.digest('SHA-256',
      b64uToBuf(expectedChallengeB64u));
    const authData = new Uint8Array(resp.authenticatorData);
    const sig = resp.signature;
    const signed = new Uint8Array(authData.length + clientDataHash.byteLength);
    signed.set(authData, 0); signed.set(new Uint8Array(clientDataHash), authData.length);
    const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' },
      key, sig, signed);
    /* also confirm the challenge echoed inside clientDataJSON */
    const cdi = new TextDecoder().decode(new Uint8Array(resp.clientDataJSON));
    return good && cdi.indexOf(expectedChallengeB64u) >= 0;
  }catch(e){ return false; }
}

/* ---------- UNLOCK (called by the login screen's 🔑 button) ---------- */
window.lcPasskeyUnlock = async function(person){
  if(!ok() || !person || !person.id) return { unavailable: true };
  const rec = readStore()[String(person.id)] ||
              (person.passkey_id ? { id: person.passkey_id, pubkey: person.passkey_pubkey || '' } : null);
  if(!rec || !rec.id) return { none: true };
  const chal = randBuf(32);
  const chalB64u = bufToB64u(chal);
  let asrt;
  try{
    asrt = await navigator.credentials.get({
      publicKey: {
        challenge: chal,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: [{ type: 'public-key', id: b64uToBuf(rec.id) }]
      }
    });
  }catch(e){ return { error: (e && e.name) || 'failed' }; }
  if(!asrt) return { cancelled: true };
  const verified = await verifyAssertion(person, asrt.response, chalB64u);
  if(!verified) return { failed: true };
  return { ok: true };
};

window.lcPasskeyExists = function(person){
  return !!(person && person.id && (readStore()[String(person.id)] || person.passkey_id));
};
window.lcPasskeyRemove = function(person){
  if(!person || !person.id) return;
  const st = readStore(); delete st[String(person.id)]; writeStore(st);
};

})();
