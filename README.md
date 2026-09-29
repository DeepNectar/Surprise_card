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

The `vercel.json` included here sets cache headers (version.json = no-store, js/css = short cache) and basic security headers. No env vars are required — Supabase config lives in `js/config.js`.

---

## 🔧 Configuration

Edit `js/config.js`:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |
| `PUBLIC_CARD_LINK` | Public card link used in shares |
| `FALLBACK_ADMIN_PW` | Fallback admin password |
| `DEFAULT_TZ` | Default timezone (e.g. `Asia/Dubai`) |

---

## 🔐 Admin Access

**Triple-click** the 🎂💕 emoji on the home screen.

Default fallback password: `Deepnectar@@1617@@`

From the admin panel you can:
- Edit any person's text, theme, counters, gifts, story, events, voice, video, pins, and media
- Add / edit / delete people
- Approve or reject guest submissions
- Export / import a full Excel backup
- Manage reviews

---

## 📂 Structure
