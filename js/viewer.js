/* ============================================================
   viewer.js — Viewer screen + person loading + reactions
   ============================================================ */
(function(){
'use strict';
const S = window.__PAGE_STATE__;

/* ---------- Seen counter ---------- */
function seenKeyFor(p){ return 'seen_' + (p && p.slug ? p.slug : 'anon'); }
function recordSeen(p){
  if(!p) return 0;
  let n = 0;
  try{
    const k = seenKeyFor(p);
    n = parseInt(localStorage.getItem(k) || '0', 10) || 0;
    n += 1;
    localStorage.setItem(k, String(n));
  }catch(e){}
  return n;
}

/* ---------- Reactions ---------- */
function reactionKeyFor(p){ return 'react_' + (p && p.slug ? p.slug : 'anon'); }
function loadReactions(p){
  try{
    const raw = localStorage.getItem(reactionKeyFor(p));
    if(!raw) return {heart:0, love:0, cry:0, party:0};
    const obj = JSON.parse(raw);
    return {
      heart: obj.heart || 0,
      love:  obj.love  || 0,
      cry:   obj.cry   || 0,
      party: obj.party || 0
    };
  }catch(e){ return {heart:0, love:0, cry:0, party:0}; }
}
function saveReactions(p, obj){
  try{ localStorage.setItem(reactionKeyFor(p), JSON.stringify(obj)); }catch(e){}
}
window.paintReactions = function(){
  const r = S.REACTIONS || {heart:0, love:0, cry:0, party:0};
  const map = {heart:'rbCountHeart', love:'rbCountLove', cry:'rbCountCry', party:'rbCountParty'};
  Object.keys(map).forEach(k => {
    const el = $(map[k]);
    if(el) el.textContent = String(r[k] || 0);
  });
};

/* ---------- Per-person dark mode (scoped to viewer only) ---------- */
function darkKeyFor(p){ return 'dark_' + (p && p.slug ? p.slug : 'anon'); }

window.isDarkForPerson = function(p){
  if(!p) return false;
  try{ return localStorage.getItem(darkKeyFor(p)) === '1'; }catch(e){ return false; }
};

window.setDarkMode = function(on){
  // Only toggle dark-mode on the viewer screen, NOT on document.body.
  const viewer = $('viewerScreen');
  if(viewer) viewer.setAttribute('data-darkmode', on ? 'true' : 'false');
  const btn  = $('darkmodeToggle'); if(btn)  btn.textContent  = on ? '☀️' : '🌙';
  const vbtn = $('viewerDarkBtn');  if(vbtn) vbtn.textContent = on ? '☀️' : '🌙';
};

window.toggleDarkForCurrent = function(){
  const p = S.CURRENT_PERSON;
  if(!p) return;
  const next = !window.isDarkForPerson(p);
  try{ localStorage.setItem(darkKeyFor(p), next ? '1' : '0'); }catch(e){}
  window.setDarkMode(next);
};

/* ---------- WhatsApp share ---------- */
window.openWhatsAppShare = function(){
  const p = S.CURRENT_PERSON;
  if(!p){ __showToast('❌ No person to share', false); return; }
  /* Always share the live site URL (current origin), never a stale host. */
  const link = window.resolveCardLink(p.slug || '');
  const name = p.display_name || p.slug || 'friend';
  /* Include the viewer card password so guests can open the locked card.
     SECURITY: only the viewer password is ever included — never the admin
     or requester edit password. */
  const cardPw = p.password || '';
  const msg = '💕 A surprise awaits for ' + name + '!\n\n' +
    (cardPw ? '🔒 Card password: ' + cardPw + '\n' : '') +
    'Open here: ' + link;
  /* V3: on mobile, try the native share sheet first (AirDrop, SMS, any app).
     If unavailable or dismissed, fall back to WhatsApp exactly as before. */
  if(window.v3NativeShare){
    window.v3NativeShare('A surprise for ' + name + ' 💕', msg, link)
      .then(shared => { if(!shared) window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); });
    return;
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
};

/* ---------- Load person into state ---------- */
window.loadPersonIntoState = async function(p){
  S.CURRENT_PERSON = p;
  S.CURR = {
    texts: {}, textsByLang: {en:{}, gu:{}, hi:{}}, shared: {},
    gifts: [], story: [], events: [], voice: [], video: [], pins: [], media: []
  };
  if(!p) return;

  const set = await sb.getSet(p.id);
  S.CURRENT_SETTINGS = set;

  const shared = {};
  Object.keys(set).forEach(k => {
    if(k.startsWith('shared__')) shared[k.substring(8)] = set[k];
  });
  S.CURR.shared = shared;

  function buildTextsForLang(L){
    const out = {};
    const pref = 'texts__' + L + '_';
    Object.keys(set).forEach(k => {
      if(k.startsWith(pref)) out[k.substring(pref.length)] = set[k];
    });
    Object.keys(set).forEach(k => {
      if(!k.startsWith('texts__')) return;
      const rest = k.substring(7);
      if(/^(en|gu|hi)_/.test(rest)) return;
      if(out[rest] === undefined) out[rest] = set[k];
    });
    return out;
  }
  S.CURR.textsByLang = {
    en: buildTextsForLang('en'),
    gu: buildTextsForLang('gu'),
    hi: buildTextsForLang('hi')
  };
  const def = (shared.defaultLang || 'en').toLowerCase();
  S.CURR_LANG = (['en','gu','hi'].indexOf(def) >= 0) ? def : 'en';
  S.CURR.texts = S.CURR.textsByLang[S.CURR_LANG] || {};

  const lt = $('langToggle');
  if(lt){
    lt.textContent = S.CURR_LANG === 'en' ? 'EN' : (S.CURR_LANG === 'gu' ? 'ગુ' : 'हि');
    lt.dataset.state = S.CURR_LANG;
  }

  S.CURR.gifts  = await sb.rows(T_GIFTS,  p.id) || [];
  S.CURR.story  = await sb.rows(T_STORY,  p.id) || [];
  S.CURR.events = await sb.rows(T_EVENTS, p.id) || [];
  S.CURR.voice  = await sb.rows(T_VOICE,  p.id) || [];
  S.CURR.video  = await sb.rows(T_VIDEO,  p.id) || [];
  S.CURR.pins   = await sb.rows(T_PINS,   p.id) || [];
  S.CURR.media  = await sb.rows(T_MEDIA,  p.id) || [];
};
window.__loadPersonIntoState__ = window.loadPersonIntoState;

/* ---------- Show viewer ---------- */
window.showViewerFor = async function(person, startNow){
  /* V3 insights: count this card open locally (per-device, privacy-safe) */
  try{
    if(person && person.slug){
      const vk = 'v3views_' + person.slug;
      localStorage.setItem(vk, String((parseInt(localStorage.getItem(vk), 10) || 0) + 1));
    }
  }catch(e){}
  if(!S.CURRENT_PERSON || S.CURRENT_PERSON.id !== person.id){
    await loadPersonIntoState(person);
  }
  $('homeScreen').classList.add('hidden');
  show($('viewerScreen'));

  // ✅ Apply per-person dark mode (viewer only)
  window.setDarkMode(window.isDarkForPerson(person));

  const previewTag = $('viewerPreviewTag');
  if(previewTag) previewTag.style.display = S.PREVIEW_MODE ? 'inline-block' : 'none';
  const editBtn = $('viewerEditCardBtn');
  if(editBtn) editBtn.classList.toggle('visible', !!S.REQUESTER_MODE && !S.PREVIEW_MODE);
  const mt = $('musicToggle');
  if(mt) mt.classList.toggle('visible', window.buildPlaylistFor('card').length > 0);
  const lt = $('langToggle');
  if(lt){
    lt.classList.toggle('visible', true);
    lt.textContent = S.CURR_LANG === 'en' ? 'EN' : (S.CURR_LANG === 'gu' ? 'ગુ' : 'हि');
    lt.dataset.state = S.CURR_LANG;
  }

  const seenCount = recordSeen(person);
  const seenPill = $('viewerSeenPill');
  if(seenPill){
    seenPill.textContent = '👁️ Opened ' + seenCount + '×';
    seenPill.style.display = 'inline-block';
  }

  S.REACTIONS = loadReactions(person);
  window.paintReactions();

  try{
    const rKey = 'ribbon_' + ((person && person.slug) || 'anon');
    if(!sessionStorage.getItem(rKey)){
      const card = $('mainCard');
      if(card){
        card.classList.add('ribbon-intro');
        setTimeout(() => card.classList.remove('ribbon-intro'), 1800);
      }
      sessionStorage.setItem(rKey, '1');
    }
  }catch(e){}

  window.renderCardFull();
  if(startNow) window.startCard();
  window.scrollTo(0, 0);
};

window.startCard = function(){
  if(S.CARD_STARTED) return;
  S.CARD_STARTED = true;
  window.restartTypewriter();
  window.updateCounters();
  window.startMusicFor('card');
};

/* ---------- Render card full ---------- */
window.renderCardFull = function(){
  const t = S.CURR.texts || {};
  const s = S.CURR.shared || {};
  // ✅ Theme is applied to the VIEWER screen, not document.body
  const viewer = $('viewerScreen');
  if(viewer) viewer.setAttribute('data-theme', s.theme || 'romantic');
  /* V3 per-person palette: optional accent overrides (set in admin → Palette) */
  try{
    ['--c-accent','--c-accent2'].forEach(k => { if(viewer) viewer.style.removeProperty(k); });
    if(viewer && s.palette === 'true'){
      if(/^#[0-9a-f]{6}$/i.test(s.paletteA || '')) viewer.style.setProperty('--c-accent', s.paletteA);
      if(/^#[0-9a-f]{6}$/i.test(s.paletteB || '')) viewer.style.setProperty('--c-accent2', s.paletteB);
    }
  }catch(e){}
  document.title = t.pageTitle || 'A surprise awaits 💕';

  txt($('mainHeadlineEl'), t.mainHeadline || 'Happy Celebration!');
  const subheadEl = $('subheadEl');
  if(subheadEl) subheadEl.innerHTML =
    (t.subhead1 || '') + (t.subhead2 ? ('<br>' + esc(t.subhead2)) : '');
  txt($('typeGreeting'), '');
  txt($('namesBadgeEl'), t.namesBadge || '');
  txt($('fromLabel'), t.fromLabel || 'Lots of love from');
  txt($('openMemoriesBtnTextEl'), t.openMemoriesBtn || 'Open Memories');
  txt($('storyBtnTextEl'), t.storyBtnText || 'Our Story');
  txt($('mapBtnTextEl'), t.mapBtnText || 'Map of Memories');
  txt($('uploadBtnTextEl'), t.uploadBtnText || 'Share Photo');
  txt($('voiceBtnTextEl'), t.voiceBtnText || 'Play Voice Message');
  txt($('videoBtnTextEl'), t.videoBtnText || 'Play Video Message');
  txt($('countersMainTitle'), t.countersTitle || 'Our journey so far');

  COUNTERS.forEach(c => {
    const label = s[c.labelKey] || t[c.labelKey] || '';
    txt($(c.mainLabel), label);
    txt($(c.mainDate), s[c.dispKey] || '');
    const on = String(s[c.showKey]) !== 'false';
    const row = $(c.mainRow);
    if(row) row.classList.toggle('counter-hidden', !on);
  });

  const anyVisible = COUNTERS.some(c => String(s[c.showKey]) !== 'false');
  const countersMain = $('countersMain');
  if(countersMain) countersMain.classList.toggle('hidden-box', !anyVisible);

  const storyBtn = $('storyBtn');
  if(storyBtn) storyBtn.style.display =
    (s.enableStory === 'true' && S.CURR.story.length) ? 'inline-flex' : 'none';
  const mapBtn = $('mapBtn');
  if(mapBtn) mapBtn.style.display =
    (s.enableMap === 'true' && S.CURR.pins.length) ? 'inline-flex' : 'none';
  const uploadBtn = $('uploadBtn');
  if(uploadBtn) uploadBtn.style.display =
    (s.enableUpload === 'true') ? 'inline-flex' : 'none';
  const voiceRow = $('voiceRow');
  if(voiceRow) voiceRow.style.display =
    (s.enableVoiceMsg === 'true' && S.CURR.voice.length) ? 'flex' : 'none';
  const videoRow = $('videoMsgRow');
  if(videoRow) videoRow.style.display =
    (s.enableVideoMsg === 'true' && S.CURR.video.length) ? 'flex' : 'none';

  window.renderGifts();
  window.renderEvents();
  window.updateCounters();
};

/* ---------- Bindings ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#reactionBar .reaction-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if(e && e.preventDefault) e.preventDefault();
      const key = btn.dataset.react;
      const emoji = btn.dataset.emoji || '❤️';
      S.REACTIONS[key] = (S.REACTIONS[key] || 0) + 1;
      saveReactions(S.CURRENT_PERSON, S.REACTIONS);
      window.paintReactions();

      const burst = document.createElement('span');
      burst.className = 'rb-burst';
      burst.textContent = emoji;
      btn.appendChild(burst);
      setTimeout(() => burst.remove(), 720);

      if(window.fireworksBurst){
        const r = btn.getBoundingClientRect();
        fireworksBurst(r.left + r.width / 2, r.top);
      }
    });
  });

  const dt = $('darkmodeToggle');
  if(dt) dt.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); window.toggleDarkForCurrent(); };
  const vd = $('viewerDarkBtn');
  if(vd) vd.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); window.toggleDarkForCurrent(); };
  const vs = $('viewerShareBtn');
  if(vs) vs.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); openWhatsAppShare(); };

  const back = $('viewerBackBtn');
  if(back) back.onclick = (e) => {
    if(e && e.preventDefault) e.preventDefault();
    if(window.SS_clearSession) window.SS_clearSession();
    // ✅ Reset dark mode when leaving viewer so home stays clean
    window.setDarkMode(false);
    hide($('viewerScreen'));
    S.PREVIEW_MODE = false;
    S.CARD_STARTED = false;
    S.REQUESTER_MODE = false;
    if(window.__closeAllModals__) window.__closeAllModals__();
    if(S.ADMIN_MODE) show($('adminPanel'));
    else $('homeScreen').classList.remove('hidden');
  };
});

})();