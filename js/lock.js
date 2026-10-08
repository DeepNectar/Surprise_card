/* ============================================================
   lock.js — Lock screen countdown
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
let CD_T = null;

window.renderLockFull = function(){
  txt($('lockTitleEl'),    getText('lockTitle', 'The surprise is locked'));
  $('lockSubtitleEl').innerHTML =
    (getText('lockSubtitle', '') || '') +
    (getText('lockDateText', '') ? ('<br><strong>' + esc(getText('lockDateText', '')) + '</strong>') : '');
  txt($('countdownLabelEl'), getText('countdownLabel', 'Unlocks in'));
  txt($('cdDaysLabel'),      getText('daysLabel', 'Days'));
  txt($('cdHoursLabel'),     getText('hoursLabel', 'Hours'));
  txt($('cdMinsLabel'),      getText('minsLabel', 'Mins'));
  txt($('cdSecsLabel'),      getText('secsLabel', 'Secs'));
  txt($('openEarlyTextEl'),  getText('openEarlyText', 'Open Early'));
};

window.startCountdownFull = function(unlockDate){
  clearInterval(CD_T);
  function tick(){
    const diff = unlockDate - new Date();
    if(diff <= 0){
      clearInterval(CD_T);
      CD_T = null;
      ['cdDays','cdHours','cdMins','cdSecs'].forEach(id => {
        const el = $(id); if(el) el.textContent = '00';
      });
      return;
    }
    const ts = Math.floor(diff / 1000);
    const dEl = $('cdDays');   if(dEl) dEl.textContent = String(Math.floor(ts / 86400)).padStart(2, '0');
    const hEl = $('cdHours');  if(hEl) hEl.textContent = String(Math.floor((ts % 86400) / 3600)).padStart(2, '0');
    const mEl = $('cdMins');   if(mEl) mEl.textContent = String(Math.floor((ts % 3600) / 60)).padStart(2, '0');
    const sEl = $('cdSecs');   if(sEl) sEl.textContent = String(ts % 60).padStart(2, '0');
  }
  tick();
  CD_T = setInterval(tick, 1000);
};

window.stopCountdownFull = function(){
  if(CD_T){ clearInterval(CD_T); CD_T = null; }
};

window.__openEarlyHandler__ = function(){
  const unlockIso = (S.CURR.shared || {}).unlockDateISO || '';
  const unlockDate = unlockIso ? new Date(unlockIso) : null;
  const locked = unlockDate && !isNaN(unlockDate) && new Date() < unlockDate;
  if(locked){
    const tpl = getText('pwLockedMsg', '🔒 This surprise unlocks on {date}. Please come back then.');
    alert(tpl.replace('{date}', unlockDate.toLocaleString()));
    return;
  }
  window.stopCountdownFull();
  hide($('lockScreen'));
  window.openOpeningFull();
};

})();