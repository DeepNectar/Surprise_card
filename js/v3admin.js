/* ============================================================
   v3admin.js — V3 admin add-ons: 📈 Insights dashboard + 💌 Bulk share
   Reads only existing state (S.PEOPLE, S.REVIEWS, sb.guests(),
   localStorage reaction/view counters). No rules changed.
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function $(id){ return document.getElementById(id); }

/* ---------- local counters written by viewer.js / home.js ---------- */
function localCount(prefix){
  /* sum numeric values stored under localStorage keys starting with prefix */
  let total = 0;
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(!k || k.indexOf(prefix) !== 0) continue;
      const raw = localStorage.getItem(k);
      if(raw == null) continue;
      try{
        const obj = JSON.parse(raw);
        if(obj && typeof obj === 'object'){
          Object.keys(obj).forEach(x => { total += parseInt(obj[x], 10) || 0; });
        } else {
          total += parseInt(raw, 10) || 0;
        }
      }catch(e){ total += parseInt(raw, 10) || 0; }
    }
  }catch(e){}
  return total;
}
function viewsForSlug(slug){
  let n = 0;
  try{ n = parseInt(localStorage.getItem('v3views_' + slug), 10) || 0; }catch(e){}
  return n;
}
function reactionsForSlug(slug){
  let n = 0;
  try{
    const raw = localStorage.getItem('react_' + slug);
    if(raw){
      const obj = JSON.parse(raw);
      Object.keys(obj || {}).forEach(k => { n += parseInt(obj[k], 10) || 0; });
    }
  }catch(e){}
  return n;
}

/* ============================================================
   📈 INSIGHTS DASHBOARD
   ============================================================ */
window.renderAnalytics = async function(){
  const statsWrap = $('anaStats');
  const topWrap   = $('anaTopCards');
  if(!statsWrap || !topWrap) return;

  /* make sure people + reviews are loaded (reuses cached state if present) */
  try{
    if(!S.PEOPLE || !S.PEOPLE.length) S.PEOPLE = await sb.people() || [];
    if(!Array.isArray(S.REVIEWS)) S.REVIEWS = await sb.reviews() || [];
  }catch(e){ /* offline-safe: keep whatever we have */ }

  const people  = S.PEOPLE || [];
  const reviews = S.REVIEWS || [];
  const avg     = reviews.length
    ? Math.round((reviews.reduce((a,r)=>a+(parseInt(r.stars)||0),0)/reviews.length)*10)/10
    : 0;

  let guestsApproved = 0;
  try{
    if(sb && sb.guests){
      const rows = await sb.guests();
      guestsApproved = (rows || []).filter(r => r.status === 'approved').length;
    }
  }catch(e){}

  const totalViews = people.reduce((a,p)=>a+viewsForSlug(p.slug),0);
  const totalReact = people.reduce((a,p)=>a+reactionsForSlug(p.slug),0);

  const cards = [
    ['🎁','Live cards', people.length],
    ['⭐','Avg rating', avg || '—'],
    ['💬','Reviews', reviews.length],
    ['👀','Card opens*', totalViews],
    ['❤️','Reactions*', totalReact],
    ['✅','Guests approved', guestsApproved]
  ];
  statsWrap.innerHTML = cards.map(c =>
    '<div class="ana-card"><div class="ana-num">' + esc(c[2]) + '</div>' +
    '<div class="ana-lbl">' + c[0] + ' ' + esc(c[1]) + '</div></div>'
  ).join('') +
  '<div class="ana-note">*Open &amp; reaction counts are per-device (this browser) — privacy-friendly, no extra tables.</div>';

  /* top performing cards = reviews + reactions + opens score */
  const scored = people.map(p => {
    const rv = reviews.filter(r => r.person_slug && p.slug &&
      String(r.person_slug).toLowerCase() === String(p.slug).toLowerCase());
    const stars = rv.length
      ? Math.round((rv.reduce((a,r)=>a+(parseInt(r.stars)||0),0)/rv.length)*10)/10 : 0;
    const score = rv.length * 10 + (stars * 2) + reactionsForSlug(p.slug) + viewsForSlug(p.slug);
    return {p:p, revs:rv.length, stars:stars, score:score};
  }).sort((a,b)=>b.score-a.score).slice(0,6);

  if(!scored.length){
    topWrap.innerHTML = '<em style="font-size:.8rem;color:var(--c-text-muted);">No cards yet.</em>';
    return;
  }
  const max = Math.max(scored[0].score, 1);
  topWrap.innerHTML = scored.map((s,i) =>
    '<div class="ana-row">' +
      '<span class="ana-rank">' + (i+1) + '</span>' +
      '<span class="ana-name">' + esc(s.p.display_name || s.p.slug) + '</span>' +
      '<span class="ana-meta">⭐' + s.revs + (s.stars ? ' · ' + s.stars : '') +
        ' · ❤️' + reactionsForSlug(s.p.slug) + ' · 👀' + viewsForSlug(s.p.slug) + '</span>' +
      '<span class="ana-bar"><i style="width:' + Math.max(4, Math.round(s.score/max*100)) + '%"></i></span>' +
    '</div>'
  ).join('');
};

/* ============================================================
   💌 BULK WHATSAPP SHARING
   ============================================================ */
let bulkRows = [];

