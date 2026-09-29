/* ============================================================
   admin.js — Admin panel + FAST unsaved preview
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

const ADM = {
  texts: {en:{}, gu:{}, hi:{}},
  lang: 'en',
  shared: {},
  theme: 'romantic',
  people: [],
  editingPersonId: null,
  counters: {},
  gifts: [], story: [], events: [],
  voice: [], video: [], pins: [], media: []
};

/* ---------- In-memory settings cache per person ---------- */
const SET_CACHE = {};

/* ============================================================
   ADMIN OPEN
   ============================================================ */
window.openAdminPanel = async function(){
  if(!S.ADMIN_MODE) S.ADMIN_MODE = true;

  if(!S.PEOPLE || !S.PEOPLE.length){
    S.PEOPLE = await sb.people() || [];
  }
  ADM.people = JSON.parse(JSON.stringify(S.PEOPLE));

  buildPersonDropdown();
  renderPeopleRepeater();
  renderAdminReviews();

  const firstEnabled = ADM.people.find(p => p.enabled !== false);
  if(firstEnabled){
    await loadPersonIntoAdmin(firstEnabled.id);
  } else {
    clearAdminFields();
  }

  bindAdminTabs();
  bindAdminLangTabs();
  bindAdminActions();
  bindAdminPeopleActions();
  bindAdminThemeGrid();
  bindAdminCounters();
  bindAdminExtras();
  bindAdminSlideshow();
  bindAdminBackup();
  bindAdminSecurity();
  bindAdminGuestActions();

  show($('adminPanel'));
};

function bindAdminTabs(){
  document.querySelectorAll('#adminPanel .panel-tab').forEach(tab => {
    if(tab.dataset._bound === '1') return;
    tab.dataset._bound = '1';
    tab.onclick = () => {
      document.querySelectorAll('#adminPanel .panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#adminPanel .panel-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = $(tab.dataset.pane);
      if(pane) pane.classList.add('active');
    };
  });

  const closeBtn = $('adminPanelClose');
  if(closeBtn && closeBtn.dataset._bound !== '1'){
    closeBtn.dataset._bound = '1';
    closeBtn.onclick = () => hide($('adminPanel'));
  }
}

function bindAdminLangTabs(){
  document.querySelectorAll('#adminLangTabs button').forEach(btn => {
    if(btn.dataset._bound === '1') return;
    btn.dataset._bound = '1';
    btn.onclick = () => {
      saveAdminTextsFromFields();
      ADM.lang = btn.dataset.adminLang;
      document.querySelectorAll('#adminLangTabs button').forEach(b =>
        b.classList.toggle('active', b.dataset.adminLang === ADM.lang)
      );
      applyAdminTextsToFields(ADM.lang);
    };
  });
}

/* ============================================================
   PERSON DROPDOWN
   ============================================================ */
function buildPersonDropdown(){
  const sel = $('adminPersonSelect');
  if(!sel) return;
  sel.innerHTML = '';
  ADM.people.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = (p.display_name || p.slug || ('Person #' + p.id)) +
      (p.enabled === false ? ' (disabled)' : '');
    sel.appendChild(opt);
  });
  if(ADM.editingPersonId){
    sel.value = String(ADM.editingPersonId);
  }
  if(sel.dataset._bound !== '1'){
    sel.dataset._bound = '1';
    sel.onchange = async () => {
      const id = parseInt(sel.value, 10);
      if(!id) return;
      await loadPersonIntoAdmin(id);
    };
  }
}
window.buildAdminPersonDropdown = buildPersonDropdown;

/* ============================================================
   LOAD PERSON — uses cache when possible
   ============================================================ */
async function loadPersonIntoAdmin(personId, force){
  ADM.editingPersonId = personId;

  // ---------- Cache fast path ----------
  if(!force && SET_CACHE[personId]){
    const c = SET_CACHE[personId];
    applyLoadedPerson(c);
    return;
  }

  const set = await sb.getSet(personId);
  S.CURRENT_SETTINGS = set;

  const shared = {};
  Object.keys(set).forEach(k => {
    if(k.startsWith('shared__')) shared[k.substring(8)] = set[k];
  });

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

  const counters = {};
  COUNTERS.forEach(c => {
    counters[c.labelKey] = shared[c.labelKey] !== undefined ? shared[c.labelKey] : '';
    counters[c.dtKey]    = shared[c.dtKey] || '';
    counters[c.tzKey]    = shared[c.tzKey] || DEFAULT_TZ;
    counters[c.dispKey]  = shared[c.dispKey] || '';
    counters[c.showKey]  = shared[c.showKey] !== undefined ? shared[c.showKey] : 'true';
  });

  // Fire all row fetches in parallel
  const [gifts, story, events, voice, video, pins, media] = await Promise.all([
    sb.rows(T_GIFTS,  personId),
    sb.rows(T_STORY,  personId),
    sb.rows(T_EVENTS, personId),
    sb.rows(T_VOICE,  personId),
    sb.rows(T_VIDEO,  personId),
    sb.rows(T_PINS,   personId),
    sb.rows(T_MEDIA,  personId)
  ]);

  const cache = {
    shared,
    texts: {
      en: buildTextsForLang('en'),
      gu: buildTextsForLang('gu'),
      hi: buildTextsForLang('hi')
    },
    counters,
    gifts: gifts || [],
    story: story || [],
    events: events || [],
    voice: voice || [],
    video: video || [],
    pins: pins || [],
    media: media || []
  };
  SET_CACHE[personId] = cache;
  applyLoadedPerson(cache);
}

function applyLoadedPerson(c){
  ADM.shared = Object.assign({}, c.shared);
  ADM.theme = c.shared.theme || 'romantic';
  ADM.texts = {
    en: Object.assign({}, c.texts.en),
    gu: Object.assign({}, c.texts.gu),
    hi: Object.assign({}, c.texts.hi)
  };
  ADM.counters = Object.assign({}, c.counters);
  ADM.gifts  = JSON.parse(JSON.stringify(c.gifts));
  ADM.story  = JSON.parse(JSON.stringify(c.story));
  ADM.events = JSON.parse(JSON.stringify(c.events));
  ADM.voice  = JSON.parse(JSON.stringify(c.voice));
  ADM.video  = JSON.parse(JSON.stringify(c.video));
  ADM.pins   = JSON.parse(JSON.stringify(c.pins));
  ADM.media  = JSON.parse(JSON.stringify(c.media));

  document.querySelectorAll('#adminLangTabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.adminLang === 'en');
  });
  ADM.lang = 'en';
  applyAdminTextsToFields(ADM.lang);
  applySharedToFields(ADM.shared);
  renderAdminTheme();
  renderAdminCounters();
  renderGiftsRepeater();
  renderStoryRepeater();
  renderEventsRepeater();
  renderVoiceRepeater();
  renderVideoRepeater();
  renderPinsRepeater();
  renderMediaRepeater();
  renderAdminSlideshowFields(ADM.shared);
}

function invalidateCache(pid){
  if(pid) delete SET_CACHE[pid];
  else SET_CACHE = {};
}

function clearAdminFields(){
  ADM.texts = {en:{}, gu:{}, hi:{}};
  ADM.shared = {};
  ADM.theme = 'romantic';
  ADM.counters = {};
  ADM.gifts = []; ADM.story = []; ADM.events = [];
  ADM.voice = []; ADM.video = []; ADM.pins = []; ADM.media = [];
  applyAdminTextsToFields('en');
  applySharedToFields({});
  renderAdminTheme();
  renderAdminCounters();
  renderGiftsRepeater();
  renderStoryRepeater();
  renderEventsRepeater();
  renderVoiceRepeater();
  renderVideoRepeater();
  renderPinsRepeater();
  renderMediaRepeater();
  renderAdminSlideshowFields({});
}

/* ============================================================
   TEXT FIELDS
   ============================================================ */
function applyAdminTextsToFields(lang){
  const src = ADM.texts[lang] || {};
  TEXT_FIELDS.forEach(f => {
    const el = $('f_' + f);
    if(!el) return;
    el.value = src[f] !== undefined ? src[f] : '';
  });
  const dl = $('f_defaultLang');
  if(dl) dl.value = ADM.shared.defaultLang || 'en';
}

function saveAdminTextsFromFields(){
  ADM.texts[ADM.lang] = ADM.texts[ADM.lang] || {};
  TEXT_FIELDS.forEach(f => {
    const el = $('f_' + f);
    if(!el) return;
    ADM.texts[ADM.lang][f] = el.value;
  });
}

/* ============================================================
   SHARED FIELDS
   ============================================================ */
