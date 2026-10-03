/* ============================================================
   pwa.js — Service-worker registration + "📲 Install app" chip
   - Registers /sw.js on page load (http/https only).
   - Captures `beforeinstallprompt` and shows a small floating
     chip; tapping it opens the native install dialog.
   - On iOS Safari (no beforeinstallprompt) the chip links to a
     short "Add to Home Screen" how-to instead.
   - Works on laptop too: Chrome/Edge show the chip in-browser,
     and their address bar keeps its own install icon as backup.
   - Hides itself once the app is already installed (standalone).
   ============================================================ */
(function () {
  'use strict';

  var isSecure = location.protocol === 'https:' ||
                 location.hostname === 'localhost' ||
                 location.hostname === '127.0.0.1';
  if (!isSecure || !('serviceWorker' in navigator)) return;

  /* ---------- register the service worker ---------- */
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      /* v1.2 PERF/UX: periodically ask SW for updates even when the app is
         only backgrounded (installed PWA). New deploys land within ~5 min
         without the user having to open the site first. */
      setInterval(function () {
        try { reg.update(); } catch (e) {}
      }, 5 * 60 * 1000);
    }).catch(function (err) {
      console.warn('[PWA] SW registration failed:', err);
    });
  });

  /* ---------- standalone detection ---------- */
  function isStandalone() {
    return window.matchMedia && (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      navigator.standalone === true            // iOS
    );
  }

  /* ---------- build the install chip ---------- */
  var deferredPrompt = null;
  var chip = null;

  function ensureStyle() {
    if (document.getElementById('pwa-chip-style')) return;
    var s = document.createElement('style');
    s.id = 'pwa-chip-style';
    s.textContent =
      '.pwa-install-chip{position:fixed;right:14px;bottom:14px;z-index:2147483000;' +
      'display:none;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;' +
      'border:1px solid rgba(255,215,0,.45);cursor:pointer;font-size:14px;font-weight:600;' +
      'color:#ffe9b0;background:linear-gradient(135deg,#8b0028,#4a0016);' +
      'box-shadow:0 6px 24px rgba(0,0,0,.45);transition:transform .15s ease,opacity .15s ease;' +
      'font-family:Georgia,"Times New Roman",serif;}' +
      '.pwa-install-chip:hover{transform:translateY(-2px);}' +
      '.pwa-install-chip.show{display:inline-flex;}' +
      '.pwa-install-chip .x{margin-left:4px;opacity:.7;font-weight:400;}';
    document.head.appendChild(s);
  }

  function makeChip(label, onClick) {
    ensureStyle();
    if (chip) return chip;
    chip = document.createElement('button');
    chip.className = 'pwa-install-chip';
    chip.type = 'button';
    chip.setAttribute('aria-label', label);
    chip.innerHTML = '<span>' + label + '</span><span class="x" title="Dismiss">✕</span>';
    chip.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('x')) {
        dismiss();                       // ✕ hides for this session
      } else {
        onClick();                       // body click → install / help
      }
    });
    document.body.appendChild(chip);
    return chip;
  }

  function dismissed() {
    try { return sessionStorage.getItem('pwa-chip-dismissed') === '1'; } catch (e) { return false; }
  }
  function dismiss() {
    try { sessionStorage.setItem('pwa-chip-dismissed', '1'); } catch (e) {}
    if (chip) chip.classList.remove('show');
  }
  function showChip(label, onClick) {
    if (isStandalone() || dismissed()) return;
    makeChip(label, onClick).classList.add('show');
  }

  /* ---------- Android / desktop Chromium: real install prompt ---------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showChip('📲 Install app', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (res) {
        if (res.outcome === 'accepted') {
          if (chip) chip.classList.remove('show');
        }
        deferredPrompt = null;
      });
    });
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (chip) chip.classList.remove('show');
  });

  /* If we lost the event (already fired before this script ran),
     still offer something useful after a moment. */
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (deferredPrompt || isStandalone() || dismissed()) return;
      var ua = navigator.userAgent || '';
      var ios = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (ios) {
        showChip('📲 Install app', function () {
          alert('To install on iPhone/iPad:\n\n' +
                '1️⃣  Tap the Share button ⬆︎ (bottom of Safari)\n' +
                '2️⃣  Choose "Add to Home Screen"\n' +
                '3️⃣  Tap "Add" — the card appears as an app 💕');
        });
      }
      /* Desktop Chrome/Edge without a captured prompt keep their
         address-bar install icon; no extra chip needed there. */
    }, 2500);
  });
})();
