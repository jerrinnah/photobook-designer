-- ── Tier 5 client experience upgrade ─────────────────────────────
-- Extends the existing per-spread feedback system with:
--   1. cell_idx column so clients can flag a specific photo cell
--      inside a spread instead of just commenting on the whole spread.
--   2. share_spread_status table + RPCs so clients can approve
--      individual spreads. The photographer can then lock finalised
--      spreads and only iterate on the ones the client wants changed.
--
-- Run AFTER SUPABASE_SPREAD_FEEDBACK.sql. Both are additive — old
-- shares keep working unchanged.

-- ── 1. Extend the existing feedback table ──────────────────────────
alter table public.share_spread_feedback
  add column if not exists cell_idx integer;

-- ── 2. add_cell_feedback — new RPC that carries the cell index ────
drop function if exists public.add_cell_feedback(text, integer, integer, text);
create or replace function public.add_cell_feedback(
  p_token text,
  p_spread_idx integer,
  p_cell_idx integer,
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

  perform 1 from public.shared_projects
    where token = p_token
      and (expires_at is null or expires_at > now());
  if not found then raise exception 'Share not found or link has expired'; end if;

  insert into public.share_spread_feedback (token, spread_idx, cell_idx, comment)
  values (p_token, p_spread_idx, p_cell_idx, v_clean);

  update public.shared_projects
    set status = 'changes_requested'
    where token = p_token
      and status = 'pending';
end;
$$;
grant execute on function public.add_cell_feedback(text, integer, integer, text) to anon, authenticated;

-- ── 3. get_spread_feedback (redefined) — includes cell_idx ────────
drop function if exists public.get_spread_feedback(text);
create or replace function public.get_spread_feedback(p_token text)
returns table (
  spread_idx integer,
  cell_idx integer,
  comment text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select sf.spread_idx, sf.cell_idx, sf.comment, sf.created_at
  from public.share_spread_feedback sf
  where sf.token = p_token
  order by sf.spread_idx asc, sf.created_at asc;
end;
$$;
grant execute on function public.get_spread_feedback(text) to anon, authenticated;

-- ── 4. Per-spread approval status ─────────────────────────────────
create table if not exists public.share_spread_status (
  token text not null references public.shared_projects(token) on delete cascade,
  spread_idx integer not null,
  status text not null check (status in ('approved', 'changes_requested', 'pending')),
  updated_at timestamptz default now(),
  primary key (token, spread_idx)
);

create index if not exists share_spread_status_token_idx
  on public.share_spread_status(token);

alter table public.share_spread_status enable row level security;
-- Direct access blocked. RPCs (below) handle reads / writes.

-- ── 5. set_spread_status — client marks one spread approved / needs-changes
drop function if exists public.set_spread_status(text, integer, text);
create or replace function public.set_spread_status(
  p_token text,
  p_spread_idx integer,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('approved', 'changes_requested', 'pending') then
    raise exception 'Status must be approved / changes_requested / pending';
  end if;
  if p_spread_idx is null or p_spread_idx < 0 then
    raise exception 'Invalid spread index';
  end if;
  perform 1 from public.shared_projects
    where token = p_token
      and (expires_at is null or expires_at > now());
  if not found then raise exception 'Share not found or link has expired'; end if;

  insert into public.share_spread_status (token, spread_idx, status)
  values (p_token, p_spread_idx, p_status)
  on conflict (token, spread_idx)
  do update set status = excluded.status, updated_at = now();

  -- If the client marked any spread as changes_requested, bump the
  -- top-level share status so the photographer sees it in their list.
  if p_status = 'changes_requested' then
    update public.shared_projects
      set status = 'changes_requested'
      where token = p_token
        and status = 'pending';
  end if;
end;
$$;
grant execute on function public.set_spread_status(text, integer, text) to anon, authenticated;

-- ── 6. get_spread_statuses — anyone with the token can read ───────
drop function if exists public.get_spread_statuses(text);
create or replace function public.get_spread_statuses(p_token text)
returns table (
  spread_idx integer,
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select ss.spread_idx, ss.status, ss.updated_at
  from public.share_spread_status ss
  where ss.token = p_token
  order by ss.spread_idx asc;
end;
$$;
grant execute on function public.get_spread_statuses(text) to anon, authenticated;