function applySharedToFields(shared){
  setChk('f_enableFireworks', shared.enableFireworks !== 'false');
  setChk('f_enableGiftBox', shared.enableGiftBox !== 'false');
  setChk('f_enableVoiceMsg', shared.enableVoiceMsg !== 'false');
  setChk('f_enableVideoMsg', shared.enableVideoMsg !== 'false');
  setChk('f_enableEventCount', shared.enableEventCount !== 'false');
  setChk('f_enableStory', shared.enableStory !== 'false');
  setChk('f_enableMap', shared.enableMap !== 'false');
  setChk('f_enableUpload', shared.enableUpload !== 'false');
  setChk('f_showLockScreen', shared.showLockScreen === 'true');

  const mode = shared.music_mode || 'both';
  document.querySelectorAll('input[name="music_mode"]').forEach(r => {
    r.checked = r.value === mode;
  });

  for(let i = 1; i <= 5; i++){
    setChk('f_song' + i + '_on', shared['song' + i + '_on'] === 'true');
    setVal('f_song' + i + '_url', shared['song' + i + '_url'] || '');
    setVal('f_song' + i + '_where', shared['song' + i + '_where'] || 'both');
  }

  setVal('f_vol_card', shared.vol_card !== undefined ? shared.vol_card : '0.45');
  setSliderLabel('f_vol_card', 'f_vol_card_val');
  setVal('f_vol_slide', shared.vol_slide !== undefined ? shared.vol_slide : '0.85');
  setSliderLabel('f_vol_slide', 'f_vol_slide_val');
  setVal('f_vol_video', shared.vol_video !== undefined ? shared.vol_video : '1.0');
  setSliderLabel('f_vol_video', 'f_vol_video_val');
  setChk('f_musicDuringVideo', String(shared.musicDuringVideo) === 'true');
  setVal('f_vol_video_music', shared.vol_video_music !== undefined ? shared.vol_video_music : '0.35');
  setSliderLabel('f_vol_video_music', 'f_vol_video_music_val');

  setVal('f_photoDurationSec', shared.photoDurationSec || '5');
  setChk('f_shuffleMusicOn', shared.shuffleMusicOn === 'true');
  setChk('f_shuffleMediaOn', shared.shuffleMediaOn === 'true');
  setChk('f_slideEffectsEnabled', shared.slideEffectsEnabled !== 'false');
  setVal('f_effectsIntensity', shared.effectsIntensity || '1');
  setSliderLabel('f_effectsIntensity', 'f_effectsIntensity_val');
  setChk('f_floatersEnabled', shared.floatersEnabled !== 'false');
  setVal('f_floaterDensity', shared.floaterDensity || '1');
  setSliderLabel('f_floaterDensity', 'f_floaterDensity_val');
  setChk('f_pinSlideshowEnabled', shared.pinSlideshowEnabled === 'true');
  setVal('f_pinSlideDuration', shared.pinSlideDuration || '4');
  setSliderLabel('f_pinSlideDuration', 'f_pinSlideDuration_val');
  setVal('f_pinSlideDefaultSec', shared.pinSlideDefaultSec || '10');
  setChk('f_storySlideshowEnabled', shared.storySlideshowEnabled === 'true');
  setVal('f_storySlideDuration', shared.storySlideDuration || '10');
  setSliderLabel('f_storySlideDuration', 'f_storySlideDuration_val');
  setVal('f_storySlideDefaultSec', shared.storySlideDefaultSec || '10');

  setVal('f_adminPassword', shared.adminPassword || FALLBACK_ADMIN_PW);
  setChk('f_adminLoginEnabled', shared.adminLoginEnabled !== 'false');

  const unlockEl = $('f_unlockDateISO');
  if(unlockEl){
    const tz = shared.unlockDateISO_tz || DEFAULT_TZ;
    unlockEl.value = shared.unlockDateISO ? utcToZonedLocal(shared.unlockDateISO, tz) : '';
    fillTzSelect($('f_unlockDateISO_tz'), tz);
    $('f_unlockDateISO_tz').value = tz;
  }

  const expEl = $('f_hardExpiryISO');
  if(expEl){
    const tz = shared.hardExpiryISO_tz || DEFAULT_TZ;
    expEl.value = shared.hardExpiryISO ? utcToZonedLocal(shared.hardExpiryISO, tz) : '';
    fillTzSelect($('f_hardExpiryISO_tz'), tz);
    $('f_hardExpiryISO_tz').value = tz;
  }
}
function setChk(id, on){ const el = $(id); if(el) el.checked = !!on; }
function setVal(id, v){ const el = $(id); if(el) el.value = v; }
function setSliderLabel(inputId, labelId){
  const i = $(inputId), l = $(labelId);
  if(i && l) l.textContent = parseFloat(i.value).toFixed(2).replace(/\.00$/, '');
}

/* ============================================================
   THEME GRID
   ============================================================ */
function renderAdminTheme(){
  document.querySelectorAll('#themeGrid .theme-swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.themePick === ADM.theme);
  });
}
function bindAdminThemeGrid(){
  document.querySelectorAll('#themeGrid .theme-swatch').forEach(el => {
    if(el.dataset._bound === '1') return;
    el.dataset._bound = '1';
    el.onclick = () => {
      ADM.theme = el.dataset.themePick;
      renderAdminTheme();
    };
  });
}

/* ============================================================
   COUNTERS
   ============================================================ */
function renderAdminCounters(){
  [1,2,3].forEach(n => {
    const s = $('f_ct' + n + '_show');
    if(s) s.checked = String(ADM.counters['ct' + n + '_show']) !== 'false';

    const lbl1 = $('f_ct' + n + '_label');
    const lbl2 = $('f_ct' + n + '_label2');
    const val = ADM.counters['ct' + n + '_label'] || '';
    if(lbl1) lbl1.value = val;
    if(lbl2) lbl2.value = val;

    const dtEl = $('f_ct' + n + '_datetime');
    const tz = ADM.counters['ct' + n + '_datetime_tz'] || DEFAULT_TZ;
    if(dtEl){
      dtEl.value = ADM.counters['ct' + n + '_datetime']
        ? utcToZonedLocal(ADM.counters['ct' + n + '_datetime'], tz)
        : '';
    }
    const tzEl = $('f_ct' + n + '_datetime_tz');
    if(tzEl){
      fillTzSelect(tzEl, tz);
      tzEl.value = tz;
    }
    const disp = $('f_ct' + n + '_dispdate');
    if(disp) disp.value = ADM.counters['ct' + n + '_dispdate'] || '';
  });
}

function bindAdminCounters(){
  [1,2,3].forEach(n => {
    const s = $('f_ct' + n + '_show');
    if(s && s.dataset._bound !== '1'){
      s.dataset._bound = '1';
      s.onchange = () => { ADM.counters['ct' + n + '_show'] = s.checked ? 'true' : 'false'; };
    }

    ['_label','_label2'].forEach(suffix => {
      const el = $('f_ct' + n + suffix);
      if(el && el.dataset._bound !== '1'){
        el.dataset._bound = '1';
        el.oninput = () => {
          ADM.counters['ct' + n + '_label'] = el.value;
          const other = $(suffix === '_label' ? 'f_ct' + n + '_label2' : 'f_ct' + n + '_label');
          if(other) other.value = el.value;
        };
      }
    });

    const dt = $('f_ct' + n + '_datetime');
    const tz = $('f_ct' + n + '_datetime_tz');
    const disp = $('f_ct' + n + '_dispdate');

    if(tz && tz.dataset._bound !== '1'){
      tz.dataset._bound = '1';
      tz.onchange = () => {
        ADM.counters['ct' + n + '_datetime_tz'] = tz.value;
        if(dt && dt.value) ADM.counters['ct' + n + '_datetime'] = zonedToUTC(dt.value, tz.value);
      };
    }
    if(dt && dt.dataset._bound !== '1'){
      dt.dataset._bound = '1';
      dt.oninput = () => {
        const tzVal = (tz ? tz.value : DEFAULT_TZ) || DEFAULT_TZ;
        ADM.counters['ct' + n + '_datetime'] = dt.value ? zonedToUTC(dt.value, tzVal) : '';
      };
    }
    if(disp && disp.dataset._bound !== '1'){
      disp.dataset._bound = '1';
      disp.oninput = () => { ADM.counters['ct' + n + '_dispdate'] = disp.value; };
    }
  });
}

/* ============================================================
   EXTRAS — Repeaters
   ============================================================ */
function renderGiftsRepeater(){
  const w = $('giftsRepeater');
  if(!w) return;
  w.innerHTML = '';
  ADM.gifts.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML = `
      <button type="button" class="repeat-remove" data-i="${i}">✕</button>
      <div class="panel-field"><label class="panel-label">Emoji</label><input type="text" class="panel-input" data-gf="emoji" data-i="${i}" value="${escAttr(g.emoji || '🎁')}"></div>
      <div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gf="title" data-i="${i}" value="${escAttr(g.title || '')}"></div>
      <div class="panel-field"><label class="panel-label">Message</label><textarea class="panel-textarea" data-gf="message" data-i="${i}">${esc(g.message || '')}</textarea></div>
      <div class="panel-field"><label class="panel-label">Photo Drive ID (comma-separate)</label><input type="text" class="panel-input" data-gf="photo_drive_id" data-i="${i}" value="${escAttr(g.photo_drive_id || '')}"></div>
    `;
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { ADM.gifts[+el.dataset.i][el.dataset.gf] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { ADM.gifts.splice(+b.dataset.i, 1); renderGiftsRepeater(); };
  });
}

function renderStoryRepeater(){
  const w = $('storyRepeater');
  if(!w) return;
  w.innerHTML = '';
  ADM.story.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML = `
      <button type="button" class="repeat-remove" data-i="${i}">✕</button>
      <div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gs="title" data-i="${i}" value="${escAttr(s.title || '')}"></div>
      <div class="panel-field"><label class="panel-label">Body</label><textarea class="panel-textarea" data-gs="body" data-i="${i}">${esc(s.body || '')}</textarea></div>
      <div class="panel-field"><label class="panel-label">Photo Drive ID (comma-separate)</label><input type="text" class="panel-input" data-gs="photo_drive_id" data-i="${i}" value="${escAttr(s.photo_drive_id || '')}"></div>
    `;
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { ADM.story[+el.dataset.i][el.dataset.gs] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { ADM.story.splice(+b.dataset.i, 1); renderStoryRepeater(); };
  });
}

function renderEventsRepeater(){
  const w = $('eventsRepeater');
  if(!w) return;
  w.innerHTML = '';
  ADM.events.forEach((ev, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    const tz = ev.target_iso_tz || DEFAULT_TZ;
    const local = ev.target_iso ? utcToZonedLocal(ev.target_iso, tz) : '';
    const tzOptsHtml = TZ_OPTIONS.map(o =>
      `<option value="${o.v}"${o.v === tz ? ' selected' : ''}>${o.l}</option>`
    ).join('');
    row.innerHTML = `
      <button type="button" class="repeat-remove" data-i="${i}">✕</button>
      <div class="panel-field"><label class="panel-label">Icon</label><input type="text" class="panel-input" data-ge2="icon" data-i="${i}" value="${escAttr(ev.icon || '📅')}"></div>
      <div class="panel-field"><label class="panel-label">Label</label><input type="text" class="panel-input" data-ge2="label" data-i="${i}" value="${escAttr(ev.label || '')}"></div>
      <div class="panel-field"><label class="panel-label">Target date &amp; time + timezone</label>
        <div class="tz-row">
          <input type="datetime-local" class="panel-input" data-ge2="target_local" data-i="${i}" value="${local}">
          <select class="panel-select tz-select" data-ge2="target_tz" data-i="${i}">${tzOptsHtml}</select>
        </div>
      </div>
    `;
    w.appendChild(row);
  });
  w.querySelectorAll('input,select').forEach(el => {
    el.oninput = el.onchange = () => {
      const i = +el.dataset.i;
      if(el.dataset.ge2 === 'target_local'){
        const tzEl = w.querySelector('.tz-select[data-ge2="target_tz"][data-i="' + i + '"]');
        const tz = tzEl ? tzEl.value : DEFAULT_TZ;
        ADM.events[i].target_iso = el.value ? zonedToUTC(el.value, tz) : '';
        ADM.events[i].target_iso_tz = tz;
      } else if(el.dataset.ge2 === 'target_tz'){
        const dtEl = w.querySelector('input[data-ge2="target_local"][data-i="' + i + '"]');
        const tz = el.value;
        ADM.events[i].target_iso_tz = tz;
        if(dtEl && dtEl.value) ADM.events[i].target_iso = zonedToUTC(dtEl.value, tz);
      } else if(el.dataset.ge2){
        ADM.events[i][el.dataset.ge2] = el.value;
      }
    };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { ADM.events.splice(+b.dataset.i, 1); renderEventsRepeater(); };
  });
}

