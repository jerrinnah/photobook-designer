-- ── Referral program ───────────────────────────────────────────────
-- Each user gets a unique referral code on signup. They share a link
-- like https://autobookbynej.online/?ref=ABC123. When someone signs up
-- using that link AND becomes a paying customer (Starter or Pro), the
-- referrer earns a 20% discount applied to their NEXT subscription.
--
-- Discounts are stackable up to 100% — 5 successful referrals = a free
-- Pro upgrade. This is generous on purpose: virality > immediate margin.
--
-- Run this in Supabase SQL Editor AFTER replacing CHANGE_THIS_PASSWORD
-- below with your real admin password (same one used by the other admin
-- SQL files).

create extension if not exists pgcrypto with schema extensions;

-- ── 1. Referral codes (one per user) ───────────────────────────────
create table if not exists public.referral_codes (
  user_id uuid primary key references public.users(id) on delete cascade,
  code text unique not null,
  created_at timestamptz not null default now()
);

create index if not exists referral_codes_code_idx on public.referral_codes(code);

alter table public.referral_codes enable row level security;
-- No anon policies — code lookup goes through RPCs only.

-- ── 2. Referrals (one per signup with a ref code) ──────────────────
create table if not exists public.referrals (
  id uuid primary key default extensions.gen_random_uuid(),
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referee_user_id uuid references public.users(id) on delete set null,
  referee_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'converted', 'redeemed')),
  -- 'pending' = signed up via ref link but hasn't paid yet
  -- 'converted' = referee paid for Starter or Pro, discount earned for referrer
  -- 'redeemed' = referrer used the discount on their next payment
  discount_pct int not null default 20,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  redeemed_at timestamptz,
  redeemed_payment_ref text
);

create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id);
create index if not exists referrals_referee_idx on public.referrals(referee_user_id);
create index if not exists referrals_email_idx on public.referrals(lower(referee_email));
create index if not exists referrals_status_idx on public.referrals(status);

alter table public.referrals enable row level security;

-- ── 3. Generate or get the current user's referral code ────────────
-- 6-char base32-style code (no ambiguous chars). Idempotent — calling
-- twice returns the same code.
drop function if exists public.get_or_create_my_referral_code();
create or replace function public.get_or_create_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_code text;
  v_attempts int := 0;
begin
  if v_auth_id is null then
    raise exception 'Not signed in';
  end if;

  select id into v_user_id from public.users where auth_id = v_auth_id limit 1;
  if v_user_id is null then
    raise exception 'No app profile found for this account';
  end if;

  select code into v_code from public.referral_codes where user_id = v_user_id;
  if v_code is not null then
    return v_code;
  end if;

  -- Try a few times in case of collision.
  loop
    v_attempts := v_attempts + 1;
    v_code := upper(substring(
      encode(extensions.gen_random_bytes(6), 'base64'),
      1, 6
    ));
    -- Strip ambiguous chars (0/O/1/I/L) — re-roll if needed
    v_code := translate(v_code, '0O1IL+/=', '');
    if length(v_code) < 6 then continue; end if;
    v_code := substring(v_code, 1, 6);
    begin
      insert into public.referral_codes (user_id, code) values (v_user_id, v_code);
      return v_code;
    exception when unique_violation then
      if v_attempts > 8 then
        raise exception 'Could not generate a unique referral code, please retry';
      end if;
    end;
  end loop;
end;
$$;
grant execute on function public.get_or_create_my_referral_code() to anon, authenticated;

