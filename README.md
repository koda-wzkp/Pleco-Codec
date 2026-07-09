# Pleco CODEC

CODEC is an owned operations layer for hospitality businesses: it runs the
mechanisms a venue should own — club/subscription programs, waitlists,
a member market, member comms — on accounts the venue already controls.
The venue's payment processor (Square first, Stripe planned) is the source
of truth for members and billing; CODEC keeps no member database and no
passwords, and the code for each build lives in a repo the client owns.

## What's in this repo

- **Adapter architecture docs** — how CODEC binds to external providers:
  - [`docs/adapters/SPEC.md`](docs/adapters/SPEC.md) — the adapter
    contract: lifecycle, per-mechanism capabilities, error/retry
    semantics, TypeScript interfaces.
  - [`docs/adapters/square.md`](docs/adapters/square.md) — the Square
    reference mapping (Subscriptions, Customers, Catalog, Webhooks).
  - [`docs/adapters/TEMPLATE.md`](docs/adapters/TEMPLATE.md) —
    feasibility-gated template for proposing any future adapter.
- **[`AUDIT.md`](AUDIT.md)** — repo audit from the 2026-07-07
  architecture pass.
- **The codec.pleco.dev site** — an [Astro](https://astro.build) static
  site plus one Vercel serverless function (details below).

What's *not* here yet: the adapter/engine code itself. Adapters are built
one at a time, for real deployments, after the feasibility checklist in
the template is confirmed — the docs above are the contract that code will
implement, and it will be published under the same Apache-2.0 license as
it lands.

## Architecture principles

- **Processor as backend.** Members and billing live in the venue's own
  Square/Stripe account; identity is magic-link email auth against the
  processor's customer records. No CODEC-owned member store, ever. When a
  deployment needs richer perks/points/history, the escalation is a hosted
  database in the *client's* account — never a shared multi-tenant one.
- **Absorb vs. coexist.** CODEC absorbs owned mechanisms (clubs, queues,
  catalogs, comms). Discovery networks that drive customer acquisition
  (OpenTable, Resy, Tock in network mode) are coexisted with, not wrapped.
- **The money rail stays the processor's.** Checkout happens on
  processor-hosted pages; card data never touches CODEC.
- **Client ownership (Model A).** Every account — processor, hosting,
  repo — belongs to the client from day one; Pleco is a collaborator.

## Site development

```sh
npm install
npm run dev      # local dev server
npm run build    # static build to dist/
npm run preview  # serve the build locally
```

Brand assets in `src/assets/brand/` come from the Pleco brand kit
(`koda-wzkp/pleco-site`); the P-mark and fish are inlined as `<symbol>`s
and referenced with `<use>`. The mark's "P" is IBM Plex Serif text, so keep
the IBM Plex family loaded. If the kit updates, re-copy the files and run
`node scripts/generate-og.mjs` (needs network for fonts) to refresh
`public/og.png`.

### Guide funnel (`/guide`)

The one dynamic part of the site: a lead-capture page for the
"Own Your Club" ebook, a Vercel function, and a thank-you page.

- `src/pages/guide.astro` — landing page. The form natively POSTs to
  `/api/guide` (works without JS); with JS it submits via `fetch` and shows
  an inline success panel. An off-screen honeypot field guards spam.
- `api/guide.js` — Vercel Function. Validates the email, then uses
  [Resend](https://resend.com) to email the requester the PDF link and
  send an internal lead notification. Deliberately no database — leads
  live in the notification inbox.
- `src/pages/guide/thanks.astro` — confirmation + direct download.

Environment variables (Vercel → Project → Settings → Environment
Variables; the API key never lives in the repo):

| Variable | Purpose | Default if unset |
| --- | --- | --- |
| `RESEND_API_KEY` | Resend secret key — required; without it the function returns a generic failure | — |
| `GUIDE_FROM` | Verified Resend sender | `Pleco CODEC <guide@pleco.dev>` |
| `CONTACT_EMAIL` | Reply-to on the guide email and default notification inbox | `conor@pleco.dev` |
| `LEAD_NOTIFY_TO` | Inbox receiving lead notifications | `CONTACT_EMAIL` |
| `SITE_URL` | Public origin used to build the PDF link | `https://codec.pleco.dev` |

After changing these, test end-to-end with a real address: submit the
form, confirm the guide email arrives, confirm the notification lands.

### Deploy

Vercel auto-detects Astro; the site builds static to `dist/` and `api/` is
deployed as a serverless function alongside it. The `codec.pleco.dev`
domain is assigned in the Vercel dashboard. Design notes: the pages opt out
of dark-mode inversion (`color-scheme: light`), scroll-reveal is fail-safe
(content is visible without JS), and type is IBM Plex Serif/Sans/Mono via
Google Fonts.

## License

[Apache-2.0](LICENSE). You may use, modify, and deploy this — that's the
point: a CODEC build can be maintained by anyone the client hires, forever.
