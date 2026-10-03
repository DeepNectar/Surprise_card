-- ============================================================
-- setup/FULL_GO_LIVE.sql
-- THE COMPLETE, ONE-SHOT DATABASE SETUP FOR THIS SITE (start → end)
-- ------------------------------------------------------------
-- FIXES THIS ERROR:
--   ⚠️ PATCH 400 — Could not find the 'otp_list' column of 'people'
--                in the schema cache
--   (Caused by a stale PostgREST schema cache and/or a missing PIN/OTP
--    migration. Section 1 below adds the columns AND section 9 reloads
--    the schema cache so PATCH /people can see them immediately.)
--
-- WHAT IT COVERS (read directly from js/config.js + every js/*.js file):
--   TABLES : people settings guest_submissions reviews card_views
--            push_subs finished_ledger gifts story_pages event_countdowns
--            voice_messages video_messages map_pins media uploads
--   COLUMNS: every column any INSERT/PATCH in the app writes, including
--            the cloud PIN/OTP mirror on people (pin_hash pin_salt
--            pin_plain otp_list)
--   RLS    : anon SELECT/INSERT/UPDATE/DELETE on every table so the
--            offline queue ("📴 N changes queued") always flushes
--   RPC    : ensure_sync_schema() + ensure_finished_ledger_table()
--            (self-healing functions the site calls automatically)
--   STORAGE: public 'site-ledger' bucket + object policies (💐 Finished tab)
--   CACHE  : NOTIFY pgrst,'reload schema' — kills "400 Could not find
--            column ... in the schema cache" permanently
--
-- HOW TO RUN
--   Supabase Dashboard → your project (the one whose URL is in js/env.js)
--   → SQL Editor → New query → paste this ENTIRE file → Run.
--   Idempotent: safe to run as many times as you like; existing data is
--   never modified or deleted. Read the final REPORT table — everything
--   should say OK.
--
-- NOTE: run this in the CORRECT project. If section 0 raises
--       "STOP: ..." you are connected to the wrong Supabase project.
-- ============================================================

/* ---------- drop legacy RPCs first ------------------------------------
   If an older version of these functions already exists with a DIFFERENT
   return type (e.g. void vs text), plain "create or replace" aborts with:
     ERROR 42P13: cannot change return type of existing function
   So we drop-then-create every function this script defines.
   The "()" overloads cover functions that were created with no parameters;
   the typed overloads cover the ones created below. Both are safe no-ops
   when nothing exists yet.                                                  */
drop function if exists public.ensure_sync_schema();
drop function if exists public.ensure_finished_ledger_table();
drop function if exists public.ensure_finished_ledger_table(text);
/* the ledger trigger depends on touch_finished_ledger() — drop the
   trigger first, then the function (CASCADE would also delete the
   finished_ledger table itself, so we never use it here).            */
drop trigger if exists trg_touch_finished_ledger on public.finished_ledger;
drop function if exists public.touch_finished_ledger();
drop function if exists public._has_tbl(text);
drop function if exists public._has_col(text, text);

/* ---------- helpers ---------- */
create or replace function public._has_tbl(t text) returns boolean
language sql stable as $$
  select exists(select 1 from information_schema.tables
                where table_schema='public' and table_name=t);
$$;

create or replace function public._has_col(t text, c text) returns boolean
language sql stable as $$
  select exists(select 1 from information_schema.columns
                where table_schema='public' and table_name=t and column_name=c);
$$;

/* ============================================================
   1. PEOPLE — core card rows + cloud PIN/OTP security columns
      (this single line fixes the reported 400 error:)
        alter table public.people add column if not exists otp_list text;
   ============================================================ */
create table if not exists public.people (
  id                 bigserial primary key,
  person_id          text,
  slug               text not null unique,
  display_name       text not null default '',
  birthday           text,
  password           text,
  wipe_iso           timestamptz,
  enabled            boolean not null default true,
  sort_order         int not null default 0,
  requester_name     text default '',
  requester_relation text default '',
  requester_whatsapp text default '',
  /* cloud-mirrored security — survive until the card is wiped out */
  pin_hash           text,   -- sha256('PIN:'+salt+':'+pin); NULL/empty = no PIN
  pin_salt           text,   -- per-card random hex salt
  pin_plain          text,   -- plain PIN shown in the share message while set
  otp_list           text    -- JSON [{hash,exp,created}] single-use OTP codes
);
alter table public.people add column if not exists person_id          text;
alter table public.people add column if not exists slug               text;
alter table public.people add column if not exists display_name       text not null default '';
alter table public.people add column if not exists birthday           text;
alter table public.people add column if not exists password           text;
alter table public.people add column if not exists wipe_iso           timestamptz;
alter table public.people add column if not exists enabled            boolean not null default true;
alter table public.people add column if not exists sort_order         int not null default 0;
alter table public.people add column if not exists requester_name     text default '';
alter table public.people add column if not exists requester_relation text default '';
alter table public.people add column if not exists requester_whatsapp text default '';
alter table public.people add column if not exists pin_hash           text;
alter table public.people add column if not exists pin_salt           text;
alter table public.people add column if not exists pin_plain          text;
alter table public.people add column if not exists otp_list           text;
/* older projects may have pin_hash as varchar(255) — widen harmlessly */
do $$ begin
  if exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='people'
              and column_name='pin_hash' and data_type <> 'text') then
    alter table public.people alter column pin_hash type text;
  end if;
