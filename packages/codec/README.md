# pleco-codec

**CODEC v2 core — membership programs on client-owned rails.**

CODEC turns a venue's regulars into members: recurring billing on the **client's own payment processor**, signup on the **client's own domain**, member list in the **client's own accounts**. One-time build. No platform cut. The bespoke layer is program design (tiers, pricing, the retention ritual — pickup night, tasting night, game night); this code layer is deliberately boring and reusable.

Anti-goals: CODEC is not a SaaS, not a hosted platform, not a marketplace. **Pleco never sits in the money path.**

- License: **Apache-2.0** (see `LICENSE`). Deliberately a separate repo and identity from Promise Pipeline (AGPL-3.0).
- Zero runtime dependencies — global `fetch` + `node:crypto` only. `react` is an optional peer dependency used only by `pleco-codec/site`.
- Node >= 20, ES modules, TypeScript strict.

## Processor routing rule

> The club runs on the client's existing processor **if it has real subscription rails; otherwise Stripe.**

| Client POS | Club billing | Why |
|---|---|---|
| Square | **Square** | Native subscription plans + payment links + webhooks; money lands where it already lands; Square→QuickBooks native |
| Toast | **Stripe** | Toast has no public subscription rails (partner-gated). Stripe Billing + customer portal is the most complete subscription stack available |
| None / other | **Stripe** | Default |

