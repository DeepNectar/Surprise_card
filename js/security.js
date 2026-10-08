/* ============================================================
   security.js — v1.0 SECURITY HARDENING
   ------------------------------------------------------------
   • Salted SHA-256 password hashing (WebCrypto with a pure-JS
     SHA-256 fallback for non-secure contexts).
   • Per-card PIN lock: optional 4–8 digit PIN stored hashed on
     the person row (pin_hash), enforced at login with throttling.
   • Brute-force throttle for BOTH card passwords and the admin
     passphrase: after 5 wrong tries the input locks for 60 s
     (escalating), tracked in localStorage per target.
   • Admin passphrase may be configured as a HASH ONLY
     (settings key shared__adminPwHash) so the plaintext never
     travels to clients.
   ============================================================ */
(function(){
'use strict';

/* ---------- SHA-256 (async WebCrypto, sync JS fallback) ---------- */
function sha256js(ascii){
  /* Compact deterministic JS SHA-256 (fallback path only). */
  function rr(v,c){ return (v>>>c)|(v<<(32-c)); }
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
         0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
         0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
         0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
         0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
         0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
         0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
         0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var msg='';
  for(var i=0;i<ascii.length;i++){
    var c=ascii.charCodeAt(i);
    if(c<128) msg+=String.fromCharCode(c);
    else if(c<2048) msg+=String.fromCharCode(192|(c>>6),128|(c&63));
    else msg+=String.fromCharCode(224|(c>>12),128|((c>>6)&63),128|(c&63));
  }
  var l=msg.length*8;
  msg+=String.fromCharCode(0x80);
  while((msg.length%64)!==56) msg+=String.fromCharCode(0);
  msg+=String.fromCharCode(0,0,0,0,(l>>>24)&255,(l>>>16)&255,(l>>>8)&255,l&255);
  var w=[];
  for(var b=0;b<msg.length/64;b++){
    for(var t=0;t<16;t++) w[t]=(msg.charCodeAt(b*64+t*4)<<24)|(msg.charCodeAt(b*64+t*4+1)<<16)|(msg.charCodeAt(b*64+t*4+2)<<8)|msg.charCodeAt(b*64+t*4+3);
    for(t=16;t<64;t++){
      var s0=rr(w[t-15],7)^rr(w[t-15],18)^(w[t-15]>>>3);
      var s1=rr(w[t-2],17)^rr(w[t-2],19)^(w[t-2]>>>10);
      w[t]=(w[t-16]+s0+w[t-7]+s1)|0;
    }
    var a=H[0],b2=H[1],c2=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(t=0;t<64;t++){
      var S1=rr(e,6)^rr(e,11)^rr(e,25), ch=(e&f)^(~e&g), t1=(h+S1+ch+K[t]+w[t])|0;
      var S0=rr(a,2)^rr(a,13)^rr(a,22), mj=(a&b2)^(a&c2)^(b2&c2), t2=(S0+mj)|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c2;c2=b2;b2=a;a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0;H[1]=(H[1]+b2)|0;H[2]=(H[2]+c2)|0;H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
  }
  var out='';
  for(i=0;i<8;i++){ for(t=3;t>=0;t--) out+=((H[i]>>>(t*8))&255).toString(16).padStart(2,'0'); }
  return out;
}

window.lcSha256 = async function(text){
  if(window.crypto && crypto.subtle && window.isSecureContext !== false){
    try{
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    }catch(e){}
  }
  return sha256js(text);
};

const PW_SALT = 'lovecards::v1::salt::';

window.lcHashPw = function(pw){ return window.lcSha256(PW_SALT + String(pw || '')); };

/* Constant-time-ish compare (hashes first anyway) */
window.lcVerifyPw = async function(pw, hash){
  if(!hash) return false;
  const h = await window.lcHashPw(pw);
  return h === String(hash).toLowerCase();
};

/* ---------- Brute-force throttle ----------
   Keyed per protected target ('admin', 'person:<id>'). After MAX_FAILS
   consecutive failures the target is locked for LOCK_MS, doubling each
   additional failure (capped at 15 min).

   v1.2 SCOPE FIX: counters live in sessionStorage — they are private to
   THIS browser tab on THIS device and die when the tab closes. They can
   never leak into localStorage where a lockout would survive refreshes
   and be visible site-wide. Each target has its own key, so locking the
   admin prompt never affects any card login and vice-versa. Resets on
   success.                                                            */
const MAX_FAILS = 5;
const LOCK_MS   = 60000;
const STORE_KEY = 'lc_throttle_v1';

function loadT(){ try{ return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}'); }catch(e){ return {}; } }
function saveT(o){ try{ sessionStorage.setItem(STORE_KEY, JSON.stringify(o)); }catch(e){} }

window.lcThrottleState = function(id){
  const t = loadT()[id];
  if(!t) return { fails: 0, until: 0 };
  if(t.until && Date.now() < t.until) return { fails: t.fails, until: t.until };
  if(t.until && Date.now() >= t.until) return { fails: t.fails, until: 0 }; /* expired: still counts */
  return { fails: t.fails || 0, until: 0 };
};

window.lcThrottleCheck = function(id){
  const st = window.lcThrottleState(id);
  if(st.until && Date.now() < st.until){
    return { blocked: true, secs: Math.ceil((st.until - Date.now()) / 1000) };
  }
  return { blocked: false, fails: st.fails, left: Math.max(0, MAX_FAILS - st.fails) };
};

window.lcThrottleFail = function(id){
  const all = loadT();
  const t = all[id] || { fails: 0 };
  t.fails = (t.fails || 0) + 1;
  if(t.fails >= MAX_FAILS){
    const over = t.fails - MAX_FAILS;
    t.until = Date.now() + Math.min(LOCK_MS * Math.pow(2, over), 15 * 60000);
  }
  all[id] = t;
  saveT(all);
  return t.until ? Math.ceil((t.until - Date.now()) / 1000) : 0;
};

window.lcThrottleReset = function(id){
  const all = loadT();
  delete all[id];
  saveT(all);
};

/* ---------- Admin passphrase verification ----------
   Priority: hard-coded default fallback FIRST (always works — admin can
   never be locked out), then settings shared__adminPwHash (hash-only),
   then legacy plaintext.

   v1.2 LOCKOUT SCOPE FIX: wrong tries are counted ONLY against the
   'admin' target and ONLY inside this browser tab's sessionStorage.
   They never touch localStorage, so one person hammering the admin
   password can never lock out other visitors or other cards — card
   PINs/passwords use their own separate per-card throttle keys.
   A successful login clears the counter immediately.               */
window.lcCheckAdminPw = async function(pw){
  if(!pw) return false;
  const id = 'admin';

  /* v1.2: the hard-coded default passphrase is ALWAYS accepted, even while
     a wrong-password cooldown is running — so the admin can never be
     locked out of their own site by failed tries (theirs or anyone else's). */
  if(window.FALLBACK_ADMIN_PW && pw === window.FALLBACK_ADMIN_PW){
    window.lcThrottleReset(id);
    return { ok: true };
  }

  const th = window.lcThrottleCheck(id);
  if(th.blocked) return { ok: false, blocked: true, secs: th.secs };

  let ok = false;
  if(!ok){
    const ps = window.__PAGE_STATE__;
    const s = (ps && ps.CURR && ps.CURR.shared) || {};
    /* configured hash */
    if(s.adminPwHash){
      ok = await window.lcVerifyPw(pw, s.adminPwHash);
    }
    /* legacy plaintext */
    if(!ok && s.adminPassword){
      ok = (pw === s.adminPassword);
    }
  }
  if(ok){ window.lcThrottleReset(id); return { ok: true }; }
  const secs = window.lcThrottleFail(id);
  return { ok: false, blocked: !!secs, secs: secs };
};

/* ---------- Per-card PIN helpers ----------
   people.pin_hash stores sha256('PIN:' + salt + ':' + pin). Empty/null =
   no PIN.  Each card gets its own random salt (people.pin_salt) so two
   cards that share a PIN never share a hash (rainbow-table protection).

   CLOUD-FIRST RULE: the PIN (hash + salt + shareable plain copy) lives in
   the cloud on the people row and survives until the card is wiped out —
   every save goes through lcSavePersonPatch(), which writes straight to
   Supabase when online and otherwise queues the SAME patch in the offline
   store (js/offline.js) so nothing is ever lost on refresh.            */
window.lcPersonPinId = function(p){ return 'person:' + ((p && p.id) || (p && p.slug) || '?'); };

const PIN_SALT_PREFIX = 'lovecards::pin-salt::';

function readLocalPinFor(pid){
  try{
    const all = JSON.parse(localStorage.getItem(PIN_SALT_PREFIX + 'local') || '{}');
    return all[pid] || null;
  }catch(e){ return null; }
}
function writeLocalPinFor(pid, obj){
  try{
    const all = JSON.parse(localStorage.getItem(PIN_SALT_PREFIX + 'local') || '{}');
    all[pid] = obj;
    localStorage.setItem(PIN_SALT_PREFIX + 'local', JSON.stringify(all));
  }catch(e){}
}

function randomSalt(){
  try{
    const b = new Uint8Array(8);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b)
      : b.forEach((_, i) => b[i] = Math.floor(Math.random() * 256));
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  }catch(e){ return String(Date.now()) + Math.random().toString(16).slice(2); }
}

/* Persist one person-row patch to the cloud — immediately when online,
   otherwise queued in IndexedDB and flushed as soon as the device returns.
   `cols` lists optional columns that may not exist yet in an older schema:
   we retry without them so a missing migration never blocks the PIN.   */
window.lcSavePersonPatch = async function(person, patch, opts){
  opts = opts || {};
  const id = person && person.id;
  if(!id) return false;
  const names = window.T_PEOPLE || 'people';
  const attempts = [];
  attempts.push(Object.assign({}, patch));
  (opts.optionalCols || []).forEach(c => {
    const p2 = Object.assign({}, patch);
    delete p2[c];
    attempts.push(p2);
  });
  for(const body of attempts){
    /* Client-side schema guard: if PostgREST can't see the optional PIN
       mirror columns yet (probe/heal result shared by offline.js), don't
       send or queue a patch that mentions them — that is what produced the
       "⚠️ PATCH 400 — Could not find the 'otp_list'/'pin_hash' column of
       'people' in the schema cache" pill. The PIN stays safely on-device
       (localStorage) and retries after the next heal/page load. */
    const mirrorMissing = window.lcPeopleMirrorColsOk === false;
    if(mirrorMissing && (opts.optionalCols || []).length){
      let stripped = null, changed = false;
      for(const c of opts.optionalCols){
        if(Object.prototype.hasOwnProperty.call(body, c)){
          stripped = Object.assign({}, stripped || body);
          delete stripped[c];
          changed = true;
        }
      }
      if(changed){
        if(!Object.keys(stripped).some(k => k !== 'id')) continue; /* nothing left to save */
        try{
          if(window.sb && typeof sb.updPerson === 'function'){ await sb.updPerson(id, stripped); return true; }
        }catch(e){}
        try{
          if(typeof window.lcOfflineQueue === 'function'){
            await window.lcOfflineQueue(names, stripped, { method: 'PATCH', filter: 'id=eq.' + encodeURIComponent(id) });
            return true;
          }
        }catch(e){}
        continue;
      }
    }
    /* 1) direct cloud write */
    try{
      if(window.sb && typeof sb.updPerson === 'function'){
        await sb.updPerson(id, body);
        return true;
      }
    }catch(e){ /* fall through to queue */ }
    /* 2) offline queue (survives refresh, auto-flushes on reconnect) */
    try{
      if(typeof window.lcOfflineQueue === 'function'){
        await window.lcOfflineQueue(names, body, { method: 'PATCH', filter: 'id=eq.' + encodeURIComponent(id) });
        return true;
      }
    }catch(e){}
  }
  return false;
};

window.lcSetPinHash = async function(person, pin){
  const plain = pin ? String(pin).trim() : '';
  const salt  = plain ? randomSalt() : '';
  const hash  = plain ? await window.lcHashPw('PIN:' + salt + ':' + plain) : '';
  if(person){
    person.pin_hash  = hash;
    person.pin_salt  = salt;
    /* Keep the plain PIN on the person row too (pin_plain) so the share /
       resend message can include it — with a PIN set, only the PIN opens
       the card. */
    person.pin_plain = plain;
    writeLocalPinFor(person.id, { pin_hash: hash, pin_salt: salt, pin_plain: plain });
  }
  const saved = await window.lcSavePersonPatch(person,
    { pin_hash: hash, pin_salt: salt, pin_plain: plain },
    { optionalCols: ['pin_salt', 'pin_plain'] });
  if(!saved && person){
    const loc = readLocalPinFor(person.id);
    if(loc) Object.assign(person, loc);
  }
  return hash;
};

window.lcVerifyPin = async function(person, pin){
  if(!person || !person.pin_hash) return true; /* no PIN set */
  const cand = [String(person.pin_salt || '')];
  try{
    const loc = readLocalPinFor(person.id);
    if(loc && loc.pin_salt) cand.push(String(loc.pin_salt));
  }catch(e){}
  cand.push(''); /* legacy hashes were made without a salt */
  const given = String(pin || '').trim();
  for(const salt of cand){
    const h = await window.lcHashPw('PIN:' + salt + ':' + given);
    if(h === String(person.pin_hash).toLowerCase()) return true;
  }
  return false;
};

})();
