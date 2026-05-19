-- ── Per-spread client feedback ───────────────────────────────────────
-- Run AFTER SUPABASE_SHARE_STORAGE.sql.
--
-- Adds the ability for a client (anonymous, with just the share token)
-- to leave a comment on any individual spread of a shared photobook,
-- rather than only being able to approve or reject the whole book.
--
-- The photographer reads these comments from the ShareModal "My shares"
-- list — each share shows the comment count, and expanding a share
-- shows every comment grouped by spread number.

create extension if not exists pgcrypto with schema extensions;

-- ── 1. Feedback rows ────────────────────────────────────────────────
create table if not exists public.share_spread_feedback (
  id uuid default extensions.gen_random_uuid() primary key,
  token text not null references public.shared_projects(token) on delete cascade,
  spread_idx integer not null,                -- 0-based index into snapshot.spreads
  comment text not null,
  created_at timestamptz default now()
);

create index if not exists share_spread_feedback_token_spread_idx
  on public.share_spread_feedback(token, spread_idx);

alter table public.share_spread_feedback enable row level security;
-- Direct access blocked. RPCs (gated by share token) handle reads/writes.

-- ── 2. add_spread_feedback — client posts a comment ─────────────────
drop function if exists public.add_spread_feedback(text, integer, text);
create or replace function public.add_spread_feedback(
  p_token text,
  p_spread_idx integer,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text := trim(coalesce(p_comment, ''));
begin
  if length(v_clean) = 0 then raise exception 'Comment cannot be empty'; end if;
  if length(v_clean) > 1000 then raise exception 'Comment is too long (max 1000 characters)'; end if;
  if p_spread_idx is null or p_spread_idx < 0 then raise exception 'Invalid spread index'; end if;

  -- Verify the share exists and isn't expired before accepting feedback.
  perform 1 from public.shared_projects
    where token = p_token
      and (expires_at is null or expires_at > now());
  if not found then raise exception 'Share not found or link has expired'; end if;

  insert into public.share_spread_feedback (token, spread_idx, comment)
  values (p_token, p_spread_idx, v_clean);

  -- Bump the share status so the photographer sees there's something
  -- new to look at. Don't downgrade an already-approved share —
  -- approval after feedback is still useful state.
  update public.shared_projects
    set status = 'changes_requested'
    where token = p_token
      and status = 'pending';
end;
$$;

grant execute on function public.add_spread_feedback(text, integer, text)
  to anon, authenticated;

-- ── 3. get_spread_feedback — anyone with the token can read ─────────
drop function if exists public.get_spread_feedback(text);
create or replace function public.get_spread_feedback(p_token text)
returns table (
  spread_idx integer,
  comment text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select sf.spread_idx, sf.comment, sf.created_at
  from public.share_spread_feedback sf
  where sf.token = p_token
  order by sf.spread_idx asc, sf.created_at asc;
end;
$$;

grant execute on function public.get_spread_feedback(text) to anon, authenticated;

-- ── 4. get_my_shares — augment to include comment_count ─────────────
-- Photographer's shares list now shows how many comments need review.
drop function if exists public.get_my_shares();
create or replace function public.get_my_shares()
returns table (
  token text,
  project_name text,
  status text,
  view_count integer,
  comment_count integer,
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
  select sp.token, sp.project_name, sp.status, sp.view_count,
    (select count(*)::integer from public.share_spread_feedback sf where sf.token = sp.token) as comment_count,
    sp.created_at
  from public.shared_projects sp
  where sp.user_id = v_user_id
  order by sp.created_at desc;
end;
$$;

grant execute on function public.get_my_shares() to anon, authenticated;
