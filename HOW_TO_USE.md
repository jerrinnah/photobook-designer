# AutoBook by NEJ — How to Use

A web-based photobook designer for professional photographers, studios, and anyone selling printed memories. Design a 20-spread wedding album in under 3 minutes — then send a private review link to your client.

Live at **[autobookbynej.online](https://autobookbynej.online)**.

---

## Who AutoBook is for

- **Wedding photographers** delivering polished albums fast
- **Event photographers** turning a long shoot into a 30-spread book
- **Portrait studios** with a steady stream of family / senior / maternity work
- **Print sellers** who want a no-code way to lay out books they then send to a print shop
- **Freelance designers** who don't want to fight Adobe InDesign for every album

If you've ever spent 4 hours moving photos around a grid in Photoshop, AutoBook saves you most of that.

---

## Why AutoBook (the short version)

| Feature | What it gives you |
|---|---|
| **One-click Design All** | A finished book in 5 seconds instead of an evening |
| **60+ layouts** | Wedding, event, portfolio, cover — pre-designed, professional |
| **Client proofing portal** | Send a private link, get per-spread feedback in writing |
| **Print-ready PDFs** | CMYK, bleed, crop marks — any print shop accepts them |
| **Auto-save** | Never lose work. Switches between projects without exporting |
| **Multi-project** | Run dozens of jobs in parallel from the same browser |
| **White-label branding** | Your logo on every client viewer (Pro) |
| **No subscription guilt** | One-time payment — ₦5K Starter or ₦45K Pro |
| **Works on phone** | Real editor on mobile, not a "use desktop" wall |

---

## Quick start — 3 minutes to your first book

1. **Open the app** at [autobookbynej.online](https://autobookbynej.online).
2. **Click 📁 Projects** → **+ Create** → name your book (e.g. "Tomi & Ade Wedding").
3. **Drop photos** into the **Photos** panel (left). Just drag a folder from Finder/Explorer.
4. Click **⚡ Design All** in the toolbar. Every spread gets a layout and your photos get distributed.
5. **▶ Preview** — flip through the result.
6. **↓ Export ▾** → **All JPGs** or **Print PDF**. Done.

That's it. You now have a finished album.

---

## Core features (in detail)

### 1. Auto-design pipeline

**⚡ Design All** is the heart of AutoBook. It:
- Picks a high-density template for each spread (varying density to keep visual rhythm)
- Distributes your photos in arrangement order, with aspect-aware placement
- Skips spreads you've already manually arranged

**⟐ Arrange** does the same but only for the current spread.

**⟳ Redesign** picks a different template for the current spread and re-fills it. Use this when you don't love the layout but want to keep your photo choices.

**⇄ Reshuffle** is per-spread and smart:
- If the spread has empty cells → fills them with the next unplaced photos from your library
- If the spread is fully filled → shuffles photos between cells

### 2. Templates

Five categories, 60+ layouts:

| Category | What's in it | Plan |
|---|---|---|
| **Standard** | 1–18 cells, every aspect ratio, all the workhorse layouts | All plans |
| **Cover** | 6 cover designs — minimal, romantic, editorial | Some free, premium covers in Pro |
| **Wedding** | 19 wedding-specific layouts | Pro |
| **Event** | 4 event-story layouts | Pro |
| **Print Sizes** | 4×6, 5×7, 8×10, custom | All plans |

Locked templates show a 🔒 icon. Click to see what plan unlocks it.

### 3. Per-cell controls

Click any photo on the canvas to:
- **Zoom** in/out within the cell
- **Pan** to recompose
- **Lock** to protect it from Reshuffle / Design All
- **Rotate** in 90° increments
- **Duplicate** to another cell
- **Remove** to clear the cell

Cells with `manualCrop` set are preserved across template changes — your composition decisions stick.

### 4. Client proofing portal (Pro / Trial)

The "share for review" feature is built for the back-and-forth of client approval:

1. Click **✦ Share** in the toolbar
2. Click **Generate share link**
3. Send the link to your client (it's copied to your clipboard automatically)
4. The client opens it in **any browser** — no app, no login, no signup
5. They flip through every spread

**Per-spread notes:** Under each spread, your client can write specific changes:
> *"Swap photos 2 and 3"*
> *"Use a different cover photo"*
> *"This one is great"*

You see every note in the ShareModal under your share's row — grouped by spread, time-stamped, no email back-and-forth required.

**Status:** The client can approve the whole book or request changes. Status updates in real time.

**Re-sharing is fast:** AutoBook caches each spread image content-addressed. If you tweak 2 spreads and re-share, only those 2 spreads upload — the rest are instant.

### 5. Print output

Two export paths, both 300 DPI print-ready:

- **All JPGs** — One file per spread (`book-name-01.jpg`, `book-name-02.jpg`, …). Print shops who want layered files love this.
- **Print PDF** — Single multi-page PDF with crop marks and bleed. Drop it into any commercial printer's order form.

Both include the gutter (spine) area and edge bleed so binding doesn't eat into your composition.

### 6. White-label branding (Premium)

Pro / Starter / Trial users can customize what the client sees:

- **Logo** — replaces the AutoBook logo on the share viewer
- **Studio name** — appears in the share viewer header
- **Brand color** — accents in the viewer
- **Website link** — clickable from the viewer

Open the toolbar logo to edit, or use **Brand settings** in the profile menu.

### 7. Multi-project workspace

The **📁 Projects** modal lets you:
- Switch between projects (auto-saves the current one first)
- Create new projects
- Duplicate any project (great for "Wedding A" → "Wedding B" templates)
- Delete projects you no longer need
- **Backup / Restore** — export a `.photobook` file you can move between machines

Each project gets its own auto-save in IndexedDB. You can have 20 projects open without losing any state.

### 8. Mobile editor

The mobile shell is a real editor, not a placeholder. Sheets for:
- Photos (upload, reorder, filter by used/unused)
- Layouts (template browser with locked/unlocked badges)
- Spreads (navigate, add, duplicate)
- More (export, share, sign in, projects)

The same Konva canvas handles touch — pinch to zoom, drag to pan a cell.

### 9. Auto-save & data safety

- Every change auto-saves to IndexedDB within ~500ms
- Refreshing the browser keeps your work intact
- A "Beforeunload" warning catches accidental tab-close when there's unsaved work
- Switching projects always flushes the active one first
- Sign in to keep your account profile (tier, brand, etc.) across devices

### 10. Sign-in: magic link or password

- **First time**: enter your email, click the magic link, you're in
- **From the profile menu**: choose "Set / change password" to enable password sign-in
- **Returning visits**: use either method, whichever you prefer

The password is stored encrypted by Supabase Auth — we never see or store it ourselves.

---

## Plans & pricing

### Free (Trial)
- **5 free exports OR 30 days, whichever ends first**
- Full Pro access during trial — every template, all features unlocked
- After trial: ~half the basic templates remain accessible (no Pro-only categories)

### Pay-per-book — ₦750 per spread + ₦1,000 cover
- **Pay only for what you finish.** Designing a 15-spread + cover book? ₦12,250 unlocks it.
- One payment = unlimited exports of **that specific book** forever.
- Add spreads later? Top up for just the new ones — no double-charging.
- Other books still locked, so this is the right fit when you have one project (not a stream).
- Best for: photographers doing a single wedding album, or anyone who wants to try before committing to a plan.

### Starter — ₦5,000 (one-time)
- **10 photobook exports** (across all books)
- Every basic template
- Client proofing portal
- White-label branding
- Full editing tools
- No watermark
- Best for: 2-3 books / events per quarter.

### Pro — ₦45,000 (one-time)
- **Unlimited exports**
- Every template — including Wedding (19), Event (4), and premium covers
- **Desktop app for macOS + Windows** — work offline, exports run faster
- Everything in Starter
- New templates as we add them, automatically
- Best for: working studios with steady client flow — pays for itself after ~6 books.

No subscriptions. No card-on-file. Pay once, own it. Pay via Paystack — Visa, Mastercard, Verve, or bank transfer. Prices auto-convert to your local currency (NGN, USD, ZAR, GHS, KES).

**Tip:** Start with Pay-per-book on your first project. If you find yourself doing 3+ books, upgrading to Starter or Pro saves money.

---

## Tips, tricks, and pro moves

1. **Upload extra photos** — AutoBook's aspect-aware placement gets better choices when it has a deeper pool. Throw in 1.5× what you think you need.

2. **Use Lock before Reshuffle** — Right-click cells you love, lock them. Reshuffle leaves them alone, randomizes everything else.

3. **Custom sizes** — Need a 14×11 album? Pick "Custom" from the size dropdown and type the pixel dimensions. AutoBook keeps the layouts proportional.

4. **The Cover spread is special** — index 0 in your book. AutoBook treats it specially in Design All so it doesn't get wedged with generic layouts.

5. **Repeated photo finder** — Click **⚠ Repeated** to highlight any photo placed in more than one cell. Click **Fix** to keep first uses and clear duplicates.

6. **Blend Edges** for editorial covers — Click **◈ Blend** to soft-fade the edges of every photo. Great for moody / fashion / minimal covers.

7. **Reshuffle as a "fill empties" button** — On a spread that's missing photos, Reshuffle pulls in the next unplaced library photos in order. Simpler than dragging one by one.

8. **Branded share for VIP clients** — Set your brand logo before sharing with a wedding client. The viewer they see has your studio's name and logo, not "AutoBook" — a small touch that bumps perceived value.

9. **Re-share is free** — Once a share is live, you can edit your book and click Generate again. Cached spreads are reused instantly; only changed ones re-upload. Your client always sees the latest.

10. **Download backup before clearing browser data** — Projects live in IndexedDB. If you ever clear your browser cache, ProjectPicker → Download backup saves a `.photobook` file you can re-import.

---

## Frequently asked questions

### How do I print my book?
Export as **Print PDF**. Send the PDF to any commercial photobook printer worldwide. The PDF includes bleed and crop marks already — no special prep needed.

### Where are my photos stored?
In your browser's IndexedDB. We never upload your originals. The only time photos leave your device is:
- When you **export** (downloads to your local drive)
- When you **share for review** (a 1000-px screen-quality version goes to our Storage so the client viewer can render it)

Originals are never sent over the network.

### Is the share link public?
The URL is unguessable (24 random characters). Only people you send the link to can view. You can revoke any share at any time from the ShareModal.

### Can I edit a book after sending the share?
Yes. Edit anything, then click **Generate share link** again. The new link reflects your latest edits. Old links keep working until you revoke them.

### Does my client need an account?
No. Anyone with the link views read-only — no signup, no login.

### How long are my projects kept?
Forever — until you delete them. Auto-save runs every few hundred milliseconds, stored locally in your browser. To move to another device, use **Backup / Restore** in the Projects modal.

### What happens when my trial ends?
You stay signed in. You keep your projects. You can still edit and use basic templates. You lose access to Wedding / Event / premium covers and have a slightly tighter feature set until you upgrade.

### Can I get a refund?
One-time payments are non-refundable but we'll fix anything that doesn't work. Email **support@autobookbynej.online** with what's broken.

### Do you offer studio / team accounts?
Not yet. If you'd buy one, email us — multiple-seat pricing is on the roadmap.

### Where's the privacy policy?
Photos never leave your browser unless you export or share. Auth uses Supabase. Payments use Paystack. Custom SMTP uses Resend. We don't sell or share any data with third parties. Detailed policy coming soon.

---

## Troubleshooting

| Problem | Most likely cause | Fix |
|---|---|---|
| Magic link not arriving | Spam folder, or rate limit hit (max 30/hr) | Check spam. Wait 5 min. Try password sign-in if you've set one. |
| "Sign-in session expired" when sharing | JWT timed out (default 1hr) | Sign out → sign back in. New session = fresh upload tokens. |
| Templates all locked | Trial ended OR not signed in | Sign in. Click any 🔒 template — it'll open the upgrade modal. |
| Photos won't upload | File too large (>50MB per photo) | Reduce photo dimensions before upload. Modern cameras produce 30MB+ files; AutoBook handles 50MB ceiling. |
| Share link shows blank black | Adblocker blocking Supabase | Open in incognito, or whitelist `*.supabase.co`. |
| Lost a project after clearing cache | IndexedDB was wiped | If you Downloaded a backup, Restore it. Otherwise, the project is gone — auto-save is local-only by design. |
| Editor freezes on huge libraries | Memory pressure from 200+ source photos in one project | Split into two projects, or remove unused photos via the Photos panel. |

If you hit something that isn't on this list, send a screenshot to **support@autobookbynej.online** with your browser version and what you were doing — we'll fix it fast.

---

## What's coming

We're shipping rapidly. On the immediate roadmap:

- **AI photo culling** — upload 500 photos, get the best 30 picked automatically
- **One-click order with a partner print shop** — finish the book, click "Order 3 copies", ship to client
- **Studio / team plan** — multi-seat licenses for studios with multiple shooters
- **Annual Pro Studio tier** — branded subdomains for client viewers, priority support
- **Smart cover taglines** — AI-suggested cover quotes from the book's tone

If there's a feature you want, email us. Most of what we ship comes from real photographer requests.

---

## Get in touch

- **Live app**: [autobookbynej.online](https://autobookbynej.online)
- **Support**: support@autobookbynej.online
- **GitHub** (open source bits & issues): [jerrinnah/photobook-designer](https://github.com/jerrinnah/photobook-designer)

Built with care by NEJ. Serving professional wedding and event photographers worldwide.
