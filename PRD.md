# Product Requirements Document — AutoBook by NEJ

| Field | Value |
|---|---|
| **Product** | AutoBook by NEJ |
| **Tagline** | Design wedding photobooks in 5 minutes, not 5 hours. |
| **Parent company** | **OctaveDev** — builds products and websites/apps for brands |
| **Founder** | Jerry Nnah (OctaveDev) |
| **Stage** | Soft launch (live payments active) |
| **Live URL** | https://autobookbynej.online |
| **Repository** | https://github.com/jerrinnah/photobook-designer |
| **Document version** | 1.1 |

---

## 1. Overview

AutoBook is **OctaveDev's** first major B2B SaaS product — an AI-assisted photobook designer for professional wedding, event, and portrait photographers. It collapses a multi-hour layout job in InDesign or Photoshop into a few clicks, includes a built-in client review portal, and exports print-ready files. Available as a web app (browser, mobile, tablet) and native desktop installers for Mac and Windows.

OctaveDev is a digital studio specializing in building products and websites/apps for brands. AutoBook represents OctaveDev's expansion from client services into productized software — using the same craft and quality bar applied to brand work, now sold directly to end-users worldwide.

Monetized via one-time payments — not a subscription. Three tiers serve different commitment levels: pay-per-book for first-time users, Starter for casual photographers, and Pro for working studios.

---

## 2. Problem statement

Professional photographers shoot more than they design. After every wedding or event they face a manual layout job:

- **Open InDesign / Photoshop**, build a multi-spread document
- **Place 100+ photos** into a layout grid manually
- **Iterate on layouts** until the book feels balanced
- **Export print-ready PDFs** with bleed and crop marks
- **Email JPGs to the client** for review, wait for written feedback, repeat
- **Print and deliver** — usually outsourced

A typical 20-spread wedding album consumes 4-8 hours of post-production. Subscription tools (Pic-Time at $89/mo, Fundy Designer at $299 + $9/mo) reduce that time but add recurring cost and Western-market pricing that's punishing for African studios.

AutoBook replaces that workflow with one click ("Design All"), bakes in client proofing, and charges a fair one-time price — globally accessible.

---

## 3. Target users

### Primary

**Wedding photographer (independent)**
- Shoots 8-30 weddings per year
- Currently uses InDesign or Photoshop for albums
- Spends 4-8 hours per album on layout
- Wants: speed, fair pricing, professional output, client review workflow

**Event photographer**
- Corporate events, conferences, parties
- High photo volume (500+ per shoot)
- Needs fast layouts and bulk delivery
- Wants: AI culling potential, multi-event organization

### Secondary

**Portrait & lifestyle studio**
- Steady client flow (10+/month)
- Family albums, senior portraits, maternity books
- Brand presentation matters (white-label branding)
- Wants: multi-project workspace, branded client portal

**Studio with multiple shooters (future tier)**
- 2-5 photographers under one brand
- Shared template library, shared brand assets
- Wants: team plan, centralized admin

---

## 4. Goals & success metrics

### 30-day goals (soft launch)
- 50 trial signups
- 5 paid conversions (any tier)
- < 5 critical bug reports
- 1-3 public testimonials

### 90-day goals
- 500 trial signups
- 50 paid conversions
- 3 print-shop partnerships exploring fulfillment integration
- First studio/team plan request

### 12-month goals
- 5,000 monthly active users
- ₦5M+ monthly revenue equivalent (mixed currencies)
- 1 major template category beyond Wedding/Event
- AI photo culling shipped

### Leading indicators
- Trial → paid conversion rate (target: 10%)
- Average exports per trial user (target: 3+)
- Share-link views per share (target: 5+, indicates active client review)
- Days from signup to first paid action

---

## 5. Core features (shipped)

