/* ============================================================
   map.js — Map of memories (GPS canvas)
   ============================================================ */
(function(){
'use strict';

const S = window.__PAGE_STATE__;
let PIN_MINI = null;

function openPinDetail(p){
  if(PIN_MINI){ PIN_MINI.stop(); PIN_MINI = null; }
  txt($('pinModalTitle'), p.label || 'Memory');

  const v = $('pinModalViewer');
  if(!v) return;
  const ids = splitDriveIds(p.photo_drive_id);

  let h = '';
  if(ids.length) h += '<div id="pinSlideWrap"></div>';
  if(p.story){
    h += `<p style="font-size:1rem;line-height:1.6;">${esc(p.story).replace(/\n/g, '<br>')}</p>`;
  }
  v.innerHTML = h || '<p style="text-align:center;color:var(--c-text-muted);">No details.</p>';

  if(ids.length){
    PIN_MINI = window.buildMiniSlideshow(
      v.querySelector('#pinSlideWrap'),
      ids,
      MODAL_IMG_DURATION_MS
    );
  }
  show($('pinModal'));
}

function closePinModal(){
  if(PIN_MINI){ PIN_MINI.stop(); PIN_MINI = null; }
  hide($('pinModal'));
}

window.openMap = function(){
  const canvas = $('mapCanvas');
  if(!canvas) return;

  const raw = (S.CURR.pins || []).map(p => ({
    label: p.label || '',
    lat: parseFloat(p.lat),
    lng: parseFloat(p.lng),
    photo_drive_id: p.photo_drive_id || '',
    story: p.story || ''
  })).filter(p => !isNaN(p.lat) && !isNaN(p.lng));

  txt($('mapSelectedName'), '');

  let html = '<div class="gps-grid"></div><div class="gps-grid-fine"></div>';
  html += '<div class="gps-equator"></div><div class="gps-meridian"></div>';

  if(!raw.length){
    html += '<div class="map-empty">No memories pinned yet.</div>';
    html += '<div class="gps-rose">N</div>';
    html += '<div class="gps-scale">±180° · ±90°</div>';
    html += '<div class="gps-coords">0.0000°, 0.0000°</div>';
    canvas.innerHTML = html;
    show($('mapModal'));
    return;
  }

  const PAD = 6;
  const usable = 100 - PAD * 2;

  raw.forEach((p, i) => {
    const lngClamped = Math.max(-180, Math.min(180, p.lng));
    const latClamped = Math.max(-90,  Math.min(90,  p.lat));
    const x = PAD + ((lngClamped + 180) / 360) * usable;
    const y = PAD + ((90 - latClamped) / 180) * usable;
    html += '<div class="map-pin" data-pin-i="' + i + '" style="left:' + x + '%;top:' + y + '%;" title="' +
      esc(p.label) + ' · ' + latClamped.toFixed(4) + '°, ' + lngClamped.toFixed(4) + '°">📍</div>';
    html += '<div class="map-pin-label" style="left:' + x + '%;top:calc(' + y + '% + 1.8rem);">' +
      esc(p.label) + '</div>';
  });

  html += '<div class="gps-rose">N</div>';
  html += '<div class="gps-scale">World · GPS</div>';
  html += '<div class="gps-coords">Click a pin for details</div>';
  canvas.innerHTML = html;

  canvas.querySelectorAll('.map-pin').forEach(el => {
    el.onclick = () => {
      const i = +el.dataset.pinI;
      const pin = raw[i];
      txt($('mapSelectedName'),
        pin.label + '  ·  ' + pin.lat.toFixed(4) + '°, ' + pin.lng.toFixed(4) + '°');
      openPinDetail(pin);
    };
  });

  show($('mapModal'));
};

document.addEventListener('DOMContentLoaded', () => {
  const btn = $('mapBtn');
  if(btn) btn.onclick = () => openMap();

  const mc = $('mapClose');
  if(mc) mc.onclick = () => hide($('mapModal'));

  const mm = $('mapModal');
  if(mm) mm.addEventListener('click', e => { if(e.target === mm) hide($('mapModal')); });

  const pc = $('pinModalClose');
  if(pc) pc.onclick = closePinModal;

  const pm = $('pinModal');
  if(pm) pm.addEventListener('click', e => { if(e.target === pm) closePinModal(); });
});

})();