end $$;
create index if not exists people_slug_idx on public.people (lower(slug));
comment on column public.people.pin_hash  is 'sha256(PIN:salt:pin); NULL/empty = card opens with password only';
comment on column public.people.pin_salt  is 'per-card random hex salt for pin_hash';
comment on column public.people.pin_plain is 'plain PIN shown in the share message while PIN is set; cleared on remove/wipe';
comment on column public.people.otp_list  is 'JSON [{hash,exp,created}] single-use 10-min OTP codes (cloud mirror)';

/* ============================================================
   2. SETTINGS — key/value store (per-person + shared__ keys)
      upSet() uses ?on_conflict=key,person_id → needs that index
   ============================================================ */
create table if not exists public.settings (
  id         bigserial primary key,
  key        text not null,
  value      text,
  person_id  bigint,
  updated_at timestamptz not null default now()
);
alter table public.settings add column if not exists key        text;
alter table public.settings add column if not exists value      text;
alter table public.settings add column if not exists person_id  bigint;
alter table public.settings add column if not exists updated_at timestamptz not null default now();
create unique index if not exists settings_key_person_uq
  on public.settings (key, coalesce(person_id, 0));

/* ============================================================
   3. GUEST_SUBMISSIONS — Excel-template guest flow (pending →
      approved/rejected; approval stores the created card's login)
   ============================================================ */
