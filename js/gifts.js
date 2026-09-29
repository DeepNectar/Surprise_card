/* ============================================================
   gifts.js — Gift boxes + mini slideshow helper (compositor-safe)
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

window.renderGifts = function(){
  const w = $('giftRow');
  const sec = $('giftSection');
  if(!w || !sec) return;

  const gifts = S.CURR.gifts || [];
  const s = S.CURR.shared || {};
  if(s.enableGiftBox !== 'true' || !gifts.length){
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
  txt($('giftSectionTitleEl'), (S.CURR.texts || {}).giftSectionTitle || 'Tap a gift 💝');

  w.innerHTML = '';
  gifts.forEach(g => {
    const d = document.createElement('div');
    d.className = 'gift-box';
    d.innerHTML =
      `<div class="gift-emoji">${g.emoji || '🎁'}</div>` +
      `<div class="gift-label">${esc(g.title || 'Open me!')}</div>`;
    d.onclick = () => window.openGift(g);
    w.appendChild(d);
  });
};

/* ---------- Mini slideshow builder (SAFE) ---------- */
window.buildMiniSlideshow = function(container, ids, durationMs){
  if(!container) return null;
  const list = (ids || []).filter(Boolean);
  if(!list.length) return null;

  durationMs = durationMs || MODAL_IMG_DURATION_MS;
  container.innerHTML = '';
  container.classList.add('mini-slide-wrap');

  const img = document.createElement('img');
  img.className = 'mini-slide-img';
  img.loading = 'lazy';
  img.decoding = 'async';
  /* Request a Google-served resize (~1400w) instead of the full original:
     visually identical on phones/laptops but far faster to download. */
  img.src = driveImg(list[0], 1400);
  img.onerror = () => { img.src = 'https://drive.google.com/thumbnail?id=' + list[0] + '&sz=w1400'; };
  container.appendChild(img);

  const counter = document.createElement('div');
  counter.className = 'mini-slide-counter';
  container.appendChild(counter);

  const prog = document.createElement('div');
  prog.className = 'mini-slide-progress';
  container.appendChild(prog);

  let dots = null;
  let idx = 0;
  let timer = null;
  let destroyed = false;

  if(list.length > 1){
    dots = document.createElement('div');
    dots.className = 'mini-slide-dots';
    list.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'dot';
      d.onclick = () => { idx = i; render(); };
      dots.appendChild(d);
    });
    container.appendChild(dots);

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'mini-slide-nav prev';
    prev.textContent = '❮';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'mini-slide-nav next';
    next.textContent = '❯';
    container.appendChild(prev);
    container.appendChild(next);
    prev.onclick = e => { e.stopPropagation(); idx = (idx - 1 + list.length) % list.length; render(); };
    next.onclick = e => { e.stopPropagation(); idx = (idx + 1) % list.length; render(); };
  }

  function render(){
    if(destroyed) return;
    img.style.opacity = '0';
    setTimeout(() => {
      if(destroyed) return;
      img.src = driveImg(list[idx], 1400);
      img.onerror = () => { img.src = 'https://drive.google.com/thumbnail?id=' + list[idx] + '&sz=w1400'; };
      img.style.opacity = '1';
    }, 160);

    counter.textContent = (idx + 1) + ' / ' + list.length;
    if(dots) dots.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === idx));

    // ✅ No forced reflow — double rAF to restart width transition
    prog.style.transition = 'none';
    prog.style.width = '0%';
    if(list.length > 1){
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if(destroyed) return;
          prog.style.transition = 'width ' + durationMs + 'ms linear';
          prog.style.width = '100%';
          if(timer) clearTimeout(timer);
          timer = setTimeout(() => {
            if(destroyed) return;
            idx = (idx + 1) % list.length;
            render();
          }, durationMs);
        });
      });
    }
  }
  render();

  return {
    stop(){
      destroyed = true;
      if(timer){ clearTimeout(timer); timer = null; }
    }
  };
};

/* ---------- Open a gift ---------- */
window.openGift = function(g){
  const m = document.createElement('div');
  m.className = 'info-modal active';
  let h = '<div class="info-content">';
  h += '<button class="info-close" id="gmClose">✕</button>';
  h += '<div class="info-title">' + esc(g.title || '') + '</div>';
  h += '<div id="giftSlideWrap"></div>';
  if(g.message) h += '<p style="font-size:1rem;line-height:1.6;color:var(--c-text);font-style:italic;">' + esc(g.message) + '</p>';
  h += '</div>';
  m.innerHTML = h;
  document.body.appendChild(m);

  const ids = splitDriveIds(g.photo_drive_id);
  let mini = null;
  if(ids.length){
    mini = buildMiniSlideshow(m.querySelector('#giftSlideWrap'), ids, MODAL_IMG_DURATION_MS);
  }
  m.querySelector('#gmClose').onclick = () => {
    if(mini) mini.stop();
    m.remove();
  };
};

})();
