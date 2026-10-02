/* ============================================================
   home.js — Home screen, person grid, finished tab, admin login
   ============================================================ */
(function(){
'use strict';
const S = window.__PAGE_STATE__;

let homeClickCount = 0;
let homeClickTimer = null;
let FINISHED_COLLAPSED = true;

/* ---------- Birthday helpers ---------- */
function daysUntilBirthday(birthday){
  if(!birthday) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const parts = String(birthday).slice(0,10).split('-');
  if(parts.length !== 3) return null;
  const m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
  if(isNaN(m) || isNaN(d)) return null;
  let next = new Date(today.getFullYear(), m - 1, d);
  if(next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
}
function birthdayLabelForPerson(p){
  if(!p || !p.birthday) return '';
  const d = daysUntilBirthday(p.birthday);
  if(d === null) return '';
  if(d === 0) return '🎂 Birthday today!';
  if(d === 1) return '🎂 Birthday tomorrow';
  return '🎂 Birthday in ' + d + ' days';
}
function isBirthdayToday(p){
  return p && p.birthday && daysUntilBirthday(p.birthday) === 0;
}

/* ---------- Fast skeleton renderer (shows instantly while people load) ---------- */
window.renderHomeSkeleton = function(){
  const g = $('homeGrid');
  if(!g) return;
  // Clear stale skeleton tiles from a previous run so they don't linger forever
  Array.from(g.children).forEach(c => { if(c.classList.contains('skeleton')) c.remove(); });
  if(g.children.length > 0) return;
  let html = '';
  for(let i = 0; i < 4; i++){
    html += '<div class="home-btn skeleton skel-btn"></div>';
  }
  g.innerHTML = html;
};

/* ---------- Admin login trigger ---------- */
window.triggerAdminPrompt = async function(){
  const gs = await sb.getSet(null);
  const flag = (gs && gs['shared__adminLoginEnabled']);
  const enabled = (flag === undefined) ? true : (String(flag) === 'true');
  if(!enabled) return;
  window.openAdminLoginFull();
};

/* ---------- Favourites (local only — never touches the DB or rules) ---------- */
const FAV_KEY = 'v3Favs';
function getFavSlugs(){
  try{ return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }catch(e){ return []; }
}
window.v3IsFav = function(slug){ return getFavSlugs().indexOf(slug) >= 0; };
window.v3ToggleFav = function(slug){
  const f = getFavSlugs();
  const i = f.indexOf(slug);
  if(i >= 0) f.splice(i, 1); else f.push(slug);
  try{ localStorage.setItem(FAV_KEY, JSON.stringify(f)); }catch(e){}
  return i < 0; /* now favourited? */
};

/* Avatar initials + deterministic warm gradient per person */
function avatarFor(p){
  const name = String(p.display_name || p.slug || '?').trim();
  const first = name.charAt(0).toUpperCase() || '💝';
  let h = 0;
  for(let i = 0; i < name.length; i++){ h = (h * 31 + name.charCodeAt(i)) >>> 0; }
  const hue = h % 360;
  const grad = 'linear-gradient(135deg,hsl(' + hue + ' 82% 60%),hsl(' + ((hue + 42) % 360) + ' 85% 48%))';
  return {initial: first, grad};
}

/* ---------- Render home (fast) ---------- */

/* Search box — created once above the grid, filters tiles live (purely visual) */
function ensureSearchBox(){
  if($('homeSearch')) return $('homeSearch');
  const g = $('homeGrid');
  if(!g || !g.parentNode) return null;
  const wrap = document.createElement('div');
  wrap.className = 'home-search-wrap';
  wrap.innerHTML =
    '<input type="search" id="homeSearch" class="home-search" placeholder="🔍 Search people…" autocomplete="off">' +
    '<button type="button" class="home-search-clear" id="homeSearchClear" aria-label="Clear search">✕</button>';
  g.parentNode.insertBefore(wrap, g);
  const inp = wrap.querySelector('#homeSearch');
  const clr = wrap.querySelector('#homeSearchClear');
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    clr.style.display = q ? 'flex' : 'none';
    let shown = 0;
    /* person tiles + guest tile + finished tiles all carry data-name */
    document.querySelectorAll('.home-btn[data-name]').forEach(ch => {
      const hit = !q || String(ch.getAttribute('data-name')).indexOf(q) >= 0;
      ch.style.display = hit ? '' : 'none';
      if(hit) shown++;
    });
    let none = $('homeSearchNone');
    if(!shown && q){
      if(!none){
        none = document.createElement('div');
        none.id = 'homeSearchNone';
        none.className = 'home-search-none';
        none.textContent = '🙈 No one matches "' + inp.value + '"';
        g.parentNode.insertBefore(none, g.nextSibling);
      }
    } else if(none){ none.remove(); }
  });
  clr.onclick = () => { inp.value = ''; inp.dispatchEvent(new Event('input')); inp.focus(); };
  return inp;
}

window.buildHome = function(){
  const g = $('homeGrid');
  if(!g) return;

  // Build a DocumentFragment for speed
  const frag = document.createDocumentFragment();

  const ep = (S.PEOPLE || []).filter(p => p.enabled !== false);

  /* Favourites float to the front; tiles are matched back by data-slug so
     order changes never break anything else. */
  const favs = getFavSlugs();
  ep.sort((a, b) =>
    (favs.indexOf(b.slug) >= 0 ? 1 : 0) - (favs.indexOf(a.slug) >= 0 ? 1 : 0));

  ep.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'home-btn tile-in';
    b.setAttribute('data-name', String(p.display_name || p.slug || '').toLowerCase());
    b.setAttribute('data-slug', String(p.slug || ''));
    b.style.animationDelay = Math.min(i * 45, 360) + 'ms';
    const bdayLabel = birthdayLabelForPerson(p);
    const bdayToday = isBirthdayToday(p);
    const av = avatarFor(p);
    const isFav = favs.indexOf(p.slug) >= 0;
    b.innerHTML =
      '<span class="fav-heart' + (isFav ? ' on' : '') + '" role="button" tabindex="-1" aria-label="Toggle favourite">' + (isFav ? '❤️' : '🤍') + '</span>' +
      '<span class="home-avatar" style="background:' + av.grad + '">' + esc(av.initial) + '</span>' +
      '<span class="home-btn-name">' + esc(p.display_name || p.slug || 'Person') + '</span>' +
      (bdayLabel
        ? '<span class="home-btn-bday' + (bdayToday ? ' today' : '') + '">' + bdayLabel + '</span>'
        : '');
    b.onclick = (e) => {
      if(e && e.preventDefault) e.preventDefault();
      window.onPersonClick(p);
    };
    const heart = b.querySelector('.fav-heart');
    heart.onclick = (e) => {
      e.stopPropagation();
      if(e.preventDefault) e.preventDefault();
      const on = window.v3ToggleFav(p.slug);
      heart.classList.toggle('on', on);
      heart.textContent = on ? '❤️' : '🤍';
      if(window.v3PlaySound) window.v3PlaySound(on ? 'pop' : 'click');
      buildHome(); /* re-sort so favourites float up instantly */
    };
    frag.appendChild(b);
  });

  const gb = document.createElement('button');
  gb.type = 'button';
  gb.className = 'home-btn guest tile-in';
  gb.style.animationDelay = Math.min(ep.length * 45, 360) + 'ms';
  gb.innerHTML = '<span class="home-btn-emoji">✍️</span><span>Create your own surprise</span><span class="home-btn-sub">Guest mode</span>';
  gb.onclick = (e) => {
    if(e && e.preventDefault) e.preventDefault();
    if(window.openGuestPanel) window.openGuestPanel();
  };
  frag.appendChild(gb);

  g.innerHTML = '';
  g.appendChild(frag);

  ensureSearchBox();

  // Render finished section
  renderFinishedSection();

  if(window.renderHomeReviews) window.renderHomeReviews();
  renderHomeStats();
};

