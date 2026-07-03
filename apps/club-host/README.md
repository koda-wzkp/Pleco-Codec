# @pleco/club-host

One instance-configurable CODEC host site. The same app renders any club from a
`ClubInstance` config — pick the client with the `CODEC_INSTANCE` env var. This
is the integration layer around `packages/codec`: it wires the webhook + waitlist
routes, renders the customer UI, and (next) the owner dashboard.

## How a client is defined

A client = **one object** in `src/instances/` (see `outer-heaven.ts`,
`sunset.ts`) registered in `src/instances/index.ts`. It carries the engine's
`CodecInstanceConfig` (processor, program/tiers, launch mode, comms/owner,
scope) plus page copy. **No route or page code changes per client** — that's the
acceptance bar ("a new client launches from config alone").

- **Outer Heaven** — `launch.mode: "billing"`; tier CTAs are hosted Square
  checkout links. Direct-to-billing.
- **Sunset** — `launch.mode: "waitlist"`; tier CTAs point at the on-page
  waitlist form. Flip the `launch` block to `billing` at go-live — that one edit
  is the whole waitlist→billing switchover, no rebuild.

## Routes

- `POST /api/webhooks/billing` — processor webhook. Verifies signature, dedupes
  on the provider's event id (idempotent — processors redeliver), maps to a
  `MemberEvent`, fans out to Resend (member email + owner notify). Processor-blind.
- `POST /api/waitlist` — waitlist capture. Honeypot drop, email validation,
  owner notification with tier/add-on interest.

## Run locally

```sh
cp .env.example .env          # fill in Square + Resend secrets
CODEC_INSTANCE=sunset npm run dev --workspace @pleco/club-host
npm test --workspace @pleco/club-host   # webhook→event→comms integration tests
```

The page renders without any secrets (it only reads instance config); the routes
need Square/Resend env to do real work.

## Quality floor

`src/styles/app.css` + `src/layouts/Base.astro`: `color-scheme: light` (no
webview force-darkening), responsive to 390px, ≥44px tap targets, visible
keyboard focus, `prefers-reduced-motion` respected. Page content is
server-rendered HTML — nothing text-critical depends on JS (the waitlist form is
the only island, and its markup is server-rendered too).

## Deploy

Local/standalone uses the `@astrojs/node` adapter. For Vercel, swap to
`@astrojs/vercel` in `astro.config.mjs` (one line) and set the project's Root
Directory to `apps/club-host`. One Vercel project per client, each with its own
`CODEC_INSTANCE` and secrets.

### Idempotency at scale
The webhook dedupe store is in-memory (`src/lib/idempotency.ts`) — correct for a
single long-lived server per club (launch tier). On serverless/multi-instance,
implement `IdempotencyStore` over a shared KV/DB; nothing else changes.
