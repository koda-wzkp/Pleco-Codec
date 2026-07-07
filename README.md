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

## Guide funnel (`/guide`)

The "Own Your Club" ebook funnel: a lead-capture landing page, a Vercel
serverless function, and a thank-you page. It's the only dynamic part of an
otherwise fully static site.

- **`src/pages/guide.astro`** — landing page. Pitch + 6-chapter list + one-field
  email form. Progressive-enhancement: the `<form>` natively POSTs to
  `/api/guide` (works with JS off, redirecting to `/guide/thanks`); with JS it
  submits via `fetch` and reveals an inline success panel. Includes an
  off-screen honeypot (`company`) as a spam guard.
- **`api/guide.js`** — Vercel Function (Node). Validates the email server-side,
  rejects honeypot hits, then uses **Resend** to (1) email the requester a link
  to `public/Own-Your-Club-ebook.pdf` and (2) notify Koda of the new lead
  (reply-to = the lead). No database — the lead list lives in the inbox. Vercel
  auto-detects the `api/` directory, so the site stays static.
- **`src/pages/guide/thanks.astro`** — confirmation + ungated direct download +
  warm CTA (`hello@pleco.dev`).

### Required env vars (set in Vercel → Project → Settings → Environment Variables)

| Variable | Purpose | Default if unset |
| --- | --- | --- |
| `RESEND_API_KEY` | Resend secret key. **Required** — no key, no email. | — (function returns a generic failure) |
| `GUIDE_FROM` | Verified Resend sender, e.g. `Pleco CODEC <guide@pleco.dev>`. The domain must be verified in Resend. | `Pleco CODEC <guide@pleco.dev>` |
| `LEAD_NOTIFY_TO` | Inbox that receives lead notifications. | `hello@pleco.dev` |
| `SITE_URL` | Public origin used to build the PDF link. | `https://codec.pleco.dev` |

The key lives only in Vercel env, never in the repo. After setting the vars,
**test end-to-end with a real address**: submit the form → confirm the guide
email arrives → confirm the lead notification lands in `LEAD_NOTIFY_TO`.

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

Vercel auto-detects Astro; no adapter needed. The site builds to static output
in `dist/`, and the `api/` directory is deployed as a serverless function
alongside it (see the guide funnel section for the env vars it needs). Assign
the `codec.pleco.dev` domain to this project in the Vercel dashboard.