/* ---------- Finished section (auto-wiped people) ---------- */
/* Grace period: for a short while after the scheduled wipe time, still show
   a person in the 💐 Finished tab even if neither the local mirror nor the
   cloud ledger has caught up yet (e.g. brand-new visitor on a fresh domain
   whose first sync hasn't completed). This guarantees the Finished tab never
   "vanishes" when someone opens the site via a different domain. */
const FINISHED_GRACE_MS = 3 * 24 * 60 * 60 * 1000; /* 3 days */
function finishedFromPeopleTable(){
  /* People whose scheduled wipe date/time has passed (or is imminent within
     the grace window) count as finished, straight from the live table. */
  const now = Date.now();
  return (S.PEOPLE || []).filter(p => {
    if(!p || !p.wipe_iso) return false;
    const t = Date.parse(p.wipe_iso);
    if(isNaN(t)) return false;
    return t <= now + FINISHED_GRACE_MS;
  }).map(p => ({
    id: p.id, slug: p.slug, display_name: p.display_name,
    birthday: p.birthday, requester_name: p.requester_name || '',
    requester_relation: p.requester_relation || '',
    requester_whatsapp: p.requester_whatsapp || '',
    wiped_at: p.wipe_iso
  }));
}
function renderFinishedSection(){
  const wrap = $('homeFinished');
  if(!wrap) return;

  let finished = window.getFinishedPeople ? getFinishedPeople() : [];
  /* Merge in any due/overdue people from the live table so the Finished
     tab shows for EVERY visitor on every domain — even before their very
     first cloud-ledger sync finishes. */
  try{
    const fromTable = finishedFromPeopleTable();
    if(fromTable.length){
      const seen = {};
      finished.forEach(f => { seen[String(f.slug)] = 1; });
      const extra = fromTable.filter(p => p.slug && !seen[String(p.slug)]);
      if(extra.length){
        if(window.mergeTwoListsRaw) finished = window.mergeTwoListsRaw(finished, extra);
        else finished = finished.concat(extra);
      }
    }
  }catch(e){}
  if(!finished.length){
    wrap.style.display = 'none';
    wrap.classList.add('collapsed');
    return;
  }

  wrap.style.display = 'block';

  // Keep the header counter in sync with the list length
  const fcount = $('homeFinishedCount');
  if(fcount) fcount.textContent = finished.length;

  const list = $('homeFinishedList');
  if(list){
    /* Tile format: 💐 Name · 🎂 next-birthday countdown · birthday date.
       NO auto-wipe / remove button on the tile itself — finished people
       stay visible to EVERY visitor forever, on every domain. The tile is
       only removable by an admin (via confirmation) and never by time. */
    list.innerHTML = finished.map(p => {
      let bdayLine = '';
      const d = window.daysUntilBirthday ? daysUntilBirthday(p.birthday) : null;
      const dateStr = window.formatBirthdayDate ? formatBirthdayDate(p.birthday) : '';
      if(d !== null && d !== undefined){
        const label = (d === 0) ? '🎂 Birthday today!'
                    : (d === 1) ? '🎂 Birthday tomorrow'
                    : ('🎂 in ' + d + ' day' + (d === 1 ? '' : 's'));
        bdayLine = '<span class="home-btn-bday finished-date">' + esc(label) +
                   (dateStr ? (' · ' + esc(dateStr)) : '') + '</span>';
      } else if(dateStr){
        bdayLine = '<span class="home-btn-bday finished-date">🎂 ' + esc(dateStr) + '</span>';
      }
      return '<button type="button" class="home-btn finished-btn" data-slug="' + escAttr(p.slug) + '" data-name="' + escAttr(String(p.display_name || p.slug || '').toLowerCase()) + '">' +
        '<span class="home-btn-emoji">💐</span>' +
        '<span>' + esc(p.display_name || p.slug) + '</span>' +
        bdayLine +
      '</button>';
    }).join('');
  }

  // Toggle collapse
  const head = $('homeFinishedHead');
  if(head && head.dataset._bound !== '1'){
    head.dataset._bound = '1';
    head.onclick = () => {
      FINISHED_COLLAPSED = !FINISHED_COLLAPSED;
      wrap.classList.toggle('collapsed', FINISHED_COLLAPSED);
    };
  }

  // Buttons — show "this surprise is finished" message (or remove if admin)
  wrap.querySelectorAll('.finished-btn').forEach(btn => {
    btn.onclick = async (e) => {
      if(e && e.preventDefault) e.preventDefault();
      const slug = btn.dataset.slug;
      const isAdmin = !!S.ADMIN_MODE;
      if(isAdmin){
        const ok = await __confirm({
          icon: '💐',
          title: 'Remove from finished list?',
          message: 'This surprise is finished. Remove them from the finished list permanently?',
          okText: 'Remove',
          danger: true
        });
        if(!ok) return;
        removeFinishedPerson(slug);
        renderFinishedSection();
      } else {
        alert('💐 This surprise has been completed and archived.\n\nThank you for being part of it 💕');
      }
    };
  });
}
window.renderFinishedSection = renderFinishedSection;

