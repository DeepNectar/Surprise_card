/* ============================================================
   upload.js — Guest photo upload for approval
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;

document.addEventListener('DOMContentLoaded', () => {
  const openBtn = $('uploadBtn');
  if(openBtn) openBtn.onclick = () => {
    $('uploadName').value = '';
    $('uploadDriveId').value = '';
    $('uploadMsg').value = '';
    const st = $('uploadStatus');
    if(st){ st.textContent = ''; st.className = 'panel-status'; }
    show($('uploadModal'));
  };

  const close = $('uploadClose');
  if(close) close.onclick = () => hide($('uploadModal'));

  const modal = $('uploadModal');
  if(modal) modal.addEventListener('click', e => {
    if(e.target === modal) hide($('uploadModal'));
  });

  const submit = $('uploadSubmit');
  if(submit) submit.onclick = async () => {
    const st = $('uploadStatus');
    const name = $('uploadName').value.trim();
    const id = $('uploadDriveId').value.trim();
    const msg = $('uploadMsg').value.trim();

    if(!name){ st.textContent = '❌ Your name is required.'; st.className = 'panel-status err'; return; }
    if(!id){ st.textContent = '❌ Drive Photo ID is required.'; st.className = 'panel-status err'; return; }

    const p = S.CURRENT_PERSON;
    if(!p || !p.id){ st.textContent = '❌ No person selected.'; st.className = 'panel-status err'; return; }

    st.textContent = '⏳ Uploading…'; st.className = 'panel-status';
    try{
      await sb.insBatch(T_UPLOADS, [{
        person_id: p.id,
        uploader_name: name,
        drive_id: id,
        message: msg,
        status: 'pending'
      }]);
      st.textContent = '✅ Submitted for approval!';
      st.className = 'panel-status ok';
      setTimeout(() => hide($('uploadModal')), 1200);
    }catch(e){
      st.textContent = '❌ ' + e.message;
      st.className = 'panel-status err';
    }
  };
});

})();