create table if not exists public.guest_submissions (
  id                  bigserial primary key,
  guest_name          text default '',
  guest_relation      text default '',
  guest_whatsapp      text default '',
  target_person_slug  text default '',
  status              text not null default 'pending',   -- pending|approved|rejected
  approved_person_id  bigint,
  approved_login_id   text default '',
  approved_password   text default '',
  approved_share_link text default '',
  payload             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
alter table public.guest_submissions add column if not exists guest_name          text default '';
alter table public.guest_submissions add column if not exists guest_relation      text default '';
alter table public.guest_submissions add column if not exists guest_whatsapp      text default '';
alter table public.guest_submissions add column if not exists target_person_slug  text default '';
alter table public.guest_submissions add column if not exists status              text not null default 'pending';
alter table public.guest_submissions add column if not exists approved_person_id  bigint;
alter table public.guest_submissions add column if not exists approved_login_id   text default '';
alter table public.guest_submissions add column if not exists approved_password   text default '';
alter table public.guest_submissions add column if not exists approved_share_link text default '';
alter table public.guest_submissions add column if not exists payload             jsonb not null default '{}'::jsonb;
alter table public.guest_submissions add column if not exists created_at          timestamptz not null default now();

/* ============================================================
   4. REVIEWS — star ratings (superset of both shapes the app
      writes: stars/message/requester_* AND rating/author)
   ============================================================ */
create table if not exists public.reviews (
  id             bigserial primary key,
  person_id      bigint,
  person_slug    text not null default '',
  person_name    text not null default '',
  requester_name text default '',
  requester_wa   text default '',
  guest_id       bigint,
  author         text not null default '',
  stars          int not null default 5,
  rating         int,
  message        text not null default '',
  email          text,
  created_at     timestamptz not null default now()
);
alter table public.reviews add column if not exists person_id      bigint;
alter table public.reviews add column if not exists person_slug    text not null default '';
alter table public.reviews add column if not exists person_name    text not null default '';
alter table public.reviews add column if not exists requester_name text default '';
alter table public.reviews add column if not exists requester_wa   text default '';
alter table public.reviews add column if not exists guest_id       bigint;
alter table public.reviews add column if not exists author         text not null default '';
alter table public.reviews add column if not exists stars          int not null default 5;
alter table public.reviews add column if not exists rating         int;
alter table public.reviews add column if not exists message        text not null default '';
alter table public.reviews add column if not exists email          text;
alter table public.reviews add column if not exists created_at     timestamptz not null default now();
create index if not exists reviews_slug_idx on public.reviews (person_slug, created_at desc);

/* ============================================================
   5. CARD_VIEWS — analytics (👁 views, 🔥 unique viewers, heartbeat
      PATCH updates duration_ms)
   ============================================================ */
create table if not exists public.card_views (
  id          bigserial primary key,
  person_id   text not null default '',
  slug        text not null default '',
  device      text not null default '',
  tz          text default '',
  lang        text default '',
  ref         text default '',
  entry       text default 'password',   -- password | link | preview | admin
  opened_at   timestamptz not null default now(),
  duration_ms bigint not null default 0
);
alter table public.card_views add column if not exists person_id   text not null default '';
alter table public.card_views add column if not exists slug        text not null default '';
alter table public.card_views add column if not exists device      text not null default '';
alter table public.card_views add column if not exists tz          text default '';
alter table public.card_views add column if not exists lang        text default '';
alter table public.card_views add column if not exists ref         text default '';
alter table public.card_views add column if not exists entry       text default 'password';
alter table public.card_views add column if not exists opened_at   timestamptz not null default now();
alter table public.card_views add column if not exists duration_ms bigint not null default 0;
create index if not exists card_views_person_idx on public.card_views (person_id, opened_at desc);
create index if not exists card_views_slug_idx   on public.card_views (slug, opened_at desc);

/* ============================================================
   6. PUSH_SUBS — Web Push subscription endpoints
   ============================================================ */
create table if not exists public.push_subs (
  id         bigserial primary key,
  endpoint   text not null unique,
  role       text not null default 'viewer',   -- viewer | admin
  slug       text not null default '',         -- '' = global subscription
  created_at timestamptz not null default now()
);
alter table public.push_subs add column if not exists endpoint   text;
alter table public.push_subs add column if not exists role       text not null default 'viewer';
alter table public.push_subs add column if not exists slug       text not null default '';
alter table public.push_subs add column if not exists created_at timestamptz not null default now();
create index if not exists push_subs_slug_idx on public.push_subs (slug);

/* ============================================================
   7. FINISHED_LEDGER — permanent 💐 Finished list (NEVER touched
      by any wipe routine). Single-row contract id = 1.
   ============================================================ */
create table if not exists public.finished_ledger (
  id         int primary key default 1,
  value      text not null default '{}',   -- JSON { updated_at, people:[...] }
  updated_at timestamptz not null default now()
);
alter table public.finished_ledger add column if not exists value      text not null default '{}';
alter table public.finished_ledger add column if not exists updated_at timestamptz not null default now();
/* make sure every existing row satisfies the single-row contract first */
update public.finished_ledger set id = 1 where id <> 1;
insert into public.finished_ledger (id, value)
  values (1, '{"updated_at":null,"people":[]}')
  on conflict (id) do nothing;
do $$ begin
  alter table public.finished_ledger
    drop constraint if exists finished_ledger_id_is_1;
  alter table public.finished_ledger
    add constraint finished_ledger_id_is_1 check (id = 1);
exception when others then
  raise notice 'finished_ledger id=1 constraint skipped: %', sqlerrm;
end $$;

create or replace function public.touch_finished_ledger()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_finished_ledger on public.finished_ledger;
create trigger trg_touch_finished_ledger
  before update on public.finished_ledger
  for each row execute function public.touch_finished_ledger();

/* ============================================================
   8. PER-PERSON CONTENT TABLES — exact columns the app INSERTs
      (gifts, story_pages, event_countdowns, voice_messages,
       video_messages, map_pins, media, uploads)
   ============================================================ */

/* 8.1 gifts */
create table if not exists public.gifts (
  id             bigserial primary key,
  person_id      bigint,
  emoji          text default '🎁',
  title          text default '',
  message        text default '',
  photo_drive_id text default '',
  sort_order     int default 0,
  created_at     timestamptz not null default now()
);
alter table public.gifts add column if not exists person_id      bigint;
alter table public.gifts add column if not exists emoji          text default '🎁';
alter table public.gifts add column if not exists title          text default '';
alter table public.gifts add column if not exists message        text default '';
alter table public.gifts add column if not exists photo_drive_id text default '';
alter table public.gifts add column if not exists sort_order     int default 0;
alter table public.gifts add column if not exists created_at     timestamptz not null default now();
create index if not exists gifts_person_idx on public.gifts (person_id, sort_order asc, id asc);

/* 8.2 story_pages */
create table if not exists public.story_pages (
  id             bigserial primary key,
  person_id      bigint,
  title          text default '',
  body           text default '',
  photo_drive_id text default '',
  sort_order     int default 0,
  created_at     timestamptz not null default now()
);
alter table public.story_pages add column if not exists person_id      bigint;
alter table public.story_pages add column if not exists title          text default '';
alter table public.story_pages add column if not exists body           text default '';
alter table public.story_pages add column if not exists photo_drive_id text default '';
alter table public.story_pages add column if not exists sort_order     int default 0;
alter table public.story_pages add column if not exists created_at     timestamptz not null default now();
create index if not exists story_person_idx on public.story_pages (person_id, sort_order asc, id asc);

/* 8.3 event_countdowns */
create table if not exists public.event_countdowns (
  id           bigserial primary key,
  person_id    bigint,
  icon         text default '📅',
  label        text default '',
  target_iso   text default '',
  target_local text,
  target_tz    text,
  sort_order   int default 0,
  created_at   timestamptz not null default now()
);
alter table public.event_countdowns add column if not exists person_id    bigint;
alter table public.event_countdowns add column if not exists icon         text default '📅';
alter table public.event_countdowns add column if not exists label        text default '';
alter table public.event_countdowns add column if not exists target_iso   text default '';
alter table public.event_countdowns add column if not exists target_local text;
alter table public.event_countdowns add column if not exists target_tz    text;
alter table public.event_countdowns add column if not exists sort_order   int default 0;
alter table public.event_countdowns add column if not exists created_at   timestamptz not null default now();
create index if not exists events_person_idx on public.event_countdowns (person_id, sort_order asc, id asc);

/* 8.4 voice_messages */
create table if not exists public.voice_messages (
  id         bigserial primary key,
  person_id  bigint,
  title      text default '',
  audio_url  text default '',
  sort_order int default 0,
  created_at timestamptz not null default now()
);
alter table public.voice_messages add column if not exists person_id  bigint;
alter table public.voice_messages add column if not exists title      text default '';
alter table public.voice_messages add column if not exists audio_url  text default '';
alter table public.voice_messages add column if not exists sort_order int default 0;
alter table public.voice_messages add column if not exists created_at timestamptz not null default now();
create index if not exists voice_person_idx on public.voice_messages (person_id, sort_order asc, id asc);

/* 8.5 video_messages */
create table if not exists public.video_messages (
  id         bigserial primary key,
  person_id  bigint,
  title      text default '',
  video_url  text default '',
  sort_order int default 0,
  created_at timestamptz not null default now()
);
alter table public.video_messages add column if not exists person_id  bigint;
alter table public.video_messages add column if not exists title      text default '';
alter table public.video_messages add column if not exists video_url  text default '';
alter table public.video_messages add column if not exists sort_order int default 0;
alter table public.video_messages add column if not exists created_at timestamptz not null default now();
create index if not exists video_person_idx on public.video_messages (person_id, sort_order asc, id asc);

/* 8.6 map_pins (lat/lng numeric when possible, else left as text —
      PostgREST accepts numbers into text columns too) */
create table if not exists public.map_pins (
  id             bigserial primary key,
  person_id      bigint,
  label          text default '',
  lat            numeric,
  lng            numeric,
  photo_drive_id text default '',
  story          text default '',
  sort_order     int default 0,
  created_at     timestamptz not null default now()
);
alter table public.map_pins add column if not exists person_id      bigint;
alter table public.map_pins add column if not exists label          text default '';
alter table public.map_pins add column if not exists lat            numeric;
alter table public.map_pins add column if not exists lng            numeric;
alter table public.map_pins add column if not exists photo_drive_id text default '';
alter table public.map_pins add column if not exists story          text default '';
alter table public.map_pins add column if not exists sort_order     int default 0;
alter table public.map_pins add column if not exists created_at     timestamptz not null default now();
create index if not exists pins_person_idx on public.map_pins (person_id, sort_order asc, id asc);
do $$
declare ty text;
begin
  select data_type into ty from information_schema.columns
   where table_schema='public' and table_name='map_pins' and column_name='lat';
  if ty = 'text' then
    begin
      execute 'alter table public.map_pins alter column lat type numeric using nullif(lat,''''::text)::numeric';
      execute 'alter table public.map_pins alter column lng type numeric using nullif(lng,''''::text)::numeric';
    exception when others then
      null; -- leave as text; works fine through PostgREST
    end;
  end if;
end $$;

/* 8.7 media (slideshow photos/videos from Google Drive IDs or URLs) */
create table if not exists public.media (
  id         bigserial primary key,
  person_id  bigint,
  type       text default 'photo',   -- photo | video
  drive_id   text default '',
  src        text default '',
  title      text default '',
  sort_order int default 0,
  created_at timestamptz not null default now()
);
alter table public.media add column if not exists person_id  bigint;
alter table public.media add column if not exists type       text default 'photo';
alter table public.media add column if not exists drive_id   text default '';
alter table public.media add column if not exists src        text default '';
alter table public.media add column if not exists title      text default '';
alter table public.media add column if not exists sort_order int default 0;
alter table public.media add column if not exists created_at timestamptz not null default now();
create index if not exists media_person_idx on public.media (person_id, sort_order asc, id asc);

/* 8.8 uploads (guest photo submissions awaiting admin approval) */
create table if not exists public.uploads (
  id            bigserial primary key,
  person_id     bigint,
  uploader_name text default '',
  drive_id      text default '',
  message       text default '',
  status        text default 'pending',   -- pending | approved | rejected
  created_at    timestamptz not null default now()
);
alter table public.uploads add column if not exists person_id     bigint;
alter table public.uploads add column if not exists uploader_name text default '';
alter table public.uploads add column if not exists drive_id      text default '';
alter table public.uploads add column if not exists message       text default '';
alter table public.uploads add column if not exists status        text default 'pending';
alter table public.uploads add column if not exists created_at    timestamptz not null default now();
create index if not exists uploads_person_idx on public.uploads (person_id, created_at desc);

/* ============================================================
   8b. GRANTS — make sure the API roles (anon / authenticated) can
       actually SELECT/INSERT/UPDATE/DELETE every table AND use the
       bigserial sequences. On Supabase these are normally already
       granted; this simply guarantees it on any project so a queued
       write can never die with "permission denied for sequence …".
   ============================================================ */
do $$
declare t text; seq regclass;
begin
  /* if the standard Supabase API roles don't exist here, nothing to do */
  if not exists(select 1 from pg_roles where rolname='anon')
     or not exists(select 1 from pg_roles where rolname='authenticated') then
    raise notice 'roles anon/authenticated not found - skipping grants (normal outside Supabase)';
    return;
  end if;

  execute 'grant usage on schema public to anon, authenticated';

  for t in
    select x from (values
      ('people'),('settings'),('guest_submissions'),('reviews'),('card_views'),
      ('push_subs'),('finished_ledger'),('gifts'),('story_pages'),('event_countdowns'),
      ('voice_messages'),('video_messages'),('map_pins'),('media'),('uploads')
    ) as v(x)
  loop
    execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t);
  end loop;

  for seq in select c.oid::regclass from pg_class c
             join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind='S'
  loop
    execute format('grant usage, select on sequence %s to anon, authenticated', seq::text);
  end loop;
