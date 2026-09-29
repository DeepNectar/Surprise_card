/* ============================================================
   requester.js — Requester edit modal
                  + Export / Import MY DATA (Excel)
                  + ALWAYS-REPLACE import behavior
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

function reSetLangActive(lang){
  RE.lang = lang;
  document.querySelectorAll('#reLangTabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.reLang === lang)
  );
  applyRETextsToFields(lang);
}

function applyRETextsToFields(lang){
  const src = (RE.texts && RE.texts[lang]) || {};
  document.querySelectorAll('#reTextFields [data-re-text]').forEach(el => {
    const k = el.dataset.reText;
    if(!k) return;
    el.value = src[k] !== undefined ? src[k] : '';
  });
}

function saveRETextsFromFields(){
  RE.texts = RE.texts || {en:{}, gu:{}, hi:{}};
  RE.texts[RE.lang] = RE.texts[RE.lang] || {};
  document.querySelectorAll('#reTextFields [data-re-text]').forEach(el => {
    const k = el.dataset.reText;
    if(!k) return;
    RE.texts[RE.lang][k] = el.value;
  });
}

function buildRETextFields(){
  const w = $('reTextFields');
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
          ? '<textarea class="panel-textarea" data-re-text="' + f + '"></textarea>'
          : '<input type="text" class="panel-input" data-re-text="' + f + '">') +
        '</div>';
    });
    html += '</div>';
  });
  w.innerHTML = html;
}

/* ---------- Requester editor repeaters ---------- */
function renderREGifts(){
  const w = $('reGiftsRepeater');
  if(!w) return;
  w.innerHTML = '';
  RE.gifts.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Emoji</label><input type="text" class="panel-input" data-rf="emoji" data-i="' + i + '" value="' + escAttr(g.emoji || '🎁') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-rf="title" data-i="' + i + '" value="' + escAttr(g.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Message</label><textarea class="panel-textarea" data-rf="message" data-i="' + i + '">' + esc(g.message || '') + '</textarea></div>' +
      '<div class="panel-field"><label class="panel-label">Photo Drive ID</label><input type="text" class="panel-input" data-rf="photo_drive_id" data-i="' + i + '" value="' + escAttr(g.photo_drive_id || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { RE.gifts[+el.dataset.i][el.dataset.rf] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { RE.gifts.splice(+b.dataset.i, 1); renderREGifts(); };
  });
}

function renderREStory(){
  const w = $('reStoryRepeater');
  if(!w) return;
  w.innerHTML = '';
  RE.story.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-rs="title" data-i="' + i + '" value="' + escAttr(s.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Body</label><textarea class="panel-textarea" data-rs="body" data-i="' + i + '">' + esc(s.body || '') + '</textarea></div>' +
      '<div class="panel-field"><label class="panel-label">Photo Drive ID</label><input type="text" class="panel-input" data-rs="photo_drive_id" data-i="' + i + '" value="' + escAttr(s.photo_drive_id || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { RE.story[+el.dataset.i][el.dataset.rs] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { RE.story.splice(+b.dataset.i, 1); renderREStory(); };
  });
}

