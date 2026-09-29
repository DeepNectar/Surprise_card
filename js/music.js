/* ============================================================
   music.js — Music playback controller (card + slideshow handoff)
   v5 — built-in on-screen debug (opt-in via ?debug=1)
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

/* ---------- DEBUG SYSTEM (opt-in, invisible by default) ---------- */
const DEBUG_ENABLED = (function(){
  try{
    const urlFlag = new URLSearchParams(location.search).get('debug');
    if(urlFlag === '1') { localStorage.setItem('debug_music', '1'); return true; }
    if(urlFlag === '0') { localStorage.removeItem('debug_music'); return false; }
    return localStorage.getItem('debug_music') === '1';
  }catch(e){ return false; }
})();

let DBG_EL = null;
let DBG_LINES = [];

function dbg(tag, msg){
  if(!DEBUG_ENABLED) return;
  const t = new Date().toLocaleTimeString('en-GB', {hour12:false});
  const line = '[' + t + '] ' + tag + ' ' + msg;
  DBG_LINES.push(line);
  if(DBG_LINES.length > 40) DBG_LINES.shift();
  if(!DBG_EL) createDbgPanel();
  if(DBG_EL){
    DBG_EL.innerHTML = DBG_LINES.map(l =>
      '<div style="white-space:pre-wrap;word-break:break-all;">' +
      l.replace(/&/g,'&amp;').replace(/</g,'&lt;') +
      '</div>'
    ).join('');
    DBG_EL.scrollTop = DBG_EL.scrollHeight;
  }
}

function createDbgPanel(){
  if(DBG_EL) return;
  DBG_EL = document.createElement('div');
  DBG_EL.id = 'musicDebugPanel';
  DBG_EL.style.cssText = [
    'position:fixed','bottom:0','left:0','right:0',
    'max-height:35vh','overflow-y:auto',
    'background:rgba(0,0,0,.88)','color:#0f0',
    'font-family:monospace','font-size:11px','line-height:1.4',
    'padding:6px 8px','z-index:999999',
    'border-top:2px solid #0f0','pointer-events:auto'
  ].join(';');

  const close = document.createElement('button');
  close.textContent = '✕ DEBUG OFF';
  close.style.cssText = [
    'position:fixed','top:6px','right:6px',
    'background:#c41e3a','color:#fff','border:none',
    'padding:3px 8px','border-radius:4px',
    'font-size:11px','cursor:pointer','z-index:1000000'
  ].join(';');
  close.onclick = () => {
    try{ localStorage.removeItem('debug_music'); }catch(e){}
    location.reload();
  };
  document.body.appendChild(close);
  document.body.appendChild(DBG_EL);
}

/* ---------- state ---------- */
let CURR_CTX = 'card';
let CARD_LIST = [];
let CARD_IDX = -1;
let CARD_TIME = 0;
let SS_LIST = [];
let SS_IDX = -1;
let SS_TIME = 0;
let MUSIC_ON = false;
let MUSIC_STARTED = false;

/* ---------- volume helpers ---------- */
window.getVol = function(ctx){
  const s = S.CURR.shared || {};
  if(ctx === 'video')     return parseFloat(s.vol_video) || 1.0;
  if(ctx === 'slideshow') return parseFloat(s.vol_slide) || 0.85;
  return parseFloat(s.vol_card) || 0.45;
};

/* ---------- playlist builders ---------- */
window.buildPlaylistFor = function(ctx){
  const s = S.CURR.shared || {};
  const mode = (s.music_mode || 'both').trim();

  if(mode === 'card' && ctx === 'slideshow') return [];
  if(mode === 'slideshow' && ctx === 'card') return [];

  const base = [];
  for(let i = 1; i <= 5; i++){
    const on = String(s['song' + i + '_on'] || '') === 'true';
    const url = String(s['song' + i + '_url'] || '').trim();
    let w = String(s['song' + i + '_where'] || 'both').trim();
    if(w !== 'card' && w !== 'slideshow' && w !== 'both') w = 'both';
    if(!on || !url) continue;
    if(w === 'both' || w === ctx) base.push(url);
  }

  const orderStr = String(s.musicOrder || '').trim();
  if(orderStr && base.length > 1){
    const idxs = orderStr.split(',')
      .map(x => parseInt(x, 10))
      .filter(x => !isNaN(x) && x >= 0 && x < base.length);
    if(idxs.length === base.length){
      const seen = new Set();
      const out = [];
      idxs.forEach(i => {
        if(!seen.has(i)){ seen.add(i); out.push(base[i]); }
      });
      base.forEach((u, i) => { if(!seen.has(i)) out.push(u); });
      return out;
    }
  }
  return base;
};

