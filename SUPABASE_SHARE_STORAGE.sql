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

-- ── 4. Rewrite create_share — paid/trial tier check + share_key ────
drop function if exists public.create_share(uuid, text, jsonb);
drop function if exists public.create_share(uuid, text, text, jsonb);
create or replace function public.create_share(
  p_user_id uuid,
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
  v_tier text;
  v_count integer;
  v_created timestamptz;
  v_token text;
  v_brand_name text;
  v_brand_logo text;
  v_in_trial boolean;
begin
  select tier, photobook_count, created_at, brand_name, brand_logo_url
    into v_tier, v_count, v_created, v_brand_name, v_brand_logo
    from public.users where id = p_user_id;
  if v_tier is null then raise exception 'Unknown user'; end if;

  v_in_trial := coalesce(v_count, 0) < 5
            and coalesce(v_created, now()) > now() - interval '30 days';

  if v_tier not in ('starter', 'pro') and not v_in_trial then
    raise exception 'Paid plan or active trial required to share for review';
  end if;

  -- Unguessable 24-char URL token (separate from the bucket share_key)
  v_token := encode(gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');

  insert into public.shared_projects
    (token, user_id, project_name, snapshot, brand_name, brand_logo_url, share_key)
  values
    (v_token, p_user_id, p_project_name, p_snapshot, v_brand_name, v_brand_logo, p_share_key);

  return v_token;
end;
$$;

grant execute on function public.create_share(uuid, text, text, jsonb) to anon, authenticated;

-- ── 5. delete_share returns the share_key so client can purge bucket
drop function if exists public.delete_share(uuid, text);
create or replace function public.delete_share(p_user_id uuid, p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share_key text;
begin
  delete from public.shared_projects
    where token = p_token and user_id = p_user_id
    returning share_key into v_share_key;
  return v_share_key;
end;
$$;

grant execute on function public.delete_share(uuid, text) to anon, authenticated;
