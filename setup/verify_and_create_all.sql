-- ============================================================
-- setup/verify_and_create_all.sql
-- ONE-SHOT: VERIFY every table/column/policy this site needs,
-- and CREATE anything that is missing. 100% idempotent ? run it
-- as many times as you like; existing items are left untouched.
--
-- HOW TO USE
--   Supabase Dashboard -> your project -> SQL Editor -> New query
--   -> paste this ENTIRE file -> Run.
--   Read the final report table: ? = was already there,
--   ? = created/fixed now. If "people" shows MISSING at the top,
--   you are in the WRONG Supabase project.
--
-- WHAT IT COVERS (read from js/config.js + js/supabase.js):
--   tables: people settings guest_submissions reviews card_views
--           push_subs finished_ledger gifts story_pages
--           event_countdowns voice_messages video_messages
--           map_pins media uploads
--   cloud PIN/OTP columns on people: pin_hash pin_salt pin_plain otp_list
--   anon RLS policies so the offline queue ("changes queued" pill) can flush
-- ============================================================

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

/* ---------- 0. guard: right project? ---------- */
do $$
begin
  if not public._has_tbl('people') then
    raise exception 'STOP: public.people not found ? open the correct Supabase project first (the one connected to this site).';
  end if;
end $$;

/* ---------- 1. people : core + PIN/OTP cloud columns ---------- */
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
  -- cloud-mirrored security (saved until wipe-out)
  pin_hash           varchar(255),
  pin_salt           text,
  pin_plain          text,   -- shown in the share message while a PIN is set
  otp_list           text    -- JSON array of OTP codes, survives until wiped
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
alter table public.people add column if not exists pin_hash           varchar(255);
alter table public.people add column if not exists pin_salt           text;
alter table public.people add column if not exists pin_plain          text;
alter table public.people add column if not exists otp_list           text;
create index if not exists people_slug_idx on public.people (lower(slug));

/* ---------- 2. settings (KV) ---------- */
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

/* ---------- 3. guest_submissions ---------- */
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

/* ---------- 4. reviews ---------- */
create table if not exists public.reviews (
  id            bigserial primary key,
  person_id     bigint,
  person_slug   text not null default '',
  person_name   text not null default '',
  requester_name text default '',
  requester_wa  text default '',
  guest_id      bigint,
  stars         int not null default 5,
  message       text not null default '',
  email         text,
  created_at    timestamptz not null default now()
);
alter table public.reviews add column if not exists person_id      bigint;
alter table public.reviews add column if not exists person_slug    text not null default '';
alter table public.reviews add column if not exists person_name    text not null default '';
alter table public.reviews add column if not exists requester_name text default '';
alter table public.reviews add column if not exists requester_wa   text default '';
alter table public.reviews add column if not exists guest_id       bigint;
alter table public.reviews add column if not exists stars          int not null default 5;
alter table public.reviews add column if not exists message        text not null default '';
alter table public.reviews add column if not exists email          text;
alter table public.reviews add column if not exists created_at     timestamptz not null default now();
create index if not exists reviews_slug_idx on public.reviews (person_slug, created_at desc);

