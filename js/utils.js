/* ============================================================
   utils.js — DOM helpers, timezone, escaping, dialogs
   ============================================================ */
(function(){
'use strict';

/* ---------- DOM helpers ---------- */
window.$    = function(id){ return document.getElementById(id); };
window.txt  = function(el, v){ if(el) el.textContent = v == null ? '' : String(v); };
window.show = function(el){ if(el) el.classList.add('active'); };
window.hide = function(el){ if(el) el.classList.remove('active'); };

/* ---------- HTML / attribute escaping ---------- */
window.esc = function(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
};
window.escAttr = window.esc;

/* ---------- Timezone (DST-safe, two-pass) ---------- */
function tzOffsetMs(tz, utcMs){
  try{
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit',
      hour12:false
    });
    const parts = dtf.formatToParts(new Date(utcMs));
    const g = k => +parts.find(p => p.type === k).value;
    const asUTC = Date.UTC(
      g('year'), g('month') - 1, g('day'),
      g('hour') % 24, g('minute'), g('second')
    );
    return asUTC - utcMs;
  }catch(e){ return 0; }
}

window.zonedToUTC = function(localStr, tz){
  if(!localStr) return null;
  const m = String(localStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(!m) return null;
  const y = +m[1], mo = +m[2]-1, d = +m[3], h = +m[4], mi = +m[5], s = +(m[6]||0);
  tz = tz || window.DEFAULT_TZ;
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let offset  = tzOffsetMs(tz, guess);
  let candidate = guess - offset;
  const offset2 = tzOffsetMs(tz, candidate);
  if(offset2 !== offset) candidate = guess - offset2;
  return new Date(candidate).toISOString();
};

window.utcToZonedLocal = function(iso, tz){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  tz = tz || window.DEFAULT_TZ;
  try{
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:false
    });
    const parts = dtf.formatToParts(d);
    const g = k => parts.find(p => p.type === k).value;
    let hour = g('hour');
    if(hour === '24') hour = '00';
    return g('year') + '-' + g('month') + '-' + g('day') + 'T' + hour + ':' + g('minute');
  }catch(e){ return ''; }
};

window.fillTzSelect = function(el, current){
  if(!el) return;
  const cur = current || window.DEFAULT_TZ;
  if(el.options.length === 0){
    window.TZ_OPTIONS.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.l;
      el.appendChild(opt);
    });
  }
  el.value = window.TZ_OPTIONS.find(o => o.v === cur) ? cur : window.DEFAULT_TZ;
};

window.initAllTzSelects = function(){
  document.querySelectorAll('.tz-select').forEach(el => {
    fillTzSelect(el, el.dataset.currentTz || window.DEFAULT_TZ);
  });
};

/* ---------- Media helpers ---------- */
window.dedupeMedia = function(rows){
  const seen = new Set();
  const out = [];
  (rows || []).forEach(r => {
    if(!r) return;
    const key = ((r.drive_id || '').trim().toLowerCase())
             || ((r.src      || '').trim().toLowerCase());
    if(!key) return;
    if(seen.has(key)) return;
    seen.add(key);
    out.push(r);
  });
  return out;
};

window.splitDriveIds = function(raw){
  return String(raw || '').split(',').map(x => x.trim()).filter(Boolean);
};

window.driveImg = function(id, w){
  return 'https://lh3.googleusercontent.com/d/' + id + '=w' + (w || 2000);
};

/* ---------- Requester / edit password ---------- */
window.last4Digits = function(s){
  const digits = String(s || '').replace(/\D/g, '');
  if(digits.length < 4) return digits.padStart(4, '0');
  return digits.slice(-4);
};

window.firstNameOf = function(name){
  const n = String(name || '').trim();
  if(!n) return '';
  return n.split(/\s+/)[0].replace(/[^A-Za-z]/g, '') || '';
};

window.makeRequesterEditPassword = function(requesterName, requesterWhatsapp, slug){
  const fn = firstNameOf(requesterName);
  const l4 = last4Digits(requesterWhatsapp);
  const sl = String(slug || '').toLowerCase().replace(/[^a-z0-9\-_]/g, '');
  if(!fn || !l4 || !sl) return '';
  return fn + '-EDIT-' + l4 + '-' + sl;
};

window.getEditPasswordForPerson = function(p){
  if(!p) return '';
  return makeRequesterEditPassword(
    p.requester_name || '',
    p.requester_whatsapp || '',
    p.slug || ''
  );
};

/* ---------- Misc ---------- */
window.shuffleArray = function(arr){
  const a = (arr || []).slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
};

window.getShared = function(k, def){
  const s = window.__PAGE_STATE__.CURR.shared || {};
  return s[k] !== undefined ? s[k] : def;
};

window.getText = function(k, def){
  const t = window.__PAGE_STATE__.CURR.texts || {};
  return t[k] !== undefined ? t[k] : def;
};

window.clampDuration = function(v, def, min, max){
  let n = parseFloat(v);
  if(!isFinite(n) || n <= 0) n = def;
  return Math.max(min, Math.min(max, n));
};