function renderVoiceRepeater(){
  const w = $('voiceRepeater');
  if(!w) return;
  w.innerHTML = '';
  ADM.voice.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML = `
      <button type="button" class="repeat-remove" data-i="${i}">✕</button>
      <div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gv="title" data-i="${i}" value="${escAttr(v.title || '')}"></div>
      <div class="panel-field"><label class="panel-label">Audio URL</label><input type="text" class="panel-input" data-gv="audio_url" data-i="${i}" value="${escAttr(v.audio_url || '')}"></div>
    `;
    w.appendChild(row);
  });
  w.querySelectorAll('input').forEach(el => {
    el.oninput = () => { ADM.voice[+el.dataset.i][el.dataset.gv] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { ADM.voice.splice(+b.dataset.i, 1); renderVoiceRepeater(); };
  });
}

function renderVideoRepeater(){
  const w = $('videoRepeater');
  if(!w) return;
  w.innerHTML = '';
  ADM.video.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML = `
      <button type="button" class="repeat-remove" data-i="${i}">✕</button>
      <div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gd="title" data-i="${i}" value="${escAttr(v.title || '')}"></div>
      <div class="panel-field"><label class="panel-label">Video URL</label><input type="text" class="panel-input" data-gd="video_url" data-i="${i}" value="${escAttr(v.video_url || '')}"></div>
    `;
    w.appendChild(row);
  });
  w.querySelectorAll('input').forEach(el => {
    el.oninput = () => { ADM.video[+el.dataset.i][el.dataset.gd] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { ADM.video.splice(+b.dataset.i, 1); renderVideoRepeater(); };
  });
}

function renderPinsRepeater(){
  const w = $('pinsRepeater');
  if(!w) return;
  w.innerHTML = '';
  ADM.pins.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML = `
      <button type="button" class="repeat-remove" data-i="${i}">✕</button>
      <div class="panel-field"><label class="panel-label">Label</label><input type="text" class="panel-input" data-gp="label" data-i="${i}" value="${escAttr(p.label || '')}"></div>
      <div class="panel-field"><label class="panel-label">Lat</label><input type="text" class="panel-input" data-gp="lat" data-i="${i}" value="${escAttr(p.lat || '')}"></div>
      <div class="panel-field"><label class="panel-label">Lng</label><input type="text" class="panel-input" data-gp="lng" data-i="${i}" value="${escAttr(p.lng || '')}"></div>
      <div class="panel-field"><label class="panel-label">Photo IDs (comma-separate)</label><input type="text" class="panel-input" data-gp="photo_drive_id" data-i="${i}" value="${escAttr(p.photo_drive_id || '')}"></div>
      <div class="panel-field"><label class="panel-label">Story</label><textarea class="panel-textarea" data-gp="story" data-i="${i}">${esc(p.story || '')}</textarea></div>
    `;
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { ADM.pins[+el.dataset.i][el.dataset.gp] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { ADM.pins.splice(+b.dataset.i, 1); renderPinsRepeater(); };
  });
}

function renderMediaRepeater(){
  const w = $('mediaRepeater');
  if(!w) return;
  w.innerHTML = '';
  ADM.media.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    /* V3: live thumbnail + drag handle (cosmetic helpers only) */
    const thumbSrc = m.src || (m.drive_id ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(m.drive_id) + '&sz=w200') : '');
    const thumb = thumbSrc
      ? '<img class="gm-thumb" src="' + escAttr(thumbSrc) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
      : '<span class="gm-thumb gm-thumb-empty">🖼️</span>';
    row.insertAdjacentHTML('beforeend',
      '<span class="gm-drag" draggable="true" title="Drag to reorder">⠿</span>' + thumb);
    row.insertAdjacentHTML('beforeend', `
      <button type="button" class="repeat-remove" data-i="${i}">✕</button>
      <div class="panel-field"><label class="panel-label">Type</label>
        <select class="panel-select" data-gm="type" data-i="${i}">
          <option value="photo"${m.type === 'photo' ? ' selected' : ''}>Photo</option>
          <option value="video"${m.type === 'video' ? ' selected' : ''}>Video</option>
        </select>
      </div>
      <div class="panel-field"><label class="panel-label">Drive ID</label><input type="text" class="panel-input" data-gm="drive_id" data-i="${i}" value="${escAttr(m.drive_id || '')}"></div>
      <div class="panel-field"><label class="panel-label">Direct URL</label><input type="text" class="panel-input" data-gm="src" data-i="${i}" value="${escAttr(m.src || '')}"></div>
      <div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gm="title" data-i="${i}" value="${escAttr(m.title || '')}"></div>
    `);
    /* keep .gm-thumb right after the handle, before remove btn — reorder DOM */
    const th = row.querySelector('.gm-thumb');
    const rm = row.querySelector('.repeat-remove');
    if(th && rm) row.insertBefore(th, rm);
    w.appendChild(row);
  });
  w.querySelectorAll('input,select').forEach(el => {
    el.onchange = el.oninput = () => {
      ADM.media[+el.dataset.i][el.dataset.gm] = el.value;
      /* live thumbnail refresh when URL/Drive changes */
      if(el.dataset.gm === 'src' || el.dataset.gm === 'drive_id'){
        const rowEl = el.closest('.repeat-row');
        const img = rowEl && rowEl.querySelector('.gm-thumb');
        const mm = ADM.media[+el.dataset.i];
        const s = mm.src || (mm.drive_id ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(mm.drive_id) + '&sz=w200') : '');
        if(img && s){ if(img.tagName === 'IMG'){ img.src = s; img.style.display=''; } }
      }
    };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { ADM.media.splice(+b.dataset.i, 1); renderMediaRepeater(); };
  });

  /* V3 drag-and-drop reorder — rewrites ADM.media order only (same save path) */
  let dragIdx = null;
  w.querySelectorAll('.gm-drag').forEach(h => {
    const rowEl = h.closest('.repeat-row');
    rowEl.addEventListener('dragstart', e => {
      dragIdx = Array.prototype.indexOf.call(w.children, rowEl);
      rowEl.classList.add('gm-dragging');
      try{ e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain',''); }catch(err){}
    });
    rowEl.addEventListener('dragover', e => { e.preventDefault(); rowEl.classList.add('gm-drop'); });
    rowEl.addEventListener('dragleave', () => rowEl.classList.remove('gm-drop'));
    rowEl.addEventListener('drop', e => {
      e.preventDefault();
      rowEl.classList.remove('gm-drop');
      const to = Array.prototype.indexOf.call(w.children, rowEl);
      if(dragIdx === null || dragIdx === to || dragIdx < 0) return;
      const moved = ADM.media.splice(dragIdx, 1)[0];
      ADM.media.splice(to, 0, moved);
      dragIdx = null;
      renderMediaRepeater();
    });
    rowEl.addEventListener('dragend', () => { rowEl.classList.remove('gm-dragging'); dragIdx = null; });
  });
  w.querySelectorAll('.repeat-row').forEach(r => r.setAttribute('draggable','false'));
  w.querySelectorAll('.gm-drag').forEach(h => {
    h.addEventListener('mousedown', () => h.closest('.repeat-row').setAttribute('draggable','true'));
    h.addEventListener('touchstart', () => {}, {passive:true});
  });

  /* V3 touch fallback: ▲▼ move buttons for mobile (no HTML drag on touch) */
  w.querySelectorAll('.repeat-row').forEach((rowEl, idx) => {
    const mv = document.createElement('span');
    mv.className = 'gm-move';
    mv.innerHTML = '<button type="button" class="gm-up" title="Move up">▲</button>' +
                   '<button type="button" class="gm-down" title="Move down">▼</button>';
    rowEl.insertBefore(mv, rowEl.querySelector('.gm-drag') ? rowEl.querySelector('.gm-drag').nextSibling : rowEl.firstChild);
    mv.querySelector('.gm-up').addEventListener('click', ev => {
      ev.preventDefault();
      const i = Array.prototype.indexOf.call(w.children, rowEl);
      if(i <= 0) return;
      const m = ADM.media.splice(i, 1)[0]; ADM.media.splice(i - 1, 0, m);
      renderMediaRepeater();
    });
    mv.querySelector('.gm-down').addEventListener('click', ev => {
      ev.preventDefault();
      const i = Array.prototype.indexOf.call(w.children, rowEl);
      if(i >= ADM.media.length - 1) return;
      const m = ADM.media.splice(i, 1)[0]; ADM.media.splice(i + 1, 0, m);
      renderMediaRepeater();
    });
  });
}

function bindAdminExtras(){
  const addGift = $('addGiftRow');
  if(addGift && addGift.dataset._bound !== '1'){
    addGift.dataset._bound = '1';
    addGift.onclick = () => { ADM.gifts.push({emoji:'🎁', title:'', message:'', photo_drive_id:''}); renderGiftsRepeater(); };
  }
  const addStory = $('addStoryRow');
  if(addStory && addStory.dataset._bound !== '1'){
    addStory.dataset._bound = '1';
    addStory.onclick = () => { ADM.story.push({title:'', body:'', photo_drive_id:''}); renderStoryRepeater(); };
  }
  const addEvent = $('addEventRow');
  if(addEvent && addEvent.dataset._bound !== '1'){
    addEvent.dataset._bound = '1';
    addEvent.onclick = () => { ADM.events.push({icon:'📅', label:'', target_iso:'', target_iso_tz:DEFAULT_TZ}); renderEventsRepeater(); };
  }
  const addVoice = $('addVoiceRow');
  if(addVoice && addVoice.dataset._bound !== '1'){
    addVoice.dataset._bound = '1';
    addVoice.onclick = () => { ADM.voice.push({title:'', audio_url:''}); renderVoiceRepeater(); };
  }
  const addVideo = $('addVideoRow');
  if(addVideo && addVideo.dataset._bound !== '1'){
    addVideo.dataset._bound = '1';
    addVideo.onclick = () => { ADM.video.push({title:'', video_url:''}); renderVideoRepeater(); };
  }
  const addPin = $('addPinRow');
  if(addPin && addPin.dataset._bound !== '1'){
    addPin.dataset._bound = '1';
    addPin.onclick = () => { ADM.pins.push({label:'', lat:'', lng:'', photo_drive_id:'', story:''}); renderPinsRepeater(); };
  }
  const addMedia = $('addMediaRow');
  if(addMedia && addMedia.dataset._bound !== '1'){
    addMedia.dataset._bound = '1';
    addMedia.onclick = () => { ADM.media.push({type:'photo', drive_id:'', src:'', title:''}); renderMediaRepeater(); };
  }
}

