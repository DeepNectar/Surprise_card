/* ============================================================
   guests.js — Guest panel, guest edit, approval workflow,
                share modal, Excel template with src support
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

/* Guest-side editor state */
const GUEST = {
  gifts: [], story: [], events: [], voice: [], video: [], pins: [], media: [],
  theme: '',
  counters: {}
};

/* ============================================================
   GE (Guest Edit) — approval-side editor
   ============================================================ */
function geSetLangActive(lang){
  GE.lang = lang;
  document.querySelectorAll('#geLangTabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.geLang === lang)
  );
  applyGETextsToFields(lang);
}

function applyGETextsToFields(lang){
  const src = (GE.texts && GE.texts[lang]) || {};
  document.querySelectorAll('#geTextFields [data-ge-text]').forEach(el => {
    const k = el.dataset.geText;
    if(!k) return;
    el.value = src[k] !== undefined ? src[k] : '';
  });
}

function saveGETextsFromFields(){
  GE.texts = GE.texts || {en:{}, gu:{}, hi:{}};
  GE.texts[GE.lang] = GE.texts[GE.lang] || {};
  document.querySelectorAll('#geTextFields [data-ge-text]').forEach(el => {
    const k = el.dataset.geText;
    if(!k) return;
    GE.texts[GE.lang][k] = el.value;
  });
}

function buildGETextFields(){
  const w = $('geTextFields');
  if(!w) return;
  if(w.dataset.built === '1') return;
  w.dataset.built = '1';

  const groups = [
    {title: '💌 Main Card Text', fields: [
      'pageTitle','mainHeadline','subhead1','subhead2','greeting',
      'msg1','msg2','msg3','msg4','msg5','signoff','namesBadge','fromLabel',
      'countersTitle','ct1_label','ct2_label','ct3_label',
      'openMemoriesBtn','storyBtnText','mapBtnText','uploadBtnText',
      'voiceBtnText','videoBtnText','giftSectionTitle','eventSectionTitle'
    ]},
    {title: '🎂 Opening / Cake / Lock', fields: [
      'openLine1','openLine2','cakeHint','lockTitle','lockSubtitle','lockDateText',
      'countdownLabel','daysLabel','hoursLabel','minsLabel','secsLabel',
      'openEarlyText','pwError','pwLockedMsg'
    ]},
    {title: '💖 Closing Modal', fields: [
      'closeTitle','close1','close2','close3','close4','closeSignoff','closeBtn'
    ]}
  ];
  const longFields = new Set(['msg1','msg2','msg3','msg4','msg5','close1','close2','close3','close4']);

  let html = '';
  groups.forEach(g => {
    html += '<div style="margin-bottom:1rem;"><div class="panel-section-title" style="color:var(--c-primary);">' + g.title + '</div>';
    g.fields.forEach(f => {
      const isLong = longFields.has(f);
      html += '<div class="panel-field"><label class="panel-label">' + f + '</label>' +
        (isLong
          ? '<textarea class="panel-textarea" data-ge-text="' + f + '"></textarea>'
          : '<input type="text" class="panel-input" data-ge-text="' + f + '">') +
        '</div>';
    });
    html += '</div>';
  });
  w.innerHTML = html;
}

/* ---------- Guest Edit repeaters ---------- */
function renderGEGifts(){
  const w = $('geGiftsRepeater');
  if(!w) return;
  w.innerHTML = '';
  GE.gifts.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Emoji</label><input type="text" class="panel-input" data-gf="emoji" data-i="' + i + '" value="' + escAttr(g.emoji || '🎁') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gf="title" data-i="' + i + '" value="' + escAttr(g.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Message</label><textarea class="panel-textarea" data-gf="message" data-i="' + i + '">' + esc(g.message || '') + '</textarea></div>' +
      '<div class="panel-field"><label class="panel-label">Photo Drive IDs (comma-separate)</label><input type="text" class="panel-input" data-gf="photo_drive_id" data-i="' + i + '" value="' + escAttr(g.photo_drive_id || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { GE.gifts[+el.dataset.i][el.dataset.gf] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GE.gifts.splice(+b.dataset.i, 1); renderGEGifts(); };
  });
}

function renderGEStory(){
  const w = $('geStoryRepeater');
  if(!w) return;
  w.innerHTML = '';
  GE.story.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gs="title" data-i="' + i + '" value="' + escAttr(s.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Body</label><textarea class="panel-textarea" data-gs="body" data-i="' + i + '">' + esc(s.body || '') + '</textarea></div>' +
      '<div class="panel-field"><label class="panel-label">Photo Drive IDs (comma-separate)</label><input type="text" class="panel-input" data-gs="photo_drive_id" data-i="' + i + '" value="' + escAttr(s.photo_drive_id || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { GE.story[+el.dataset.i][el.dataset.gs] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GE.story.splice(+b.dataset.i, 1); renderGEStory(); };
  });
}

function renderGEEvents(){
  const w = $('geEventsRepeater');
  if(!w) return;
  w.innerHTML = '';
  GE.events.forEach((ev, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    const tz = ev.target_iso_tz || DEFAULT_TZ;
    const local = ev.target_iso ? utcToZonedLocal(ev.target_iso, tz) : '';
    const tzOptsHtml = TZ_OPTIONS.map(o =>
      '<option value="' + o.v + '"' + (o.v === tz ? ' selected' : '') + '>' + o.l + '</option>'
    ).join('');
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Icon</label><input type="text" class="panel-input" data-ge2="icon" data-i="' + i + '" value="' + escAttr(ev.icon || '📅') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Label</label><input type="text" class="panel-input" data-ge2="label" data-i="' + i + '" value="' + escAttr(ev.label || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Target date &amp; time + timezone</label><div class="tz-row"><input type="datetime-local" class="panel-input" data-ge2="target_local" data-i="' + i + '" value="' + local + '"><select class="panel-select tz-select" data-ge2="target_tz" data-i="' + i + '">' + tzOptsHtml + '</select></div></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,select').forEach(el => {
    el.oninput = el.onchange = () => {
      const i = +el.dataset.i;
      if(el.dataset.ge2 === 'target_local'){
        const tzEl = w.querySelector('.tz-select[data-ge2="target_tz"][data-i="' + i + '"]');
        const tz = tzEl ? tzEl.value : DEFAULT_TZ;
        GE.events[i].target_iso = el.value ? zonedToUTC(el.value, tz) : '';
        GE.events[i].target_iso_tz = tz;
      } else if(el.dataset.ge2 === 'target_tz'){
        const dtEl = w.querySelector('input[data-ge2="target_local"][data-i="' + i + '"]');
        const tz = el.value;
        GE.events[i].target_iso_tz = tz;
        if(dtEl && dtEl.value) GE.events[i].target_iso = zonedToUTC(dtEl.value, tz);
      } else if(el.dataset.ge2){
        GE.events[i][el.dataset.ge2] = el.value;
      }
    };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GE.events.splice(+b.dataset.i, 1); renderGEEvents(); };
  });
}

function renderGEVoice(){
  const w = $('geVoiceRepeater');
  if(!w) return;
  w.innerHTML = '';
  GE.voice.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gv="title" data-i="' + i + '" value="' + escAttr(v.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Audio URL</label><input type="text" class="panel-input" data-gv="audio_url" data-i="' + i + '" value="' + escAttr(v.audio_url || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input').forEach(el => {
    el.oninput = () => { GE.voice[+el.dataset.i][el.dataset.gv] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GE.voice.splice(+b.dataset.i, 1); renderGEVoice(); };
  });
}

function renderGEVideo(){
  const w = $('geVideoRepeater');
  if(!w) return;
  w.innerHTML = '';
  GE.video.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gd="title" data-i="' + i + '" value="' + escAttr(v.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Video URL</label><input type="text" class="panel-input" data-gd="video_url" data-i="' + i + '" value="' + escAttr(v.video_url || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input').forEach(el => {
    el.oninput = () => { GE.video[+el.dataset.i][el.dataset.gd] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GE.video.splice(+b.dataset.i, 1); renderGEVideo(); };
  });
}

function renderGEPins(){
  const w = $('gePinsRepeater');
  if(!w) return;
  w.innerHTML = '';
  GE.pins.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Label</label><input type="text" class="panel-input" data-gp="label" data-i="' + i + '" value="' + escAttr(p.label || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Lat</label><input type="text" class="panel-input" data-gp="lat" data-i="' + i + '" value="' + escAttr(p.lat || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Lng</label><input type="text" class="panel-input" data-gp="lng" data-i="' + i + '" value="' + escAttr(p.lng || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Photo IDs (comma-separate)</label><input type="text" class="panel-input" data-gp="photo_drive_id" data-i="' + i + '" value="' + escAttr(p.photo_drive_id || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Story</label><textarea class="panel-textarea" data-gp="story" data-i="' + i + '">' + esc(p.story || '') + '</textarea></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { GE.pins[+el.dataset.i][el.dataset.gp] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GE.pins.splice(+b.dataset.i, 1); renderGEPins(); };
  });
}

function renderGEMedia(){
  const w = $('geMediaRepeater');
  if(!w) return;
  w.innerHTML = '';
  GE.media.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Type</label><select class="panel-select" data-gm="type" data-i="' + i + '"><option value="photo"' + (m.type === 'photo' ? ' selected' : '') + '>Photo</option><option value="video"' + (m.type === 'video' ? ' selected' : '') + '>Video</option></select></div>' +
      '<div class="panel-field"><label class="panel-label">Drive ID</label><input type="text" class="panel-input" data-gm="drive_id" data-i="' + i + '" value="' + escAttr(m.drive_id || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Direct URL</label><input type="text" class="panel-input" data-gm="src" data-i="' + i + '" value="' + escAttr(m.src || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gm="title" data-i="' + i + '" value="' + escAttr(m.title || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,select').forEach(el => {
    el.onchange = el.oninput = () => { GE.media[+el.dataset.i][el.dataset.gm] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GE.media.splice(+b.dataset.i, 1); renderGEMedia(); };
  });
}

function renderGETheme(){
  document.querySelectorAll('#geThemeGrid .theme-swatch').forEach(el =>
    el.classList.toggle('selected', el.dataset.geTheme === GE.theme)
  );
}

function renderGECounters(){
  [1,2,3].forEach(n => {
    const el = $('ge_ct' + n + '_show');
    if(el) el.checked = (String(GE.counters['ct' + n + '_show']) !== 'false');
  });
  document.querySelectorAll('#ge-pane-counters .ge-ctr-tz').forEach(el => {
    const key = el.dataset.gc;
    if(!key) return;
    fillTzSelect(el, GE.counters[key] || DEFAULT_TZ);
    el.value = GE.counters[key] || DEFAULT_TZ;
  });
  document.querySelectorAll('#ge-pane-counters .ge-ctr').forEach(el => {
    const key = el.dataset.gc;
    if(!key) return;
    if(key.endsWith('_datetime')){
      const tzKey = key + '_tz';
      const tz = GE.counters[tzKey] || DEFAULT_TZ;
      el.value = GE.counters[key] ? utcToZonedLocal(GE.counters[key], tz) : '';
    } else {
      el.value = GE.counters[key] !== undefined ? GE.counters[key] : '';
    }
  });
}

