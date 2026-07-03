# codec.pleco.dev

Single-page marketing + open-source landing for CODEC. Built with [Astro](https://astro.build), deployed on Vercel at `codec.pleco.dev`.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # static build to dist/
npm run preview  # serve the build locally
```

## ⚠️ Before launch — required

1. **Replace the placeholder brand SVGs with the real brand kit files.**
   The two files in `src/assets/brand/` are placeholders reconstructed from the
   design reference and are known to render the P-mark incorrectly:
   - `src/assets/brand/logo-teal-square.svg` → replace with the real
     `logo-teal-square.svg` from `/pleco_brand/` (boxed P mark: teal box, cream P, ray mask)
   - `src/assets/brand/pleco-fish.svg` → replace with the real fish silhouette
     asset (keep the `<path>` without a `fill` attribute so page CSS can color it;
     if the brand file hardcodes a fill, strip it)
   - Also update `public/favicon.svg` (copy of the mark) and regenerate the OG image.
   - Verify the rendered mark matches the pleco.dev header before shipping.

2. **Make this repo public** (or point links at whatever repo is public).
   Every "Repo" / "Browse the source" / terminal `git clone` link points at
   `https://github.com/koda-wzkp/pleco-codec` (set once as `REPO_URL` in
   `src/pages/index.astro`). The page's open-source pitch cannot ship against a 404.

3. **Regenerate the OG image** after the real mark lands:
   ```sh
   node scripts/generate-og.mjs   # writes public/og.png (1200×630, static)
   ```

## Design notes

- The visual/copy source of truth is the reference design (`codec-pleco-dev.html`).
- Dark-mode inversion is explicitly opted out (`color-scheme: light` meta + CSS)
  so in-app webviews don't auto-darken the cream sections.
- Scroll-reveal is fail-safe: content is fully visible by default; the hidden
  starting state only applies when an inline script confirms JS +
  IntersectionObserver + no `prefers-reduced-motion` (adds `.js` to `<html>`).
  Text never depends on JS to be readable.
- Fonts: Fraunces (display) / Inter (body) / JetBrains Mono (eyebrows, terminal)
  via Google Fonts, `display=swap`.

## Deploy

Vercel auto-detects Astro; no adapter needed (fully static output).
Assign the `codec.pleco.dev` domain to this project in the Vercel dashboard.
