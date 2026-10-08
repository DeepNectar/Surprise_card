/* ============================================================
   aiwriter.js — v1.0 AI MESSAGE WRITER
   ------------------------------------------------------------
   Drafts romantic card messages, story captions and gift notes
   from a few prompts. Provider-agnostic:
   • OpenAI-compatible endpoint (set key in admin → Settings →
     "AI writer"; keys are stored in localStorage ONLY, never
     synced to the cloud).
   • Built-in offline template engine (no key required) so the
     feature always works — picks/composes from 60+ curated
     romantic templates using the person's name, occasion,
     relation and tone.
   UI: an ✨ sparkle button next to every big message textarea
   in the guest/requester/admin editors.
   ============================================================ */
(function(){
'use strict';

const LS_KEY = 'lc_ai_cfg_v1';

window.aiGetCfg = function(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY) || '{"mode":"offline","key":"","model":"gpt-4o-mini","base":"https://api.openai.com/v1"}'); }
  catch(e){ return { mode:'offline', key:'', model:'gpt-4o-mini', base:'https://api.openai.com/v1' }; }
};
window.aiSetCfg = function(cfg){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(cfg || {})); }catch(e){}
};

/* ---------- Offline template engine ---------- */
const OPENERS = {
  romantic: ['My dearest {name},','To the love of my life, {name},','{name}, my heart’s favourite person,','Hey {name}, my forever flame,'],
  funny:    ['Yo {name}, it’s me — your favourite human,','{name}! Yes you, the gorgeous one,','Attention {name}: official love bulletin,','{name}, put down the phone and prepare to melt,'],
  sweet:    ['Dear {name},','To my sunshine {name},','Hello {name}, thinking of you again,','For {name}, who makes everything brighter,'],
  emotional:['{name}, I’ve been meaning to say this…','To {name}, from the bottom of my heart,','{name}, some feelings deserve words,','Dear {name}, please read this slowly,']
};
const BODIES = {
  romantic: [
    'Every ordinary day with you turns into a memory I want to keep forever. You are my today and all of my tomorrows.',
    'Loving you is the easiest thing I have ever done — and the best decision I will ever keep making.',
    'If I had to live my life again, I would find you sooner so I could love you longer.',
    'You are the poem I never knew how to write and the song my heart hums without knowing.',
    'Somewhere between all our laughs and late-night talks, you became my favourite place to be.'
  ],
  funny: [
    'I love you more than coffee — and honestly, that is saying a LOT. Thanks for putting up with me all these years.',
    'You’re the only person I’d share my fries with. Maybe even the last one. That’s true love right there.',
    'They say perfection doesn’t exist, yet here you are, annoyingly flawless, loving me anyway.',
    'I was going to write something poetic, but then I remembered you already married/dated the funniest person you know. So… this IS the poem.',
    'You + Me = chaos with excellent chemistry. Wouldn’t trade our madness for anything.'
  ],
  sweet: [
    'Thank you for the small things — the good-morning texts, the saved snacks, the way you listen like it matters. It all matters. YOU matter.',
    'You make ordinary moments feel like celebrations. Being loved by you is my favourite thing about being alive.',
    'Just a little note to say: you crossed my mind, made me smile, and here we are.',
    'The world is softer and kinder because you are in it — and my world especially so.',
    'I hope today treats you the way you treat everyone else: gently, warmly, wonderfully.'
  ],
  emotional: [
    'There aren’t enough birthdays or anniversaries to celebrate how much you’ve changed my life for the better. Thank you for staying.',
    'Through every high and every hard season, your hand never left mine. I will never, ever take that for granted.',
    'You have seen me at my worst and loved me like it was nothing. Somehow, that means absolutely everything.',
    'Distance, time, plans — none of it has ever changed what I feel for you. It has only grown quieter and deeper.',
    'If one day you forget your worth, come back and read this: you are the best thing that ever happened to me.'
  ]
};
const CLOSERS = {
  romantic: ['Forever yours 💍','Yours, always and completely 💖','With all my love, today and every day 💕'],
  funny:    ['Love you loads (now go hydrate) 😘','Your biggest fan & least annoying ex-friend 😌💕','Yours, unfortunately 🤡❤️'],
  sweet:    ['Sending you a hug through the screen 🤗','With love and sprinkles ✨🎂','Always in your corner 💖'],
  emotional:['With everything I am ❤️','Grateful for you, endlessly 🙏','Now and always, me — for you 💞']
};

function pick(a){ return a[Math.floor(Math.random() * a.length)]; }