/* ---------- Open guest editor ---------- */
function openGuestEditor(guestRow){
  const pl = guestRow.payload || {};
  const prop = pl.person_proposal || {};
  const gi = pl.guest_info || {};

  GE.person = {
    display_name: String(prop.display_name || guestRow.target_person_slug || ''),
    slug: String(prop.slug || guestRow.target_person_slug || '').toLowerCase().replace(/[^a-z0-9\-_]/g, ''),
    birthday: String(prop.birthday || '').slice(0, 10)
  };
  GE.guest = {
    name: String(gi.name || guestRow.guest_name || ''),
    whatsapp: String(gi.whatsapp || guestRow.guest_whatsapp || ''),
    relation: String(gi.relation || guestRow.guest_relation || ''),
    occasion: String(gi.occasion || ''),
    note: String(gi.note || '')
  };
  GE.password = '';
  GE.theme = String(pl.theme || 'romantic');

  const gs = pl.shared || {};
  GE.counters = {};
  COUNTERS.forEach(c => {
    if(gs[c.labelKey] !== undefined) GE.counters[c.labelKey] = gs[c.labelKey];
    if(gs[c.dtKey] !== undefined) GE.counters[c.dtKey] = gs[c.dtKey];
    if(gs[c.tzKey] !== undefined) GE.counters[c.tzKey] = gs[c.tzKey];
    if(gs[c.dispKey] !== undefined) GE.counters[c.dispKey] = gs[c.dispKey];
    if(gs[c.showKey] !== undefined) GE.counters[c.showKey] = gs[c.showKey];
  });
  if(gs.unlockDateISO !== undefined) GE.counters.unlockDateISO = gs.unlockDateISO;
  if(gs.unlockDateISO_tz !== undefined) GE.counters.unlockDateISO_tz = gs.unlockDateISO_tz;

  GE.texts = {
    en: Object.assign({}, pl.texts_en || pl.texts || {}),
    gu: Object.assign({}, pl.texts_gu || {}),
    hi: Object.assign({}, pl.texts_hi || {})
  };

  GE.gifts = JSON.parse(JSON.stringify(pl.gifts || []));
  GE.story = JSON.parse(JSON.stringify(pl.story || []));
  GE.events = JSON.parse(JSON.stringify(pl.events || []));
  GE.voice = JSON.parse(JSON.stringify(pl.voice || []));
  GE.video = JSON.parse(JSON.stringify(pl.video || []));
  GE.pins = JSON.parse(JSON.stringify(pl.pins || []));

  const structMedia = (pl.media || []).filter(m => m && (m.drive_id || m.src));
  const flatMedia = String(pl.mediaIds || '')
    .split(',').map(x => x.trim()).filter(Boolean)
    .map(id => ({type:'photo', drive_id:id, src:'', title:''}));
  GE.media = dedupeMedia([...structMedia, ...flatMedia]);

  GE.guestRow = guestRow;

  document.querySelectorAll('#ge-pane-person .ge-person').forEach(el => {
    const k = el.dataset.gp;
    if(!k) return;
    el.value = GE.person[k] !== undefined ? GE.person[k] : '';
  });
  document.querySelectorAll('#ge-pane-person .ge-guest').forEach(el => {
    const k = el.dataset.gg;
    if(!k) return;
    el.value = GE.guest[k] !== undefined ? GE.guest[k] : '';
  });

  $('ge_password').value = '';
  $('ge_editpw_preview').value = makeRequesterEditPassword(
    GE.guest.name, GE.guest.whatsapp, GE.person.slug
  );

  buildGETextFields();
  geSetLangActive('en');
  renderGETheme();
  renderGECounters();
  renderGEGifts();
  renderGEStory();
  renderGEEvents();
  renderGEVoice();
  renderGEVideo();
  renderGEPins();
  renderGEMedia();
  $('ge_bulkMediaIds').value = '';

  document.querySelectorAll('#guestEditModal .panel-tab').forEach((t, i) =>
    t.classList.toggle('active', i === 0)
  );
  document.querySelectorAll('#guestEditModal .panel-pane').forEach((p, i) =>
    p.classList.toggle('active', i === 0)
  );

  txt($('guestEditSub'), 'Editing submission from ' + (GE.guest.name || 'guest') +
    (GE.guest.whatsapp ? (' (' + GE.guest.whatsapp + ')') : '') +
    ' — change anything before approving.');

  const st = $('geStatus');
  if(st){ st.textContent = ''; st.className = 'panel-status'; }
  show($('guestEditModal'));
}

function collectGE(){
  saveGETextsFromFields();
  document.querySelectorAll('#ge-pane-person .ge-person').forEach(el => {
    const k = el.dataset.gp;
    if(!k) return;
    GE.person[k] = el.value;
  });
  document.querySelectorAll('#ge-pane-person .ge-guest').forEach(el => {
    const k = el.dataset.gg;
    if(!k) return;
    GE.guest[k] = el.value;
  });
  GE.person.slug = String(GE.person.slug || '').toLowerCase().replace(/[^a-z0-9\-_]/g, '');
  GE.person.birthday = String(GE.person.birthday || '').slice(0, 10);
  GE.password = $('ge_password').value.trim();
  $('ge_editpw_preview').value = makeRequesterEditPassword(
    GE.guest.name, GE.guest.whatsapp, GE.person.slug
  );
}

function buildGEPayload(){
  const sharedOut = {};
  COUNTERS.forEach(c => {
    sharedOut[c.labelKey] = GE.counters[c.labelKey] !== undefined ? GE.counters[c.labelKey] : (GE.texts.en[c.labelKey] || '');
    sharedOut[c.dtKey] = GE.counters[c.dtKey] || '';
    sharedOut[c.tzKey] = GE.counters[c.tzKey] || DEFAULT_TZ;
    sharedOut[c.dispKey] = GE.counters[c.dispKey] || '';
    sharedOut[c.showKey] = GE.counters[c.showKey] !== undefined ? GE.counters[c.showKey] : 'true';
  });
  if(GE.counters.unlockDateISO !== undefined) sharedOut.unlockDateISO = GE.counters.unlockDateISO;
  if(GE.counters.unlockDateISO_tz !== undefined) sharedOut.unlockDateISO_tz = GE.counters.unlockDateISO_tz;

  return {
    person_proposal: {display_name: GE.person.display_name, slug: GE.person.slug, birthday: GE.person.birthday},
    guest_info: {name: GE.guest.name, relation: GE.guest.relation, occasion: GE.guest.occasion, note: GE.guest.note, whatsapp: GE.guest.whatsapp},
    texts_en: GE.texts.en || {},
    texts_gu: GE.texts.gu || {},
    texts_hi: GE.texts.hi || {},
    texts: GE.texts.en || {},
    shared: sharedOut,
    theme: GE.theme,
    gifts: GE.gifts,
    story: GE.story,
    events: GE.events,
    voice: GE.voice,
    video: GE.video,
    pins: GE.pins,
    media: dedupeMedia(GE.media || []),
    mediaIds: dedupeMedia(GE.media || []).map(m => m.drive_id).filter(Boolean).join(', ')
  };
}

/* ---------- Approve guest row ---------- */
window.approveGuestRow = async function(r, overridePassword, skipStatusUpdate){
  try{
    if(!r || typeof r !== 'object') return {ok:false, err:'No guest row provided'};
    const pl = r.payload || {};
    const prop = pl.person_proposal || {};
    const gi = pl.guest_info || {};

    const display_name = (prop.display_name || '').trim();
    let slug = (prop.slug || r.target_person_slug || '').trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '');
    const birthday = (prop.birthday || '').trim();

    if(!display_name || !slug) return {ok:false, err:'Missing name/slug'};

    const freshPeople = await sb.people() || [];
    if(freshPeople.find(p => p.slug === slug)){
      slug = slug + '-' + Math.floor(Math.random() * 1000);
    }

    let password = overridePassword;
    if(!password){
      const nm = (display_name || 'Friend').replace(/[^A-Za-z]/g, '').slice(0, 10) || 'Friend';
      let dd = '0000';
      if(birthday){
        const d = new Date(birthday);
        if(!isNaN(d.getTime())){
          dd = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
        }
      }
      const words = ['Sunshine','Rainbow','Blossom','Starlight','Rose','Lotus','Velvet','Amber','Crystal','Dream'];
      const wd = words[Math.floor(Math.random() * words.length)];
      password = nm.charAt(0).toUpperCase() + nm.slice(1).toLowerCase() + '-' + dd + '-' + wd;
    }

    const row = {
      slug,
      display_name,
      birthday: birthday || null,
      password,
      wipe_iso: null,
      enabled: true,
      sort_order: freshPeople.length,
      requester_name: (gi.name || r.guest_name || '').trim(),
      requester_whatsapp: (gi.whatsapp || r.guest_whatsapp || '').trim()
    };

    let newPersonId = null;
    try{
      const rr = await sb.insPerson(row);
      if(rr && rr[0] && rr[0].id) newPersonId = rr[0].id;
    }catch(e){
      delete row.wipe_iso;
      delete row.birthday;
      delete row.requester_name;
      delete row.requester_whatsapp;
      const rr = await sb.insPerson(row);
      if(rr && rr[0] && rr[0].id) newPersonId = rr[0].id;
    }
    if(!newPersonId) return {ok:false, err:'Could not create person'};

    const settings = {};
    const en = pl.texts_en || pl.texts || {};
    const gu = pl.texts_gu || {};
    const hi = pl.texts_hi || {};
    TEXT_FIELDS.forEach(f => {
      settings['texts__en_' + f] = en[f] !== undefined ? en[f] : '';
      settings['texts__gu_' + f] = gu[f] !== undefined ? gu[f] : '';
      settings['texts__hi_' + f] = hi[f] !== undefined ? hi[f] : '';
    });
    if(pl.theme) settings['shared__theme'] = pl.theme;
    settings['shared__defaultLang'] = 'en';
    settings['shared__enableStory'] = 'true';
    settings['shared__enableGiftBox'] = 'true';
    settings['shared__enableEventCount'] = 'true';
    settings['shared__enableVoiceMsg'] = 'true';
    settings['shared__enableVideoMsg'] = 'true';
    settings['shared__enableMap'] = 'true';

    const gs = pl.shared || {};
    COUNTERS.forEach(c => {
      if(gs[c.labelKey] !== undefined) settings['shared__' + c.labelKey] = gs[c.labelKey];
      if(gs[c.dtKey] !== undefined) settings['shared__' + c.dtKey] = gs[c.dtKey];
      if(gs[c.tzKey] !== undefined) settings['shared__' + c.tzKey] = gs[c.tzKey];
      if(gs[c.dispKey] !== undefined) settings['shared__' + c.dispKey] = gs[c.dispKey];
      if(gs[c.showKey] !== undefined) settings['shared__' + c.showKey] = gs[c.showKey];
    });
    if(gs.unlockDateISO !== undefined) settings['shared__unlockDateISO'] = gs.unlockDateISO;
    if(gs.unlockDateISO_tz !== undefined) settings['shared__unlockDateISO_tz'] = gs.unlockDateISO_tz;

    ['enableFireworks','enableUpload','showLockScreen','music_mode','vol_card','vol_slide','vol_video',
     'pinSlideshowEnabled','pinSlideDuration','pinSlideDefaultSec',
     'storySlideshowEnabled','storySlideDuration','storySlideDefaultSec',
     'photoDurationSec','shuffleMusicOn','shuffleMediaOn','musicOrder','mediaOrder',
     'slideEffectsEnabled','effectsIntensity','floatersEnabled','floaterDensity',
     'musicDuringVideo','vol_video_music',
     'song1_on','song1_url','song1_where','song2_on','song2_url','song2_where',
     'song3_on','song3_url','song3_where','song4_on','song4_url','song4_where',
     'song5_on','song5_url','song5_where'].forEach(k => {
      if(gs[k] !== undefined) settings['shared__' + k] = gs[k];
    });

    await sb.upSet(settings, newPersonId);

    const tasks = [];
    const giftRows = (pl.gifts || []).filter(g => g.title || g.message || g.photo_drive_id)
      .map(g => ({person_id: newPersonId, emoji: g.emoji || '🎁', title: g.title || '', message: g.message || '', photo_drive_id: g.photo_drive_id || ''}));
    if(giftRows.length) tasks.push(sb.insBatch(T_GIFTS, giftRows));

    const stRows = (pl.story || []).filter(s => s.title || s.body)
      .map(s => ({person_id: newPersonId, title: s.title || '', body: s.body || '', photo_drive_id: s.photo_drive_id || ''}));
    if(stRows.length) tasks.push(sb.insBatch(T_STORY, stRows));

    const evRows = (pl.events || []).filter(e => e.label || e.target_iso)
      .map(e => ({person_id: newPersonId, icon: e.icon || '📅', label: e.label || '', target_iso: e.target_iso || ''}));
    if(evRows.length) tasks.push(sb.insBatch(T_EVENTS, evRows));

    const vcRows = (pl.voice || []).filter(v => v.audio_url)
      .map(v => ({person_id: newPersonId, title: v.title || '', audio_url: v.audio_url || ''}));
    if(vcRows.length) tasks.push(sb.insBatch(T_VOICE, vcRows));

    const vdRows = (pl.video || []).filter(v => v.video_url)
      .map(v => ({person_id: newPersonId, title: v.title || '', video_url: v.video_url || ''}));
    if(vdRows.length) tasks.push(sb.insBatch(T_VIDEO, vdRows));

    const pinRows = (pl.pins || []).filter(p => p.lat && p.lng)
      .map(p => ({person_id: newPersonId, label: p.label || '', lat: p.lat, lng: p.lng, photo_drive_id: p.photo_drive_id || '', story: p.story || ''}));
    if(pinRows.length) tasks.push(sb.insBatch(T_PINS, pinRows));

    const structMedia = (pl.media || []).filter(m => m && (m.drive_id || m.src));
    const flatMedia = String(pl.mediaIds || '')
      .split(',').map(x => x.trim()).filter(Boolean)
      .map(id => ({type:'photo', drive_id:id, src:'', title:''}));
    const uniqueMedia = dedupeMedia([...structMedia, ...flatMedia]);
    const mediaRows = uniqueMedia.map(m => ({person_id: newPersonId, type: m.type || 'photo', drive_id: m.drive_id || '', src: m.src || '', title: m.title || '', sort_order: 0}));
    if(mediaRows.length) tasks.push(sb.insBatch(T_MEDIA, mediaRows));

    await Promise.all(tasks);

    /* Store a canonical link; at send time it is re-pointed to the live origin. */
    const shareLink = window.resolveCardLink(slug);
    const patch = {
      status: 'approved',
      approved_person_id: newPersonId,
      approved_login_id: slug,
      approved_password: password,
      approved_share_link: shareLink,
      approved_at: new Date().toISOString()
    };
    if(!skipStatusUpdate) patch.payload = pl;
    await sb.updGuest(r.id, patch);

    S.PEOPLE = await sb.people() || [];
    if(window.buildHome) window.buildHome();
    if(window.renderPeopleRepeater) window.renderPeopleRepeater();
    if(window.buildAdminPersonDropdown) window.buildAdminPersonDropdown();

    return {ok:true, personId:newPersonId, password, slug};
  }catch(e){
    return {ok:false, err: e.message || 'Approval failed'};
  }
};