function renderREEvents(){
  const w = $('reEventsRepeater');
  if(!w) return;
  w.innerHTML = '';
  RE.events.forEach((ev, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    const tz = ev.target_iso_tz || DEFAULT_TZ;
    const local = ev.target_iso ? utcToZonedLocal(ev.target_iso, tz) : '';
    const tzOptsHtml = TZ_OPTIONS.map(o =>
      '<option value="' + o.v + '"' + (o.v === tz ? ' selected' : '') + '>' + o.l + '</option>'
    ).join('');
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Icon</label><input type="text" class="panel-input" data-re2="icon" data-i="' + i + '" value="' + escAttr(ev.icon || '📅') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Label</label><input type="text" class="panel-input" data-re2="label" data-i="' + i + '" value="' + escAttr(ev.label || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Target date &amp; time + timezone</label><div class="tz-row"><input type="datetime-local" class="panel-input" data-re2="target_local" data-i="' + i + '" value="' + local + '"><select class="panel-select tz-select" data-re2="target_tz" data-i="' + i + '">' + tzOptsHtml + '</select></div></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,select').forEach(el => {
    el.oninput = el.onchange = () => {
      const i = +el.dataset.i;
      if(el.dataset.re2 === 'target_local'){
        const tzEl = w.querySelector('.tz-select[data-re2="target_tz"][data-i="' + i + '"]');
        const tz = tzEl ? tzEl.value : DEFAULT_TZ;
        RE.events[i].target_iso = el.value ? zonedToUTC(el.value, tz) : '';
        RE.events[i].target_iso_tz = tz;
      } else if(el.dataset.re2 === 'target_tz'){
        const dtEl = w.querySelector('input[data-re2="target_local"][data-i="' + i + '"]');
        const tz = el.value;
        RE.events[i].target_iso_tz = tz;
        if(dtEl && dtEl.value) RE.events[i].target_iso = zonedToUTC(dtEl.value, tz);
      } else if(el.dataset.re2){
        RE.events[i][el.dataset.re2] = el.value;
      }
    };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { RE.events.splice(+b.dataset.i, 1); renderREEvents(); };
  });
}

function renderREVoice(){
  const w = $('reVoiceRepeater');
  if(!w) return;
  w.innerHTML = '';
  RE.voice.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-rv="title" data-i="' + i + '" value="' + escAttr(v.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Audio URL</label><input type="text" class="panel-input" data-rv="audio_url" data-i="' + i + '" value="' + escAttr(v.audio_url || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input').forEach(el => {
    el.oninput = () => { RE.voice[+el.dataset.i][el.dataset.rv] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { RE.voice.splice(+b.dataset.i, 1); renderREVoice(); };
  });
}

function renderREVideo(){
  const w = $('reVideoRepeater');
  if(!w) return;
  w.innerHTML = '';
  RE.video.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-rd="title" data-i="' + i + '" value="' + escAttr(v.title || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Video URL</label><input type="text" class="panel-input" data-rd="video_url" data-i="' + i + '" value="' + escAttr(v.video_url || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input').forEach(el => {
    el.oninput = () => { RE.video[+el.dataset.i][el.dataset.rd] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { RE.video.splice(+b.dataset.i, 1); renderREVideo(); };
  });
}

function renderREPins(){
  const w = $('rePinsRepeater');
  if(!w) return;
  w.innerHTML = '';
  RE.pins.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Label</label><input type="text" class="panel-input" data-rp="label" data-i="' + i + '" value="' + escAttr(p.label || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Lat</label><input type="text" class="panel-input" data-rp="lat" data-i="' + i + '" value="' + escAttr(p.lat || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Lng</label><input type="text" class="panel-input" data-rp="lng" data-i="' + i + '" value="' + escAttr(p.lng || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Photo IDs</label><input type="text" class="panel-input" data-rp="photo_drive_id" data-i="' + i + '" value="' + escAttr(p.photo_drive_id || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Story</label><textarea class="panel-textarea" data-rp="story" data-i="' + i + '">' + esc(p.story || '') + '</textarea></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,textarea').forEach(el => {
    el.oninput = () => { RE.pins[+el.dataset.i][el.dataset.rp] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { RE.pins.splice(+b.dataset.i, 1); renderREPins(); };
  });
}

function renderREMedia(){
  const w = $('reMediaRepeater');
  if(!w) return;
  w.innerHTML = '';
  (RE.media || []).forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.innerHTML =
      '<button type="button" class="repeat-remove" data-i="' + i + '">✕</button>' +
      '<div class="panel-field"><label class="panel-label">Type</label><select class="panel-select" data-rm="type" data-i="' + i + '"><option value="photo"' + (m.type === 'photo' ? ' selected' : '') + '>Photo</option><option value="video"' + (m.type === 'video' ? ' selected' : '') + '>Video</option></select></div>' +
      '<div class="panel-field"><label class="panel-label">Drive ID</label><input type="text" class="panel-input" data-rm="drive_id" data-i="' + i + '" value="' + escAttr(m.drive_id || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Direct URL</label><input type="text" class="panel-input" data-rm="src" data-i="' + i + '" value="' + escAttr(m.src || '') + '"></div>' +
      '<div class="panel-field"><label class="panel-label">Title</label><input type="text" class="panel-input" data-rm="title" data-i="' + i + '" value="' + escAttr(m.title || '') + '"></div>';
    w.appendChild(row);
  });
  w.querySelectorAll('input,select').forEach(el => {
    el.onchange = el.oninput = () => { RE.media[+el.dataset.i][el.dataset.rm] = el.value; };
  });
  w.querySelectorAll('.repeat-remove').forEach(b => {
    b.onclick = () => { RE.media.splice(+b.dataset.i, 1); renderREMedia(); };
  });
}

