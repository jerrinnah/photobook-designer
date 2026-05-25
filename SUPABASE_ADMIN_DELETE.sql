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
  v_user_id uuid;
begin
  -- 🔑 CHANGE THIS to match the password in SUPABASE_ADMIN_RPC.sql
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;

  -- Find the auth user by email (case-insensitive)
  select id into v_user_id
    from auth.users
    where lower(email) = lower(trim(p_email))
    limit 1;

  if v_user_id is null then
    raise exception 'No account found for %', p_email;
  end if;

  -- 1. Wipe app-level row first (public.users). If you have other
  --    user-owned tables without ON DELETE CASCADE, delete from them
  --    here too (e.g. shared_projects, share_spread_feedback, etc).
  delete from public.users where id = v_user_id;

  -- 2. Delete the auth identity. Supabase's auth schema cascades this
  --    to auth.identities, auth.sessions, auth.refresh_tokens, etc.
  delete from auth.users where id = v_user_id;

  return true;
end;
$$;

grant execute on function public.delete_user_admin(text, text)
  to anon, authenticated;

-- ── Verify it worked ───────────────────────────────────────────────
-- select public.delete_user_admin('CHANGE_THIS_PASSWORD', 'someone@example.com');