/* ============================================================
   LOAD GUEST APPROVALS
   ============================================================ */
window.loadGuestApprovals = async function(){
  const list = $('pendingGuestsList');
  if(!list) return;
  list.textContent = 'Loading…';

  const rows = await sb.guests();
  const pending = (rows || []).filter(r => r.status === 'pending');

  if(!pending.length){
    list.innerHTML = '<div class="empty-state"><span class="es-emoji">✅</span>No pending submissions.</div>';
    return;
  }
  list.innerHTML = '';

  pending.forEach(r => {
    const pl = r.payload || {};
    const prop = pl.person_proposal || {};
    const gi = pl.guest_info || {};
    const wa = (r.guest_whatsapp || gi.whatsapp || '').replace(/[^0-9+]/g, '');
    const waLink = wa ? ('https://wa.me/' + wa.replace(/[^0-9]/g, '')) : '';

    const structMedia = (pl.media || []).filter(m => m && (m.drive_id || m.src));
    const mediaIds = String(pl.mediaIds || '').split(',').map(x => x.trim()).filter(Boolean);
    const dedupCount = dedupeMedia([...structMedia, ...mediaIds.map(id => ({drive_id:id}))]).length;

    const gs = pl.shared || {};
    let dateLines = '';
    COUNTERS.forEach((c, idx) => {
      const dt = gs[c.dtKey];
      const tz = gs[c.tzKey] || DEFAULT_TZ;
      if(dt){
        const local = utcToZonedLocal(dt, tz) || '';
        dateLines += '<div class="detail-row"><strong>Counter ' + (idx + 1) + ':</strong> ' +
          esc(local.replace('T', ' ')) + ' (' + esc(tz) + ')</div>';
      }
    });
    if(gs.unlockDateISO){
      const tz = gs.unlockDateISO_tz || DEFAULT_TZ;
      const local = utcToZonedLocal(gs.unlockDateISO, tz) || '';
      dateLines += '<div class="detail-row"><strong>Unlock:</strong> ' +
        esc(local.replace('T', ' ')) + ' (' + esc(tz) + ')</div>';
    }
    (pl.events || []).forEach((ev, i) => {
      if(ev.target_iso){
        const tz = ev.target_iso_tz || DEFAULT_TZ;
        const local = utcToZonedLocal(ev.target_iso, tz) || '';
        dateLines += '<div class="detail-row"><strong>Event ' + (i + 1) + ' (' + esc(ev.label || '') + '):</strong> ' +
          esc(local.replace('T', ' ')) + ' (' + esc(tz) + ')</div>';
      }
    });

    const el = document.createElement('div');
    el.className = 'repeat-row guest-row collapsed';
    el.dataset.expanded = '0';
    el.innerHTML = `<div class="guest-row-head">
      <span class="guest-caret">▸</span>
      <span class="guest-row-summary"><strong>🆕 ${esc(prop.display_name || r.target_person_slug)}</strong>${gi.name ? ' · 👤 ' + esc(gi.name) : ''}${gi.occasion ? ' · 🎉 ' + esc(gi.occasion) : ''}</span>
    </div>
    <div class="guest-row-body" style="font-size:.85rem;line-height:1.6;">
      <em style="color:var(--c-text-muted);"> (login id: ${esc(prop.slug || r.target_person_slug)})</em><br>
      ${prop.birthday ? '🎂 Birthday: ' + esc(prop.birthday) + '<br>' : ''}
      <hr style="border:none;border-top:1px dashed rgba(196,30,58,.25);margin:.4rem 0;">
      <strong>👤 Requested by:</strong> ${esc(gi.name || r.guest_name || 'Guest')} ${gi.relation ? (' (' + esc(gi.relation) + ')') : ''}<br>
      ${wa ? '📱 ' + esc(wa) + ' ' + (waLink ? '<a href="' + waLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#25D366;color:#fff;padding:.15rem .55rem;border-radius:40px;font-size:.75rem;text-decoration:none;font-weight:800;">💬 Chat</a>' : '') + '<br>' : ''}
      ${gi.occasion ? '🎉 ' + esc(gi.occasion) + '<br>' : ''}
      ${gi.note ? '💬 ' + esc(gi.note) + '<br>' : ''}
      <hr style="border:none;border-top:1px dashed rgba(196,30,58,.25);margin:.4rem 0;">
      🎨 Theme: ${esc(pl.theme || '—')} · 🎁 Gifts: ${(pl.gifts || []).length} · 📖 Story: ${(pl.story || []).length} · 📅 Events: ${(pl.events || []).length} · 📸 Media (unique): ${dedupCount} · 🔊 Voice: ${(pl.voice || []).length} · 🎬 Video: ${(pl.video || []).length} · 🗺️ Pins: ${(pl.pins || []).length}
      ${dateLines ? ('<hr style="border:none;border-top:1px dashed rgba(196,30,58,.25);margin:.4rem 0;"><strong>📅 Dates &amp; times:</strong>' + dateLines) : ''}
      <div style="margin-top:.5rem;display:flex;gap:.4rem;flex-wrap:wrap;">
        <button type="button" class="panel-btn edit" data-act="edit" data-id="${r.id}" style="min-width:0;padding:.45rem .9rem;font-size:.82rem;">✏️ Edit &amp; Approve</button>
        <button type="button" class="repeat-add" data-act="approve" data-id="${r.id}" style="background:#0a7a3d;">✓ Quick Approve</button>
        <button type="button" class="repeat-add" data-act="reject" data-id="${r.id}" style="background:#c41e3a;">✕ Reject</button>
      </div>
    </div>`;
    list.appendChild(el);
  });

  /* Expand / collapse a submission when the admin clicks on it */
  list.querySelectorAll('.guest-row').forEach(row => {
    row.querySelector('.guest-row-head').onclick = () => {
      const open = row.dataset.expanded === '1';
      row.dataset.expanded = open ? '0' : '1';
      row.classList.toggle('collapsed', open);
      row.classList.toggle('expanded', !open);
    };
  });

  list.querySelectorAll('button[data-act]').forEach(b => {
    b.onclick = async () => {
      const id = parseInt(b.dataset.id, 10);
      const act = b.dataset.act;
      const r = pending.find(x => x.id === id);
      if(!r) return;

      if(act === 'edit'){ openGuestEditor(r); return; }

      b.disabled = true;
      __showToast('⏳ Working…');

      try{
        if(act === 'approve'){
          const result = await window.approveGuestRow(r, null, false);
          if(result.ok){
            const freshPerson = S.PEOPLE.find(p => p.id === result.personId);
            if(freshPerson) window.openShareModal(freshPerson, r);
            __showToast('✅ Approved — person #' + result.personId + ' created');
          } else {
            __showToast('❌ ' + result.err, false);
            b.disabled = false;
            return;
          }
        } else {
          await sb.updGuest(id, {status: 'rejected'});
          __showToast('🗑️ Rejected');
        }
        loadGuestApprovals();
        loadGuestHistory();
      }catch(e){
        __showToast('❌ ' + e.message, false);
        b.disabled = false;
      }
    };
  });
};

/* ============================================================
   LOAD GUEST HISTORY
   ============================================================ */
