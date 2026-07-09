# Haptera adapter specification

Status: v0.1 draft
Date: 2026-07-07
Reference implementation: [Square](./square.md) · New adapters start from the [template](./TEMPLATE.md)

Haptera is an owned operations layer for hospitality businesses: it runs the
mechanisms a venue should own — club/subscription, waitlist, market
(catalog/online ordering), member comms — on accounts the venue already
controls. An **adapter** is the piece that binds one external provider
(a payment processor, a comms service) to Haptera's canonical model.

## 1. Ground rules

These are constraints every adapter must satisfy, not preferences:

1. **The provider is the source of truth.** For members and billing, that
   is the venue's payment processor (Square primary, Stripe secondary).
   Haptera and Pleco own no member database and no password store. An adapter
   reads from and writes to the provider; it never becomes a second copy of
   record. Any caching is ephemeral and rebuildable from the provider.
2. **Escalation path.** If a deployment needs rich perks, points, or
   history the processor cannot model, the escalation is a hosted database
   in the *client's own* account (e.g. Supabase or Neon under the client's
   billing). Never a shared multi-tenant store under Pleco's control.
3. **The money rail is never absorbed.** Adapters initiate billing through
   provider-hosted checkout and provider subscription objects. Card data
   never touches Haptera.
4. **Absorb vs. coexist.** Adapters exist only for mechanisms Haptera
   *absorbs*: queues, catalogs, clubs, comms. Discovery networks that drive
   customer acquisition (OpenTable, Resy, Tock operating in network mode)
   are *coexisted with* — never wrapped, proxied, or hidden behind Haptera.
   Write access to reservation networks is partner-gated and **unverified**;
   no adapter may be specced against it until access is confirmed in
   writing.
5. **One adapter at a time.** An adapter is built only when a paying client
   needs it and only after the feasibility checklist in
   [TEMPLATE.md](./TEMPLATE.md) is fully confirmed.
6. **Model A ownership.** All provider credentials, developer-app
   registrations, and hosting accounts belong to the client; Pleco is a
   collaborator on them. Adapters must be configurable purely from the
   client's own credentials.

## 2. Adapter lifecycle

Every adapter implements six stages. Stages 2–6 are code; stage 1 is
paperwork that gates the code.

### 2.1 Feasibility (before any code)

Complete the feasibility checklist in [TEMPLATE.md](./TEMPLATE.md): API
access model, write permissions per mechanism, webhook availability, rate
limits, and terms-of-service posture toward intermediaries. An adapter
whose checklist is not fully confirmed does not get past this stage.

### 2.2 Install

Establish a working, verified connection using credentials from the
client's own provider account.

- MUST verify credentials with a real read call (not just accept them).
- MUST register any webhook subscriptions the adapter needs and record the
  provider's signature secret for later verification.
- MUST report what it detected: provider account identity, granted
  permissions/scopes, API version in effect.
- MUST fail loudly if granted permissions are narrower than the mechanisms
  the deployment enables.

### 2.3 Configure

Bind Haptera mechanisms to concrete provider objects — e.g. "club tier
*Founding Member* is provider subscription plan `X`", "the market shows
provider catalog category `Y`".

- Configuration MUST be declarative (a checked-in config file per
  deployment), so a deployment can be rebuilt from the repo plus the
  client's credentials.
- The adapter MUST validate configuration against the live provider
  account (referenced objects exist, are active, are billable) and reject
  configs that don't resolve.

### 2.4 Sync

Keep Haptera's ephemeral view consistent with the provider.

- **Initial sync**: full read of the configured objects (tiers, catalog
  items, membership states) into cache.
- **Incremental sync**: driven by webhook-derived events (2.5).
- **Reconciliation**: a full re-read on demand and on a schedule. Because
  webhooks are at-least-once *at best*, reconciliation is the correctness
  backstop, not an optimization. Any sync MUST be safe to run twice.

### 2.5 Webhook handling