/* ============================================================
   SLIDESHOW FIELDS
   ============================================================ */
function renderAdminSlideshowFields(shared){
  const els = {
    f_photoDurationSec: shared.photoDurationSec || '5',
    f_effectsIntensity: shared.effectsIntensity || '1',
    f_floaterDensity:   shared.floaterDensity || '1',
    f_pinSlideDuration: shared.pinSlideDuration || '4',
    f_pinSlideDefaultSec: shared.pinSlideDefaultSec || '10',
    f_storySlideDuration: shared.storySlideDuration || '10',
    f_storySlideDefaultSec: shared.storySlideDefaultSec || '10'
  };
  Object.keys(els).forEach(k => { const el = $(k); if(el) el.value = els[k]; });
  /* V3 palette customizer (optional per-person accent colors) */
  const palOn = $('f_paletteOn'), palA = $('f_paletteA'), palB = $('f_paletteB');
  if(palOn && palA && palB){
    palOn.checked = shared.palette === 'true';
    palA.value = /^#[0-9a-f]{6}$/i.test(shared.paletteA || '') ? shared.paletteA : '#e11d48';
    palB.value = /^#[0-9a-f]{6}$/i.test(shared.paletteB || '') ? shared.paletteB : '#7c3aed';
    const syncPal = () => { const pv = $('palettePreview'); if(pv) pv.style.background = 'linear-gradient(135deg,' + palA.value + ',' + palB.value + ')'; };
    palA.oninput = palB.oninput = syncPal; syncPal();
  }
  setChk('f_shuffleMusicOn', shared.shuffleMusicOn === 'true');
  setChk('f_shuffleMediaOn', shared.shuffleMediaOn === 'true');
  setChk('f_slideEffectsEnabled', shared.slideEffectsEnabled !== 'false');
  setChk('f_floatersEnabled', shared.floatersEnabled !== 'false');
  setChk('f_pinSlideshowEnabled', shared.pinSlideshowEnabled === 'true');
  setChk('f_storySlideshowEnabled', shared.storySlideshowEnabled === 'true');
  setSliderLabel('f_effectsIntensity', 'f_effectsIntensity_val');
  setSliderLabel('f_floaterDensity', 'f_floaterDensity_val');
  setSliderLabel('f_pinSlideDuration', 'f_pinSlideDuration_val');
  setSliderLabel('f_storySlideDuration', 'f_storySlideDuration_val');
}

function bindAdminSlideshow(){
  ['f_effectsIntensity','f_floaterDensity','f_pinSlideDuration','f_storySlideDuration',
   'f_vol_card','f_vol_slide','f_vol_video','f_vol_video_music'].forEach(id => {
    const el = $(id);
    if(el && el.dataset._bound !== '1'){
      el.dataset._bound = '1';
      el.oninput = () => setSliderLabel(id, id + '_val');
    }
  });
}

/* ============================================================
   PEOPLE REPEATER
   ============================================================ */
function renderPeopleRepeater(){
  const w = $('peopleRepeater');
  if(!w) return;
  w.innerHTML = '';

  const info = $('peopleCountInfo');
  if(info) info.textContent = ADM.people.length + ' people total';

  ADM.people.forEach(p => {
    const isExpanded = S.EXPANDED_PEOPLE.has(p.id);
    const card = document.createElement('div');
    card.className = 'person-card' + (isExpanded ? ' expanded' : '');

    const bday = p.birthday ? new Date(p.birthday).toLocaleDateString() : '—';
    const editPw = getEditPasswordForPerson(p);
    const wipe = p.wipe_iso ? `<span class="wipe-badge">Wipe ${new Date(p.wipe_iso).toLocaleDateString()}</span>` : '';

    card.innerHTML = `
      <div class="person-summary" data-pid="${p.id}">
        <div class="pc-emoji">💝</div>
        <div class="pc-body">
          <div class="pc-name">${esc(p.display_name || p.slug)}</div>
          <div class="pc-meta">
            <span class="pc-id">#${esc(p.slug || '')}</span>
            🎂 ${esc(bday)}
            ${p.requester_name ? (' · by ' + esc(p.requester_name)) : ''}
            ${wipe}
          </div>
        </div>
        <div class="pc-chev">▾</div>
      </div>
      <div class="person-details" style="display:${isExpanded ? 'block' : 'none'};">
        <div class="panel-field"><label class="panel-label">Display name</label><input class="panel-input" data-pp="display_name" data-pid="${p.id}" value="${escAttr(p.display_name || '')}"></div>
        <div class="panel-field"><label class="panel-label">Slug / Login ID</label><input class="panel-input" data-pp="slug" data-pid="${p.id}" value="${escAttr(p.slug || '')}"></div>
        <div class="panel-field"><label class="panel-label">Card password</label><input class="panel-input" data-pp="password" data-pid="${p.id}" value="${escAttr(p.password || '')}"></div>
        <div class="panel-field"><label class="panel-label">Birthday</label><input type="date" class="panel-input" data-pp="birthday" data-pid="${p.id}" value="${escAttr((p.birthday || '').slice(0,10))}"></div>
        <div class="panel-field"><label class="panel-label">Requester name</label><input class="panel-input" data-pp="requester_name" data-pid="${p.id}" value="${escAttr(p.requester_name || '')}"></div>
        <div class="panel-field"><label class="panel-label">Requester WhatsApp</label><input class="panel-input" data-pp="requester_whatsapp" data-pid="${p.id}" value="${escAttr(p.requester_whatsapp || '')}"></div>
        ${editPw ? `<div class="panel-field" style="padding:.5rem;background:#eef3ff;border:1px dashed #1a3d8f;border-radius:.6rem;">
          <label class="panel-label" style="color:#1a3d8f;">✏️ Requester EDIT password</label>
          <input class="panel-input" readonly style="background:#f4f8ff;font-family:monospace;font-weight:800;color:#1a3d8f;" value="${escAttr(editPw)}">
        </div>` : ''}
        <div class="panel-field" style="padding:.5rem;background:#fff0f0;border:1px dashed #8b0028;border-radius:.6rem;">
          <label class="panel-label" style="color:#8b0028;">🗓️ Auto-wipe on</label>
          <input type="datetime-local" class="panel-input" data-pp="wipe_local" data-pid="${p.id}" value="${p.wipe_iso ? utcToZonedLocal(p.wipe_iso, DEFAULT_TZ) : ''}">
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem;">
          <button type="button" class="view-details-btn" data-act="view" data-pid="${p.id}">👁️ View / Preview</button>
          <button type="button" class="panel-btn edit" data-act="save" data-pid="${p.id}" style="min-width:0;flex:0 0 auto;padding:.4rem .9rem;font-size:.8rem;">💾 Save changes</button>
          <button type="button" class="panel-btn danger" data-act="delete" data-pid="${p.id}" style="min-width:0;flex:0 0 auto;padding:.4rem .9rem;font-size:.8rem;">🗑️ Delete</button>
        </div>
      </div>
    `;
    w.appendChild(card);
  });

  w.querySelectorAll('.person-summary').forEach(sum => {
    sum.onclick = () => {
      const pid = parseInt(sum.dataset.pid, 10);
      const card = sum.closest('.person-card');
      const details = card.querySelector('.person-details');
      const expanded = card.classList.toggle('expanded');
      details.style.display = expanded ? 'block' : 'none';
      if(expanded) S.EXPANDED_PEOPLE.add(pid);
      else S.EXPANDED_PEOPLE.delete(pid);
    };
  });

  w.querySelectorAll('[data-pp]').forEach(el => {
    el.oninput = el.onchange = () => {
      const pid = parseInt(el.dataset.pid, 10);
      const key = el.dataset.pp;
      const person = ADM.people.find(x => x.id === pid);
      if(person) person[key] = el.value;
    };
  });

  w.querySelectorAll('button[data-act]').forEach(btn => {
    btn.onclick = async () => {
      const pid = parseInt(btn.dataset.pid, 10);
      const act = btn.dataset.act;
      const person = ADM.people.find(x => x.id === pid);
      if(!person) return;

      if(act === 'view'){
        S.CURRENT_PERSON = person;
        S.PREVIEW_MODE = true;
        S.ADMIN_MODE = true;
        await window.__loadPersonIntoState__(person);
        hide($('adminPanel'));
        $('homeScreen').classList.add('hidden');
        await window.showViewerFor(person, true);
        return;
      }

      if(act === 'save'){
        const patch = {
          display_name: person.display_name,
          slug: (person.slug || '').toLowerCase().replace(/[^a-z0-9\-_]/g, ''),
          password: person.password,
          birthday: person.birthday || null,
          requester_name: person.requester_name || '',
          requester_whatsapp: person.requester_whatsapp || ''
        };
        if(person.wipe_local){
          patch.wipe_iso = zonedToUTC(person.wipe_local, DEFAULT_TZ);
        }
        try{
          await sb.updPerson(pid, patch);
          invalidateCache(pid);
          __showToast('✅ Person updated');
          S.PEOPLE = await sb.people() || [];
          ADM.people = JSON.parse(JSON.stringify(S.PEOPLE));
          if(window.buildHome) window.buildHome();
        }catch(e){ __showToast('❌ ' + e.message, false); }
        return;
      }

      if(act === 'delete'){
        const ok = await __confirm({
          icon: '🗑️',
          title: 'Delete "' + (person.display_name || person.slug) + '"?',
          message: 'All their gifts, story, media, pins and settings will be permanently removed.',
          okText: 'Delete forever',
          danger: true
        });
        if(!ok) return;
        await wipeOnePerson(pid);
        invalidateCache(pid);
        S.PEOPLE = await sb.people() || [];
        ADM.people = JSON.parse(JSON.stringify(S.PEOPLE));
        renderPeopleRepeater();
        buildPersonDropdown();
        if(window.buildHome) window.buildHome();
        __showToast('🗑️ Person deleted');
      }
    };
  });
}

