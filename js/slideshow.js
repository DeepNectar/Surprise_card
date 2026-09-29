/* ============================================================
   slideshow.js — Full-screen memories slideshow
   v6 — mobile-safe musicDuringVideo + on-screen debug
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

/* ---------- DEBUG (reads same flag as music.js) ---------- */
const DEBUG_ENABLED = (function(){
  try{ return localStorage.getItem('debug_music') === '1'; }
  catch(e){ return false; }
})();

function dbg(tag, msg){
  if(!DEBUG_ENABLED) return;
  const el = document.getElementById('musicDebugPanel');
  if(!el) return;
  const t = new Date().toLocaleTimeString('en-GB', {hour12:false});
  const div = document.createElement('div');
  div.style.whiteSpace = 'pre-wrap';
  div.textContent = '[' + t + '] ' + tag + ' ' + msg;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

/* ---------- state ---------- */
let SS = [];
let SS_IDX = 0;
let SS_T = null;
let SS_VIDEO_TIMER = null;
let SS_TX_T = null;
let SS_isOpen = false;
let SS_musicPausedForVideo = false;
let SS_touchSX = 0;
let SS_touchSY = 0;
let SS_floaterTimer = null;
let SS_currentEffect = null;
let SS_crashed = false;

const SS_PHOTO_EFFECTS = ['fx-ken-in','fx-ken-out','fx-pan-lr','fx-pan-rl','fx-pan-tb','fx-rotate','fx-fade','fx-blur','fx-scale-down'];
const SS_VIDEO_EFFECTS = ['vfx-fade','vfx-zoom','vfx-slide-right','vfx-blur'];
const SS_FLOAT_EMOJI   = ['❤️','💕','✨','🌹','💖','🌸','⭐','💛','🎀','🕊️','🦋','💫','🌷','🎊','💗','🎈'];

/* ============================================================
   Error boundary
   ============================================================ */
window.addEventListener('error', (e) => {
  if(!SS_isOpen || SS_crashed) return;
  SS_crashed = true;
  dbg('❌', 'slideshow error: ' + (e && e.message));
  try{ SS_close(); }catch(_){}
  setTimeout(() => { SS_crashed = false; }, 2000);
});

/* ---------- timer helpers ---------- */
window.SS_clearTimers = function(){
  if(SS_T){ clearTimeout(SS_T); SS_T = null; }
  if(SS_VIDEO_TIMER){ clearTimeout(SS_VIDEO_TIMER); SS_VIDEO_TIMER = null; }
  if(SS_TX_T){ clearTimeout(SS_TX_T); SS_TX_T = null; }
};

/* ---------- setting accessors ---------- */
function SS_photoDurationMs(){
  const v = clampDuration((S.CURR.shared || {}).photoDurationSec || '5', 5, 1, 60);
  return v * 1000;
}
function SS_effectsEnabled(){
  const v = (S.CURR.shared || {}).slideEffectsEnabled;
  return v === undefined ? true : String(v) !== 'false';
}
function SS_effectsIntensity(){
  const v = parseFloat((S.CURR.shared || {}).effectsIntensity || '1');
  if(!isFinite(v) || v <= 0) return 1;
  return Math.max(0.5, Math.min(1.6, v));
}
function SS_floatersEnabled(){
  const v = (S.CURR.shared || {}).floatersEnabled;
  return v === undefined ? true : String(v) !== 'false';
}
function SS_floaterDensity(){
  const v = parseInt((S.CURR.shared || {}).floaterDensity || '1', 10);
  if(isNaN(v)) return 1;
  return Math.max(0, Math.min(2, v));
}
function SS_musicDuringVideo(){
  return String((S.CURR.shared || {}).musicDuringVideo) === 'true';
}

/* ---------- video helpers ---------- */
function SS_playVideo(v, unmuteBtn){
  if(!v) return;
  try{ v.currentTime = 0; }catch(e){}
  v.muted = false;
  v.volume = 1;
  const p = v.play();
  if(p && p.then){
    p.then(() => { if(unmuteBtn) unmuteBtn.classList.remove('show'); dbg('▶', 'video playing'); })
     .catch(() => {
       if(!v) return;
       v.muted = true;
       const p2 = v.play();
       if(p2 && p2.then){
         p2.then(() => { if(unmuteBtn) unmuteBtn.classList.add('show'); dbg('▶', 'video muted'); })
           .catch(() => { if(unmuteBtn) unmuteBtn.classList.add('show'); dbg('❌', 'video failed'); });
       }
     });
  }
}

/* ---------- volume fade ---------- */
function SS_fadeVolume(target, duration){
  const a = window.getAudioPlayer ? window.getAudioPlayer() : $('audioPlayer');
  if(!a || !a.src) return;
  const start = a.volume;
  if(Math.abs(start - target) < 0.01){ a.volume = target; return; }
  const steps = Math.max(1, Math.round((duration || 400) / 30));
  let i = 0;
  if(a._ssFadeTimer) clearInterval(a._ssFadeTimer);
  a._ssFadeTimer = setInterval(() => {
    i++;
    const t = i / steps;
    a.volume = Math.max(0, Math.min(1, start + (target - start) * t));
    if(i >= steps){
      clearInterval(a._ssFadeTimer);
      a._ssFadeTimer = null;
      a.volume = target;
    }
  }, 30);
}

/* ============================================================
   MUSIC HANDOFF for video/photo
   ============================================================ */
function SS_musicPauseForVideo(){
  if(!window.isMusicPlaying || !window.isMusicPlaying()){
    dbg('🎵', 'video slide (music not playing)');
    return;
  }

  if(SS_musicDuringVideo()){
    // ✅ Option ON: keep music playing at reduced volume
    const target = parseFloat((S.CURR.shared || {}).vol_video_music || '0.35');
    const vol = isFinite(target) ? Math.max(0, Math.min(1, target)) : 0.35;
    SS_fadeVolume(vol, 400);
    SS_musicPausedForVideo = false;
    dbg('🎵', 'ducked music to ' + vol + ' (during video)');
  } else {
    // Default: fully pause music for the video
    if(window.pauseMusic) window.pauseMusic();
    SS_musicPausedForVideo = true;
    dbg('🎵', 'paused music for video');
  }
}

function SS_musicResumeForVideo(){
  // Detect if the browser silently paused our music (common on mobile)
  const a = window.getAudioPlayer ? window.getAudioPlayer() : $('audioPlayer');
  const musicActuallyPaused = !a || !a.src || a.paused;

  if(!SS_musicPausedForVideo){
    // We were supposed to be ducking, not paused
    if(SS_musicDuringVideo()){
      if(musicActuallyPaused){
        // Browser forced a pause under the video → resume properly
        dbg('🎵', 'browser paused music under video → resuming');
        if(window.resumeMusic) window.resumeMusic();
      } else {
        // Still playing → just restore the full slideshow volume
        const vol = window.getVol('slideshow');
        SS_fadeVolume(vol, 400);
        dbg('🎵', 'restored music volume to ' + vol);
      }
    }
    return;
  }

  // We explicitly paused for the video — resume from saved position
  if(window.resumeMusic) window.resumeMusic();
  SS_musicPausedForVideo = false;
  dbg('🎵', 'resumed music after video');
}

/* ============================================================
   MUSIC HANDOFF — once on open
   ============================================================ */
function SS_startMusicOnce(){
  const mode = ((S.CURR.shared || {}).music_mode || 'both').trim();
  dbg('open', 'music_mode=' + mode + ', musicDuringVideo=' + SS_musicDuringVideo());

  if(mode === 'card'){
    dbg('open', 'card-only mode → music keeps playing');
    return;
  }

  const ssList = window.buildPlaylistFor('slideshow');
  dbg('open', 'slideshow playlist: ' + ssList.length + ' tracks');

  if(window.pauseMusic) window.pauseMusic();

  if(!ssList || !ssList.length){
    dbg('open', 'no slideshow music configured');
    return;
  }

  if(window.resetSlideshowMusic) window.resetSlideshowMusic();
  if(window.__setCurrCtx__) window.__setCurrCtx__('slideshow', ssList);
  if(window.startMusicFor) window.startMusicFor('slideshow');
}

/* ============================================================
   SESSION
   ============================================================ */
window.SS_saveSession = function(){
  try{
    if(S.CURRENT_PERSON && S.CURRENT_PERSON.slug){
      sessionStorage.setItem('active_person_slug', S.CURRENT_PERSON.slug);
      sessionStorage.setItem('active_view', 'viewer');
    }
  }catch(e){}
};
window.SS_clearSession = function(){
  try{
    sessionStorage.removeItem('active_person_slug');
    sessionStorage.removeItem('active_view');
  }catch(e){}
};
window.SS_restoreSession = function(){
  try{
    const slug = sessionStorage.getItem('active_person_slug');
    const view = sessionStorage.getItem('active_view');
    if(!slug || view !== 'viewer') return false;
    const p = S.PEOPLE.find(x => x.slug === slug);
    if(!p) return false;
    S.CURRENT_PERSON = p;
    window.__loadPersonIntoState__(p).then(() => {
      // Respect the same access rules as a normal login — never skip lock screen on restore
      const sh = S.CURR.shared || {};
      const unlockIso = sh.unlockDateISO || '';
      const now = new Date();
      const unlockDate = unlockIso ? new Date(unlockIso) : null;
      const locked = unlockDate && !isNaN(unlockDate) && now < unlockDate;
      const showLock = sh.showLockScreen === 'true';
      $('homeScreen').classList.add('hidden');
      if(locked || showLock){
        sessionStorage.removeItem('active_view');
        window.renderLockFull();
        show($('lockScreen'));
        if(locked) window.startCountdownFull(unlockDate);
        else txt($('countdownLabelEl'), '');
        return;
      }
      S.PREVIEW_MODE = false;
      S.REQUESTER_MODE = false;
      show($('viewerScreen'));
      const pt = $('viewerPreviewTag'); if(pt) pt.style.display = 'none';
      const eb = $('viewerEditCardBtn'); if(eb) eb.classList.remove('visible');
      const mt = $('musicToggle'); if(mt) mt.classList.toggle('visible', window.buildPlaylistFor('card').length > 0);
      const lt = $('langToggle'); if(lt) lt.classList.toggle('visible', true);
      window.renderCardFull();
      window.startCard();
      window.scrollTo(0, 0);
    }).catch(() => {});
    return true;
  }catch(e){ return false; }
};

/* ============================================================
   BUILD SLIDES
   ============================================================ */
function SS_buildSlides(){
  const t = $('slidesTrack');
  if(!t) return;
  t.innerHTML = '';
  const dots = $('slideshowDots');
  if(dots) dots.innerHTML = '';

  SS.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'slide' + (s.type === 'video' ? ' video-slide' : '');
    d.dataset.i = i;

    if(s.type === 'video'){
      const v = document.createElement('video');
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.preload = 'none';
      v.setAttribute('disablepictureinpicture', '');
      v.muted = true;
      d.appendChild(v);

      const ub = document.createElement('button');
      ub.type = 'button';
      ub.className = 'unmute-btn';
      ub.textContent = '🔊 Tap for sound';
      ub.setAttribute('aria-label', 'Unmute video');
      const doUnmute = e => {
        if(e && e.preventDefault) e.preventDefault();
        if(e && e.stopPropagation) e.stopPropagation();
        v.muted = false;
        v.volume = 1;
        const p = v.play();
        if(p && p.then) p.then(() => ub.classList.remove('show')).catch(() => {});
      };
      ub.addEventListener('click', doUnmute);
      ub.addEventListener('touchstart', doUnmute, {passive: false});
      d.appendChild(ub);

      v.addEventListener('ended', () => {
        if(SS_isOpen && SS[SS_IDX] && SS[SS_IDX] === s){
          dbg('slide', 'video ended → next');
          SS_clearTimers();
          SS_next();
        }
      });
      v.addEventListener('error', () => {
        if(SS_isOpen && SS[SS_IDX] && SS[SS_IDX] === s){
          dbg('slide', 'video error → next in 800ms');
          SS_clearTimers();
          setTimeout(() => { if(SS_isOpen) SS_next(); }, 800);
        }
      });
    } else {
      const img = document.createElement('img');
      img.className = 'fx-target';
      img.loading = 'lazy';
      img.decoding = 'async';
      d.appendChild(img);
    }

    if(s.title){
      const cap = document.createElement('div');
      cap.className = 'slide-title';
      cap.textContent = String(s.title);
      d.appendChild(cap);
    }

    t.appendChild(d);

    if(dots){
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.dataset.i = i;
      dot.onclick = () => { SS_IDX = i; SS_updateSlide(); };
      dots.appendChild(dot);
    }
  });
}

