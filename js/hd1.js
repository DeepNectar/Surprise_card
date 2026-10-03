/* ============================================================
   hd1.js — HD 1.0 SHARING, QR, TIMELINE & EXPORT SUITE
   ------------------------------------------------------------
   • Short links (/#s/<slug>) + tiny redirect resolver
     (works on static hosts; a Supabase Edge Function can swap
      in real /go/<code> redirects later — same code format)
   • QR codes for physical gifting (self-contained generator,
     no CDN dependency — printable/downloadable as PNG/SVG)
   • "Who viewed my card" analytics panel (cloud card_views)
   • Auto-birthday theme switching with a confetti morph
   • Music-synced slideshow beat pulse (slideshow.js hook)
   • PDF export (print-to-PDF sheet of the live card)
   • Timeline view of memories (story + events + uploads)
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

function $id(id){ return document.getElementById(id); }
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ============================================================
   1) SHORT LINKS  (#s/slug) + resolver
   ============================================================ */
window.lcShortLink = function(slug){
  const base = (window.getShareBaseUrl ? window.getShareBaseUrl() : location.origin);
  return base + '/#s/' + encodeURIComponent(slug || '');
};

/* Redirect old-style ?person=slug → #s/slug once, so history is clean */
(function(){
  try{
    const q = new URLSearchParams(location.search).get('person');
    if(q && !location.hash){
      history.replaceState(null, '', location.pathname + '#s/' + encodeURIComponent(q));
    }
  }catch(e){}
})();

/* boot.js already auto-opens ?person=…; mirror that for #s/… links.
   Retry a few times because the home grid paints asynchronously. */
(function(){
  function tryOpen(){
    try{
      const h = location.hash || '';
      if(h.indexOf('#s/') !== 0) return false;
      const slug = decodeURIComponent(h.slice(3));
      const btn = Array.from(document.querySelectorAll('#homeGrid .home-btn'))
        .find(b => b.getAttribute('data-slug') === slug);
      if(btn){ btn.click(); return true; }
    }catch(e){}
    return false;
  }
  document.addEventListener('DOMContentLoaded', () => {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if(tryOpen() || tries > 20) clearInterval(iv);
    }, 400);
  });
})();

/* ============================================================
   2) QR CODE GENERATOR (pure JS, byte mode + Reed–Solomon ECC)
   Spec-correct encoder for versions 1–10 at error level M —
   enough for any card URL. No CDN dependency; renders SVG/PNG.
   ============================================================ */
const QR_TOTAL_CW = [0,26,44,70,100,134,172,196,242,292,344];       /* v1..10 all-EC */
const QR_ECC_CW   = [0,10,16,26,36,48,64,84,106,122,152];           /* v1..10 EC cw  */
const QR_BLOCKS_M = [0,1,1,1,2,2,4,4,4,5,6];                         /* v1..10 blocks */
const QR_ALIGN    = [null,null,[6,18],[6,22],[6,26],[6,32],[6,34],
                   [6,22,38],[6,24,42],[6,26,46],[6,28,50]];        /* centers       */

