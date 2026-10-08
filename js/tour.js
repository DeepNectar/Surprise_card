/* ============================================================
   tour.js — V3.0 Onboarding tour (5-step animated guide)
   Shown once on first visit; purely additive, changes nothing.
   ============================================================ */
(function(){
'use strict';

const KEY = 'v3TourDone';
let step = 0;
let overlay = null;

const STEPS = [
  {emoji:'👋', title:'Welcome to your surprise app!',
   body:'This is a private space full of love — personalised cards with messages, photos, countdowns and gifts made just for each person here.'},
  {emoji:'💝', title:'Pick who you are',
   body:'Tap the button with your name on the home screen. Each card has its own password so only the right people can open it.'},
  {emoji:'✍️', title:'Want to make one?',
   body:'Tap <strong>Guest ✍️</strong> to create a surprise for someone special — download the template, fill it, and submit it for approval. It\'s that easy!'},
  {emoji:'🎂', title:'Open & enjoy',
   body:'After entering your password, tap the cake 🎂 to reveal live counters, gift boxes, a memories slideshow, story pages, voice notes and videos.'},
  {emoji:'💛', title:'Leave a review',
   body:'When you finish watching a card, rate your experience. Your review appears on the home screen for everyone to see. Enjoy! 💕'}
];

function hideTour(){
  if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
}

function renderStep(){
  const s = STEPS[step];
  const dots = STEPS.map((_, i) =>
    '<span class="v3-dot' + (i === step ? ' on' : '') + '"></span>').join('');
  overlay.innerHTML =
    '<div class="v3-card">' +
      '<button type="button" class="v3-skip" id="v3Skip">Skip ✕</button>' +
      '<div class="v3-emoji">' + s.emoji + '</div>' +
      '<div class="v3-title">' + s.title + '</div>' +
      '<div class="v3-body">' + s.body + '</div>' +
      '<div class="v3-dots">' + dots + '</div>' +
      '<div class="v3-actions">' +
        (step > 0 ? '<button type="button" class="v3-btn ghost" id="v3Back">← Back</button>' : '') +
        '<button type="button" class="v3-btn primary" id="v3Next">' +
          (step === STEPS.length - 1 ? 'Start exploring 🚀' : 'Next →') +
        '</button>' +
      '</div>' +
    '</div>';

  const next = $('v3Next'), back = $('v3Back'), skip = $('v3Skip');
  if(next) next.onclick = () => {
    if(step >= STEPS.length - 1){ finish(); }
    else { step++; renderStep(); }
  };
  if(back) back.onclick = () => { step--; renderStep(); };
  if(skip) skip.onclick = finish;
}

function finish(){
  try{ localStorage.setItem(KEY, '1'); }catch(e){}
  hideTour();
  if(window.v3PlaySound) window.v3PlaySound('success');
}

window.openV3Tour = function(){
  try{ if(localStorage.getItem(KEY) === '1') return; }catch(e){}
  if($('v3TourOverlay')) return;
  step = 0;
  overlay = document.createElement('div');
  overlay.id = 'v3TourOverlay';
  overlay.className = 'v3-overlay active';
  document.body.appendChild(overlay);
  renderStep();
};

document.addEventListener('DOMContentLoaded', () => {
  window.openV3Tour();
});

})();