/* ============================================================
   LAZY LOAD
   ============================================================ */
function SS_lazyLoadSlide(i){
  const t = $('slidesTrack');
  if(!t) return;
  const slideEl = t.children[i];
  if(!slideEl) return;
  const cur = SS[i];
  if(!cur) return;

  if(cur.type === 'video'){
    const v = slideEl.querySelector('video');
    if(v && !v.src && cur.src){
      v.src = cur.src;
      v.preload = 'metadata';
      try{ v.load(); }catch(e){}
    }
  } else {
    const img = slideEl.querySelector('img.fx-target');
    if(img && !img.src && cur.drive_id){
      /* w1600 full-screen quality, served pre-resized by Google = fast load */
      img.src = 'https://lh3.googleusercontent.com/d/' + cur.drive_id + '=w1600';
      img.onerror = () => {
        img.src = 'https://drive.google.com/thumbnail?id=' + cur.drive_id + '&sz=w1600';
      };
    }
  }
}

function SS_preloadNeighbours(i){
  const n = SS.length;
  if(n < 2) return;
  [(i + 1) % n, (i - 1 + n) % n].forEach(idx => {
    const item = SS[idx];
    if(!item || item.type !== 'photo' || !item.drive_id) return;
    const pre = new Image();
    pre.src = 'https://drive.google.com/thumbnail?id=' + item.drive_id + '&sz=w800';
  });
}

