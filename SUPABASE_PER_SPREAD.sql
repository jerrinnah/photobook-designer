-- ── Pay-per-spread / per-book unlocks ──────────────────────────────
-- Run AFTER SUPABASE_PLANS.sql.
--
-- Adds a third monetization path alongside Starter / Pro:
--   ₦750 per spread + ₦1,000 for the cover = pay-as-you-go.
-- One payment unlocks a specific project for unlimited exports. If
-- the photographer later adds more spreads, they top up the unlock
-- with another payment that covers just the delta (idempotent — same
-- project_id is updated, never duplicated).

create extension if not exists pgcrypto with schema extensions;

-- ── 1. project_unlocks: one row per (user, project) ─────────────────
create table if not exists public.project_unlocks (
  user_id uuid not null references public.users(id) on delete cascade,
  project_id text not null,            -- client-generated UUID from autosave
  spread_count integer not null,        -- non-cover spreads paid for
  cover_count integer not null,         -- usually 1
  total_paid numeric not null,          -- cumulative across top-ups (NGN)
  last_reference text,                  -- last Paystack reference
  unlocked_at timestamptz default now(),
  primary key (user_id, project_id)
);

alter table public.project_unlocks enable row level security;

create index if not exists project_unlocks_user_idx
  on public.project_unlocks(user_id);

-- ── 2. unlock_project — claims a Paystack payment ──────────────────
-- Called from the client after the Paystack popup succeeds. Idempotent
-- on (user_id, project_id) — adding spreads later just bumps the row.
drop function if exists public.unlock_project(text, integer, integer, numeric, text, text);
create or replace function public.unlock_project(
  p_project_id text,
  p_spread_count integer,
  p_cover_count integer,
  p_amount numeric,
  p_reference text,
  p_currency text default 'NGN'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
begin
  if v_auth_id is null then raise exception 'Not signed in'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid amount'; end if;
  if p_reference is null or length(p_reference) < 6 then raise exception 'Invalid reference'; end if;
  if p_project_id is null or length(p_project_id) < 4 then raise exception 'Invalid project_id'; end if;

  select id into v_user_id from public.users where auth_id = v_auth_id;
  if v_user_id is null then raise exception 'No matching account — sign out and back in'; end if;

  -- Audit the payment (idempotent on reference)
  insert into public.payments (user_id, reference, amount, currency)
  values (v_user_id, p_reference, p_amount, coalesce(p_currency, 'NGN'))
  on conflict (reference) do nothing;

  -- Insert or top up the unlock
  insert into public.project_unlocks
    (user_id, project_id, spread_count, cover_count, total_paid, last_reference)
  values
    (v_user_id, p_project_id, greatest(0, p_spread_count), greatest(0, p_cover_count), p_amount, p_reference)
  on conflict (user_id, project_id) do update set
    spread_count = greatest(project_unlocks.spread_count, excluded.spread_count),
    cover_count  = greatest(project_unlocks.cover_count,  excluded.cover_count),
    total_paid   = project_unlocks.total_paid + excluded.total_paid,
    last_reference = excluded.last_reference,
    unlocked_at = now();
end;
$$;

grant execute on function public.unlock_project(text, integer, integer, numeric, text, text)
  to anon, authenticated;

-- ── 3. is_project_unlocked — fast yes/no for the export gate ───────
drop function if exists public.is_project_unlocked(text);
create or replace function public.is_project_unlocked(p_project_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_exists integer;
begin
  if v_auth_id is null then return false; end if;
  select id into v_user_id from public.users where auth_id = v_auth_id;
  if v_user_id is null then return false; end if;
  select 1 into v_exists from public.project_unlocks
    where user_id = v_user_id and project_id = p_project_id
    limit 1;
  return v_exists is not null;
end;
$$;

grant execute on function public.is_project_unlocked(text) to anon, authenticated;

-- ── 4. get_my_unlocks — for an admin / debug view ──────────────────
drop function if exists public.get_my_unlocks();
create or replace function public.get_my_unlocks()
returns table (
  project_id text,
  spread_count integer,
  cover_count integer,
  total_paid numeric,
  unlocked_at timestamptz
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
  select pu.project_id, pu.spread_count, pu.cover_count, pu.total_paid, pu.unlocked_at
  from public.project_unlocks pu
  where pu.user_id = v_user_id
  order by pu.unlocked_at desc;
end;
$$;

grant execute on function public.get_my_unlocks() to anon, authenticated;
