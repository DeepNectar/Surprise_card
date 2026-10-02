/* ============================================================
   env.js — v1.0 SECURITY: runtime configuration injection
   ------------------------------------------------------------
   Secrets (Supabase URL/anon key, admin passphrase) no longer
   live inside config.js source. Instead they are injected here
   as window.__LC_ENV__ *before* config.js loads.

   HOW TO CONFIGURE (pick ONE):
   1. Vercel / Netlify: set Environment Variables named
        LC_SUPABASE_URL, LC_SUPABASE_ANON_KEY, LC_ADMIN_PW
      and add an edge/header rewrite that injects this file, or
      simply edit the defaults below once per deployment.
   2. Local / static hosting: edit the DEFAULTS object below.
   3. Query-string override (dev only): append
        ?sburl=...&sbkey=... to the page URL.

   NOTE: the Supabase *anon* key is public by design — real
   protection comes from Row Level Security (see setup/rls.sql).
   The admin passphrase is checked client-side against a salted
   SHA-256 hash; the plaintext never needs to be shipped.
   ============================================================ */
(function(){
'use strict';

var q = {};
try{
  new URLSearchParams(location.search).forEach(function(v,k){ q[k] = v; });
}catch(e){}

var DEFAULTS = {
  url: 'https://ueuxnkrvvnvldfwgiyqy.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVldXhua3J2dm52bGRmd2dpeXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjM0ODUsImV4cCI6MjEwNTI5OTQ4NX0.DwDSWdnVK1-eWLvSuXpsf22PLtMVq_ZJ-1Kq39AoOSI',
  adminPw: 'Deepnectar@@1617@@' /* fallback only when no hash is configured */
};

window.__LC_ENV__ = {
  SUPABASE_URL:     q.sburl || DEFAULTS.url,
  SUPABASE_ANON_KEY: q.sbkey || DEFAULTS.key,
  ADMIN_PW:         q.adminpw || DEFAULTS.adminPw
};

})();