/* ============================================================
   EFFECTS
   ============================================================ */
function SS_applyEffectToCurrent(){
  const t = $('slidesTrack');
  if(!t) return;
  const cur = SS[SS_IDX];
  const slideEl = t.children[SS_IDX];
  if(!cur || !slideEl) return;

  SS_PHOTO_EFFECTS.forEach(c => slideEl.classList.remove(c));
  SS_VIDEO_EFFECTS.forEach(c => slideEl.classList.remove(c));

  if(!SS_effectsEnabled()) return;

  if(cur.type === 'video'){
    const fx = SS_VIDEO_EFFECTS[Math.floor(Math.random() * SS_VIDEO_EFFECTS.length)];
    slideEl.classList.add(fx);
    SS_currentEffect = fx;
  } else {
    const fx = SS_PHOTO_EFFECTS[Math.floor(Math.random() * SS_PHOTO_EFFECTS.length)];
    slideEl.classList.add(fx);
    const inten = SS_effectsIntensity();
    const base = SS_photoDurationMs() + 2000;
    const dur = Math.max(2500, Math.round(base / inten));
    slideEl.style.setProperty('--fx-dur', dur + 'ms');
    SS_currentEffect = fx;
  }
}

/* ============================================================
   SLIDE UPDATE
   ============================================================ */
