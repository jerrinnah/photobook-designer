-- ── Welcome email on signup ──────────────────────────────────────
-- Fires an intro email via Resend as soon as a new profile row
-- lands in public.users. Includes the app pitch + the user's own
-- referral link so they can start sharing immediately.
--
-- Depends on:
--   • SUPABASE_FEEDBACK_NOTIFY.sql (uses the same Vault secret
--     'resend_api_key' and the same pg_net extension).
--   • SUPABASE_REFERRALS.sql (the referral_codes table).
--
-- Non-blocking: any failure in the trigger (missing key, HTTP down,
-- network glitch) is swallowed and the user insert still commits.
-- We never want a broken email path to break signup.

create extension if not exists pg_net with schema extensions;

-- Helper — mint or reuse a referral code for a specific user id.
-- Trigger context has no auth.uid() (it's the postgres role), so
-- get_or_create_my_referral_code() from the referrals script can't
-- be used directly. This is a scoped-by-arg equivalent.
drop function if exists public.ensure_referral_code_for(uuid);
create or replace function public.ensure_referral_code_for(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  if p_user_id is null then return null; end if;

  select code into v_code from public.referral_codes where user_id = p_user_id;
  if v_code is not null then return v_code; end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := upper(substring(encode(extensions.gen_random_bytes(6), 'base64'), 1, 6));
    v_code := translate(v_code, '0O1IL+/=', '');
    if length(v_code) < 6 then continue; end if;
    v_code := substring(v_code, 1, 6);
    begin
      insert into public.referral_codes (user_id, code) values (p_user_id, v_code);
      return v_code;
    exception when unique_violation then
      if v_attempts > 8 then return null; end if;
    end;
  end loop;
end;
$$;

-- ── Trigger function ─────────────────────────────────────────────
drop function if exists public.send_welcome_email() cascade;
create or replace function public.send_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email       text := new.email;
  v_ref_code    text;
  v_ref_link    text;
  v_open_link   text := 'https://autobookbynej.online/?app=1';
  v_resend_key  text;
  v_first_name  text;
  v_body        jsonb;
begin
  -- No email → nothing to send. Silently skip.
  if v_email is null or trim(v_email) = '' then return new; end if;

  -- Resend API key from Supabase Vault. If it's not set, degrade
  -- silently — user still gets Supabase's own confirmation email,
  -- just no branded welcome.
  begin
    select decrypted_secret into v_resend_key
      from vault.decrypted_secrets
      where name = 'resend_api_key'
      limit 1;
  exception when others then
    return new;
  end;
  if v_resend_key is null or trim(v_resend_key) = '' then return new; end if;

  -- Mint / fetch their referral code so the intro email carries a
  -- ready-to-share link.
  v_ref_code := public.ensure_referral_code_for(new.id);
  if v_ref_code is null then
    v_ref_link := null;
  else
    v_ref_link := 'https://autobookbynej.online/?ref=' || v_ref_code;
  end if;

  -- First name from local-part of the email (before the @).
  v_first_name := initcap(split_part(v_email, '@', 1));
  -- Strip trailing digits + dots to make it presentable
  v_first_name := regexp_replace(v_first_name, '[.0-9]+$', '');
  if length(v_first_name) = 0 then v_first_name := 'there'; end if;

  v_body := jsonb_build_object(
    'from', 'AutoBook by NEJ <noreply@autobookbynej.online>',
    'to',   json_build_array(v_email),
    'subject', 'Welcome to AutoBook — let''s make your first photobook',
    'html',
      '<div style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:580px;margin:auto;padding:24px;background:#fff;">' ||
        -- Header band
        '<div style="text-align:center;margin-bottom:28px;">' ||
          '<div style="font-size:12px;color:#8a5a10;letter-spacing:2px;text-transform:uppercase;font-weight:700;">AutoBook by NEJ</div>' ||
          '<h1 style="font-size:26px;margin:8px 0 0;color:#1a1a1a;font-weight:600;">Welcome, ' || v_first_name || '.</h1>' ||
        '</div>' ||

        -- Intro paragraph
        '<p style="font-size:15px;line-height:1.65;color:#333;margin:0 0 18px;">' ||
          'You just joined a tool built for photographers who value their weekends. ' ||
          'AutoBook takes a folder of photos and gives you a print-ready photobook design in minutes — ' ||
          'without opening InDesign, without hand-placing every image, without wrestling a template that fights back.' ||
        '</p>' ||

        -- What you can do
        '<h2 style="font-size:15px;margin:24px 0 10px;color:#1a1a1a;">What''s inside</h2>' ||
        '<ul style="font-size:14px;line-height:1.7;color:#333;padding-left:20px;margin:0 0 18px;">' ||
          '<li><strong>Drop a folder</strong> of photos → get an automatic wedding-book layout, then tweak.</li>' ||
          '<li><strong>Print-ready PDF export</strong> with bleed + crop marks. Presets for SnapFish, Blurb, Photobook Worldwide, and more.</li>' ||
          '<li><strong>Client review links</strong> so approvals happen in-app, not over WhatsApp.</li>' ||
          '<li><strong>Cloud + local backups</strong> so a browser crash never costs you Monday''s job.</li>' ||
        '</ul>' ||

        -- Primary CTA
        '<p style="text-align:center;margin:28px 0;">' ||
          '<a href="' || v_open_link || '" style="background:#1a3580;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Open AutoBook</a>' ||
        '</p>' ||

        -- Referral block (only if we successfully minted a code)
        case when v_ref_link is not null then
          '<div style="margin:32px 0;padding:20px 22px;background:#fdf6e3;border:1px solid #e8d27a;border-radius:8px;">' ||
            '<div style="font-size:11px;color:#8a5a10;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Your referral link</div>' ||
            '<h3 style="font-size:16px;margin:0 0 10px;color:#1a1a1a;">Refer a photographer, earn 20% off</h3>' ||
            '<p style="font-size:13px;line-height:1.6;color:#5a4a2a;margin:0 0 12px;">' ||
              'Every photographer who signs up with your link and upgrades to a paid plan earns you ' ||
              '<strong>20% off your next subscription</strong>. Stackable up to 100% off.' ||
            '</p>' ||
            '<div style="background:#fff;border:1px solid #e0d0a0;border-radius:5px;padding:10px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#8a5a10;word-break:break-all;margin-bottom:10px;">' ||
              v_ref_link ||
            '</div>' ||
            '<p style="font-size:12px;color:#8a7a4a;margin:0;">' ||
              'Copy that URL into WhatsApp, email, or a story — anyone who signs up through it counts toward your discount.' ||
            '</p>' ||
          '</div>'
        else '' end ||

        -- Support
        '<p style="font-size:13px;line-height:1.6;color:#666;margin:22px 0 0;">' ||
          'Stuck on something? Hit the <strong>? Support</strong> button in the toolbar and your message reaches us directly. ' ||
          'We reply within one business day.' ||
        '</p>' ||

        -- Footer
        '<p style="font-size:11px;color:#999;margin:32px 0 0;border-top:1px solid #eee;padding-top:16px;">' ||
          'You''re receiving this because you signed up at ' ||
          '<a href="https://autobookbynej.online" style="color:#999;">autobookbynej.online</a>. ' ||
          'This is a one-off welcome — no marketing list, no drip campaign.' ||
        '</p>' ||
      '</div>'
  );

  -- Fire the request non-blocking.
  perform extensions.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_resend_key,
      'Content-Type', 'application/json'
    ),
    body := v_body
  );

  return new;
exception when others then
  -- Any failure — silently continue. Signup must never break.
  return new;
end;
$$;

-- ── Trigger wiring ───────────────────────────────────────────────
-- Fire AFTER INSERT on public.users so the row is fully committed
-- (including its id, which the ensure_referral_code_for helper needs).
drop trigger if exists trg_send_welcome_email on public.users;
create trigger trg_send_welcome_email
  after insert on public.users
  for each row execute function public.send_welcome_email();

-- ── (Optional) Confirm the wiring ────────────────────────────────
-- After running this + any test signup:
--
--   select id, status_code, url, created
--     from net._http_response
--     order by id desc
--     limit 5;
--
-- (If that errors with "relation does not exist" — pg_net put the
-- table in a different schema. Locate it with:
--   select n.nspname, c.relname
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--     where c.relname = '_http_response';)
--
-- A 200 row from api.resend.com means it fired. A 4xx means the
-- Vault key is wrong or the Resend from-address isn't verified in
-- your Resend dashboard.
