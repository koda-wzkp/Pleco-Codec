# @pleco/club-host

One instance-configurable Haptera host site. The same app renders any club from a
`ClubInstance` config — pick the client with the `HAPTERA_INSTANCE` env var. This
is the integration layer around `packages/haptera`: it wires the webhook + waitlist
routes, renders the customer UI, and (next) the owner dashboard.

## How a client is defined

A client = **one object** in `src/instances/` (see `outer-heaven.ts`,
`sunset.ts`) registered in `src/instances/index.ts`. It carries the engine's
`HapteraInstanceConfig` (processor, program/tiers, launch mode, comms/owner,
scope) plus page copy. **No route or page code changes per client** — that's the
acceptance bar ("a new client launches from config alone").

- **Outer Heaven** (`outer-heaven`) — Square, `launch.mode: "billing"`; tier CTAs
  are hosted Square checkout links. Direct-to-billing.
- **Sunset** (`sunset`) — Square, `launch.mode: "waitlist"`; tier CTAs point at
  the on-page waitlist form. Flip the `launch` block to `billing` at go-live —
  that one edit is the whole waitlist→billing switchover, no rebuild.
- **Living Room** (`living-room`) — Stripe, `launch.mode: "billing"`; Table22
  migration. Members self-serve via the Stripe billing portal (see `/manage`).

## Routes

- `POST /api/webhooks/billing` — processor webhook. Verifies signature, dedupes
  on the provider's event id (idempotent — processors redeliver), maps to a
  `MemberEvent`, fans out to Resend (member email + owner notify). Processor-blind.
- `POST /api/waitlist` — waitlist capture. Honeypot drop, email validation,
  owner notification with tier/add-on interest.
- `/manage` — processor-blind member self-management. Member enters their email;
  the route calls `BillingProvider.manageUrl(email)` and redirects (Stripe billing
  portal / Square account page / mailto fallback). Never names a processor.

## Provisioning a client (one-time)

Run once with the client's processor credentials to create the plan and generate
the hosted checkout links, then paste the two outputs:

```sh
cp .env.example .env         # fill in the processor + Resend secrets
HAPTERA_INSTANCE=outer-heaven npm run provision --workspace @pleco/club-host
```

It prints (1) the `SQUARE_TIER_REFS` / `STRIPE_TIER_REFS` env line and (2) the
`checkoutUrls` block for the instance's `launch` config. Flip `launch.mode` to
`billing` and redeploy — that's the whole go-live. Processor-blind (only the env
var name differs by processor).

## Owner dashboard (`/owner`)

Gated by a shared passcode (`OWNER_PASSCODE`) — sign in at `/owner/login`; a
correct passcode sets an httpOnly `SameSite=Lax` cookie. The dashboard is a live
read over the processor (no datastore): active count, monthly-normalized **MRR**,
paused/canceled counts, a **30/60/90-day net-member trend**, a "needs attention"
list (paused + recently canceled), the member table, **CSV export**
(`/owner/members.csv`), and a **launch-mode** panel. It is processor-blind —
everything comes from `BillingProvider.listMembers()`.

- **Pickup reminder:** an owner action ("Send a pickup reminder" — date +
  optional details) that emails every active member via the core pickup template.
  Send it on the roast/fulfillment schedule. Flashes the sent count.
- **Launch toggle:** the panel shows the current mode and the one-line
  `src/instances/<id>.ts` edit that flips waitlist→billing (then redeploy). A
  self-serve in-dashboard button needs a persisted flag — see `FUTURE.md`.
- **CSRF note:** Astro's form-origin check is disabled (`astro.config.mjs`)
  because it blocks the legitimate login through the node adapter; the login has
  no CSRF exposure and the `/owner` cookie is `SameSite=Lax`. The JSON routes
  aren't covered by that check and carry their own protection.
- Auth is single-shared-passcode by design (one-owner shops). Per-person owner
  accounts / magic-link sign-in is a scoped follow-on.

## Run locally

```sh
cp .env.example .env          # fill in Square + Resend secrets
HAPTERA_INSTANCE=sunset npm run dev --workspace @pleco/club-host
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
`HAPTERA_INSTANCE` and secrets.

### Idempotency at scale
The webhook dedupe store is in-memory (`src/lib/idempotency.ts`) — correct for a
single long-lived server per club (launch tier). On serverless/multi-instance,
implement `IdempotencyStore` over a shared KV/DB; nothing else changes.
