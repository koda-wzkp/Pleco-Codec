# Pleco Haptera — monorepo

Haptera is an owned operations layer for hospitality businesses: it runs the
mechanisms a venue should own — club/subscription programs, waitlists,
member comms — on accounts the venue already controls. Billing runs on the
**client's own** Square or Stripe; signup lives on the client's own site;
the client owns the code and the member list. No platform cut, no
per-member fee. Haptera keeps no member database and no passwords. Core is
Apache-2.0.

> Formerly CODEC. Renamed to Haptera in July 2026; same project, same
> license, same scope.

## Layout

```
packages/
  haptera/          The engine (npm package `pleco-haptera`). Billing adapters
                  (Square + Stripe), Resend comms, and processor-blind
                  React site components. Zero runtime deps; React optional peer.
apps/
  marketing/      haptera.pleco.dev — the marketing + OSS landing site (Astro),
                  including the /guide lead-capture funnel.
  club-host/      Instance-configurable host app for client clubs.
docs/
  adapters/       The adapter contract the engine implements:
                  SPEC.md (lifecycle, capabilities, error/retry semantics),
                  square.md (Square reference mapping), TEMPLATE.md
                  (feasibility-gated template for future adapters).
AUDIT.md          Repo audit from the 2026-07-07 architecture pass.
FUTURE.md         Deferred / out-of-scope features (the parking lot).
```

## Architecture principles

- **Processor as backend.** Members and billing live in the venue's own
  Square/Stripe account; identity is magic-link email auth against the
  processor's customer records. No Haptera-owned member store, ever. When a
  deployment needs richer perks/points/history, the escalation is a hosted
  database in the *client's* account — never a shared multi-tenant one.
- **Absorb vs. coexist.** Haptera absorbs owned mechanisms (clubs, queues,
  catalogs, comms). Discovery networks that drive customer acquisition
  (OpenTable, Resy, Tock in network mode) are coexisted with, not wrapped.
- **The money rail stays the processor's.** Checkout happens on
  processor-hosted pages; card data never touches Haptera.
- **Client ownership (Model A).** Every account — processor, hosting,
  repo — belongs to the client from day one; Pleco is a collaborator.

## Development

npm workspaces tie it together. From the repo root:

```sh
npm install                 # install all workspaces
npm test                    # run every workspace's tests
npm run build               # build every workspace
npm run build --workspace apps/marketing
npm test  --workspace packages/haptera
```

## Product context

The feature set is defined by three real clients:
- **Sunset Wine and Tapas** (Carrabelle FL) — pickup wine club, pre-open;
  founding-member **waitlist that converts to billing** at launch. Square.
- **Outer Heaven Espresso** (Nevada City CA) — operating shop, pickup bean club,
  **direct-to-billing** now. Square.
- **Living Room Wines** (Portland OR) — operating wine bar, migrating a club
  **off Table22**; self-serve member management is the value. Stripe.

## Marketing site (`apps/marketing`)

Brand assets in `apps/marketing/src/assets/brand/` come from the Pleco brand
kit (`koda-wzkp/pleco-site`); the P-mark and fish are inlined as `<symbol>`s
and referenced with `<use>`. The mark's "P" is IBM Plex Serif text, so keep
the IBM Plex family loaded. If the kit updates, re-copy the files and run
`node scripts/generate-og.mjs` (needs network for fonts) from
`apps/marketing/` to refresh `public/og.png`.

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
| `GUIDE_FROM` | Verified Resend sender | `Pleco Haptera <guide@pleco.dev>` |
| `CONTACT_EMAIL` | Reply-to on the guide email and default notification inbox | `conor@pleco.dev` |
| `LEAD_NOTIFY_TO` | Inbox receiving lead notifications | `CONTACT_EMAIL` |
| `SITE_URL` | Public origin used to build the PDF link | `https://haptera.pleco.dev` |

After changing these, test end-to-end with a real address: submit the
form, confirm the guide email arrives, confirm the notification lands.

## ⚠️ Deploy notes

- **Marketing site (`apps/marketing`):** moved from the repo root. Its Vercel
  project's **Root Directory must be set to `apps/marketing`** (Vercel → Project
  → Settings → Build & Deployment → Root Directory), or the production build of
  haptera.pleco.dev breaks on the first deploy after this merges. `vercel.json`
  and the `api/` function directory travel with the app. The `haptera.pleco.dev`
  domain is assigned in the Vercel dashboard.
- **Client host (`apps/club-host`):** one Vercel project **per client**, each
  with Root Directory `apps/club-host`, its own `HAPTERA_INSTANCE`, and its own
  secrets. Swap the `@astrojs/node` adapter for `@astrojs/vercel` in
  `apps/club-host/astro.config.mjs` (one line) before deploying.

Design notes: the marketing pages opt out of dark-mode inversion
(`color-scheme: light`), scroll-reveal is fail-safe (content is visible
without JS), and type is IBM Plex Serif/Sans/Mono via Google Fonts.

## Status

**Phase 1 — built and green (all three clients representable by config).**
- `packages/haptera` — engine: **Square + Stripe adapters both implemented**,
  Resend comms (all lifecycle emails incl. pickup reminder), processor-blind site
  components, `listMembers` + `webhookEventId` on the interface.
- `apps/club-host` — instance-configurable host: **Outer Heaven** (Square, direct
  billing), **Sunset** (Square, waitlist→billing), **Living Room** (Stripe,
  Table22 migration) as config; webhook + waitlist routes; processor-blind
  `/manage` self-serve; customer UI; owner dashboard (members, MRR, 30/60/90,
  CSV, launch panel).
- Out of scope parked in `FUTURE.md`. Before client launch: resolve the
  `// VERIFY:` API strings (Square + Stripe) against live sandboxes, and run the
  $1-tier webhook→comms test with real credentials (documented in the app README).

## License

[Apache-2.0](LICENSE). You may use, modify, and deploy this — that's the
point: a Haptera build can be maintained by anyone the client hires, forever.
