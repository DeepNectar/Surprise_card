/* ============================================================
   videomaker.js — 🎥 Make a Video (recipient viewer)
   ------------------------------------------------------------
   Renders the current card into a vertical 1080×1920 WebM video,
   fully client-side via Canvas + MediaRecorder:

     • Cover screen   — headline, subhead, names badge
     • Love message   — greeting + paragraphs, typed word-by-word
     • Photo memories — slideshow photos with Ken-Burns pan/zoom
                        and captions (cross-fade transitions)
     • Countdown      — "Every second since we met…" live counter
     • Ending screen  — from-label + names + floating hearts

     • Optional background music — the card's own playlist is
       captured through WebAudio (MediaElementSource → stream).

   A live preview canvas + progress bar are shown while rendering;
   when done the recipient gets Download / Share buttons.

   Public API: window.openVideoMaker()

   NOTE: this file used to grab `window.__PAGE_STATE__` once at load time,
   but it was deferred BEFORE config.js created that object — so `S` was
   permanently undefined and every click of "Make a Video" threw a
   TypeError (the button appeared to do nothing). State is now read
   lazily through the ss() accessor instead.
   ============================================================ */
(function(){
'use strict';

/* Live access to page state — NEVER cache window.__PAGE_STATE__ at load
   time (script order: this file runs before config.js defines it). */
function ss(){ return window.__PAGE_STATE__ || {}; }

/* ---------- constants (HD 1080×1920 @30fps, target length ≈ 120s) ---------- */
const W = 1080, H = 1920, FPS = 30;
const TARGET_TOTAL_MS = 120000;    /* the finished video is ~2 minutes long */
const COVER_MS = 6000;
const END_MS   = 6000;
const COUNT_MS = 6000;
const FADE_MS  = 700;
const TYPE_WPM = 150;              /* typing speed, words/min */
const MAX_MSG_MS = 26000;          /* cap the message scene   */
const MIN_MSG_MS = 6000;
const MSG_PAGE_MS = 3400;          /* hold time for a fully-visible text page */
const MSG_LINES_PER_PAGE = 17;     /* max wrapped lines per message page */
const MSG_LINE_H = 74;             /* line height at vmFont(46) */
const MSG_AREA_TOP = 0.18;         /* top of the safe text area (fraction of H) */
const MSG_AREA_BOT = 0.86;         /* bottom of the safe text area (fraction of H) */

/* ---------- state ---------- */
let VM_OPEN    = false;
let VM_BUSY    = false;
let VM_CANCEL  = false;
let VM_RESULT  = null;             /* { url, blob } */
let VM_MUSIC   = true;
let VM_SCENES  = [];
let VM_TOTAL   = 0;
let VM_STOPREC = null;
let VM_ACTX    = null;             /* shared AudioContext for music capture */
let VM_SRCNODE = null;             /* MediaElementSource of #audioPlayer (create once) */

/* ---------- audio-player accessor ----------
   Same lookup order the slideshow / music.js use: window.MUSIC_AUDIO is a
   direct element reference that survives even if the global $() helper or
   DOM ids differ between pages. */
function vmAudio(){
  try{
    return (window.getAudioPlayer && window.getAudioPlayer()) ||
           window.MUSIC_AUDIO || $('audioPlayer') || null;
  }catch(e){ return null; }
}

/* ---------- theme colors per data-theme ---------- */
function vmThemeColors(){
  const v = $('viewerScreen');
  const th = (v && v.getAttribute('data-theme')) || 'romantic';
  const map = {
    romantic:  ['#2b0713', '#6e1423', '#ff6b9d', '#ffd166'],
    royal:      ['#120a2b', '#3c1a6e', '#b388ff', '#ffd166'],
    sunset:     ['#2b1207', '#8a3d12', '#ffb36b', '#ffe08a'],
    ocean:      ['#04121f', '#0c3f5e', '#6bd0ff', '#aef3ff'],
    classic:    ['#1c1207', '#5e3a12', '#e8b04b', '#fff3d6'],
    minimal:    ['#141414', '#2e2e2e', '#f5f5f5', '#bdbdbd']
  };
  return map[th] || map.romantic;
}

/* ---------- helpers ---------- */
function vmFont(size, weight){
  return (weight || '600') + ' ' + size + 'px Georgia, "Times New Roman", serif';
}
function vmWrap(ctx, text, maxW){
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for(const w of words){
    const t = cur ? cur + ' ' + w : w;
    if(ctx.measureText(t).width > maxW && cur){ lines.push(cur); cur = w; }
    else cur = t;
  }
  if(cur) lines.push(cur);
  return lines;
}
function vmRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function vmDrawCoverBg(ctx, cols, alpha){
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  /* soft vignette dots */
  ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.10;
  ctx.fillStyle = cols[2];
  for(let i = 0; i < 26; i++){
    const x = (i * 271 % W), y = (i * 613 % H), r = 2 + (i % 4) * 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- build scenes from card state ---------- */
async function vmBuildScenes(){
  const t = (ss().CURR && ss().CURR.texts) || {};
  const s = (ss().CURR && ss().CURR.shared) || {};
  const scenes = [];
  const cols = vmThemeColors();

  scenes.push({ kind:'cover', ms:COVER_MS, cols,
    title: t.mainHeadline || 'A surprise for you 💕',
    sub:   t.subhead1 || '',
    names: t.namesBadge || '' });

  /* love message — greeting + ALL paragraphs of the card.
     FIXES:
       • The old code read `data-text` attributes, which the viewer NEVER
         fills in (they stay ""), so the video showed an empty/partial card.
       • Anything past one page of lines was silently DROPPED.
       • Because js/viewer.js restarts the typewriter whenever a card opens,
         the on-screen <p class="type-para"> elements are usually mid-typing
         (or blank) when "Make a Video" is tapped — reading their textContent
         directly grabs a truncated message.
     Now the state object (the exact same source the typewriter uses:
     CURR.texts.greeting / msg1..msg5 / signoff) is the primary source; the
     live DOM is used only as a fallback for keys missing from state. Every
     paragraph is kept, separated by a blank line, and the font auto-shrinks
     so the FULL text always fits on screen. */
  function cleanBlock(x){
    return String(x == null ? '' : x)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(s => s.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  const PARA_KEYS = ['msg1','msg2','msg3','msg4','msg5','signoff'];
  const domParas  = Array.from(document.querySelectorAll('#mainCard .type-para'));
  const paraTexts = [];
  PARA_KEYS.forEach((k, i) => {
    /* 1) authoritative value from card state */
    let v = cleanBlock(t[k]);
    /* 2) fall back to the DOM element for this slot if state has nothing
          (data-text first — it's static — then whatever is typed so far) */
    if(!v && domParas[i]){
      v = cleanBlock(domParas[i].getAttribute('data-text')) ||
          cleanBlock(domParas[i].textContent);
    }
    if(v) paraTexts.push(v);
  });
  /* last resort: any typed DOM paragraph not covered above */
  if(!paraTexts.length){
    domParas.forEach(p => {
      const txtV = cleanBlock(p.getAttribute('data-text')) ||
                   cleanBlock(p.textContent);
      if(txtV) paraTexts.push(txtV);
    });
  }
  let greeting = cleanBlock(t.greeting) ||
                 cleanBlock($('typeGreeting') && $('typeGreeting').textContent);
  const bodyParas = paraTexts.slice();
  /* if the greeting got typed into the first paragraph too, don't double it */
  if(greeting && bodyParas.length &&
     bodyParas[0].replace(/\s+/g, ' ').startsWith(greeting.replace(/\s+/g, ' '))){
    bodyParas[0] = bodyParas[0].slice(greeting.length).trim();
  }

  const mctx = document.createElement('canvas').getContext('2d');
  function wrapAt(size, weight, text, maxW){
    mctx.font = vmFont(size, weight);
    const out = [];
    String(text).split('\n').forEach(seg => {
      if(!seg){ out.push(''); return; }
      vmWrap(mctx, seg, maxW).forEach(l => out.push(l));
    });
    return out;
  }
  const greetLinesFor = size => greeting ? wrapAt(size, '700', greeting, W - 180) : [];
  const bodyLinesFor  = size => {
    const out = [];
    bodyParas.forEach(p => {
      wrapAt(size, '500', p, W - 180).forEach(l => out.push(l));
      out.push('');
    });
    while(out.length && out[out.length - 1] === '') out.pop();
    return out;
  };
  const AREA_H  = H * (MSG_AREA_BOT - MSG_AREA_TOP);

  /* pick one font size for the WHOLE message so it fits on a single page —
     this guarantees the full card text appears in the video.
     NOTE: the greeting is drawn at size*1.2, so its height must be measured
     with that effective size (the old code under-measured it and long cards
     ended up clipped at the bottom). */
  let msgSize = 46;
  const greetPx = size => greetLinesFor(size).length * Math.round(size * 1.2) * 1.7;
  const bodyPx  = size => bodyLinesFor(size).length * Math.round(size * 1.6);
  if(greetPx(46) + bodyPx(46) > AREA_H){
    for(let c = 42; c >= 18; c -= 2){
      if(greetPx(c) + bodyPx(c) <= AREA_H * 0.92){ msgSize = c; break; }
      msgSize = c;                                /* smallest used as last resort */
    }
  }
  const gLs = greetLinesFor(msgSize);
  const bLs = bodyLinesFor(msgSize);
  const lineH = Math.round(msgSize * 1.6);
  const gLineH = Math.round(Math.max(msgSize * 1.2, 20) * 1.7);
  const totalH = gLs.length * gLineH + (gLs.length ? 24 : 0) + bLs.length * lineH;

  if(gLs.length || bLs.length){
    const words = greeting.split(/\s+/).filter(Boolean).length +
      bodyParas.join(' ').split(/\s+/).filter(Boolean).length;
    const typeMs = Math.round(Math.min(MAX_MSG_MS,
      Math.max(MIN_MSG_MS * 0.6, words / TYPE_WPM * 60000)));
    /* hold phase = time the FULL text sits on screen after the intro typed */
    let holdMs = MSG_PAGE_MS + Math.round(Math.min(12000, bLs.length * 220));
    let ms = typeMs + holdMs;
    if(ms > TARGET_TOTAL_MS * 0.6) ms = Math.round(TARGET_TOTAL_MS * 0.6);
    scenes.push({ kind:'msg', ms, cols, size: msgSize,
      typingMs: typeMs,
      greeting: greeting, gLines: gLs, lines: bLs,
      lineH: lineH, gLineH: gLineH,
      totalH: totalH });
  }

  /* photo memories (same source & order as the slideshow) */
  try{
    const rows = await sb.rows(T_MEDIA, ss().CURRENT_PERSON.id) || [];
    const photos = rows.filter(r => r.type !== 'video' && (r.drive_id || r.url)).slice(0, 14);
    const imgs = await Promise.all(photos.map(p => vmLoadImage(vmPhotoUrl(p))));
    photos.forEach((p, i) => {
      if(!imgs[i]) return;
      scenes.push({ kind:'photo', ms:4200, img:imgs[i],
        caption: p.title || p.caption || p.message || '' , flip: i % 2 });
    });
  }catch(e){ console.warn('[videomaker] media load failed', e); }

  /* ---- normalise total length to ~120 seconds (HD, v1.6) ---- */
  const fixed = scenes.reduce((a, s) => a + s.ms, 0);
  const photoScenes = scenes.filter(s => s.kind === 'photo');
  if(photoScenes.length && fixed < TARGET_TOTAL_MS){
    /* too short → stretch the photo memories evenly until we hit ~120s */
    let need = TARGET_TOTAL_MS - fixed;
    const per = Math.floor(need / photoScenes.length);
    photoScenes.forEach(s => { s.ms += per; need -= per; });
    if(need > 0) photoScenes[photoScenes.length - 1].ms += need;
  } else if(!photoScenes.length && fixed < TARGET_TOTAL_MS){
    /* no photos → give the leftover time to the message hold phase so the
       full text stays readable longer instead of the video running short */
    const msgScene = scenes.filter(s => s.kind === 'msg')[0];
    const coverScene = scenes[0];
    let need = TARGET_TOTAL_MS - fixed;
    if(msgScene){
      const add = Math.min(need, Math.round(msgScene.ms * 1.5));
      msgScene.ms += add; need -= add;
    }
    if(need > 0 && coverScene) coverScene.ms += Math.min(need, 8000);
  } else if(fixed > TARGET_TOTAL_MS * 1.25){
    /* way too long → scale every scene down proportionally toward ~120s.
       The message scene is never scaled below its typing duration, so the
       full card text always finishes revealing. */
    const k = TARGET_TOTAL_MS / fixed;
    scenes.forEach(s => {
      const floorMs = s.kind === 'msg'
        ? Math.max(MIN_MSG_MS, (s.typingMs || 0) + MSG_PAGE_MS)
        : (s.kind === 'cover' || s.kind === 'end' ? s.ms : 3000);
      s.ms = Math.max(floorMs, Math.round(s.ms * k));
    });
  }

  /* countdown scene — first visible counter with a valid date */
  for(let i = 1; i <= 3; i++){
    if(String(s['ct' + i + '_show']) === 'false') continue;
    const iso = s['ct' + i + '_datetime'];
    const ms = iso ? new Date(iso).getTime() : NaN;
    if(!isFinite(ms) || ms <= 0 || ms > Date.now()) continue;
    scenes.push({ kind:'count', ms:COUNT_MS, cols,
      label: s['ct' + i + '_label'] || t['ct' + i + '_label'] || 'Together since…',
      startMs: ms });
    break;
  }

  scenes.push({ kind:'end', ms:END_MS, cols,
    from: t.fromLabel || 'Lots of love,',
    names: t.namesBadge || '' });

  return scenes;
}

function vmPhotoUrl(p){
  if(p.drive_id) return window.driveImg(p.drive_id, 1600);
  return p.url || p.drive_url || '';
}
function vmLoadImage(url){
  return new Promise(res => {
    if(!url){ res(null); return; }
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload  = () => res(im);
    im.onerror = () => {
      /* Google Drive fallback used by the slideshow too */
      if(/googleusercontent/.test(url)){
        const id = (url.match(/\/d\/([-\w]+)/) || [])[1];
        if(id){
          const im2 = new Image();
          im2.crossOrigin = 'anonymous';
          im2.onload  = () => res(im2);
          im2.onerror = () => res(null);
          im2.src = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
          return;
        }
      }
      res(null);
    };
    im.src = url;
  });
}

/* ---------- draw one scene at local time lt (0..ms) ---------- */
function vmDrawScene(ctx, sc, lt, gt){
  const p = Math.min(1, lt / sc.ms);           /* scene progress */
  const fade = Math.min(1, lt / FADE_MS, (sc.ms - lt) / FADE_MS);
  const cols = sc.cols || vmThemeColors();

  if(sc.kind === 'cover' || sc.kind === 'end'){
    vmDrawCoverBg(ctx, cols);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fade + 0.15));
    ctx.textAlign = 'center';
    if(sc.kind === 'cover'){
      ctx.fillStyle = '#ffffff';
      ctx.font = vmFont(84, '700');
      vmWrap(ctx, sc.title, W - 160).forEach((l, i, a) =>
        ctx.fillText(l, W/2, H*0.40 + i * 100 - (a.length-1)*50));
      if(sc.sub){
        ctx.fillStyle = cols[3];
        ctx.font = vmFont(46, '500');
        ctx.fillText(sc.sub, W/2, H*0.40 + 130);
      }
      if(sc.names){
        ctx.font = vmFont(40, '600');
        ctx.fillStyle = cols[2];
        ctx.fillText(sc.names, W/2, H*0.62);
      }
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = vmFont(34, '400');
      ctx.fillText('💕 made with love 💕', W/2, H*0.90);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = vmFont(52, '500');
      ctx.fillText(sc.from, W/2, H*0.44);
      ctx.fillStyle = cols[2];
      ctx.font = vmFont(72, '700');
      vmWrap(ctx, sc.names, W - 160).forEach((l, i) =>
        ctx.fillText(l, W/2, H*0.52 + i * 86));
      /* floating hearts */
      ctx.font = '60px serif';
      for(let i = 0; i < 10; i++){
        const hx = (i * 173 + 60) % W;
        const hy = H - ((gt * 0.12 + i * 220) % (H + 200));
        ctx.globalAlpha = 0.35 + 0.4 * Math.sin(i + gt * 0.002);
        ctx.fillText(['❤️','💕','🌹','✨'][i % 4], hx, hy);
      }
    }
    ctx.restore();
    return;
  }

  if(sc.kind === 'msg'){
    vmDrawCoverBg(ctx, cols);
    ctx.save();
    /* clip to the safe text area so lines never spill over the edges */
    const areaTop = H * MSG_AREA_TOP;
    const areaH   = H * (MSG_AREA_BOT - MSG_AREA_TOP);
    ctx.beginPath(); ctx.rect(0, areaTop - 20, W, areaH + 40); ctx.clip();
    ctx.textAlign = 'center';

    const size = sc.size || 46;
    const gLs  = sc.gLines || [];
    const bLs  = sc.lines  || [];
    const lineH  = sc.lineH  || Math.round(size * 1.6);
    const gLineH = sc.gLineH || Math.round(Math.max(size * 1.2, 20) * 1.7);
    const typingMs = Math.max(1, Math.min(sc.typingMs || sc.ms * 0.5, sc.ms - 800));
    const tp = Math.min(1, lt / typingMs);          /* typing progress */

    /* PHASE 1 — the first 4 lines (greeting + next lines) reveal word by
       word, just like the card's typewriter.
       PHASE 2 — once those are done, ALL remaining card text appears at
       once and stays on screen for the rest of the scene. Nothing scrolls,
       nothing is cut off (the font was auto-shrunk to fit one page).
       FIX: the old code revealed characters by a global ratio across ALL
       lines; with long messages most lines stayed invisible for ages and
       the final view could freeze mid-reveal — "not all text shows up". */
    const done = tp >= 1;
    const gLsN = gLs.length;
    const bLsN = bLs.length;
    const INTRO_LINES = Math.min(4, gLsN + bLsN);   /* greeting + next lines */
    const introBodyN = Math.max(0, INTRO_LINES - gLsN);
    let introWords = [];
    gLs.concat(bLs.slice(0, introBodyN)).forEach(l => {
      if(l) introWords = introWords.concat(l.split(/\s+/));
    });
    const introTotal = introWords.length || 1;
    const introDone  = Math.floor(Math.min(1, tp * 1.06) * introTotal);

    /* layout heights */
    const totalH = (gLsN ? gLsN * gLineH + 24 : 0) + bLsN * lineH;

    /* vertical placement: top-aligned while revealing so the growing text
       never jumps; centred only when everything is visible and it fits */
    let y;
    if(done && totalH <= areaH) y = areaTop + (areaH - totalH) / 2 + size;
    else                        y = areaTop + size;

    /* greeting lines (larger/bold) */
    ctx.font = vmFont(Math.round(size * 1.2), '700');
    let wi = 0;                                     /* words consumed so far */
    for(const l of gLs){
      const ws = l ? l.split(/\s+/) : [];
      const remain = introDone - wi;
      wi += ws.length;
      let vis;
      if(done || remain >= ws.length) vis = l;                    /* whole line */
      else if(remain > 0)             vis = ws.slice(0, remain).join(' ');
      else                            vis = '';
      if(vis){ ctx.fillStyle = cols[3]; ctx.fillText(vis, W/2, y); }
      y += gLineH;
    }
    if(gLsN) y += 24 - (gLineH - lineH);

    /* body lines — intro ones type out, the REST appear together in phase 2 */
    ctx.font = vmFont(size, '500');
    ctx.fillStyle = '#fff7f0';
    for(let bi = 0; bi < bLsN; bi++){
      const l = bLs[bi];
      let vis = l;
      if(!done && bi < introBodyN){
        const ws = l ? l.split(/\s+/) : [];
        const remain = introDone - wi;
        wi += ws.length;
        vis = remain >= ws.length ? l : (remain > 0 ? ws.slice(0, remain).join(' ') : '');
      } else if(!done){
        vis = '';                                   /* hidden until phase 2 */
      }
      if(vis) ctx.fillText(vis, W/2, y);
      y += lineH;
    }

    /* blinking caret while typing */
    if(!done && Math.floor(gt / 400) % 2 === 0){
      ctx.fillStyle = cols[2];
      ctx.fillRect(W/2 + 6, y - size, 6, Math.round(size * 1.05));
    }
    ctx.restore();
    return;
  }

  if(sc.kind === 'photo'){
    const im = sc.img;
    if(!im || !im.width){ return; }
    /* cover-fit + gentle ken burns */
    const zoom = 1 + 0.06 * p;
    const ar = im.width / im.height, car = W / H;
    let sw = im.width, sh = im.height;
    if(ar > car) sw = sh * car; else sh = sw / car;
    const dx = (im.width - sw) / 2 + (sc.flip ? 1 : -1) * (p - 0.5) * sw * 0.05;
    const dy = (im.height - sh) / 2 + (p - 0.5) * sh * 0.05;
    const dw = W / zoom, dh = H / zoom;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(im, dx, dy, sw, sh, (W - dw)/2, (H - dh)/2, dw, dh);
    /* bottom scrim for caption */
    const g = ctx.createLinearGradient(0, H - 420, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 420, W, 420);
    if(sc.caption){
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fade + 0.2));
      ctx.fillStyle = '#fff';
      ctx.font = vmFont(48, '600');
      ctx.textAlign = 'center';
      vmWrap(ctx, sc.caption, W - 200).slice(0, 3).forEach((l, i) =>
        ctx.fillText(l, W/2, H - 140 - (Math.min(3, vmWrap(ctx, sc.caption, W-200).length) - 1 - i) * 66));
      ctx.restore();
    }
    return;
  }

  if(sc.kind === 'count'){
    vmDrawCoverBg(ctx, cols);
    const days = Math.floor((Date.now() - sc.startMs) / 86400000);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffffcc';
    ctx.font = vmFont(46, '500');
    ctx.fillText(sc.label, W/2, H*0.40);
    ctx.fillStyle = '#ffffff';
    ctx.font = vmFont(150, '700');
    ctx.fillText(days.toLocaleString() + ' ❤️', W/2, H*0.50);
    ctx.fillStyle = cols[3];
    ctx.font = vmFont(50, '600');
    ctx.fillText('days and counting…', W/2, H*0.58);
    ctx.restore();
    return;
  }
}

/* ---------- audio capture ----------
   IMPORTANT: we must NOT use createMediaElementSource() on #audioPlayer.
   Routing an <audio> element through WebAudio "taints" it, which makes
   canvas.captureStream() refuse to emit video frames in Chrome/Edge —
   the recording ends up blank/black. Instead we tap the element's output
   with the MediaStream AudioTrack API (captureStream on the <audio>) and
   mix that into the recorder via a plain WebAudio graph that never touches
   the element itself. The returned cleanup fn disconnects the graph after
   each run so repeated renders don't stack duplicate audio tracks. */
/* ---------- music continuity for the whole render ----------
   The video is ~2 minutes long but a single song usually isn't, and worse:
   when a track ends, js/music.js's `ended` handler advances the playlist by
   RE-ASSIGNING #audioPlayer.src — which destroys the MediaStream we tapped
   with captureStream(). That is exactly why "the song stops after some time".
   While recording we therefore force the currently-playing track to LOOP (the
   same song that plays in the slideshow/card, from its current position) so
   audio never breaks; the original loop/volume state is restored afterwards. */
let VM_MUSIC_LOOP_ON = false;
/* If the render is started while the slideshow owns #audioPlayer but its
   music is currently paused (e.g. ducked/paused for a video slide), force it
   to resume so the video carries the SAME song that plays in the slideshow. */
function vmEnsureSlideshowMusic(){
  try{
    const ap = vmAudio();
    if(!ap) return;
    const ctxName = (window.getCurrCtx && window.getCurrCtx()) === 'slideshow'
      ? 'slideshow' : 'card';
    if(ctxName === 'slideshow' && ap.paused){
      /* resume from saved position first; fall back to a fresh start */
      if(window.resumeMusic && ap.src){ window.resumeMusic(); }
      if(ap.paused && window.startMusicFor &&
         window.buildPlaylistFor && window.buildPlaylistFor('slideshow').length){
        window.startMusicFor('slideshow');
      }
      try{ ap.play().catch(()=>{}); }catch(e){}
    }
  }catch(e){}
}
function vmLoopMusicForRender(on){
  const ap = vmAudio();
  if(!ap || !ap.src) return;
  try{
    if(on){
      if(!VM_MUSIC_LOOP_ON){
        ap._vmPrevLoop = ap.loop;
        ap._vmPrevVol  = ap.volume;
        VM_MUSIC_LOOP_ON = true;
      }
      ap.loop = true;
      if(ap.volume < 0.9) ap.volume = 0.9;   /* full scale inside the video */
    } else if(VM_MUSIC_LOOP_ON){
      ap.loop = !!ap._vmPrevLoop;
      if(typeof ap._vmPrevVol === 'number') ap.volume = ap._vmPrevVol;
      ap._vmPrevLoop = ap._vmPrevVol = undefined;
      VM_MUSIC_LOOP_ON = false;
    }
  }catch(e){}
}

function vmAttachAudio(stream){
  if(!VM_MUSIC) return null;
  try{
    const ap = vmAudio();
    if(!ap || !ap.src) return null;
    /* If music playback hasn't started yet (e.g. the card was muted or
       autoplay was blocked), start the playlist now — we are inside the
       Start button's user-gesture chain, so this is allowed. We prefer the
       ACTIVE context, so the video carries the very same song that plays in
       the slideshow when the slideshow owns the player. */
    if(ap.paused){
      try{
        const ctxName = (window.getCurrCtx && window.getCurrCtx()) === 'slideshow'
          ? 'slideshow' : 'card';
        if(window.buildPlaylistFor && window.startMusicFor &&
           window.buildPlaylistFor(ctxName).length){
          window.startMusicFor(ctxName);
        }
      }catch(e){}
    }
    vmLoopMusicForRender(true);              /* ← same song until the last frame */
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    if(!VM_ACTX) VM_ACTX = new AC();
    const actx = VM_ACTX;
    if(actx.state === 'suspended'){ try{ actx.resume(); }catch(e){} }
    /* tap the element's playing audio as a MediaStream */
    let srcNode = null;
    if(typeof ap.captureStream === 'function'){
      srcNode = actx.createMediaStreamSource(ap.captureStream());
    } else if(typeof ap.mozCaptureStream === 'function'){
      srcNode = actx.createMediaStreamSource(ap.mozCaptureStream());
    } else {
      /* last resort (older Safari): route the element through WebAudio */
      if(!VM_SRCNODE){
        VM_SRCNODE = actx.createMediaElementSource(ap);
      }
      srcNode = VM_SRCNODE;
    }
    const gain = actx.createGain();
    gain.gain.value = 1;
    const dest = actx.createMediaStreamDestination();
    srcNode.connect(gain);
    gain.connect(dest);
    gain.connect(actx.destination);        /* keep it audible while rendering */
    dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    return () => { try{ srcNode.disconnect(); gain.disconnect(); }catch(e){} };
  }catch(e){ console.warn('[videomaker] audio capture skipped', e); return null; }
}

/* ---------- main render ---------- */
window.openVideoMaker = function(){
  if(VM_BUSY) return;
  const S = ss();
  if(!S.CURRENT_PERSON){ alert('Open a card first 💕'); return; }
  if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream){
    alert('Your browser cannot record videos. Try Chrome or Edge.'); return;
  }
  const modal = $('videoMakerModal');
  if(!modal) return;
  VM_OPEN = true; VM_CANCEL = false;
  if(VM_RESULT){ URL.revokeObjectURL(VM_RESULT.url); VM_RESULT = null; }
  $('vmPreview').style.display = 'none';
  $('vmResult').style.display  = 'none';
  $('vmStage').textContent = '⏳ Preparing your video…';
  $('vmBarFill').style.width = '0%';
  /* reset action buttons: only Start + Close are visible until a render finishes */
  ['vmDownloadBtn','vmShareBtn','vmAgainBtn'].forEach(id => { const b = $(id); if(b) b.style.display = 'none'; });
  const start0 = $('vmStartBtn'); if(start0){ start0.style.display = 'none'; start0.disabled = false; }
  const mb0 = $('vmMusicBtn'); if(mb0) mb0.style.display = 'none';
  const helpEl = $('vmHelp');
  if(helpEl) helpEl.style.display = '';
  show(modal);

  /* Build the scenes up-front, then wait for an explicit "Start" tap so
     that all audio/video capture happens inside the button's user-gesture
     chain (autoplay policies block MediaRecorder + music otherwise). */
  vmBuildScenes().then(scenes => {
    if(!VM_OPEN) return;
    VM_SCENES = scenes;
    if(VM_SCENES.length < 2){
      $('vmStage').textContent = '😔 This card has no content to turn into a video yet.';
      if(helpEl) helpEl.style.display = 'none';
      VM_OPEN = false;
      return;
    }
    VM_TOTAL = VM_SCENES.reduce((a, s) => a + s.ms, 0);
    $('vmStage').textContent = '🎬 Ready! Tap Start to render your video.';
    const sb = $('vmStartBtn');
    if(sb){ sb.style.display = ''; sb.disabled = false; }
    if(window.buildPlaylistFor && window.buildPlaylistFor('card').length){
      const mb = $('vmMusicBtn'); if(mb) mb.style.display = '';
    }
  }).catch(err => {
    console.error('[videomaker] scene build failed', err);
    if(helpEl) helpEl.style.display = 'none';
    $('vmStage').textContent = '😔 Something went wrong preparing the video — please try again.';
    VM_OPEN = false;
  });
};

function vmStartRender(){
  if(VM_BUSY || !VM_OPEN || VM_SCENES.length < 2) return;
  const sb = $('vmStartBtn'); if(sb){ sb.style.display = 'none'; sb.disabled = true; }
  const helpEl = $('vmHelp'); if(helpEl) helpEl.style.display = 'none';
  $('vmStage').textContent = '🎬 Rendering your video…';
  runRender();
}

function vmClose(){
  VM_OPEN = false; VM_CANCEL = true;
  hide($('videoMakerModal'));
  if(VM_STOPREC){ try{ VM_STOPREC(); }catch(e){} VM_STOPREC = null; }
  /* never leave the card playlist stuck in "recording loop" mode */
  vmLoopMusicForRender(false);
}

async function runRender(){
  VM_BUSY = true;
  const cvs = $('vmPreview');
  cvs.width = W; cvs.height = H;
  cvs.style.display = 'block';
  $('vmResult').style.display = 'none';
  const ctx = cvs.getContext('2d');

  /* pick a supported webm mime */
  const mimes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  let mime = mimes.find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  if(!mime){
    $('vmStage').textContent = '😔 WebM recording is not supported in this browser.';
    VM_BUSY = false; return;
  }

  /* ---- music setup for the render (see vmLoopMusicForRender above) ----
     The song that is ALREADY playing (card or slideshow playlist — whichever
     context owns #audioPlayer) keeps playing, is LOOPED for the whole render,
     and is tapped into the recording, so the video carries the exact same
     track as the slideshow from the first text scene to the last frame. */
  const ap = vmAudio();
  const wasPlaying = !!(ap && !ap.paused && ap.src);   /* remember for finish() */
  let vmMusicNode = null;                              /* audio graph cleanup fn */

  if(VM_MUSIC){
    /* user gesture (Start button) — safe to start playback + AudioContext */
    try{ if(VM_ACTX && VM_ACTX.state === 'suspended') VM_ACTX.resume(); }catch(e){}

    /* Slideshow owns the player but its music got paused (e.g. ducked under a
       video slide)? Resume it NOW so the render carries that same song. */
    vmEnsureSlideshowMusic();

    /* Nothing loaded yet? Start the playlist now (still inside the gesture
       chain) so the finished video actually has music in it. We prefer the
       ACTIVE context so the video matches the slideshow's current song. */
    if(ap && !ap.src){
      try{
        const ctxName = (window.getCurrCtx && window.getCurrCtx()) === 'slideshow'
          ? 'slideshow' : 'card';
        if(window.buildPlaylistFor && window.startMusicFor &&
           window.buildPlaylistFor(ctxName).length){
          window.startMusicFor(ctxName);
        } else if(window.buildPlaylistFor && window.startMusicFor &&
                  window.buildPlaylistFor('card').length){
          window.startMusicFor('card');
        }
      }catch(e){}
    }
    if(ap && ap.src){
      try{ ap.play().catch(()=>{}); }catch(e){}
    }
  } else if(ap && !ap.paused){
    try{ ap.pause(); }catch(e){}
  }
  const stream = cvs.captureStream(FPS);
  vmMusicNode = vmAttachAudio(stream);        /* taps + LOOPS the current song */

  /* safety net: keep the SAME song alive until the last frame.
     - if anything (autoplay policy, another script) clears our loop flag
       mid-render, put it back before the track reaches its end;
     - if the element paused for any reason, resume immediately;
     - if some other code re-assigned #audioPlayer.src (playlist advance),
       snap straight back to the ORIGINAL track we started with — that is
       what "the song stops / changes after some time" used to be;
     - rewind a hair early so the manual wrap fires even if the browser's
       native looping misses. */
  const vmSongUrl = ap && ap.src ? ap.src : '';   /* the slideshow's current song */
  const vmLoopGuard = VM_MUSIC ? setInterval(() => {
    try{
      const el = vmAudio();
      if(!el || !el.src){
        /* src was cleared entirely — restore our song and play it */
        if(vmSongUrl){ el.src = vmSongUrl; el.loop = true; el.play().catch(()=>{}); }
        return;
      }
      if(el.src !== vmSongUrl){ el.src = vmSongUrl; }   /* force same song */
      if(!el.loop){ el.loop = true; if(el.volume < 0.9) el.volume = 0.9; }
      if(el.paused && VM_MUSIC_LOOP_ON){ el.play().catch(()=>{}); }
      if(el.duration && isFinite(el.duration) &&
         el.duration - el.currentTime < 0.35 && !el.paused){
        el.currentTime = 0;
      }
    }catch(e){}
  }, 200) : null;

  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res => { rec.onstop = res; });
  rec.onerror = e => console.warn('[videomaker] recorder error', e && e.error);
  try{ rec.start(250); }
  catch(e){
    console.error('[videomaker] MediaRecorder.start failed', e);
    if(vmLoopGuard) clearInterval(vmLoopGuard);
    if(vmMusicNode){ try{ vmMusicNode(); }catch(_){} vmMusicNode = null; }
    vmLoopMusicForRender(false);
    $('vmStage').textContent = '😔 Your browser blocked the recording — please try again.';
    const sbErr = $('vmStartBtn'); if(sbErr){ sbErr.style.display = ''; sbErr.disabled = false; }
    VM_BUSY = false; return;
  }
  VM_STOPREC = () => { try{ rec.state !== 'inactive' && rec.stop(); }catch(e){} };

  const t0 = performance.now();
  let acc = 0, si = 0;
  function frame(){
    if(!VM_OPEN || VM_CANCEL){
      try{ rec.state !== 'inactive' && rec.stop(); }catch(e){}
      finish(); return;
    }
    const gt = performance.now() - t0;
    /* advance scene */
    while(si < VM_SCENES.length && gt >= acc + VM_SCENES[si].ms){ acc += VM_SCENES[si].ms; si++; }
    if(si >= VM_SCENES.length){
      try{ rec.state !== 'inactive' && rec.stop(); }catch(e){}
      finish(); return;
    }
    const sc = VM_SCENES[si];
    ctx.clearRect(0, 0, W, H);
    try{ vmDrawScene(ctx, sc, gt - acc, gt); }catch(e){}
    /* cross-fade veil between scenes */
    const lt = gt - acc;
    if(lt < FADE_MS){
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - lt / FADE_MS) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    /* slim progress bar drawn INTO the video itself (bottom edge), so the
       finished file shows how far along it is — not just the modal's UI bar */
    {
      const vcols = (VM_SCENES && VM_SCENES[si] && VM_SCENES[si].cols) || vmThemeColors();
      const gp = Math.min(1, gt / (VM_TOTAL || 1));
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(0, H - 14, W, 14);
      ctx.fillStyle = vcols[2] || '#ff6b9d';
      ctx.fillRect(0, H - 14, Math.round(W * gp), 14);
    }
    const pct = Math.min(100, Math.round(gt / VM_TOTAL * 100));
    $('vmBarFill').style.width = pct + '%';
    $('vmStage').textContent = '🎬 Rendering… ' + pct + '%';
    requestAnimationFrame(frame);
  }
  function finish(){
    done.then(() => {
      VM_BUSY = false; VM_STOPREC = null;
      if(vmLoopGuard){ clearInterval(vmLoopGuard); vmLoopGuard = null; }
      /* stop feeding audio into the (now closed) recorder graph */
      if(vmMusicNode){ try{ vmMusicNode(); }catch(e){} vmMusicNode = null; }
      /* music is no longer being captured → restore its original loop/volume */
      vmLoopMusicForRender(false);
      try{ if(ap && wasPlaying && ap.paused) ap.play().catch(()=>{}); }catch(e){}
      if(VM_CANCEL || !chunks.length){
        if(VM_CANCEL) $('vmStage').textContent = 'Cancelled.';
        return;
      }
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      VM_RESULT = { url, blob };
      const vid = $('vmResultVideo');
      vid.src = url;
      $('vmPreview').style.display = 'none';
      $('vmResult').style.display = 'block';
      $('vmSizeEl').textContent = '📦 ' + (blob.size / 1048576).toFixed(1) + ' MB · ' +
        Math.round(VM_TOTAL / 1000) + 's · 1080×1920';
      $('vmStage').textContent = '✅ Your video is ready!';
      $('vmBarFill').style.width = '100%';
      /* reveal the result actions */
      ['vmDownloadBtn','vmShareBtn','vmAgainBtn'].forEach(id => { const b = $(id); if(b) b.style.display = ''; });
    });
  }
  requestAnimationFrame(frame);
}

