-- ── Email notifications for client feedback ─────────────────────────
-- Run AFTER SUPABASE_SPREAD_FEEDBACK.sql.
--
-- When a client leaves a note on a share, this trigger fires off an
-- HTTP request to Resend's REST API (the same Resend account already
-- powering your auth-email SMTP). The photographer gets an email at
-- the address on their public.users row.
--
-- Architecture:
--   client posts feedback (RPC) → insert into share_spread_feedback
--   → trigger calls pg_net.http_post → Resend sends email asynchronously
--
-- pg_net's http_post is non-blocking — the feedback insert returns
-- immediately, the email is delivered out-of-band. Email delivery
-- failures never block the user's share or comment flow.

-- ── 1. Enable extensions ────────────────────────────────────────────
create extension if not exists pg_net with schema extensions;
-- (Supabase usually ships pg_net pre-installed.)

-- ── 2. Store the Resend API key in Supabase Vault ───────────────────
-- DO THIS ONCE in the Supabase Dashboard before running the trigger:
--
--   1. Open Dashboard → Project Settings → Vault
--      (or Project Settings → Configuration → Vault on newer dashboards)
--   2. Click "Add new secret"
--   3. Name:  resend_api_key
--   4. Value: <paste your Resend API key — starts with "re_">
--   5. Save
--
-- The key is encrypted at rest. The trigger function reads it via
-- vault.decrypted_secrets. No plaintext in SQL, no plaintext in git.

-- ── 3. Trigger function — fires on each feedback row ────────────────
drop function if exists public.notify_feedback_email() cascade;
create or replace function public.notify_feedback_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_email text;
  v_project_name text;
  v_share_token text := new.token;
  v_share_url text;
  v_resend_key text;
  v_body jsonb;
  v_safe_comment text;
  v_safe_project text;
begin
  -- 1. Photographer's email + project name
  select u.email, coalesce(sp.project_name, 'your photobook')
    into v_owner_email, v_project_name
    from public.shared_projects sp
    join public.users u on u.id = sp.user_id
    where sp.token = v_share_token;

  if v_owner_email is null or trim(v_owner_email) = '' then
    return new;  -- no email on file — silently skip
  end if;

  -- 2. Resend API key from Supabase Vault
  begin
    select decrypted_secret into v_resend_key
      from vault.decrypted_secrets
      where name = 'resend_api_key'
      limit 1;
  exception when others then
    -- Vault not configured or query failed — degrade gracefully
    return new;
  end;

  if v_resend_key is null or trim(v_resend_key) = '' then
    return new;  -- vault secret missing — silently skip
  end if;

  -- 3. Build the share URL (must match VITE_SITE_URL in the frontend)
  v_share_url := 'https://autobookbynej.online/?share=' || v_share_token;

  -- 4. Escape user-controlled text so embedded HTML in a comment can't
  --    break out into the email body. Strip newlines for the subject.
  v_safe_comment := replace(replace(replace(new.comment, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  v_safe_project := replace(replace(replace(v_project_name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  -- 5. Compose the email body
  v_body := jsonb_build_object(
    'from', 'AutoBook by NEJ <noreply@autobookbynej.online>',
    'to', json_build_array(v_owner_email),
    'subject', 'New feedback on "' || v_safe_project || '" — spread ' || (new.spread_idx + 1),
    'html',
      '<div style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:560px;margin:auto;padding:24px;">' ||
      '<div style="font-size:14px;color:#666;margin-bottom:6px;">AutoBook by NEJ · client review</div>' ||
      '<h2 style="font-size:18px;margin:0 0 14px;">New feedback on your photobook</h2>' ||
      '<p style="font-size:14px;line-height:1.6;color:#333;">Your client left a note on ' ||
        '<strong>spread ' || (new.spread_idx + 1) || '</strong> of <em>' || v_safe_project || '</em>:</p>' ||
      '<blockquote style="border-left:3px solid #f6c90e;background:#fffdf3;margin:14px 0;padding:14px 18px;font-size:15px;color:#444;line-height:1.6;">' ||
        v_safe_comment ||
      '</blockquote>' ||
      '<p style="font-size:13px;color:#555;line-height:1.6;">Open the share to see every note grouped by spread, or jump back into AutoBook to make changes.</p>' ||
      '<p style="margin:18px 0;"><a href="' || v_share_url || '" style="background:#1a3580;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600;font-size:13px;display:inline-block;">View the share</a></p>' ||
      '<p style="font-size:11px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:14px;">' ||
        'You''re receiving this because someone left feedback on a share you sent. To stop these emails, revoke the share from AutoBook → Share dialog.' ||
      '</p>' ||
      '</div>'
  );

  -- 6. Fire the HTTP request asynchronously via pg_net.
  -- The function returns a request_id but we don't await/inspect it.
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
  -- Email failures must never block the feedback insert. Swallow.
  return new;
end;
$$;

-- ── 4. Trigger wiring ───────────────────────────────────────────────
drop trigger if exists trg_notify_feedback_email on public.share_spread_feedback;
create trigger trg_notify_feedback_email
  after insert on public.share_spread_feedback
  for each row execute function public.notify_feedback_email();

-- ── 5. (Optional) Test it ───────────────────────────────────────────
-- After running the above, you can confirm the wiring with:
--
--   select * from extensions.net._http_response order by id desc limit 5;
--
-- If the trigger fires successfully you'll see 200-status rows from
-- api.resend.com. Non-200 means the API key is missing or wrong.