function renderRETheme(){
  document.querySelectorAll('#reThemeGrid .theme-swatch').forEach(el =>
    el.classList.toggle('selected', el.dataset.reTheme === RE.theme)
  );
}

function renderRECounters(){
  [1,2,3].forEach(n => {
    const el = $('re_ct' + n + '_show');
    if(el) el.checked = (String(RE.counters['ct' + n + '_show']) !== 'false');
  });
  document.querySelectorAll('#re-pane-counters .re-ctr-tz').forEach(el => {
    const key = el.dataset.rc;
    if(!key) return;
    fillTzSelect(el, RE.counters[key] || DEFAULT_TZ);
    el.value = RE.counters[key] || DEFAULT_TZ;
  });
  document.querySelectorAll('#re-pane-counters .re-ctr').forEach(el => {
    const key = el.dataset.rc;
    if(!key) return;
    if(key.endsWith('_datetime')){
      const tzKey = key + '_tz';
      const tz = RE.counters[tzKey] || DEFAULT_TZ;
      el.value = RE.counters[key] ? utcToZonedLocal(RE.counters[key], tz) : '';
    } else {
      el.value = RE.counters[key] !== undefined ? RE.counters[key] : '';
    }
  });
}

async function openRequesterEditor(){
  const p = S.CURRENT_PERSON;
  if(!p){ alert('No person.'); return; }

  const set = S.CURRENT_SETTINGS || {};

  const byLang = {en:{}, gu:{}, hi:{}};
  TEXT_FIELDS.forEach(f => {
    byLang.en[f] = set['texts__en_' + f] !== undefined ? set['texts__en_' + f] : (set['texts__' + f] || '');
    byLang.gu[f] = set['texts__gu_' + f] !== undefined ? set['texts__gu_' + f] : '';
    byLang.hi[f] = set['texts__hi_' + f] !== undefined ? set['texts__hi_' + f] : '';
  });
  RE.texts = byLang;

  RE.shared = Object.assign({}, S.CURR.shared || {});
  RE.theme = RE.shared.theme || 'romantic';

  RE.counters = {};
  COUNTERS.forEach(c => {
    if(RE.shared[c.labelKey] !== undefined) RE.counters[c.labelKey] = RE.shared[c.labelKey];
    if(RE.shared[c.dtKey] !== undefined)    RE.counters[c.dtKey]    = RE.shared[c.dtKey];
    if(RE.shared[c.tzKey] !== undefined)    RE.counters[c.tzKey]    = RE.shared[c.tzKey];
    if(RE.shared[c.dispKey] !== undefined)  RE.counters[c.dispKey]  = RE.shared[c.dispKey];
    if(RE.shared[c.showKey] !== undefined)  RE.counters[c.showKey]  = RE.shared[c.showKey];
  });

  RE.gifts = JSON.parse(JSON.stringify(S.CURR.gifts || []));
  RE.story = JSON.parse(JSON.stringify(S.CURR.story || []));
  RE.events = JSON.parse(JSON.stringify(S.CURR.events || []));
  RE.voice = JSON.parse(JSON.stringify(S.CURR.voice || []));
  RE.video = JSON.parse(JSON.stringify(S.CURR.video || []));
  RE.pins = JSON.parse(JSON.stringify(S.CURR.pins || []));
  RE.media = JSON.parse(JSON.stringify(S.CURR.media || []));

  buildRETextFields();
  reSetLangActive('en');
  renderRETheme();
  renderRECounters();
  renderREGifts();
  renderREStory();
  renderREEvents();
  renderREVoice();
  renderREVideo();
  renderREPins();
  renderREMedia();
  $('re_bulkMediaIds').value = '';

  document.querySelectorAll('#requesterEditModal .panel-tab').forEach((t, i) =>
    t.classList.toggle('active', i === 0)
  );
  document.querySelectorAll('#requesterEditModal .panel-pane').forEach((p, i) =>
    p.classList.toggle('active', i === 0)
  );

  const st = $('reStatus');
  if(st){ st.textContent = ''; st.className = 'panel-status'; }
  txt($('requesterEditSub'), 'Editing card for ' + (p.display_name || p.slug) + '. Your changes will be saved to the cloud.');
  show($('requesterEditModal'));
}

