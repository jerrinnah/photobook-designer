-- ── Cloud project sync setup ──────────────────────────────────────
-- Storage bucket + RLS policies for cross-device project backup.
-- Each user gets their own folder inside the bucket; RLS enforces
-- that they can only read / write files whose path starts with
-- their auth.uid().
--
-- Run this in Supabase SQL Editor after creating the bucket manually:
--   Supabase Dashboard → Storage → New bucket
--     Name: project-backups
--     Public: OFF (private)
--     File size limit: 500 MB (a big wedding book fits comfortably)
--   Then run this script.

-- 1) Confirm the bucket exists (INSERT-if-missing so the script is idempotent).
insert into storage.buckets (id, name, public)
  values ('project-backups', 'project-backups', false)
  on conflict (id) do nothing;

-- Optional: raise the per-file limit to 500 MB so wedding books fit.
update storage.buckets set file_size_limit = 524288000 where id = 'project-backups';

-- 2) RLS policies. Users can only see / modify files in their own folder.
-- Path convention: '{user_id}/{project_id}.autobook'

drop policy if exists "own folder read" on storage.objects;
create policy "own folder read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own folder insert" on storage.objects;
create policy "own folder insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own folder update" on storage.objects;
create policy "own folder update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'project-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own folder delete" on storage.objects;
create policy "own folder delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- That's it. The frontend uses supabase.storage.from('project-backups')
-- via utils/cloudSync.js — no server-side code required.