function SS_animateTrackTo(){
  const t = $('slidesTrack');
  if(!t) return;
  t.style.transform = `translateX(-${SS_IDX * 100}%)`;
}

function SS_updateSlide(){
  const t = $('slidesTrack');
  if(!t) return;

  SS_animateTrackTo();
  txt($('slideshowCounter'), (SS_IDX + 1) + ' / ' + SS.length);

  const dots = $('slideshowDots');
  if(dots) dots.querySelectorAll('.dot').forEach((el, i) => el.classList.toggle('active', i === SS_IDX));

  SS_clearTimers();

  Array.from(t.children).forEach((slideEl, i) => {
    if(i !== SS_IDX){
      const v = slideEl.querySelector('video');
      if(v){ try{ v.pause(); }catch(e){} }
      const ub = slideEl.querySelector('.unmute-btn');
      if(ub) ub.classList.remove('show');
    }
  });

  const cur = SS[SS_IDX];
  const slideEl = t.children[SS_IDX];
  if(!cur || !slideEl) return;

  SS_lazyLoadSlide(SS_IDX);
  SS_preloadNeighbours(SS_IDX);

  if(SS_TX_T) clearTimeout(SS_TX_T);
  SS_TX_T = setTimeout(() => {
    if(SS_isOpen && SS[SS_IDX] === cur) SS_applyEffectToCurrent();
  }, 80);

  if(cur.type === 'video'){
    dbg('slide', 'VIDEO #' + SS_IDX);
    SS_musicPauseForVideo();

    const v = slideEl.querySelector('video');
    const ub = slideEl.querySelector('.unmute-btn');
    if(v){
      SS_VIDEO_TIMER = setTimeout(() => {
        if(!SS_isOpen || SS[SS_IDX] !== cur) return;
        const tryPlay = () => SS_playVideo(v, ub);
        if(v.readyState >= 1) tryPlay();
        else v.addEventListener('loadedmetadata', tryPlay, {once: true});
      }, 200);
    }
    const pb = $('slideshowProgress');
    if(pb){ pb.style.transition = 'none'; pb.style.width = '0%'; }
  } else {
    dbg('slide', 'PHOTO #' + SS_IDX);
    SS_musicResumeForVideo();

    const dur = SS_photoDurationMs();
    const pb = $('slideshowProgress');
    if(pb){
      pb.style.transition = 'none';
      pb.style.width = '0%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if(!SS_isOpen) return;
          pb.style.transition = 'width ' + dur + 'ms linear';
          pb.style.width = '100%';
        });
      });
    }
    SS_T = setTimeout(() => { if(SS_isOpen) SS_next(); }, dur);
  }
}

