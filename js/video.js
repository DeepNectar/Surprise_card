/* ============================================================
   video.js — Video message playback
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
let VM_CURRENT = null;

function closeVideoMessage(){
  if(!VM_CURRENT) return;
  const m = VM_CURRENT;
  VM_CURRENT = null;
  const v = m.querySelector('video');
  if(v){
    try{
      v.pause();
      v.currentTime = 0;
      v.removeAttribute('src');
      v.load();
    }catch(e){}
  }
  m.remove();
}

function openVideoMessage(){
  if(!S.CURR.video || !S.CURR.video.length) return;
  closeVideoMessage();

  const item = S.CURR.video[0];
  const m = document.createElement('div');
  m.className = 'info-modal active';
  m.innerHTML =
    '<div class="info-content vm-modal-content">' +
      '<button class="info-close" id="vmClose">✕</button>' +
      '<div class="info-title">' + esc(item.title || 'A message') + '</div>' +
      '<video class="vm-video" src="' + esc(item.video_url || '') + '" controls playsinline autoplay></video>' +
    '</div>';

  document.body.appendChild(m);
  VM_CURRENT = m;

  const v = m.querySelector('video');
  if(v){
    const tryPlay = () => {
      v.muted = false;
      const p = v.play();
      if(p && p.then){
        p.catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
      }
    };
    tryPlay();
    v.addEventListener('ended', closeVideoMessage);
    v.addEventListener('error', () => setTimeout(closeVideoMessage, 600));
  }

  const cb = m.querySelector('#vmClose');
  if(cb) cb.onclick = closeVideoMessage;
  m.addEventListener('click', e => { if(e.target === m) closeVideoMessage(); });
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = $('videoMsgBtn');
  if(btn) btn.onclick = openVideoMessage;
});

})();