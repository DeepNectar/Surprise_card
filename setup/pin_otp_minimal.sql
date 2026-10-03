-- Minimal fix for "ALTER TABLE cards ..." failures.
-- There is NO `cards` table — the app stores PIN/OTP on `people`.
-- Idempotent: safe to run repeatedly.

do $$
begin
  if to_regclass('public.people') is null then
    raise exception 'public.people not found — check you are running this in the RIGHT Supabase project (the one your app URL points to).';
  end if;

  alter table public.people add column if not exists pin_hash  text;
  alter table public.people add column if not exists pin_salt  text;
  alter table public.people add column if not exists pin_plain text;
  alter table public.people add column if not exists otp_list  text;
end $$;

-- RLS: let the offline queue's PATCH flush with the anon key
alter table public.people enable row level security;
drop policy if exists "people_anon_read"   on public.people;
create policy "people_anon_read"   on public.people for select to anon, authenticated using (true);
drop policy if exists "people_anon_update" on public.people;
create policy "people_anon_update" on public.people for update to anon, authenticated using (true) with check (true);