### Editor
- **Auto-design pipeline** — `Design All` fills every spread with a high-density layout in <10 seconds
- **Per-spread tools** — Arrange, Reshuffle (with smart empty-cell fill), Redesign
- **Cell controls** — zoom, pan, lock, rotate, duplicate, manual crop
- **60+ templates** across 5 categories:
  - Standard (1-18 cells, all aspect ratios)
  - Wedding (19 layouts, Pro)
  - Event (4 layouts, Pro)
  - Cover (6 designs, mix of free + Pro)
  - Print Sizes (4×6, 5×7, 8×10, custom)
- **Custom canvas sizes** for non-standard albums
- **Blend Edges** for soft editorial styling

### Client proofing
- **Generate share link** — unguessable token, public-readable
- **No-signup viewer** — clients open any browser, flip through spreads
- **Per-spread feedback** — clients type notes on individual spreads
- **Approval / changes-requested status** — photographer sees state in dashboard
- **Smart re-share** — content-addressed storage means re-sharing only uploads changed spreads
- **Custom branding on viewer** — premium tiers replace AutoBook brand with studio's

### Multi-project workspace
- **IndexedDB autosave** — every change saves within ~500ms
- **Project switcher** — duplicate, delete, rename projects
- **Backup / restore** — portable `.photobook` files for cross-device migration

### Export
- **All JPGs** — one numbered file per spread
- **Print PDF** — single multi-page file with CMYK simulation, bleed, crop marks
- **300 DPI print-ready** — accepted by any commercial photobook printer

### Authentication
- **Magic link** (default) via custom SMTP through Resend
- **Optional password** set after first sign-in
- **Cross-device session sync** via Supabase Auth

### Internationalization
- **5 currencies** with auto-detection: USD, NGN, ZAR, GHS, KES
- **Per-currency pricing** anchored to NGN (fair flat-price globally)
- **Locale-aware checkout** via Paystack (must be enabled per-currency in merchant dashboard)

### Desktop apps
- **macOS** (Apple Silicon + Intel) — DMG installer, ~120 MB
- **Windows** (64-bit) — NSIS installer, ~100 MB
- Same Supabase backend — tier follows the user across devices
- Pro-tier feature (offline use is the value-add)

### Admin
- **Dashboard** at `/?admin` — password-gated
- **Full signup view** — all magic-link recipients, verified or not
- **Tier management** — assign Free / Starter / Pro by email
- **Stats** — total signups, premium users, exports, sessions, 7d/30d growth

---

## 6. Key user flows

### A. First-time visitor → trial signup
1. Lands at autobookbynej.online
2. Sees marketing landing (hero, features, pricing, FAQ)
3. Clicks "Try the editor"
4. Lands in editor with a default empty project
5. Optional: completes 13-step product tour
6. Drops in photos → clicks Design All
7. Exports a spread → prompted to sign in via magic link OR password
8. Verifies email → returns signed in, can export
9. (After 5 exports OR 30 days) prompted to upgrade

### B. Trial → paid conversion
1. Hits trial limit
2. Sees Upgrade Modal with 3 plans + currency selector
3. Picks Pay-per-book (most common first paid step)
4. Paystack popup → pays in detected/selected currency
5. Sees "Payment success — preparing download…" inline
6. Modal closes, queued export resumes automatically
7. Book is unlocked forever for unlimited exports

### C. Client review
1. Photographer clicks Share
2. Generates link (cached spread images, fast re-shares)
3. Sends link to client (WhatsApp/email)
4. Client opens link in browser — no signup
5. Flips through spreads, leaves notes on specific spreads
6. Photographer sees notes grouped per spread in Shares dashboard
7. Approve / Request changes status updates live

### D. Returning paid user
1. Visits autobookbynej.online
2. Detected as engaged → skips landing, goes straight to editor
3. Active project auto-loads from IndexedDB
4. Continues exactly where they left off

---

## 7. Pricing & business model

### Free trial
- 5 photobook exports **OR** 30 days, whichever ends first
- All Pro features unlocked during trial
- After trial: free tier with basic templates, no exports without upgrade

