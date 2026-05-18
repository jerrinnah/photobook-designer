# Email Magic-Link Auth Setup

Supabase Auth is enabled by default — no config needed for the most
common case. These steps just confirm settings and point auth at your
live domain.

---

## 1. Configure email auth in the Supabase dashboard

1. Open https://supabase.com → your project
2. Go to **Authentication → Providers**
3. **Email** should be `Enabled` (it is by default)
4. Confirm the following sub-settings:
   - **Enable Confirmations** = ON
   - **Confirm Email Change** = ON (recommended)
   - **Secure Email Change** = ON (recommended)
   - **Mailer auto-confirm signups** = OFF
     (we want users to click the magic link, not just type an email)

---

## 2. Add your site's URL to allowed redirects

1. **Authentication → URL Configuration**
2. **Site URL** = `https://autobookbynej.online`
3. **Redirect URLs** — add both:
   ```
   https://autobookbynej.online/**
   http://localhost:5173/**
   ```
   The `/**` lets the magic-link land back on any page on your site.

---

## 3. (Optional) Customize the email template

1. **Authentication → Email Templates → Magic Link**
2. Change the From name, subject, and message body to match your brand.
   Default works fine for testing.

---

## 4. Run the SQL bridge

Open **SQL Editor** → paste contents of [`SUPABASE_AUTH.sql`](SUPABASE_AUTH.sql) → **Run**.

This:
- Adds `auth_id` column to your existing `public.users` table
- Adds `ensure_my_user(phone)` RPC: called right after a magic-link sign-in.
  Finds the existing user row by email (so existing users keep their tier,
  brand, payments) and links the auth session to it.
- Adds `get_my_profile()` RPC: called on every app load to refresh the
  signed-in user's tier and brand using the JWT.

---

## 5. Done

That's it on the Supabase side. The frontend code already knows how to:

- Send a magic-link email when the user enters their email in the AuthModal
- Detect the auth session on app load
- Call `ensure_my_user` automatically and cache the result
- Show a profile menu with email + Sign out in the toolbar

---

## How returning users are detected

| User | What happens at sign-in |
|---|---|
| Brand-new user | Magic link → click → auth.users row created → `ensure_my_user` creates matching public.users row with tier='free' |
| Existing user (signed up the old way with email+phone) | Magic link → click → `ensure_my_user` finds public.users row by **email** → links it to auth.users via `auth_id`. Tier, brand, payments all carry over. |
| User on a new device | Same magic-link flow. Auth session is per-device but their profile is per-email — so tier and branding follow them. |

---

## Sign-out flow

The toolbar profile button → Sign out calls `supabase.auth.signOut()`. The
local `photobook-user-v1` cache is cleared, the React state refreshes,
and the user is back to the anonymous editor. Their work in the active
project is unaffected (it lives in IndexedDB, not tied to auth).