Translate provider webhooks into canonical Haptera events.

- MUST verify the provider's webhook signature before parsing; unverifiable
  requests are rejected and logged, never processed.
- MUST acknowledge fast and process async where the provider imposes a
  response deadline.
- MUST be idempotent: dedupe on the provider's event id. Delivery is
  assumed at-least-once and out-of-order.
- Emitted canonical events carry **provider references, not member data**
  (see 4.3) — consumers re-read the provider for current state. This keeps
  event logs from becoming an accidental member database.
- Unrecognized event types are logged and dropped, never fatal.

### 2.6 Teardown

Cleanly disconnect, leaving the client whole.

- MUST deregister the adapter's webhook subscriptions.
- MUST NOT delete or modify any provider data — members, subscriptions,
  catalog, and history stay exactly as they are in the client's account.
  There is deliberately nothing else to hand over: the client already owns
  everything (ground rules 1 and 6).
- SHOULD report anything requiring manual action (e.g. credentials the
  client may want to rotate).

## 3. Mechanisms and required capabilities

An adapter declares which mechanisms it supports (§5) and implements the
corresponding capability set. Partial support within a mechanism must be
declared, not discovered at runtime.

### 3.1 Club

The core mechanism: recurring membership billed on the client's processor.

Required:
- List club tiers (name, price, billing cadence) from provider objects.
- Produce a provider-hosted checkout for a given tier, optionally with a
  deferred billing start date (waitlist promotion depends on this).
- Look up a member by email address — this backs magic-link auth. Haptera
  emails a signed one-time link; on click, the adapter resolves the email
  to the provider's customer record. No passwords exist anywhere.
- Read membership state for a member (active, paused, canceled, delinquent)
  and its provider subscription reference.
- Pause, resume, and cancel a membership, where the provider supports it —
  self-serve management is a product promise.

### 3.2 Waitlist

A queue of prospects for a capacity-limited club.

Required:
- Join, list, and remove entries.
- Promote an entry: convert it to a club checkout/subscription, using a
  deferred start date when billing should begin later than signup.

The provider may have no native waitlist primitive; an adapter MAY model
entries on provider objects (e.g. customer groups/attributes). If the
provider can't model it, the waitlist lives in the deployment (a static
list or client-owned DB per ground rule 2) and the adapter declares the
mechanism unsupported.

### 3.3 Catalog (market)

Products for a member market or online-ordering surface.

Required:
- List configured items with name, price, variation, and availability.
- Read a single item.