function bindAdminPeopleActions(){
  const addBtn = $('openAddPersonBtn');
  if(addBtn && addBtn.dataset._bound !== '1'){
    addBtn.dataset._bound = '1';
    addBtn.onclick = () => openAddPersonModal();
  }
  const inlineAdd = $('addPersonRow');
  if(inlineAdd && inlineAdd.dataset._bound !== '1'){
    inlineAdd.dataset._bound = '1';
    inlineAdd.onclick = () => openAddPersonModal();
  }
  const toggleAll = $('peopleToggleAll');
  if(toggleAll && toggleAll.dataset._bound !== '1'){
    toggleAll.dataset._bound = '1';
    toggleAll.onclick = () => {
      const allExpanded = ADM.people.every(p => S.EXPANDED_PEOPLE.has(p.id));
      if(allExpanded) S.EXPANDED_PEOPLE.clear();
      else ADM.people.forEach(p => S.EXPANDED_PEOPLE.add(p.id));
      renderPeopleRepeater();
    };
  }
}

/* ============================================================
   ADD PERSON MODAL
   ============================================================ */
function openAddPersonModal(){
  ['ap_name','ap_slug','ap_password','ap_birthday','ap_requester','ap_requester_wa'].forEach(id => {
    const el = $(id); if(el) el.value = '';
  });
  const wipe = $('ap_wipe_local'); if(wipe) wipe.value = '';
  fillTzSelect($('ap_wipe_tz'), DEFAULT_TZ);
  const preview = $('ap_editpw_preview'); if(preview) preview.value = '';
  const st = $('ap_status'); if(st){ st.textContent = ''; st.className = 'panel-status'; }
  updateApEditPreview();
  show($('addPersonModal'));

  ['ap_name','ap_slug','ap_requester','ap_requester_wa'].forEach(id => {
    const el = $(id);
    if(el && el.dataset._bound !== '1'){
      el.dataset._bound = '1';
      el.oninput = updateApEditPreview;
    }
  });

  const gen = $('ap_generatePw');
  if(gen && gen.dataset._bound !== '1'){
    gen.dataset._bound = '1';
    gen.onclick = () => {
      const words = ['Sunshine','Rainbow','Blossom','Starlight','Rose','Lotus','Velvet','Amber','Crystal','Dream'];
      const w = words[Math.floor(Math.random() * words.length)];
      const n = Math.floor(1000 + Math.random() * 9000);
      $('ap_password').value = w + n + '!';
    };
  }

  const close = $('addPersonClose');
  if(close && close.dataset._bound !== '1'){
    close.dataset._bound = '1';
    close.onclick = () => hide($('addPersonModal'));
  }
  const cancel = $('ap_cancel');
  if(cancel && cancel.dataset._bound !== '1'){
    cancel.dataset._bound = '1';
    cancel.onclick = () => hide($('addPersonModal'));
  }

  const saveClose = $('ap_saveClose');
  if(saveClose && saveClose.dataset._bound !== '1'){
    saveClose.dataset._bound = '1';
    saveClose.onclick = () => saveNewPerson(true);
  }
  const saveNew = $('ap_saveNew');
  if(saveNew && saveNew.dataset._bound !== '1'){
    saveNew.dataset._bound = '1';
    saveNew.onclick = () => saveNewPerson(false);
  }
}

function updateApEditPreview(){
  const name = ($('ap_requester') || {}).value || '';
  const wa = ($('ap_requester_wa') || {}).value || '';
  const slug = ($('ap_slug') || {}).value || '';
  const preview = $('ap_editpw_preview');
  if(preview) preview.value = makeRequesterEditPassword(name, wa, slug);
}

async function saveNewPerson(closeAfter){
  const st = $('ap_status');
  const display = $('ap_name').value.trim();
  const slug = $('ap_slug').value.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '');
  const password = $('ap_password').value.trim();
  const birthday = $('ap_birthday').value.trim();
  const reqName = $('ap_requester').value.trim();
  const reqWa = $('ap_requester_wa').value.trim();
  const wipeLocal = $('ap_wipe_local').value;
  const wipeTz = $('ap_wipe_tz').value || DEFAULT_TZ;

  if(!display){ st.textContent = '❌ Display name required.'; st.className = 'panel-status err'; return; }
  if(!slug){ st.textContent = '❌ Login ID / Slug required.'; st.className = 'panel-status err'; return; }

  const dupe = S.PEOPLE.find(p => p.slug && p.slug.toLowerCase() === slug);
  if(dupe){ st.textContent = '❌ Login ID "' + slug + '" is already taken.'; st.className = 'panel-status err'; return; }

  let pwd = password;
  if(!pwd){
    const nm = (display || 'Friend').replace(/[^A-Za-z]/g, '').slice(0, 10) || 'Friend';
    let dd = '0000';
    if(birthday){
      const d = new Date(birthday);
      if(!isNaN(d.getTime())) dd = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
    }
    const words = ['Sunshine','Rainbow','Blossom','Starlight','Rose','Lotus','Velvet','Amber','Crystal','Dream'];
    const wd = words[Math.floor(Math.random() * words.length)];
    pwd = nm.charAt(0).toUpperCase() + nm.slice(1).toLowerCase() + '-' + dd + '-' + wd;
  }

  const row = {
    slug,
    display_name: display,
    birthday: birthday || null,
    password: pwd,
    wipe_iso: wipeLocal ? zonedToUTC(wipeLocal, wipeTz) : null,
    enabled: true,
    sort_order: S.PEOPLE.length,
    requester_name: reqName,
    requester_whatsapp: reqWa
  };

  st.textContent = '⏳ Saving…'; st.className = 'panel-status';
  try{
    const res = await sb.insPerson(row);
    if(res && res[0] && res[0].id){
      await sb.upSet({
        'shared__theme': 'romantic',
        'shared__defaultLang': 'en',
        'shared__enableStory': 'true',
        'shared__enableGiftBox': 'true',
        'shared__enableEventCount': 'true',
        'shared__enableVoiceMsg': 'true',
        'shared__enableVideoMsg': 'true',
        'shared__enableMap': 'true'
      }, res[0].id);
    }
    S.PEOPLE = await sb.people() || [];
    ADM.people = JSON.parse(JSON.stringify(S.PEOPLE));
    renderPeopleRepeater();
    buildPersonDropdown();
    if(window.buildHome) window.buildHome();
    st.textContent = '✅ Created — password: ' + pwd;
    st.className = 'panel-status ok';
    __showToast('✅ Person created');

    if(closeAfter){
      hide($('addPersonModal'));
    } else {
      ['ap_name','ap_slug','ap_password','ap_birthday','ap_requester','ap_requester_wa'].forEach(id => {
        const el = $(id); if(el) el.value = '';
      });
      updateApEditPreview();
    }
  }catch(e){
    st.textContent = '❌ ' + e.message;
    st.className = 'panel-status err';
  }
}

/* ============================================================
   SAVE / RESET / CANCEL + FAST UNSAVED PREVIEW
   ============================================================ */
function bindAdminActions(){
  const saveBtn = $('adminSave');
  if(saveBtn && saveBtn.dataset._bound !== '1'){
    saveBtn.dataset._bound = '1';
    saveBtn.onclick = () => saveAdminFull(false);
  }

  // ✅ FAST UNSAVED PREVIEW — uses in-memory state only
  const previewBtn = $('adminPreviewBtn');
  if(previewBtn && previewBtn.dataset._bound !== '1'){
    previewBtn.dataset._bound = '1';
    previewBtn.onclick = () => previewUnsavedAdmin();
  }

  const savePrevBtn = $('adminSavePreviewBtn');
  if(savePrevBtn && savePrevBtn.dataset._bound !== '1'){
    savePrevBtn.dataset._bound = '1';
    savePrevBtn.onclick = () => saveAdminFull(true, true);
  }

  const resetBtn = $('adminReset');
  if(resetBtn && resetBtn.dataset._bound !== '1'){
    resetBtn.dataset._bound = '1';
    resetBtn.onclick = () => {
      if(!ADM.editingPersonId) return;
      clearAdminFields();
      __showToast('🧹 Fields cleared');
    };
  }

  const cancelBtn = $('adminCancel');
  if(cancelBtn && cancelBtn.dataset._bound !== '1'){
    cancelBtn.dataset._bound = '1';
    cancelBtn.onclick = () => hide($('adminPanel'));
  }
}

/* Build a fake person object with everything already in ADM, no DB hit */
function buildPreviewPersonFromADM(pid){
  const person = ADM.people.find(p => p.id === pid);
  if(!person) return null;
  return JSON.parse(JSON.stringify(person));
}

