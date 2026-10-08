/* ============================================================
   fireworks.js — Fireworks + confetti + sparkles + balloons
   Canvas-based: no per-click DOM nodes, no forced layout.
   ============================================================ */
(function(){
'use strict';

const FW_COLORS = ['#8b0028','#c41e3a','#ffd700','#ffed4e','#d4a373','#ffe0e6','#ff69b4','#ff8a3d','#2a5fd1','#9d4edd'];
const CONF_COLORS = ['#ffd700','#ffed4e','#ff4d6d','#c41e3a','#2a5fd1','#9d4edd','#25D366','#ff8a3d','#67e8f9'];

const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- single shared canvas overlay ---------- */
let cv = null, ctx = null, rafId = null;
const parts = [];               // active particles (capped)
const MAX_PARTS = 350;

function ensureCanvas(){
  if(cv) return true;
  cv = document.createElement('canvas');
  cv.id = 'fw-canvas';
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:99999';
  document.body.appendChild(cv);
  ctx = cv.getContext('2d');
  resize();
  window.addEventListener('resize', resize, {passive:true});
  return true;
}
function resize(){
  if(!cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width  = Math.floor(innerWidth * dpr);
  cv.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawn(p){
  if(parts.length >= MAX_PARTS) parts.shift(); // drop oldest instead of growing unbounded
  parts.push(p);
  if(rafId == null) rafId = requestAnimationFrame(step);
}

let lastT = 0;
function step(t){
  const dt = Math.min((t - lastT) / 1000 || 0.016, 0.05);
  lastT = t;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for(let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    p.life -= dt;
    if(p.life <= 0){ parts.splice(i, 1); continue; }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const alpha = Math.max(p.life / p.maxLife, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    if(p.shape === 'rect'){
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if(parts.length){ rafId = requestAnimationFrame(step); }
  else { rafId = null; lastT = 0; }
}

window.fireworksBurst = function(x, y){
  if(getShared('enableFireworks', 'true') !== 'true') return;
  if(reducedMotion()) return;
  if(!ensureCanvas()) return;
  for(let i = 0; i < 26; i++){
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.3;
    const sp = 140 + Math.random() * 260;
    const life = 0.9 + Math.random() * 0.7;
    spawn({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, g: 220,
            r: 2 + Math.random()*2.5, color: FW_COLORS[i % FW_COLORS.length],
            shape:'dot', rot:0, vr:0, life, maxLife:life });
  }
};

window.confettiCannon = function(originX, originY, count){
  if(reducedMotion()) return;
  if(!ensureCanvas()) return;
  const n = Math.min(count || 60, 120);
  const ox = originX || innerWidth / 2, oy = originY || 0;
  for(let i = 0; i < n; i++){
    const a = -Math.PI/2 + (Math.random()-0.5) * 1.2;
    const sp = 300 + Math.random() * 450;
    const life = 1.6 + Math.random() * 1.8;
    spawn({ x: ox, y: oy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, g: 500,
            w: 6 + Math.random()*8, h: 10 + Math.random()*10,
            color: CONF_COLORS[i % CONF_COLORS.length],
            shape:'rect', rot: Math.random()*Math.PI, vr: (Math.random()-0.5)*8,
            life, maxLife: life });
  }
};

/* ---------- Global click fireworks ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  if(t.closest('button, a, input, textarea, select, .gift-box, .modal, .panel-modal, .pw-modal, .lock-screen, .opening-screen, .cake-clickable, .home-screen, .info-modal, .slideshow-overlay, .lang-mini-tabs, .person-card')) return;
  fireworksBurst(e.clientX, e.clientY);
}, {passive: true});

/* ---------- Cursor sparkles (desktop only, throttled, canvas) ---------- */
(function(){
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if(isTouch || reducedMotion()) return;
  let last = 0;
  document.addEventListener('mousemove', e => {
    const now = performance.now();
    if(now - last < 120) return;           // throttle harder: was 70ms of DOM churn
    if(!getShared('enableFireworks', 'true')) return;
    last = now;
    if(!ensureCanvas()) return;
    const life = 0.9;
    spawn({ x: e.clientX - 7 + Math.random()*14, y: e.clientY - 7,
            vx: (Math.random()-0.5)*30, vy: -20 - Math.random()*30, g: 40,
            r: 1.5 + Math.random()*1.5,
            color: FW_COLORS[Math.floor(Math.random()*FW_COLORS.length)],
            shape:'dot', rot:0, vr:0, life, maxLife:life });
  }, {passive: true});
})();

})();