/* ============================================================
   EXPORT / IMPORT — MY DATA (requester only)
   ============================================================ */
async function exportMyData(){
  const p = S.CURRENT_PERSON;
  if(!p || !p.id){ __showToast('❌ No person', false); return; }

  try{
    if(!window.XLSX) throw new Error('XLSX not loaded');
    const wb = XLSX.utils.book_new();
    const pid = p.id;

    addSheet(wb, 'person', [{
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
    }]);

    const set = await sb.getSet(pid);
    addSheet(wb, 'settings', Object.keys(set).map(k => ({key: k, value: set[k]})));

    const gifts = await sb.rows(T_GIFTS, pid) || [];
    addSheet(wb, 'gifts', gifts.map(r => ({
      emoji: r.emoji || '', title: r.title || '', message: r.message || '',
      photo_drive_id: r.photo_drive_id || ''
    })));

    const story = await sb.rows(T_STORY, pid) || [];
    addSheet(wb, 'story', story.map(r => ({
      title: r.title || '', body: r.body || '', photo_drive_id: r.photo_drive_id || ''
    })));

    const events = await sb.rows(T_EVENTS, pid) || [];
    addSheet(wb, 'events', events.map(r => ({
      icon: r.icon || '', label: r.label || '', target_iso: r.target_iso || ''
    })));

    const voice = await sb.rows(T_VOICE, pid) || [];
    addSheet(wb, 'voice', voice.map(r => ({
      title: r.title || '', audio_url: r.audio_url || ''
    })));

    const video = await sb.rows(T_VIDEO, pid) || [];
    addSheet(wb, 'video', video.map(r => ({
      title: r.title || '', video_url: r.video_url || ''
    })));

    const pins = await sb.rows(T_PINS, pid) || [];
    addSheet(wb, 'pins', pins.map(r => ({
      label: r.label || '', lat: r.lat || '', lng: r.lng || '',
      photo_drive_id: r.photo_drive_id || '', story: r.story || ''
    })));

    const media = await sb.rows(T_MEDIA, pid) || [];
    addSheet(wb, 'media', media.map(r => ({
      type: r.type || 'photo',
      drive_id: r.drive_id || '',
      src: r.src || '',
      title: r.title || '',
      sort_order: r.sort_order || 0
    })));

    XLSX.writeFile(wb, 'my-card-' + (p.slug || 'data') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    __showToast('📤 My data exported');
  }catch(e){
    console.error(e);
    __showToast('❌ Export failed: ' + e.message, false);
  }
}

/* ---------- ALWAYS REPLACE on import ---------- */
async function importMyData(file){
  const p = S.CURRENT_PERSON;
  if(!p || !p.id){ __showToast('❌ No person', false); return; }
  const pid = p.id;

  const ok = await __confirm({
    icon: '⚠️',
    title: 'Import My Data?',
    message: 'This will REPLACE your current gifts, story, events, voice, video, pins, and media with whatever is in the file.\n\nAny row you deleted in Excel will also be deleted here.\n\nContinue?',
    okText: 'Import & Replace',
    danger: true
  });
  if(!ok) return;

  try{
    if(!window.XLSX) throw new Error('XLSX not loaded');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type: 'array'});
    const readSheet = name => wb.Sheets[name]
      ? XLSX.utils.sheet_to_json(wb.Sheets[name], {defval: ''})
      : [];

    /* --- Person core fields (only update fields that are in sheet) --- */
    const pr = readSheet('person')[0] || {};
    const patch = {};
    if(pr.display_name !== undefined) patch.display_name = String(pr.display_name || p.display_name);
    if(pr.birthday !== undefined) patch.birthday = String(pr.birthday || '') || null;
    if(pr.password !== undefined) patch.password = String(pr.password || p.password);
    if(pr.requester_name !== undefined) patch.requester_name = String(pr.requester_name || '');
    if(pr.requester_whatsapp !== undefined) patch.requester_whatsapp = String(pr.requester_whatsapp || '');
    if(Object.keys(patch).length) await sb.updPerson(pid, patch);

    /* --- Settings: if 'settings' sheet is present, wipe & replace --- */
    if(wb.Sheets['settings'] !== undefined){
      const sRows = readSheet('settings').filter(r => r.key);
      const obj = {};
      sRows.forEach(r => { obj[String(r.key)] = String(r.value == null ? '' : r.value); });
      try{
        await fetch(`${SUPABASE_URL}/rest/v1/${T_SETTINGS}?person_id=eq.${pid}`, {
          method: 'DELETE',
          headers: sb.hd(),
          cache: 'no-store'
        });
      }catch(e){ console.warn('settings wipe', e.message); }
      if(Object.keys(obj).length) await sb.upSet(obj, pid);
    }

    /* --- Replace each table — ALWAYS WIPE FIRST, then insert what's in the sheet --- */
    const replaceTable = async (sheetName, table, mapRow, filterRow) => {
      if(wb.Sheets[sheetName] === undefined) return;
      const rows = readSheet(sheetName).filter(filterRow).map(mapRow);
      await sb.wipe(table, pid);
      if(rows.length) await sb.insBatch(table, rows);
    };

    await replaceTable('gifts', T_GIFTS,
      x => ({
        person_id: pid,
        emoji: x.emoji || '🎁',
        title: x.title || '',
        message: x.message || '',
        photo_drive_id: x.photo_drive_id || ''
      }),
      x => x.title || x.message || x.photo_drive_id
    );

    await replaceTable('story', T_STORY,
      x => ({
        person_id: pid,
        title: x.title || '',
        body: x.body || '',
        photo_drive_id: x.photo_drive_id || ''
      }),
      x => x.title || x.body
    );

    await replaceTable('events', T_EVENTS,
      x => ({
        person_id: pid,
        icon: x.icon || '📅',
        label: x.label || '',
        target_iso: x.target_iso || ''
      }),
      x => x.label || x.target_iso
    );

    await replaceTable('voice', T_VOICE,
      x => ({
        person_id: pid,
        title: x.title || '',
        audio_url: x.audio_url || ''
      }),
      x => x.audio_url
    );

    await replaceTable('video', T_VIDEO,
      x => ({
        person_id: pid,
        title: x.title || '',
        video_url: x.video_url || ''
      }),
      x => x.video_url
    );

    await replaceTable('pins', T_PINS,
      x => ({
        person_id: pid,
        label: x.label || '',
        lat: x.lat,
        lng: x.lng,
        photo_drive_id: x.photo_drive_id || '',
        story: x.story || ''
      }),
      x => x.lat && x.lng
    );

    /* Media with dedupe */
    if(wb.Sheets['media'] !== undefined){
      const mdRows = readSheet('media').filter(x => x.drive_id || x.src);
      const clean = dedupeMedia(mdRows.map(x => ({
        type: x.type || 'photo',
        drive_id: x.drive_id || '',
        src: x.src || '',
        title: x.title || ''
      })));
      await sb.wipe(T_MEDIA, pid);
      if(clean.length){
        await sb.insBatch(T_MEDIA, clean.map(x => ({
          person_id: pid,
          type: x.type || 'photo',
          drive_id: x.drive_id || '',
          src: x.src || '',
          title: x.title || '',
          sort_order: 0
        })));
      }
    }

    /* Reload state */
    S.PEOPLE = await sb.people() || [];
    const fresh = S.PEOPLE.find(x => x.id === pid);
    if(fresh) S.CURRENT_PERSON = fresh;
    await window.__loadPersonIntoState__(S.CURRENT_PERSON);
    hide($('requesterEditModal'));
    window.renderCardFull();
    __showToast('📥 My data imported (replaced)');
  }catch(e){
    console.error(e);
    __showToast('❌ Import failed: ' + e.message, false);
  }
}