/* ---------- Queued toast (fast, deduped) ---------- */
(function(){
  let queue = [], showing = false, lastMsg = '', lastTime = 0;

  window.__showToast = function(msg, ok){
    const now = Date.now();
    // dedupe rapid identical toasts within 800ms
    if(msg === lastMsg && now - lastTime < 800) return;
    lastMsg = msg; lastTime = now;
    queue.push({msg: msg || '', ok: ok !== false});
    if(!showing) next();
  };

  function next(){
    if(!queue.length){ showing = false; return; }
    showing = true;
    const item = queue.shift();
    const t = $('globalToast');
    if(!t){ showing = false; return; }
    t.textContent = item.msg;
    t.classList.toggle('err', !item.ok);
    t.classList.add('show');
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(next, 180);
    }, Math.max(1100, Math.min(2400, item.msg.length * 35)));
  }
})();

/* ---------- Custom confirm dialog ---------- */
window.__confirm = function(opts){
  return new Promise(resolve => {
    const o = typeof opts === 'string' ? {message: opts} : (opts || {});
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="confirm-box">'
      + '<div class="cf-icon">' + (o.icon || '❓') + '</div>'
      + '<div class="cf-title">' + (o.title ? esc(o.title) : 'Are you sure?') + '</div>'
      + '<div class="cf-msg">' + esc(o.message || '').replace(/\n/g, '<br>') + '</div>'
      + '<div class="cf-btns">'
      +   '<button type="button" class="cf-cancel">' + esc(o.cancelText || 'Cancel') + '</button>'
      +   '<button type="button" class="' + (o.danger ? 'cf-danger' : 'cf-ok') + '">' + esc(o.okText || 'Confirm') + '</button>'
      + '</div></div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    function close(val){
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 240);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    }
    function onKey(e){
      if(e.key === 'Escape') close(false);
      if(e.key === 'Enter')  close(true);
    }
    overlay.querySelector('.cf-cancel').onclick = () => close(false);
    overlay.querySelector('.cf-ok, .cf-danger').onclick = () => close(true);
    overlay.addEventListener('click', e => { if(e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);
    setTimeout(() => overlay.querySelector('.cf-ok, .cf-danger').focus(), 30);
  });
};

/* ---------- Button loading state ---------- */
window.__btnLoading = function(btn, on, label){
  if(!btn) return;
  if(on){
    if(!btn.dataset._orig) btn.dataset._orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="prog-ring"></span> ' + esc(label || 'Loading…');
  } else {
    btn.disabled = false;
    if(btn.dataset._orig){
      btn.innerHTML = btn.dataset._orig;
      delete btn.dataset._orig;
    }
  }
};

window.refreshPage = function(){
  try{ window.location.reload(); }
  catch(e){ location.href = location.href; }
};

/* ---------- Safe storage wrapper ---------- */
window.safeStore = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, v); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
  sget(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },
  sset(k, v){ try{ sessionStorage.setItem(k, v); return true; }catch(e){ return false; } },
  sdel(k){ try{ sessionStorage.removeItem(k); }catch(e){} }
};

/* ---------- Login rate limiter ---------- */
window.__loginRate = (function(){
  const KEY = 'login_attempts';
  const WINDOW_MS = 60000;
  const MAX = 5;
  function load(){ try{ return JSON.parse(safeStore.get(KEY) || '[]') || []; }catch(e){ return []; } }
  function save(a){ safeStore.set(KEY, JSON.stringify(a)); }
  return {
    canAttempt(){
      const now = Date.now();
      const arr = load().filter(t => now - t < WINDOW_MS);
      save(arr);
      return arr.length < MAX;
    },
    record(){
      const now = Date.now();
      const arr = load().filter(t => now - t < WINDOW_MS);
      arr.push(now);
      save(arr);
    },
    retryIn(){
      const arr = load();
      if(!arr.length) return 0;
      const oldest = Math.min(...arr);
      return Math.max(0, Math.ceil((WINDOW_MS - (Date.now() - oldest)) / 1000));
    },
    clear(){ safeStore.del(KEY); }
  };
})();

/* ---------- Focus trap for modals ---------- */
window.__trapFocus = function(container){
  if(!container) return;
  const sel = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
  function onKey(e){
    if(e.key !== 'Tab') return;
    const list = Array.from(container.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
    if(!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
};

/* ============================================================
   FINISHED PEOPLE — local cache of auto-wiped persons
   ============================================================ */
const FINISHED_KEY = 'surprise_finished_people_v1';

window.getFinishedPeople = function(){
  try{
    const raw = localStorage.getItem(FINISHED_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
};

window.addFinishedPerson = function(person){
  if(!person || !person.slug) return;
  try{
    const list = getFinishedPeople();
    // Remove any previous entry with same slug
    const filtered = list.filter(x => x.slug !== person.slug);
    filtered.unshift({
      id: person.id,
      slug: person.slug,
      display_name: person.display_name,
      birthday: person.birthday,
      requester_name: person.requester_name || '',
      wiped_at: new Date().toISOString()
    });
    // cap to keep local storage small
    const trimmed = filtered.slice(0, 100);
    localStorage.setItem(FINISHED_KEY, JSON.stringify(trimmed));
  }catch(e){}
};

window.removeFinishedPerson = function(slug){
  try{
    const list = getFinishedPeople().filter(x => x.slug !== slug);
    localStorage.setItem(FINISHED_KEY, JSON.stringify(list));
  }catch(e){}
};

window.clearFinishedPeople = function(){
  try{ localStorage.removeItem(FINISHED_KEY); }catch(e){}
};

})();