Optional (declare if supported): inventory quantities; write-back
(creating/updating provider items from Haptera is not required and most
deployments should author the catalog in the provider's own dashboard).

### 3.4 Comms

Messages to members. Comms is usually a *bridge*: the audience derives from
the processor's customer data, delivery goes through a comms provider (an
email service in the client's account). A processor adapter therefore
typically implements only the audience side; a comms adapter implements
delivery.

Audience side (processor adapters):
- Enumerate recipient references (member ref + email) for a segment: a
  tier, all active members, waitlist entries.

Delivery side (comms adapters):
- Send a message to a recipient list from a client-owned sender identity.
- Honor unsubscribes; suppression status must live with the comms
  provider, not in Haptera.

### 3.5 Reservations — deliberately absent

There is no reservation mechanism in this spec. Venue-owned direct booking
may become one later; reservation *networks* stay coexisted-with per
ground rule 4, and network write access remains unverified. Do not
implement reservation support behind another mechanism's interface.

## 4. Cross-cutting semantics

### 4.1 Errors

Every adapter operation resolves to success or a typed error:

| Code | Meaning | Retryable |
| --- | --- | --- |
| `auth` | Credentials invalid/expired/revoked | No — surface to operator |
| `permission` | Authenticated but scope/permission missing | No — surface to operator |
| `invalid_request` | Adapter sent something the provider rejects | No — a bug; fix the code/config |
| `not_found` | Referenced provider object is gone | No — reconcile config |
| `conflict` | Concurrent modification / state conflict | Sometimes — re-read, then retry once |
| `rate_limited` | Provider throttled the call | Yes — after the provider-indicated delay |
| `provider_unavailable` | Timeout, 5xx, network failure | Yes |
| `unsupported` | Operation not in this adapter's declared capabilities | No — caller bug; capabilities are declared up front |

### 4.2 Retries and idempotency

- Retry only `rate_limited`, `provider_unavailable`, and post-re-read
  `conflict`. Exponential backoff with jitter; honor an explicit
  provider-supplied delay (e.g. `Retry-After`) over the computed one.
- Every write the provider accepts an idempotency key for MUST send one,
  derived from the Haptera-side intent (e.g. the promotion or checkout id),
  so a retried write cannot double-charge or double-create.
- Writes without provider idempotency support MUST be guarded by a
  read-before-write check and declared in the adapter's notes.

### 4.3 Canonical events

Webhook handling (2.5) emits canonical events with:

- a globally unique, stable id (`<adapter>:<provider-event-id>`) for dedupe;
- the mechanism and a namespaced type (`membership.started`,
  `membership.paused`, `membership.canceled`, `member.updated`,
  `catalog.changed`, `waitlist.joined`, `payment.failed`);
- an ISO 8601 `occurredAt` timestamp;
- provider references (customer id, subscription id, …) — **not** copies
  of member PII.

### 4.4 Time and money

- Timestamps: ISO 8601, UTC, everywhere.
- Money: integer minor units plus ISO 4217 currency code. No floats.

## 5. Capability declaration

An adapter ships a static manifest: its id, provider, adapter version, the
provider API version it is pinned to, and per-mechanism support status —
`confirmed` (verified against the live API), `partial` (subset works;
notes say which), or `unverified` (specced from docs only, never exercised;
not deployable). The manifest is data, not behavior: Haptera decides what to
wire up by reading it, and an adapter throwing `unsupported` for something
its manifest claims is a defect.

## 6. TypeScript interfaces

Language-agnostic contract above is normative; these interfaces are the
canonical TypeScript shape for when engine code lands (ESM, matching the
repo's conventions). Adapters are plain objects/classes implementing
`Adapter`; capabilities are optional properties so unsupported mechanisms
are absent rather than stubbed.

```ts
export type Mechanism = 'club' | 'waitlist' | 'catalog' | 'comms';

export type SupportStatus = 'confirmed' | 'partial' | 'unverified';

export interface MechanismSupport {
  mechanism: Mechanism;
  status: SupportStatus;
  notes?: string; // required when status is 'partial' or 'unverified'
}

export interface AdapterManifest {
  id: string;                 // 'square'
  provider: string;           // 'Square'
  adapterVersion: string;     // semver of the adapter itself
  providerApiVersion: string; // pinned provider API version, e.g. a Square-Version date
  mechanisms: MechanismSupport[];
}

// ---------------------------------------------------------------- errors

export type AdapterErrorCode =
  | 'auth'
  | 'permission'
  | 'invalid_request'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'unsupported';

export class AdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number, // set when the provider said how long to wait
  ) {
    super(message);
  }
}

// ------------------------------------------------------------- lifecycle

export interface InstallContext {
  credentials: Record<string, string>; // from the client's own account, via env
  webhookUrl: string;                  // where this deployment receives webhooks
}

export interface InstallReport {
  providerAccountId: string;
  grantedPermissions: string[];
  apiVersion: string;
  webhookSubscriptionIds: string[];
}

export interface SyncRequest {
  kind: 'initial' | 'reconcile';
  mechanisms?: Mechanism[]; // default: all configured
}

export interface SyncReport {
  startedAt: string; // ISO 8601 UTC
  finishedAt: string;
  counts: Partial<Record<Mechanism, number>>;
  warnings: string[];
}

export interface WebhookRequest {
  headers: Record<string, string>;
  rawBody: string; // signature verification needs the exact bytes
}

export interface CanonicalEvent {
  id: string;        // `${adapterId}:${providerEventId}` — dedupe key
  adapter: string;
  mechanism: Mechanism;
  type: string;      // e.g. 'membership.started'
  occurredAt: string;
  providerRefs: Record<string, string>; // ids only, never member PII
}

export interface TeardownReport {
  webhookSubscriptionsRemoved: string[];
  manualFollowUps: string[]; // e.g. 'rotate the access token in the Square dashboard'
}

export interface Adapter {
  readonly manifest: AdapterManifest;

  install(ctx: InstallContext): Promise<InstallReport>;
  /** Validate deployment config against the live provider account. */
  configure(config: unknown): Promise<void>;
  sync(request: SyncRequest): Promise<SyncReport>;
  /** Verify signature, dedupe, translate. Throws AdapterError('auth') on bad signature. */
  handleWebhook(request: WebhookRequest): Promise<CanonicalEvent[]>;
  teardown(): Promise<TeardownReport>;

  club?: ClubCapability;
  waitlist?: WaitlistCapability;
  catalog?: CatalogCapability;
  comms?: CommsCapability;
}

// ------------------------------------------------------------ mechanisms

export interface Money {
  amount: number;   // integer minor units
  currency: string; // ISO 4217
}

/** A pointer into the provider's records — Haptera persists nothing about the member. */
export interface MemberRef {
  adapter: string;
  providerCustomerId: string;
}

export interface ClubTier {
  id: string;              // adapter-scoped stable id
  name: string;
  price: Money;
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  providerRefs: Record<string, string>;
}

export type MembershipStatus =
  | 'active'
  | 'paused'
  | 'canceled'
  | 'delinquent'
  | 'pending'; // e.g. deferred billing start

export interface Membership {
  member: MemberRef;
  tierId: string;
  status: MembershipStatus;
  startedAt?: string;
  providerRefs: Record<string, string>; // e.g. subscription id
}

export interface ClubCapability {
  listTiers(): Promise<ClubTier[]>;
  /** Provider-hosted checkout URL; Haptera never touches card data. */
  createCheckout(input: {
    tierId: string;
    email?: string;
    startDate?: string; // ISO 8601 date — deferred billing (waitlist promotion)
  }): Promise<{ url: string }>;
  /** Backs magic-link auth: email → provider customer, or null. */
  findMemberByEmail(email: string): Promise<MemberRef | null>;
  getMembership(member: MemberRef): Promise<Membership | null>;
  pauseMembership(member: MemberRef): Promise<Membership>;
  resumeMembership(member: MemberRef): Promise<Membership>;
  cancelMembership(member: MemberRef): Promise<Membership>;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  joinedAt: string;
  providerRefs: Record<string, string>;
}

export interface WaitlistCapability {
  join(input: { email: string }): Promise<WaitlistEntry>;
  list(): Promise<WaitlistEntry[]>;
  remove(entryId: string): Promise<void>;
  /** Convert to a club checkout, typically with a deferred startDate. */
  promote(entryId: string, input: { tierId: string; startDate?: string }): Promise<{ url: string }>;
}

export interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  price: Money;
  available: boolean;
  providerRefs: Record<string, string>;
}

export interface CatalogCapability {
  listItems(): Promise<CatalogItem[]>;
  getItem(itemId: string): Promise<CatalogItem | null>;
}

export type AudienceSegment =
  | { kind: 'all-members' }
  | { kind: 'tier'; tierId: string }
  | { kind: 'waitlist' };

export interface CommsCapability {
  /** Audience side (processor adapters): who a segment resolves to right now. */
  resolveAudience?(segment: AudienceSegment): Promise<Array<{ member: MemberRef; email: string }>>;
  /** Delivery side (comms adapters): send from a client-owned sender identity. */
  send?(input: {
    to: Array<{ email: string }>;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ delivered: number; suppressed: number }>;
}
```