/* Build full in-memory CURR object from ADM state */
function buildPreviewCURR(){
  saveAdminTextsFromFields();

  const textsByLang = {
    en: Object.assign({}, ADM.texts.en || {}),
    gu: Object.assign({}, ADM.texts.gu || {}),
    hi: Object.assign({}, ADM.texts.hi || {})
  };

  // Build shared
  const shared = {};
  shared.theme = ADM.theme || 'romantic';
  shared.defaultLang = ($('f_defaultLang') || {}).value || 'en';

  ['enableFireworks','enableGiftBox','enableVoiceMsg','enableVideoMsg',
   'enableEventCount','enableStory','enableMap','enableUpload','showLockScreen',
   'musicDuringVideo','shuffleMusicOn','shuffleMediaOn',
   'slideEffectsEnabled','floatersEnabled','pinSlideshowEnabled','storySlideshowEnabled'].forEach(k => {
    const el = $('f_' + k);
    if(el) shared[k] = el.checked ? 'true' : 'false';
  });

  document.querySelectorAll('input[name="music_mode"]').forEach(r => {
    if(r.checked) shared.music_mode = r.value;
  });
  if(!shared.music_mode) shared.music_mode = 'both';

  for(let i = 1; i <= 5; i++){
    const on = $('f_song' + i + '_on');
    const url = $('f_song' + i + '_url');
    const wh = $('f_song' + i + '_where');
    shared['song' + i + '_on'] = on && on.checked ? 'true' : 'false';
    shared['song' + i + '_url'] = url ? url.value : '';
    shared['song' + i + '_where'] = wh ? wh.value : 'both';
  }

  shared.vol_card = ($('f_vol_card') || {}).value || '0.45';
  shared.vol_slide = ($('f_vol_slide') || {}).value || '0.85';
  shared.vol_video = ($('f_vol_video') || {}).value || '1.0';
  shared.vol_video_music = ($('f_vol_video_music') || {}).value || '0.35';
  shared.photoDurationSec = ($('f_photoDurationSec') || {}).value || '5';
  shared.effectsIntensity = ($('f_effectsIntensity') || {}).value || '1';
  shared.floaterDensity = ($('f_floaterDensity') || {}).value || '1';
  shared.pinSlideDuration = ($('f_pinSlideDuration') || {}).value || '4';
  shared.pinSlideDefaultSec = ($('f_pinSlideDefaultSec') || {}).value || '10';
  shared.storySlideDuration = ($('f_storySlideDuration') || {}).value || '10';
  shared.storySlideDefaultSec = ($('f_storySlideDefaultSec') || {}).value || '10';
  /* V3 palette collect */
  { const palOn=$('f_paletteOn'),palA=$('f_paletteA'),palB=$('f_paletteB');
    if(palOn&&palA&&palB){ shared.palette = palOn.checked?'true':'false';
      shared.paletteA = palOn.checked?palA.value:''; shared.paletteB = palOn.checked?palB.value:''; } }

  COUNTERS.forEach(c => {
    shared[c.labelKey] = ADM.counters[c.labelKey] !== undefined ? ADM.counters[c.labelKey] : '';
    shared[c.dtKey]    = ADM.counters[c.dtKey] || '';
    shared[c.tzKey]    = ADM.counters[c.tzKey] || DEFAULT_TZ;
    shared[c.dispKey]  = ADM.counters[c.dispKey] || '';
    shared[c.showKey]  = ADM.counters[c.showKey] !== undefined ? ADM.counters[c.showKey] : 'true';
  });

  const unlockEl = $('f_unlockDateISO');
  const unlockTzEl = $('f_unlockDateISO_tz');
  if(unlockEl && unlockEl.value){
    shared.unlockDateISO = zonedToUTC(unlockEl.value, unlockTzEl ? unlockTzEl.value : DEFAULT_TZ);
    shared.unlockDateISO_tz = unlockTzEl ? unlockTzEl.value : DEFAULT_TZ;
  } else {
    shared.unlockDateISO = '';
    shared.unlockDateISO_tz = unlockTzEl ? unlockTzEl.value : DEFAULT_TZ;
  }

  const texts = textsByLang[(shared.defaultLang || 'en').toLowerCase()] || textsByLang.en;

  return {
    texts,
    textsByLang,
    shared,
    gifts:  JSON.parse(JSON.stringify(ADM.gifts || [])),
    story:  JSON.parse(JSON.stringify(ADM.story || [])),
    events: JSON.parse(JSON.stringify(ADM.events || [])),
    voice:  JSON.parse(JSON.stringify(ADM.voice || [])),
    video:  JSON.parse(JSON.stringify(ADM.video || [])),
    pins:   JSON.parse(JSON.stringify(ADM.pins || [])),
    media:  JSON.parse(JSON.stringify(ADM.media || []))
  };
}

/* FAST PREVIEW — no DB calls at all */
function previewUnsavedAdmin(){
  const pid = ADM.editingPersonId;
  if(!pid){ __showToast('❌ No person selected', false); return; }

  const person = buildPreviewPersonFromADM(pid);
  if(!person){ __showToast('❌ Person not found', false); return; }

  // Push ADM into S.CURR (in-memory)
  const curr = buildPreviewCURR();

  S.CURRENT_PERSON = person;
  S.PREVIEW_MODE = true;
  S.ADMIN_MODE = true;
  S.CURRENT_SETTINGS = {};
  S.CURR = Object.assign({
    texts: {},
    textsByLang: {en:{}, gu:{}, hi:{}},
    shared: {},
    gifts: [], story: [], events: [], voice: [], video: [], pins: [], media: []
  }, curr);

  // language
  const def = (S.CURR.shared.defaultLang || 'en').toLowerCase();
  S.CURR_LANG = (['en','gu','hi'].indexOf(def) >= 0) ? def : 'en';
  S.CURR.texts = S.CURR.textsByLang[S.CURR_LANG] || {};

  // Show viewer — no DB fetch because S.CURR is already filled
  hide($('adminPanel'));
  $('homeScreen').classList.add('hidden');
  show($('viewerScreen'));

  const previewTag = $('viewerPreviewTag');
  if(previewTag) previewTag.style.display = 'inline-block';
  const editBtn = $('viewerEditCardBtn');
  if(editBtn) editBtn.classList.remove('visible');
  const mt = $('musicToggle');
  if(mt) mt.classList.toggle('visible', window.buildPlaylistFor('card').length > 0);
  const lt = $('langToggle');
  if(lt){
    lt.classList.add('visible');
    lt.textContent = S.CURR_LANG === 'en' ? 'EN' : (S.CURR_LANG === 'gu' ? 'ગુ' : 'हि');
    lt.dataset.state = S.CURR_LANG;
  }

  const seenPill = $('viewerSeenPill');
  if(seenPill) seenPill.style.display = 'none';

  S.REACTIONS = {heart:0, love:0, cry:0, party:0};
  window.paintReactions();

  window.renderCardFull();
  window.startCard();
  window.scrollTo(0, 0);

  __showToast('👁️ Preview (unsaved)');
}
window.previewUnsavedAdmin = previewUnsavedAdmin;

async function saveAdminFull(preview, doReload){
  const pid = ADM.editingPersonId;
  if(!pid){ __showToast('❌ No person selected', false); return; }

  saveAdminTextsFromFields();

  const st = $('adminStatus');
  if(st){ st.textContent = '⏳ Saving…'; st.className = 'panel-status'; }

  const settings = {};
  ['en','gu','hi'].forEach(L => {
    const tl = ADM.texts[L] || {};
    TEXT_FIELDS.forEach(f => { settings['texts__' + L + '_' + f] = tl[f] !== undefined ? tl[f] : ''; });
  });

  const shared = {};
  shared.theme = ADM.theme || 'romantic';
  shared.defaultLang = ($('f_defaultLang') || {}).value || 'en';

  ['enableFireworks','enableGiftBox','enableVoiceMsg','enableVideoMsg',
   'enableEventCount','enableStory','enableMap','enableUpload','showLockScreen',
   'musicDuringVideo','shuffleMusicOn','shuffleMediaOn',
   'slideEffectsEnabled','floatersEnabled','pinSlideshowEnabled','storySlideshowEnabled'].forEach(k => {
    const el = $('f_' + k);
    if(el) shared[k] = el.checked ? 'true' : 'false';
  });

  document.querySelectorAll('input[name="music_mode"]').forEach(r => {
    if(r.checked) shared.music_mode = r.value;
  });
  if(!shared.music_mode) shared.music_mode = 'both';

  for(let i = 1; i <= 5; i++){
    const on = $('f_song' + i + '_on');
    const url = $('f_song' + i + '_url');
    const wh = $('f_song' + i + '_where');
    shared['song' + i + '_on'] = on && on.checked ? 'true' : 'false';
    shared['song' + i + '_url'] = url ? url.value : '';
    shared['song' + i + '_where'] = wh ? wh.value : 'both';
  }

  shared.vol_card = ($('f_vol_card') || {}).value || '0.45';
  shared.vol_slide = ($('f_vol_slide') || {}).value || '0.85';
  shared.vol_video = ($('f_vol_video') || {}).value || '1.0';
  shared.vol_video_music = ($('f_vol_video_music') || {}).value || '0.35';

  shared.photoDurationSec = ($('f_photoDurationSec') || {}).value || '5';
  shared.effectsIntensity = ($('f_effectsIntensity') || {}).value || '1';
  shared.floaterDensity = ($('f_floaterDensity') || {}).value || '1';
  shared.pinSlideDuration = ($('f_pinSlideDuration') || {}).value || '4';
  shared.pinSlideDefaultSec = ($('f_pinSlideDefaultSec') || {}).value || '10';
  shared.storySlideDuration = ($('f_storySlideDuration') || {}).value || '10';
  shared.storySlideDefaultSec = ($('f_storySlideDefaultSec') || {}).value || '10';
  /* V3 palette collect */
  { const palOn=$('f_paletteOn'),palA=$('f_paletteA'),palB=$('f_paletteB');
    if(palOn&&palA&&palB){ shared.palette = palOn.checked?'true':'false';
      shared.paletteA = palOn.checked?palA.value:''; shared.paletteB = palOn.checked?palB.value:''; } }

  shared.adminPassword = ($('f_adminPassword') || {}).value || FALLBACK_ADMIN_PW;
  const adminLogin = $('f_adminLoginEnabled');
  shared.adminLoginEnabled = adminLogin && adminLogin.checked ? 'true' : 'false';

  COUNTERS.forEach(c => {
    shared[c.labelKey] = ADM.counters[c.labelKey] !== undefined ? ADM.counters[c.labelKey] : '';
    shared[c.dtKey]    = ADM.counters[c.dtKey] || '';
    shared[c.tzKey]    = ADM.counters[c.tzKey] || DEFAULT_TZ;
    shared[c.dispKey]  = ADM.counters[c.dispKey] || '';
    shared[c.showKey]  = ADM.counters[c.showKey] !== undefined ? ADM.counters[c.showKey] : 'true';
  });

  const unlockEl = $('f_unlockDateISO');
  const unlockTzEl = $('f_unlockDateISO_tz');
  if(unlockEl && unlockEl.value){
    shared.unlockDateISO = zonedToUTC(unlockEl.value, unlockTzEl ? unlockTzEl.value : DEFAULT_TZ);
    shared.unlockDateISO_tz = unlockTzEl ? unlockTzEl.value : DEFAULT_TZ;
  } else {
    shared.unlockDateISO = '';
    shared.unlockDateISO_tz = unlockTzEl ? unlockTzEl.value : DEFAULT_TZ;
  }

  const expEl = $('f_hardExpiryISO');
  const expTzEl = $('f_hardExpiryISO_tz');
  if(expEl && expEl.value){
    shared.hardExpiryISO = zonedToUTC(expEl.value, expTzEl ? expTzEl.value : DEFAULT_TZ);
    shared.hardExpiryISO_tz = expTzEl ? expTzEl.value : DEFAULT_TZ;
  } else {
    shared.hardExpiryISO = '';
    shared.hardExpiryISO_tz = expTzEl ? expTzEl.value : DEFAULT_TZ;
  }

  Object.keys(shared).forEach(k => { settings['shared__' + k] = shared[k]; });

  if(shared.shuffleMusicOn === 'true'){
    const songs = [];
    for(let i = 1; i <= 5; i++){
      if(shared['song' + i + '_on'] === 'true' && shared['song' + i + '_url']) songs.push(i - 1);
    }
    settings['shared__musicOrder'] = shuffleArray(songs).join(',');
  }
  if(shared.shuffleMediaOn === 'true'){
    const idxs = (ADM.media || []).map((_, i) => i);
    settings['shared__mediaOrder'] = shuffleArray(idxs).join(',');
  }

  try{
    // Fire settings save and all table wipes in parallel
    const saveSettingsP = sb.upSet(settings, pid);

    const wi = async (table, rows) => {
      await sb.wipe(table, pid);
      const clean = (rows || []).filter(r => r);
      if(clean.length) await sb.insBatch(table, clean);
    };

    const tablesP = Promise.all([
      wi(T_GIFTS, (ADM.gifts || [])
        .filter(g => g.title || g.message || g.photo_drive_id)
        .map(g => ({person_id: pid, emoji: g.emoji || '🎁', title: g.title || '', message: g.message || '', photo_drive_id: g.photo_drive_id || ''}))),

      wi(T_STORY, (ADM.story || [])
        .filter(s => s.title || s.body)
        .map(s => ({person_id: pid, title: s.title || '', body: s.body || '', photo_drive_id: s.photo_drive_id || ''}))),

      wi(T_EVENTS, (ADM.events || [])
        .filter(e => e.label || e.target_iso)
        .map(e => ({person_id: pid, icon: e.icon || '📅', label: e.label || '', target_iso: e.target_iso || ''}))),

      wi(T_VOICE, (ADM.voice || [])
        .filter(v => v.audio_url)
        .map(v => ({person_id: pid, title: v.title || '', audio_url: v.audio_url || ''}))),

      wi(T_VIDEO, (ADM.video || [])
        .filter(v => v.video_url)
        .map(v => ({person_id: pid, title: v.title || '', video_url: v.video_url || ''}))),

      wi(T_PINS, (ADM.pins || [])
        .filter(p => p.lat && p.lng)
        .map(p => ({person_id: pid, label: p.label || '', lat: p.lat, lng: p.lng, photo_drive_id: p.photo_drive_id || '', story: p.story || ''}))),

      wi(T_MEDIA, dedupeMedia((ADM.media || []).filter(m => m.drive_id || m.src))
        .map(m => ({person_id: pid, type: m.type || 'photo', drive_id: m.drive_id || '', src: m.src || '', title: m.title || '', sort_order: 0})))
    ]);

    await Promise.all([saveSettingsP, tablesP]);

    // Invalidate cache so next load gets fresh
    invalidateCache(pid);

    if(st){ st.textContent = '✅ Saved!'; st.className = 'panel-status ok'; }
    __showToast('💾 Saved');

    S.PEOPLE = await sb.people() || [];
    if(window.buildHome) window.buildHome();

    if(preview && doReload){
      const person = S.PEOPLE.find(p => p.id === pid);
      if(person){
        S.CURRENT_PERSON = person;
        S.PREVIEW_MODE = true;
        await window.__loadPersonIntoState__(person);
        hide($('adminPanel'));
        $('homeScreen').classList.add('hidden');
        await window.showViewerFor(person, true);
      }
    }
  }catch(e){
    if(st){ st.textContent = '❌ ' + e.message; st.className = 'panel-status err'; }
    __showToast('❌ Save failed', false);
  }
}

