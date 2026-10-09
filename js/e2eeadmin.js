/* ============================================================
   e2eeadmin.js — v1.0 DECRYPT-ON-RENDER HOOKS ONLY
   ------------------------------------------------------------
   The admin encryption panel section was removed (it injected UI
   into the security pane and could stall the page).

   • Render hooks (additive, async, never break the sync path):
       gifts.openGift  → decrypts lcmsg: message before display
       story.renderStoryPage → decrypts lcmsg: body
     Undecryptable envelopes show the 🔒 notice from e2ee.js.
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
function $id(id){ return document.getElementById(id); }

/* ---------- decrypt-on-render hooks ---------- */
function hookGifts(){
  const orig = window.openGift;
  if(!orig || orig.__lcE2ee) return;
  const w = function(g){
    try{
      if(window.lcIsEncryptedMsg && window.lcIsEncryptedMsg(g.message)){
        const pid = (S.CURRENT_PERSON && S.CURRENT_PERSON.id) || g.person_id;
        window.lcDecryptText(g.message, pid)
          .then(pt => { g.message = pt; orig(g); })
          .catch(() => { g.message = '🔒 Encrypted — reopen this card with your PIN to read it.'; orig(g); });
        return;
      }
    }catch(e){}
    return orig(g);
  };
  w.__lcE2ee = true;
  window.openGift = w;
}

function hookStory(){
  const orig = window.renderStoryPage;
  if(!orig || orig.__lcE2ee) return;
  let busy = false;
  const w = function(){
    orig();
    try{
      const pages = (S.CURR && S.CURR.story) || [];
      const enc = pages.some(p => window.lcIsEncryptedMsg && window.lcIsEncryptedMsg(p.body));
      if(enc && !busy){
        busy = true;
        const pid = S.CURRENT_PERSON && S.CURRENT_PERSON.id;
        Promise.all(pages.map(p =>
            window.lcIsEncryptedMsg(p.body)
              ? window.lcDecryptText(p.body, p.person_id || pid).catch(() => '🔒 Encrypted — reopen this card with your PIN to read it.')
              : p.body))
          .then(bodies => {
            pages.forEach((p, i) => { p.body = bodies[i]; });
            busy = false;
            orig();
          })
          .catch(() => { busy = false; });
      }
    }catch(e){}
  };
  w.__lcE2ee = true;
  window.renderStoryPage = w;
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(hookGifts, 2500);
  setTimeout(hookStory, 2500);
});

})();
