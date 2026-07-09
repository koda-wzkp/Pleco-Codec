# Square adapter — reference mapping

Status: reference adapter; the mapping below is running in live club
deployments
Date: 2026-07-07
Contract: implements [SPEC.md](./SPEC.md)

Square is Haptera's primary processor: the venue's own Square account is the
source of truth for members, billing, and catalog. This document maps each
Haptera mechanism to the specific Square API surfaces it rides on.

## Version assumptions

Square versions its API with a date-based `Square-Version` header. The
adapter pins one version per deployment and records it in its manifest
(`providerApiVersion`); it is bumped deliberately, never floated. This
document was written against Square's public API documentation as of
2026-07-07. Statements below marked **[verify]** are behaviors we have not
confirmed against a live account or that Square may have changed — check
them against the pinned version before relying on them; everything else
reflects either Square's documented behavior or what the live deployments
exercise daily.

## Credentials (Model A)

The deployment uses an access token issued from the **client's own** Square
Developer account, stored only in the deployment's hosting environment
(e.g. Vercel env vars). Pleco holds collaborator access, not ownership.
OAuth is unnecessary — there is no multi-tenant Haptera service to authorize
against, by design.

Required permission scopes at minimum: customers read/write, subscriptions
read/write, catalog and inventory read, orders/payments read for billing
events. `install()` verifies the token with a live read and fails if scopes
are narrower than the enabled mechanisms need.

## Mechanism mapping

| Haptera concept | Square surface |
| --- | --- |
| Club tier | **Catalog API**: `SUBSCRIPTION_PLAN` / `SUBSCRIPTION_PLAN_VARIATION` catalog objects |
| Membership | **Subscriptions API**: `Subscription` objects |
| Member | **Customers API**: `Customer` objects (magic-link identity) |
| Market item | **Catalog API**: `ITEM` / `ITEM_VARIATION`; counts via **Inventory API** |
| Waitlist entry | **Customers API**: customer group + custom attribute (no native primitive) |
| Comms audience | **Customers API** / customer groups (delivery is a separate comms provider) |
| Sync events | **Webhooks**: webhook subscriptions + signed event notifications |

### Club tiers ← Subscriptions API + Catalog API

A tier is a `SUBSCRIPTION_PLAN_VARIATION` in the venue's catalog: it
carries the name, price (integer minor units — matching the spec's `Money`),
and billing cadence. Tiers are authored in the client's Square account
(dashboard or a one-time setup script); the adapter's `listTiers()` reads
them from the Catalog API.

Checkout: the adapter produces a Square-hosted checkout link for a plan
variation via the **Checkout API** (payment links), so signup and card
entry happen entirely on Square's pages and Haptera never sees card data.
**[verify]** that payment links support the specific subscription-plan
checkout configuration a new deployment needs (the exact
`CreatePaymentLink` options for subscriptions have shifted across API
versions).

Deferred billing — the waitlist-promotion pattern (e.g. a wine bar's
founding-member list where billing starts only when the first pickup is
ready) — uses the Subscriptions API `start_date` on subscription creation:
the subscription exists immediately but the first charge waits. This is
exercised in live deployments.

Membership state and self-serve management map to Subscriptions API
operations: retrieve/search subscriptions for status (`ACTIVE`, `PAUSED`,
`CANCELED`, `DEACTIVATED`, plus pending states), `PauseSubscription`,
`ResumeSubscription`, `CancelSubscription`. Cancel takes effect at the end
of the paid period. **[verify]** pause semantics against the pinned
version — Square models pauses as subscription phases and the
effective-date rules have version-specific behavior.

Failed payments surface through Square's invoice/payment events (see
webhooks); the adapter maps them to `delinquent` membership status and a
`payment.failed` canonical event. Dunning (retry of failed charges) is
Square's behavior, not the adapter's — **[verify]** the retry schedule for
the pinned version rather than promising specifics to a client.

### Members ← Customers API (magic-link identity)

A Haptera member *is* a Square `Customer`. There is no Haptera user table.

Magic-link flow:

1. Member enters their email on the venue's site.
2. Haptera emails a signed, expiring one-time link (token signing is core's
   job, per SPEC §3.1; nothing is stored server-side).