window.loadGuestHistory = async function(){
  const list = $('guestHistoryList');
  if(!list) return;
  list.textContent = 'Loading…';

  const rows = await sb.guests();
  const approved = (rows || []).filter(r => r.status === 'approved');

  if(!approved.length){
    list.innerHTML = '<div class="empty-state"><span class="es-emoji">📜</span>No approved submissions yet.</div>';
    return;
  }
  list.innerHTML = '';

  approved.forEach(r => {
    const pl = r.payload || {};
    const prop = pl.person_proposal || {};
    const gi = pl.guest_info || {};
    const wa = (r.guest_whatsapp || gi.whatsapp || '').replace(/[^0-9+]/g, '');
    const waLink = wa ? ('https://wa.me/' + wa.replace(/[^0-9]/g, '')) : '';
    const created = r.created_at ? new Date(r.created_at).toLocaleString() : '';
    const loginId = r.approved_login_id || prop.slug || r.target_person_slug || '';
    const pwd = r.approved_password || '';
    /* Re-point stored links to the live site so shared/resend links always open correctly. */
    const link = window.repointShareLink(r.approved_share_link || '', loginId);
    const sentAt = r.approved_at ? new Date(r.approved_at).toLocaleString() : '';
    const editPw = makeRequesterEditPassword(
      gi.name || r.guest_name,
      gi.whatsapp || r.guest_whatsapp,
      loginId
    );

    const el = document.createElement('div');
    el.className = 'repeat-row guest-row collapsed';
    el.dataset.expanded = '0';
    el.style.background = 'linear-gradient(135deg,#f0fff4,#e8f5f0)';
    el.innerHTML = `<div class="guest-row-head">
      <input type="checkbox" class="guest-check completed-check" data-id="${r.id}" title="Tick to move this person to the 💐 Finished tab" onclick="event.stopPropagation()">
      <span class="guest-caret">▸</span>
      <span class="guest-row-summary"><strong>✅ ${esc(prop.display_name || r.target_person_slug)}</strong>${r.approved_person_id ? ' <span class="person-id-pill">#' + r.approved_person_id + '</span>' : ''}${loginId ? ' · 🔑 ' + esc(loginId) : ''}</span>
    </div>
    <div class="guest-row-body" style="font-size:.85rem;line-height:1.6;">
      <em style="color:var(--c-text-muted);"> (login id: ${esc(loginId)})</em>
      ${prop.birthday ? '<div>🎂 Birthday: ' + esc(String(prop.birthday).slice(0,10)) + '</div>' : ''}
      ${created ? '<div style="font-size:.75rem;color:var(--c-text-muted);font-style:italic;">Submitted: ' + esc(created) + '</div>' : ''}
      ${sentAt ? '<div style="font-size:.75rem;color:var(--c-text-muted);font-style:italic;">Shared at: ' + esc(sentAt) + '</div>' : ''}
      <hr style="border:none;border-top:1px dashed rgba(196,30,58,.25);margin:.4rem 0;">
      <strong>👤 Requester:</strong> ${esc(gi.name || r.guest_name || 'Guest')} ${gi.relation ? (' (' + esc(gi.relation) + ')') : ''}<br>
      ${wa ? '📱 ' + esc(wa) + ' ' + (waLink ? '<a href="' + waLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#25D366;color:#fff;padding:.15rem .55rem;border-radius:40px;font-size:.75rem;text-decoration:none;font-weight:800;">💬 Chat</a>' : '') + '<br>' : ''}
      ${gi.occasion ? '🎉 ' + esc(gi.occasion) + '<br>' : ''}
      ${gi.note ? '💬 ' + esc(gi.note) + '<br>' : ''}
      <hr style="border:none;border-top:1px dashed rgba(196,30,58,.25);margin:.4rem 0;">
      <div><strong>🔑 Login ID:</strong> <code style="background:#fff;padding:.15rem .45rem;border-radius:.35rem;font-family:monospace;">${esc(loginId)}</code></div>
      ${pwd ? '<div><strong>🔒 Card Password:</strong> <code style="background:#fff;padding:.15rem .45rem;border-radius:.35rem;font-family:monospace;">' + esc(pwd) + '</code></div>' : ''}
      ${editPw ? '<div><strong>✏️ EDIT password:</strong> <code style="background:#eef3ff;padding:.15rem .45rem;border-radius:.35rem;font-family:monospace;color:#1a3d8f;">' + esc(editPw) + '</code></div>' : ''}
      <div><strong>🌐 Link:</strong> <a href="${esc(link)}" target="_blank" rel="noopener noreferrer" style="color:#0a4f8f;word-break:break-all;">${esc(link)}</a></div>
      <div style="margin-top:.5rem;display:flex;gap:.4rem;flex-wrap:wrap;">
        <button type="button" class="repeat-add finished-move-btn" data-id="${r.id}" style="background:#8e44ad;">💐 Move to Finished</button>
        <button type="button" class="repeat-add reedit-btn" data-id="${r.id}" style="background:#2a5fd1;">✏️ Re-edit submission</button>
        <button type="button" class="repeat-add resend-btn" data-id="${r.id}" style="background:linear-gradient(135deg,#25D366,#128C7E);">📲 Re-send credentials</button>
      </div>
    </div>`;
    list.appendChild(el);
  });

  /* Expand / collapse an approved submission when clicked */
  list.querySelectorAll('.guest-row').forEach(row => {
    row.querySelector('.guest-row-head').onclick = () => {
      const open = row.dataset.expanded === '1';
      row.dataset.expanded = open ? '0' : '1';
      row.classList.toggle('collapsed', open);
      row.classList.toggle('expanded', !open);
    };
  });

  /* ---- Tick / select rows → move them into the 💐 Finished tab ---- */
  const checks = Array.from(list.querySelectorAll('.completed-check'));
  const countEl = $('completedSelCount');
  const selAll  = $('selectAllCompleted');
  const updateCount = () => {
    const n = checks.filter(c => c.checked).length;
    if(countEl) countEl.textContent = n + ' selected';
    if(selAll){
      selAll.checked = n > 0 && n === checks.length;
      selAll.indeterminate = n > 0 && n < checks.length;
    }
  };
  checks.forEach(c => { c.onchange = updateCount; c.onclick = e => e.stopPropagation(); });
  if(selAll && selAll.dataset._bound !== '1'){
    selAll.dataset._bound = '1';
    selAll.onchange = () => {
      checks.forEach(c => { c.checked = selAll.checked; });
      updateCount();
    };
  }
  updateCount();

  const moveBtn = $('moveSelectedToFinished');
  if(moveBtn && moveBtn.dataset._bound !== '1'){
    moveBtn.dataset._bound = '1';
    moveBtn.onclick = () => {
      const ids = checks.filter(c => c.checked)
                        .map(c => parseInt(c.dataset.id, 10));
      window.moveCompletedGuestsToFinished(ids);
    };
  }

  list.querySelectorAll('.finished-move-btn').forEach(b => {
    b.onclick = () => window.moveCompletedGuestsToFinished([parseInt(b.dataset.id, 10)]);
  });

  list.querySelectorAll('.resend-btn').forEach(b => {
    b.onclick = () => {
      const r = approved.find(x => x.id === parseInt(b.dataset.id, 10));
      if(!r) return;
      const person = S.PEOPLE.find(p =>
        (p.id === r.approved_person_id) || (p.slug === r.approved_login_id)
      );
      if(!person){ __showToast('⚠️ Person no longer exists', false); return; }
      window.openShareModal(person, r);
    };
  });

  list.querySelectorAll('.reedit-btn').forEach(b => {
    b.onclick = async () => {
      const r = approved.find(x => x.id === parseInt(b.dataset.id, 10));
      if(!r) return;
      const ok = await __confirm({
        icon: '✏️',
        title: 'Re-edit this submission?',
        message: 'Approving again will create a NEW person.\n\nContinue?',
        okText: 'Continue'
      });
      if(!ok) return;
      openGuestEditor(r);
    };
  });
};

/* ============================================================
   MOVE SELECTED COMPLETED SUBMISSIONS → 💐 FINISHED TAB

   Ticked rows in the Completed tab are filed into the Finished list
   (cloud ledger + local mirror) so they appear on the home screen for
   EVERY visitor, on every domain. The person's live data is wiped out
   ONLY if it still exists and has passed its review; nothing is ever
   lost — every entry stays in the private "🗑️ Wiped Out" archive and
   can be restored back into Finished from there.
   ============================================================ */
window.moveCompletedGuestsToFinished = async function(ids){
  ids = (ids || []).filter(Boolean);
  if(!ids.length){ __showToast('⚠️ Tick at least one completed submission first.', false); return; }

  const ok = await __confirm({
    icon: '💐',
    title: 'Move ' + ids.length + ' to Finished?',
    message: 'They will appear in the 💐 Finished tab on the home screen for everyone, stamped with their birthday info.\n\nIf their card data still exists it will be wiped out — but they stay in the 🗑️ Wiped Out archive and can be restored anytime.',
    okText: 'Move to Finished'
  });
  if(!ok) return;

  __showToast('⏳ Moving to Finished…');
  let moved = 0, failed = 0;
  const rows = await sb.guests();

  for(const id of ids){
    try{
      const r = (rows || []).find(x => String(x.id) === String(id));
      if(!r){ failed++; continue; }
      const pl = r.payload || {};
      const prop = pl.person_proposal || {};
      const gi = pl.guest_info || {};
      const slug = r.approved_login_id || prop.slug || r.target_person_slug || '';
      if(!slug){ failed++; continue; }

      /* find the live person (by approved id first, then by slug) */
      let person = null;
      try{
        if(r.approved_person_id){
          person = (S.PEOPLE || []).find(p => String(p.id) === String(r.approved_person_id)) || null;
        }
        if(!person && slug){
          person = (S.PEOPLE || []).find(p => p.slug && String(p.slug).toLowerCase() === String(slug).toLowerCase()) || null;
        }
      }catch(e){}

      window.addFinishedPerson({
        id: person ? person.id : (r.approved_person_id || null),
        slug: person ? person.slug : slug,
        display_name: (person && person.display_name) || prop.display_name || slug,
        birthday: (person && person.birthday) || prop.birthday || null,
        requester_name: (person && person.requester_name) || gi.name || r.guest_name || '',
        /* relation + WhatsApp saved privately for the birthday reminders */
        requester_relation: gi.relation || r.guest_relation || '',
        requester_whatsapp: (gi.whatsapp || r.guest_whatsapp || '').trim(),
        finished_manually: true,
        /* stamp with the scheduled wipe date when known, else right now */
        wiped_at: (person && person.wipe_iso) || new Date().toISOString()
      });

      /* wipe the live card data too (person goes to Finished, not Active) */
      if(person){
        try{ await window.wipeOnePersonQuiet(person.id); }catch(e){}
      }
      moved++;
    }catch(e){
      failed++;
      console.warn('moveCompletedGuestsToFinished', id, e.message);
    }
  }

  try{ S.PEOPLE = await sb.people() || []; }catch(e){}
  if(window.clearHomeSnapshot) window.clearHomeSnapshot();
  if(window.buildHome) window.buildHome();
  if(window.renderFinishedSection) window.renderFinishedSection();
  window.loadGuestHistory();

  __showToast('💐 ' + moved + ' moved to Finished' + (failed ? (' · ' + failed + ' failed') : ''));
};

/* Wipe a person's data WITHOUT re-adding them to the finished list twice
   (the caller above already filed them with the correct manual stamp). */
window.wipeOnePersonQuiet = async function(pid){
  if(!pid) return;
  try{
    await Promise.all([
      sb.wipe(T_MEDIA,   pid),
      sb.wipe(T_GIFTS,   pid),
      sb.wipe(T_STORY,   pid),
      sb.wipe(T_EVENTS,  pid),
      sb.wipe(T_VOICE,   pid),
      sb.wipe(T_VIDEO,   pid),
      sb.wipe(T_PINS,    pid),
      sb.wipe(T_UPLOADS, pid),
      sb.wipe(T_SETTINGS,pid)
    ]);
    await sb.delPerson(pid);
  }catch(e){ console.warn('[quiet wipe] failed for ' + pid, e.message); }
};

/* ============================================================
   LOAD REJECTED SUBMISSIONS
   ============================================================ */
window.loadGuestRejected = async function(){
  const list = $('guestRejectedList');
  if(!list) return;
  list.textContent = 'Loading…';

  const rows = await sb.guests();
  const rejected = (rows || []).filter(r => r.status === 'rejected');

  if(!rejected.length){
    list.innerHTML = '<div class="empty-state"><span class="es-emoji">🗑️</span>No rejected submissions.</div>';
    return;
  }
  list.innerHTML = '';

  rejected.forEach(r => {
    const pl = r.payload || {};
    const prop = pl.person_proposal || {};
    const gi = pl.guest_info || {};
    const created = r.created_at ? new Date(r.created_at).toLocaleString() : '';

    const el = document.createElement('div');
    el.className = 'repeat-row guest-row collapsed';
    el.dataset.expanded = '0';
    el.style.background = '#fdf1f2';
    el.innerHTML = `<div class="guest-row-head">
      <span class="guest-caret">▸</span>
      <span class="guest-row-summary"><strong>🗑️ ${esc(prop.display_name || r.target_person_slug)}</strong>${gi.name ? ' · 👤 ' + esc(gi.name) : ''}</span>
    </div>
    <div class="guest-row-body" style="font-size:.85rem;line-height:1.6;">
      ${created ? '<div style="font-size:.75rem;color:var(--c-text-muted);font-style:italic;">Submitted: ' + esc(created) + '</div>' : ''}
      <strong>👤 Requester:</strong> ${esc(gi.name || r.guest_name || 'Guest')} ${gi.relation ? (' (' + esc(gi.relation) + ')') : ''}<br>
      ${gi.occasion ? '🎉 ' + esc(gi.occasion) + '<br>' : ''}
      ${gi.note ? '💬 ' + esc(gi.note) + '<br>' : ''}
      <div style="margin-top:.5rem;display:flex;gap:.4rem;flex-wrap:wrap;">
        <button type="button" class="repeat-add rej-reopen" data-id="${r.id}" style="background:#b26a00;">↩️ Move back to Pending</button>
      </div>
    </div>`;
    list.appendChild(el);
  });

  list.querySelectorAll('.guest-row').forEach(row => {
    row.querySelector('.guest-row-head').onclick = () => {
      const open = row.dataset.expanded === '1';
      row.dataset.expanded = open ? '0' : '1';
      row.classList.toggle('collapsed', open);
      row.classList.toggle('expanded', !open);
    };
  });

  list.querySelectorAll('.rej-reopen').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      try{
        await sb.updGuest(parseInt(b.dataset.id, 10), {status: 'pending'});
        __showToast('↩️ Moved back to Pending');
        window.loadGuestRejected();
        window.loadGuestApprovals();
        window.loadGuestHistory();
      }catch(e){
        __showToast('❌ ' + e.message, false);
        b.disabled = false;
      }
    };
  });
};