/* ---------- "Coming soon" popup (opened by the 🎂 button) ---------- */
const SOON_DAYS = 7; /* how far ahead counts as "coming soon" */

function closeBdaySoonPop(){
  const old = document.getElementById('bdaySoonPop');
  if(old) old.remove();
  const btn = $('bdaySoonBtn');
  if(btn) btn.classList.remove('open');
}

function toggleBdaySoonPop(){
  if(document.getElementById('bdaySoonPop')){ closeBdaySoonPop(); return; }

  const people = (S.PEOPLE || []).filter(p => p.enabled !== false);
  const soon = people
    .map(p => ({ name: String(p.display_name || p.slug || '').trim(), days: daysUntilBirthday(p.birthday) }))
    .filter(p => p.name && p.days !== null && p.days >= 0 && p.days <= SOON_DAYS)
    .sort((a, b) => a.days - b.days);

  const pop = document.createElement('div');
  pop.id = 'bdaySoonPop';
  pop.className = 'bday-soon-pop';

  let inner = '<div class="bsp-head">🎂 Birthdays coming soon <span class="bsp-count">' + soon.length + '</span></div>';
  if(!soon.length){
    inner += '<div class="bsp-empty">No birthdays in the next ' + SOON_DAYS + ' days 💤</div>';
  } else {
    inner += '<ul class="bsp-list">' + soon.map(p => {
      const when = p.days === 0 ? 'Today! 🎉' : (p.days === 1 ? 'Tomorrow' : 'In ' + p.days + ' days');
      return '<li class="bsp-item' + (p.days === 0 ? ' today' : '') + '">' +
             '<span class="bsp-name">' + esc(p.name) + '</span>' +
             '<span class="bsp-when">' + when + '</span></li>';
    }).join('') + '</ul>';
  }
  inner += '<div class="bsp-foot">Showing birthdays within the next ' + SOON_DAYS + ' days</div>';
  pop.innerHTML = inner;

  const bar = $('homeStatsBar');
  if(!bar) return;
  bar.appendChild(pop);
  const btn = $('bdaySoonBtn');
  if(btn) btn.classList.add('open');

  /* dismiss on any outside click / Esc */
  setTimeout(() => {
    document.addEventListener('mousedown', function outside(e){
      if(!document.getElementById('bdaySoonPop')){ document.removeEventListener('mousedown', outside); return; }
      if(!pop.contains(e.target) && !(btn && btn.contains(e.target))){
        closeBdaySoonPop();
        document.removeEventListener('mousedown', outside);
      }
    });
    document.addEventListener('keydown', function keyd(e){
      if(e.key === 'Escape'){ closeBdaySoonPop(); document.removeEventListener('keydown', keyd); }
    });
  }, 0);
}
window.toggleBdaySoonPop = toggleBdaySoonPop;