/* ============================================================
   BACKUP / IMPORT (unchanged from previous version)
   ============================================================ */
function bindAdminBackup(){
  const exp = $('adminExportBtn');
  if(exp && exp.dataset._bound !== '1'){
    exp.dataset._bound = '1';
    exp.onclick = exportAllBackup;
  }
  const imp = $('adminImportBtn');
  if(imp && imp.dataset._bound !== '1'){
    imp.dataset._bound = '1';
    imp.onclick = () => $('adminExcelInput').click();
  }
  const fileInput = $('adminExcelInput');
  if(fileInput && fileInput.dataset._bound !== '1'){
    fileInput.dataset._bound = '1';
    fileInput.onchange = importAllBackup;
  }
}

function addSheet(wb, name, rows){
  if(!rows || !rows.length) rows = [{}];
  try{
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  }catch(e){ console.warn('addSheet', name, e.message); }
}

async function exportAllBackup(){
  const st = $('adminDataStatus');
  if(st){ st.textContent = '⏳ Building complete backup…'; st.className = 'panel-status'; }
  try{
    if(!window.XLSX) throw new Error('XLSX not loaded');
    const wb = XLSX.utils.book_new();

    const peopleRows = S.PEOPLE.map(p => ({
      id: p.id,
      slug: p.slug,
      display_name: p.display_name,
      birthday: p.birthday,
      password: p.password,
      enabled: p.enabled,
      sort_order: p.sort_order,
      requester_name: p.requester_name || '',
      requester_whatsapp: p.requester_whatsapp || '',
      wipe_iso: p.wipe_iso || ''
    }));
    addSheet(wb, 'people', peopleRows);

    const globalSet = await sb.getSet(null);
    const globalRows = Object.keys(globalSet).map(k => ({key: k, value: globalSet[k]}));
    addSheet(wb, 'global_settings', globalRows);

    for(const p of S.PEOPLE){
      const slug = (p.slug || ('p' + p.id)).slice(0, 20);
      const set = await sb.getSet(p.id);
      const setRows = Object.keys(set).map(k => ({key: k, value: set[k]}));
      addSheet(wb, ('s_' + slug), setRows);

      const gifts = await sb.rows(T_GIFTS, p.id) || [];
      addSheet(wb, ('g_' + slug), gifts.map(r => ({
        emoji: r.emoji || '', title: r.title || '', message: r.message || '',
        photo_drive_id: r.photo_drive_id || ''
      })));

      const story = await sb.rows(T_STORY, p.id) || [];
      addSheet(wb, ('st_' + slug), story.map(r => ({
        title: r.title || '', body: r.body || '', photo_drive_id: r.photo_drive_id || ''
      })));

      const events = await sb.rows(T_EVENTS, p.id) || [];
      addSheet(wb, ('ev_' + slug), events.map(r => ({
        icon: r.icon || '', label: r.label || '', target_iso: r.target_iso || ''
      })));

      const voice = await sb.rows(T_VOICE, p.id) || [];
      addSheet(wb, ('vo_' + slug), voice.map(r => ({
        title: r.title || '', audio_url: r.audio_url || ''
      })));

      const video = await sb.rows(T_VIDEO, p.id) || [];
      addSheet(wb, ('vd_' + slug), video.map(r => ({
        title: r.title || '', video_url: r.video_url || ''
      })));

      const pins = await sb.rows(T_PINS, p.id) || [];
      addSheet(wb, ('pn_' + slug), pins.map(r => ({
        label: r.label || '', lat: r.lat || '', lng: r.lng || '',
        photo_drive_id: r.photo_drive_id || '', story: r.story || ''
      })));

      const media = await sb.rows(T_MEDIA, p.id) || [];
      addSheet(wb, ('md_' + slug), media.map(r => ({
        type: r.type || 'photo',
        drive_id: r.drive_id || '',
        src: r.src || '',
        title: r.title || '',
        sort_order: r.sort_order || 0
      })));
    }

    const reviews = await sb.reviews();
    addSheet(wb, 'reviews', reviews.map(r => ({
      id: r.id,
      person_id: r.person_id, person_slug: r.person_slug, person_name: r.person_name,
      requester_name: r.requester_name, requester_wa: r.requester_wa,
      stars: r.stars, message: r.message, email: r.email,
      created_at: r.created_at
    })));

    let guestRows = [];
    try{
      const guests = await sb.guests();
      guestRows = (guests || []).map(g => ({
        id: g.id,
        guest_name: g.guest_name || '',
        guest_relation: g.guest_relation || '',
        guest_whatsapp: g.guest_whatsapp || '',
        target_person_slug: g.target_person_slug || '',
        status: g.status || '',
        approved_person_id: g.approved_person_id || '',
        approved_login_id: g.approved_login_id || '',
        approved_password: g.approved_password || '',
        approved_share_link: g.approved_share_link || '',
        created_at: g.created_at || '',
        approved_at: g.approved_at || '',
        payload_json: JSON.stringify(g.payload || {})
      }));
    }catch(e){ console.warn('guests export', e.message); }
    addSheet(wb, 'guest_submissions', guestRows);

    let uploadRows = [];
    try{
      const ups = await sb.rows(T_UPLOADS, null);
      uploadRows = (ups || []).map(u => ({
        id: u.id,
        person_id: u.person_id || '',
        uploader_name: u.uploader_name || '',
        drive_id: u.drive_id || '',
        message: u.message || '',
        status: u.status || '',
        created_at: u.created_at || ''
      }));
    }catch(e){ console.warn('uploads export', e.message); }
    addSheet(wb, 'uploads', uploadRows);

    addSheet(wb, 'SUMMARY', [
      {k: 'Exported at', v: new Date().toISOString()},
      {k: 'People count', v: S.PEOPLE.length},
      {k: 'Reviews count', v: (reviews || []).length},
      {k: 'Guest submissions', v: guestRows.length},
      {k: 'Uploads', v: uploadRows.length},
      {k: 'Version', v: 'Full Backup v3'}
    ]);

    XLSX.writeFile(wb, 'surprise-full-backup-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    if(st){ st.textContent = '✅ Full backup exported (' + (wb.SheetNames.length) + ' sheets)'; st.className = 'panel-status ok'; }
    __showToast('📤 Full backup downloaded');
  }catch(e){
    console.error(e);
    if(st){ st.textContent = '❌ ' + e.message; st.className = 'panel-status err'; }
    __showToast('❌ Export failed', false);
  }
}

async function importAllBackup(e){
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const st = $('adminDataStatus');
  if(st){ st.textContent = '⏳ Reading full backup…'; st.className = 'panel-status'; }
  try{
    if(!window.XLSX) throw new Error('XLSX not loaded');
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, {type: 'array'});

    const readSheet = name => wb.Sheets[name]
      ? XLSX.utils.sheet_to_json(wb.Sheets[name], {defval: ''})
      : [];

    const peopleSheet = wb.Sheets['people'];
    if(!peopleSheet) throw new Error('No "people" sheet in the file');
    const peopleRows = readSheet('people').filter(r => r.slug);
    let okCount = 0;
    const slugToId = {};

    for(const r of peopleRows){
      const existing = S.PEOPLE.find(p => p.slug === r.slug);
      const patch = {
        display_name: r.display_name || r.slug,
        birthday: r.birthday || null,
        password: r.password || '',
        enabled: r.enabled !== false && String(r.enabled).toLowerCase() !== 'false',
        sort_order: parseInt(r.sort_order, 10) || 0,
        requester_name: r.requester_name || '',
        requester_whatsapp: r.requester_whatsapp || '',
        wipe_iso: r.wipe_iso || null
      };
      let pid;
      if(existing){
        await sb.updPerson(existing.id, patch);
        pid = existing.id;
      } else {
        patch.slug = r.slug;
        const res = await sb.insPerson(patch);
        pid = res && res[0] && res[0].id;
      }
      if(pid) slugToId[r.slug] = pid;
      okCount++;
    }

    const gsRows = readSheet('global_settings').filter(r => r.key);
    if(gsRows.length){
      const obj = {};
      gsRows.forEach(r => { obj[String(r.key)] = String(r.value == null ? '' : r.value); });
      try{
        await fetch(`${SUPABASE_URL}/rest/v1/${T_SETTINGS}?person_id=is.null`, {
          method: 'DELETE',
          headers: sb.hd(),
          cache: 'no-store'
        });
      }catch(e){ console.warn('global settings wipe', e.message); }
      await sb.upSet(obj, null);
    }

    for(const r of peopleRows){
      const slug = String(r.slug).slice(0, 20);
      const pid = slugToId[r.slug];
      if(!pid) continue;

      const sRows = readSheet('s_' + slug).filter(x => x.key);
      if(wb.Sheets['s_' + slug]){
        const obj = {};
        sRows.forEach(x => { obj[String(x.key)] = String(x.value == null ? '' : x.value); });
        try{
          await fetch(`${SUPABASE_URL}/rest/v1/${T_SETTINGS}?person_id=eq.${pid}`, {
            method: 'DELETE',
            headers: sb.hd(),
            cache: 'no-store'
          });
        }catch(e){ console.warn('settings wipe', pid, e.message); }
        if(Object.keys(obj).length) await sb.upSet(obj, pid);
      }

      if(wb.Sheets['g_' + slug] !== undefined){
        const gRows = readSheet('g_' + slug)
          .filter(x => x.title || x.message || x.photo_drive_id)
          .map(x => ({
            person_id: pid,
            emoji: x.emoji || '🎁',
            title: x.title || '',
            message: x.message || '',
            photo_drive_id: x.photo_drive_id || ''
          }));
        await sb.wipe(T_GIFTS, pid);
        if(gRows.length) await sb.insBatch(T_GIFTS, gRows);
      }

      if(wb.Sheets['st_' + slug] !== undefined){
        const stRows = readSheet('st_' + slug)
          .filter(x => x.title || x.body)
          .map(x => ({
            person_id: pid,
            title: x.title || '',
            body: x.body || '',
            photo_drive_id: x.photo_drive_id || ''
          }));
        await sb.wipe(T_STORY, pid);
        if(stRows.length) await sb.insBatch(T_STORY, stRows);
      }

      if(wb.Sheets['ev_' + slug] !== undefined){
        const evRows = readSheet('ev_' + slug)
          .filter(x => x.label || x.target_iso)
          .map(x => ({
            person_id: pid,
            icon: x.icon || '📅',
            label: x.label || '',
            target_iso: x.target_iso || ''
          }));
        await sb.wipe(T_EVENTS, pid);
        if(evRows.length) await sb.insBatch(T_EVENTS, evRows);
      }

      if(wb.Sheets['vo_' + slug] !== undefined){
        const voRows = readSheet('vo_' + slug)
          .filter(x => x.audio_url)
          .map(x => ({
            person_id: pid,
            title: x.title || '',
            audio_url: x.audio_url || ''
          }));
        await sb.wipe(T_VOICE, pid);
        if(voRows.length) await sb.insBatch(T_VOICE, voRows);
      }

      if(wb.Sheets['vd_' + slug] !== undefined){
        const vdRows = readSheet('vd_' + slug)
          .filter(x => x.video_url)
          .map(x => ({
            person_id: pid,
            title: x.title || '',
            video_url: x.video_url || ''
          }));
        await sb.wipe(T_VIDEO, pid);
        if(vdRows.length) await sb.insBatch(T_VIDEO, vdRows);
      }

      if(wb.Sheets['pn_' + slug] !== undefined){
        const pnRows = readSheet('pn_' + slug)
          .filter(x => x.lat && x.lng)
          .map(x => ({
            person_id: pid,
            label: x.label || '',
            lat: x.lat,
            lng: x.lng,
            photo_drive_id: x.photo_drive_id || '',
            story: x.story || ''
          }));
        await sb.wipe(T_PINS, pid);
        if(pnRows.length) await sb.insBatch(T_PINS, pnRows);
      }

      if(wb.Sheets['md_' + slug] !== undefined){
        const mdRows = readSheet('md_' + slug).filter(x => x.drive_id || x.src);
        const clean = dedupeMedia(mdRows.map(x => ({
          type: x.type || 'photo',
          drive_id: x.drive_id || '',
          src: x.src || '',
          title: x.title || ''
        })));
        const insertRows = clean.map(x => ({
          person_id: pid,
          type: x.type || 'photo',
          drive_id: x.drive_id || '',
          src: x.src || '',
          title: x.title || '',
          sort_order: 0
        }));
        await sb.wipe(T_MEDIA, pid);
        if(insertRows.length) await sb.insBatch(T_MEDIA, insertRows);
      }
    }

    if(wb.Sheets['reviews'] !== undefined){
      try{ await sb.wipeAll(T_REVIEWS); }catch(e){}
      const revRows = readSheet('reviews').filter(x => x.message);
      for(const r of revRows){
        const row = {
          person_id: r.person_id || null,
          person_slug: r.person_slug || '',
          person_name: r.person_name || '',
          requester_name: r.requester_name || '',
          requester_wa: r.requester_wa || '',
          stars: parseInt(r.stars, 10) || 5,
          message: r.message || '',
          email: r.email || null
        };
        try{ await sb.insBatch(T_REVIEWS, [row]); }catch(e){}
      }
    }

    if(wb.Sheets['guest_submissions'] !== undefined){
      try{ await sb.wipeAll(T_GUEST); }catch(e){}
      const guestRows = readSheet('guest_submissions').filter(x => x.guest_name || x.target_person_slug);
      for(const g of guestRows){
        let payload = {};
        try{ payload = g.payload_json ? JSON.parse(g.payload_json) : {}; }catch(e){}
        const row = {
          guest_name: g.guest_name || '',
          guest_relation: g.guest_relation || '',
          guest_whatsapp: g.guest_whatsapp || '',
          target_person_slug: g.target_person_slug || '',
          status: g.status || 'pending',
          approved_person_id: g.approved_person_id || null,
          approved_login_id: g.approved_login_id || '',
          approved_password: g.approved_password || '',
          approved_share_link: g.approved_share_link || '',
          payload
        };
        try{ await sb.insGuest(row); }catch(e){}
      }
    }

    if(wb.Sheets['uploads'] !== undefined){
      try{ await sb.wipeAll(T_UPLOADS); }catch(e){}
      const uploadRows = readSheet('uploads').filter(x => x.drive_id);
      if(uploadRows.length){
        const rows = uploadRows.map(u => ({
          person_id: u.person_id || null,
          uploader_name: u.uploader_name || '',
          drive_id: u.drive_id || '',
          message: u.message || '',
          status: u.status || 'pending'
        }));
        try{ await sb.insBatch(T_UPLOADS, rows); }catch(e){}
      }
    }

    invalidateCache();
    if(st){ st.textContent = '✅ Imported ' + okCount + ' people & all their data (replaced)'; st.className = 'panel-status ok'; }
    __showToast('📥 Full backup restored (replaced)');
    S.PEOPLE = await sb.people() || [];
    if(window.buildHome) window.buildHome();
  }catch(err){
    console.error(err);
    if(st){ st.textContent = '❌ ' + err.message; st.className = 'panel-status err'; }
    __showToast('❌ Import failed', false);
  }finally{ e.target.value = ''; }
}

