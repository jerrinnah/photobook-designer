-- ── Admin-set-password RPC ──────────────────────────────────────────
-- Lets the admin dashboard directly set a user's password (no email
-- confirmation needed). Gated by the same admin password as the
-- other get_*_admin / set_tier_by_email_admin functions.
--
-- Why a SECURITY DEFINER Postgres function instead of an Edge Function?
--   - Frontend can call it via supabase.rpc() with the anon key
--   - The admin password gate is checked server-side
--   - SECURITY DEFINER (owned by `postgres`) can write to auth.users
--   - Uses Postgres-native bcrypt via the pgcrypto extension that
--     Supabase already ships in the `extensions` schema
--
-- Run this in Supabase SQL Editor AFTER replacing
-- 'CHANGE_THIS_PASSWORD' below with your real admin password (the
-- same one you set in SUPABASE_ADMIN_RPC.sql).

create extension if not exists pgcrypto with schema extensions;

drop function if exists public.set_user_password_admin(text, text, text);
create or replace function public.set_user_password_admin(
  p_password text,
  p_email text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_user_id uuid;
begin
  -- 🔑 CHANGE THIS to match the password in SUPABASE_ADMIN_RPC.sql
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;

  if p_new_password is null or length(trim(p_new_password)) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  -- Find the auth user by email (case-insensitive — auth.users.email
  -- is stored lowercased, but we accept either casing from the admin).
  select id into v_user_id
    from auth.users
    where lower(email) = lower(trim(p_email))
    limit 1;

  if v_user_id is null then
    raise exception 'No account found for %', p_email;
  end if;

  -- Write the new bcrypt-hashed password directly + mark email
  -- confirmed so the user can sign in immediately even if they
  -- never clicked the original verification link.
  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_user_id;

  return true;
end;
$$;

grant execute on function public.set_user_password_admin(text, text, text)
  to anon, authenticated;

-- ── Verify it worked ───────────────────────────────────────────────
-- select public.set_user_password_admin(
--   'CHANGE_THIS_PASSWORD',
--   'someone@example.com',
--   'newpassword123'
-- );
