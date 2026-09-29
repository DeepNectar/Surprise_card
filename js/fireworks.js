/* ============================================================
   fireworks.js — Fireworks + confetti + sparkles + balloons
   ============================================================ */
(function(){
'use strict';

const FW_COLORS = ['#8b0028','#c41e3a','#ffd700','#ffed4e','#d4a373','#ffe0e6','#ff69b4','#ff8a3d','#2a5fd1','#9d4edd'];
const CONF_COLORS = ['#ffd700','#ffed4e','#ff4d6d','#c41e3a','#2a5fd1','#9d4edd','#25D366','#ff8a3d','#67e8f9'];

window.fireworksBurst = function(x, y){
  if(getShared('enableFireworks', 'true') !== 'true') return;
  for(let i = 0; i < 26; i++){
    const p = document.createElement('div');
    p.className = 'firework';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.backgroundColor = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.3;
    const d = 60 + Math.random() * 120;
    p.style.setProperty('--tx', Math.cos(a) * d + 'px');
    p.style.setProperty('--ty', Math.sin(a) * d + 'px');
    p.style.animationDuration = (0.9 + Math.random() * 0.7) + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1700);
  }
};

window.confettiCannon = function(originX, originY, count){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const n = count || 60;
  for(let i = 0; i < n; i++){
    const c = document.createElement('div');
    c.className = 'confetti-piece';
    c.style.left = (originX || window.innerWidth / 2) + 'px';
    c.style.top = (originY || 0) + 'px';
    c.style.background = CONF_COLORS[Math.floor(Math.random() * CONF_COLORS.length)];
    c.style.width = (6 + Math.random() * 8) + 'px';
    c.style.height = (10 + Math.random() * 10) + 'px';
    c.style.borderRadius = Math.random() < 0.4 ? '50%' : '2px';
    c.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
    c.style.animationDelay = (Math.random() * 0.35) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
};

/* ---------- Global click fireworks ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  if(t.closest('button, a, input, textarea, select, .gift-box, .modal, .panel-modal, .pw-modal, .lock-screen, .opening-screen, .cake-clickable, .home-screen, .info-modal, .slideshow-overlay, .lang-mini-tabs, .person-card')) return;
  fireworksBurst(e.clientX, e.clientY);
});

/* ---------- Cursor sparkles (desktop only) ---------- */
(function(){
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(isTouch || reduced) return;
  const pool = ['✨','💖','⭐','💫','🌸'];
  let last = 0;
  document.addEventListener('mousemove', e => {
    const now = Date.now();
    if(now - last < 70) return;
    last = now;
    const s = document.createElement('div');
    s.className = 'cursor-sparkle';
    s.textContent = pool[Math.floor(Math.random() * pool.length)];
    s.style.left = (e.clientX - 7) + 'px';
    s.style.top = (e.clientY - 7) + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }, {passive: true});
})();

})();