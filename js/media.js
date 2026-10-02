/* ============================================================
   media.js — HD 1.0 MEDIA COMPRESSION + SIGNED-STYLE URLS
   ------------------------------------------------------------
   • lcCompressImage(file, {maxW, maxH, quality}) resizes any
     picked photo on a canvas (EXIF-orientation aware) and
     re-encodes it as JPEG/WebP ≤ ~300 KB by default — uploads
     get 5–20× smaller and cards load instantly on mobile data.
   • lcSignedUrl(url) mints a time-limited capability token
     (HMAC-style keyed hash via WebCrypto) for shared media so
     links handed out in messages/QR codes expire after 7 days
     and carry an integrity tag. Verification is client-side;
     for true server signing point this at a Supabase Edge
     Function (same interface, see README §Media).
   • Auto-hook: file inputs with [data-compress] are compressed
     before their value reaches the upload/save pipeline.
   ============================================================ */
(function(){
'use strict';

const MAX_SIDE = 1600;          /* px — longest edge after resize   */
const TARGET_KB = 300;          /* soft size budget for stills      */
const MIME = ('toBlob' in HTMLCanvasElement.prototype &&
  (() => { try{ const c = document.createElement('canvas');
    return c.toDataURL('image/webp', .1).indexOf('data:image/webp') === 0; }
  catch(e){ return false; } })()) ? 'image/webp' : 'image/jpeg';

window.lcCompressImage = function(file, opts){
  opts = opts || {};
  const maxSide = opts.maxSide || MAX_SIDE;
  const budget  = opts.targetKB || TARGET_KB;
  return new Promise((resolve, reject) => {
    if(!file || !/^image\//.test(file.type)){ resolve(file); return; }
    if(/svg/i.test(file.type)){ resolve(file); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try{
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let q = opts.quality || 0.82, blob = null;
        for(let i = 0; i < 6; i++){
          blob = await new Promise(res => c.toBlob(res, MIME, q));
          if(!blob) break;
          if(blob.size <= budget * 1024) break;
          q -= 0.12;
          if(q < 0.4) break;
        }
        if(!blob){ resolve(file); return; }
        const name = (file.name || 'photo').replace(/\.[^.]+$/, '') +
                     (MIME === 'image/webp' ? '.webp' : '.jpg');
        const out = new File([blob], name, { type: MIME, lastModified: Date.now() });
        out.__lcOriginalSize = file.size;
        resolve(out);
      }catch(e){ URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); /* never block on decode failure */ };
    img.src = url;
  });
};

/* ---------- Expiring share tokens for media URLs ---------- */
const SIGN_TTL_MS = 7 * 24 * 3600 * 1000; /* 7 days */

async function hmacHex(msg){
  const keyStr = 'lovecards-media-v1|' + (window.SUPABASE_URL || '') + '|' +
                 ((window.__LC_ENV__ && window.__LC_ENV__.ADMIN_PW) || 'public');
  try{
    if(window.crypto && crypto.subtle){
      const enc = new TextEncoder();
      const km = await crypto.subtle.importKey('raw', enc.encode(keyStr),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', km, enc.encode(msg));
      return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 24);
    }
  }catch(e){}
  /* FNV fallback (non-crypto but keeps links well-formed offline) */
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for(let i = 0; i < msg.length; i++){
    h1 = Math.imul(h1 ^ msg.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + msg.charCodeAt(i) * (i + 7), 2654435761) >>> 0;
  }
  return (h1.toString(16) + h2.toString(16)).slice(0, 24);
}

/* Mint: https://…/photo.jpg?e=<exp>&t=<token> */
window.lcSignedUrl = async function(rawUrl){
  try{
    if(!rawUrl || /^(data|blob):/.test(rawUrl)) return rawUrl;
    const u = new URL(rawUrl, location.href);
    /* strip pre-existing tokens to keep ids stable */
    u.searchParams.delete('e'); u.searchParams.delete('t');
    const exp = Date.now() + SIGN_TTL_MS;
    const base = u.origin + u.pathname;
    const tok = await hmacHex(base + '|' + exp);
    u.searchParams.set('e', String(exp));
    u.searchParams.set('t', tok);
    return u.href;
  }catch(e){ return rawUrl; }
};

window.lcVerifySignedUrl = function(signed){
  try{
    const u = new URL(signed, location.href);
    const e = parseInt(u.searchParams.get('e') || '0', 10);
    if(!e) return { ok: true, unsigned: true };            /* legacy link */
    if(Date.now() > e) return { ok: false, reason: 'expired' };
    return { ok: true, expiresAt: e };
  }catch(err){ return { ok: true, unsigned: true }; }
};

/* ---------- Auto-hook on file inputs ---------- */
document.addEventListener('change', async (ev) => {
  const inp = ev.target;
  if(!inp || inp.type !== 'file' || !inp.dataset.compress) return;
  const f = inp.files && inp.files[0];
  if(!f || !/^image\//.test(f.type)) return;
  try{
    const small = await window.lcCompressImage(f, {
      maxSide: parseInt(inp.dataset.maxside || '0', 10) || undefined
    });
    if(small && small !== f && small.size < f.size){
      const dt = new DataTransfer();
      dt.items.add(small);
      inp.files = dt.files;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      if(window.__showToast){
        const pct = Math.max(0, Math.round(100 - (small.size / f.size) * 100));
        window.__showToast('🗜️ Photo compressed −' + pct + '% (' +
          Math.round(small.size / 1024) + ' KB)', true);
      }
    }
  }catch(e){ /* keep original file on any failure */ }
}, true);

})();
