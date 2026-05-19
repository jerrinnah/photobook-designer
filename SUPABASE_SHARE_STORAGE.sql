-- ── Storage-backed share previews ────────────────────────────────────
-- Run AFTER SUPABASE_SHARING.sql and SUPABASE_PLANS.sql.
--
-- Replaces the old approach of stuffing base64-encoded photos into the
-- shared_projects.snapshot jsonb (which hit Postgres row-size limits
-- around 50 MB on large projects). Photos now live in a public Storage
-- bucket; the snapshot only contains URLs.
--
-- After running this, sharing works for projects of any size — the DB
-- row stays a few KB regardless of how many photos.

-- Make sure pgcrypto is available — gen_random_bytes lives in this
-- extension. Supabase usually ships it pre-installed in the
-- `extensions` schema but this is idempotent and safe to re-run.
create extension if not exists pgcrypto with schema extensions;

-- ── 1. Public share-previews bucket ────────────────────────────────
-- public=true → anyone with the URL can fetch the image (necessary
-- because the client viewer is unauthenticated). The unguessable
-- share token in the URL is what prevents enumeration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'share-previews', 'share-previews', true,
  10485760,                                    -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Storage policies ─────────────────────────────────────────────
-- Drop existing (so this script is idempotent)
drop policy if exists "share-previews: public read"   on storage.objects;
drop policy if exists "share-previews: auth upload"   on storage.objects;
drop policy if exists "share-previews: auth update"   on storage.objects;
drop policy if exists "share-previews: auth delete"   on storage.objects;

-- Anyone (anon or authed) can read share previews — the unguessable
-- token in the URL is the gate.
create policy "share-previews: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'share-previews');

-- Only signed-in users can upload to the bucket.
create policy "share-previews: auth upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'share-previews');

-- Owner can replace their uploads (rare — used for re-share).
create policy "share-previews: auth update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'share-previews' and owner = auth.uid())
  with check (bucket_id = 'share-previews' and owner = auth.uid());

-- Owner can delete their uploads.
create policy "share-previews: auth delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'share-previews' and owner = auth.uid());

-- ── 3. Add share_key column for bucket-folder tracking ─────────────
-- Each share gets a separate folder inside the bucket. share_key is
-- the folder name; the client generates it (UUID), uploads photos to
-- {share_key}/{photoId}.jpg, then passes share_key to create_share so
-- the row + bucket folder can be cleaned up together.
alter table public.shared_projects
  add column if not exists share_key text;

create index if not exists shared_projects_share_key_idx
  on public.shared_projects(share_key);

-- ── 4. Rewrite create_share — auth.uid() based, no p_user_id needed
-- The JWT identifies the caller, so we look up public.users by auth_id
-- (with a fallback to email match for legacy users). This avoids the
-- "Unknown user" failure that hit any user whose cached profile carried
-- the auth UUID instead of the public.users.id (session-fallback case).
drop function if exists public.create_share(uuid, text, jsonb);
drop function if exists public.create_share(uuid, text, text, jsonb);
drop function if exists public.create_share(text, text, jsonb);
create or replace function public.create_share(
  p_project_name text,
  p_share_key text,
  p_snapshot jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_user_id uuid;
  v_tier text;
  v_count integer;
  v_created timestamptz;
  v_token text;
  v_brand_name text;
  v_brand_logo text;
  v_in_trial boolean;
begin
  if v_auth_id is null then raise exception 'Not signed in'; end if;

  -- 1. Try by auth_id (the normal path once ensure_my_user has linked them)
  select id, tier, photobook_count, created_at, brand_name, brand_logo_url
    into v_user_id, v_tier, v_count, v_created, v_brand_name, v_brand_logo
    from public.users where auth_id = v_auth_id;

  -- 2. Fall back to email match (legacy users who signed up before
  --    auth_id linking, or users whose ensure_my_user call failed)
  if v_user_id is null then
    select au.email into v_email from auth.users au where au.id = v_auth_id;
    select id, tier, photobook_count, created_at, brand_name, brand_logo_url
      into v_user_id, v_tier, v_count, v_created, v_brand_name, v_brand_logo
      from public.users where lower(email) = lower(trim(v_email)) limit 1;
    -- If we found a legacy row by email, attach the auth_id for next time.
    if v_user_id is not null then
      update public.users set auth_id = v_auth_id where id = v_user_id;
    end if;
  end if;

  -- 3. Still nothing — create a fresh row (self-heal, same logic as
  --    ensure_my_user). Avoids the dead-end "No matching account" error
  --    when a brand-new password sign-in or a previously-failed
  --    ensure_my_user call left this user without a public.users row.
  if v_user_id is null then
    if v_email is null then
      select au.email into v_email from auth.users au where au.id = v_auth_id;
    end if;
    insert into public.users (auth_id, email)
    values (v_auth_id, lower(trim(coalesce(v_email, ''))))
    returning id, tier, photobook_count, created_at, brand_name, brand_logo_url
    into v_user_id, v_tier, v_count, v_created, v_brand_name, v_brand_logo;
  end if;

  if v_user_id is null then raise exception 'Could not resolve your account — sign out and back in.'; end if;

  v_in_trial := coalesce(v_count, 0) < 5
            and coalesce(v_created, now()) > now() - interval '30 days';

  if v_tier not in ('starter', 'pro') and not v_in_trial then
    raise exception 'Paid plan or active trial required to share for review';
  end if;

  -- Qualify with the extensions schema — our search_path is `public`
  -- only, and gen_random_bytes lives in extensions on Supabase.
  v_token := encode(extensions.gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');

  insert into public.shared_projects
    (token, user_id, project_name, snapshot, brand_name, brand_logo_url, share_key)
  values
    (v_token, v_user_id, p_project_name, p_snapshot, v_brand_name, v_brand_logo, p_share_key);

  return v_token;
end;
$$;

grant execute on function public.create_share(text, text, jsonb) to anon, authenticated;

-- ── 5. delete_share also moves to auth.uid() lookup
drop function if exists public.delete_share(uuid, text);
drop function if exists public.delete_share(text);
create or replace function public.delete_share(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_share_key text;
begin
  if v_auth_id is null then raise exception 'Not signed in'; end if;
  select id into v_user_id from public.users where auth_id = v_auth_id;
  if v_user_id is null then return null; end if;

  delete from public.shared_projects
    where token = p_token and user_id = v_user_id
    returning share_key into v_share_key;
  return v_share_key;
end;
$$;

grant execute on function public.delete_share(text) to anon, authenticated;

-- ── 6. get_my_shares too (auth.uid() based)
drop function if exists public.get_my_shares(uuid);
drop function if exists public.get_my_shares();
create or replace function public.get_my_shares()
returns table (
  token text,
  project_name text,
  status text,
  view_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
begin
  if v_auth_id is null then return; end if;
  select id into v_user_id from public.users where auth_id = v_auth_id;
  if v_user_id is null then return; end if;
  return query
  select sp.token, sp.project_name, sp.status, sp.view_count, sp.created_at
  from public.shared_projects sp
  where sp.user_id = v_user_id
  order by sp.created_at desc;
end;
$$;

grant execute on function public.get_my_shares() to anon, authenticated;
