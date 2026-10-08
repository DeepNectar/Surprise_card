/* ============================================================
   typewriter.js — Animated typewriter for card text
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
let TW_TIMERS = [];
let TW_STARTED = false;
let TW_DONE = false;
let TW_ABORT = false;

function clearTW(){
  while(TW_TIMERS.length) clearTimeout(TW_TIMERS.pop());
}

function graphemes(str){
  try{
    const seg = new Intl.Segmenter('en', {granularity:'grapheme'});
    return Array.from(seg.segment(str), x => x.segment);
  }catch(e){
    return Array.from(str);
  }
}

window.restartTypewriter = function(){
  TW_STARTED = false;
  TW_DONE = false;
  TW_ABORT = false;
  clearTW();
  const g = $('typeGreeting');
  if(g) g.textContent = '';
  document.querySelectorAll('.type-para').forEach(p => p.textContent = '');
  window.startTypewriter();
};

window.startTypewriter = function(){
  if(TW_STARTED) return;
  TW_STARTED = true;

  const g = $('typeGreeting');
  if(!g) return;

  const t = S.CURR.texts || {};
  const gt = t.greeting || 'Dear you,';
  g.textContent = '';

  const paras = Array.from(document.querySelectorAll('.type-para'));
  const keys = ['msg1','msg2','msg3','msg4','msg5','signoff'];
  const queue = [{el: g, text: gt, isG: true}];
  paras.forEach((p, i) => {
    p.textContent = '';
    queue.push({el: p, text: t[keys[i]] || '', isG: false});
  });

  let qi = 0;
  const CD = 32;

  const cur = document.createElement('span');
  cur.className = 'type-cursor';

  function next(){
    if(TW_ABORT) return;
    if(qi >= queue.length){
      if(cur.parentNode) cur.remove();
      TW_DONE = true;
      return;
    }
    const item = queue[qi];
    item.el.appendChild(cur);
    const chars = graphemes(item.text);
    let ci = 0;

    function step(){
      if(TW_ABORT) return;
      if(ci < chars.length){
        cur.insertAdjacentText('beforebegin', chars[ci]);
        ci++;
        TW_TIMERS.push(setTimeout(step, CD));
      } else {
        cur.remove();
        qi++;
        TW_TIMERS.push(setTimeout(next, item.isG ? 500 : 350));
      }
    }
    step();
  }
  next();
};

})();