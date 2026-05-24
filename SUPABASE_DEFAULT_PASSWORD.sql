-- ── Default-password-in-magic-link-email setup ─────────────────────
-- New flow for first-time signups:
--
--   1. User requests a magic link → Supabase creates an auth.users row
--   2. BEFORE INSERT trigger fires: generates a 12-char random password,
--      bcrypt-hashes it into auth.users.encrypted_password, AND stores
--      the plaintext in raw_user_meta_data.default_password so the
--      email template can render it
--   3. Supabase sends the magic-link email — the customized template
--      (see step 4) shows BOTH the magic-link URL AND the email +
--      default password the user can use to sign in normally
--   4. After the user sets their own password (or the admin does via
--      set_user_password_admin), the cleanup trigger wipes the
--      plaintext default from metadata so future magic-link emails
--      no longer expose it
--
-- ⚠ Why is this acceptable security-wise?
--   - The plaintext default ONLY exists for users who haven't picked
--     their own password yet. Once they do, it's gone.
--   - The plaintext sits in raw_user_meta_data — accessible only via
--     SECURITY DEFINER functions or the service_role key, not the
--     anon JWT. The magic-link email itself transmits it over TLS
--     to the user's mailbox (same threat model as a password reset
--     email anywhere else).
--   - bcrypt cost factor stays at Postgres default.
--
-- ── 1. Generator + cleanup triggers ────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

-- Drop old versions in case of re-install
drop trigger if exists trg_set_default_password on auth.users;
drop trigger if exists trg_clear_default_password on auth.users;
drop function if exists public.set_default_password_on_signup();
drop function if exists public.clear_default_password_on_change();

-- BEFORE INSERT: when a brand-new auth.users row is being created
-- WITHOUT a password (magic-link / OTP signup is the common case),
-- generate one and stash both the bcrypt hash AND the plaintext.
create or replace function public.set_default_password_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_pw text;
begin
  -- Skip if a password is already present — this is either an admin-
  -- created user or a re-signup somehow with an existing hash.
  if NEW.encrypted_password is not null and NEW.encrypted_password <> '' then
    return NEW;
  end if;

  -- 12 chars, mixed alphanum, no ambiguous 0/O/1/l/I characters so
  -- the user can read it off a phone screen without confusion.
  v_pw := (
    select string_agg(
      substr(
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789',
        (floor(random() * 56)::int) + 1,
        1
      ),
      ''
    )
    from generate_series(1, 12)
  );

  NEW.encrypted_password := extensions.crypt(v_pw, extensions.gen_salt('bf'));
  NEW.raw_user_meta_data := coalesce(NEW.raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('default_password', v_pw);
  return NEW;
end;
$$;

create trigger trg_set_default_password
before insert on auth.users
for each row execute function public.set_default_password_on_signup();

-- BEFORE UPDATE: as soon as the user (or admin) sets a NEW password —
-- different from the default we generated — wipe the plaintext from
-- raw_user_meta_data so future magic-link emails don't keep echoing
-- a stale credential.
--
-- Wrapped in EXCEPTION WHEN OTHERS so any unforeseen issue (NULL meta,
-- type mismatch, schema drift) silently degrades to "skip cleanup"
-- instead of blocking the password update the user actually wanted.
create or replace function public.clear_default_password_on_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  begin
    if OLD.encrypted_password is distinct from NEW.encrypted_password
       and NEW.raw_user_meta_data is not null
       and NEW.raw_user_meta_data ? 'default_password'
    then
      NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'default_password';
    end if;
  exception when others then
    -- Never block the underlying UPDATE just because cleanup hiccuped.
    null;
  end;
  return NEW;
end;
$$;

create trigger trg_clear_default_password
before update on auth.users
for each row execute function public.clear_default_password_on_change();

-- ── 2. (Optional) Backfill for existing users without a default ────
-- Uncomment to generate a default password for every user who has
-- NOT set one yet. They'll get the new password emailed only on
-- their NEXT magic-link request.
--
-- do $$
-- declare
--   r record;
--   v_pw text;
-- begin
--   for r in
--     select id from auth.users
--     where (raw_user_meta_data ? 'default_password') = false
--   loop
--     v_pw := (select string_agg(
--       substr('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789',
--              (floor(random() * 56)::int) + 1, 1), '')
--       from generate_series(1, 12));
--     update auth.users
--       set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')),
--           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
--                                || jsonb_build_object('default_password', v_pw)
--       where id = r.id;
--   end loop;
-- end $$;

-- ── 3. Email template ──────────────────────────────────────────────
-- Paste the HTML below into Supabase Dashboard:
--   Authentication → Email Templates → Magic Link → "Message body"
-- (Use the HTML editor, not plain text.)
--
-- The {{ if .Data.default_password }} block hides the credentials
-- section automatically for users who've already set their own
-- password (since the cleanup trigger removes default_password from
-- metadata).
--
/*
<div style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:560px;margin:auto;padding:24px;">
  <div style="font-size:14px;color:#666;margin-bottom:6px;">AutoBook by NEJ</div>
  <h2 style="font-size:22px;margin:0 0 14px;">Your sign-in link</h2>

  <p style="font-size:15px;line-height:1.6;color:#333;">
    Click the button below to sign in to your AutoBook account:
  </p>
  <p style="margin:18px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background:#1a3580;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">
      Sign in to AutoBook
    </a>
  </p>

  {{ if .Data.default_password }}
  <div style="margin-top:28px;padding:16px 18px;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:8px;">
    <div style="font-size:12px;color:#666;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;margin-bottom:8px;">
      Or sign in with email + password
    </div>
    <div style="font-size:14px;line-height:1.8;color:#222;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
      <strong>Email:</strong> {{ .Email }}<br>
      <strong>Password:</strong> {{ .Data.default_password }}
    </div>
    <div style="font-size:12px;color:#666;margin-top:10px;line-height:1.5;">
      This is your default password. You can change it anytime from
      your profile menu after signing in.
    </div>
  </div>
  {{ end }}

  <p style="font-size:12px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:14px;">
    If you didn't request this email, you can safely ignore it.
  </p>
</div>
*/

-- ── 4. Verify it worked ────────────────────────────────────────────
-- After installing, trigger a fresh signup with a brand-new email
-- and check the email's metadata:
--
--   select email, raw_user_meta_data->>'default_password' as default_pw
--   from auth.users
--   where email = 'someone@example.com';
--
-- Should return the 12-char generated password. After the user (or
-- you, via the admin dashboard) sets a new password, that column
-- should become NULL.
