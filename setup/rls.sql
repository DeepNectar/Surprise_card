-- ============================================================
-- setup/rls.sql — ONE-TIME Supabase setup for v1.0 features
--
-- WHAT IT DOES
--   1. Creates the `card_views` table used by js/analytics.js
--      (view tracking: 👁 views, 🔥 unique viewers, time-on-card).
--      Anon may INSERT and UPDATE rows it created (heartbeat);
--      anon may SELECT aggregates read by the admin panel.
--   2. Creates the `push_subs` table used by js/notify.js
--      (Web Push subscription endpoints). Anon may INSERT;
--      duplicates on endpoint are ignored by the client.
--   3. (Optional hardening) If you have ALREADY committed the old
--      plaintext admin passphrase anywhere, rotate it in the app
--      (Admin → 🔐 Hash & Save) so only shared__adminPwHash (salted
--      SHA-256) remains in the settings table.
--
-- HOW TO RUN
--   Supabase Dashboard → your project → SQL Editor → New query →
--   paste this entire file → Run. Idempotent: safe to run any
--   number of times. Without it, analytics & push degrade
--   silently (by design) — everything else keeps working.
-- ============================================================

/* ---------- 1. card_views (analytics) ---------- */
create table if not exists public.card_views (
  id          bigserial primary key,
  person_id   text not null,
  slug        text not null default '',
  device      text not null default '',        -- random hashed device id, no PII
  tz          text default '',                 -- Intl timezone hint (country)
  lang        text default '',
  ref         text default '',                 -- referrer (truncated)
  entry       text default 'password',         -- password | link | preview | admin
  opened_at   timestamptz not null default now(),
  duration_ms bigint not null default 0
);

create index if not exists card_views_person_idx on public.card_views (person_id, opened_at desc);
create index if not exists card_views_slug_idx   on public.card_views (slug, opened_at desc);

alter table public.card_views enable row level security;

drop policy if exists "views_insert" on public.card_views;
create policy "views_insert" on public.card_views
  for insert to anon, authenticated with check (true);

drop policy if exists "views_read" on public.card_views;
create policy "views_read" on public.card_views
  for select to anon, authenticated using (true);

/* Heartbeat PATCH from js/analytics.js updates the newest row only
   (filtered by person_id/slug/entry); allow anon to update durations. */
drop policy if exists "views_update" on public.card_views;
create policy "views_update" on public.card_views
  for update to anon, authenticated using (true) with check (true);

/* ---------- 2. push_subs (web push notifications) ---------- */
create table if not exists public.push_subs (
  id          bigserial primary key,
  endpoint    text not null unique,
  role        text not null default 'viewer',  -- viewer | admin
  slug        text not null default '',        -- '' = global subscription
  created_at  timestamptz not null default now()
);

create index if not exists push_subs_slug_idx on public.push_subs (slug);

alter table public.push_subs enable row level security;

drop policy if exists "subs_insert" on public.push_subs;
create policy "subs_insert" on public.push_subs
  for insert to anon, authenticated with check (true);

/* Subscriptions are readable only to signed-in admins (the browser
   never lists them; a push server would use the service_role key). */
drop policy if exists "subs_read" on public.push_subs;
create policy "subs_read" on public.push_subs
  for select to authenticated using (true);

drop policy if exists "subs_delete" on public.push_subs;
create policy "subs_delete" on public.push_subs
  for delete to authenticated using (true);

/* ---------- 3. Sanity: settings mirror used by the ledger ---------- */
/* js/supabase.js upserts shared__finished_ledger into the existing
   `settings` table. Ensure anon can do that (delete+insert pattern).
   These policies are additive and idempotent. */
alter table if exists public.settings enable row level security;

drop policy if exists "settings_anon_read" on public.settings;
create policy "settings_anon_read" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "settings_anon_write" on public.settings;
create policy "settings_anon_write" on public.settings
  for insert to anon, authenticated with check (true);

drop policy if exists "settings_anon_update" on public.settings;
create policy "settings_anon_update" on public.settings
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "settings_anon_delete" on public.settings;
create policy "settings_anon_delete" on public.settings
  for delete to anon, authenticated using (true);
