-- Admin dashboard RPC. Returns the full users table if the password matches.
-- Run this in Supabase SQL Editor AFTER you change CHANGE_THIS_PASSWORD below
-- to your own strong password.
--
-- The password lives only in this function — frontend sends it as an arg, the
-- function checks server-side. Anon key cannot bypass this.

create or replace function public.get_users_admin(p_password text)
returns table (
  id uuid,
  email text,
  phone text,
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
  -- 🔑 CHANGE THIS to your own strong password before running.
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;

  return query
  select u.id, u.email, u.phone, u.created_at, u.last_used_at,
         u.app_use_count, u.photobook_count
  from public.users u
  order by u.created_at desc;
end;
$$;

grant execute on function public.get_users_admin(text) to anon, authenticated;

-- Aggregate stats (totals) — same password gate
create or replace function public.get_stats_admin(p_password text)
returns table (
  total_users integer,
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
    (select coalesce(sum(app_use_count), 0) from public.users) as total_app_uses,
    (select coalesce(sum(photobook_count), 0) from public.users) as total_photobooks,
    (select count(*)::int from public.users where created_at >= now() - interval '7 days') as signups_last_7d,
    (select count(*)::int from public.users where created_at >= now() - interval '30 days') as signups_last_30d;
end;
$$;

grant execute on function public.get_stats_admin(text) to anon, authenticated;
