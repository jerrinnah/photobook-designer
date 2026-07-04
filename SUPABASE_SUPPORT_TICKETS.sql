-- ── Support tickets ──────────────────────────────────────────────
-- User-submitted support questions go straight into the admin
-- dashboard instead of only opening the user's mail client. Anonymous
-- (signed-out) submissions are allowed too so someone whose account
-- is broken can still reach us.
--
-- Run this in Supabase SQL Editor. Replace CHANGE_THIS_PASSWORD with
-- your admin password (same as the other admin RPC files —'Nej2026').

-- ── 1. Table ──────────────────────────────────────────────────────
create table if not exists public.support_tickets (
  id            bigserial primary key,
  user_id       uuid references public.users(id) on delete set null,
  email         text,                    -- captured from user OR from the form for anon submissions
  subject       text not null,
  body          text not null,
  status        text not null default 'open'
                check (status in ('open', 'in_progress', 'resolved', 'wont_fix')),
  browser       text,                    -- User-Agent
  page_url      text,                    -- window.location.href at submit time
  app_tier      text,                    -- 'free' / 'trial' / 'starter' / 'pro' — quick triage hint
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  admin_note    text                     -- private note the admin adds while triaging
);

create index if not exists support_tickets_status_idx on public.support_tickets(status, created_at desc);
create index if not exists support_tickets_email_idx  on public.support_tickets(email);

alter table public.support_tickets enable row level security;
-- No anon policies — direct access denied. Everything goes through
-- the RPCs below so we control input validation + admin gating.

-- ── 2. submit_support_ticket — anyone can submit ─────────────────
-- Accepts an optional email arg so signed-out users can still reach
-- support. Signed-in users' email is auto-filled from their profile
-- and takes precedence over the arg (protects against spoofing).
drop function if exists public.submit_support_ticket(text, text, text, text, text);
create or replace function public.submit_support_ticket(
  p_subject   text,
  p_body      text,
  p_email     text,
  p_browser   text,
  p_page_url  text
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_email   text := trim(coalesce(p_email, ''));
  v_tier    text;
  v_subject text := trim(coalesce(p_subject, ''));
  v_body    text := trim(coalesce(p_body, ''));
  v_id      bigint;
begin
  if length(v_subject) = 0 then raise exception 'Subject is required'; end if;
  if length(v_subject) > 200 then raise exception 'Subject is too long (max 200 characters)'; end if;
  if length(v_body) = 0 then raise exception 'Message is required'; end if;
  if length(v_body) > 5000 then raise exception 'Message is too long (max 5000 characters)'; end if;

  -- If the caller is signed in, resolve their real profile email + tier
  -- and let that override whatever the client sent.
  if v_auth_id is not null then
    select id, email, tier into v_user_id, v_email, v_tier
      from public.users
     where auth_id = v_auth_id
     limit 1;
  end if;

  -- Anonymous with no email = we accept but flag it
  if v_email is null or length(v_email) = 0 then
    v_email := null;
  end if;

  insert into public.support_tickets
    (user_id, email, subject, body, browser, page_url, app_tier)
    values
    (v_user_id, v_email, v_subject, v_body,
     nullif(trim(coalesce(p_browser, '')), ''),
     nullif(trim(coalesce(p_page_url, '')), ''),
     v_tier)
    returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.submit_support_ticket(text, text, text, text, text) to anon, authenticated;

-- ── 3. list_support_tickets_admin — password-gated ────────────────
drop function if exists public.list_support_tickets_admin(text, text, int);
create or replace function public.list_support_tickets_admin(
  p_password  text,
  p_status    text default null,          -- null = all
  p_limit     int  default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
begin
  if p_password <> 'Nej2026' then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          t.id,
    'user_id',     t.user_id,
    'email',       t.email,
    'subject',     t.subject,
    'body',        t.body,
    'status',      t.status,
    'browser',     t.browser,
    'page_url',    t.page_url,
    'app_tier',    t.app_tier,
    'admin_note',  t.admin_note,
    'created_at',  t.created_at,
    'updated_at',  t.updated_at
  ) order by t.created_at desc), '[]'::jsonb)
    into v_rows
  from public.support_tickets t
  where p_status is null or t.status = p_status
  limit p_limit;

  return v_rows;
end;
$$;
grant execute on function public.list_support_tickets_admin(text, text, int) to authenticated, anon;

-- ── 4. set_support_ticket_status_admin ────────────────────────────
drop function if exists public.set_support_ticket_status_admin(text, bigint, text, text);
create or replace function public.set_support_ticket_status_admin(
  p_password text,
  p_id       bigint,
  p_status   text,
  p_note     text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_password <> 'Nej2026' then
    raise exception 'Unauthorized';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'wont_fix') then
    raise exception 'Invalid status';
  end if;

  update public.support_tickets
     set status     = p_status,
         admin_note = coalesce(p_note, admin_note),
         updated_at = now()
   where id = p_id;

  return found;
end;
$$;
grant execute on function public.set_support_ticket_status_admin(text, bigint, text, text) to authenticated, anon;

-- ── 5. delete_support_ticket_admin ───────────────────────────────
drop function if exists public.delete_support_ticket_admin(text, bigint);
create or replace function public.delete_support_ticket_admin(
  p_password text,
  p_id       bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_password <> 'Nej2026' then
    raise exception 'Unauthorized';
  end if;
  delete from public.support_tickets where id = p_id;
  return found;
end;
$$;
grant execute on function public.delete_support_ticket_admin(text, bigint) to authenticated, anon;

-- ── 6. Open-ticket count for the admin badge ─────────────────────
drop function if exists public.count_open_support_tickets_admin(text);
create or replace function public.count_open_support_tickets_admin(p_password text)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int;
begin
  if p_password <> 'Nej2026' then
    raise exception 'Unauthorized';
  end if;
  select count(*)::int into v_count
    from public.support_tickets
    where status in ('open', 'in_progress');
  return v_count;
end;
$$;
grant execute on function public.count_open_support_tickets_admin(text) to authenticated, anon;