/* ---------- internal: play a track ---------- */
function playTrack(list, idx, ctx, startTime){
  const a = $('audioPlayer');
  if(!a || !list.length) return;
  const url = list[idx];
  if(!url) return;

  try{ a.pause(); }catch(e){}

  a.src = url;
  a.volume = window.getVol(ctx);

  if(startTime && startTime > 0){
    try{ a.currentTime = startTime; }catch(e){}
  } else {
    try{ a.currentTime = 0; }catch(e){}
  }

  a.play()
    .then(() => {
      MUSIC_ON = true;
      MUSIC_STARTED = true;
      const mt = $('musicToggle');
      if(mt) mt.textContent = '🔊';
      dbg('▶', ctx + ' trk' + idx + ' @ ' + (startTime || 0).toFixed(1) + 's');
    })
    .catch((err) => {
      MUSIC_ON = false;
      const mt = $('musicToggle');
      if(mt) mt.textContent = '🔇';
      dbg('❌', ctx + ' blocked: ' + (err && err.message));
    });
}

/* ---------- public: start music for a context ---------- */
window.startMusicFor = function(ctx){
  const list = buildPlaylistFor(ctx);
  dbg('start', ctx + ' → ' + list.length + ' tracks');

  const mt = $('musicToggle');
  if(mt) mt.classList.toggle('visible', list.length > 0);

  if(!list.length){
    if(ctx === 'slideshow') return;
    const a = $('audioPlayer');
    if(a){ try{ a.pause(); }catch(e){} }
    MUSIC_ON = false;
    if(mt) mt.textContent = '🔇';
    return;
  }

  if(CURR_CTX === ctx && MUSIC_ON){
    const a = $('audioPlayer');
    if(a && !a.paused && a.src){
      dbg('skip', ctx + ' already playing');
      return;
    }
  }

  if(CURR_CTX === 'card' && ctx !== 'card'){
    const a = $('audioPlayer');
    if(a && a.src) CARD_TIME = a.currentTime || 0;
  }
  if(CURR_CTX === 'slideshow' && ctx !== 'slideshow'){
    const a = $('audioPlayer');
    if(a && a.src) SS_TIME = a.currentTime || 0;
  }

  CURR_CTX = ctx;

  if(ctx === 'card'){
    CARD_LIST = list;
    if(CARD_IDX >= 0 && CARD_IDX < CARD_LIST.length){
      playTrack(CARD_LIST, CARD_IDX, 'card', CARD_TIME);
    } else {
      CARD_IDX = 0;
      CARD_TIME = 0;
      playTrack(CARD_LIST, 0, 'card', 0);
    }
  } else if(ctx === 'slideshow'){
    SS_LIST = list;
    if(SS_IDX >= 0 && SS_IDX < SS_LIST.length){
      playTrack(SS_LIST, SS_IDX, 'slideshow', SS_TIME);
    } else {
      SS_IDX = 0;
      SS_TIME = 0;
      playTrack(SS_LIST, 0, 'slideshow', 0);
    }
  }
};

/* ---------- public: pause music (saves position) ---------- */
window.pauseMusic = function(){
  const a = $('audioPlayer');
  if(!a) return;
  if(CURR_CTX === 'card' && a.src) CARD_TIME = a.currentTime || 0;
  if(CURR_CTX === 'slideshow' && a.src) SS_TIME = a.currentTime || 0;
  try{ a.pause(); }catch(e){}
  MUSIC_ON = false;
  dbg('⏸', CURR_CTX + ' @ ' + ((CURR_CTX === 'card' ? CARD_TIME : SS_TIME) || 0).toFixed(1) + 's');
};

/* ---------- public: resume music (from saved position) ---------- */
window.resumeMusic = function(){
  const a = $('audioPlayer');
  if(!a || !a.src){
    dbg('resume', 'no src');
    return;
  }

  if(CURR_CTX === 'card' && CARD_TIME > 0){
    try{ a.currentTime = CARD_TIME; }catch(e){}
  } else if(CURR_CTX === 'slideshow' && SS_TIME > 0){
    try{ a.currentTime = SS_TIME; }catch(e){}
  }

  a.volume = window.getVol(CURR_CTX === 'slideshow' ? 'slideshow' : 'card');

  a.play()
    .then(() => {
      MUSIC_ON = true;
      const mt = $('musicToggle');
      if(mt) mt.textContent = '🔊';
      dbg('▶', 'resume ' + CURR_CTX);
    })
    .catch((err) => {
      dbg('❌', 'resume blocked: ' + (err && err.message));
    });
};

