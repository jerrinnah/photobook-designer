-- ── Welcome email on signup ──────────────────────────────────────
-- Fires an intro email via Resend as soon as a new profile row
-- lands in public.users.
--
-- Includes:
--   • Real Supabase Auth magic link (calls the /auth/v1/admin/generate_link
--     endpoint) so clicking the button signs the user in AND proves
--     the email was actually delivered / received
--   • YouTube walkthrough video for the "how do I get started" moment
--   • The user's referral link so they can start sharing on day zero
--
-- Depends on:
--   • Vault secrets 'resend_api_key' AND 'supabase_service_role_key'
--   • SUPABASE_REFERRALS.sql (the referral_codes table + helpers)
--   • pg_net extension
--
-- Non-blocking: any failure in the trigger (missing key, HTTP down,
-- network glitch) is swallowed and the user insert still commits.
-- We never want a broken email path to break signup.

create extension if not exists pg_net with schema extensions;

-- Helper — mint or reuse a referral code for a specific user id.
-- Trigger context has no auth.uid() (it's the postgres role), so this
-- is a scoped-by-arg equivalent of get_or_create_my_referral_code().
drop function if exists public.ensure_referral_code_for(uuid);
create or replace function public.ensure_referral_code_for(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, net
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

-- Helper — synchronously fetch a Supabase Auth magic link for an
-- email address. Uses the admin API (requires service_role_key). Since
-- pg_net is async we fire the request then poll _http_response for up
-- to ~5 seconds. Returns the action_link string or NULL on failure.
drop function if exists public.mint_magic_link_for(text);
create or replace function public.mint_magic_link_for(p_email text)
returns text
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_service_key text;
  v_project_ref text := 'qjvvnyhjeqbxakosasfi';  -- your Supabase project ref
  v_api_url     text;
  v_request_id  bigint;
  v_content     jsonb;
  v_link        text;
  v_attempt     int := 0;
begin
  if p_email is null or trim(p_email) = '' then return null; end if;

  begin
    select decrypted_secret into v_service_key
      from vault.decrypted_secrets
      where name = 'supabase_service_role_key' limit 1;
  exception when others then return null; end;
  if v_service_key is null or trim(v_service_key) = '' then return null; end if;

  v_api_url := 'https://' || v_project_ref || '.supabase.co/auth/v1/admin/generate_link';

  v_request_id := net.http_post(
    url := v_api_url,
    headers := jsonb_build_object(
      'apikey',        v_service_key,
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type',  'application/json'
    ),
    body := jsonb_build_object(
      'type',        'magiclink',
      'email',       p_email,
      'redirect_to', 'https://autobookbynej.online/?app=1'
    )
  );

  -- Poll for the response up to ~5s in 200ms increments.
  for v_attempt in 1..25 loop
    select content::jsonb into v_content
      from net._http_response
      where id = v_request_id
        and status_code is not null;
    exit when v_content is not null;
    perform pg_sleep(0.2);
  end loop;

  if v_content is null then return null; end if;

  -- Supabase returns { action_link: "https://..." }. Newer versions
  -- nest it under `properties.action_link`. Try both.
  v_link := v_content->>'action_link';
  if v_link is null then v_link := v_content->'properties'->>'action_link'; end if;
  return v_link;
exception when others then
  return null;
end;
$$;

-- ── Trigger function ─────────────────────────────────────────────
drop function if exists public.send_welcome_email() cascade;
create or replace function public.send_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_email        text := new.email;
  v_ref_code     text;
  v_ref_link     text;
  v_magic_link   text;
  v_tutorial_url text := 'https://youtu.be/Kz5l-qpHNVo?si=vsnpKfHqIV0bTq6z';
  v_resend_key   text;
  v_first_name   text;
  v_body         jsonb;
begin
  if v_email is null or trim(v_email) = '' then return new; end if;

  -- Resend API key from Supabase Vault.
  begin
    select decrypted_secret into v_resend_key
      from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then return new; end;
  if v_resend_key is null or trim(v_resend_key) = '' then return new; end if;

  -- Referral link (fail soft — no ref block if code minting fails)
  v_ref_code := public.ensure_referral_code_for(new.id);
  v_ref_link := case when v_ref_code is null then null
                     else 'https://autobookbynej.online/?ref=' || v_ref_code end;

  -- Real Supabase magic link — click to sign in. Falls back to a
  -- plain app link if the admin API is unreachable or unset.
  v_magic_link := public.mint_magic_link_for(v_email);
  if v_magic_link is null then
    v_magic_link := 'https://autobookbynej.online/?app=1';
  end if;

  -- First name derived from local-part of the email
  v_first_name := initcap(split_part(v_email, '@', 1));
  v_first_name := regexp_replace(v_first_name, '[.0-9]+$', '');
  if length(v_first_name) = 0 then v_first_name := 'there'; end if;

  v_body := jsonb_build_object(
    'from', 'AutoBook by NEJ <noreply@autobookbynej.online>',
    'to',   json_build_array(v_email),
    'subject', 'Welcome to AutoBook — let''s design your first photobook',
    'html',
      '<div style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:600px;margin:auto;padding:24px;background:#fff;">' ||

        -- ══ Header band ══
        '<div style="text-align:center;margin-bottom:28px;">' ||
          '<div style="font-size:12px;color:#8a5a10;letter-spacing:2px;text-transform:uppercase;font-weight:700;">AutoBook by NEJ</div>' ||
          '<h1 style="font-size:28px;margin:8px 0 0;color:#1a1a1a;font-weight:600;">Welcome, ' || v_first_name || '.</h1>' ||
        '</div>' ||

        -- ══ Stronger intro — sets the tone + pain point ══
        '<p style="font-size:16px;line-height:1.65;color:#222;margin:0 0 16px;font-weight:500;">' ||
          'Photobook design shouldn''t take a weekend. AutoBook fixes that.' ||
        '</p>' ||
        '<p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 12px;">' ||
          'You just joined thousands of photographers who''ve stopped fighting InDesign templates. ' ||
          'Drop a wedding folder, hit <strong>Design All</strong>, and in under two minutes you have a ' ||
          'full print-ready book with proper photo hierarchy, sensible spreads, and cover typography that doesn''t look like Word.' ||
        '</p>' ||
        '<p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 18px;">' ||
          'Tweak what the AI got wrong (usually a few swaps), export a bleed-ready PDF with crop marks, ' ||
          'and send your client a review link. That''s the whole loop. No plug-ins. No InDesign licence. No manual grid-snapping.' ||
        '</p>' ||

        -- ══ Primary magic-link CTA — signs them in ══
        '<div style="text-align:center;margin:28px 0;">' ||
          '<a href="' || v_magic_link || '" style="background:#1a3580;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;display:inline-block;box-shadow:0 2px 6px rgba(26,53,128,0.25);">Open AutoBook & sign in →</a>' ||
          '<div style="font-size:11px;color:#888;margin-top:8px;">One click signs you in — no password needed.</div>' ||
        '</div>' ||

        -- ══ Video tutorial block ══
        '<div style="margin:32px 0;padding:22px 24px;background:#0f1620;border-radius:8px;">' ||
          '<div style="display:flex;align-items:flex-start;gap:14px;">' ||
            '<div style="flex-shrink:0;font-size:24px;line-height:1;">▶</div>' ||
            '<div style="flex:1;">' ||
              '<h3 style="font-size:16px;margin:0 0 6px;color:#fff;">Watch the 3-minute walkthrough</h3>' ||
              '<p style="font-size:13px;line-height:1.55;color:#bcd;margin:0 0 12px;">' ||
                'The single fastest way to get productive. It covers folder import, Design All, per-cell tweaks, and export — everything you need for your first real book.' ||
              '</p>' ||
              '<a href="' || v_tutorial_url || '" style="background:#e05c5c;color:#fff;text-decoration:none;padding:9px 18px;border-radius:5px;font-weight:600;font-size:12px;display:inline-block;">▶ Watch on YouTube</a>' ||
            '</div>' ||
          '</div>' ||
        '</div>' ||

        -- ══ What's inside ══
        '<h2 style="font-size:15px;margin:28px 0 10px;color:#1a1a1a;">What you can do out of the box</h2>' ||
        '<ul style="font-size:14px;line-height:1.75;color:#333;padding-left:20px;margin:0 0 20px;">' ||
          '<li><strong>Design All</strong> — auto-arrange every photo across every spread in one click.</li>' ||
          '<li><strong>Print-ready PDF</strong> with 0.125" bleed, crop marks, and presets for SnapFish, Blurb, Photobook Worldwide, and more.</li>' ||
          '<li><strong>Client review links</strong> so approvals happen in-app — per-spread and per-photo feedback.</li>' ||
          '<li><strong>Face-priority scanning</strong> — hero photos of the bride and groom get placed first, automatically.</li>' ||
          '<li><strong>Cloud + local backups</strong> — every project mirrors to Supabase Storage. Nothing gets lost.</li>' ||
          '<li><strong>Save to .autobook</strong> — take a project between machines with ⌘S / Ctrl+S like a real desktop app.</li>' ||
        '</ul>' ||

        -- ══ Referral block ══
        case when v_ref_link is not null then
          '<div style="margin:32px 0;padding:20px 22px;background:#fdf6e3;border:1px solid #e8d27a;border-radius:8px;">' ||
            '<div style="font-size:11px;color:#8a5a10;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Your referral link</div>' ||
            '<h3 style="font-size:17px;margin:0 0 8px;color:#1a1a1a;">Refer a photographer, earn 20% off</h3>' ||
            '<p style="font-size:13px;line-height:1.6;color:#5a4a2a;margin:0 0 12px;">' ||
              'Anyone who signs up with your link and upgrades to Starter or Pro earns you ' ||
              '<strong>20% off your next subscription</strong>. Stackable up to 100% — five conversions and your next plan is free.' ||
            '</p>' ||
            '<div style="background:#fff;border:1px solid #e0d0a0;border-radius:5px;padding:10px 14px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#8a5a10;word-break:break-all;">' || v_ref_link || '</div>' ||
          '</div>'
        else '' end ||

        -- ══ Support ══
        '<p style="font-size:13px;line-height:1.6;color:#666;margin:22px 0 0;">' ||
          'Stuck on something? Hit the <strong>? Support</strong> button in the toolbar — messages come to us directly and we reply within one business day.' ||
        '</p>' ||

        -- ══ Footer ══
        '<p style="font-size:11px;color:#999;margin:32px 0 0;border-top:1px solid #eee;padding-top:16px;">' ||
          'You''re receiving this because you signed up at ' ||
          '<a href="https://autobookbynej.online" style="color:#999;">autobookbynej.online</a>. ' ||
          'One-off welcome — no marketing list, no drip campaign.' ||
        '</p>' ||
      '</div>'
  );

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_resend_key,
      'Content-Type', 'application/json'
    ),
    body := v_body
  );

  return new;
exception when others then
  return new;
end;
$$;

-- ── Trigger wiring ───────────────────────────────────────────────
drop trigger if exists trg_send_welcome_email on public.users;
create trigger trg_send_welcome_email
  after insert on public.users
  for each row execute function public.send_welcome_email();

-- ── (Optional) Confirm the wiring ────────────────────────────────
-- After running this + any test signup, verify with:
--
--   select id, status_code, error_msg,
--          left(content::text, 200) as content
--     from net._http_response
--     order by id desc
--     limit 5;
--
-- Two 200 rows expected per signup: one from supabase.co (magic
-- link generation), one from api.resend.com (email delivery).
