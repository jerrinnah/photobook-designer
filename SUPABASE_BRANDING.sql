-- ── White-label branding ────────────────────────────────────────────
-- Run AFTER SUPABASE_TIERS.sql.
-- Lets premium users set their own brand name + color + logo URL.
-- These show up in the toolbar, on export watermarks, and on the PDF
-- spec sheet — turning AutoBook into a reseller-friendly product.

alter table public.users
  add column if not exists brand_name text,
  add column if not exists brand_color text,
  add column if not exists brand_logo_url text,
  add column if not exists brand_site_url text;

-- Length sanity (logos are URLs to images, not embedded bytes)
alter table public.users
  drop constraint if exists brand_logo_url_length;
alter table public.users
  add constraint brand_logo_url_length check (
    brand_logo_url is null or length(brand_logo_url) <= 1024
  );

-- ── update_brand — called by premium users self-serve ──────────────
-- Trust-but-verify: the SQL checks the user EXISTS and IS premium
-- before applying changes. Anon can call it but only with a valid uuid.
drop function if exists public.update_brand(uuid, text, text, text, text);
create or replace function public.update_brand(
  p_user_id uuid,
  p_name text,
  p_color text,
  p_logo_url text,
  p_site_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
begin
  select tier into v_tier from public.users where id = p_user_id;
  if v_tier is null then
    raise exception 'Unknown user';
  end if;
  if v_tier <> 'premium' then
    raise exception 'Premium required';
  end if;

  -- Basic sanity on color (hex) and URL lengths
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

-- ── get_user_profile — full profile incl. brand ────────────────────
-- Replaces get_user_tier with a richer call so the frontend can refresh
-- brand state alongside tier.
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
  brand_site_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.email, u.phone, u.tier,
         u.brand_name, u.brand_color, u.brand_logo_url, u.brand_site_url
  from public.users u
  where u.id = p_user_id;
end;
$$;

grant execute on function public.get_user_profile(uuid) to anon, authenticated;

-- ── Extend signup_user to return brand fields too ──────────────────
drop function if exists public.signup_user(text, text);
create or replace function public.signup_user(p_email text, p_phone text)
returns table (
  id uuid, email text, phone text, tier text,
  brand_name text, brand_color text, brand_logo_url text, brand_site_url text
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
           public.users.brand_name, public.users.brand_color, public.users.brand_logo_url, public.users.brand_site_url;
end;
$$;

grant execute on function public.signup_user(text, text) to anon, authenticated;

-- ── Admin: list users now includes brand columns ───────────────────
drop function if exists public.get_users_admin(text);
create or replace function public.get_users_admin(p_password text)
returns table (
  id uuid,
  email text,
  phone text,
  tier text,
  brand_name text,
  brand_color text,
  brand_logo_url text,
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
  select u.id, u.email, u.phone, u.tier,
         u.brand_name, u.brand_color, u.brand_logo_url,
         u.created_at, u.last_used_at, u.app_use_count, u.photobook_count
  from public.users u
  order by u.created_at desc;
end;
$$;

grant execute on function public.get_users_admin(text) to anon, authenticated;