/* ---------- public: stop everything ---------- */
window.stopMusic = function(){
  const a = $('audioPlayer');
  if(a){
    try{
      a.pause();
      a.currentTime = 0;
      a.removeAttribute('src');
      a.load();
    }catch(e){}
  }
  MUSIC_ON = false;
  MUSIC_STARTED = false;
  CARD_LIST = []; CARD_IDX = -1; CARD_TIME = 0;
  SS_LIST = []; SS_IDX = -1; SS_TIME = 0;
  CURR_CTX = 'card';
  const mt = $('musicToggle');
  if(mt) mt.textContent = '🔇';
  dbg('⏹', 'stopMusic');
};

/* ---------- public: reset slideshow position ---------- */
window.resetSlideshowMusic = function(){
  SS_IDX = 0;
  SS_TIME = 0;
};

/* ---------- public: handle track ended ---------- */
window.musicTrackEnded = function(){
  if(!MUSIC_ON) return;
  if(CURR_CTX === 'card' && CARD_LIST.length){
    CARD_IDX = (CARD_IDX + 1) % CARD_LIST.length;
    CARD_TIME = 0;
    playTrack(CARD_LIST, CARD_IDX, 'card', 0);
  } else if(CURR_CTX === 'slideshow' && SS_LIST.length){
    SS_IDX = (SS_IDX + 1) % SS_LIST.length;
    SS_TIME = 0;
    playTrack(SS_LIST, SS_IDX, 'slideshow', 0);
  }
};

/* ---------- public: helpers ---------- */
window.getAudioPlayer = function(){ return $('audioPlayer'); };
window.getCurrCtx = function(){ return CURR_CTX; };
window.isMusicPlaying = function(){
  const a = $('audioPlayer');
  return !!(a && a.src && !a.paused);
};

window.__setCurrCtx__ = function(ctx, list){
  CURR_CTX = ctx;
  if(ctx === 'slideshow' && list){
    SS_LIST = list;
    SS_IDX = 0;
    SS_TIME = 0;
  }
  if(ctx === 'card' && list){
    CARD_LIST = list;
    CARD_IDX = 0;
  }
};

/* ---------- DEBUG API ---------- */
window.__debugMusic = function(){
  const s = S.CURR.shared || {};
  const a = $('audioPlayer');
  return {
    music_mode: s.music_mode || '(unset → both)',
    musicDuringVideo: s.musicDuringVideo,
    vol_video_music: s.vol_video_music,
    card_playlist: buildPlaylistFor('card'),
    slide_playlist: buildPlaylistFor('slideshow'),
    CURR_CTX: CURR_CTX,
    MUSIC_ON: MUSIC_ON,
    CARD_IDX: CARD_IDX, CARD_TIME: CARD_TIME,
    SS_IDX: SS_IDX, SS_TIME: SS_TIME,
    audio_src: a ? (a.src || '').slice(-40) : null,
    audio_paused: a ? a.paused : null,
    audio_volume: a ? a.volume : null,
    audio_time: a ? a.currentTime : null
  };
};

window.__debugMusicEnable = function(){
  try{ localStorage.setItem('debug_music', '1'); }catch(e){}
  location.reload();
};
window.__debugMusicDisable = function(){
  try{ localStorage.removeItem('debug_music'); }catch(e){}
  location.reload();
};

/* ---------- bindings ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const a = $('audioPlayer');
  if(a){
    a.addEventListener('ended', () => window.musicTrackEnded());
    a.addEventListener('error', () => {
      dbg('❌', 'audio error, skipping');
      window.musicTrackEnded();
    });
  }

  const mt = $('musicToggle');
  if(mt) mt.onclick = () => {
    const a = $('audioPlayer');
    if(!a) return;
    if(MUSIC_ON && !a.paused){
      a.pause();
      MUSIC_ON = false;
      mt.textContent = '🔇';
    } else {
      a.play().then(() => {
        MUSIC_ON = true;
        mt.textContent = '🔊';
      }).catch(() => {});
    }
  };

  if(DEBUG_ENABLED) createDbgPanel();
});

})();
