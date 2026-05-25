-- ── Admin-confirm-email RPC ────────────────────────────────────────
-- One-click fix for "user can't sign in with the correct password"
-- when the cause is email_confirmed_at being null. Run this in
-- Supabase SQL Editor after replacing CHANGE_THIS_PASSWORD with
-- your real admin password.

drop function if exists public.confirm_user_email_admin(text, text);
create or replace function public.confirm_user_email_admin(
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
  if p_password <> 'Nej2026' then
    raise exception 'Unauthorized';
  end if;

  select id into v_user_id
    from auth.users
    where lower(email) = lower(trim(p_email))
    limit 1;

  if v_user_id is null then
    raise exception 'No account found for %', p_email;
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_user_id;

  return true;
end;
$$;

grant execute on function public.confirm_user_email_admin(text, text)
  to anon, authenticated;