### Pay-per-book
- ₦750 / $0.50 / R9 / ₵6 / KSh 65 per designed spread
- ₦1,000 / $1 / R12 / ₵8 / KSh 99 for cover spread
- Unlimited exports of that specific book forever
- Add spreads later → pay only for new ones (idempotent on `project_id`)
- Includes client proofing + no watermark

### Starter
- ₦5,000 / $5 / R59 / ₵39 / KSh 499 one-time
- 10 photobook exports across any books
- No watermark, client proofing, white-label branding, full editing tools

### Pro
- ₦45,000 / $29 / R549 / ₵349 / KSh 3,999 one-time
- Unlimited exports
- All templates (Wedding, Event, premium covers)
- White-label branding
- **Mac + Windows desktop apps** (Pro-only)
- New templates as released

### Strategy notes
- **No subscriptions** — counter-positioning against monthly tools, removes commitment friction
- **Pay-per-book** is the conversion funnel anchor — low risk first purchase, customers naturally upgrade once they do 3+ books
- **NGN-anchored pricing** in all 5 currencies — Nigerian rates flow through globally, ~70% off equivalent USD SaaS pricing for international markets

---

## 8. Technical architecture

### Frontend
- **Framework**: React 19 + Vite 8
- **Canvas**: Konva (`react-konva`) for the spread editor
- **State**: Zustand
- **Storage**: IndexedDB via `idb-keyval` for autosave + multi-project
- **PDF generation**: jsPDF
- **Auth helpers**: `@supabase/supabase-js`

### Backend
- **Supabase** (managed Postgres + Auth + Storage)
- 11 SQL migration files (see repo root) handle schema setup
- **RPCs** for all state mutations (RLS-locked, security-definer functions)
- **Storage bucket** `share-previews` — public-read, content-addressed by spread hash

### Payments
- **Paystack inline checkout**
- 5 currencies enabled per-merchant in Paystack dashboard
- Per-project unlocks tracked in `project_unlocks` table

### Email
- **Resend** custom SMTP for auth emails (magic link, password reset)
- Branded "AutoBook by NEJ" sender

### Desktop
- **Electron 41** + `electron-builder`
- Mac arm64 (Apple Silicon) + x64 (Intel)
- Windows x64 NSIS installer
- Loads built dist with `?app=1` to skip the marketing landing

### Hosting / deploy
- **cPanel** at autobookbynej.online (Nigerian domain registrar)
- **GitHub Actions** auto-deploys on push to `main` via FTP

### Observability (current gap)
- Console logging only
- **No Sentry / no first-party analytics** — known operational debt

---

## 9. Roadmap

### Now (live)
- ✅ Editor + Auto Design
- ✅ Client proofing portal with per-spread feedback
- ✅ 3-tier pricing + per-book unlock
- ✅ Magic link + password auth
- ✅ Multi-currency (5)
- ✅ Mac + Windows desktop apps
- ✅ Admin dashboard
- ✅ Marketing landing page
- ✅ HOW_TO_USE documentation

### Next 30 days (post-launch hardening)
- 🟡 Sentry error tracking
- 🟡 GitHub Actions secrets migration (remove `.env.production` from git)
- 🟡 SQL migration consolidation (single ordered file)
- 🟡 Privacy policy + Terms of Service pages
- 🟡 Demo video on landing page
- 🟡 First 5-10 user testimonials

### Next 60 days (revenue amplifiers)
- 🔵 **Studio / team plan** — multi-seat licenses
- 🔵 **Print shop partnership** — one-click "order printed copies" with a partner printer
- 🔵 **AI photo culling** — auto-pick best 30 from 500 uploaded
- 🔵 **First-party analytics** (Plausible self-hosted or PostHog on custom subdomain to bypass adblockers)
- 🔵 Annual Pro Studio tier with custom domain branding