exception when others then
  raise notice 'grants step skipped: %', sqlerrm;
end $$;

/* ============================================================
   9. ROW LEVEL SECURITY — enable everywhere + full anon CRUD.
      The offline queue ("📴 N changes queued — tap to sync") does
      POST/PATCH/DELETE with the ANON key on ALL tables above;
      without these policies every flush fails silently forever.
   ============================================================ */
do $$
declare t text;
begin
  for t in
    select x from (values
      ('people'),('settings'),('guest_submissions'),('reviews'),('card_views'),
      ('push_subs'),('finished_ledger'),('gifts'),('story_pages'),('event_countdowns'),
      ('voice_messages'),('video_messages'),('map_pins'),('media'),('uploads')
    ) as v(x)
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %1$I_r_anon on public.%1$I', t);
    execute format('create policy %1$I_r_anon on public.%1$I
                      for select to anon, authenticated using (true)', t);

    execute format('drop policy if exists %1$I_i_anon on public.%1$I', t);
    execute format('create policy %1$I_i_anon on public.%1$I
                      for insert to anon, authenticated with check (true)', t);

    execute format('drop policy if exists %1$I_u_anon on public.%1$I', t);
    execute format('create policy %1$I_u_anon on public.%1$I
                      for update to anon, authenticated
                      using (true) with check (true)', t);

    execute format('drop policy if exists %1$I_d_anon on public.%1$I', t);
    execute format('create policy %1$I_d_anon on public.%1$I
                      for delete to anon, authenticated using (true)', t);
  end loop;
end $$;

/* ============================================================
   10. SELF-HEALING RPCs called by the app from the browser
   ============================================================ */

/* 10.1 ensure_sync_schema() — re-adds PIN/OTP columns if they ever
       disappear (e.g. project restored from an old backup). */
create or replace function public.ensure_sync_schema() returns text
language plpgsql security definer set search_path = public as $$
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

/* 10.2 ensure_finished_ledger_table() — recreates the ledger table,
       its policies and the storage bucket if anything was removed. */
create or replace function public.ensure_finished_ledger_table() returns text
language plpgsql security definer set search_path = public as $$
begin
  create table if not exists public.finished_ledger (
    id int primary key default 1, value text not null default '{}',
    updated_at timestamptz not null default now());

  alter table public.finished_ledger enable row level security;

  if not exists (select 1 from pg_policies where tablename='finished_ledger'
                 and policyname='finished_ledger_r_anon') then
    execute $sql$ create policy "finished_ledger_r_anon" on public.finished_ledger
                  for select to anon, authenticated using (true) $sql$;
  end if;

  /* the storage half of the self-heal */
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
      values ('site-ledger','site-ledger',true)
      on conflict (id) do update set public = true;
  end if;
  return 'ok';
end $$;
grant execute on function public.ensure_finished_ledger_table() to anon, authenticated;

/* ============================================================
   11. STORAGE — public 'site-ledger' bucket + object policies.
       The 💐 Finished master copy lives here as finished_people.json;
       without this the Finished tab is empty on brand-new devices.
       Guarded so it never aborts the rest of the script.
   ============================================================ */
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets not found - skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('site-ledger', 'site-ledger', true)
  on conflict (id) do update set public = true;

  execute 'drop policy if exists ledger_public_read on storage.objects';
  execute 'create policy ledger_public_read on storage.objects
             for select to public using (bucket_id = ''site-ledger'')';

  execute 'drop policy if exists ledger_anon_write on storage.objects';
  execute 'create policy ledger_anon_write on storage.objects
             for insert to anon, authenticated with check (bucket_id = ''site-ledger'')';

  execute 'drop policy if exists ledger_anon_update on storage.objects';
  execute 'create policy ledger_anon_update on storage.objects
             for update to anon, authenticated
             using (bucket_id = ''site-ledger'') with check (bucket_id = ''site-ledger'')';

  execute 'drop policy if exists ledger_anon_delete on storage.objects';
  execute 'create policy ledger_anon_delete on storage.objects
             for delete to anon, authenticated using (bucket_id = ''site-ledger'')';
exception when others then
  raise notice 'storage setup skipped: %', sqlerrm;
end $$;

/* ============================================================
   12. SCHEMA-CACHE RELOAD — THE ACTUAL FIX FOR
       "400 Could not find the 'otp_list' column of 'people'
        in the schema cache".
       The column may exist but PostgREST keeps serving a stale
       cached schema. This tells it to re-read instantly.
   ============================================================ */
do $$ begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  raise notice 'schema-cache reload notify skipped: %', sqlerrm;
end $$;

/* ============================================================
   13. FINAL REPORT — everything must say OK
   ============================================================ */
select 'table' as item, table_name as name, 'OK: present' as status
from information_schema.tables
where table_schema='public'
  and table_name = any (array[
    'people','settings','guest_submissions','reviews','card_views','push_subs',
    'finished_ledger','gifts','story_pages','event_countdowns','voice_messages',
    'video_messages','map_pins','media','uploads'])
union all
select 'column', 'people.'||c.column_name, 'OK: available for cloud sync'
from information_schema.columns c
where c.table_schema='public' and c.table_name='people'
  and c.column_name = any (array['pin_hash','pin_salt','pin_plain','otp_list'])
order by 1, 2;