window.aiOfflineDraft = function(ctx){
  const tone = (ctx.tone || 'romantic').toLowerCase();
  const name = ctx.name || 'my love';
  const occ  = ctx.occasion || '';
  const extra = ctx.note ? ('\n\nYou asked me to add this: ' + ctx.note.trim()) : '';
  const head = occ ? ('Happy ' + occ.replace(/^\w/, c => c.toUpperCase()) + ', ') : '';
  return pick(OPENERS[tone] || OPENERS.romantic).replace('{name}', name)
    + '\n\n' + head + pick(BODIES[tone] || BODIES.romantic) + extra
    + '\n\n' + pick(CLOSERS[tone] || CLOSERS.romantic);
};

/* ---------- Online providers (OpenAI-compatible chat API) ---------- */
window.aiGenerate = async function(ctx){
  const cfg = window.aiGetCfg();
  if(cfg.mode !== 'online' || !cfg.key){
    return window.aiOfflineDraft(ctx);
  }
  const sys = 'You are a romantic greeting-card copywriter. Write warm, personal, original messages in the requested tone. Return ONLY the message text.';
  const user = 'Write a ' + (ctx.tone || 'romantic') + ' message for a surprise '
    + (ctx.occasion || 'love') + ' card from ' + (ctx.from || 'their loved one')
    + ' to ' + (ctx.name || 'the recipient') + '.'
    + (ctx.relation ? ' Relationship: ' + ctx.relation + '.' : '')
    + (ctx.note ? ' Include these memories/details naturally: ' + ctx.note : '')
    + ' Length: 60-120 words. Language: ' + (ctx.lang || 'English') + '.';
  try{
    const r = await fetch((cfg.base || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: [{ role:'system', content: sys }, { role:'user', content: user }],
        temperature: 0.9, max_tokens: 260
      })
    });
    if(!r.ok) throw new Error('AI ' + r.status);
    const j = await r.json();
    const txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if(txt) return txt.trim();
    throw new Error('empty');
  }catch(e){
    /* graceful degrade to offline engine */
    return window.aiOfflineDraft(ctx) + '\n\n(✉️ offline draft — AI service unavailable)';
  }
};

/* ---------- Sparkle buttons injected next to textareas ---------- */
const TARGETS = ['msg1','msg2','msg3','msg4','msg5','greeting','signoff'];

function ensureUI(){
  TARGETS.forEach(k => {
    document.querySelectorAll('[data-field="' + k + '"], #ge_' + k + ', [id$="_' + k + '"]').forEach(ta => {
      if(!(ta.tagName === 'TEXTAREA' || ta.tagName === 'INPUT')) return;
      if(ta.dataset.aiBound) return;
      ta.dataset.aiBound = '1';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-sparkle';
      btn.title = '✨ AI-draft this message';
      btn.textContent = '✨';
      btn.style.cssText = 'position:absolute;right:6px;top:6px;z-index:5;border:none;background:rgba(255,105,180,.15);border-radius:8px;padding:.15rem .4rem;cursor:pointer;font-size:.95rem;';
      if(getComputedStyle(ta.parentElement).position === 'static'){
        ta.parentElement.style.position = 'relative';
      }
      ta.parentElement.appendChild(btn);
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        await window.aiFillField(ta);
      });
    });
  });
}

window.aiFillField = async function(ta){
  const S = window.__PAGE_STATE__ || {};
  const p = S.CURRENT_PERSON || (window.GE && window.GE.person) || {};
  const ctx = {
    name: p.display_name || 'my love',
    from: (window.GE && window.GE.guest && window.GE.guest.name) || '',
    relation: (window.GE && window.GE.guest && window.GE.guest.relation) || '',
    occasion: (window.GE && window.GE.guest && window.GE.guest.occasion) || (p.birthday ? 'birthday' : 'anniversary'),
    note: '',
    tone: 'romantic',
    lang: (S.CURR_LANG || 'en') === 'en' ? 'English' : ((S.CURR_LANG || 'en') === 'hi' ? 'Hindi' : 'Gujarati')
  };
  const tone = prompt('Tone? (romantic / funny / sweet / emotional)', 'romantic');
  if(tone === null) return;
  ctx.tone = (['romantic','funny','sweet','emotional'].indexOf((tone||'').trim().toLowerCase()) >= 0)
    ? tone.trim().toLowerCase() : 'romantic';
  const note = prompt('Any memories or details to include? (optional)', '') || '';
  ctx.note = note;
  const oldPh = ta.placeholder;
  ta.value = '';
  ta.placeholder = '✨ Writing something beautiful…';
  const out = await window.aiGenerate(ctx);
  ta.placeholder = oldPh;
  ta.value = out;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
};

/* Re-scan after panels render */
const MO = new MutationObserver(() => { clearTimeout(MO._t); MO._t = setTimeout(ensureUI, 400); });
document.addEventListener('DOMContentLoaded', () => {
  ensureUI();
  MO.observe(document.body, { childList: true, subtree: true });
});

})();
