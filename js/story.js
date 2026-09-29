/* ============================================================
   story.js — Story pages with mini slideshow (compositor-safe)
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
let STORY_IDX = 0;
let STORY_T = null;
let STORY_AUTOPLAY = false;
let STORY_MINI = null;

function storyDurationMs(){
  const s = S.CURR.shared || {};
  const v = clampDuration(
    s.storySlideDefaultSec || s.storySlideDuration || '10',
    10, 1, 30
  );
  return v * 1000;
}

window.renderStoryPage = function(){
  const viewer = $('storyViewer');
  if(!viewer) return;

  const pages = S.CURR.story || [];
  if(STORY_MINI){ STORY_MINI.stop(); STORY_MINI = null; }

  if(!pages.length){
    viewer.innerHTML = '<p style="text-align:center;color:var(--c-text-muted);">No story pages yet.</p>';
    return;
  }

  const s = pages[STORY_IDX] || {};
  let h = '<div class="story-page">';
  h += '<div id="storySlideWrap"></div>';
  if(s.title) h += `<h3>${esc(s.title)}</h3>`;
  if(s.body) h += `<p>${esc(s.body).replace(/\n/g, '<br>')}</p>`;
  h += '</div>';
  viewer.innerHTML = h;

  const ids = splitDriveIds(s.photo_drive_id);
  if(ids.length){
    STORY_MINI = window.buildMiniSlideshow(
      viewer.querySelector('#storySlideWrap'),
      ids,
      storyDurationMs()
    );
  }

  txt($('storyPageNum'), (STORY_IDX + 1) + ' / ' + pages.length);
  txt($('storySlideCounter'), 'Page ' + (STORY_IDX + 1) + ' / ' + pages.length);

  const prog = $('storySlideProgress');
  if(prog){ prog.style.transition = 'none'; prog.style.width = '0%'; }
};

function storyNext(){
  const n = (S.CURR.story || []).length;
  if(!n) return;
  STORY_IDX = (STORY_IDX + 1) % n;
  renderStoryPage();
  if(STORY_AUTOPLAY) startStoryAutoPlay();
}
function storyPrev(){
  const n = (S.CURR.story || []).length;
  if(!n) return;
  STORY_IDX = (STORY_IDX - 1 + n) % n;
  renderStoryPage();
  if(STORY_AUTOPLAY) startStoryAutoPlay();
}

function startStoryAutoPlay(){
  if(STORY_T){ clearTimeout(STORY_T); clearInterval(STORY_T); STORY_T = null; }
  if(!STORY_AUTOPLAY) return;

  const dur = storyDurationMs();
  const prog = $('storySlideProgress');
  if(prog){
    // ✅ no forced reflow — use double rAF
    prog.style.transition = 'none';
    prog.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        prog.style.transition = 'width ' + dur + 'ms linear';
        prog.style.width = '100%';
      });
    });
  }

  STORY_T = setTimeout(() => {
    if(STORY_AUTOPLAY) storyNext();
  }, dur);
}

function closeStoryModal(){
  if(STORY_T){ clearTimeout(STORY_T); clearInterval(STORY_T); STORY_T = null; }
  if(STORY_MINI){ STORY_MINI.stop(); STORY_MINI = null; }
  hide($('storyModal'));
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = $('storyBtn');
  if(btn) btn.onclick = () => {
    STORY_IDX = 0;
    STORY_AUTOPLAY = (S.CURR.shared || {}).storySlideshowEnabled === 'true';
    const ui = $('storySlideUI');
    if(ui) ui.style.display = STORY_AUTOPLAY ? 'flex' : 'none';
    renderStoryPage();
    show($('storyModal'));
    startStoryAutoPlay();
  };

  const next = $('storyNext');
  if(next) next.onclick = () => {
    storyNext();
    if(STORY_AUTOPLAY) startStoryAutoPlay();
  };
  const prev = $('storyPrev');
  if(prev) prev.onclick = () => {
    storyPrev();
    if(STORY_AUTOPLAY) startStoryAutoPlay();
  };

  const close = $('storyClose');
  if(close) close.onclick = closeStoryModal;

  const pause = $('storySlidePause');
  if(pause) pause.onclick = () => {
    if(STORY_T){
      clearTimeout(STORY_T); clearInterval(STORY_T); STORY_T = null;
      pause.textContent = '▶';
    } else {
      startStoryAutoPlay();
      pause.textContent = '⏸';
    }
  };

  const modal = $('storyModal');
  if(modal) modal.addEventListener('click', e => {
    if(e.target === modal) closeStoryModal();
  });
});

})();
