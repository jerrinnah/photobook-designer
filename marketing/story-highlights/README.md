# Instagram Story Highlights — @autobookbynej

17 on-brand frames sized for Instagram (1080×1920 SVG). Black background, white type — matches the AutoBook logo.

## Folder map

```
covers/                          → round highlight thumbnails (5)
  cover-01-start-here.svg
  cover-02-demo.svg
  cover-03-features.svg
  cover-04-pricing.svg
  cover-05-reviews.svg

start-here/                      → 3 frames
  start-01-meet.svg              Meet AutoBook (hero)
  start-02-what.svg              3-step "what it is"
  start-03-who.svg               Who it's for + audience chips

demo/                            → 2 frames
  demo-01-watch.svg              5:00 stat (was 5 hours)
  demo-02-cta.svg                Try-it CTA

features/                        → 4 frames
  feat-01-intro.svg              Intro card
  feat-02-design-all.svg         Design All
  feat-03-reshuffle.svg          Reshuffle
  feat-04-client-proofing.svg    Client Proofing

pricing/                         → 2 frames
  price-01-no-subs.svg           No subs / no renewals
  price-02-pay-once.svg          Pay once. Own forever.

reviews/                         → 1 frame (placeholder)
  reviews-01-placeholder.svg     "Your album could be here"
```

## Export SVG → PNG/JPG (one of these)

**macOS Preview** — open SVG → File → Export → PDF → re-open → Export as PNG.

**Figma** (recommended) — drag the `story-highlights/` folder into a new file. Each SVG imports as a 1080×1920 frame. Select frame → Export → PNG 1x. Batch-export all in one shot.

**CLI (one-liner if you have `rsvg-convert`)**:
```bash
brew install librsvg
find /Users/nejstudios/Documents/AppDesign/photobook-designer/marketing/story-highlights \
  -name "*.svg" -exec sh -c 'rsvg-convert -w 1080 -h 1920 "$1" -o "${1%.svg}.png"' _ {} \;
```

## Upload order (in Instagram app)

For each highlight, post the content frames to Story first (in the order below), then create the highlight from your Archive and set the cover.

| Highlight | Cover | Frames (in order) |
|---|---|---|
| Start Here | `cover-01-start-here.svg` | start-01 → start-02 → start-03 |
| Demo | `cover-02-demo.svg` | demo-01 → demo-02 |
| Features | `cover-03-features.svg` | feat-01 → feat-02 → feat-03 → feat-04 |
| Pricing | `cover-04-pricing.svg` | price-01 → price-02 |
| Reviews | `cover-05-reviews.svg` | reviews-01 (replace as customers feature) |

## Notes

- Type uses the system sans (`-apple-system, SF Pro Display, Helvetica Neue`). To lock the look across devices, open in Figma and convert text to outlines before exporting.
- Covers are designed so the centered content survives Instagram's round highlight crop.
- Stories reserve ~250px top/bottom for the profile chip and reply bar — text stays inside the safe zone.
- Reviews highlight currently shows the invitation/placeholder. Replace with real customer features as they come in (book photo + 1-line quote + handle).
