/* ============================================================
   voice.js — Voice message playback
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

document.addEventListener('DOMContentLoaded', () => {
  const btn = $('voicePlayBtn');
  if(!btn) return;

  btn.onclick = () => {
    if(!S.CURR.voice || !S.CURR.voice.length) return;

    const a = $('audioPlayer');
    if(!a) return;

    if(a.src === S.CURR.voice[0].audio_url && !a.paused){
      a.pause();
      btn.innerHTML = '<span>▶️</span><span>' + (getText('voiceBtnText', 'Play Voice Message')) + '</span>';
      return;
    }

    a.src = S.CURR.voice[0].audio_url || '';
    a.volume = parseFloat((S.CURR.shared || {}).vol_card || '0.45') || 0.45;
    a.play()
      .then(() => {
        btn.innerHTML = '<span>⏸️</span><span>Playing…</span>';
      })
      .catch(() => {
        __showToast('❌ Could not play voice message', false);
      });
  };

  const a = $('audioPlayer');
  if(a) a.addEventListener('pause', () => {
    if(S.CURR && S.CURR.voice && S.CURR.voice.length && btn){
      btn.innerHTML = '<span>▶️</span><span>' + (getText('voiceBtnText', 'Play Voice Message')) + '</span>';
    }
  });
  if(a) a.addEventListener('ended', () => {
    if(btn){
      btn.innerHTML = '<span>▶️</span><span>' + (getText('voiceBtnText', 'Play Voice Message')) + '</span>';
    }
  });
});

})();