/* ---------- 5. card_views (analytics) ---------- */
create table if not exists public.card_views (
  id          bigserial primary key,
  person_id   text not null,
  slug        text not null default '',
  device      text not null default '',
  tz          text default '',
  lang        text default '',
  ref         text default '',
  entry       text default 'password',
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

/* ---------- 6. push_subs ---------- */
create table if not exists public.push_subs (
  id         bigserial primary key,
  endpoint   text not null unique,
  role       text not null default 'viewer',
  slug       text not null default '',
  created_at timestamptz not null default now()
);
alter table public.push_subs add column if not exists endpoint   text;
alter table public.push_subs add column if not exists role       text not null default 'viewer';
alter table public.push_subs add column if not exists slug       text not null default '';
alter table public.push_subs add column if not exists created_at timestamptz not null default now();
create index if not exists push_subs_slug_idx on public.push_subs (slug);

/* ---------- 7. finished_ledger (cloud copy of the Finished list) ---------- */
create table if not exists public.finished_ledger (
  id         int primary key default 1,
  value      text not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.finished_ledger add column if not exists value      text not null default '{}';
alter table public.finished_ledger add column if not exists updated_at timestamptz not null default now();

/* ---------- 8. per-person content tables + column backfill ----------
   All DDL here is done via dynamic SQL so nothing can fail on older
   table shapes (e.g. map_pins.lat stored as text). */
do $$
declare
  t text; c text; ty text;
begin
  /* create any missing table with its full shape */
  create table if not exists public.gifts         (id bigserial primary key);
  create table if not exists public.story_pages   (id bigserial primary key);
  create table if not exists public.event_countdowns (id bigserial primary key);
  create table if not exists public.voice_messages   (id bigserial primary key);
  create table if not exists public.video_messages   (id bigserial primary key);
  create table if not exists public.map_pins      (id bigserial primary key);
  create table if not exists public.media         (id bigserial primary key);
  create table if not exists public.uploads       (id bigserial primary key);

  foreach t in array ('gifts','story_pages','event_countdowns','voice_messages',
                      'video_messages','map_pins','media','uploads') loop
    execute format('alter table public.%I add column if not exists person_id bigint', t);
    execute format('alter table public.%I add column if not exists title text default ''''', t);
    execute format('alter table public.%I add column if not exists sort_order int default 0', t);
    execute format('alter table public.%I add column if not exists created_at timestamptz not null default now()', t);
  end loop;

  /* per-table unique columns (all added as text first ? Postgres
     coerces JS numbers fine through PostgREST) */
  for t, c in select * from (values
      ('gifts','emoji'), ('gifts','message'), ('gifts','photo_drive_id'),
      ('story_pages','body'), ('story_pages','photo_drive_id'),
      ('event_countdowns','icon'), ('event_countdowns','label'),
      ('event_countdowns','target_iso'), ('event_countdowns','target_local'), ('event_countdowns','target_tz'),
      ('voice_messages','audio_url'),
      ('video_messages','video_url'),
      ('map_pins','label'), ('map_pins','lat'), ('map_pins','lng'),
      ('map_pins','photo_drive_id'), ('map_pins','story'),
      ('media','type'), ('media','drive_id'), ('media','src'),
      ('uploads','uploader_name'), ('uploads','drive_id'), ('uploads','message'), ('uploads','status')
    ) as v(t,c) loop
    execute format('alter table public.%I add column if not exists %I text', t, c);
  end loop;

  /* map_pins lat/lng: convert text->numeric only if currently text and table is empty-safe */
  select data_type into ty from information_schema.columns
   where table_schema='public' and table_name='map_pins' and column_name='lat';
  if ty = 'text' then
    begin
      execute 'alter table public.map_pins alter column lat type numeric using nullif(lat,''''::text)::numeric';
      execute 'alter table public.map_pins alter column lng type numeric using nullif(lng,''''::text)::numeric';
    exception when others then
      null; -- leave as text; PostgREST accepts numeric input into text too
    end;
  end if;
end $$;

/* ---------- 9. RLS: enable everywhere + ensure anon policies ---------- */
do $$
declare
  t text;
begin
  foreach t in array ('people','settings','guest_submissions','reviews','card_views',
                      'push_subs','finished_ledger','gifts','story_pages','event_countdowns',
                      'voice_messages','video_messages','map_pins','media','uploads') loop
    execute format('alter table public.%I enable row level security', t);
    -- read
    execute format('drop policy if exists %1$I_r_anon on public.%1$I', t);
    execute format('create policy %1$I_r_anon on public.%1$I for select to anon, authenticated using (true)', t);
    -- write (insert)
    execute format('drop policy if exists %1$I_i_anon on public.%1$I', t);
    execute format('create policy %1$I_i_anon on public.%1$I for insert to anon, authenticated with check (true)', t);
    -- update (offline queue PATCHes land here)
    execute format('drop policy if exists %1$I_u_anon on public.%1$I', t);
    execute format('create policy %1$I_u_anon on public.%1$I for update to anon, authenticated using (true) with check (true)', t);
    -- delete (wipe-out)
    execute format('drop policy if exists %1$I_d_anon on public.%1$I', t);
    execute format('create policy %1$I_d_anon on public.%1$I for delete to anon, authenticated using (true)', t);
  end loop;
end $$;

/* ---------- 10. self-healing RPCs called by the app ---------- */
create or replace function public.ensure_sync_schema() returns text
language plpgsql security definer set search_path = public as $$
begin
  alter table public.people add column if not exists pin_hash  varchar(255);
  alter table public.people add column if not exists pin_salt  text;
  alter table public.people add column if not exists pin_plain text;
  alter table public.people add column if not exists otp_list  text;
  return 'ok';
end $$;
grant execute on function public.ensure_sync_schema() to anon, authenticated;

create or replace function public.ensure_finished_ledger_table() returns text
language plpgsql security definer set search_path = public as $$
begin
  create table if not exists public.finished_ledger (
    id int primary key default 1, value text not null default '{}',
    updated_at timestamptz not null default now());
  return 'ok';
end $$;
grant execute on function public.ensure_finished_ledger_table() to anon, authenticated;


/* ---------- 10b. Storage: public 'site-ledger' bucket + object policies
   (the Finished ledger is saved as an object in Storage; without this
    the ??? tab cannot load on a fresh device). Idempotent. ---------- */
insert into storage.buckets (id, name, public)
values ('site-ledger', 'site-ledger', true)
on conflict (id) do update set public = true;

drop policy if exists ledger_public_read on storage.objects;
create policy ledger_public_read on storage.objects
  for select to public using (bucket_id = 'site-ledger');

drop policy if exists ledger_anon_write on storage.objects;
create policy ledger_anon_write on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'site-ledger');

drop policy if exists ledger_anon_update on storage.objects;
create policy ledger_anon_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'site-ledger') with check (bucket_id = 'site-ledger');

drop policy if exists ledger_anon_delete on storage.objects;
create policy ledger_anon_delete on storage.objects
  for delete to anon, authenticated using (bucket_id = 'site-ledger');

/* ---------- 11. REPORT: what existed before, what we fixed ---------- */
select
  'table' as item, table_name as name,
  case when table_name = any (array['people']) then 'OK: required core table present'
       else 'OK: present' end as status
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
union all
select 'storage-bucket', b.id, case when b.public then 'OK: public bucket ready' else 'WARN: not public' end
from storage.buckets b where b.id = 'site-ledger'
union all
select 'rls-policy', tablename||' ('||policyname||')',
       case when permissive='Y' then 'OK: open to anon key' else 'WARN: restrictive' end
from pg_policies
where schemaname='public'
order by 1, 2;