/* ---------- Stats chip bar ---------- */
function renderHomeStats(){
  const bar = $('homeStatsBar');
  if(!bar) return;
  const people = (S.PEOPLE || []).filter(p => p.enabled !== false).length;
  const reviews = (S.REVIEWS || []).length;
  const avg = reviews
    ? Math.round((S.REVIEWS.reduce((a, r) => a + (parseInt(r.stars) || 0), 0) / reviews) * 10) / 10
    : 0;
  // Everyone whose birthday falls within the next week, nearest first
  const upcoming = (S.PEOPLE || [])
    .filter(p => p.enabled !== false)
    .map(p => ({ name: String(p.display_name || p.slug || '').trim(), days: daysUntilBirthday(p.birthday) }))
    .filter(p => p.name && p.days !== null && p.days >= 0 && p.days <= SOON_DAYS)
    .sort((a, b) => a.days - b.days);
  const listText = upcoming.map(p => {
    const when = p.days === 0 ? 'today!' : (p.days === 1 ? 'tomorrow' : 'in ' + p.days + ' days');
    return p.name + ' ' + when;
  }).join(' • ');
  let html = '';
  html += '<div class="home-stat-chip tile-in" style="animation-delay:60ms">💖 <span class="hsc-num">' + people + '</span> surprise' + (people === 1 ? '' : 's') + ' live</div>';
  if(reviews){
    html += '<div class="home-stat-chip tile-in" style="animation-delay:140ms">⭐ <span class="hsc-num">' + avg + '</span> rating</div>';
    html += '<div class="home-stat-chip tile-in" style="animation-delay:220ms"><span class="hsc-num">' + reviews + '</span> happy review' + (reviews === 1 ? '' : 's') + '</div>';
  }
  if(upcoming.length){
    /* A BUTTON that shows HOW MANY birthdays are coming soon — click it for the names */
    const n = upcoming.length;
    const todayCount = upcoming.filter(p => p.days === 0).length;
    let label;
    if(todayCount === n) label = 'birthday' + (n > 1 ? 's' : '') + ' today';
    else if(todayCount > 0) label = 'birthday' + (n > 1 ? 's' : '') + ' coming up';
    else if(n === 1) label = upcoming[0].days === 1 ? 'birthday tomorrow' : 'birthday in ' + upcoming[0].days + ' days';
    else label = 'birthdays coming up';
    html += '<button type="button" id="bdaySoonBtn" class="home-stat-chip tile-in upcoming bday-soon-btn" ' +
            'style="animation-delay:300ms" aria-haspopup="true" aria-expanded="false" ' +
            'title="' + escAttr(listText) + '" onclick="toggleBdaySoonPop()">' +
            '🎂 <span class="hsc-num">' + n + '</span> ' + esc(label) +
            '<span class="bsp-caret" aria-hidden="true">▾</span></button>';
  }
  bar.innerHTML = html;
  bar.style.display = people ? 'flex' : 'none';
}

