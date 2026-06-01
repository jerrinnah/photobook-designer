-- ── Device-limit / anti-sharing setup ─────────────────────────────
-- Policy:
--   • Each account may be active on at most 2 distinct devices.
--   • The 2nd device is allowed only when it shares its public IP
--     with an existing device on the account (same household / office
--     WiFi). This blocks one user sharing credentials with someone on
--     a different network.
--   • A 3rd+ device on a different IP is BLOCKED. The user sees a
--     clear message and is signed out. Admin can release a device
--     from the admin dashboard to free a slot.
--
-- Run this in Supabase SQL Editor AFTER replacing CHANGE_THIS_PASSWORD
-- with your real admin password (same as the other admin RPC files).

-- ── 1. user_devices table ─────────────────────────────────────────
create table if not exists public.user_devices (
  id            bigserial primary key,
  user_id       uuid not null references public.users(id) on delete cascade,
  device_id     text not null,
  ip            text,
  user_agent    text,
  first_seen_at timestamptz default now(),
  last_seen_at  timestamptz default now(),
  unique (user_id, device_id)
);

create index if not exists user_devices_user_idx on public.user_devices(user_id);
create index if not exists user_devices_seen_idx on public.user_devices(user_id, last_seen_at desc);

alter table public.user_devices enable row level security;
-- No anon policies — direct access denied. Use the RPCs below.

-- ── 2. claim_device RPC ───────────────────────────────────────────
-- Called by the frontend right after sign-in. Returns one of:
--   { status: 'allowed', reason: 'known_device' | 'new_device' | 'same_ip' }
--   { status: 'blocked', reason: 'device_limit', message: '...' }
--   { status: 'unauthenticated' }
drop function if exists public.claim_device(text, text, text);
create or replace function public.claim_device(
  p_device_id  text,
  p_ip         text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id      uuid := auth.uid();
  v_count        int;
  v_ip_match     boolean;
  v_updated      boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  -- 1) Known device: bump last_seen_at + refresh ip/ua, allow.
  update public.user_devices
     set last_seen_at = now(),
         ip           = coalesce(p_ip, ip),
         user_agent   = coalesce(p_user_agent, user_agent)
   where user_id = v_user_id
     and device_id = p_device_id;
  if found then
    return jsonb_build_object('status', 'allowed', 'reason', 'known_device');
  end if;

  -- 2) New device. Count existing devices for this user.
  select count(*) into v_count
    from public.user_devices
   where user_id = v_user_id;

  -- 3) Does the new device's IP match any existing device's IP?
  --    (NULL ips don't match — caller couldn't detect IP, treat as
  --    "no match" to be safe.)
  if p_ip is null then
    v_ip_match := false;
  else
    select exists (
      select 1 from public.user_devices
       where user_id = v_user_id and ip = p_ip
    ) into v_ip_match;
  end if;

  -- 4) Policy:
  --    • < 2 devices on record → allow (1st or 2nd device)
  --    • 2+ devices on record → only allow if same IP as existing
  if v_count < 2 then
    insert into public.user_devices (user_id, device_id, ip, user_agent)
      values (v_user_id, p_device_id, p_ip, p_user_agent);
    return jsonb_build_object('status', 'allowed', 'reason', 'new_device');
  end if;

  if v_ip_match then
    -- Same household/office network — replace the LEAST-recently-seen
    -- device so the slot count stays at 2. This handles cases like
    -- "user got a new phone on home WiFi" without admin support.
    delete from public.user_devices
     where id = (
       select id from public.user_devices
        where user_id = v_user_id
        order by last_seen_at asc
        limit 1
     );
    insert into public.user_devices (user_id, device_id, ip, user_agent)
      values (v_user_id, p_device_id, p_ip, p_user_agent);
    return jsonb_build_object('status', 'allowed', 'reason', 'same_ip');
  end if;

  -- 5) Blocked — too many devices, different IP.
  return jsonb_build_object(
    'status', 'blocked',
    'reason', 'device_limit',
    'existing_devices', v_count,
    'limit', 2,
    'message', 'This account is already active on 2 other devices. To use it on this device, sign out from one of the others (or contact support to free a slot).'
  );
end;
$$;
grant execute on function public.claim_device(text, text, text) to authenticated, anon;

-- ── 3. Admin: list devices for a user ─────────────────────────────
drop function if exists public.list_user_devices_admin(text, text);
create or replace function public.list_user_devices_admin(
  p_password text,
  p_email    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_rows    jsonb;
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;

  select id into v_user_id
    from public.users
   where lower(email) = lower(trim(p_email))
   limit 1;
  if v_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'device_id',     d.device_id,
    'ip',            d.ip,
    'user_agent',    d.user_agent,
    'first_seen_at', d.first_seen_at,
    'last_seen_at',  d.last_seen_at
  ) order by d.last_seen_at desc), '[]'::jsonb)
    into v_rows
    from public.user_devices d
   where d.user_id = v_user_id;

  return v_rows;
end;
$$;
grant execute on function public.list_user_devices_admin(text, text) to authenticated, anon;

-- ── 4. Admin: release a device (free a slot) ──────────────────────
drop function if exists public.release_device_admin(text, text, text);
create or replace function public.release_device_admin(
  p_password  text,
  p_email     text,
  p_device_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  if p_password <> 'CHANGE_THIS_PASSWORD' then
    raise exception 'Unauthorized';
  end if;

  select id into v_user_id
    from public.users
   where lower(email) = lower(trim(p_email))
   limit 1;
  if v_user_id is null then
    return false;
  end if;

  delete from public.user_devices
   where user_id = v_user_id
     and device_id = p_device_id;
  return true;
end;
$$;
grant execute on function public.release_device_admin(text, text, text) to authenticated, anon;
