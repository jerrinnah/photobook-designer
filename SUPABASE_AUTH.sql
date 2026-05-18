-- ── Magic-link auth bridge ─────────────────────────────────────────
-- Run AFTER SUPABASE_SHARING.sql.
--
-- Supabase Auth gives you auth.users (email + JWT session). This file
-- bridges that to the existing public.users table by:
-- 1. Adding an auth_id column that links to auth.users(id)
-- 2. Adding an ensure_my_user RPC that finds-or-creates the public.users
--    row for whoever is currently signed in (auth.uid() / JWT email),
--    and returns the full profile incl. tier + brand
--
-- Existing users (signed up the old way with email+phone) are matched by
-- email on their first magic-link sign-in — no data loss.

alter table public.users
  add column if not exists auth_id uuid unique references auth.users(id) on delete set null;

create index if not exists users_email_lower_idx on public.users(lower(email));

-- ── ensure_my_user — call right after magic link auth succeeds ─────
-- Reads auth.uid() and the JWT's email claim. Creates a public.users
-- row if one doesn't exist for that email; otherwise links the existing
-- row via auth_id. Returns the full profile.
drop function if exists public.ensure_my_user(text);
create or replace function public.ensure_my_user(p_phone text default null)
returns table (
  id uuid,
  email text,
  phone text,
  tier text,
  brand_name text,
  brand_color text,
  brand_logo_url text,
  brand_site_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_row public.users;
begin
  if v_auth_id is null then
    raise exception 'Not signed in';
  end if;

  -- Pull the email from auth.users (the JWT-validated source of truth)
  select au.email into v_email from auth.users au where au.id = v_auth_id;
  if v_email is null then
    raise exception 'No email on auth session';
  end if;
  v_email := lower(trim(v_email));

  -- First try by auth_id (already linked)
  select * into v_row from public.users where auth_id = v_auth_id;

  -- Otherwise try by email (legacy user signing in for the first time)
  if v_row.id is null then
    select * into v_row from public.users where lower(email) = v_email limit 1;
    if v_row.id is not null then
      update public.users
        set auth_id = v_auth_id,
            phone = coalesce(nullif(trim(p_phone), ''), public.users.phone),
            last_used_at = now()
        where id = v_row.id;
    end if;
  end if;

  -- Otherwise create a brand-new row
  if v_row.id is null then
    insert into public.users (auth_id, email, phone)
    values (v_auth_id, v_email, nullif(trim(p_phone), ''))
    returning * into v_row;
  end if;

  return query
  select v_row.id, v_row.email, v_row.phone, v_row.tier,
         v_row.brand_name, v_row.brand_color, v_row.brand_logo_url, v_row.brand_site_url;
end;
$$;

grant execute on function public.ensure_my_user(text) to anon, authenticated;

-- ── get_my_profile — fetch own profile via auth.uid() ──────────────
-- Equivalent of get_user_profile but using the JWT instead of a uuid param.
-- Frontend calls this on app load to refresh tier + brand without
-- needing to know the public.users.id.
drop function if exists public.get_my_profile();
create or replace function public.get_my_profile()
returns table (
  id uuid,
  email text,
  phone text,
  tier text,
  brand_name text,
  brand_color text,
  brand_logo_url text,
  brand_site_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
begin
  if v_auth_id is null then return; end if;
  return query
  select u.id, u.email, u.phone, u.tier,
         u.brand_name, u.brand_color, u.brand_logo_url, u.brand_site_url
  from public.users u
  where u.auth_id = v_auth_id;
end;
$$;

grant execute on function public.get_my_profile() to anon, authenticated;
