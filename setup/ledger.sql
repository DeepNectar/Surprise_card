-- ============================================================
-- setup/ledger.sql — ONE-TIME Supabase setup for the 💐 Finished tab
-- (HD0.6)
--
-- WHAT IT DOES
--   1. Creates a permanent `finished_ledger` table that NO wipe routine
--      ever touches. When you move a person from the ✅ Completed tab to
--      💐 Finished (or their card auto-wipes on the scheduled date & time),
--      the entry is stored HERE in the cloud — so it shows on the home
--      screen for EVERY visitor, on every device/domain, even a brand-new
--      phone that has never opened the site before, and even after all
--      card data has been wiped out.
--   2. Enables RLS with permissive anon policies (read + insert + update)
--      so the browser can sync the ledger directly with your anon key.
--   3. Creates the public 'site-ledger' Storage bucket + anon upload
--      policies (the second cloud copy of the same JSON).
--   4. Creates the self-healing RPC `ensure_finished_ledger_table()` that
--      the app calls automatically — after you run this file ONCE, new
--      projects/domains bootstrap themselves.
--
-- HOW TO RUN
--   Supabase Dashboard → your project → SQL Editor → New query →
--   paste this entire file → Run. Idempotent: safe to run any number of
--   times.
-- ============================================================

/* ---------- 1. Permanent finished-people ledger table ---------- */
create table if not exists public.finished_ledger (
  id          int primary key default 1,
  value       text not null,            -- JSON: { updated_at, people:[...] }
  updated_at  timestamptz not null default now()
);

/* Keep exactly one row (id = 1). */
insert into public.finished_ledger (id, value)
  values (1, '{"updated_at":null,"people":[]}')
  on conflict (id) do nothing;

/* Never let anyone widen the single-row contract. */
alter table public.finished_ledger
  drop constraint if exists finished_ledger_id_is_1;
alter table public.finished_ledger
  add constraint finished_ledger_id_is_1 check (id = 1);

/* Auto-refresh updated_at on every write. */
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

/* ---------- 2. Row Level Security (anon read + upsert) ---------- */
alter table public.finished_ledger enable row level security;

drop policy if exists "ledger_read" on public.finished_ledger;
create policy "ledger_read" on public.finished_ledger
  for select to anon, authenticated using (true);

/* The app writes with plain INSERTs / PATCHes (PostgREST), so allow both
   insert and update for anon. */
drop policy if exists "ledger_insert" on public.finished_ledger;
create policy "ledger_insert" on public.finished_ledger
  for insert to anon, authenticated with check (true);

drop policy if exists "ledger_update" on public.finished_ledger;
create policy "ledger_update" on public.finished_ledger
  for update to anon, authenticated using (true) with check (true);

/* ---------- 3. Public Storage bucket (second cloud copy) ---------- */
insert into storage.buckets (id, name, public)
  values ('site-ledger', 'site-ledger', true)
  on conflict (id) do nothing;

drop policy if exists "ledger_public_read" on storage.objects;
create policy "ledger_public_read" on storage.objects
  for select to public using (bucket_id = 'site-ledger');

drop policy if exists "ledger_anon_write" on storage.objects;
create policy "ledger_anon_write" on storage.objects
  for insert to anon with check (bucket_id = 'site-ledger');

drop policy if exists "ledger_anon_update" on storage.objects;
create policy "ledger_anon_update" on storage.objects
  for update to anon
  using (bucket_id = 'site-ledger')
  with check (bucket_id = 'site-ledger');

/* ---------- 4. Self-healing RPC (called by the app automatically) ----------
   Lets the browser re-create the table + policies if they were ever
   removed, so the Finished tab keeps working across ALL domains/devices
   without touching the dashboard again. SECURITY DEFINER runs as the
   table owner; it only ever touches finished_ledger / site-ledger. */
create or replace function public.ensure_finished_ledger_table()
returns void language plpgsql security definer set search_path = public as $$
begin
  create table if not exists public.finished_ledger (
    id         int primary key default 1,
    value      text not null,
    updated_at timestamptz not null default now()
  );

  alter table public.finished_ledger enable row level security;

  if not exists (select 1 from pg_policies where tablename='finished_ledger'
                 and policyname='ledger_read') then
    execute $sql$ create policy "ledger_read" on public.finished_ledger
                  for select to anon, authenticated using (true) $sql$;
  end if;
  if not exists (select 1 from pg_policies where tablename='finished_ledger'
                 and policyname='ledger_insert') then
    execute $sql$ create policy "ledger_insert" on public.finished_ledger
                  for insert to anon, authenticated with check (true) $sql$;
  end if;
  if not exists (select 1 from pg_policies where tablename='finished_ledger'
                 and policyname='ledger_update') then
    execute $sql$ create policy "ledger_update" on public.finished_ledger
                  for update to anon, authenticated using (true) with check (true) $sql$;
  end if;

  /* the storage bucket half of the self-heal */
  insert into storage.buckets (id, name, public)
    values ('site-ledger','site-ledger',true) on conflict (id) do nothing;
end $$;

grant execute on function public.ensure_finished_ledger_table() to anon, authenticated;
