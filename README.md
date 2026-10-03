# 💕 Surprise Card

A personalised surprise card web app — filled with messages, photos, videos, countdowns, and memories — made just for someone special.

![Version](https://img.shields.io/badge/version-2.2-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

- 🎂 **Tap-to-open cake** animation with confetti
- 💌 **Personalised messages** with typewriter effect
- 💕 **3 live counters** (talk, yes, engaged… or any dates)
- 🎁 **Gift boxes** with slideshow photos
- 📖 **Story pages** with autoplay
- 📅 **Event countdowns** with timezone support
- 🔊 **Voice messages** and 🎬 **video messages**
- 🗺️ **Map of memories** with pins
- 📸 **Full-screen slideshow** with effects, floaters, and music
- 💬 **WhatsApp share** with credentials
- ⭐ **Review system** with star ratings
- 🌐 **Multi-language** (English, ગુજરાતી, हिन्दी)
- 🌙 **Dark mode**
- 🎨 **14 themes** (romantic, family, birthday, elegant, royal…)
- ✍️ **Guest submission flow** with Excel template + admin approval
- 📊 **Complete Excel backup** (export + import)

---

## 🚀 Deployment (Vercel)

This app is plain static HTML/CSS/JS and is configured for **Vercel** via `vercel.json` (no build step, no framework).

**Option A — Git (recommended):**
1. Push this repo to GitHub/GitLab.
2. On [vercel.com](https://vercel.com/) → *Add New… → Project* → import the repo.
3. Vercel auto-detects it as a static site (`Framework: Other`, build command empty). Click **Deploy**.
4. Every future `git push` redeploys automatically. After each deploy, bump `version.json` so open tabs show the auto-upgrade popup (js/update.js polls it; vercel.json serves it with `no-store`).

**Option B — CLI:**
```bash
npm i -g vercel   # then, from this folder:
vercel            # preview deploy
vercel --prod     # production deploy
```

The `vercel.json` included here sets cache headers (version.json = no-store, js/css = short cache) and basic security headers. No env vars are required — Supabase config lives in `js/env.js`.

---

## 🔧 Configuration

Edit `js/env.js` (injected as `window.__LC_ENV__` before `js/config.js` loads):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key (public by design — RLS protects data) |
| `PUBLIC_CARD_LINK_DEFAULT` | Public card link used in shares (set in `js/config.js`) |
| `ADMIN_PW` | Optional plaintext fallback — leave EMPTY; use hashed mode below |
| `VAPID_PUBLIC_KEY` | Optional Web-Push VAPID public key for real push notifications |
| `DEFAULT_TZ` | Default timezone (e.g. `Asia/Dubai`) |

**One-time database setup (required for full functionality):** run both SQL files in Supabase → SQL Editor:
- `setup/ledger.sql` — permanent 💐 Finished ledger (HD0.6)
- `setup/rls.sql` — analytics (`card_views`), push subscriptions (`push_subs`) & settings policies (v1.0)
- `setup/sync_queue.sql` — unblocks the "📴 N changes queued — tap to sync" offline queue: adds `people.pin_hash / pin_salt / pin_plain / otp_list` columns, reviews table + anon PATCH policies so queued PIN/OTP writes flush to the cloud (HD 1.0)

---

## 🔐 Admin Access

**Triple-click** the 🎂💕 emoji on the home screen.

Recommended: set a passphrase via **Admin → 🔐 Hash & Save** — only a salted SHA-256 hash is stored (in Supabase settings), never the plaintext. The old committed plaintext fallback has been removed from `js/env.js`; if you used it anywhere, rotate the passphrase now. A temporary dev fallback can be injected via the `LC_ADMIN_PW` deployment env var — keep your repo **private** and never commit secrets.

From the admin panel you can:
- Edit any person's text, theme, counters, gifts, story, events, voice, video, pins, and media
- Add / edit / delete people
- Approve or reject guest submissions
- Export / import a full Excel backup
- Manage reviews

---

## 📱 PWA — Install on Phone & Laptop

The app is a Progressive Web App:
- `manifest.webmanifest` — standalone display, theme colors, home-screen shortcuts
- `sw.js` — network-first app shell with full offline support (Supabase/Drive requests pass through untouched; versioned caches auto-clean)
- `js/pwa.js` — service-worker registration + the "📲 Install app" chip (`beforeinstallprompt`; iOS shows an Add-to-Home-Screen hint)
- Icons: `icon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`

Installation works over **HTTPS** (your Vercel deployment qualifies). Chrome/Edge on laptop show an install icon in the address bar; Android gets the native prompt; iPhone uses Share → *Add to Home Screen*.

---

## 🔍 SEO & Google Ads

Search engines can index the site out of the box:
- Meta title/description, Open Graph + Twitter cards, canonical URL and JSON-LD structured data in `index.html`
- `robots.txt` (allows all crawlers, points at the sitemap) and `sitemap.xml`
- To get listed fast: verify the domain in [Google Search Console](https://search.google.com/search-console) → submit `sitemap.xml`. For ads: create a campaign in [Google Ads](https://ads.google.com) pointing at the production URL. Update the URL in `robots.txt`, `sitemap.xml`, and `index.html` if you switch to a custom domain.

---

## 🚀 Publishing to GitHub & Deploying

```bash
git add -A
git commit -m "Publish-ready: PWA, SEO, clean repo"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Then import the repo on Vercel (Option A above), or run `vercel --prod` from this folder.

---

## 📂 Structure