-- ── 4. Attribute a signup to a referrer (called on signup) ─────────
-- Pass the ref code + the new user's email. We resolve the referrer
-- and record a 'pending' referral. Safe to call even if the code is
-- invalid — silently no-ops.
drop function if exists public.attribute_referral(text, text);
create or replace function public.attribute_referral(
  p_code text,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_email text := lower(trim(p_email));
begin
  if p_code is null or trim(p_code) = '' or v_email = '' then
    return false;
  end if;

  select user_id into v_referrer_id
    from public.referral_codes
   where code = upper(trim(p_code))
   limit 1;
  if v_referrer_id is null then return false; end if;

  -- Self-referrals are not allowed
  if exists (
    select 1 from public.users u where lower(u.email) = v_email and u.id = v_referrer_id
  ) then return false; end if;

  -- Already attributed? Skip.
  if exists (select 1 from public.referrals where lower(referee_email) = v_email) then
    return false;
  end if;

  insert into public.referrals (referrer_user_id, referee_email, status)
  values (v_referrer_id, v_email, 'pending');
  return true;
end;
$$;
grant execute on function public.attribute_referral(text, text) to anon, authenticated;

-- ── 5. Mark a referral as converted (called when referee pays) ─────
-- Linked automatically via email match. Returns whether a referral
-- was flipped to 'converted'.
drop function if exists public.convert_referral_for_email(text);
create or replace function public.convert_referral_for_email(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referee_id uuid;
  v_email text := lower(trim(p_email));
begin
  if v_email = '' then return false; end if;

  select id into v_referee_id from public.users where lower(email) = v_email limit 1;

  update public.referrals
     set status = 'converted',
         converted_at = now(),
         referee_user_id = coalesce(referee_user_id, v_referee_id)
   where lower(referee_email) = v_email
     and status = 'pending';

  return found;
end;
$$;
grant execute on function public.convert_referral_for_email(text) to anon, authenticated;

-- ── 6. Get the current user's referral summary ─────────────────────
-- Used by the in-app Refer & Earn modal: invites sent, conversions,
-- discount % currently available (sum of unredeemed conversions,
-- capped at 100).
drop function if exists public.get_my_referral_summary();
create or replace function public.get_my_referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_code text;
  v_invited int;
  v_converted int;
  v_discount_pct int;
  v_recent jsonb;
begin
  if v_auth_id is null then
    raise exception 'Not signed in';
  end if;

  select id into v_user_id from public.users where auth_id = v_auth_id limit 1;
  if v_user_id is null then
    raise exception 'No app profile found for this account';
  end if;

  select code into v_code from public.referral_codes where user_id = v_user_id;

  select count(*)::int into v_invited
    from public.referrals where referrer_user_id = v_user_id;
  select count(*)::int into v_converted
    from public.referrals where referrer_user_id = v_user_id and status = 'converted';

  -- Discount = sum of discount_pct on unredeemed conversions, capped at 100.
  select least(100, coalesce(sum(discount_pct), 0))::int into v_discount_pct
    from public.referrals
   where referrer_user_id = v_user_id and status = 'converted';

  select jsonb_agg(jsonb_build_object(
    'email',         r.referee_email,
    'status',        r.status,
    'created_at',    r.created_at,
    'converted_at',  r.converted_at
  ) order by r.created_at desc) into v_recent
  from (
    select * from public.referrals
     where referrer_user_id = v_user_id
     order by created_at desc limit 10
  ) r;

  return jsonb_build_object(
    'code',          v_code,
    'invited',       v_invited,
    'converted',     v_converted,
    'discount_pct',  v_discount_pct,
    'recent',        coalesce(v_recent, '[]'::jsonb)
  );
end;
$$;
grant execute on function public.get_my_referral_summary() to anon, authenticated;

-- ── 7. Redeem the current user's discount during a payment ─────────
-- Called atomically at Paystack checkout. Marks every unredeemed
-- conversion as 'redeemed' and stamps them with the payment reference.
-- Returns the discount percentage that was applied.
drop function if exists public.redeem_my_referral_discount(text);
create or replace function public.redeem_my_referral_discount(p_payment_ref text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_discount int;
begin
  if v_auth_id is null then
    raise exception 'Not signed in';
  end if;
  select id into v_user_id from public.users where auth_id = v_auth_id limit 1;
  if v_user_id is null then return 0; end if;

  select least(100, coalesce(sum(discount_pct), 0))::int into v_discount
    from public.referrals
   where referrer_user_id = v_user_id and status = 'converted';
  if v_discount = 0 then return 0; end if;

  update public.referrals
     set status = 'redeemed',
         redeemed_at = now(),
         redeemed_payment_ref = p_payment_ref
   where referrer_user_id = v_user_id and status = 'converted';

  return v_discount;
end;
$$;
grant execute on function public.redeem_my_referral_discount(text) to anon, authenticated;

-- ── 8. Admin: top referrers + program stats ────────────────────────
drop function if exists public.get_referrals_admin(text);
create or replace function public.get_referrals_admin(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_converted int;
  v_redeemed int;
  v_discount_given int;
  v_top jsonb;
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;

  select count(*)::int into v_total from public.referrals;
  select count(*)::int into v_converted from public.referrals where status in ('converted', 'redeemed');
  select count(*)::int into v_redeemed from public.referrals where status = 'redeemed';
  select coalesce(sum(discount_pct), 0)::int into v_discount_given
    from public.referrals where status = 'redeemed';

  select jsonb_agg(t order by converted desc, invited desc) into v_top
  from (
    select
      u.email as referrer_email,
      count(r.*)::int as invited,
      count(r.*) filter (where r.status in ('converted', 'redeemed'))::int as converted,
      count(r.*) filter (where r.status = 'redeemed')::int as redeemed
    from public.referrals r
    join public.users u on u.id = r.referrer_user_id
    group by u.email
    order by converted desc, invited desc
    limit 25
  ) t;

  return jsonb_build_object(
    'total_invited',         v_total,
    'total_converted',       v_converted,
    'total_redeemed',        v_redeemed,
    'conversion_pct',        case when v_total > 0
                                  then round(100.0 * v_converted / v_total, 1)
                                  else 0 end,
    'total_discount_given',  v_discount_given,
    'top_referrers',         coalesce(v_top, '[]'::jsonb)
  );
end;
$$;
grant execute on function public.get_referrals_admin(text) to anon, authenticated;
