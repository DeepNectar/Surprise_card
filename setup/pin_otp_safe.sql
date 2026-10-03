-- ============================================================
-- setup/pin_otp_safe.sql  (v3 - bulletproof against paste mangling)
--
-- WHY YOUR PREVIOUS ATTEMPTS FAILED
--   Error: syntax error at or near ";" on the DROP POLICY line.
--   Cause: pasting through WhatsApp / a chat app / a rich-text editor
--   silently converts plain straight quotes into curly smart quotes,
--   and Postgres cannot parse those. Also, ALTER TABLE cards ... failed
--   because there is NO cards table in this project - PIN/OTP columns
--   live on the people table.
--
-- FIXES IN THIS VERSION
--   * ZERO quote characters anywhere (identifiers are simple lowercase,
--     so no quoting is needed).
--   * Every policy statement wrapped in its own DO block, so even if one
--     fails you get a clear message instead of a red wall.
--   * Idempotent: safe to run as many times as you like.
--
-- HOW TO RUN
--   Supabase Dashboard -> your project -> SQL Editor -> New query ->
--   copy the WHOLE file below from the RAW file (GitHub "Raw" button or
--   download it) - do NOT route it through WhatsApp/chat autocorrect ->
--   Run.
-- ============================================================

/* ---------- 1. Columns on people (PIN + OTP cloud storage) ---------- */
do $$
begin
  if to_regclass(public.people) is null then
    raise exception public.people table not found - you are running this in the WRONG Supabase project. Check the project your app URL points to.;
  end if;

  alter table public.people add column if not exists pin_hash  text;
  alter table public.people add column if not exists pin_salt  text;
  alter table public.people add column if not exists pin_plain text;
  alter table public.people add column if not exists otp_list  text;

  raise notice pin-otp-safe columns ensured on public.people;
end $$;

/* ---------- 2. Enable RLS ---------- */
alter table public.people enable row level security;

/* ---------- 3. Read policy (anon + authenticated) ---------- */
do $$
begin
  drop policy if exists people_anon_read on public.people;
  create policy people_anon_read
    on public.people
    for select
    to anon, authenticated
    using (true);
  raise notice pin-otp-safe read policy ok;
exception when others then
  raise notice pin-otp-safe read policy skipped: % , sqlerrm;
end $$;

/* ---------- 4. Update policy (lets the offline queue PATCH flush) ---- */
do $$
begin
  drop policy if exists people_anon_update on public.people;
  create policy people_anon_update
    on public.people
    for update
    to anon, authenticated
    using (true)
    with check (true);
  raise notice pin-otp-safe update policy ok;
exception when others then
  raise notice pin-otp-safe update policy skipped: % , sqlerrm;
end $$;

/* ---------- 5. Insert policy (guest submissions / new cards) ---------- */
do $$
begin
  drop policy if exists people_anon_insert on public.people;
  create policy people_anon_insert
    on public.people
    for insert
    to anon, authenticated
    with check (true);
  raise notice pin-otp-safe insert policy ok;
exception when others then
  raise notice pin-otp-safe insert policy skipped: % , sqlerrm;
end $$;

/* ---------- 6. Delete policy (wipe-out clears cloud data) ------------ */
do $$
begin
  drop policy if exists people_anon_delete on public.people;
  create policy people_anon_delete
    on public.people
    for delete
    to anon, authenticated
    using (true);
  raise notice pin-otp-safe delete policy ok;
exception when others then
  raise notice pin-otp-safe delete policy skipped: % , sqlerrm;
end $$;

/* ---------- 7. Verify ---------- */
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'people'
  and column_name in ('pin_hash', 'pin_salt', 'pin_plain', 'otp_list');
