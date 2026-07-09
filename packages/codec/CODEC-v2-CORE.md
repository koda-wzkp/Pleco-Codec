# CODEC v2 — Core Architecture Contract

The specification the engine implements. Source files cite it by section
(`// CODEC-v2-CORE spec §N`). This document is the contract; the code is the
implementation. Reconstructed to match what's built — keep them in sync.

Product line: CODEC builds membership/club programs that run on the **client's
own** payment processor. One-time build, open source, no platform cut, Pleco
never in the money path. The engine is a library (`pleco-codec`); a per-client
host app consumes it.

---

## §1 Scope

The engine provides: billing adapters, a normalized member-event model, a comms
layer, processor-blind UI components, and a per-client config type. It does NOT
provide a hosted platform, a members database, or anything that sits in the
money path.

## §2 Processor routing

A client uses the processor it already has, if that processor has real
subscription rails. Rule:

- Has Square (or wants Square) → **Square**.
- Toast / no-subscription POS, or already on Stripe → **Stripe**.
- **Exactly two adapters.** A third is built only when a client pays for it.
  (Toast has no subscription rails; Toast shops use Stripe.)

The processor is named in exactly one place per instance: `config.processor`.
Nothing downstream branches on it.

## §3 Data model

- `ClubProgram` — name, cadence (`weekly|monthly|quarterly`), tiers
  (`id/label/priceCents/description`), fulfillment (`pickup|ship`).
- `PlanRef` — `{ providerId, tierRefs: { [tierId]: providerRef } }`, returned by
  `createPlan`, carries the processor-side ids.
- `TierId` — stable string, e.g. `club-2`.

## §4 The `BillingProvider` interface

```
createPlan(program): Promise<PlanRef>
checkoutUrl(plan, tier): string | Promise<string>
manageUrl(memberEmail): Promise<string>
parseWebhook(req): Promise<MemberEvent | null>   // verify signature; null = irrelevant
webhookEventId(rawBody): string | null           // stable id for idempotent dedupe
listMembers(): Promise<MemberRecord[]>            // live owner read; no datastore
```

Rules:
- **Adapters normalize; nothing downstream ever branches on processor.**
- **Webhook handlers are idempotent.** Processors redeliver. Dedupe on
  `webhookEventId` before dispatch; `parseWebhook` itself does not dedupe.
- Every `MemberEvent` fans out to (a) a comms action and (b) an owner
  notification. That is the entire v1 "member system."

`MemberEvent = activated | paused | resumed | canceled | payment_failed`
(normalized across processors), each carrying the member email + timestamp.

`MemberRecord` (owner read): `customerId, email, tier, status
(active|paused|canceled|unknown), priceCents, createdAt, canceledAt`.

## §5 Square adapter

- REST API + `node:crypto`, zero deps.
- Webhook signature: `x-square-hmacsha256-signature` =
  base64(HMAC-SHA256(signatureKey, notificationUrl + rawBody)), timing-safe. Bad
  or missing signature throws.
- Manage: Square has no per-member portal URL; `manageUrl` returns a configured
  buyer-account page or a `mailto:` fallback.
- Every Square event-name string, status value, and field path carries a
  `// VERIFY:` comment. **Resolve all of them against the live Square docs +
  sandbox before the first client launch.** Do not trust memory or this spec for
  event strings.
- Dedupe id: Square `event_id`.

## §6 Square pickup constraint

Square catalog-item (order-template) subscriptions require shipping and are not
available for in-person pickup. Therefore:

- `fulfillment: "pickup"` → **static-price** membership: one `SUBSCRIPTION_PLAN`
  + one `SUBSCRIPTION_PLAN_VARIATION` per tier, single phase, STATIC price.
  Fulfillment (pickup night) is operational, not billed. Default for wine/bean
  clubs.
- `fulfillment: "ship"` → catalog-item subscription. Built when a client pays
  for shipped fulfillment; `createPlan` throws a clear error until then.

## §7 Stripe adapter

- REST API (form-encoded) + `node:crypto`, zero deps.
- Billing: one Product + one recurring Price per tier (`createPlan`). Cadence →
  `recurring.interval` (+ `interval_count` 3 for quarterly).
