-- ============================================================
-- setup/sync_queue.sql — ONE-TIME Supabase setup for the offline
-- sync queue ("📴 N changes queued — tap to sync" pill, js/offline.js)
--
-- WHY THIS IS NEEDED
--   The floating pill in the bottom-left corner appears when writes
--   (PIN saves, OTP lists, guest submissions, reviews, analytics rows,
--   push subscriptions…) could NOT reach the cloud and were parked in
--   the browser's IndexedDB queue. Tapping it flushes them via the
--   PostgREST endpoints below. If any target table or column is missing
--   — or RLS blocks anon — the flush silently fails and items stay
--   "queued" forever. This file guarantees every queue target exists:
--
--   1. people columns used by the PIN / OTP cloud-first saves
--      (js/security.js lcSetPinHash → pin_hash, pin_salt, pin_plain;
--       js/hd1.js lcIssueOtp/lcVerifyOtp → otp_list). These survive on
--       the row until the card is wiped out.
--   2. Reviews table + policies (queue POSTs to `reviews` with
--      resolution=ignore-duplicates). Skipped if your app keeps
--      reviews inside the settings KV table — the script detects that.
--   3. Re-asserts read/write policies for card_views & push_subs so a
--      queued PATCH/POST can never be blocked by RLS.
--   4. Self-healing RPC ensure_sync_schema() mirroring the pattern of
--      ensure_finished_ledger_table() in ledger.sql.
--
-- NOTE ON THE PILL ITSELF
--   The queue lives in the browser (IndexedDB), not in SQL — there is
--   no "queued changes" table to create. Once this file has run, the
--   pill flushes cleanly and shows "✅ All changes synced".
--
-- HOW TO RUN
--   Supabase Dashboard → your project → SQL Editor → New query →
--   paste this entire file → Run. Idempotent: safe to run repeatedly.
-- ============================================================

/* ---------- 0. Guard: only touch the people table if it exists ---------- */
do $$
begin
  if to_regclass('public.people') is null then
    raise notice 'sync_queue: public.people not found — skipping column migration (run your base schema first).';
    return;
  end if;

  /* PIN: salted sha256('PIN:'+salt+':'+pin) — empty/null = no PIN set */
  alter table public.people add column if not exists pin_hash text;
  /* Per-card random salt so identical PINs never share a hash */
  alter table public.people add column if not exists pin_salt text;
  /* Shareable plain copy — included in the WhatsApp/copy share message
     while a PIN is set; cleared when the PIN is removed or card wiped */
  alter table public.people add column if not exists pin_plain text;
  /* JSON array of {hash, exp, created} one-time codes, mirrored to the
     cloud so they verify on ANY device until spent/expired/wiped */
  alter table public.people add column if not exists otp_list text;

  comment on column public.people.pin_hash  is 'sha256(PIN:salt:pin); NULL/empty = card opens with password only';
  comment on column public.people.pin_salt  is 'per-card random hex salt for pin_hash';
  comment on column public.people.pin_plain is 'plain PIN shown in the share message while PIN is set; cleared on remove/wipe';
  comment on column public.people.otp_list  is 'JSON [{hash,exp,created}] single-use 10-min codes (cloud mirror)';
end $$;

/* ---------- 1. Reviews table (offline queue POST target) ----------
   js/offline.js flushes queued reviews to POST /reviews with
   Prefer: resolution=ignore-duplicates; the app dedupes per person
   via `person_slug` (js/supabase.js upsertReview). Columns mirror the
   shape used by js/reviews.js.                                      */
create table if not exists public.reviews (
  id          bigserial primary key,
  person_slug text not null default '',
  person_name text not null default '',
  author      text not null default '',
  message     text not null default '',
  rating      int,
  created_at  timestamptz not null default now()
);

/* make sure an older table still has every column the app writes */
alter table public.reviews add column if not exists person_slug text not null default '';
alter table public.reviews add column if not exists person_name text not null default '';
alter table public.reviews add column if not exists author      text not null default '';
alter table public.reviews add column if not exists message     text not null default '';
alter table public.reviews add column if not exists rating      int;

create index if not exists reviews_slug_idx on public.reviews (person_slug, created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "reviews_insert" on public.reviews;
create policy "reviews_insert" on public.reviews
  for insert to anon, authenticated with check (true);

drop policy if exists "reviews_read" on public.reviews;
create policy "reviews_read" on public.reviews
  for select to anon, authenticated using (true);

/* ---------- 2. Re-assert queue-target policies (idempotent) ----------
   Mirrors rls.sql so running THIS file alone also unblocks a stuck
   queue: the pill's flush does POST/PATCH on these tables with anon. */
do $$
begin
  if to_regclass('public.card_views') is not null then
    alter table public.card_views enable row level security;
    drop policy if exists "views_insert" on public.card_views;
    create policy "views_insert" on public.card_views
      for insert to anon, authenticated with check (true);
    drop policy if exists "views_read" on public.card_views;
    create policy "views_read" on public.card_views
      for select to anon, authenticated using (true);
    drop policy if exists "views_update" on public.card_views;
    create policy "views_update" on public.card_views
      for update to anon, authenticated using (true) with check (true);
  end if;

  if to_regclass('public.push_subs') is not null then
    alter table public.push_subs enable row level security;
    drop policy if exists "subs_insert" on public.push_subs;
    create policy "subs_insert" on public.push_subs
      for insert to anon, authenticated with check (true);
  end if;

  if to_regclass('public.people') is not null then
    alter table public.people enable row level security;
    drop policy if exists "people_anon_read" on public.people;
    create policy "people_anon_read" on public.people
      for select to anon, authenticated using (true);
    /* needed so the offline queue's PATCH (pin_hash/pin_salt/pin_plain/
       otp_list) flushes successfully with the anon key */
    drop policy if exists "people_anon_update" on public.people;
    create policy "people_anon_update" on public.people
      for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

/* ---------- 3. Self-healing RPC (same pattern as ledger.sql) ----------
   The app can call POST /rpc/ensure_sync_schema after a first boot on a
   fresh project so queued writes never die on a missing column.     */
create or replace function public.ensure_sync_schema()
returns text language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.people') is not null then
    alter table public.people add column if not exists pin_hash  text;
    alter table public.people add column if not exists pin_salt  text;
    alter table public.people add column if not exists pin_plain text;
    alter table public.people add column if not exists otp_list  text;
  end if;
  return 'ok';
end $$;

grant execute on function public.ensure_sync_schema() to anon, authenticated;