### Next 90 days (scale enablers)
- 🟣 **Storage GC job** — clean up dead share files (Edge Function on cron)
- 🟣 **CI smoke tests** before deploy
- 🟣 **Operational metrics dashboard** — MRR, conversion funnel, churn
- 🟣 **Affiliate / referral program**
- 🟣 **Additional template categories** (Travel, Sports, Lifestyle)

### Future bets
- ⚪ AI cover taglines (Claude/Gemini API)
- ⚪ AI auto-enhance for placed photos
- ⚪ Native iOS / Android apps (currently mobile = browser editor)
- ⚪ Marketplace for custom template packs
- ⚪ B2B white-label for print shops to embed AutoBook

---

## 10. Risks & open questions

### Operational
- **No automated error tracking** — production bugs surface via support email only
- **No tests** — regressions can ship to prod undetected
- **SQL setup is multi-file** — fresh-environment setup is fragile
- **Storage accumulates** — without GC, file count grows unbounded
- **Secrets in git history** — anon key + Paystack public key are in commits (low-severity since both are designed to be public, but bad hygiene)

### Business
- **Single-processor dependency** (Paystack) — outage or merchant suspension blocks all revenue
- **No legal entity / contracts** documented for the user — limits enterprise sales
- **Mac builds are not Apple Developer signed** — Gatekeeper warning on every install hurts conversion
- **No backup/DR** beyond Supabase free-tier auto-backups
- **Customer support is 1-person email** — won't scale past ~500 active users

### Product
- **Trial → paid conversion is unmeasured** — we don't yet know the funnel rate
- **No A/B testing infrastructure** — pricing / copy decisions are gut-based
- **Mobile editor exists but is untested at scale** — performance on 200+ photo projects on phones unknown
- **Print fulfillment isn't built** — biggest unmet customer need (per audit feedback)

### Open questions
- Should the desktop app remain Pro-only, or unlock for Starter too (potential conversion lift)?
- Should pay-per-book remain at the same per-spread price for power users, or introduce a "bundle" pack (e.g., 50 spreads for ₦25K)?
- Is the Nigerian-anchored pricing the right long-term strategy or should international rates eventually reflect Western purchasing power?

---

## 11. Out of scope (for v1.x)

These are intentionally not on the roadmap right now:

- Native iOS / Android apps (mobile browser is sufficient)
- Real-time collaboration (multiple users editing one project simultaneously)
- Built-in stock photo library
- Video photobooks
- Direct social media publishing
- Email marketing tools
- CRM for client management beyond share-link review
- Multi-language UI (English only initially; pricing localization in 5 currencies covers most market entry needs)

---

## 12. Success criteria

**Soft launch is successful if:**
- 50+ trial signups in 30 days
- 5+ paid conversions (any tier)
- At least 3 photographers say "I would recommend this to a colleague"
- Critical-bug rate stays below 1 per week

**Product-market fit signal:**
- Pay-per-book conversions in the first 30 days
- Photographers actively using client proofing (share-link views > 0 per share)
- Unprompted referrals (users telling us "X sent me")

**Time to retire to maintenance mode:**
- 5,000 MAU sustained for 6 months
- Studio / team plan revenue exceeds individual sales
- AI features cover the "wow factor" gap vs. Pic-Time / Fundy

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **Spread** | Two facing pages of a printed book — the unit AutoBook designs |
| **Cover** | The first spread (index 0) — handled differently by Auto Design |
| **Template** | A pre-designed cell layout that photos snap into |
| **Cell** | One photo slot within a template |
| **Designed spread** | A spread with at least one cell containing a photo — counts for pay-per-book pricing |
| **Trial** | First 5 exports OR 30 days, whichever ends first — full Pro access |
| **Share token** | Unguessable 24-character string in share URLs (`?share=...`) |
| **Project unlock** | Per-project payment record granting unlimited exports of one book |
| **Engaged** | Visitor who has signed in OR requested a magic link — skips marketing landing |

---

*Document maintained by NEJ Studios. Last revised in tandem with the soft-launch deploy. Update when shipping major features or rethinking strategy.*