/* ============================================================
   SECURITY
   ============================================================ */
function bindAdminSecurity(){
  const el = $('f_adminLoginEnabled');
  if(el && el.dataset._bound !== '1'){
    el.dataset._bound = '1';
    el.onchange = () => {
      ADM.shared.adminLoginEnabled = el.checked ? 'true' : 'false';
    };
  }
}

function bindAdminGuestActions(){
  const r1 = $('refreshGuests');
  if(r1 && r1.dataset._bound !== '1'){
    r1.dataset._bound = '1';
    r1.onclick = () => window.loadGuestApprovals && window.loadGuestApprovals();
  }
  const r2 = $('refreshGuestHistory');
  if(r2 && r2.dataset._bound !== '1'){
    r2.dataset._bound = '1';
    r2.onclick = () => window.loadGuestHistory && window.loadGuestHistory();
  }
  const r3 = $('adminRefreshReviews');
  if(r3 && r3.dataset._bound !== '1'){
    r3.dataset._bound = '1';
    r3.onclick = async () => {
      await window.loadReviews();
      renderAdminReviews();
    };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const guestsTab = document.querySelector('#adminPanel .panel-tab[data-pane="pane-guests"]');
  if(guestsTab){
    guestsTab.addEventListener('click', () => {
      if(window.loadGuestApprovals) window.loadGuestApprovals();
      if(window.loadGuestHistory) window.loadGuestHistory();
    });
  }
});

})();