# IP / Code Protection — Status & Checklist

## Tier 1 — completed in code

- [x] **LICENSE** — proprietary license at repo root (`LICENSE`)
- [x] **package.json metadata** — author, license: `UNLICENSED`, private: `true`
- [x] **Source maps disabled** — `vite.config.js` sets `build.sourcemap: false`
- [x] **Console + debugger stripped** — `vite.config.js` sets `esbuild.drop: ['console','debugger']`
- [x] **© badge in UI** — visible in toolbar (desktop) and top bar (mobile)
- [x] **GitHub repo private** — confirmed
- [x] **Supabase service_role key never in frontend** — only `VITE_SUPABASE_ANON_KEY` is exposed (anon is safe to publish)
- [x] **Supabase RLS on `users` table** — direct table access denied
- [x] **Admin dashboard password-gated** — `get_users_admin` / `get_stats_admin` RPC checks password server-side

## Tier 1 — manual steps left for you

### 1. Lock Supabase to your domain (5 min)

This stops anyone who copies your anon key from using your backend from a different domain.

1. Open **Supabase Dashboard** → your project
2. Go to **Project Settings → API**
3. Scroll to **CORS Origins** (or **Authentication → URL Configuration → Site URL** depending on the dashboard version)
4. Set the allowed origin to:
   ```
   https://autobookbynej.online
   http://autobookbynej.online
   http://localhost:5173
   ```
5. Save

### 2. Trademark search (15 min, free)

Before committing to "AutoBook by NEJ" as the brand:

- US: https://tmsearch.uspto.gov/ → search "autobook"
- UK: https://trademarks.ipo.gov.uk/ipo-tmtext
- Global: https://www3.wipo.int/branddb/en/

If it's clear, file an application (~$250 in US for one class). Until then, this `LICENSE` and the `©` badge give you common-law copyright protection — not as strong as a trademark but enforceable for DMCA takedowns.

### 3. Domain privacy lock (~$0–10/yr)

Namecheap → Domain List → autobookbynej.online → **Domain Privacy** → enable

Hides your WHOIS contact info from public lookups.

## Tier 2 — when ready (paid)

- **Apple Developer ID** ($99/yr) → code-sign Mac DMG so it installs without warnings AND can't be tampered with
- **Cloudflare in front of cPanel** (free) → WAF, DDoS, fixes the SSL issue, hides origin IP
- **Trademark filing** (~$250) → legal teeth for cease-and-desist
- **EV code-signing cert for Windows** (~$200–500/yr) → no SmartScreen warnings

## Tier 3 — make stolen copies useless

- License-key system for the desktop app (validates against Supabase)
- `javascript-obfuscator` Vite plugin → un-minifiable bundle
- Watermark exports on free tier
- Rate-limit Supabase RPCs by IP

## DMCA takedown contacts (for clones)

If you spot a clone running your bundle:
- **Cloudflare** (most clones are behind it): https://abuse.cloudflare.com/
- **AWS S3 / CloudFront**: https://aws.amazon.com/forms/report-abuse
- **Vercel**: abuse@vercel.com
- **GoDaddy**: https://supportcenter.godaddy.com/AbuseReport
- **Generic registrars**: WHOIS the domain, find the registrar, file with their abuse desk

Each takedown is free and usually resolved in 24–72 hours.