- Checkout: reusable Payment Link on the tier's recurring price.
- Manage: **Stripe customer portal** — pause/cancel/update-card, hosted. This is
  the feature that eliminates most member-support load; lead with it in Stripe
  proposals. Portal sessions are per-member and short-lived, so `manageUrl`
  resolves the customer by email and mints a fresh session at call time.
- Webhooks: signature `Stripe-Signature: t=…,v1=…` = HMAC-SHA256(secret,
  `t.rawBody`) with timestamp tolerance. Map:
  `customer.subscription.created → activated`,
  `…updated (pause_collection) → paused`, `…updated (active) → resumed`,
  `…deleted → canceled`, `invoice.payment_failed → payment_failed`.
  `checkout.session.completed` is ignored (avoids duplicate activation).
- Dedupe id: Stripe event `id`.
- **Table22 migration:** assume NO card portability. Migration = re-enrollment
  campaign (email the new signup link, one billing cycle of overlap, then sunset
  the Table22 listing). Budget for churn honestly. Accounting: Stripe →
  QuickBooks needs a named connector line-item in Toast-client proposals.

## §8 Processor-blind site layer

UI components (tiers, waitlist form, perks, manage link) render entirely from
props/content and link OUT to hosted checkout; they never touch card data (no
PCI) and never name a processor. **Acceptance grep:** the site layer contains
neither "square" nor "stripe". Stable `codec-*` classNames let client sites
style via their own tokens.

## §9 Comms

- Resend REST, zero deps. **Templates are core; copy is per-client** (every
  template is overridable per instance).
- Tone: member emails read like the venue, not like software.
- Fan-out per event:

  | event          | Resend action        | member email          | owner email |
  |----------------|----------------------|-----------------------|-------------|
  | activated      | add contact          | welcome + next steps  | new member  |
  | payment_failed | —                    | card-update nudge     | flag        |
  | canceled       | unsubscribe contact  | graceful goodbye      | notice      |
  | paused         | unsubscribe contact  | —                     | notice      |
  | resumed        | re-subscribe contact | —                     | notice      |

- Lifecycle emails: welcome, payment-failed nudge, graceful goodbye, waitlist→
  launch campaign, and **pickup/fulfillment reminder** (sent to active members on
  the fulfillment schedule).
- Waitlist capture: name + email + tier interest + optional add-on, idempotent
  contact upsert, owner notified with the interest note, honeypot spam guard.

## §10 `CodecInstanceConfig` (per-client instance spec)

The only thing a new client requires (plus brand tokens/copy). Fields:

1. `processor` — `square | stripe` (the §2 routing rule; the one place a
   processor is named).
2. `program` — tiers, prices, cadence, fulfillment.
3. `retentionRitual` — the ritual and its calendar (pickup night, tasting
   night…). Free text; it's the retention engine, written down.
4. `venueName` — used in comms copy + owner emails.
5. `launch` — launch mode + switchover. `waitlist` (anchor + planned switchover)
   or `billing` (per-tier hosted checkout URLs). **Flipping this value is the
   whole waitlist→billing switchover — a config change, not a rebuild.**
6. `ownerNotifyEmail` + `resendAudienceId`.
7. `scope` — what's included, care plan yes/no; if no care plan, a completed
   handoff doc (see `docs/HANDOFF-TEMPLATE.md`).

## §11 Ownership & portability

Everything runs on accounts the client owns: processor, Resend, domain, repo.
The processor dashboard is the system of record for members; the owner view is a
clean read layer over it (`listMembers`), never a parallel datastore. Member
list export to CSV is real. Apache-2.0; if Pleco disappeared, nothing stops.

## §12 Acceptance

- A new client launches from an instance spec alone — **no core changes.**
- Both `SquareProvider` and `StripeProvider` pass webhook → `MemberEvent` →
  comms.
- Customer can browse → join → pay → self-manage on both processors.
- Owner can see members + MRR (+ 30/60/90), handle a failed payment, export CSV,
  flip launch mode.
- **Grep:** no processor branching outside the adapter/config layer.
- Quality floor: responsive to 390px, ≥44px targets, visible focus,
  `prefers-reduced-motion`, `color-scheme: light`, text never gated on JS.
- The `// VERIFY:` API strings (Square + Stripe) are resolved against live
  sandboxes, and a $1-tier webhook→comms test is run with real credentials,
  before any client goes live.
