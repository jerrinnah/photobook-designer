-- ── Sign-in troubleshooting toolkit ────────────────────────────────
-- Run these in Supabase SQL Editor when a user reports "I can sign in
-- with the right email + password but it's not working". The most
-- common cause is email_confirmed_at being null on a user that signed
-- up before the auto-confirm trigger landed — Supabase silently
-- rejects password sign-in for unconfirmed users.

-- ── 1. INSPECT a single user ───────────────────────────────────────
-- Tells you everything that matters at a glance: confirmed?, has a
-- password hash?, has a default password sitting in metadata?,
-- recent sign-in activity, banned?, deleted?
select
  u.id,
  u.email,
  u.email_confirmed_at,
  u.encrypted_password is not null and length(u.encrypted_password) > 20 as has_password,
  u.raw_user_meta_data ? 'default_password' as has_default_password,
  u.raw_user_meta_data->>'default_password' as default_password,
  u.banned_until,
  u.deleted_at,
  u.last_sign_in_at,
  u.created_at,
  u.updated_at
from auth.users u
where lower(u.email) = lower('fotochefstudios@gmail.com');

-- ── 2. FORCE-CONFIRM a single user (most common fix) ───────────────
-- Use when "has_password = true" + "email_confirmed_at = null".
-- Run, then ask the user to retry sign-in.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where lower(email) = lower('CHANGE_ME@example.com');

-- ── 3. RESET DEFAULT PASSWORD for a single user ────────────────────
-- Use when the user has lost their password AND has no default in
-- metadata. Generates a fresh 12-char default, writes the bcrypt
-- hash, AND auto-confirms the email so the user can sign in
-- immediately. Returns the new plaintext to relay via WhatsApp /
-- email so you don't have to dig through metadata.
do $$
declare
  v_email text := 'CHANGE_ME@example.com';
  v_pw text;
begin
  v_pw := (
    select string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789',
             (floor(random() * 56)::int) + 1, 1), '')
    from generate_series(1, 12)
  );
  update auth.users
  set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                           || jsonb_build_object('default_password', v_pw),
      updated_at = now()
  where lower(email) = lower(v_email);
  raise notice 'New default password for %: %', v_email, v_pw;
end $$;

-- ── 4. BULK BACKFILL — confirm every user that has a password ──────
-- One-shot fix for everyone caught in the "no auto-confirm" window
-- between when password-signup shipped and the auto-confirm trigger
-- landed. Safe to run repeatedly — only touches users that aren't
-- already confirmed AND actually have a password set.
--
-- update auth.users
-- set email_confirmed_at = now(),
--     updated_at = now()
-- where email_confirmed_at is null
--   and encrypted_password is not null
--   and length(encrypted_password) > 20;

-- ── 5. LIST every user that can't sign in via password yet ─────────
-- Quick health-check after install: who is stuck?
select
  email,
  email_confirmed_at,
  banned_until,
  deleted_at,
  created_at,
  case
    when deleted_at is not null then 'deleted'
    when banned_until > now() then 'banned'
    when email_confirmed_at is null then 'unconfirmed — sign-in blocked'
    when encrypted_password is null or length(encrypted_password) < 20 then 'no password set'
    else 'ok'
  end as status
from auth.users
where deleted_at is not null
   or banned_until > now()
   or email_confirmed_at is null
   or encrypted_password is null
order by created_at desc;
