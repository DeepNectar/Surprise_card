/* ============================================================
   sw.js — Service worker for the Surprise Card PWA
   Strategy: NETWORK-FIRST app shell (so deploys land immediately),
   falling back to cache when offline. Supabase / Drive / CDN API
   traffic is NEVER cached (passthrough) so live data always flows.
   Versioned caches: old cache names are cleaned up on activate.
   ============================================================ */
'use strict';

const VERSION    = 'v4';                       // bump on any precache-list or core-js change
const CACHE_SHELL = 'sc-shell-'  + VERSION;    // index.html, css, js, icons, manifest
const CACHE_RUNTIME = 'sc-runtime-' + VERSION; // same-origin GETs (images etc.)

/* Everything needed to render the app shell offline. */
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/maskable-512.png',
  '/apple-touch-icon.png',
  '/css/variables.css',
  '/css/base.css',
  '/css/home.css',
  '/css/lock.css',
  '/css/opening.css',
  '/css/modals.css',
  '/css/panels.css',
  '/css/viewer.css',
  '/css/slideshow.css',
  '/css/responsive.css',
  '/css/polish.css',
  '/js/config.js',
  '/js/env.js',
  '/js/utils.js',
  '/js/supabase.js',
  '/js/requester.js',
  '/js/boot.js',
  '/js/counters.js',
  '/js/admin.js',
  '/js/guests.js',
  '/js/lock.js',
  '/js/opening.js',
  '/js/reviews.js',
  '/js/fireworks.js',
  '/js/typewriter.js',
  '/js/home.js',
  '/js/gifts.js',
  '/js/events.js',
  '/js/voice.js',
  '/js/video.js',
  '/js/story.js',
  '/js/map.js',
  '/js/upload.js',
  '/js/music.js',
  '/js/language.js',
  '/js/closing.js',
  '/js/slideshow.js',
  '/js/sound.js',
  '/js/tour.js',
  '/js/v3extras.js',
  '/js/v3admin.js',
  '/js/update.js'
];

/* Requests that must ALWAYS hit the network (never cached):
   Supabase data/storage, Google Drive, jsdelivr libs, version.json
   (the update checker must see fresh versions). */
function isPassthrough(url) {
  const h = url.hostname;
  if (!h) return false;
  if (h.endsWith('.supabase.co')) return true;
  if (h === 'drive.google.com' || h === 'lh3.googleusercontent.com') return true;
  if (h === 'cdn.jsdelivr.net' || h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com') return true;
  if (url.pathname === '/version.json') return true;
  return false;
}

/* ---------- install: precache the shell (best-effort per file) ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);
    await Promise.allSettled(PRECACHE.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { /* a missing asset must not break installation */ }
    }));
    self.skipWaiting();
  })());
});

/* ---------- activate: delete every cache from older versions ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== CACHE_SHELL && k !== CACHE_RUNTIME)
      .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ---------- fetch: network-first shell, passthrough APIs ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;              // POST/PUT (uploads, votes) → straight to network

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (isPassthrough(url)) return;                // live data untouched by the SW

  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;                       // anything else cross-origin → default behaviour

  // Navigations: network first → fall back to cached /index.html (full offline support)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE_SHELL);
        cache.put('/index.html', net.clone());
        return net;
      } catch (e) {
        return (await caches.match('/index.html'))
            || (await caches.match('/'))
            || Response.error();
      }
    })());
    return;
  }

  // Static assets (css/js/icons): network first, cache fallback, opportunistic refresh
  event.respondWith((async () => {
    try {
      const net = await fetch(req);
      if (net && net.status === 200 && net.type === 'basic') {
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(req, net.clone());
      }
      return net;
    } catch (e) {
      const hit = (await caches.match(req)) ||
                  (await caches.open(CACHE_SHELL).then(c => c.match(req)));
      return hit || Response.error();
    }
  })());
});

/* Allow the page to trigger immediate activation after an update. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