window.renderBulkShare = async function(){
  const list = $('bulkShareList');
  if(!list) return;
  list.innerHTML = '<em style="font-size:.8rem;color:var(--c-text-muted);">Loading approved cards…</em>';

  let rows = [];
  try{ rows = await sb.guests() || []; }catch(e){}
  bulkRows = rows.filter(r => r.status === 'approved');

  if(!bulkRows.length){
    list.innerHTML = '<div class="empty-state" style="padding:.6rem 0;"><span class="es-emoji">📭</span>No approved guest cards to share yet.</div>';
    return;
  }

  list.innerHTML = '';
  bulkRows.forEach((r, idx) => {
    const pl   = r.payload || {};
    const prop = pl.person_proposal || {};
    const gi   = pl.guest_info || {};
    const wa   = String(r.guest_whatsapp || gi.whatsapp || '').replace(/[^0-9]/g,'');
    const loginId = r.approved_login_id || prop.slug || r.target_person_slug || '';
    const pwd  = r.approved_password || '';
    const link = window.repointShareLink ? window.repointShareLink(r.approved_share_link || '', loginId)
               : (r.approved_share_link || '');

    const row = document.createElement('label');
    row.className = 'bulk-row';
    row.innerHTML =
      '<input type="checkbox" class="bulk-check" data-idx="' + idx + '"' + (wa ? '' : ' disabled') + '>' +
      '<span class="bulk-info"><strong>' + esc(r.guest_name || gi.name || 'Guest') + '</strong>' +
        '<span class="bulk-sub">' + esc(prop.name || loginId || '') +
        (wa ? ' · 📱+' + esc(wa) : ' · ⚠️ no number') + '</span></span>' +
      '<button type="button" class="bulk-one" title="Send just this one">➡️</button>';
    list.appendChild(row);

    row.querySelector('.bulk-one').addEventListener('click', ev => {
      ev.preventDefault(); ev.stopPropagation();
      sendOne(idx);
    });
  });
};

function collectSelected(){
  const out = [];
  document.querySelectorAll('#bulkShareList .bulk-check').forEach(cb => {
    if(cb.checked) out.push(parseInt(cb.getAttribute('data-idx'), 10));
  });
  return out;
}

function messageFor(r){
  const pl   = r.payload || {};
  const prop = pl.person_proposal || {};
  const gi   = pl.guest_info || {};
  const loginId = r.approved_login_id || prop.slug || r.target_person_slug || '';
  const pwd  = r.approved_password || '';
  const link = window.repointShareLink ? window.repointShareLink(r.approved_share_link || '', loginId)
             : (r.approved_share_link || window.getShareBaseUrl ? window.getShareBaseUrl() : location.origin);
  const name = gi.name || r.guest_name || 'there';
  return '💌 Hi ' + name + ', your surprise card is ready!\n\n' +
         '🔑 Login ID: ' + loginId + '\n' +
         (pwd  ? '🔒 Card password: ' + pwd + '\n' : '') +
         '🎁 Open it here: ' + link;
}

function sendOne(idx){
  const r = bulkRows[idx];
  if(!r) return;
  const wa = String(r.guest_whatsapp || (r.payload && r.payload.guest_info && r.payload.guest_info.whatsapp) || '').replace(/[^0-9]/g,'');
  if(!wa){ try{ alert('This guest has no WhatsApp number on file.'); }catch(e){} return; }
  const url = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(messageFor(r));
  window.open(url, '_blank');
  try{ localStorage.setItem('v3bultsent_' + r.id, String(Date.now())); }catch(e){}
}

window.bulkSendSelected = function(){
  const idxs = collectSelected();
  if(!idxs.length){
    const btn = $('bulkSendBtn');
    if(btn){ const o = btn.textContent; btn.textContent = '☝️ Tick at least one card first'; setTimeout(()=>{btn.textContent=o;},1600); }
    return;
  }
  /* sequential with small delay so each WhatsApp tab/sheet registers */
  idxs.forEach((ix, n) => setTimeout(() => sendOne(ix), n * 700));
};

/* ---------- wire buttons once DOM ready ---------- */
function wire(){
  const refreshA = $('anaRefreshBtn');
  if(refreshA && !refreshA.dataset.wired){
    refreshA.dataset.wired = '1';
    refreshA.addEventListener('click', () => { refreshA.textContent = '⏳ Refreshing…'; window.renderAnalytics().finally(()=>{ refreshA.textContent = '🔄 Refresh insights'; }); });
  }
  const refreshB = $('bulkRefreshBtn');
  if(refreshB && !refreshB.dataset.wired){ refreshB.dataset.wired='1'; refreshB.addEventListener('click', ()=>window.renderBulkShare()); }
  const selAll = $('bulkSelectAllBtn');
  if(selAll && !selAll.dataset.wired){
    selAll.dataset.wired='1';
    selAll.addEventListener('click', () => {
      const boxes = Array.prototype.slice.call(document.querySelectorAll('#bulkShareList .bulk-check')).filter(b=>!b.disabled);
      const allOn = boxes.length && boxes.every(b=>b.checked);
      boxes.forEach(b=>{ b.checked = !allOn; });
      selAll.textContent = allOn ? '☑️ Select all' : '⬜ Clear all';
    });
  }
  const sendBtn = $('bulkSendBtn');
  if(sendBtn && !sendBtn.dataset.wired){ sendBtn.dataset.wired='1'; sendBtn.addEventListener('click', ()=>window.bulkSendSelected()); }

  /* render lazily when the admin pane switches to these tabs */
  document.querySelectorAll('.panel-tab').forEach(tab => {
    if(tab.dataset.wiredV3) return;
    tab.dataset.wiredV3 = '1';
    tab.addEventListener('click', () => {
      const pane = tab.getAttribute('data-pane');
      if(pane === 'pane-analytics') window.renderAnalytics();
      if(pane === 'pane-bulkshare') window.renderBulkShare();
    });
  });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', wire);
} else { wire(); }

})();
