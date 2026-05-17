-- ── Paystack payments ───────────────────────────────────────────────
-- Run this AFTER SUPABASE_TIERS.sql.
-- Creates a payments audit table and the claim_premium RPC that flips
-- a user to premium once they've completed a Paystack popup checkout.
--
-- This file uses TRUST-ON-CLAIM: the user is upgraded as soon as the
-- frontend confirms the popup callback. To verify EVERY payment server-
-- side, also set up a Paystack webhook → Supabase Edge Function (see
-- PAYSTACK_SETUP.md). The webhook can mark the row in `payments` as
-- verified=true and revoke premium if the verification fails.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  reference text unique not null,
  amount numeric not null,
  currency text not null default 'NGN',
  status text not null default 'claimed' check (status in ('claimed', 'verified', 'failed')),
  created_at timestamptz default now(),
  verified_at timestamptz
);

create index if not exists payments_user_idx on public.payments(user_id);
create index if not exists payments_status_idx on public.payments(status);

alter table public.payments enable row level security;
-- No anon policies = direct access denied. RPC functions handle everything.

-- ── claim_premium ──────────────────────────────────────────────────
-- Called by the frontend right after the Paystack popup callback fires.
-- Stores the payment row + flips the user to premium immediately.
create or replace function public.claim_premium(
  p_user_id uuid,
  p_reference text,
  p_amount numeric,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Defensive: reject obviously bad input
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

  -- Upgrade the user (idempotent — re-running keeps them premium)
  update public.users set tier = 'premium' where id = p_user_id;
end;
$$;

grant execute on function public.claim_premium(uuid, text, numeric, text) to anon, authenticated;

-- ── Admin: list payments (password gated) ───────────────────────────
create or replace function public.get_payments_admin(p_password text)
returns table (
  id uuid,
  user_email text,
  reference text,
  amount numeric,
  currency text,
  status text,
  created_at timestamptz,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;
  return query
  select p.id, u.email, p.reference, p.amount, p.currency,
         p.status, p.created_at, p.verified_at
  from public.payments p
  left join public.users u on u.id = p.user_id
  order by p.created_at desc;
end;
$$;

grant execute on function public.get_payments_admin(text) to anon, authenticated;
