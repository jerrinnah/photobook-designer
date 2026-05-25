-- ── Admin overview + per-user detail RPCs ──────────────────────────
-- Powers the redesigned admin dashboard:
--   • get_overview_admin  — revenue, signup sparkline, tier mix,
--                           week-over-week deltas
--   • get_user_detail_admin — full user record + payment history
--                             for the row-click drawer
--
-- Run this in Supabase SQL Editor AFTER replacing CHANGE_THIS_PASSWORD
-- with your real admin password.

-- ── 1. Overview RPC ────────────────────────────────────────────────
drop function if exists public.get_overview_admin(text);
create or replace function public.get_overview_admin(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue_30d numeric;
  v_revenue_prev_30d numeric;
  v_signups_7d int;
  v_signups_prev_7d int;
  v_total_users int;
  v_paid_users int;
  v_sparkline jsonb;
  v_tier_mix jsonb;
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;

  -- Revenue: sum of verified payments in the last 30 days (NGN only
  -- for simplicity; mixed-currency totals would need conversion).
  -- 'claimed' is the optimistic state; 'verified' confirms via webhook.
  select coalesce(sum(amount), 0) into v_revenue_30d
    from public.payments
   where currency = 'NGN'
     and status in ('claimed', 'verified')
     and created_at >= now() - interval '30 days';

  select coalesce(sum(amount), 0) into v_revenue_prev_30d
    from public.payments
   where currency = 'NGN'
     and status in ('claimed', 'verified')
     and created_at >= now() - interval '60 days'
     and created_at <  now() - interval '30 days';

  -- Signup deltas
  select count(*)::int into v_signups_7d
    from public.users where created_at >= now() - interval '7 days';
  select count(*)::int into v_signups_prev_7d
    from public.users
   where created_at >= now() - interval '14 days'
     and created_at <  now() - interval '7 days';

  -- Conversion
  select count(*)::int into v_total_users from public.users;
  select count(*)::int into v_paid_users
    from public.users where tier in ('starter', 'pro');

  -- 30-day sparkline: array of daily signup counts, oldest → newest
  select jsonb_agg(daily order by d) into v_sparkline
  from (
    select gs.d::date as d,
           (select count(*)
              from public.users u
             where date_trunc('day', u.created_at)::date = gs.d::date)::int as daily
    from generate_series(
      (now() - interval '29 days')::date,
      now()::date,
      interval '1 day'
    ) as gs(d)
  ) s;

  -- Tier mix
  select jsonb_build_object(
    'free',    count(*) filter (where coalesce(tier, 'free') = 'free'),
    'starter', count(*) filter (where tier = 'starter'),
    'pro',     count(*) filter (where tier = 'pro')
  ) into v_tier_mix
  from public.users;

  return jsonb_build_object(
    'revenue_30d_ngn',      v_revenue_30d,
    'revenue_prev_30d_ngn', v_revenue_prev_30d,
    'signups_7d',           v_signups_7d,
    'signups_prev_7d',      v_signups_prev_7d,
    'total_users',          v_total_users,
    'paid_users',           v_paid_users,
    'conversion_pct',       case when v_total_users > 0
                                 then round(100.0 * v_paid_users / v_total_users, 1)
                                 else 0 end,
    'sparkline',            coalesce(v_sparkline, '[]'::jsonb),
    'tier_mix',             v_tier_mix,
    -- 30-day daily revenue series (NGN) for the big chart
    'revenue_series',       (
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', v) order by d), '[]'::jsonb)
      from (
        select gs.d::date as d,
               coalesce((
                 select sum(amount)
                   from public.payments p
                  where p.currency = 'NGN'
                    and p.status in ('claimed', 'verified')
                    and date_trunc('day', p.created_at)::date = gs.d::date
               ), 0)::numeric as v
        from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') as gs(d)
      ) s
    ),
    -- 30-day daily signup series for the second line on the chart
    'signup_series',        coalesce(v_sparkline, '[]'::jsonb),
    -- Recent activity feed for the right column (last 20 events:
    -- payments + signups + tier changes inferred from payment status).
    'activity',             (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind',  kind,
        'email', email,
        'meta',  meta,
        'at',    at
      ) order by at desc), '[]'::jsonb)
      from (
        select 'payment' as kind, u.email,
               jsonb_build_object('amount', p.amount, 'currency', p.currency, 'status', p.status) as meta,
               p.created_at as at
          from public.payments p join public.users u on u.id = p.user_id
         where p.created_at >= now() - interval '30 days'
        union all
        select 'signup' as kind, u.email, '{}'::jsonb as meta, u.created_at as at
          from public.users u
         where u.created_at >= now() - interval '30 days'
        order by at desc limit 20
      ) a
    )
  );
end;
$$;

grant execute on function public.get_overview_admin(text) to anon, authenticated;

-- ── 2. Per-user detail RPC ─────────────────────────────────────────
-- Returns the user row + their payment history (most recent first).
-- Used by the click-row-to-open-drawer flow.
drop function if exists public.get_user_detail_admin(text, text);
create or replace function public.get_user_detail_admin(
  p_password text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user jsonb;
  v_payments jsonb;
  v_auth_meta jsonb;
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;

  select to_jsonb(u.*) into v_user
    from public.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;

  if v_user is null then
    raise exception 'No account found for %', p_email;
  end if;

  select jsonb_agg(jsonb_build_object(
    'reference',   p.reference,
    'amount',      p.amount,
    'currency',    p.currency,
    'status',      p.status,
    'created_at',  p.created_at,
    'verified_at', p.verified_at
  ) order by p.created_at desc) into v_payments
  from public.payments p
  where p.user_id = (v_user->>'id')::uuid;

  -- Auth-side metadata (email confirmed, last sign-in, banned)
  select jsonb_build_object(
    'email_confirmed_at', au.email_confirmed_at,
    'last_sign_in_at',    au.last_sign_in_at,
    'banned_until',       au.banned_until,
    'deleted_at',         au.deleted_at
  ) into v_auth_meta
  from auth.users au
  where lower(au.email) = lower(trim(p_email))
  limit 1;

  return jsonb_build_object(
    'user',     v_user,
    'auth',     coalesce(v_auth_meta, '{}'::jsonb),
    'payments', coalesce(v_payments, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_user_detail_admin(text, text)
  to anon, authenticated;