/* ============================================================
   GUEST APPROVAL STATUS TABS (Pending / Completed / Rejected)
   Switch between lists AND expand/collapse each submission
   when the admin clicks on a client's row.
   ============================================================ */
window.bindGuestStatusTabs = function(){
  const tabs = document.querySelectorAll('#guestStatusTabs .panel-tab');
  if(!tabs.length) return;
  const sections = {
    pending:   $('guestPendingSection'),
    approved:  $('guestCompletedSection'),
    rejected:  $('guestRejectedSection'),
    reminders: $('guestRemindersSection')
  };
  const loaders = {
    pending:  () => window.loadGuestApprovals && window.loadGuestApprovals(),
    approved: () => window.loadGuestHistory && window.loadGuestHistory(),
    rejected: () => window.loadGuestRejected && window.loadGuestRejected(),
    reminders:() => window.loadGuestReminders && window.loadGuestReminders()
  };
  tabs.forEach(tab => {
    if(tab.dataset._bound === '1') return;
    tab.dataset._bound = '1';
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const st = tab.dataset.guestStatus;
      Object.keys(sections).forEach(k => {
        if(sections[k]) sections[k].style.display = (k === st) ? '' : 'none';
      });
      if(loaders[st]) loaders[st]();
    };
  });
};

/* ============================================================
   BIRTHDAY REMINDERS — next 30 days (admin notification tab)

   Covers ACTIVE people AND every FINISHED person in the cloud
   ledger. Requester name / relation / WhatsApp are kept privately
   here so the admin can message the requester ~10–15 days before
   the birthday to plan the next surprise.
   ============================================================ */
const REMINDER_WINDOW_DAYS = 30;

function reminderSourceList(){
  const out = [];
  const seen = {};
  /* active people from the live table */
  ((window.__PAGE_STATE__ && S.PEOPLE) || []).forEach(p => {
    if(!p || !p.birthday) return;
    const k = String(p.slug || '').toLowerCase();
    if(!k || seen[k]) return;
    seen[k] = 1;
    out.push({
      slug: p.slug,
      display_name: p.display_name || p.slug,
      birthday: p.birthday,
      requester_name: p.requester_name || '',
      requester_relation: p.requester_relation || '',
      requester_whatsapp: p.requester_whatsapp || '',
      status: 'active'
    });
  });
  /* finished people from the ledger (private fields kept there) */
  try{
    (window.getFinishedPeople ? getFinishedPeople() : []).forEach(f => {
      if(!f || !f.birthday) return;
      const k = String(f.slug || '').toLowerCase();
      if(!k || seen[k]) return;
      seen[k] = 1;
      out.push({
        slug: f.slug,
        display_name: f.display_name || f.slug,
        birthday: f.birthday,
        requester_name: f.requester_name || '',
        requester_relation: f.requester_relation || '',
        requester_whatsapp: f.requester_whatsapp || '',
        status: 'finished'
      });
    });
  }catch(e){}
  return out;
}

window.updateReminderBadge = async function(){
  const badge = $('reminderBadge');
  if(!badge) return;
  try{
    let soon = 0;
    reminderSourceList().forEach(p => {
      const d = window.daysUntilBirthday ? daysUntilBirthday(p.birthday) : null;
      if(d !== null && d !== undefined && d <= REMINDER_WINDOW_DAYS) soon++;
    });
    badge.textContent = soon;
    badge.style.display = soon ? 'inline-block' : 'none';
  }catch(e){ badge.style.display = 'none'; }
};

window.loadGuestReminders = async function(){
  const list = $('guestRemindersList');
  if(!list) return;
  list.textContent = 'Loading…';

  /* make sure we have the freshest finished ledger + people list */
  try{ if(window.pullFinishedLedger) await pullFinishedLedger(); }catch(e){}
  try{ if(window.syncFinishedFromCloud) await syncFinishedFromCloud(); }catch(e){}
  try{ S.PEOPLE = await sb.people() || S.PEOPLE || []; }catch(e){}

  const items = reminderSourceList()
    .map(p => ({ p, d: window.daysUntilBirthday ? daysUntilBirthday(p.birthday) : null }))
    .filter(x => x.d !== null && x.d !== undefined && x.d <= REMINDER_WINDOW_DAYS)
    .sort((a, b) => a.d - b.d);

  window.updateReminderBadge();

  if(!items.length){
    list.innerHTML = '<div class="empty-state"><span class="es-emoji">🔔</span>No birthdays in the next ' + REMINDER_WINDOW_DAYS + ' days.</div>';
    return;
  }

  list.innerHTML = '';
  items.forEach(({p, d}) => {
    const wa = String(p.requester_whatsapp || '').replace(/[^0-9]/g, '');
    const msg = 'Hi ' + (p.requester_name || 'there') + '! 🎂 ' + (p.display_name || '') +
      "'s birthday is coming up " + (window.formatBirthdayDate ? formatBirthdayDate(p.birthday) : '') +
      ' (' + (d === 0 ? 'today!' : 'in ' + d + ' day' + (d === 1 ? '' : 's')) + '). ' +
      'Shall we plan another surprise card this year? 💕';
    const waLink = wa ? ('https://wa.me/' + wa + '?text=' + encodeURIComponent(msg)) : '';
    const cls = d <= 3 ? 'soon' : '';
    const el = document.createElement('div');
    el.className = 'repeat-row reminder-row ' + cls;
    el.style.cssText = 'display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;padding:.6rem .7rem;';
    el.innerHTML =
      '<span style="font-size:1.4rem;">🎂</span>' +
      '<div style="flex:1;min-width:180px;font-size:.85rem;line-height:1.55;">' +
        '<strong>' + esc(p.display_name || p.slug) + '</strong> ' +
        '<span class="person-id-pill" style="margin-left:.3rem;">#' + esc(String(p.slug || '')) + '</span> ' +
        (p.status === 'finished' ? '<span style="color:#8e44ad;font-size:.72rem;font-weight:800;">💐 FINISHED</span>' : '<span style="color:#0a7a3d;font-size:.72rem;font-weight:800;">🟢 ACTIVE</span>') +
        '<div><span class="reminder-days">' +
          (d === 0 ? 'TODAY 🎉' : (d === 1 ? 'Tomorrow' : 'in ' + d + ' days')) +
        '</span> · ' + esc(window.formatBirthdayDate ? formatBirthdayDate(p.birthday) : String(p.birthday).slice(0,10)) + '</div>' +
        '<div style="font-size:.75rem;color:var(--c-text-muted);">' +
          '👤 Requester: ' + esc(p.requester_name || '—') +
          (p.requester_relation ? (' (' + esc(p.requester_relation) + ')') : '') +
          (p.requester_whatsapp ? (' · 📱 ' + esc(p.requester_whatsapp)) : '') +
        '</div>' +
        (d >= 10 && d <= 15 ? '<div style="font-size:.72rem;color:#b26a00;font-weight:800;margin-top:.15rem;">⏰ Perfect window to message them now (10–15 days ahead)</div>' : '') +
      '</div>' +
      (waLink
        ? ('<a href="' + escAttr(waLink) + '" target="_blank" rel="noopener noreferrer" style="background:#25D366;color:#fff;padding:.4rem .8rem;border-radius:40px;font-size:.78rem;text-decoration:none;font-weight:800;white-space:nowrap;">💬 Message requester</a>')
        : '<span style="font-size:.72rem;color:var(--c-text-muted);font-style:italic;">no WhatsApp saved</span>');
    list.appendChild(el);
  });
};

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', () => window.bindGuestStatusTabs());
} else { window.bindGuestStatusTabs(); }

/* ============================================================
   OPEN GUEST PANEL (Guest side)
   ============================================================ */
window.openGuestPanel = function(){
  S.GUEST_TEXTS = {en:{}, gu:{}, hi:{}};
  S.GUEST_EDIT_LANG = 'en';
  document.querySelectorAll('#guestLangTabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.guestLang === 'en')
  );
  applyGuestTextsToFields('en');

  ['guestName','guestWhatsapp','newPersonName','newPersonSlug','newPersonBirthday','guestNote']
    .forEach(id => { const el = $(id); if(el) el.value = ''; });
  const gmid = $('g_mediaIds'); if(gmid) gmid.value = '';
  const rel = $('guestRelation'); if(rel) rel.value = '';
  const occ = $('guestOccasion'); if(occ) occ.value = '';

  GUEST.gifts = [];
  GUEST.story = [];
  GUEST.events = [];
  GUEST.voice = [];
  GUEST.video = [];
  GUEST.pins = [];
  GUEST.media = [];
  GUEST.theme = '';
  GUEST.counters = {};

  document.querySelectorAll('#guestPanel .tz-select').forEach(el => fillTzSelect(el, DEFAULT_TZ));
  renderGuestTheme();
  renderGuestGifts();
  renderGuestStory();
  renderGuestEvents();
  renderGuestVoice();
  renderGuestVideo();
  renderGuestPins();
  renderGuestMedia();
  renderGuestCounters();

  const gs = $('guestStatus'); if(gs){ gs.textContent = ''; gs.className = 'panel-status'; }
  const ges = $('guestExcelStatus'); if(ges){ ges.textContent = ''; ges.className = 'panel-status'; }
  show($('guestPanel'));
};