function qrEncode(dataStr){
  const bytes = Array.from(new TextEncoder().encode(String(dataStr)));
  let ver = 1;
  while(ver <= 10){
    const dataCw = QR_TOTAL_CW[ver] - QR_ECC_CW[ver];
    const countBits = ver <= 9 ? 8 : 16;
    const needBits = 4 + countBits + bytes.length * 8;
    if(needBits <= dataCw * 8) break;
    ver++;
  }
  if(ver > 10) throw new Error('QR: payload too large');
  const size = 17 + ver * 4;
  const grid = [];
  for(let i = 0; i < size; i++) grid.push(new Array(size).fill(null));

  /* ---- GF(256) tables ---- */
  const EXP = new Array(512), LOG = new Array(256);
  let x = 1;
  for(let i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if(x & 256) x ^= 0x11d; }
  for(let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gmul = (a,b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
  function genPoly(n){
    let g = [1];
    for(let i = 0; i < n; i++){
      const q = [1, EXP[i]], r = new Array(g.length + 1).fill(0);
      for(let a = 0; a < g.length; a++) for(let b = 0; b < 2; b++) r[a+b] ^= gmul(g[a], q[b]);
      g = r;
    }
    return g;
  }

  /* ---- bitstream: mode 0100 + length + bytes + terminator + pad ---- */
  const dataCw = QR_TOTAL_CW[ver] - QR_ECC_CW[ver];
  const bits = [];
  const push = (v,n) => { for(let i=n-1;i>=0;i--) bits.push((v>>i)&1); };
  push(0b0100, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach(b => push(b, 8));
  push(0, Math.min(4, dataCw*8 - bits.length));
  while(bits.length % 8) bits.push(0);
  const cw = [];
  for(let i = 0; i < bits.length; i += 8){
    let b = 0; for(let j = 0; j < 8; j++) b = (b<<1)|bits[i+j];
    cw.push(b);
  }
  const PAD = [0xec, 0x11];
  for(let pi = 0; cw.length < dataCw; pi++) cw.push(PAD[pi % 2]);

  /* ---- split into blocks + Reed–Solomon ECC ---- */
  const blocks = QR_BLOCKS_M[ver];
  const ecPer  = Math.floor(QR_ECC_CW[ver] / blocks);
  const shortLen = Math.floor(dataCw / blocks);
  const numLong = dataCw % blocks;
  const dBlocks = [], eBlocks = [];
  let off = 0;
  for(let b = 0; b < blocks; b++){
    const len = shortLen + (b >= blocks - numLong ? 1 : 0);
    const chunk = cw.slice(off, off + len); off += len;
    dBlocks.push(chunk);
    const g = genPoly(ecPer);
    const rem = new Array(ecPer).fill(0);
    for(const d of chunk){
      const factor = d ^ rem[0];
      rem.shift(); rem.push(0);
      for(let i = 0; i < ecPer; i++) rem[i] ^= gmul(g[i+1], factor);
    }
    eBlocks.push(rem);
  }
  const finalBytes = [];
  for(let i = 0; i < shortLen + 1; i++)
    for(let b = 0; b < blocks; b++)
      if(dBlocks[b][i] != null) finalBytes.push(dBlocks[b][i]);
  for(let i = 0; i < ecPer; i++)
    for(let b = 0; b < blocks; b++)
      if(eBlocks[b][i] != null) finalBytes.push(eBlocks[b][i]);

  /* ---- function patterns ---- */
  function setFinder(r, c){
    for(let dr = -1; dr <= 7; dr++) for(let dc = -1; dc <= 7; dc++){
      const rr = r + dr, cc = c + dc;
      if(rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const inRing = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                     (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
      const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      grid[rr][cc] = (inRing || inCore) ? 1 : 0;
    }
  }
  setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);

  for(let i = 8; i < size - 8; i++){          /* timing */
    grid[6][i] = i % 2 === 0 ? 1 : 0;
    grid[i][6] = i % 2 === 0 ? 1 : 0;
  }
  if(ver >= 2){                                /* alignment */
    const cs = QR_ALIGN[ver];
    for(const r of cs) for(const c of cs){
      if((r === 6 && c === 6) || (r === 6 && c === cs[cs.length-1]) ||
         (r === cs[cs.length-1] && c === 6)) continue;
      for(let dr = -2; dr <= 2; dr++) for(let dc = -2; dc <= 2; dc++){
        const ring = Math.max(Math.abs(dr), Math.abs(dc));
        grid[r+dr][c+dc] = (ring === 2 || ring === 0) ? 1 : 0;
      }
    }
  }
  /* reserve format areas (real values written after masking) */
  for(let i = 0; i <= 8; i++){
    if(i !== 6){
      if(grid[8][i] === null) grid[8][i] = 0;
      if(grid[i][8] === null) grid[i][8] = 0;
    }
  }
  for(let i = 0; i < 8; i++){
    if(grid[8][size - 1 - i] === null) grid[8][size - 1 - i] = 0;
    if(grid[size - 1 - i][8] === null) grid[size - 1 - i][8] = 0;
  }
  grid[size - 8][8] = 1;                       /* dark module */

  /* ---- zigzag data placement ---- */
  const allBits = [];
  for(const byte of finalBytes) for(let i = 7; i >= 0; i--) allBits.push((byte >> i) & 1);
  const isData = grid.map(row => row.map(v => v === null));
  let bi = 0, upward = true;
  for(let col = size - 1; col > 0; col -= 2){
    if(col === 6) col--;
    for(let cnt = 0; cnt < size; cnt++){
      const row = upward ? size - 1 - cnt : cnt;
      for(let k = 0; k < 2; k++){
        const c = col - k;
        if(!isData[row][c]) continue;
        grid[row][c] = bi < allBits.length ? allBits[bi++] : 0;
      }
    }
    upward = !upward;
  }

  /* ---- choose best mask (penalty rules 1–4) ---- */
  function maskFn(m, r, c){
    switch(m){
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r/2) + Math.floor(c/3)) % 2 === 0;
      case 5: return ((r*c) % 2) + ((r*c) % 3) === 0;
      case 6: return (((r*c) % 2) + ((r*c) % 3)) % 2 === 0;
      default: return (((r+c) % 2) + ((r*c) % 3)) % 2 === 0;
    }
  }
  function penalty(g){
    let p = 0;
    for(let r = 0; r < size; r++){
      let run = 1;
      for(let c = 1; c < size; c++){
        if(g[r][c] === g[r][c-1]) run++;
        else { if(run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if(run >= 5) p += 3 + (run - 5);
    }
    for(let c = 0; c < size; c++){
      let run = 1;
      for(let r = 1; r < size; r++){
        if(g[r][c] === g[r-1][c]) run++;
        else { if(run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if(run >= 5) p += 3 + (run - 5);
    }
    for(let r = 0; r < size-1; r++) for(let c = 0; c < size-1; c++){
      const v0 = g[r][c];
      if(v0 === g[r][c+1] && v0 === g[r+1][c] && v0 === g[r+1][c+1]) p += 3;
    }
    let dark = 0;
    for(let r = 0; r < size; r++) for(let c = 0; c < size; c++) dark += g[r][c];
    const pct = dark / (size * size) * 100;
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }
  let bestMask = 0, bestPen = Infinity, bestGrid = null;
  for(let m = 0; m < 8; m++){
    const g = grid.map(row => row.slice());
    for(let r = 0; r < size; r++) for(let c = 0; c < size; c++){
      if(isData[r][c] && maskFn(m, r, c)) g[r][c] ^= 1;
    }
    const pen = penalty(g);
    if(pen < bestPen){ bestPen = pen; bestMask = m; bestGrid = g; }
  }

  /* ---- format info BCH(15,5), EC level M = 00 ---- */
  const fmtBase = (0b00 << 3) | bestMask;
  let rem = fmtBase << 10;
  for(let i = 14; i >= 10; i--){
    if((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  }
  const fmtBits = ((fmtBase << 10) | rem) ^ 0b101010000010010;
  for(let i = 0; i < 15; i++){
    const bit = (fmtBits >> i) & 1;             /* i=0 is LSB */
    /* vertical strip near top-left */
    if(i < 6) bestGrid[i][8] = bit;
    else if(i === 6) bestGrid[7][8] = bit;
    else if(i === 7) bestGrid[8][8] = bit;
    else if(i === 8) bestGrid[8][7] = bit;
    else bestGrid[8][14 - i] = bit;
    /* mirrored copy */
    if(i < 8) bestGrid[8][size - 1 - i] = bit;
    else bestGrid[size - 15 + i][8] = bit;
  }
  bestGrid[size - 8][8] = 1;

  return { modules: bestGrid, size };
}

window.lcQrSvg = function(text){
  const q = qrEncode(String(text));
  const n = q.size, quiet = 4, dim = n + quiet * 2;
  let d = '';
  for(let r = 0; r < n; r++) for(let c = 0; c < n; c++){
    if(q.modules[r][c]) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim +
    '" shape-rendering="crispEdges" width="280" height="280">' +
    '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>' +
    '<path d="' + d + '" fill="#000"/></svg>';
};

window.lcQrPng = function(text, scale){
  scale = scale || 8;
  const q = qrEncode(String(text));
  const quiet = 4, dim = (q.size + quiet * 2) * scale;
  const c = document.createElement('canvas');
  c.width = c.height = dim;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000';
  for(let r = 0; r < q.size; r++) for(let col = 0; col < q.size; col++){
    if(q.modules[r][col]) ctx.fillRect((col + quiet) * scale, (r + quiet) * scale, scale, scale);
  }
  return c.toDataURL('image/png');
};

/* ---------- Share modal additions: short link + QR buttons ---------- */
const _mo = new MutationObserver(() => {
  const m = $id('shareModal');
  if(m && m.classList.contains('active') && !$id('lc-share-extras')){
    buildShareExtras(S.CURRENT_PERSON);
  }
});

function buildShareExtras(p){
  const wrap = $id('lc-share-extras');
  if(wrap) wrap.remove();
  const modal = $id('shareModal');
  if(!modal || !p) return;
  const shortUrl = window.lcShortLink(p.slug);
  const div = document.createElement('div');
  div.id = 'lc-share-extras';
  div.style.cssText = 'margin-top:.7rem;padding:.6rem .7rem;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);';
  div.innerHTML =
    '<div style="font-size:.78rem;font-weight:700;margin-bottom:.35rem;">🔗 HD 1.0 — Short link & QR</div>' +
    '<div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;">' +
      '<code style="flex:1;min-width:180px;font-size:.72rem;background:rgba(0,0,0,.3);padding:.3rem .5rem;border-radius:8px;word-break:break-all;">' + esc(shortUrl) + '</code>' +
      '<button type="button" class="panel-btn" id="lcCopyShort" style="min-width:0;padding:.3rem .7rem;font-size:.75rem;">📋 Copy</button>' +
      '<button type="button" class="panel-btn" id="lcQrShow" style="min-width:0;padding:.3rem .7rem;font-size:.75rem;">🖼️ QR</button>' +
    '</div>' +
    '<div style="font-size:.68rem;opacity:.75;margin-top:.3rem;">Print the QR on a gift tag 🎁 — scanning it opens this card directly.</div>';
  modal.querySelector('.pw-content, .panel-content, div')?.appendChild(div);
  const copyBtn = $id('lcCopyShort');
  if(copyBtn) copyBtn.onclick = async () => {
    try{ await navigator.clipboard.writeText(shortUrl); copyBtn.textContent = '✅ Copied'; }
    catch(e){ prompt('Copy the short link:', shortUrl); }
    setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
  };
  const qrBtn = $id('lcQrShow');
  if(qrBtn) qrBtn.onclick = () => showQrOverlay(shortUrl, p);
}

function showQrOverlay(url, p){
  let ov = $id('lcQrOverlay');
  if(ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'lcQrOverlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', 'QR code for ' + (p.display_name || 'card'));
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483050;background:rgba(10,0,8,.85);display:flex;align-items:center;justify-content:center;padding:1rem;';
  ov.innerHTML =
    '<div style="background:#fff;color:#222;border-radius:18px;padding:1.1rem 1.2rem;max-width:340px;text-align:center;font-family:Georgia,serif;">' +
      '<div style="font-weight:800;font-size:1rem;margin-bottom:.2rem;">💝 ' + esc(p.display_name || 'Card') + '</div>' +
      '<div style="font-size:.72rem;color:#777;margin-bottom:.6rem;">Scan to open this surprise card</div>' +
      '<div id="lcQrBox">' + window.lcQrSvg(url) + '</div>' +
      '<div style="font-size:.62rem;color:#999;margin-top:.4rem;word-break:break-all;">' + esc(url) + '</div>' +
      '<div style="display:flex;gap:.5rem;justify-content:center;margin-top:.8rem;">' +
        '<button type="button" id="lcQrDl" style="border:none;background:#c41e3a;color:#fff;border-radius:10px;padding:.5rem .9rem;font-weight:700;cursor:pointer;">⬇️ Save PNG</button>' +
        '<button type="button" id="lcQrPr" style="border:none;background:#333;color:#fff;border-radius:10px;padding:.5rem .9rem;font-weight:700;cursor:pointer;">🖨️ Print</button>' +
        '<button type="button" id="lcQrX" style="border:none;background:#ddd;color:#333;border-radius:10px;padding:.5rem .9rem;font-weight:700;cursor:pointer;">✕ Close</button>' +
      '</div></div>';
  document.body.appendChild(ov);
  $id('lcQrX').onclick = () => ov.remove();
  ov.addEventListener('click', e => { if(e.target === ov) ov.remove(); });
  $id('lcQrDl').onclick = () => {
    const a = document.createElement('a');
    a.href = window.lcQrPng(url, 10);
    a.download = 'lovecards-qr-' + (p.slug || 'card') + '.png';
    a.click();
  };
  $id('lcQrPr').onclick = () => {
    const w = window.open('', '_blank');
    if(!w) return;
    w.document.write('<html><head><title>LoveCards QR</title></head><body style="text-align:center;font-family:sans-serif;">' +
      '<h2>💝 ' + esc(p.display_name || '') + ' — scan me</h2>' + window.lcQrSvg(url) +
      '<p style="color:#777;font-size:12px;">' + esc(url) + '</p><script>window.print()<\/script></body></html>');
    w.document.close();
  };
}

/* Hook into existing share modal opening */
document.addEventListener('DOMContentLoaded', () => {
  const m = $id('shareModal');
  if(m) _mo.observe(m, { attributes: true, attributeFilter: ['class'] });
});


/* ============================================================
   4) WHO VIEWED MY CARD (analytics panel)
   ============================================================ */
window.lcWhoViewed = async function(slug){
  try{
    const r = await fetch(window.SUPABASE_URL + '/rest/v1/card_views?select=device,entry,opened_at,duration_ms,tz,lang&slug=eq.' + encodeURIComponent(slug) + '&order=opened_at.desc&limit=200',
      { headers: { 'apikey': window.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY }, cache: 'no-store' });
    if(!r.ok) return [];
    return await r.json() || [];
  }catch(e){ return []; }
};

function injectWhoViewed(){
  const pane = $id('pane-analytics');
  if(!pane || $id('hd1-whoviewed')) return;
  const box = document.createElement('div');
  box.className = 'panel-section';
  box.id = 'hd1-whoviewed';
  box.innerHTML =
    '<div class="panel-section-title">👁️ Who viewed my card</div>' +
    '<div class="panel-field"><label class="panel-label">Card</label><select class="panel-select" id="hd1WvSel"></select></div>' +
    '<button type="button" class="repeat-add" id="hd1WvBtn">🔍 Load viewers</button>' +
    '<div id="hd1WvOut" style="margin-top:.5rem;font-size:.78rem;"></div>';
  pane.appendChild(box);
  const sel = $id('hd1WvSel');
  sel.innerHTML = (S.PEOPLE || []).filter(p => !p.deleted).map(p =>
    '<option value="' + esc(p.slug) + '">' + esc(p.display_name || p.slug) + '</option>').join('');
  $id('hd1WvBtn').onclick = async () => {
    const out = $id('hd1WvOut');
    out.textContent = '⏳ Loading…';
    const rows = await window.lcWhoViewed(sel.value);
    if(!rows.length){ out.innerHTML = '📭 No cloud views yet (run setup/rls.sql once to enable tracking).'; return; }
    const byDev = {};
    rows.forEach(v => {
      const d = byDev[v.device] || (byDev[v.device] = { n: 0, last: '', ms: 0, tz: v.tz, entry: v.entry });
      d.n++; d.ms += v.duration_ms || 0;
      if(v.opened_at > d.last) d.last = v.opened_at;
    });
    const devs = Object.keys(byDev).sort((a,b) => byDev[b].last.localeCompare(byDev[a].last));
    out.innerHTML = '<div style="margin-bottom:.3rem;">🔥 <strong>' + devs.length + '</strong> unique visitor(s) · 👁 ' + rows.length + ' opens</div>' +
      devs.slice(0, 20).map((d, i) => {
        const v = byDev[d];
        const mins = Math.round(v.ms / 60000 * 10) / 10;
        return '<div style="padding:.3rem .4rem;border-bottom:1px solid rgba(255,255,255,.08);">' +
          '<strong>#' + (i+1) + '</strong> 👤 ' + esc(d.slice(0, 8)) + '… · ' + esc(v.tz || '?') +
          ' · opened ' + v.n + '× · ⏱ ' + mins + ' min · via ' + esc(v.entry || '?') +
          '<br><span style="opacity:.7;">last: ' + esc((v.last || '').slice(0, 16).replace('T', ' ')) + ' UTC</span></div>';
      }).join('');
  };
}
document.addEventListener('DOMContentLoaded', () => setTimeout(injectWhoViewed, 1700));

/* ============================================================
   5) AUTO-BIRTHDAY THEME SWITCHING (with morph animation)
   ============================================================ */
window.lcBirthdayToday = function(iso){
  if(!iso) return false;
  const parts = String(iso).slice(0, 10).split('-');
  if(parts.length < 3) return false;
  const m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
  const now = new Date();
  return now.getMonth() + 1 === m && now.getDate() === d;
};

window.lcAutoThemeForPerson = function(p){
  try{
    const s = (S.CURR && S.CURR.shared) || {};
    if(s.autoBirthdayTheme === 'off') return null;
    if(!p || !p.birthday) return null;
    if(!window.lcBirthdayToday(p.birthday)) return null;
    const want = s.birthdayTheme || 'birthday';
    const cur = s.theme || 'romantic';
    if(cur === want) return null;
    return want;
  }catch(e){ return null; }
};

/* Applied right after the card renders — swaps palette with a sparkle morph */
const _renderCard = window.renderCardFull;
window.renderCardFull = function(){
  const r = _renderCard && _renderCard.apply(this, arguments);
  try{
    const p = S.CURRENT_PERSON;
    const want = window.lcAutoThemeForPerson(p);
    if(want){
      const viewer = $id('viewerScreen');
      if(viewer && !viewer.dataset.bdMorph){
        viewer.dataset.bdMorph = '1';
        setTimeout(() => {
          viewer.classList.add('bd-morph');
          viewer.setAttribute('data-theme', want);
          if(window.fireworksBurst) try{ window.fireworksBurst(innerWidth/2, innerHeight/3); }catch(e){}
          if(window.__showToast) window.__showToast('🎂 Happy birthday! Cake theme activated ✨', true);
          setTimeout(() => viewer.classList.remove('bd-morph'), 1400);
        }, 900);
      }
    }
  }catch(e){}
  return r;
};

/* Admin toggle inside Theme pane */
function injectAutoThemeToggle(){
  const pane = $id('pane-theme');
  if(!pane || $id('hd1-autobt')) return;
  const box = document.createElement('div');
  box.className = 'panel-section';
  box.id = 'hd1-autobt';
  box.innerHTML =
    '<div class="panel-section-title">🎂 Auto-birthday theme (HD 1.0)</div>' +
    '<div class="toggle-box"><label><input type="checkbox" id="f_autoBirthdayTheme"> ✨ On the recipient\'s birthday, morph to the cake theme automatically (with confetti)</label></div>' +
    '<div class="panel-field"><label class="panel-label">Birthday theme</label>' +
      '<select class="panel-select" id="f_birthdayTheme">' +
        ['birthday','festive','sunset','royal','romantic'].map(t => '<option value="' + t + '">' + t + '</option>').join('') +
      '</select></div>';
  pane.appendChild(box);
  const cb = $id('f_autoBirthdayTheme'), sel = $id('f_birthdayTheme');
  const st = (S.CURR && S.CURR.shared) || {};
  cb.checked = st.autoBirthdayTheme === 'true';
  if(st.birthdayTheme) sel.value = st.birthdayTheme;
  cb.addEventListener('change', () => { if(S.CURR && S.CURR.shared) S.CURR.shared.autoBirthdayTheme = cb.checked ? 'true' : 'off'; });
  sel.addEventListener('change', () => { if(S.CURR && S.CURR.shared) S.CURR.shared.birthdayTheme = sel.value; });
}
document.addEventListener('DOMContentLoaded', () => setTimeout(injectAutoThemeToggle, 1600));

/* CSS for the morph */
(function(){
  const s = document.createElement('style');
  s.textContent =
    '@keyframes bdMorphK{0%{filter:brightness(1) saturate(1)}30%{filter:brightness(1.5) saturate(1.6)}100%{filter:brightness(1) saturate(1)}}' +
    '.bd-morph{animation:bdMorphK 1.3s ease;}';
  document.head.appendChild(s);
})();

/* ============================================================
   6) MUSIC-SYNCED SLIDESHOW BEAT PULSE
   ============================================================ */
(function(){
  let raf = null, audioEl = null;
  function findAudio(){
    return document.querySelector('#musicPlayer audio') ||
           document.querySelector('audio[data-music]') ||
           (window.MUSIC_AUDIO || null);
  }
  const mo = new MutationObserver(() => {
    const ss = $id('slideshowOverlay');
    if(ss && ss.classList.contains('active')) start();
    else stop();
  });
  function start(){
    if(raf) return;
    const style = document.createElement('style');
    style.id = 'hd1-beat-css';
    style.textContent = '.ss-beat{transform:scale(var(--lcbeat,1));transition:transform .08s linear;}';
    if(!$id('hd1-beat-css')) document.head.appendChild(style);
    const tick = () => {
      audioEl = audioEl || findAudio();
      const track = $id('slideshowTrack') || document.querySelector('.slideshow-track');
      if(audioEl && track){
        /* bass proxy: volume + currentTime phase drives a gentle pulse */
        const ph = (audioEl.currentTime || 0) % 0.5;
        const amp = audioEl.paused ? 1 : (1 + 0.03 * Math.sin(ph / 0.5 * Math.PI) * (0.6 + (audioEl.volume || 1)));
        track.style.setProperty('--lcbeat', amp.toFixed(3));
        track.classList.add('ss-beat');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function stop(){
    if(raf){ cancelAnimationFrame(raf); raf = null; }
    const track = $id('slideshowTrack') || document.querySelector('.slideshow-track');
    if(track) track.classList.remove('ss-beat');
  }
  document.addEventListener('DOMContentLoaded', () => {
    const ss = $id('slideshowOverlay');
    if(ss) mo.observe(ss, { attributes: true, attributeFilter: ['class'] });
  });
})();

/* ============================================================
   7) PDF EXPORT (print-to-PDF of the live card)
   ============================================================ */
window.lcExportPdf = function(){
  const p = S.CURRENT_PERSON;
  if(!p){ if(window.__showToast) window.__showToast('Open a card first 🥰', false); return; }
  const t = (S.CURR && S.CURR.texts) || {};
  const media = (S.CURR && S.CURR.media) || [];
  const story = (S.CURR && S.CURR.story) || [];
  const events = (S.CURR && S.CURR.events) || [];
  const imgs = media.slice(0, 12).map(m => m.url || m.drive_url || '').filter(Boolean);
  const w = window.open('', '_blank');
  if(!w){ if(window.__showToast) window.__showToast('Allow pop-ups to export PDF', false); return; }
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    esc(t.pageTitle || (p.display_name || 'Card')) + ' — LoveCards</title><style>' +
    'body{font-family:Georgia,serif;color:#3a0a13;max-width:720px;margin:auto;padding:2rem;}' +
    'h1{color:#8b0028;} .msg{white-space:pre-wrap;line-height:1.7;margin:1rem 0;}' +
    '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:1rem 0;}' +
    '.grid img{width:100%;border-radius:10px;}' +
    '.ev{padding:.4rem 0;border-bottom:1px dashed #ccc;} @media print{.noprint{display:none}}' +
    '</style></head><body>' +
    '<h1>💕 ' + esc(t.mainHeadline || t.pageTitle || (p.display_name || 'A surprise')) + '</h1>' +
    '<p><em>' + esc(t.greeting || '') + '</em></p>' +
    ['msg1','msg2','msg3','msg4','msg5'].map(k => t[k] ? '<div class="msg">' + esc(t[k]) + '</div>' : '').join('') +
    (t.signoff ? '<p><strong>' + esc(t.signoff) + '</strong></p>' : '') +
    (imgs.length ? '<div class="grid">' + imgs.map(u => '<img src="' + esc(u) + '" onerror="this.remove()">').join('') + '</div>' : '') +
    (story.length ? '<h2>📖 Our Story</h2>' + story.map(s => '<div class="msg"><strong>' + esc(s.title || '') + '</strong><br>' + esc(s.body || '') + '</div>').join('') : '') +
    (events.length ? '<h2>📅 Moments</h2>' + events.map(e => '<div class="ev">' + esc(e.icon || '📅') + ' ' + esc(e.label || '') + ' — ' + esc(e.target_iso || '') + '</div>').join('') : '') +
    '<hr><p style="font-size:.75rem;color:#999;">Exported from LoveCards HD 1.0 · ' + new Date().toLocaleDateString() + '</p>' +
    '<button class="noprint" onclick="window.print()" style="padding:.6rem 1.2rem;font-size:1rem;cursor:pointer;border-radius:10px;border:none;background:#8b0028;color:#fff;">🖨️ Print / Save as PDF</button>' +
    '<script>setTimeout(()=>window.print(),600)<\/script></body></html>');
  w.document.close();
};

/* floating export button inside viewer toolbar */
function injectExportBtn(){
  const bar = document.querySelector('.viewer-screen');
  if(!bar || $id('hd1ExportBtn')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'hd1ExportBtn';
  b.className = 'viewer-edit-card-btn';
  b.title = 'Export this card as PDF';
  b.textContent = '🧾 PDF';
  b.style.cssText = 'position:fixed;right:14px;top:64px;z-index:60;';
  b.onclick = () => window.lcExportPdf();
  bar.appendChild(b);
}
document.addEventListener('DOMContentLoaded', () => setTimeout(injectExportBtn, 1200));

/* ============================================================
   8) TIMELINE VIEW (story + events + uploads merged)
   ============================================================ */
window.lcOpenTimeline = function(){
  const p = S.CURRENT_PERSON;
  if(!p) return;
  let ov = $id('hd1TlOverlay');
  if(ov) ov.remove();
  const items = [];
  ((S.CURR && S.CURR.story) || []).forEach(s => items.push({ d: s.date || s.created_at || '', icon: '📖', title: s.title || 'Memory', body: s.body || '' }));
  ((S.CURR && S.CURR.events) || []).forEach(e => items.push({ d: e.target_iso || '', icon: e.icon || '📅', title: e.label || 'Event', body: '' }));
  ((S.CURR && S.CURR.media) || []).forEach(m => items.push({ d: m.uploaded_at || m.created_at || '', icon: '📸', title: m.caption || 'Photo memory', body: '', img: m.url || m.drive_url || '' }));
  items.sort((a, b) => String(a.d || '').localeCompare(String(b.d || '')));
  ov = document.createElement('div');
  ov.id = 'hd1TlOverlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', 'Memory timeline');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483040;background:rgba(10,0,8,.92);overflow:auto;padding:2rem 1rem;';
  ov.innerHTML =
    '<div style="max-width:560px;margin:auto;color:#fff;font-family:Georgia,serif;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">' +
    '<h2 style="margin:0;color:#ffd166;">🕰️ Timeline — ' + esc(p.display_name || '') + '</h2>' +
    '<button type="button" id="hd1TlX" aria-label="Close timeline" style="background:#fff;color:#333;border:none;border-radius:10px;padding:.4rem .8rem;font-weight:700;cursor:pointer;">✕</button></div>' +
    (items.length ? '<div style="border-left:3px solid rgba(255,209,102,.5);padding-left:1rem;">' +
      items.map(it => '<div style="margin-bottom:1rem;">' +
        '<div style="font-size:.7rem;color:#ffb3c1;">' + esc(String(it.d || '').slice(0, 10) || '—') + '</div>' +
        '<div><strong>' + it.icon + ' ' + esc(it.title) + '</strong>' +
        (it.body ? '<div style="font-size:.85rem;opacity:.85;white-space:pre-wrap;">' + esc(it.body) + '</div>' : '') +
        (it.img ? '<img src="' + esc(it.img) + '" alt="" loading="lazy" style="max-width:180px;border-radius:10px;margin-top:.3rem;" onerror="this.remove()">' : '') +
        '</div></div>').join('') + '</div>'
      : '<p style="opacity:.8;">No dated memories yet — add dates to story pages to grow the timeline 🌱</p>') +
    '</div>';
  document.body.appendChild(ov);
  $id('hd1TlX').onclick = () => ov.remove();
};
/* add a Timeline button next to map/story buttons on the card */
function injectTimelineBtn(){
  const row = $id('voiceRow') && $id('voiceRow').parentElement;
  if(!row || $id('hd1TlBtn')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'hd1TlBtn';
  b.className = 'extra-btn';
  b.textContent = '🕰️ Timeline';
  b.setAttribute('aria-label', 'Open memory timeline');
  b.onclick = () => window.lcOpenTimeline();
  row.insertBefore(b, row.firstChild);
}
document.addEventListener('DOMContentLoaded', () => setTimeout(injectTimelineBtn, 1400));

})();