function SS_next(){
  if(!SS.length){ SS_close(); return; }
  SS_IDX = (SS_IDX + 1) % SS.length;
  SS_updateSlide();
}
function SS_prev(){
  if(!SS.length) return;
  SS_IDX = (SS_IDX - 1 + SS.length) % SS.length;
  SS_updateSlide();
}

/* ============================================================
   CLOSE
   ============================================================ */
function SS_close(){
  dbg('close', 'stopping slideshow, resuming card');
  SS_isOpen = false;
  hide($('slideshowOverlay'));
  SS_clearTimers();
  window.SS_stopFloaters();

  const t = $('slidesTrack');
  if(t){
    Array.from(t.children).forEach(slideEl => {
      const v = slideEl.querySelector('video');
      if(v){
        try{
          v.pause();
          v.removeAttribute('src');
          v.load();
        }catch(e){}
      }
      const ub = slideEl.querySelector('.unmute-btn');
      if(ub) ub.classList.remove('show');
    });
    t.innerHTML = '';
  }

  const dots = $('slideshowDots');
  if(dots) dots.innerHTML = '';
  const pb = $('slideshowProgress');
  if(pb){ pb.style.transition = 'none'; pb.style.width = '0%'; }

  SS_musicPausedForVideo = false;

  if(window.stopMusic) window.stopMusic();
  if(window.startMusicFor) window.startMusicFor('card');

  if(!S.PREVIEW_MODE && S.CURRENT_PERSON) window.openClosingModal();
}

