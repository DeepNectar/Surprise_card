/* ============================================================
   e2eeadmin.js — v1.0 E2EE ADMIN UI + DECRYPT-ON-RENDER HOOKS
   ------------------------------------------------------------
   • Admin panel → 🔐 Security → "End-to-end encryption":
       🔒 Encrypt this card   (rewrites gift messages, story
                               bodies & local photo blobs as
                               ciphertext — one tap)
       🔓 Decrypt again       (back to plaintext)
     Uses window.lcEncryptCardData from js/e2ee.js; requires the
     card to be OPEN (the key lives only in the unlocked session).

   • Render hooks (additive, async, never break the sync path):
       gifts.openGift  → decrypts lcmsg: message before display
       story.renderStoryPage → decrypts lcmsg: body
     Undecryptable envelopes show the 🔒 notice from e2ee.js.
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
function $id(id){ return document.getElementById(id); }

/* ---------- admin section injection ---------- */
let injected = false;
window.lcInjectE2eeAdminUi = function(){
  if(injected) return;
  const pane = $id('pane-security');
  if(!pane || !window.lcEncryptCardData) return;
  if($id('lce-e2ee-box')){ injected = true; return; }
  injected = true;
  const box = document.createElement('div');
  box.className = 'panel-section';
  box.id = 'lce-e2ee-box';
  box.innerHTML =
    '<div class="panel-section-title">🔐 End-to-end encryption</div>' +
    '<div class="panel-field" style="font-size:.75rem;color:var(--c-text-muted);">' +
      'Client-side AES-256-GCM with a key derived from this card\'s PIN/password (PBKDF2, 150k iters). ' +
      'Ciphertext is all that rests in the cloud — open the card first; the key lives only in this session.</div>' +
    '<div style="display:flex;gap:.5rem;flex-wrap:wrap;">' +
      '<button type="button" class="panel-btn" id="lceEncBtn" style="min-width:0;padding:.4rem .9rem;font-size:.8rem;">🔒 Encrypt this card</button>' +
      '<button type="button" class="panel-btn reset" id="lceDecBtn" style="min-width:0;padding:.4rem .9rem;font-size:.8rem;">🔓 Decrypt again</button>' +
    '</div>' +
    '<div class="panel-status" id="lceE2eeStatus"></div>';
  pane.appendChild(box);

  async function run(mode){
    const st = $id('lceE2eeStatus');
    const P = S && S.CURRENT_PERSON;
    if(!P){ st.textContent = '⚠️ Open a card first (People tab).'; return; }
    if(!window.lcE2EEHasSecret || !window.lcE2EEHasSecret()){
      st.textContent = '⚠️ Unlock this card with its PIN/password first — the key lives only in the unlocked session.';
      return;
    }
    st.textContent = '⏳ Working…';
    try{
      const r = await window.lcEncryptCardData(mode);
      st.textContent = (mode === 'encrypt' ? '🔒 Encrypted ' : '🔓 Decrypted ') +
        r.changed + ' field(s)' + (r.failed ? (' · ' + r.failed + ' skipped') : '') +
        (mode === 'encrypt' ? ' — only ciphertext is stored in the cloud ✅' : '.');
    }catch(e){
      st.textContent = '❌ ' + ((e && e.message) || 'Failed.');
    }
  }
  const eb = $id('lceEncBtn'), db = $id('lceDecBtn');
  if(eb) eb.onclick = () => {
    if(confirm('Encrypt every gift message, story page and locally-stored photo of THIS card?\n\nThey will only be readable by someone who enters the card secret. Continue?')) run('encrypt');
  };
  if(db) db.onclick = () => {
    if(confirm('Decrypt the encrypted fields of this card back to plaintext in the cloud?')) run('decrypt');
  };
};

document.addEventListener('DOMContentLoaded', () => setTimeout(window.lcInjectE2eeAdminUi, 2300));

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
