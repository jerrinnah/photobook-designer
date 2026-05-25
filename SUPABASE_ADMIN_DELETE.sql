-- ── Admin-delete-user RPC ──────────────────────────────────────────
-- Hard-deletes a user from BOTH public.users and auth.users.
-- Gated by the same admin password as the other admin RPCs.
--
-- This is destructive — there's no soft-delete or undo. Use the
-- admin dashboard's confirm prompt before calling.
--
-- Run this in Supabase SQL Editor AFTER replacing
-- 'CHANGE_THIS_PASSWORD' below with your real admin password (same
-- one used by SUPABASE_ADMIN_RPC.sql).

drop function if exists public.delete_user_admin(text, text);
create or replace function public.delete_user_admin(
  p_password text,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_id uuid;
begin
  -- 🔑 CHANGE THIS to match the password in SUPABASE_ADMIN_RPC.sql
  if p_password <> 'Nej2026' then
    raise exception 'Unauthorized';
  end if;

  -- Find the auth user by email (case-insensitive). NOTE:
  -- public.users.id is NOT the same as auth.users.id — they're
  -- linked via public.users.auth_id, so we match the public row
  -- on email instead of trying to reuse auth.users.id.
  select id into v_auth_id
    from auth.users
    where lower(email) = lower(trim(p_email))
    limit 1;

  -- 1. Wipe the app-level row by email (covers both linked and
  --    orphaned rows where auth_id is null because the auth user
  --    was deleted previously).
  delete from public.users
   where lower(email) = lower(trim(p_email));

  -- 2. Delete the auth identity if it exists. Supabase's auth
  --    schema cascades this to auth.identities, auth.sessions,
  --    auth.refresh_tokens, etc.
  if v_auth_id is not null then
    delete from auth.users where id = v_auth_id;
  end if;

  -- Returns true even when there was no auth row — useful for
  -- cleaning up orphaned public.users rows from earlier buggy
  -- deletes. The row in the dashboard disappears either way.
  return true;
end;
$$;

grant execute on function public.delete_user_admin(text, text)
  to anon, authenticated;

-- ── Verify it worked ───────────────────────────────────────────────
-- select public.delete_user_admin('CHANGE_THIS_PASSWORD', 'someone@example.com');

-- ── One-off cleanup for orphaned rows from the earlier buggy version ─
-- Run this once to wipe any public.users rows whose auth_id is null
-- (auth user was already deleted, but the public row got left behind).
--
--   delete from public.users where auth_id is null;