function renderGuestTheme(){
  document.querySelectorAll('#guestThemeGrid .theme-swatch').forEach(el =>
    el.classList.toggle('selected', el.dataset.gthemePick === GUEST.theme)
  );
}
function renderGuestGifts(){
  const w = $('guestGiftsRepeater');
  if(!w) return;
  w.innerHTML = '';
  GUEST.gifts.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Emoji</label><input type="text" class="panel-input" data-gf="emoji" data-i="' + i + '" value="' + escAttr(g.emoji || '🎁') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gf="title" data-i="' + i + '" value="' + escAttr(g.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Message</label><textarea class="panel-textarea" data-gf="message" data-i="' + i + '">' + esc(g.message || '') + '</textarea></div>' +
      '<div class="panel-field"><label class="panel-label">Photo Drive ID</label><input type="text" class="panel-input" data-gf="photo_drive_id" data-i="' + i + '" value="' + escAttr(g.photo_drive_id || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { GUEST.gifts[+el.dataset.i][el.dataset.gf] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GUEST.gifts.splice(+b.dataset.i, 1); renderGuestGifts(); };
  });
}
function renderGuestStory(){
  const w = $('guestStoryRepeater');
  if(!w) return;
  w.innerHTML = '';
  GUEST.story.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gs="title" data-i="' + i + '" value="' + escAttr(s.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Body</label><textarea class="panel-textarea" data-gs="body" data-i="' + i + '">' + esc(s.body || '') + '</textarea></div>' +
      '<div class="panel-field"><label class="panel-label">Photo Drive ID</label><input type="text" class="panel-input" data-gs="photo_drive_id" data-i="' + i + '" value="' + escAttr(s.photo_drive_id || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { GUEST.story[+el.dataset.i][el.dataset.gs] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GUEST.story.splice(+b.dataset.i, 1); renderGuestStory(); };
  });
}
function renderGuestEvents(){
  const w = $('guestEventsRepeater');
  if(!w) return;
  w.innerHTML = '';
  GUEST.events.forEach((ev, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    const tz = ev.target_iso_tz || DEFAULT_TZ;
    const local = ev.target_iso ? utcToZonedLocal(ev.target_iso, tz) : '';
    const tzOptsHtml = TZ_OPTIONS.map(o =>
      '<option value="' + o.v + '"' + (o.v === tz ? ' selected' : '') + '>' + o.l + '</option>'
    ).join('');
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Icon</label><input type="text" class="panel-input" data-ge="icon" data-i="' + i + '" value="' + escAttr(ev.icon || '📅') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Label</label><input type="text" class="panel-input" data-ge="label" data-i="' + i + '" value="' + escAttr(ev.label || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Target date &amp; time + timezone</label><div class="tz-row"><input type="datetime-local" class="panel-input" data-ge="target_local" data-i="' + i + '" value="' + local + '"><select class="panel-select tz-select" data-ge="target_tz" data-i="' + i + '">' + tzOptsHtml + '</select></div></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,select').forEach(el => {
    el.oninput = el.onchange = () => {
      const i = +el.dataset.i;
      if(el.dataset.ge === 'target_local'){
        const tzEl = w.querySelector('.tz-select[data-ge="target_tz"][data-i="' + i + '"]');
        const tz = tzEl ? tzEl.value : DEFAULT_TZ;
        GUEST.events[i].target_iso = el.value ? zonedToUTC(el.value, tz) : '';
        GUEST.events[i].target_iso_tz = tz;
      } else if(el.dataset.ge === 'target_tz'){
        const dtEl = w.querySelector('input[data-ge="target_local"][data-i="' + i + '"]');
        const tz = el.value;
        GUEST.events[i].target_iso_tz = tz;
        if(dtEl && dtEl.value) GUEST.events[i].target_iso = zonedToUTC(dtEl.value, tz);
      } else if(el.dataset.ge){
        GUEST.events[i][el.dataset.ge] = el.value;
      }
    };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GUEST.events.splice(+b.dataset.i, 1); renderGuestEvents(); };
  });
}
function renderGuestVoice(){
  const w = $('guestVoiceRepeater');
  if(!w) return;
  w.innerHTML = '';
  GUEST.voice.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gv="title" data-i="' + i + '" value="' + escAttr(v.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Audio URL</label><input type="text" class="panel-input" data-gv="audio_url" data-i="' + i + '" value="' + escAttr(v.audio_url || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input').forEach(el => {
    el.oninput = () => { GUEST.voice[+el.dataset.i][el.dataset.gv] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GUEST.voice.splice(+b.dataset.i, 1); renderGuestVoice(); };
  });
}
function renderGuestVideo(){
  const w = $('guestVideoRepeater');
  if(!w) return;
  w.innerHTML = '';
  GUEST.video.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gd="title" data-i="' + i + '" value="' + escAttr(v.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Video URL</label><input type="text" class="panel-input" data-gd="video_url" data-i="' + i + '" value="' + escAttr(v.video_url || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input').forEach(el => {
    el.oninput = () => { GUEST.video[+el.dataset.i][el.dataset.gd] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GUEST.video.splice(+b.dataset.i, 1); renderGuestVideo(); };
  });
}
function renderGuestPins(){
  const w = $('guestPinsRepeater');
  if(!w) return;
  w.innerHTML = '';
  GUEST.pins.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Label</label><input type="text" class="panel-input" data-gp="label" data-i="' + i + '" value="' + escAttr(p.label || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Lat</label><input type="text" class="panel-input" data-gp="lat" data-i="' + i + '" value="' + escAttr(p.lat || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Lng</label><input type="text" class="panel-input" data-gp="lng" data-i="' + i + '" value="' + escAttr(p.lng || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Photo IDs</label><input type="text" class="panel-input" data-gp="photo_drive_id" data-i="' + i + '" value="' + escAttr(p.photo_drive_id || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Story</label><textarea class="panel-textarea" data-gp="story" data-i="' + i + '">' + esc(p.story || '') + '</textarea></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { GUEST.pins[+el.dataset.i][el.dataset.gp] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GUEST.pins.splice(+b.dataset.i, 1); renderGuestPins(); };
  });
}
function renderGuestMedia(){
  const w = $('guestMediaRepeater');
  if(!w) return;
  w.innerHTML = '';
  (GUEST.media || []).forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Type</label><select class="panel-select" data-gm="type" data-i="' + i + '"><option value="photo"' + (m.type === 'photo' ? ' selected' : '') + '>Photo</option><option value="video"' + (m.type === 'video' ? ' selected' : '') + '>Video</option></select></div>' +
      '<div class="panel-field"><label class="panel-label">Drive ID</label><input type="text" class="panel-input" data-gm="drive_id" data-i="' + i + '" value="' + escAttr(m.drive_id || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Direct URL</label><input type="text" class="panel-input" data-gm="src" data-i="' + i + '" value="' + escAttr(m.src || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-gm="title" data-i="' + i + '" value="' + escAttr(m.title || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,select').forEach(el => {
    el.onchange = el.oninput = () => { GUEST.media[+el.dataset.i][el.dataset.gm] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { GUEST.media.splice(+b.dataset.i, 1); renderGuestMedia(); };
  });
}
function renderGuestCounters(){
  COUNTERS.forEach((c, idx) => {
    const num = idx + 1;
    const showEl = $('g_ct' + num + '_show');
    if(showEl) showEl.checked = (String(GUEST.counters[c.showKey]) !== 'false');
  });
  document.querySelectorAll('.g-ctr-tz').forEach(el => {
    const key = el.dataset.gc;
    if(!key) return;
    fillTzSelect(el, GUEST.counters[key] || DEFAULT_TZ);
    el.value = GUEST.counters[key] || DEFAULT_TZ;
  });
  document.querySelectorAll('.g-ctr').forEach(el => {
    const key = el.dataset.gc;
    if(!key) return;
    if(key.endsWith('_datetime')){
      const tzKey = key + '_tz';
      const tz = GUEST.counters[tzKey] || DEFAULT_TZ;
      el.value = GUEST.counters[key] ? utcToZonedLocal(GUEST.counters[key], tz) : '';
    } else {
      el.value = GUEST.counters[key] !== undefined ? GUEST.counters[key] : '';
    }
  });
}

function applyGuestTextsToFields(lang){
  const src = (S.GUEST_TEXTS && S.GUEST_TEXTS[lang]) || {};
  document.querySelectorAll('.g-text').forEach(el => {
    const k = el.dataset.gt;
    if(!k) return;
    el.value = src[k] !== undefined ? src[k] : '';
  });
}
function saveGuestTextsFromFields(lang){
  const dst = (S.GUEST_TEXTS = S.GUEST_TEXTS || {en:{}, gu:{}, hi:{}});
  dst[lang] = dst[lang] || {};
  document.querySelectorAll('.g-text').forEach(el => {
    const k = el.dataset.gt;
    if(!k) return;
    dst[lang][k] = el.value;
  });
}

/* ============================================================
   SHARE MODAL
   ============================================================ */
window.openShareModal = function(person, guestRow){
  if(!person) return;

  const gi = (guestRow && guestRow.payload && guestRow.payload.guest_info) || {};
  const reqName = person.requester_name || gi.name || '';
  const reqWa = person.requester_whatsapp || gi.whatsapp || '';

  const loginId = person.slug || '';
  const cardPw = person.password || '';
  /* SECURITY: the EDIT password must never appear in shared messages.
     It is only ever shown inside the admin panel (below), never sent. */
  const editPw = makeRequesterEditPassword(reqName, reqWa, loginId);
  /* Always open the site this app is actually served from — re-point any
     stored share link to the current origin so guests get a live URL.    */
  const link = window.repointShareLink(
    (guestRow && guestRow.approved_share_link) || '',
    loginId
  );

  /* Build the outbound message: viewer credentials ONLY
     (login ID + viewer card password + link). No edit password. */
  function buildShareMessage(){
    return '💕 A surprise card has been created for ' + (person.display_name || loginId) + '!\n\n' +
      '🔑 Login ID: ' + loginId + '\n' +
      (cardPw ? '🔒 Card password: ' + cardPw + '\n' : '') +
      '🌐 Link: ' + link;
  }

  const body = $('shareModalBody');
  if(body){
    body.innerHTML = `
      <div class="share-preview-box">
        <div class="title">📲 Share credentials</div>
        <div class="line"><strong>👤 Person:</strong> ${esc(person.display_name || loginId)}</div>
        <div class="line"><strong>🔑 Login ID:</strong> <code style="background:#fff;padding:.15rem .45rem;border-radius:.35rem;font-family:monospace;">${esc(loginId)}</code></div>
        ${cardPw ? '<div class="line"><strong>🔒 Card Password (viewer):</strong> <code style="background:#fff;padding:.15rem .45rem;border-radius:.35rem;font-family:monospace;">' + esc(cardPw) + '</code></div>' : ''}
        ${editPw ? '<div class="line"><strong>✏️ EDIT Password (requester — admin reference only, never sent):</strong> <code style="background:#eef3ff;padding:.15rem .45rem;border-radius:.35rem;font-family:monospace;color:#1a3d8f;">' + esc(editPw) + '</code></div>' : ''}
        <div class="line"><strong>🌐 Link:</strong> <a href="${esc(link)}" target="_blank" rel="noopener noreferrer" style="color:#0a4f8f;word-break:break-all;">${esc(link)}</a></div>
        <div class="line" style="font-size:.72rem;color:var(--c-text-muted);margin-top:.35rem;">ℹ️ The WhatsApp / copy message includes the Login ID, viewer password and link only — the edit password is never shared.</div>
      </div>
      <div class="wa-row">
        <button type="button" class="wa-btn" id="shareWaBtn">💬 Send on WhatsApp</button>
        <button type="button" class="wa-btn" id="shareCopyBtn" style="background:linear-gradient(135deg,#2a5fd1,#1a3d8f);">📋 Copy message</button>
      </div>
    `;
  }

  show($('shareModal'));

  const closeBtn = $('shareModalClose');
  if(closeBtn) closeBtn.onclick = () => hide($('shareModal'));

  const waBtn = $('shareWaBtn');
  if(waBtn){
    waBtn.onclick = () => {
      /* Viewer credentials only — edit password intentionally excluded. */
      const msg = buildShareMessage() + '\n\n' +
        'Tap the link, pick your name, and enter the password to open 💖';
      const waNum = String(reqWa || '').replace(/[^0-9]/g, '');
      const url = waNum
        ? ('https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg))
        : ('https://wa.me/?text=' + encodeURIComponent(msg));
      window.open(url, '_blank');
    };
  }

  const copyBtn = $('shareCopyBtn');
  if(copyBtn){
    copyBtn.onclick = async () => {
      /* Viewer credentials only — edit password intentionally excluded. */
      const msg = buildShareMessage();
      try{
        await navigator.clipboard.writeText(msg);
        __showToast('📋 Copied to clipboard');
      }catch(e){
        __showToast('❌ Copy failed', false);
      }
    };
  }
};

/* ============================================================
   BINDINGS
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  /* Guest edit language tabs */
  document.querySelectorAll('#geLangTabs button').forEach(btn => {
    btn.onclick = () => { saveGETextsFromFields(); geSetLangActive(btn.dataset.geLang); };
  });

  /* Guest edit pane tabs */
  document.querySelectorAll('#guestEditModal .panel-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('#guestEditModal .panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#guestEditModal .panel-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const p = $(tab.dataset.gePane);
      if(p) p.classList.add('active');
    };
  });

  const geClose = $('guestEditClose');
  if(geClose) geClose.onclick = () => hide($('guestEditModal'));
  const geCancel = $('geCancel');
  if(geCancel) geCancel.onclick = () => hide($('guestEditModal'));

  /* Guest edit counters */
  document.querySelectorAll('#ge-pane-counters .ge-ctr').forEach(el => {
    const handler = () => {
      const k = el.dataset.gc;
      if(!k) return;
      if(k.endsWith('_datetime')){
        const tzKey = k + '_tz';
        const tzSel = document.querySelector('#ge-pane-counters .ge-ctr-tz[data-gc="' + tzKey + '"]');
        const tz = tzSel ? tzSel.value : DEFAULT_TZ;
        GE.counters[k] = el.value ? zonedToUTC(el.value, tz) : '';
      } else {
        GE.counters[k] = el.value;
      }
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
  document.querySelectorAll('#ge-pane-counters .ge-ctr-tz').forEach(el => {
    el.addEventListener('change', () => {
      const tzKey = el.dataset.gc;
      if(!tzKey) return;
      GE.counters[tzKey] = el.value;
      const dtKey = tzKey.replace(/_tz$/, '');
      const dtEl = document.querySelector('#ge-pane-counters .ge-ctr[data-gc="' + dtKey + '"]');
      if(dtEl && dtEl.value) GE.counters[dtKey] = zonedToUTC(dtEl.value, el.value);
    });
  });
  [1,2,3].forEach(n => {
    const el = $('ge_ct' + n + '_show');
    if(el) el.onchange = () => { GE.counters['ct' + n + '_show'] = el.checked ? 'true' : 'false'; };
  });

  const geAddGift = $('geAddGiftRow');
  if(geAddGift) geAddGift.onclick = () => { GE.gifts.push({emoji:'🎁', title:'', message:'', photo_drive_id:''}); renderGEGifts(); };
  const geAddStory = $('geAddStoryRow');
  if(geAddStory) geAddStory.onclick = () => { GE.story.push({title:'', body:'', photo_drive_id:''}); renderGEStory(); };
  const geAddEvent = $('geAddEventRow');
  if(geAddEvent) geAddEvent.onclick = () => { GE.events.push({icon:'📅', label:'', target_iso:'', target_iso_tz:DEFAULT_TZ}); renderGEEvents(); };
  const geAddVoice = $('geAddVoiceRow');
  if(geAddVoice) geAddVoice.onclick = () => { GE.voice.push({title:'', audio_url:''}); renderGEVoice(); };
  const geAddVideo = $('geAddVideoRow');
  if(geAddVideo) geAddVideo.onclick = () => { GE.video.push({title:'', video_url:''}); renderGEVideo(); };
  const geAddPin = $('geAddPinRow');
  if(geAddPin) geAddPin.onclick = () => { GE.pins.push({label:'', lat:'', lng:'', photo_drive_id:'', story:''}); renderGEPins(); };
  const geAddMedia = $('geAddMediaRow');
  if(geAddMedia) geAddMedia.onclick = () => { GE.media.push({type:'photo', drive_id:'', src:'', title:''}); renderGEMedia(); };

  const geBulk = $('geBulkAddMedia');
  if(geBulk) geBulk.onclick = () => {
    const v = $('ge_bulkMediaIds').value || '';
    const ids = v.split(',').map(x => x.trim()).filter(Boolean);
    if(!ids.length){ __showToast('Paste at least one ID', false); return; }
    const before = GE.media.length;
    ids.forEach(id => GE.media.push({type:'photo', drive_id:id, src:'', title:''}));
    GE.media = dedupeMedia(GE.media);
    const removed = (before + ids.length) - GE.media.length;
    renderGEMedia();
    __showToast('✅ Added' + (removed > 0 ? (' · ' + removed + ' duplicate(s) removed') : ''));
  };

  document.querySelectorAll('#geThemeGrid .theme-swatch').forEach(el => {
    el.onclick = () => { GE.theme = el.dataset.geTheme; renderGETheme(); };
  });

  /* Guest edit: save draft */
  const geSaveDraft = $('geSaveDraft');
  if(geSaveDraft) geSaveDraft.onclick = async () => {
    const st = $('geStatus');
    collectGE();
    if(!GE.person.display_name || !GE.person.slug){
      st.textContent = '❌ Display Name and Slug required.';
      st.className = 'panel-status err';
      return;
    }
    st.textContent = '⏳ Saving edits…';
    st.className = 'panel-status';
    try{
      const payload = buildGEPayload();
      await sb.updGuest(GE.guestRow.id, {
        guest_name: GE.guest.name,
        guest_relation: GE.guest.relation,
        guest_whatsapp: GE.guest.whatsapp,
        target_person_slug: GE.person.slug,
        payload
      });
      st.textContent = '✅ Edits saved (still pending).';
      st.className = 'panel-status ok';
      __showToast('💾 Guest submission updated');
      loadGuestApprovals();
    }catch(e){
      st.textContent = '❌ ' + e.message;
      st.className = 'panel-status err';
    }
  };

  /* Guest edit: approve */
  const geApprove = $('geApprove');
  if(geApprove) geApprove.onclick = async () => {
    const st = $('geStatus');
    collectGE();
    if(!GE.person.display_name){ st.textContent = '❌ Display Name required.'; st.className = 'panel-status err'; return; }
    if(!GE.person.slug){ st.textContent = '❌ Login ID / Slug required.'; st.className = 'panel-status err'; return; }

    const dupe = S.PEOPLE.find(p => p.slug && p.slug.toLowerCase() === GE.person.slug.toLowerCase());
    if(dupe){ st.textContent = '❌ Login ID "' + GE.person.slug + '" is already taken.'; st.className = 'panel-status err'; return; }

    st.textContent = '⏳ Approving…';
    st.className = 'panel-status';

    const editedRow = Object.assign({}, GE.guestRow, {
      guest_name: GE.guest.name,
      guest_relation: GE.guest.relation,
      guest_whatsapp: GE.guest.whatsapp,
      target_person_slug: GE.person.slug,
      payload: buildGEPayload()
    });

    try{
      const result = await window.approveGuestRow(editedRow, GE.password || null, false);
      if(result.ok){
        st.textContent = '✅ Approved — person #' + result.personId;
        st.className = 'panel-status ok';
        hide($('guestEditModal'));
        const freshPerson = S.PEOPLE.find(p => p.id === result.personId);
        if(freshPerson) window.openShareModal(freshPerson, editedRow);
        __showToast('✅ Approved & person #' + result.personId + ' created');
        loadGuestApprovals();
        loadGuestHistory();
      } else {
        st.textContent = '❌ ' + result.err;
        st.className = 'panel-status err';
      }
    }catch(e){
      st.textContent = '❌ ' + e.message;
      st.className = 'panel-status err';
    }
  };

  /* Guest panel language tabs */
  document.querySelectorAll('#guestLangTabs button').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#guestLangTabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      saveGuestTextsFromFields(S.GUEST_EDIT_LANG);
      S.GUEST_EDIT_LANG = btn.dataset.guestLang;
      applyGuestTextsToFields(S.GUEST_EDIT_LANG);
    };
  });

  /* Guest panel counters */
  document.querySelectorAll('.g-ctr').forEach(el => {
    const handler = () => {
      const k = el.dataset.gc;
      if(!k) return;
      if(k.endsWith('_datetime')){
        const tzKey = k + '_tz';
        const tzSel = document.querySelector('.g-ctr-tz[data-gc="' + tzKey + '"]');
        const tz = tzSel ? tzSel.value : DEFAULT_TZ;
        GUEST.counters[k] = el.value ? zonedToUTC(el.value, tz) : '';
      } else {
        GUEST.counters[k] = el.value;
      }
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
  document.querySelectorAll('.g-ctr-tz').forEach(el => {
    el.addEventListener('change', () => {
      const tzKey = el.dataset.gc;
      if(!tzKey) return;
      GUEST.counters[tzKey] = el.value;
      const dtKey = tzKey.replace(/_tz$/, '');
      const dtEl = document.querySelector('.g-ctr[data-gc="' + dtKey + '"]');
      if(dtEl && dtEl.value) GUEST.counters[dtKey] = zonedToUTC(dtEl.value, el.value);
    });
  });
  [1,2,3].forEach(n => {
    const el = $('g_ct' + n + '_show');
    if(el) el.onchange = () => { GUEST.counters['ct' + n + '_show'] = el.checked ? 'true' : 'false'; };
  });

  document.querySelectorAll('#guestThemeGrid .theme-swatch').forEach(el => {
    el.onclick = () => { GUEST.theme = el.dataset.gthemePick; renderGuestTheme(); };
  });

  const gAddGift = $('guestAddGiftRow');
  if(gAddGift) gAddGift.onclick = () => { GUEST.gifts.push({emoji:'🎁', title:'', message:'', photo_drive_id:''}); renderGuestGifts(); };
  const gAddStory = $('guestAddStoryRow');
  if(gAddStory) gAddStory.onclick = () => { GUEST.story.push({title:'', body:'', photo_drive_id:''}); renderGuestStory(); };
  const gAddEvent = $('guestAddEventRow');
  if(gAddEvent) gAddEvent.onclick = () => { GUEST.events.push({icon:'📅', label:'', target_iso:'', target_iso_tz:DEFAULT_TZ}); renderGuestEvents(); };
  const gAddVoice = $('guestAddVoiceRow');
  if(gAddVoice) gAddVoice.onclick = () => { GUEST.voice.push({title:'', audio_url:''}); renderGuestVoice(); };
  const gAddVideo = $('guestAddVideoRow');
  if(gAddVideo) gAddVideo.onclick = () => { GUEST.video.push({title:'', video_url:''}); renderGuestVideo(); };
  const gAddPin = $('guestAddPinRow');
  if(gAddPin) gAddPin.onclick = () => { GUEST.pins.push({label:'', lat:'', lng:'', photo_drive_id:'', story:''}); renderGuestPins(); };
  const gAddMedia = $('guestAddMediaRow');
  if(gAddMedia) gAddMedia.onclick = () => { GUEST.media = GUEST.media || []; GUEST.media.push({type:'photo', drive_id:'', src:'', title:''}); renderGuestMedia(); };

  const gBulk = $('guestBulkAddMedia');
  if(gBulk) gBulk.onclick = () => {
    const v = $('g_mediaIds').value || '';
    const ids = v.split(',').map(x => x.trim()).filter(Boolean);
    if(!ids.length){ __showToast('Paste at least one ID', false); return; }
    GUEST.media = GUEST.media || [];
    const before = GUEST.media.length;
    ids.forEach(id => GUEST.media.push({type:'photo', drive_id:id, src:'', title:''}));
    GUEST.media = dedupeMedia(GUEST.media);
    const removed = (before + ids.length) - GUEST.media.length;
    renderGuestMedia();
    __showToast('✅ Added' + (removed > 0 ? (' · ' + removed + ' duplicate(s) removed') : ''));
  };

  /* Guest panel tabs */
  document.querySelectorAll('#guestPanel .panel-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('#guestPanel .panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#guestPanel .panel-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const p = $(tab.dataset.pane);
      if(p) p.classList.add('active');
    };
  });
  const gpClose = $('guestPanelClose');
  if(gpClose) gpClose.onclick = () => hide($('guestPanel'));
  const gCancel = $('guestCancel');
  if(gCancel) gCancel.onclick = () => hide($('guestPanel'));

  /* Excel export (guest) — now with src column */
  const gExport = $('guestExportBtn');
  if(gExport) gExport.onclick = () => {
    const st = $('guestExcelStatus');
    try{
      if(!window.XLSX) throw new Error('XLSX library not loaded.');
      saveGuestTextsFromFields(S.GUEST_EDIT_LANG);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{sheet:'How-to', instruction:'Fill all sheets, then Import + Submit.'}]), 'How-to');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{display_name: $('newPersonName').value || '', slug: $('newPersonSlug').value || '', birthday: $('newPersonBirthday').value || ''}]), 'people');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{name: $('guestName').value || '', whatsapp: $('guestWhatsapp').value || '', relation: $('guestRelation').value || '', occasion: $('guestOccasion').value || '', note: $('guestNote').value || ''}]), 'requester');

      const en = S.GUEST_TEXTS.en || {};
      const gu = S.GUEST_TEXTS.gu || {};
      const hi = S.GUEST_TEXTS.hi || {};
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
        TEXT_FIELDS.map(k => ({key: k, en_value: en[k] || '', gu_value: gu[k] || '', hi_value: hi[k] || ''}))
      ), 'texts');

      const c = GUEST.counters || {};
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        {key:'theme', value: GUEST.theme || 'romantic'},
        {key:'defaultLang', value: 'en'},
        {key:'photoDurationSec', value: '5'},
        {key:'ct1_show', value: c.ct1_show || 'true'}, {key:'ct1_label', value: c.ct1_label || ''}, {key:'ct1_datetime', value: c.ct1_datetime || ''}, {key:'ct1_datetime_tz', value: c.ct1_datetime_tz || DEFAULT_TZ}, {key:'ct1_dispdate', value: c.ct1_dispdate || ''},
        {key:'ct2_show', value: c.ct2_show || 'true'}, {key:'ct2_label', value: c.ct2_label || ''}, {key:'ct2_datetime', value: c.ct2_datetime || ''}, {key:'ct2_datetime_tz', value: c.ct2_datetime_tz || DEFAULT_TZ}, {key:'ct2_dispdate', value: c.ct2_dispdate || ''},
        {key:'ct3_show', value: c.ct3_show || 'true'}, {key:'ct3_label', value: c.ct3_label || ''}, {key:'ct3_datetime', value: c.ct3_datetime || ''}, {key:'ct3_datetime_tz', value: c.ct3_datetime_tz || DEFAULT_TZ}, {key:'ct3_dispdate', value: c.ct3_dispdate || ''}
      ]), 'shared');

      const gRows = GUEST.gifts.length ? GUEST.gifts : [{emoji:'', title:'', message:'', photo_drive_id:''}];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gRows.map(g => ({emoji: g.emoji || '', title: g.title || '', message: g.message || '', photo_drive_id: g.photo_drive_id || ''}))), 'gifts');

      const eRows = GUEST.events.length ? GUEST.events : [{icon:'', label:'', target_iso:''}];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eRows.map(e => ({icon: e.icon || '', label: e.label || '', target_iso: e.target_iso || ''}))), 'events');

      const vRows = GUEST.voice.length ? GUEST.voice : [{title:'', audio_url:''}];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vRows.map(v => ({title: v.title || '', audio_url: v.audio_url || ''}))), 'voice');

      const vidRows = GUEST.video.length ? GUEST.video : [{title:'', video_url:''}];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vidRows.map(v => ({title: v.title || '', video_url: v.video_url || ''}))), 'video');

      const pinRows = GUEST.pins.length ? GUEST.pins : [{label:'', lat:'', lng:'', photo_drive_id:'', story:''}];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pinRows.map(p => ({label: p.label || '', lat: p.lat || '', lng: p.lng || '', photo_drive_id: p.photo_drive_id || '', story: p.story || ''}))), 'pins');

      const sRows = GUEST.story.length ? GUEST.story : [{title:'', body:'', photo_drive_id:''}];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sRows.map(s => ({title: s.title || '', body: s.body || '', photo_drive_id: s.photo_drive_id || ''}))), 'story');

      /* media now has BOTH drive_id AND src */
      const mRows = (GUEST.media && GUEST.media.length) ? GUEST.media : [{type:'photo', drive_id:'', src:'', title:''}];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mRows.map(m => ({
        type: m.type || 'photo',
        drive_id: m.drive_id || '',
        src: m.src || '',
        title: m.title || ''
      }))), 'media');

      const slug = $('newPersonSlug').value.trim().toLowerCase() || 'guest';
      XLSX.writeFile(wb, 'guest-template-' + slug + '.xlsx');
      st.textContent = '✅ Template downloaded.';
      st.className = 'panel-status ok';
    }catch(e){
      console.error(e);
      st.textContent = '❌ ' + (e.message || 'Download failed');
      st.className = 'panel-status err';
    }
  };

  const gImportBtn = $('guestImportBtn');
  if(gImportBtn) gImportBtn.onclick = () => $('guestExcelInput').click();

  const gExcel = $('guestExcelInput');
  if(gExcel) gExcel.onchange = async e => {
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const st = $('guestExcelStatus');
    st.textContent = '⏳ Reading…';
    st.className = 'panel-status';
    try{
      if(!window.XLSX) throw new Error('XLSX library not loaded');
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      const readSheet = name => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], {defval:''}) : [];

      const ppl = readSheet('people');
      if(ppl[0]){
        if(ppl[0].display_name !== undefined) $('newPersonName').value = String(ppl[0].display_name || '');
        if(ppl[0].slug !== undefined) $('newPersonSlug').value = String(ppl[0].slug || '');
        if(ppl[0].birthday !== undefined) $('newPersonBirthday').value = String(ppl[0].birthday || '').slice(0, 10);
      }

      const rq = readSheet('requester');
      if(rq[0]){
        if(rq[0].name !== undefined) $('guestName').value = String(rq[0].name || '');
        if(rq[0].whatsapp !== undefined) $('guestWhatsapp').value = String(rq[0].whatsapp || '');
        if(rq[0].relation !== undefined) $('guestRelation').value = String(rq[0].relation || '');
        if(rq[0].occasion !== undefined) $('guestOccasion').value = String(rq[0].occasion || '');
        if(rq[0].note !== undefined) $('guestNote').value = String(rq[0].note || '');
      }

      const tx = readSheet('texts');
      const en = {}, gu = {}, hi = {};
      tx.forEach(r => {
        const k = String(r.key || '').trim();
        if(!k) return;
        if(r.en_value !== undefined) en[k] = String(r.en_value || '');
        if(r.gu_value !== undefined) gu[k] = String(r.gu_value || '');
        if(r.hi_value !== undefined) hi[k] = String(r.hi_value || '');
      });
      S.GUEST_TEXTS = {en, gu, hi};
      applyGuestTextsToFields(S.GUEST_EDIT_LANG);

      const sh = readSheet('shared');
      GUEST.counters = GUEST.counters || {};
      sh.forEach(r => {
        const k = String(r.key || '').trim();
        if(!k) return;
        const v = String(r.value == null ? '' : r.value);
        if(k === 'theme'){ GUEST.theme = v.trim(); return; }
        if(/^ct[123]_(show|label|datetime|datetime_tz|dispdate)$/.test(k)) GUEST.counters[k] = v;
      });
      renderGuestCounters();

      GUEST.gifts = readSheet('gifts').filter(r => r.emoji || r.title || r.message || r.photo_drive_id)
        .map(r => ({emoji: String(r.emoji || '🎁'), title: String(r.title || ''), message: String(r.message || ''), photo_drive_id: String(r.photo_drive_id || '')}));
      GUEST.events = readSheet('events').filter(r => r.icon || r.label || r.target_iso)
        .map(r => ({icon: String(r.icon || '📅'), label: String(r.label || ''), target_iso: String(r.target_iso || ''), target_iso_tz: String(r.target_iso_tz || DEFAULT_TZ)}));
      GUEST.voice = readSheet('voice').filter(r => r.title || r.audio_url)
        .map(r => ({title: String(r.title || ''), audio_url: String(r.audio_url || '')}));
      GUEST.video = readSheet('video').filter(r => r.title || r.video_url)
        .map(r => ({title: String(r.title || ''), video_url: String(r.video_url || '')}));
      GUEST.pins = readSheet('pins').filter(r => r.label || r.lat || r.lng)
        .map(r => ({label: String(r.label || ''), lat: String(r.lat || ''), lng: String(r.lng || ''), photo_drive_id: String(r.photo_drive_id || ''), story: String(r.story || '')}));
      GUEST.story = readSheet('story').filter(r => r.title || r.body)
        .map(r => ({title: String(r.title || ''), body: String(r.body || ''), photo_drive_id: String(r.photo_drive_id || '')}));

      /* media now reads BOTH drive_id AND src */
      const mediaRows = readSheet('media').filter(r => {
        const did = String(r.drive_id || '').trim();
        const src = String(r.src || '').trim();
        return did || src;
      });
      const rawMedia = mediaRows.map(r => ({
        type: String(r.type || 'photo'),
        drive_id: String(r.drive_id || ''),
        src: String(r.src || ''),
        title: String(r.title || '')
      }));
      GUEST.media = dedupeMedia(rawMedia);

      renderGuestTheme();
      renderGuestGifts();
      renderGuestStory();
      renderGuestEvents();
      renderGuestVoice();
      renderGuestVideo();
      renderGuestPins();
      renderGuestMedia();
      st.textContent = '✅ Imported!';
      st.className = 'panel-status ok';
    }catch(err){
      console.error(err);
      st.textContent = '❌ ' + (err.message || 'Import failed');
      st.className = 'panel-status err';
    }finally{
      e.target.value = '';
    }
  };

  /* Guest submit */
  const gSubmit = $('guestSubmit');
  if(gSubmit) gSubmit.onclick = async () => {
    saveGuestTextsFromFields(S.GUEST_EDIT_LANG);
    const st = $('guestStatus');
    const newName = $('newPersonName').value.trim();
    const newSlug = $('newPersonSlug').value.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '');
    const newBday = $('newPersonBirthday').value.trim();
    const gname = $('guestName').value.trim();
    const gwa = $('guestWhatsapp').value.trim();
    const rel = $('guestRelation').value;
    const occasion = $('guestOccasion').value;
    const note = $('guestNote').value.trim();

    const missing = [];
    if(!newName) missing.push('• Person\'s Display Name');
    if(!newSlug) missing.push('• Person\'s Login ID / Slug');
    if(!newBday) missing.push('• Person\'s Birthday');
    if(!gname) missing.push('• Your name');
    if(!gwa) missing.push('• Your WhatsApp number');
    if(!rel) missing.push('• Your relation to them');
    if(!occasion) missing.push('• Occasion');
    if(gwa && gwa.replace(/\D/g, '').length < 6) missing.push('• WhatsApp must have 6+ digits');

    if(missing.length){
      alert('⚠️ Please fill all mandatory fields:\n\n' + missing.join('\n'));
      st.textContent = '❌ Missing field(s).';
      st.className = 'panel-status err';
      return;
    }

    const exists = S.PEOPLE.find(p => p.slug === newSlug);
    if(exists){
      st.textContent = '❌ Login ID already taken.';
      st.className = 'panel-status err';
      return;
    }

    const sharedOut = {};
    COUNTERS.forEach(c => {
      sharedOut[c.labelKey] = GUEST.counters[c.labelKey] !== undefined ? GUEST.counters[c.labelKey] : (S.GUEST_TEXTS.en[c.labelKey] || '');
      sharedOut[c.dtKey] = GUEST.counters[c.dtKey] || '';
      sharedOut[c.tzKey] = GUEST.counters[c.tzKey] || DEFAULT_TZ;
      sharedOut[c.dispKey] = GUEST.counters[c.dispKey] || '';
      sharedOut[c.showKey] = GUEST.counters[c.showKey] !== undefined ? GUEST.counters[c.showKey] : 'true';
    });

    const dedupedMedia = dedupeMedia(GUEST.media || []);
    const payload = {
      person_proposal: {display_name: newName, slug: newSlug, birthday: newBday},
      guest_info: {name: gname, relation: rel, occasion, note, whatsapp: gwa},
      texts_en: S.GUEST_TEXTS.en || {},
      texts_gu: S.GUEST_TEXTS.gu || {},
      texts_hi: S.GUEST_TEXTS.hi || {},
      texts: S.GUEST_TEXTS.en || {},
      shared: sharedOut,
      theme: GUEST.theme,
      gifts: GUEST.gifts,
      story: GUEST.story,
      events: GUEST.events,
      voice: GUEST.voice,
      video: GUEST.video,
      pins: GUEST.pins,
      media: dedupedMedia,
      mediaIds: dedupedMedia.map(m => m.drive_id).filter(Boolean).join(', ')
    };

    st.textContent = '⏳ Submitting…';
    st.className = 'panel-status';
    try{
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${T_GUEST}`, {
        method: 'POST',
        headers: sb.h(),
        body: JSON.stringify({
          guest_name: gname,
          guest_relation: rel,
          guest_whatsapp: gwa,
          target_person_slug: newSlug,
          payload,
          status: 'pending'
        })
      });
      if(!r.ok){
        const t = await r.text();
        throw new Error('submit failed ' + r.status + ' ' + t);
      }
      st.textContent = '✅ Submitted!';
      st.className = 'panel-status ok';
      setTimeout(() => {
        if(confirm('Submitted!\n\nWe will WhatsApp you the Login ID + Card password and your card link once approved. (Your edit password is kept private for admin reference only.)\n\nSend us a WhatsApp message now to speed up the approval?')){
          const msg = 'Hi Deep, I just submitted a request to add "' + newName + '". Please review and approve. Thank you!';
          window.open('https://wa.me/971553488512?text=' + encodeURIComponent(msg), '_blank');
        }
        hide($('guestPanel'));
      }, 500);
    }catch(e){
      st.textContent = '❌ ' + e.message;
      st.className = 'panel-status err';
    }
  };
});

})();