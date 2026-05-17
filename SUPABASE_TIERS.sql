-- ── Premium tier system ─────────────────────────────────────────────
-- Run AFTER SUPABASE_SETUP.sql and SUPABASE_ADMIN_RPC.sql.
-- Adds a tier column (free | premium) and updates the signup/admin RPCs
-- to return and modify it.

alter table public.users
  add column if not exists tier text not null default 'free'
  check (tier in ('free', 'premium'));

-- Postgres won't let CREATE OR REPLACE change a function's return type, so
-- drop the old versions first. Safe — they're immediately recreated below.
drop function if exists public.signup_user(text, text);
drop function if exists public.get_users_admin(text);
drop function if exists public.get_stats_admin(text);

-- ── signup_user (updated) ───────────────────────────────────────────
-- Now returns tier too. Replace the previous version.
create or replace function public.signup_user(p_email text, p_phone text)
returns table (id uuid, email text, phone text, tier text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  insert into public.users (email, phone)
  values (lower(trim(p_email)), nullif(trim(p_phone), ''))
  on conflict (email) do update
    set phone = coalesce(excluded.phone, public.users.phone),
        last_used_at = now()
  returning public.users.id, public.users.email, public.users.phone, public.users.tier;
end;
$$;

grant execute on function public.signup_user(text, text) to anon, authenticated;

-- ── Refresh tier for a known user (call on app load) ────────────────
create or replace function public.get_user_tier(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
begin
  select tier into v_tier from public.users where id = p_user_id;
  return coalesce(v_tier, 'free');
end;
$$;

grant execute on function public.get_user_tier(uuid) to anon, authenticated;

-- ── Admin: set a user's tier (password gated) ───────────────────────
create or replace function public.set_user_tier_admin(
  p_password text,
  p_user_id uuid,
  p_tier text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;
  if p_tier not in ('free', 'premium') then
    raise exception 'Invalid tier';
  end if;
  update public.users set tier = p_tier where id = p_user_id;
end;
$$;

grant execute on function public.set_user_tier_admin(text, uuid, text) to anon, authenticated;

-- ── Update admin RPCs to include tier ──────────────────────────────
create or replace function public.get_users_admin(p_password text)
returns table (
  id uuid,
  email text,
  phone text,
  tier text,
  created_at timestamptz,
  last_used_at timestamptz,
  app_use_count integer,
  photobook_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;
  return query
  select u.id, u.email, u.phone, u.tier, u.created_at, u.last_used_at,
         u.app_use_count, u.photobook_count
  from public.users u
  order by u.created_at desc;
end;
$$;

grant execute on function public.get_users_admin(text) to anon, authenticated;

create or replace function public.get_stats_admin(p_password text)
returns table (
  total_users integer,
  total_premium integer,
  total_app_uses bigint,
  total_photobooks bigint,
  signups_last_7d integer,
  signups_last_30d integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;
  return query
  select
    (select count(*)::int from public.users) as total_users,
    (select count(*)::int from public.users where tier = 'premium') as total_premium,
    (select coalesce(sum(app_use_count), 0) from public.users) as total_app_uses,
    (select coalesce(sum(photobook_count), 0) from public.users) as total_photobooks,
    (select count(*)::int from public.users where created_at >= now() - interval '7 days') as signups_last_7d,
    (select count(*)::int from public.users where created_at >= now() - interval '30 days') as signups_last_30d;
end;
$$;

grant execute on function public.get_stats_admin(text) to anon, authenticated;