/* ---------- Person click ---------- */
window.onPersonClick = function(p){
  /* ⚡ Perf fix: prefetch this person's card data the moment their tile is
     tapped. Previously every table (media/gifts/story/events/voice/video/
     pins/settings) was fetched one-by-one only AFTER the password check —
     a chain of round trips before anything appeared. Now they are already
     in flight while the login modal is being typed into, so the card opens
     almost instantly after a correct password. */
  try{
    if(window.preloadPersonData) window.preloadPersonData(p.id);
  }catch(e){}
  S.LOGIN_TARGET = p;
  txt($('personLoginTitle'), 'Hi ' + (p.display_name || p.slug || '') + ' 💕');
  txt($('personLoginSub'), 'Enter your card password, or requester edit password.');
  $('personPwError').classList.remove('show');
  $('personPwInput').value = '';
  show($('personLoginModal'));
  setTimeout(() => $('personPwInput').focus(), 80);
};

/* ---------- Admin login ---------- */
window.openAdminLoginFull = function(){
  const m = $('adminLoginModal');
  if(!m) return;
  const inp = $('adminPwInput');
  if(inp) inp.value = '';
  const err = $('adminPwError');
  if(err) err.classList.remove('show');
  show(m);
  setTimeout(() => inp && inp.focus(), 80);
};

window.tryAdminLogin = async function(){
  const pw = ($('adminPwInput') || {}).value || '';
  const err = $('adminPwError');
  const stored = (S.CURR.shared && S.CURR.shared.adminPassword) || FALLBACK_ADMIN_PW;
  const ok = (pw === stored) || (pw === FALLBACK_ADMIN_PW);
  if(!ok){
    if(err){
      err.textContent = '❌ Incorrect password.';
      err.classList.add('show');
    }
    return;
  }
  hide($('adminLoginModal'));
  S.ADMIN_MODE = true;
  await window.startAdmin();
};

window.startAdmin = async function(){
  try{
    if(!S.PEOPLE || !S.PEOPLE.length){
      S.PEOPLE = await sb.people() || [];
    }
    if(window.openAdminPanel) window.openAdminPanel();
  }catch(e){
    __showToast('❌ Admin load failed: ' + e.message, false);
  }
};