/* ============================================================
   BINDINGS
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const openBtn = $('openBtn');
  if(openBtn) openBtn.onclick = async (e) => {
    if(e && e.preventDefault) e.preventDefault();
    if(e && e.stopPropagation) e.stopPropagation();

    if(!S.CURRENT_PERSON){ alert('No person selected.'); return; }

    const rows = await sb.rows(T_MEDIA, S.CURRENT_PERSON.id) || [];
    const filtered = (rows || []).filter(r =>
      (r.type === 'video' && r.src) ||
      (r.type === 'photo' && r.drive_id)
    );
    if(!filtered.length){ alert('No memories yet 💕'); return; }

    const s = S.CURR.shared || {};
    let ordered = filtered.slice();
    if(String(s.shuffleMediaOn) === 'true'){
      const orderStr = String(s.mediaOrder || '').trim();
      if(orderStr){
        const idxs = orderStr.split(',')
          .map(x => parseInt(x, 10))
          .filter(x => !isNaN(x) && x >= 0 && x < ordered.length);
        if(idxs.length === ordered.length){
          const seen = new Set(); const out = [];
          idxs.forEach(i => { if(!seen.has(i)){ seen.add(i); out.push(ordered[i]); } });
          ordered.forEach((r, i) => { if(!seen.has(i)) out.push(r); });
          ordered = out;
        }
      }
    }
    const pi = ordered.findIndex(r => r.type !== 'video');
    if(pi > 0){
      const [p] = ordered.splice(pi, 1);
      ordered.unshift(p);
    }

    SS = ordered;
    SS_IDX = 0;
    SS_buildSlides();
    show($('slideshowOverlay'));
    SS_isOpen = true;
    window.SS_saveSession();
    SS_startMusicOnce();
    SS_startFloaters();
    SS_updateSlide();
    return false;
  };

  const prevBtn = $('slideshowPrev');
  if(prevBtn) prevBtn.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); SS_prev(); };
  const nextBtn = $('slideshowNext');
  if(nextBtn) nextBtn.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); SS_next(); };
  const closeBtn = $('slideshowClose');
  if(closeBtn) closeBtn.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); SS_close(); };

  const sc = $('slideshowContainer');
  if(sc){
    sc.addEventListener('touchstart', e => {
      SS_touchSX = e.changedTouches[0].screenX;
      SS_touchSY = e.changedTouches[0].screenY;
    }, {passive: true});
    sc.addEventListener('touchend', e => {
      const dx = SS_touchSX - e.changedTouches[0].screenX;
      const dy = SS_touchSY - e.changedTouches[0].screenY;
      if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)){
        if(dx > 0) SS_next(); else SS_prev();
      }
    }, {passive: true});
  }

  document.addEventListener('keydown', e => {
    if(!SS_isOpen) return;
    if(e.key === 'ArrowRight') SS_next();
    else if(e.key === 'ArrowLeft') SS_prev();
    else if(e.key === 'Escape') SS_close();
  });

  document.addEventListener('visibilitychange', () => {
    if(document.hidden){
      SS_clearTimers();
      const t = $('slidesTrack');
      if(t){
        Array.from(t.children).forEach(slideEl => {
          const v = slideEl.querySelector('video');
          if(v && !v.paused) v.pause();
        });
      }
      const a = $('audioPlayer');
      if(a) a.pause();
    } else if(SS_isOpen){
      SS_updateSlide();
      if(window.resumeMusic) window.resumeMusic();
    }
  });
});

/* ---------- expose SS_isOpen ---------- */
try{
  Object.defineProperty(window, 'SS_isOpen', {
    configurable: true,
    get: () => SS_isOpen,
    set: v => { SS_isOpen = !!v; }
  });
}catch(e){
  window.SS_isOpen = SS_isOpen;
  window.SS_setOpen = v => { SS_isOpen = !!v; };
}

/* ---------- floaters ---------- */
function SS_startFloaters(){
  const layer = $('ssFloaterLayer');
  if(!layer) return;
  layer.innerHTML = '';
  if(!SS_floatersEnabled()) return;
  const density = SS_floaterDensity();
  if(density === 0) return;
  const perSpawn = density === 1 ? 2 : 3;
  const spawnEveryMs = density === 1 ? 900 : 500;
  const seedCount = density === 1 ? 12 : 20;

  const spawn = () => {
    if(!SS_isOpen) return;
    if(!SS_floatersEnabled()) return;
    for(let k = 0; k < perSpawn; k++){
      const s = document.createElement('span');
      s.className = 'ss-floater';
      s.textContent = SS_FLOAT_EMOJI[Math.floor(Math.random() * SS_FLOAT_EMOJI.length)];
      s.style.left = (Math.random() * 100) + '%';
      s.style.fontSize = (1.0 + Math.random() * 1.6) + 'rem';
      const dur = (8 + Math.random() * 9) * (density === 2 ? 0.7 : 1);
      s.style.animationDuration = dur + 's';
      s.style.animationDelay = (Math.random() * 1.5) + 's';
      layer.appendChild(s);
      setTimeout(() => { if(s.parentNode) s.parentNode.removeChild(s); }, (dur + 2) * 1000);
    }
  };
  for(let i = 0; i < seedCount; i++) setTimeout(spawn, i * (spawnEveryMs / seedCount));
  SS_floaterTimer = setInterval(spawn, spawnEveryMs);
}
window.SS_stopFloaters = function(){
  if(SS_floaterTimer){ clearInterval(SS_floaterTimer); SS_floaterTimer = null; }
  const layer = $('ssFloaterLayer');
  if(layer) layer.innerHTML = '';
};

})();