Hard limit: **two adapters.** A third gets built when a client pays for it, not before.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│ SITE LAYER (Next.js, client's domain) — processor-blind│
│  TierPanels · PerksList · Signup CTA · Waitlist form   │
│  renders from content + tokens; links OUT to hosted    │
│  checkout. Never touches card data. No PCI.            │
│                    pleco-codec/site                    │
├────────────────────────────────────────────────────────┤
│ BILLING ADAPTER  (SquareProvider | StripeProvider)     │
│  create plan · checkout URL · manage URL · webhooks →  │
│  normalized MemberEvents      pleco-codec/billing      │
├────────────────────────────────────────────────────────┤
│ COMMS (Resend)                pleco-codec/comms        │
│  welcome · payment-failed nudge · goodbye ·            │
│  waitlist→launch campaign · owner notifications        │
├────────────────────────────────────────────────────────┤
│ MEMBER STATE (v1: none)                                │
│  processor dashboard IS the member list; Resend        │
│  audiences carry comms. A datastore ships with the     │
│  portal tier, when someone pays for it.                │
└────────────────────────────────────────────────────────┘
```

Rules:
- Adapters normalize; **nothing downstream ever branches on processor**.
- Webhook handlers are idempotent (processors redeliver) — dedupe on the provider event id (`webhookEventId()` for Square).
- Every `MemberEvent` fans out to (a) a Resend action and (b) a notification email to the owner. That is the entire v1 "member system."

## Install

```bash
npm install pleco-codec
# react is only needed if you use pleco-codec/site
```

## Usage

### 1. Instantiate the billing provider (server-side only)

```ts
import { SquareProvider } from "pleco-codec/billing";

const billing = new SquareProvider({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  locationId: process.env.SQUARE_LOCATION_ID!,
  webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
  webhookNotificationUrl: "https://venue.example/api/webhooks/billing",
  environment: "production", // or "sandbox"
  redirectUrl: "https://venue.example/welcome",
  ownerEmail: "owner@venue.example",       // manageUrl mailto fallback
  // manageFallbackUrl: "https://venue.example/membership",
});
```

### 2. Create the plan (once, at setup — or by hand in the Square Dashboard)

```ts
import type { ClubProgram } from "pleco-codec/billing";

const program: ClubProgram = {
  name: "The Sunset Wine Club",
  cadence: "monthly",
  fulfillment: "pickup", // static-price membership — see "pickup constraint"
  tiers: [
    { id: "club-2", label: "Club 2", priceCents: 4000, description: "2 bottles/month + member perks" },
    { id: "club-4", label: "Club 4", priceCents: 6500, description: "4 bottles/month + member perks" },
  ],
};

const plan = await billing.createPlan(program);
// plan = { providerId: "...", tierRefs: { "club-2": "VARIATION_ID", ... } }

const checkoutUrls = {
  "club-2": await billing.checkoutUrl(plan, "club-2"),
  "club-4": await billing.checkoutUrl(plan, "club-4"),
};
```

**The pickup constraint (Square):** catalog-item (order-template) subscriptions require shipping. `fulfillment: "pickup"` → static-price membership (the default for wine clubs; the pickup ritual is the retention engine). `fulfillment: "ship"` → not implemented; built when a client pays for shipping fulfillment.

### 3. Wire the webhook route (Next.js App Router)

```ts
// app/api/webhooks/billing/route.ts
import { billing, comms } from "@/lib/codec"; // your instances

export async function POST(req: Request) {
  const event = await billing.parseWebhook(req); // throws on bad signature
  if (event) await comms.dispatchMemberEvent(event);
  return new Response("ok");
}
```

Add dedupe for production (processors redeliver): read the raw body first, check `webhookEventId(rawBody)` against a seen-set, then pass a reconstructed `Request` on.

### 4. Comms

```ts
import { ResendComms } from "pleco-codec/comms";

const comms = new ResendComms({
  apiKey: process.env.RESEND_API_KEY!,
  audienceId: process.env.RESEND_AUDIENCE_ID!,
  from: "Sunset Wine Club <club@venue.example>",
  ownerEmail: process.env.WAITLIST_NOTIFY_EMAIL!,
  venueName: "Sunset Wine and Tapas",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  manageUrl: await billing.manageUrl(""), // or a static instance value
  welcomeNextStep: "First pickup night is the first Thursday after opening — we'll email details.",
  // templates: { welcome: (ctx) => ({ subject, html, text }) }  ← per-client copy overrides
});

// Waitlist route (pre-launch):
await comms.handleWaitlistSignup({ email, firstName, note: "Club 4, reserve add-on" });

// Launch day — "billing starts {date}, here's your link":
await comms.waitlistLaunchCampaign({
  billingStartsOn: "September 1, 2026",
  checkoutUrlFor: () => checkoutUrls["club-2"], // or per-contact
});
```

Tone rule: member emails read like the venue, not like software. **Copy is per-client, templates are core** — override any template via `templates`.

### 5. Site layer (processor-blind React)

```tsx
import { TierPanels, PerksList, WaitlistForm, ManageLink } from "pleco-codec/site";

// Pre-launch (waitlist): tier CTAs anchor to the form.
<TierPanels program={program} launch={{ mode: "waitlist", anchor: "#wine-club" }} />

// Post-launch: flip ONE config value — CTAs become hosted checkout links.
<TierPanels program={program} launch={{ mode: "billing", checkoutUrls }} />

<PerksList perks={content.perks} glyph={() => <SpotGlyph />} />

<WaitlistForm
  action="/api/waitlist"
  tierOptions={[
    { id: "club-2", label: "Club 2 ($40/mo)" },
    { id: "club-4", label: "Club 4 ($65/mo)" },
  ]}
  addOnLabel="Interested in the Reserve add-on"
  successCopy="You're on the list. We'll email you when pickups begin — no charge until then."
  errorCopy="Something went wrong on our end — try again, or email us at hello@venue.example."
/>

<ManageLink href={manageUrl} />
```

Components are unstyled semantic markup with stable classNames (`codec-tier-panels`, `codec-tier-panel`, `codec-perks-list`, `codec-waitlist-form`, `codec-manage-link`, …) — client sites style them via their own tokens. The `src/site` directory contains **no processor names**; a test enforces it.

### Per-client instance config

`pleco-codec/config` exports `CodecInstanceConfig` — the shape of a per-client instance spec (spec §10): processor choice, `ClubProgram`, retention ritual + calendar, launch mode + switchover, owner notify address + Resend audience, scope/care-plan flags. A new client instance requires **only** an instance spec — no core changes.

## Environment / configuration

| Value | Used by |
|---|---|
| `SQUARE_ACCESS_TOKEN` | SquareProvider |
| `SQUARE_LOCATION_ID` | SquareProvider |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | SquareProvider (webhook verification) |
| webhook notification URL | SquareProvider — must EXACTLY match the URL configured in the Square webhook subscription (Square signs `url + body`) |
| `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` | ResendComms |
| `WAITLIST_NOTIFY_EMAIL` | ResendComms `ownerEmail` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | copy / reply-to |

## VERIFY before first client launch

Spec §5 is explicit: **do not trust memory or the spec for event strings.** Every such assumption in the code carries a `// VERIFY:` comment (`grep -rn "VERIFY" src/`). Resolve all of these against current Square docs before the first client launch:

1. **Webhook event names**: `subscription.created`, `subscription.updated`, `invoice.scheduled_charge_failed` (and whether `invoice.payment_failed` exists) — check the current Square webhooks reference.
2. **Subscription status values**: `PENDING | ACTIVE | PAUSED | CANCELED | DEACTIVATED` and which map to pause/resume/cancel.
3. **Catalog phase pricing shape**: `pricing: { type: "STATIC", price_money }` vs older `recurring_price_money` for the pinned `Square-Version`.
4. **SubscriptionCadence enum**: `WEEKLY` / `MONTHLY` / `QUARTERLY` values.
5. **CreatePaymentLink**: `checkout_options.subscription_plan_id` field name, whether it takes the plan **variation** id, and how `quick_pay.price_money` interacts with plan pricing.
6. **Buyer self-serve surface**: what Square buyers can do from their account (card update? pause?). If pause isn't self-serve, `manageUrl`'s mailto/fallback route is the supported path — say so in the client handoff doc.
7. **Square API version pin** (`SQUARE_VERSION` in `src/billing/square.ts`).
8. `plan_variation_id` field name on subscription webhook payloads.

## Acceptance checklist (core, spec §12)

- [ ] A new client instance requires only an instance spec — no core changes
- [ ] `grep`-ing the site layer for "square" or "stripe" returns only the config file (enforced by `test/site-blind.test.ts`)
- [ ] Webhook → MemberEvent → Resend path tested end-to-end with a real $1 test tier, then refunded/canceled and removed
- [ ] Waitlist→billing switchover exercised in staging (flip config, tier CTAs become checkout links)
- [ ] All VERIFY items above resolved against current Square docs before first client launch
- [ ] Client handoff doc template exists (`docs/HANDOFF-TEMPLATE.md`): accounts owned, how to change prices, how to pause a member, what the care plan covers

## StripeProvider status

Stub, by design (spec §7): built at the first Toast/no-POS sale. Every method throws `NotImplementedError` describing the intended mechanics (Products + Prices, Checkout/Payment Links, customer portal for manage, `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` / `invoice.payment_failed` webhooks). See `src/billing/stripe.ts` for the Table22 migration note (assume no card portability; migration is a re-enrollment campaign).

## v1 non-goals

Member database, login/portal, perk-redemption tracking at POS, gift memberships, proration/tier-switching UI, analytics dashboard. The portal tier introduces the datastore; nothing in v1 may quietly assume one.

## Development

```bash
npm install
npm run build   # tsc → dist/
npm test        # builds, compiles tests, runs node --test (zero test deps)
```

## License

Apache-2.0 — see `LICENSE`. This repo is intentionally a separate identity from Promise Pipeline (AGPL-3.0); keep it that way.