/* ---------- Boot bindings ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const el = $('homeEmoji');
  if(el) el.addEventListener('click', () => {
    homeClickCount++;
    if(homeClickTimer) clearTimeout(homeClickTimer);
    if(homeClickCount >= 3){
      homeClickCount = 0;
      triggerAdminPrompt();
      return;
    }
    homeClickTimer = setTimeout(() => { homeClickCount = 0; }, 600);
  });

  const box = $('homeIntro');
  const btn = $('homeIntroToggle');
  if(box && btn){
    const KEY = 'homeIntroCollapsed';
    try{
      if(localStorage.getItem(KEY) === '1'){
        box.classList.add('collapsed');
        btn.textContent = 'Show more 👇';
      }
    }catch(e){}
    btn.onclick = (e) => {
      if(e && e.preventDefault) e.preventDefault();
      const isCollapsed = box.classList.toggle('collapsed');
      btn.textContent = isCollapsed ? 'Show more 👇' : 'Hide 👆';
      try{ localStorage.setItem(KEY, isCollapsed ? '1' : '0'); }catch(e){}
    };
  }

  const cbox = $('homeChangelog');
  const chead = $('homeChangelogHead');
  if(cbox && chead){
    const KEY = 'homeChangelogCollapsed';
    try{
      if(localStorage.getItem(KEY) === '0') cbox.classList.remove('collapsed');
    }catch(e){}
    chead.addEventListener('click', () => {
      const isCollapsed = cbox.classList.toggle('collapsed');
      try{ localStorage.setItem(KEY, isCollapsed ? '1' : '0'); }catch(e){}
    });
  }

  const rhead = $('homeReviewsHead');
  if(rhead) rhead.addEventListener('click', () => {
    S.REVIEWS_COLLAPSED = !S.REVIEWS_COLLAPSED;
    if(window.applyHomeReviewsCollapsed) window.applyHomeReviewsCollapsed();
  });

  // Finished section initial state
  const fwrap = $('homeFinished');
  if(fwrap){
    fwrap.classList.toggle('collapsed', FINISHED_COLLAPSED);
  }

  const cancelBtn = $('personPwCancel');
  const input = $('personPwInput');
  const confirmBtn = $('personPwConfirm');
  if(cancelBtn) cancelBtn.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); hide($('personLoginModal')); };
  if(input) input.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); window.tryPersonPw(); }
  });
  if(confirmBtn) confirmBtn.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); window.tryPersonPw(); };

  const aCancel = $('adminPwCancel');
  const aInput = $('adminPwInput');
  const aConfirm = $('adminPwConfirm');
  if(aCancel) aCancel.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); hide($('adminLoginModal')); };
  if(aInput) aInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); window.tryAdminLogin(); }
  });
  if(aConfirm) aConfirm.onclick = (e) => { if(e && e.preventDefault) e.preventDefault(); window.tryAdminLogin(); };

  const b = $('openEarlyBtn');
  if(b) b.onclick = (e) => {
    if(e && e.preventDefault) e.preventDefault();
    if(window.__openEarlyHandler__) window.__openEarlyHandler__();
  };
});

/* ---------- Person password check ---------- */
window.tryPersonPw = async function(){
  const pw = $('personPwInput').value;
  const p = S.LOGIN_TARGET;
  if(!p) return;

  const adminPw = (S.CURR.shared && S.CURR.shared.adminPassword) || FALLBACK_ADMIN_PW;
  if(pw === adminPw || pw === FALLBACK_ADMIN_PW){
    hide($('personLoginModal'));
    S.ADMIN_MODE = true;
    await window.startAdmin();
    return;
  }

  const editPw = getEditPasswordForPerson(p);
  const isRequester = editPw && pw === editPw;
  const expected = p.password || '';
  const isViewer = expected && pw === expected;

  if(!isRequester && !isViewer){
    $('personPwError').textContent = getText('pwError', '❌ Incorrect password.');
    $('personPwError').classList.add('show');
    return;
  }

  hide($('personLoginModal'));
  S.REQUESTER_MODE = isRequester;
  S.PREVIEW_MODE = false;
  await window.__loadPersonIntoState__(p);

  const s = S.CURR.shared || {};
  const unlockIso = s.unlockDateISO || '';
  const showLock = s.showLockScreen === 'true';
  const now = new Date();
  const unlockDate = unlockIso ? new Date(unlockIso) : null;
  const locked = unlockDate && !isNaN(unlockDate) && now < unlockDate;

  $('homeScreen').classList.add('hidden');

  if(locked || showLock){
    window.renderLockFull();
    show($('lockScreen'));
    if(locked) window.startCountdownFull(unlockDate);
    else txt($('countdownLabelEl'), '');
    return;
  }

  window.openOpeningFull();
};

})();