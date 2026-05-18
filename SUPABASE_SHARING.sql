-- ── Client proofing / share-for-review ──────────────────────────────
-- Run AFTER SUPABASE_BRANDING.sql.
-- Lets premium users generate an unguessable read-only link clients can
-- open to preview the photobook without signing in or downloading anything.

create table if not exists public.shared_projects (
  token text primary key,                     -- unguessable random string
  user_id uuid references public.users(id) on delete cascade,
  project_name text,
  snapshot jsonb not null,                    -- the project state, downscaled
  brand_name text,                            -- snapshot of designer's brand
  brand_logo_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  created_at timestamptz default now(),
  expires_at timestamptz,
  view_count integer not null default 0
);

create index if not exists shared_projects_user_idx on public.shared_projects(user_id);

alter table public.shared_projects enable row level security;
-- No anon policies = direct access denied. RPCs gate everything.

-- ── create_share — premium-only ─────────────────────────────────────
-- Creates a new share row. Returns the token.
drop function if exists public.create_share(uuid, text, jsonb);
create or replace function public.create_share(
  p_user_id uuid,
  p_project_name text,
  p_snapshot jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_token text;
  v_brand_name text;
  v_brand_logo text;
begin
  select tier, brand_name, brand_logo_url
    into v_tier, v_brand_name, v_brand_logo
    from public.users where id = p_user_id;
  if v_tier is null then raise exception 'Unknown user'; end if;
  if v_tier <> 'premium' then raise exception 'Premium required to share for review'; end if;

  -- Generate an unguessable token: 24 random base64 chars from gen_random_bytes
  v_token := encode(gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');

  insert into public.shared_projects (token, user_id, project_name, snapshot, brand_name, brand_logo_url)
  values (v_token, p_user_id, p_project_name, p_snapshot, v_brand_name, v_brand_logo);

  return v_token;
end;
$$;

grant execute on function public.create_share(uuid, text, jsonb) to anon, authenticated;

-- ── get_shared_project — public viewer endpoint ────────────────────
-- Anyone with the token can call this. Increments view_count.
drop function if exists public.get_shared_project(text);
create or replace function public.get_shared_project(p_token text)
returns table (
  project_name text,
  snapshot jsonb,
  brand_name text,
  brand_logo_url text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shared_projects
    set view_count = view_count + 1
    where token = p_token;
  return query
  select sp.project_name, sp.snapshot, sp.brand_name, sp.brand_logo_url, sp.status, sp.created_at
  from public.shared_projects sp
  where sp.token = p_token
    and (sp.expires_at is null or sp.expires_at > now());
end;
$$;

grant execute on function public.get_shared_project(text) to anon, authenticated;

-- ── set_share_status — client approves or requests changes ─────────
drop function if exists public.set_share_status(text, text);
create or replace function public.set_share_status(p_token text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending', 'approved', 'changes_requested') then
    raise exception 'Invalid status';
  end if;
  update public.shared_projects set status = p_status where token = p_token;
end;
$$;

grant execute on function public.set_share_status(text, text) to anon, authenticated;

-- ── List the user's shares (for the photographer's view) ───────────
drop function if exists public.get_my_shares(uuid);
create or replace function public.get_my_shares(p_user_id uuid)
returns table (
  token text,
  project_name text,
  status text,
  view_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select sp.token, sp.project_name, sp.status, sp.view_count, sp.created_at
  from public.shared_projects sp
  where sp.user_id = p_user_id
  order by sp.created_at desc;
end;
$$;

grant execute on function public.get_my_shares(uuid) to anon, authenticated;

-- ── Delete a share — photographer revokes the link ─────────────────
drop function if exists public.delete_share(uuid, text);
create or replace function public.delete_share(p_user_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.shared_projects
    where token = p_token and user_id = p_user_id;
end;
$$;

grant execute on function public.delete_share(uuid, text) to anon, authenticated;