function addSheet(wb, name, rows){
  if(!rows || !rows.length) rows = [{}];
  try{
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  }catch(e){ console.warn('addSheet', name, e.message); }
}

/* ---------- Bindings ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#reLangTabs button').forEach(btn => {
    btn.onclick = () => { saveRETextsFromFields(); reSetLangActive(btn.dataset.reLang); };
  });

  document.querySelectorAll('#requesterEditModal .panel-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('#requesterEditModal .panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#requesterEditModal .panel-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const p = $(tab.dataset.rePane);
      if(p) p.classList.add('active');
    };
  });

  const rc = $('requesterEditClose');
  if(rc) rc.onclick = () => hide($('requesterEditModal'));
  const rCancel = $('reCancel');
  if(rCancel) rCancel.onclick = () => hide($('requesterEditModal'));
  const editBtn = $('viewerEditCardBtn');
  if(editBtn) editBtn.onclick = () => openRequesterEditor();

  /* Export / Import my data buttons */
  const expBtn = $('reExportBtn');
  if(expBtn) expBtn.onclick = () => exportMyData();
  const impBtn = $('reImportBtn');
  if(impBtn) impBtn.onclick = () => {
    const f = $('reImportInput');
    if(f) f.click();
  };
  const impInput = $('reImportInput');
  if(impInput) impInput.onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if(file) importMyData(file);
    e.target.value = '';
  };

  document.querySelectorAll('#re-pane-counters .re-ctr').forEach(el => {
    const handler = () => {
      const k = el.dataset.rc;
      if(!k) return;
      if(k.endsWith('_datetime')){
        const tzKey = k + '_tz';
        const tzSel = document.querySelector('#re-pane-counters .re-ctr-tz[data-rc="' + tzKey + '"]');
        const tz = tzSel ? tzSel.value : DEFAULT_TZ;
        RE.counters[k] = el.value ? zonedToUTC(el.value, tz) : '';
      } else {
        RE.counters[k] = el.value;
      }
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
  document.querySelectorAll('#re-pane-counters .re-ctr-tz').forEach(el => {
    el.addEventListener('change', () => {
      const tzKey = el.dataset.rc;
      if(!tzKey) return;
      RE.counters[tzKey] = el.value;
      const dtKey = tzKey.replace(/_tz$/, '');
      const dtEl = document.querySelector('#re-pane-counters .re-ctr[data-rc="' + dtKey + '"]');
      if(dtEl && dtEl.value) RE.counters[dtKey] = zonedToUTC(dtEl.value, el.value);
    });
  });
  [1,2,3].forEach(n => {
    const el = $('re_ct' + n + '_show');
    if(el) el.onchange = () => { RE.counters['ct' + n + '_show'] = el.checked ? 'true' : 'false'; };
  });

  const rAddGift = $('reAddGiftRow');
  if(rAddGift) rAddGift.onclick = () => { RE.gifts.push({emoji:'🎁', title:'', message:'', photo_drive_id:''}); renderREGifts(); };
  const rAddStory = $('reAddStoryRow');
  if(rAddStory) rAddStory.onclick = () => { RE.story.push({title:'', body:'', photo_drive_id:''}); renderREStory(); };
  const rAddEvent = $('reAddEventRow');
  if(rAddEvent) rAddEvent.onclick = () => { RE.events.push({icon:'📅', label:'', target_iso:'', target_iso_tz:DEFAULT_TZ}); renderREEvents(); };
  const rAddVoice = $('reAddVoiceRow');
  if(rAddVoice) rAddVoice.onclick = () => { RE.voice.push({title:'', audio_url:''}); renderREVoice(); };
  const rAddVideo = $('reAddVideoRow');
  if(rAddVideo) rAddVideo.onclick = () => { RE.video.push({title:'', video_url:''}); renderREVideo(); };
  const rAddPin = $('reAddPinRow');
  if(rAddPin) rAddPin.onclick = () => { RE.pins.push({label:'', lat:'', lng:'', photo_drive_id:'', story:''}); renderREPins(); };
  const rAddMedia = $('reAddMediaRow');
  if(rAddMedia) rAddMedia.onclick = () => { RE.media = RE.media || []; RE.media.push({type:'photo', drive_id:'', src:'', title:''}); renderREMedia(); };

  const rBulk = $('reBulkAddMedia');
  if(rBulk) rBulk.onclick = () => {
    const v = $('re_bulkMediaIds').value || '';
    const ids = v.split(',').map(x => x.trim()).filter(Boolean);
    if(!ids.length){ __showToast('Paste at least one ID', false); return; }
    RE.media = RE.media || [];
    const before = RE.media.length;
    ids.forEach(id => RE.media.push({type:'photo', drive_id:id, src:'', title:''}));
    RE.media = dedupeMedia(RE.media);
    const removed = (before + ids.length) - RE.media.length;
    renderREMedia();
    __showToast('✅ Added' + (removed > 0 ? (' · ' + removed + ' duplicate(s) removed') : ''));
  };

  document.querySelectorAll('#reThemeGrid .theme-swatch').forEach(el => {
    el.onclick = () => { RE.theme = el.dataset.reTheme; renderRETheme(); };
  });

  const reSave = $('reSave');
  if(reSave) reSave.onclick = async () => {
    const st = $('reStatus');
    const p = S.CURRENT_PERSON;
    if(!p || !p.id){ st.textContent = '❌ No person'; st.className = 'panel-status err'; return; }

    saveRETextsFromFields();
    const pid = p.id;
    const settings = {};

    ['en','gu','hi'].forEach(lang => {
      const tl = RE.texts[lang] || {};
      TEXT_FIELDS.forEach(f => {
        settings['texts__' + lang + '_' + f] = tl[f] !== undefined ? tl[f] : '';
      });
    });

    const newShared = Object.assign({}, RE.shared || {});
    newShared.theme = RE.theme || 'romantic';
    COUNTERS.forEach(c => {
      newShared[c.labelKey] = RE.counters[c.labelKey] !== undefined ? RE.counters[c.labelKey] : '';
      newShared[c.dtKey]    = RE.counters[c.dtKey] || '';
      newShared[c.tzKey]    = RE.counters[c.tzKey] || DEFAULT_TZ;
      newShared[c.dispKey]  = RE.counters[c.dispKey] || '';
      newShared[c.showKey]  = RE.counters[c.showKey] !== undefined ? RE.counters[c.showKey] : 'true';
    });
    Object.keys(newShared).forEach(k => { settings['shared__' + k] = newShared[k]; });

    st.textContent = '⏳ Saving…';
    st.className = 'panel-status';
    try{
      await sb.upSet(settings, pid);

      const wi = async (table, rows) => {
        await sb.wipe(table, pid);
        const clean = (rows || []).filter(r => r);
        if(clean.length) await sb.insBatch(table, clean);
      };

      await Promise.all([
        wi(T_GIFTS, (RE.gifts || []).filter(g => g.title || g.message || g.photo_drive_id)
          .map(g => ({person_id: pid, emoji: g.emoji || '🎁', title: g.title || '', message: g.message || '', photo_drive_id: g.photo_drive_id || ''}))),
        wi(T_STORY, (RE.story || []).filter(s => s.title || s.body)
          .map(s => ({person_id: pid, title: s.title || '', body: s.body || '', photo_drive_id: s.photo_drive_id || ''}))),
        wi(T_EVENTS, (RE.events || []).filter(e => e.label || e.target_iso)
          .map(e => ({person_id: pid, icon: e.icon || '📅', label: e.label || '', target_iso: e.target_iso || ''}))),
        wi(T_VOICE, (RE.voice || []).filter(v => v.audio_url)
          .map(v => ({person_id: pid, title: v.title || '', audio_url: v.audio_url || ''}))),
        wi(T_VIDEO, (RE.video || []).filter(v => v.video_url)
          .map(v => ({person_id: pid, title: v.title || '', video_url: v.video_url || ''}))),
        wi(T_PINS, (RE.pins || []).filter(x => x.lat && x.lng)
          .map(x => ({person_id: pid, label: x.label || '', lat: x.lat, lng: x.lng, photo_drive_id: x.photo_drive_id || '', story: x.story || ''}))),
        wi(T_MEDIA, dedupeMedia((RE.media || []).filter(m => m.drive_id || m.src))
          .map(m => ({person_id: pid, type: m.type || 'photo', drive_id: m.drive_id || '', src: m.src || '', title: m.title || '', sort_order: 0})))
      ]);

      st.textContent = '✅ Saved!';
      st.className = 'panel-status ok';
      __showToast('💾 Card updated');
      await window.__loadPersonIntoState__(p);
      hide($('requesterEditModal'));
      window.renderCardFull();
    }catch(e){
      st.textContent = '❌ ' + e.message;
      st.className = 'panel-status err';
    }
  };
});

})();