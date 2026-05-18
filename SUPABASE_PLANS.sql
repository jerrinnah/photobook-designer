-- ── Two-plan subscription model ─────────────────────────────────────
-- Run AFTER SUPABASE_TRIAL.sql.
--
-- Replaces the single 'premium' tier with two paid tiers:
--   starter — capped at 10 photobook exports (~₦5,000)
--   pro     — unlimited exports + access to new templates / covers (~₦30,000)
--
-- Existing 'premium' users are migrated to 'pro' since they paid full price.

-- 1. Drop the old constraint first — it only allows 'free' | 'premium',
--    so we can't write 'pro' until it's gone.
alter table public.users drop constraint if exists users_tier_check;

-- 2. Migrate existing 'premium' rows to 'pro' (they paid full price)
update public.users set tier = 'pro' where tier = 'premium';

-- 3. Add the new constraint allowing free | starter | pro
alter table public.users add constraint users_tier_check
  check (tier in ('free', 'starter', 'pro'));

-- ── Paid-or-trial check ─────────────────────────────────────────────
-- Trial = first 5 exports AND first 30 days. Any paid plan qualifies.
-- (Starter quota is enforced elsewhere — having tier='starter' alone
-- doesn't mean unlimited.)
drop function if exists public.is_premium_or_trial(uuid);
create or replace function public.is_premium_or_trial(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_tier text; v_count integer; v_created timestamptz;
begin
  select tier, photobook_count, created_at
    into v_tier, v_count, v_created
    from public.users where id = p_user_id;
  if v_tier is null then return false; end if;
  if v_tier in ('starter', 'pro') then return true; end if;
  return coalesce(v_count, 0) < 5 and coalesce(v_created, now()) > now() - interval '30 days';
end;
$$;
grant execute on function public.is_premium_or_trial(uuid) to anon, authenticated;

-- ── Pro-or-trial check — for "new templates and covers" gating ─────
drop function if exists public.is_pro_or_trial(uuid);
create or replace function public.is_pro_or_trial(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_tier text; v_count integer; v_created timestamptz;
begin
  select tier, photobook_count, created_at
    into v_tier, v_count, v_created
    from public.users where id = p_user_id;
  if v_tier is null then return false; end if;
  if v_tier = 'pro' then return true; end if;
  return coalesce(v_count, 0) < 5 and coalesce(v_created, now()) > now() - interval '30 days';
end;
$$;
grant execute on function public.is_pro_or_trial(uuid) to anon, authenticated;

-- ── claim_plan — upgrades user after Paystack popup callback ───────
-- Replaces claim_premium. Accepts the plan slug from the popup so we
-- know whether to set tier='starter' or 'pro'.
drop function if exists public.claim_plan(uuid, text, text, numeric, text);
create or replace function public.claim_plan(
  p_user_id uuid,
  p_plan text,
  p_reference text,
  p_amount numeric,
  p_currency text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_plan not in ('starter', 'pro') then
    raise exception 'Invalid plan';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid amount';
  end if;
  if length(coalesce(p_reference, '')) < 6 then
    raise exception 'Invalid reference';
  end if;

  -- Record the payment (idempotent on reference)
  insert into public.payments (user_id, reference, amount, currency)
  values (p_user_id, p_reference, p_amount, coalesce(p_currency, 'NGN'))
  on conflict (reference) do nothing;

  -- Upgrade the user. Reset photobook_count for fresh starter quota.
  -- (Don't reset for pro since it's unlimited anyway.)
  if p_plan = 'starter' then
    update public.users
      set tier = 'starter', photobook_count = 0
      where id = p_user_id;
  else
    update public.users
      set tier = 'pro'
      where id = p_user_id;
  end if;
end;
$$;
grant execute on function public.claim_plan(uuid, text, text, numeric, text) to anon, authenticated;

-- Keep the old claim_premium for backwards compat — funnel to claim_plan('pro')
drop function if exists public.claim_premium(uuid, text, numeric, text);
create or replace function public.claim_premium(
  p_user_id uuid, p_reference text, p_amount numeric, p_currency text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.claim_plan(p_user_id, 'pro', p_reference, p_amount, p_currency);
end;
$$;
grant execute on function public.claim_premium(uuid, text, numeric, text) to anon, authenticated;

-- ── Admin tier setter — extend to allow starter / pro ──────────────
drop function if exists public.set_user_tier_admin(text, uuid, text);
create or replace function public.set_user_tier_admin(
  p_password text, p_user_id uuid, p_tier text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;
  if p_tier not in ('free', 'starter', 'pro') then
    raise exception 'Invalid tier — must be free, starter, or pro';
  end if;
  update public.users set tier = p_tier where id = p_user_id;
end;
$$;
grant execute on function public.set_user_tier_admin(text, uuid, text) to anon, authenticated;
