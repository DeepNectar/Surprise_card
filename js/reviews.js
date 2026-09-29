/* ============================================================
   reviews.js — Home review rendering + admin review list
   ============================================================ */
(function(){
'use strict';
const S = window.__PAGE_STATE__;

window.starsHtml = function(n){
  let s = '';
  for(let i = 1; i <= 5; i++){
    s += `<span style="color:${i <= n ? '#ffb703' : '#ddd'};">★</span>`;
  }
  return s;
};

window.applyHomeReviewsCollapsed = function(){
  const wrap = $('homeReviews');
  if(!wrap) return;
  wrap.classList.toggle('collapsed', !!S.REVIEWS_COLLAPSED);
};

window.renderHomeReviews = function(){
  const wrap = $('homeReviews');
  const list = $('homeReviewsList');
  const moreWrap = $('homeReviewsMore');
  if(!wrap || !list) return;

  const revs = S.REVIEWS || [];
  if(!revs.length){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  const lim = S.HOME_REVIEW_LIMIT;
  const shown = revs.slice(0, lim);

  list.innerHTML = shown.map(r => {
    const stars = Math.max(1, Math.min(5, parseInt(r.stars) || 0));
    const personLabel = (r.person_name || r.person_slug || '');
    const personId = r.person_slug ? ('#' + r.person_slug) : '';
    const req = r.requester_name || 'Admin';
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
    return `<div class="hr-item">
      <div class="hr-stars">${starsHtml(stars)}</div>
      <div class="hr-line"><strong>Person:</strong> ${esc(personLabel)}
        ${personId ? ('<span style="opacity:.7;font-family:monospace;font-size:.75rem;">' + esc(personId) + '</span>') : ''}
      </div>
      <div class="hr-line"><strong>Requested by:</strong> ${esc(req)}</div>
      <div class="hr-msg">"${esc(r.message || '')}"</div>
      <div class="hr-meta">${date ? esc(date) : ''}</div>
    </div>`;
  }).join('');

  moreWrap.style.display = (revs.length > lim) ? 'block' : 'none';
  window.applyHomeReviewsCollapsed();
};

window.loadReviews = async function(){
  S.REVIEWS = await sb.reviews() || [];
  renderHomeReviews();
  if(S.ADMIN_MODE && window.renderAdminReviews) window.renderAdminReviews();
};

window.hasReviewFor = function(slug){
  if(!slug) return false;
  const low = slug.toLowerCase();
  return (S.REVIEWS || []).some(r => r.person_slug && r.person_slug.toLowerCase() === low);
};

/* ---------- Admin review list ---------- */
window.renderAdminReviews = function(){
  const list = $('adminReviewsList');
  if(!list) return;

  const revs = S.REVIEWS || [];
  if(!revs.length){
    list.innerHTML = '<div class="empty-state"><span class="es-emoji">⭐</span>No reviews yet.</div>';
    return;
  }

  list.innerHTML = revs.map(r => {
    const stars = Math.max(0, Math.min(5, parseInt(r.stars) || 0));
    const date = r.created_at ? new Date(r.created_at).toLocaleString() : '';
    const personLabel = r.person_name || r.person_slug || '—';
    const personId = r.person_slug ? ('#' + r.person_slug) : '';
    return `<div class="repeat-row" style="background:linear-gradient(135deg,#fffdf8,#fff5e0);">
      <div style="font-size:.85rem;line-height:1.6;">
        <div style="font-size:1.1rem;color:#ffb703;letter-spacing:2px;">${starsHtml(stars)}</div>
        <strong>${esc(personLabel)}</strong>
        ${personId ? ('<span class="person-id-pill" style="margin-left:.4rem;">' + esc(personId) + '</span>') : ''}
        <div style="font-size:.75rem;color:var(--c-text-muted);font-style:italic;margin-top:.2rem;">
          ${esc(r.requester_name || 'Admin')} · ${esc(date)}
        </div>
        <hr style="border:none;border-top:1px dashed rgba(196,30,58,.25);margin:.4rem 0;">
        <div style="font-style:italic;">"${esc(r.message || '')}"</div>
        ${r.email ? ('<div style="font-size:.72rem;color:var(--c-text-muted);">✉️ ' + esc(r.email) + '</div>') : ''}
      </div>
      <button class="repeat-remove" data-rid="${r.id}" title="Delete review">✕</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.repeat-remove[data-rid]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.rid;
      const ok = await __confirm({
        icon: '🗑️',
        title: 'Delete review?',
        message: 'This review will be permanently removed from the home screen.',
        okText: 'Delete',
        danger: true
      });
      if(!ok) return;
      try{
        await sb.delReview(id);
        __showToast('🗑️ Review deleted');
        await window.loadReviews();
      }catch(e){
        __showToast('❌ ' + e.message, false);
      }
    };
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const btn = $('homeReviewsMoreBtn');
  if(btn) btn.onclick = () => { S.HOME_REVIEW_LIMIT += 10; renderHomeReviews(); };
});

})();