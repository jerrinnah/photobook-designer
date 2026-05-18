-- ── Free trial of premium features ──────────────────────────────────
-- Run AFTER SUPABASE_AUTH.sql.
--
-- Adds trial-tracking by returning photobook_count + created_at on every
-- profile fetch. The frontend computes the effective tier:
--   tier='premium'                          → full access (paid)
--   tier='free' AND in trial window         → full access (trial)
--   tier='free' AND trial expired           → locked (~50% of templates)
--
-- The trial window = first 5 photobook exports OR 30 days since signup,
-- whichever ends first.
--
-- No new columns needed — both `photobook_count` and `created_at` already
-- exist on public.users. We just extend the profile-fetching RPCs to
-- return them.

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
  brand_site_url text,
  photobook_count integer,
  created_at timestamptz
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
         u.brand_name, u.brand_color, u.brand_logo_url, u.brand_site_url,
         u.photobook_count, u.created_at
  from public.users u
  where u.auth_id = v_auth_id;
end;
$$;
grant execute on function public.get_my_profile() to anon, authenticated;

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
  brand_site_url text,
  photobook_count integer,
  created_at timestamptz
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
  if v_auth_id is null then raise exception 'Not signed in'; end if;
  select au.email into v_email from auth.users au where au.id = v_auth_id;
  if v_email is null then raise exception 'No email on auth session'; end if;
  v_email := lower(trim(v_email));

  select * into v_row from public.users where auth_id = v_auth_id;

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

  if v_row.id is null then
    insert into public.users (auth_id, email, phone)
    values (v_auth_id, v_email, nullif(trim(p_phone), ''))
    returning * into v_row;
  end if;

  return query
  select v_row.id, v_row.email, v_row.phone, v_row.tier,
         v_row.brand_name, v_row.brand_color, v_row.brand_logo_url, v_row.brand_site_url,
         v_row.photobook_count, v_row.created_at;
end;
$$;
grant execute on function public.ensure_my_user(text) to anon, authenticated;

-- Also extend get_user_profile (legacy id-based) for any non-auth callers
drop function if exists public.get_user_profile(uuid);
create or replace function public.get_user_profile(p_user_id uuid)
returns table (
  id uuid,
  email text,
  phone text,
  tier text,
  brand_name text,
  brand_color text,
  brand_logo_url text,
  brand_site_url text,
  photobook_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.email, u.phone, u.tier,
         u.brand_name, u.brand_color, u.brand_logo_url, u.brand_site_url,
         u.photobook_count, u.created_at
  from public.users u
  where u.id = p_user_id;
end;
$$;
grant execute on function public.get_user_profile(uuid) to anon, authenticated;

-- Same extension for signup_user
drop function if exists public.signup_user(text, text);
create or replace function public.signup_user(p_email text, p_phone text)
returns table (
  id uuid, email text, phone text, tier text,
  brand_name text, brand_color text, brand_logo_url text, brand_site_url text,
  photobook_count integer, created_at timestamptz
)
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
  returning public.users.id, public.users.email, public.users.phone, public.users.tier,
           public.users.brand_name, public.users.brand_color, public.users.brand_logo_url, public.users.brand_site_url,
           public.users.photobook_count, public.users.created_at;
end;
$$;
grant execute on function public.signup_user(text, text) to anon, authenticated;

-- ── Premium-or-trial check used by feature-gated RPCs ──────────────
-- True if tier='premium' OR if the user is still inside the trial window
-- (first 5 photobook exports AND first 30 days since signup).
drop function if exists public.is_premium_or_trial(uuid);
create or replace function public.is_premium_or_trial(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_count integer;
  v_created timestamptz;
begin
  select tier, photobook_count, created_at
    into v_tier, v_count, v_created
    from public.users where id = p_user_id;
  if v_tier is null then return false; end if;
  if v_tier = 'premium' then return true; end if;
  return coalesce(v_count, 0) < 5 and coalesce(v_created, now()) > now() - interval '30 days';
end;
$$;
grant execute on function public.is_premium_or_trial(uuid) to anon, authenticated;

-- ── Update branding + sharing RPCs to honor trial as premium ───────
drop function if exists public.update_brand(uuid, text, text, text, text);
create or replace function public.update_brand(
  p_user_id uuid, p_name text, p_color text, p_logo_url text, p_site_url text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_premium_or_trial(p_user_id) then
    raise exception 'Premium or active trial required';
  end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid color — use #RRGGBB';
  end if;
  if length(coalesce(p_logo_url, '')) > 1024 then
    raise exception 'Logo URL too long';
  end if;
  update public.users
    set brand_name = nullif(trim(p_name), ''),
        brand_color = nullif(trim(p_color), ''),
        brand_logo_url = nullif(trim(p_logo_url), ''),
        brand_site_url = nullif(trim(p_site_url), '')
    where id = p_user_id;
end;
$$;
grant execute on function public.update_brand(uuid, text, text, text, text) to anon, authenticated;

drop function if exists public.create_share(uuid, text, jsonb);
create or replace function public.create_share(
  p_user_id uuid, p_project_name text, p_snapshot jsonb
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_token text;
  v_brand_name text;
  v_brand_logo text;
begin
  if not public.is_premium_or_trial(p_user_id) then
    raise exception 'Premium or active trial required';
  end if;

  select brand_name, brand_logo_url into v_brand_name, v_brand_logo
    from public.users where id = p_user_id;

  v_token := encode(gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');

  insert into public.shared_projects (token, user_id, project_name, snapshot, brand_name, brand_logo_url)
  values (v_token, p_user_id, p_project_name, p_snapshot, v_brand_name, v_brand_logo);

  return v_token;
end;
$$;
grant execute on function public.create_share(uuid, text, jsonb) to anon, authenticated;
