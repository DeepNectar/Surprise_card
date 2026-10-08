/* ============================================================
   sound.js — V3.0 Subtle UI sound effects (WebAudio, no files)
   Toggleable via 🔔 button; default ON but very quiet.
   ============================================================ */
(function(){
'use strict';

const KEY = 'v3SoundOn';
let ctx = null;

function enabled(){
  try{ return localStorage.getItem(KEY) !== 'off'; }catch(e){ return true; }
}

function ac(){
  if(!ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    try{ ctx = new AC(); }catch(e){ return null; }
  }
  if(ctx.state === 'suspended'){ try{ ctx.resume(); }catch(e){} }
  return ctx;
}

function tone(freq, start, dur, gainPeak, type){
  const c = ac(); if(!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

/* kind: click | success | error | pop | magic */
window.v3PlaySound = function(kind){
  if(!enabled()) return;
  try{
    switch(kind){
      case 'success': /* rising chime */
        tone(659.25, 0,    0.18, 0.05);
        tone(783.99, 0.09, 0.18, 0.05);
        tone(1046.5, 0.18, 0.30, 0.06);
        break;
      case 'error':
        tone(220, 0,  0.16, 0.05, 'triangle');
        tone(185, 0.12, 0.22, 0.05, 'triangle');
        break;
      case 'pop':
        tone(880, 0, 0.06, 0.045, 'square');
        break;
      case 'magic':
        tone(523.25, 0,    0.12, 0.04);
        tone(659.25, 0.07, 0.12, 0.04);
        tone(783.99, 0.14, 0.12, 0.04);
        tone(1046.5, 0.21, 0.22, 0.05);
        break;
      case 'click':
      default:
        tone(1200, 0, 0.045, 0.03, 'triangle');
    }
  }catch(e){}
};

/* Global click listener — plays a soft tick on buttons/links (capture phase,
   never cancels or alters the original event handling). */
document.addEventListener('pointerdown', (e) => {
  const t = e.target;
  if(t && t.closest && t.closest('button, .home-btn, .gift-box, .v3-btn')){
    window.v3PlaySound('click');
  }
}, true);

/* ---------- Toggle chip (bottom-left, beside music/lang/dark toggles) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'soundToggle';
  btn.className = 'music-toggle lang-toggle sound-toggle';
  btn.style.left = 'calc(env(safe-area-inset-left, 0px) + 4.6rem)';
  btn.setAttribute('aria-label', 'Toggle sound effects');
  const paint = () => { btn.textContent = enabled() ? '🔔' : '🔕'; };
  paint();
  btn.onclick = () => {
    try{ localStorage.setItem(KEY, enabled() ? 'off' : 'on'); }catch(e){}
    paint();
    if(enabled()) window.v3PlaySound('pop');
  };
  document.body.appendChild(btn);
});

})();