3. On click, the adapter resolves the email via Customers API
   `SearchCustomers` with an exact email filter → `MemberRef` wrapping the
   Square customer id.
4. Membership state is then read live from the Subscriptions API.

Notes:
- Email is the join key, so the deployment must treat the Square customer
  email as canonical. Duplicate customers with the same email are a known
  Square data condition; the adapter resolves to the customer holding an
  active subscription, else the most recently updated, and logs the
  ambiguity.
- No passwords, no password resets, no member PII persisted by Haptera. The
  ephemeral cache holds provider ids and display data only, rebuildable
  from Square at any time.

### Market items ← Catalog API (+ Inventory API)

`listItems()` reads the configured catalog category's `ITEM` /
`ITEM_VARIATION` objects: name, description, price, and image references.
Availability can additionally consult the Inventory API for on-hand counts
where the venue tracks them. The catalog is authored in Square's dashboard
— the adapter is read-only toward the catalog (SPEC §3.3's recommended
posture), so the venue's existing POS workflow stays untouched.

### Waitlist ← customer groups + custom attributes

Square has no waitlist primitive. The adapter models an entry as a Square
`Customer` placed in a dedicated customer group, with a joined-at custom
attribute. This keeps even the waitlist inside the client's own Square
account — no side database. `promote()` issues a club checkout for that
customer with a deferred `start_date`.

If a deployment outgrows this (position management, notify-on-open), the
escalation is a client-owned hosted DB per SPEC ground rule 2.

### Comms ← audience only

The Square adapter implements only the audience side of comms:
`resolveAudience()` enumerates customers by segment (all active members, a
tier, the waitlist group) from the Customers API. Delivery goes through a
separate comms adapter (an email provider in the client's account — the
live deployments use Resend). Square's own marketing/messaging products
have no public API suitable for this — **[verify]** if that changes; until
then the Square manifest declares `comms` as `partial` (audience only).

### Webhooks → sync events

The adapter registers a webhook subscription in the client's Square account
pointing at the deployment's webhook URL, listening for at least:

- `subscription.created` / `subscription.updated` → membership lifecycle
  events (`membership.started`, `.paused`, `.canceled`)
- `customer.created` / `customer.updated` / `customer.deleted` →
  `member.updated`
- `catalog.version.updated` → `catalog.changed`
- `invoice.payment_made` and payment/invoice failure events →
  `payment.failed` and delinquency **[verify]** the exact event names for
  subscription billing failures in the pinned version

Handling per SPEC §2.5, with Square specifics:

- **Signature**: every notification carries an HMAC-SHA256 signature header
  computed over the notification URL + raw body with the subscription's
  signature key. Verify before parsing; reject otherwise.
- **Dedupe**: Square delivers at-least-once with retries; the event id
  becomes the canonical event's dedupe key (`square:<event_id>`).
- **Coarseness**: `catalog.version.updated` announces *that* the catalog
  changed, not what changed — the adapter responds with a catalog re-sync
  rather than a targeted update.
- **Reconciliation**: scheduled full re-reads of subscriptions and catalog
  remain the correctness backstop regardless of webhook health.

## Errors, retries, rate limits

Square maps cleanly onto the SPEC §4.1 taxonomy: `UNAUTHORIZED` → `auth`,
`FORBIDDEN` → `permission`, 400-class validation → `invalid_request`,
`RATE_LIMITED`/429 → `rate_limited`, 5xx/timeouts →
`provider_unavailable`. Square does not publish fixed numeric rate limits;
the adapter treats 429 + backoff as the contract. Subscription and checkout
creation calls take an `idempotency_key`, which the adapter always sends
(SPEC §4.2), derived from the Haptera-side intent so a retry can't
double-enroll a member.

## Known limits and open items

- Checkout-link subscription options and pause-phase semantics are the two
  **[verify]**-flagged surfaces most likely to shift between Square
  versions; re-confirm both when bumping `Square-Version`.
- Duplicate-email customers require the resolution rule above; there is no
  Square-side uniqueness guarantee.
- Catalog webhook coarseness makes catalog sync O(catalog) per change —
  fine at venue scale, worth knowing.
- Refunds and one-off (non-subscription) market purchases are handled in
  Square's own dashboard/POS today; the adapter observes them at most via
  payment events and takes no action.
