# Supabase Setup — Photobook Designer

The signup flow uses Supabase as the user database. Setup takes ~5 minutes.

---

## 1. Create a Supabase project

1. Go to https://supabase.com and sign up (free tier is fine).
2. Click **New project** — pick any name, region, and a strong password.
3. Wait ~1 minute for provisioning to finish.

---

## 2. Run the schema + RPC functions

Open **SQL Editor** in the Supabase dashboard → **New query** → paste the
following and click **Run**.

```sql
-- ── Users table ─────────────────────────────────────────────────────
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  phone text,
  created_at timestamptz default now(),
  last_used_at timestamptz default now(),
  app_use_count integer default 0,
  photobook_count integer default 0
);

-- ── Lock down direct access ─────────────────────────────────────────
alter table public.users enable row level security;
-- (No policies = anon cannot SELECT/INSERT/UPDATE/DELETE directly)

-- ── Signup RPC ──────────────────────────────────────────────────────
-- Upserts by email. Returns the user row.
create or replace function public.signup_user(p_email text, p_phone text)
returns table (id uuid, email text, phone text)
language plpgsql
security definer
set search_path = public
as $$

begin
  return query
  insert into public.users (email, phone)
  values (lower(trim(p_email)), nullif(trim(p_phone), ''))
  on conflict (email) do update
    set phone = coalesce(excluded.phone, public.users.phone),
        last_used_at = now()
  returning public.users.id, public.users.email, public.users.phone;
end;
$$;

grant execute on function public.signup_user(text, text) to anon, authenticated;

-- ── Tracking RPC ────────────────────────────────────────────────────
-- Increments the correct counter for an event type.
create or replace function public.track_event(p_user_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event = 'app_use' then
    update public.users
      set app_use_count = app_use_count + 1,
          last_used_at = now()
      where id = p_user_id;
  elsif p_event = 'photobook_export' then
    update public.users
      set photobook_count = photobook_count + 1,
          last_used_at = now()
      where id = p_user_id;
  end if;
end;
$$;

grant execute on function public.track_event(uuid, text) to anon, authenticated;
```

You should see "Success. No rows returned." in the result panel.

---

## 3. Copy your project keys

In the Supabase dashboard, open **Project Settings → API**. Copy:

- **Project URL** — looks like `https://xxxxxxxxxxxxxxxx.supabase.co`
- **anon public key** — a long JWT starting with `eyJ…`

Do **not** use the `service_role` key — that bypasses RLS and must never be
exposed to a frontend.

---

## 4. Add the keys to your build

Create a `.env.local` file at the project root (next to `package.json`):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ…your-anon-key-here…
```

Then rebuild:

```bash
npm run build
```

Upload the contents of `dist/` to your cPanel public_html folder (or wherever
your hosting serves from).

> The `VITE_` prefix is required — only env vars with that prefix are exposed
> to the frontend bundle.

### If deploying on Vercel instead

Run:

```bash
npx vercel env add VITE_SUPABASE_URL
npx vercel env add VITE_SUPABASE_ANON_KEY
npx vercel --prod
```

---

## 5. Verify

1. Open the app, click **Save** or any **Export** button.
2. The signup modal should appear (no longer showing the yellow "not connected" warning).
3. Submit an email + phone.
4. In Supabase **Table Editor → users**, your row should appear with
   `app_use_count = 1` and `photobook_count = 1`.

---

## How to view the data

Supabase dashboard → **Table Editor → users** shows all signups, sortable by
columns. For SQL queries (totals, time ranges, exports per user), use the SQL
Editor:

```sql
-- Top 20 most active users
select email, app_use_count, photobook_count, last_used_at
from public.users
order by photobook_count desc, app_use_count desc
limit 20;

-- Signups per day
select date(created_at) as day, count(*) as signups
from public.users
group by day
order by day desc;
```

---

## Security notes

- The frontend only ever uses the **anon** key. That key can only call the two
  RPC functions you just created — it cannot read or modify the `users` table
  directly because RLS denies it.
- `signup_user` is upsert-by-email — if a user signs up twice with the same
  email, the second submission just updates their phone.
- Phone numbers are stored as freeform text. If you want server-side
  validation, add a `CHECK (phone ~ '^\+?[0-9 ()-]{7,20}$')` constraint to the
  table.
- To export the user list:
  ```bash
  # In SQL Editor: click "Export to CSV" after running:
  select * from public.users order by created_at;
  ```
