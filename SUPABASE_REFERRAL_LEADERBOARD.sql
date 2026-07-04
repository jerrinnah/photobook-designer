-- ── Referral leaderboard ──────────────────────────────────────────
-- Returns the top N referrers by converted-referral count. Emails are
-- masked so users only see "j***@g***.com" — enough for social proof
-- ("someone else is doing this too") without exposing private data.
--
-- Run this in Supabase SQL Editor after SUPABASE_REFERRALS.sql.

drop function if exists public.get_referral_leaderboard(int);
create or replace function public.get_referral_leaderboard(p_limit int default 10)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x) order by x.conversions desc), '[]'::jsonb)
    into v_rows
  from (
    select
      -- Mask the email: keep the first letter, star out the rest of the
      -- local part, keep the first letter of the domain.
      regexp_replace(
        u.email,
        '^(.)[^@]*(@)(.).*',
        '\1***\2\3***',
        'g'
      ) as who,
      count(*) filter (where r.converted_at is not null) as conversions,
      -- Anniversary: number of days since the very first referral this
      -- user made — gives a "veteran" feel to older accounts.
      extract(day from (now() - min(r.created_at)))::int as days_active
    from public.referrals r
    join public.users u on u.id = r.referrer_user_id
    group by u.email
    having count(*) filter (where r.converted_at is not null) > 0
    order by conversions desc
    limit p_limit
  ) x;

  return v_rows;
end;
$$;
grant execute on function public.get_referral_leaderboard(int) to authenticated, anon;
