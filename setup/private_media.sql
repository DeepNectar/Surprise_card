-- ============================================================
-- private_media.sql — 🔒 HD1.8 PRIVATE SLIDESHOW MEDIA COLUMNS
-- Run ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to re-run any number of times (idempotent).
--
-- Adds the two columns the "Our Private Memory" slideshow needs
-- on the media table:
--   is_private : 1 = row plays ONLY inside the OTP-locked show
--                0 = normal public "Our Memories" row
--   otp_code   : last requester-minted OTP(s) stamped onto the
--                row for the edit-panel status line (audit only,
--                verification always uses people.otp_list hashes)
-- ============================================================

alter table public.media add column if not exists is_private integer default 0;
alter table public.media add column if not exists otp_code   text default '';

/* make sure anon/authenticated can still write the table through
   the app's PostgREST role (same grants as FULL_GO_LIVE.sql §9) */
grant select, insert, update, delete on public.media to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

/* kill any stale PostgREST schema cache immediately */
notify pgrst, 'reload schema';

-- Verify (optional): should print both columns
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'media' and column_name in ('is_private','otp_code');
