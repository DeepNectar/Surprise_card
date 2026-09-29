/* ============================================================
   config.js — Global constants and shared state
   ============================================================ */
(function(){
'use strict';

window.SUPABASE_URL = 'https://ueuxnkrvvnvldfwgiyqy.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVldXhua3J2dm52bGRmd2dpeXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjM0ODUsImV4cCI6MjEwNTI5OTQ4NX0.DwDSWdnVK1-eWLvSuXpsf22PLtMVq_ZJ-1Kq39AoOSI';

/* ---------- Table names ---------- */
window.T_PEOPLE   = 'people';
window.T_SETTINGS = 'settings';
window.T_MEDIA    = 'media';
window.T_GIFTS    = 'gifts';
window.T_STORY    = 'story_pages';
window.T_EVENTS   = 'event_countdowns';
window.T_VOICE    = 'voice_messages';
window.T_VIDEO    = 'video_messages';
window.T_PINS     = 'map_pins';
window.T_GUEST    = 'guest_submissions';
window.T_UPLOADS  = 'uploads';
window.T_REVIEWS  = 'reviews';

/* ---------- Deployment / update system ----------
   ⚠️ DEPLOY CHECKLIST: every time you ship a new version —
     1. Bump APP_VERSION below (integer, e.g. 23 → 24) AND RELEASE_DATE,
     2. Put 1–3 short highlight lines in CHANGELOG_LIVE,
     3. Mirror the SAME values into /version.json.
   Open tabs compare themselves against /version.json and pop up an
   "upgrade" modal pointing at the latest deployed version; the home
   screen ("✨ What's new") and admin panel always show what is LIVE. */
window.APP_VERSION   = 24;
window.RELEASE_DATE  = '2026-09-29';
window.CHANGELOG_LIVE = [
  '💐 Finished people now appear on the home screen automatically — stamped with the exact date & time their data was wiped out (works for scheduled auto-wipes AND admin deletes, and syncs across devices).',
  '🚀 The ⬆️ "Update now" button is now one-time only: once used for a deployed version it never repeats — you will only be notified again when something NEWER ships.',
  '🎂 Birthday button still shows HOW MANY birthdays are coming soon — tap it for names & dates.'
];
/* Alias used by js/update.js */
window.CHANGELOG = window.CHANGELOG_LIVE;

/* ---------- App-wide constants ---------- */
window.FALLBACK_ADMIN_PW = 'Deepnectar@@1617@@';
/* Canonical PRODUCTION URL — every link sent to guests points here. */
window.PUBLIC_CARD_LINK_DEFAULT = 'https://surprise-card-v2.vercel.app';

/* ---------- Share link resolver ----------
   The link sent to guests is simply the CURRENT URL open in the browser —
   whatever site you are viewing when you press Share (or approve/resend a
   guest card), that exact origin is what the guest receives. Only when no
   real page URL exists (file://, blank context) do we fall back to the
   canonical production URL above.                                */

window.getShareBaseUrl = function(){
  var o = location.origin || '';
  /* file:// and other non-http contexts report 'null'/'' origins. */
  if(o && o.indexOf('http') === 0){
    return o.replace(/\/+$/, '');
  }
  return window.PUBLIC_CARD_LINK_DEFAULT;
};

window.resolveCardLink = function(slug){
  var base = window.getShareBaseUrl();
  return slug ? (base + '/?person=' + encodeURIComponent(slug)) : (base + '/');
};

window.repointShareLink = function(storedLink, slug){
  /* Prefer the current browser URL; only borrow the path/query shape of a
     stored link when it carries something meaningful beyond /?person=slug. */
  try{
    var cur = new URL(window.getShareBaseUrl() + '/');
    var u   = new URL(storedLink || '', cur);
    if(u.protocol === 'http:' || u.protocol === 'https:'){
      /* Re-host onto the current origin so old links stored with stale
         tunnels/preview hosts still open on the site you're using now. */
      u.protocol = cur.protocol;
      u.host     = cur.host;
      if(slug){
        u.pathname = '/';
        u.search   = '?person=' + encodeURIComponent(slug);
        u.hash     = '';
      }
      return u.href;
    }
  }catch(e){}
  return window.resolveCardLink(slug);
};

window.PUBLIC_CARD_LINK  = window.resolveCardLink('');
window.DEFAULT_TZ        = 'Asia/Dubai';
window.MODAL_IMG_DURATION_MS = 10000;

/* ---------- Network timeout budgets (very short — fail fast, never hang) ----------
   sbGet : read queries that render the home screen — guests must see cards ASAP.
   sbMut : writes (login checks, approvals, saves) — a hair more generous.
   These only cap how LONG we wait; they never change WHAT is requested or how
   results are processed, so all rules and behavior stay identical.            */
window.SB_TIMEOUT_GET_MS = 2500;   /* ~2.5 s max for loading data on screen */
window.SB_TIMEOUT_MUT_MS = 4500;   /* ~4.5 s max for saving data            */

/* ---------- Timezones ---------- */
window.TZ_OPTIONS = [
  {v:'Asia/Dubai',l:'🇦🇪 Dubai / UAE (UTC+4) — default'},
  {v:'Asia/Kolkata',l:'🇮🇳 India (UTC+5:30)'},
  {v:'Asia/Karachi',l:'🇵🇰 Pakistan (UTC+5)'},
  {v:'Asia/Dhaka',l:'🇧🇩 Bangladesh (UTC+6)'},
  {v:'Asia/Kathmandu',l:'🇳🇵 Nepal (UTC+5:45)'},
  {v:'Asia/Colombo',l:'🇱🇰 Sri Lanka (UTC+5:30)'},
  {v:'Asia/Riyadh',l:'🇸🇦 Riyadh (UTC+3)'},
  {v:'Asia/Qatar',l:'🇶🇦 Qatar (UTC+3)'},
  {v:'Asia/Kuwait',l:'🇰🇼 Kuwait (UTC+3)'},
  {v:'Asia/Istanbul',l:'🇹🇷 Istanbul (UTC+3)'},
  {v:'Asia/Singapore',l:'🇸🇬 Singapore (UTC+8)'},
  {v:'Asia/Kuala_Lumpur',l:'🇲🇾 Kuala Lumpur (UTC+8)'},
  {v:'Asia/Shanghai',l:'🇨🇳 China (UTC+8)'},
  {v:'Asia/Hong_Kong',l:'🇭🇰 Hong Kong (UTC+8)'},
  {v:'Asia/Tokyo',l:'🇯🇵 Tokyo (UTC+9)'},
  {v:'Asia/Seoul',l:'🇰🇷 Seoul (UTC+9)'},
  {v:'Asia/Bangkok',l:'🇹🇭 Bangkok (UTC+7)'},
  {v:'Asia/Jakarta',l:'🇮🇩 Jakarta (UTC+7)'},
  {v:'Asia/Manila',l:'🇵🇭 Manila (UTC+8)'},
  {v:'Australia/Sydney',l:'🇦🇺 Sydney (UTC+10/+11)'},
  {v:'Australia/Perth',l:'🇦🇺 Perth (UTC+8)'},
  {v:'Pacific/Auckland',l:'🇳🇿 Auckland (UTC+12/+13)'},
  {v:'Europe/London',l:'🇬🇧 London (UTC+0/+1)'},
  {v:'Europe/Paris',l:'🇫🇷 Paris / Berlin (UTC+1/+2)'},
  {v:'Europe/Moscow',l:'🇷🇺 Moscow (UTC+3)'},
  {v:'Europe/Athens',l:'🇬🇷 Athens (UTC+2/+3)'},
  {v:'Africa/Cairo',l:'🇪🇬 Cairo (UTC+2)'},
  {v:'Africa/Nairobi',l:'🇰🇪 Nairobi (UTC+3)'},
  {v:'Africa/Johannesburg',l:'🇿🇦 Johannesburg (UTC+2)'},
  {v:'America/New_York',l:'🇺🇸 New York (UTC-5/-4)'},
  {v:'America/Chicago',l:'🇺🇸 Chicago (UTC-6/-5)'},
  {v:'America/Denver',l:'🇺🇸 Denver (UTC-7/-6)'},
  {v:'America/Los_Angeles',l:'🇺🇸 Los Angeles (UTC-8/-7)'},
  {v:'America/Toronto',l:'🇨🇦 Toronto (UTC-5/-4)'},
  {v:'America/Sao_Paulo',l:'🇧🇷 São Paulo (UTC-3)'},
  {v:'UTC',l:'🌐 UTC (no offset)'}
];

/* ---------- Central page state ---------- */
const S = window.__PAGE_STATE__ = window.__PAGE_STATE__ || {};
S.PEOPLE = S.PEOPLE || [];
S.CURR = S.CURR || {
  texts: {},
  textsByLang: {en:{}, gu:{}, hi:{}},
  shared: {},
  gifts: [], story: [], events: [],
  voice: [], video: [], pins: [], media: []
};
S.CURRENT_PERSON      = S.CURRENT_PERSON      || null;
S.ADMIN_MODE          = S.ADMIN_MODE          || false;
S.PREVIEW_MODE        = S.PREVIEW_MODE        || false;
S.CURRENT_SETTINGS    = S.CURRENT_SETTINGS    || {};
S.ADMIN_EDIT_PERSON_ID = S.ADMIN_EDIT_PERSON_ID || null;
S.CURR_LANG           = S.CURR_LANG           || 'en';
S.LOGIN_TARGET        = S.LOGIN_TARGET        || null;
S.ADMIN_EDIT_LANG     = 'en';
S.GUEST_TEXTS         = S.GUEST_TEXTS         || {en:{}, gu:{}, hi:{}};
S.GUEST_EDIT_LANG     = 'en';
S.CARD_STARTED        = false;
S.REVIEWS             = S.REVIEWS             || [];
S.HOME_REVIEW_LIMIT   = S.HOME_REVIEW_LIMIT   || 10;
S.REVIEW_STARS        = 0;
S.EXPANDED_PEOPLE     = S.EXPANDED_PEOPLE     || new Set();
S.REQUESTER_MODE      = S.REQUESTER_MODE      || false;
S.REACTIONS           = S.REACTIONS           || {heart:0, love:0, cry:0, party:0};
S.DARK_MODE           = S.DARK_MODE           || false;
S.REVIEWS_COLLAPSED   = true;

/* ---------- Guest editor state ---------- */
window.GE = {
  person: {display_name:'', slug:'', birthday:''},
  guest:  {name:'', whatsapp:'', relation:'', occasion:'', note:''},
  password: '',
  texts: {en:{}, gu:{}, hi:{}},
  lang: 'en',
  theme: '',
  counters: {},
  gifts: [], story: [], events: [],
  voice: [], video: [], pins: [], media: [],
  guestRow: null
};

/* ---------- Requester editor state ---------- */
window.RE = {
  lang: 'en',
  texts: {en:{}, gu:{}, hi:{}},
  shared: {},
  theme: '',
  counters: {},
  gifts: [], story: [], events: [],
  voice: [], video: [], pins: [], media: []
};

/* ---------- Counter definitions ---------- */
window.COUNTERS = [
  {id:'ct1', icon:'💬',
    labelKey:'ct1_label', dtKey:'ct1_datetime', tzKey:'ct1_datetime_tz',
    dispKey:'ct1_dispdate', showKey:'ct1_show',
    mainLabel:'ctMain1_label', mainDate:'ctMain1_date', mainRow:'ctMain1'},
  {id:'ct2', icon:'💕',
    labelKey:'ct2_label', dtKey:'ct2_datetime', tzKey:'ct2_datetime_tz',
    dispKey:'ct2_dispdate', showKey:'ct2_show',
    mainLabel:'ctMain2_label', mainDate:'ctMain2_date', mainRow:'ctMain2'},
  {id:'ct3', icon:'💍',
    labelKey:'ct3_label', dtKey:'ct3_datetime', tzKey:'ct3_datetime_tz',
    dispKey:'ct3_dispdate', showKey:'ct3_show',
    mainLabel:'ctMain3_label', mainDate:'ctMain3_date', mainRow:'ctMain3'}
];

/* ---------- Text fields schema ---------- */
window.TEXT_FIELDS = [
  'pageTitle','mainHeadline','subhead1','subhead2','greeting','msg1','msg2','msg3','msg4','msg5',
  'signoff','namesBadge','fromLabel','countersTitle','ct1_label','ct2_label','ct3_label',
  'openMemoriesBtn','storyBtnText','mapBtnText','uploadBtnText','voiceBtnText','videoBtnText',
  'giftSectionTitle','eventSectionTitle',
  'openLine1','openLine2','cakeHint',
  'lockTitle','lockSubtitle','lockDateText','countdownLabel',
  'daysLabel','hoursLabel','minsLabel','secsLabel','openEarlyText','pwError','pwLockedMsg',
  'closeTitle','close1','close2','close3','close4','closeSignoff','closeBtn'
];

})();
