-- ── Admin-dashboard sign-in troubleshooter ────────────────────────
-- Use when the dashboard shows "Stats request timed out" or
-- "Users request timed out". Run each block in Supabase SQL Editor
-- and look at the output.

-- ── 1. Do the admin RPCs even exist? ──────────────────────────────
-- Expect 3 rows: get_stats_admin, get_users_admin, and (if you ran
-- the other admin SQL files) confirm_user_email_admin /
-- delete_user_admin / set_user_password_admin / set_tier_by_email_admin.
select
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like '%_admin'
order by p.proname;

-- ── 2. How big is public.users? (slow scans = slow stats) ─────────
select
  count(*) as total_rows,
  count(*) filter (where auth_id is null) as orphan_rows,
  pg_size_pretty(pg_total_relation_size('public.users')) as table_size
from public.users;

-- ── 3. Time the stats RPC directly ────────────────────────────────
-- Replace 'Nej2026' with your real admin password. If THIS hangs
-- for >5s, the function itself is the bottleneck (not the network
-- or the frontend). Returns a single row of aggregates.
select * from public.get_stats_admin('Nej2026');

-- ── 4. Time the users RPC directly ────────────────────────────────
-- Same — slow here = the function is the issue.
select count(*) as returned_rows from public.get_users_admin('Nej2026');

-- ── 5. (Optional) Wipe the orphan rows that the buggy delete left ─
-- These are public.users rows whose auth_id is null because the
-- auth user got deleted but the public row didn't. They don't hurt
-- anything except they show as ghost rows in the dashboard.
--
--   delete from public.users where auth_id is null;

-- ── 6. Sanity-check Supabase connectivity ─────────────────────────
-- Bare-minimum round trip — if THIS times out, your Supabase project
-- is having problems (check status.supabase.com or your project's
-- Database health in the dashboard).
select now() as server_time, version() as pg_version;
