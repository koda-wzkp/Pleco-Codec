# codec.pleco.dev

Single-page marketing + open-source landing for CODEC. Built with [Astro](https://astro.build), deployed on Vercel at `codec.pleco.dev`.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # static build to dist/
npm run preview  # serve the build locally
```

## Brand assets

The P-mark and fish in `src/assets/brand/` are the **real** Pleco brand files,
copied from the `koda-wzkp/pleco-site` repo (`public/pleco-logo.svg` and
`public/pleco-fish.svg`) — the same `pleco-logo.svg` pleco.dev uses as its mark.
They're inlined once as reusable `<symbol>`s (`#pmark`, `#fish`) and referenced
via `<use>`, so the header mark renders identically to pleco.dev's. The mark's
"P" is IBM Plex Serif `<text>`; keep IBM Plex Serif loaded so it doesn't fall
back to Georgia. `public/favicon.svg` is a copy of the mark.

If the brand kit updates, re-copy those two files and run
`node scripts/generate-og.mjs` to refresh `public/og.png`.

## ⚠️ Before launch — required

1. **Make this repo public** (or point links at whatever repo is public).
   Every "Repo" / "Browse the source" / terminal `git clone` link points at
   `https://github.com/koda-wzkp/Pleco-Codec` (set once as `REPO_URL` in
   `src/pages/index.astro`). The page's open-source pitch cannot ship against a 404.

2. **Regenerate `public/og.png` in an environment where fonts load.** The
   committed OG image was generated in a sandbox with Google Fonts blocked, so
   its text is in the Georgia fallback rather than IBM Plex Serif. Re-run
   `node scripts/generate-og.mjs` locally (or on a machine with network access)
   before launch. The mark itself renders correctly either way.

## Design notes

- The visual/copy source of truth is the reference design (`codec-pleco-dev.html`).
- Dark-mode inversion is explicitly opted out (`color-scheme: light` meta + CSS)
  so in-app webviews don't auto-darken the cream sections.
- Scroll-reveal is fail-safe: content is fully visible by default; the hidden
  starting state only applies when an inline script confirms JS +
  IntersectionObserver + no `prefers-reduced-motion` (adds `.js` to `<html>`).
  Text never depends on JS to be readable.
- Fonts: IBM Plex Serif (display) / IBM Plex Sans (body) / IBM Plex Mono
  (eyebrows, terminal) via Google Fonts, `display=swap` — matching pleco.dev's
  type family (the reference's Fraunces/Inter/JetBrains Mono was swapped for the
  real pleco.dev faces per the build brief).

## Deploy

Vercel auto-detects Astro; no adapter needed (fully static output).
Assign the `codec.pleco.dev` domain to this project in the Vercel dashboard.