/* ---------- download / share ---------- */
function vmPersonName(){
  const t = (ss().CURR && ss().CURR.texts) || {};
  return (ss().CURRENT_PERSON && ss().CURRENT_PERSON.display_name) ||
         t.namesBadge || 'card';
}
document.addEventListener('DOMContentLoaded', () => {
  const dl = $('vmDownloadBtn');
  if(dl) dl.onclick = (e) => {
    if(e) e.preventDefault();
    if(!VM_RESULT) return;
    const a = document.createElement('a');
    a.href = VM_RESULT.url;
    a.download = 'love-card-' + vmPersonName().replace(/[^\w-]+/g, '') + '.webm';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const sh = $('vmShareBtn');
  if(sh) sh.onclick = async (e) => {
    if(e) e.preventDefault();
    if(!VM_RESULT) return;
    const file = new File([VM_RESULT.blob], 'love-card.webm', { type: 'video/webm' });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      try{
        await navigator.share({ files: [file],
          title: 'A card for ' + vmPersonName() + ' 💕',
          text: 'Made from our LoveCard 💕' });
        return;
      }catch(err){ if(err && err.name === 'AbortError') return; }
    }
    /* Fallback: download (WhatsApp can't take webm from most browsers) */
    if(dl_click()) return;
    alert('Sharing videos directly isn\'t supported here — the video was downloaded instead, attach it in WhatsApp 💬');
  };
  function dl_click(){
    const b = $('vmDownloadBtn');
    if(b){ b.click(); return true; }
    return false;
  }

  const cancel = $('vmCancelBtn');
  if(cancel) cancel.onclick = (e) => { if(e) e.preventDefault(); vmClose(); };

  /* 🎬 Start — the render pipeline only begins from this explicit tap so
     that MediaRecorder + music capture happen inside a user gesture.
     (This handler was missing, which is why the button did nothing.) */
  const start = $('vmStartBtn');
  if(start){
    start.onclick = (e) => {
      if(e){ e.preventDefault(); e.stopPropagation(); }
      vmStartRender();
    };
  }

  const again = $('vmAgainBtn');
  if(again) again.onclick = (e) => {
    if(e) e.preventDefault();
    if(VM_RESULT){ URL.revokeObjectURL(VM_RESULT.url); VM_RESULT = null; }
    window.openVideoMaker();
  };
  const mb = $('vmMusicBtn');
  if(mb) mb.onclick = (e) => {
    if(e) e.preventDefault();
    VM_MUSIC = !VM_MUSIC;
    mb.classList.toggle('on', VM_MUSIC);
    mb.innerHTML = VM_MUSIC ? '🎵 Music: ON' : '🔇 Music: OFF';
  };

  const mk = $('videoMakerBtn');
  if(mk) mk.onclick = (e) => {
    if(e && e.preventDefault) e.preventDefault();
    if(e && e.stopPropagation) e.stopPropagation();
    window.openVideoMaker();
  };
});

})();
