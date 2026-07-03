// codec/billing/square.ts
//
// SquareProvider — CODEC-v2-CORE spec §5–§6. Implemented now (OHE, Sunset).
//
// Zero runtime dependencies: Square is driven via its REST API with global
// `fetch`, and webhook signatures are verified with `node:crypto`.
//
// IMPORTANT (spec §5): every Square webhook event-name string in this file
// carries a `// VERIFY:` comment. Resolve ALL of them against the current
// Square webhook docs before the first client launch — do not trust memory
// or the spec for event strings. (Acceptance §12.)

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  BillingProvider,
  ClubProgram,
  MemberEvent,
  PlanRef,
  TierId,
} from "./provider.js";

export interface SquareProviderOptions {
  /** Square access token (sandbox or production, matching `environment`). */
  accessToken: string;
  /** Location the subscription plans and payment links belong to. */
  locationId: string;
  /** Webhook subscription signature key, from the Square developer dashboard. */
  webhookSignatureKey: string;
  /**
   * The exact notification URL configured on the webhook subscription.
   * Square signs `notificationUrl + rawBody`; a mismatch (trailing slash,
   * http vs https, proxy rewrites) makes every signature check fail.
   */
  webhookNotificationUrl: string;
  environment: "sandbox" | "production";
  /** Where Square sends the buyer after checkout (thank-you page). */
  redirectUrl?: string;
  /**
   * Returned by `manageUrl()` — see the doc comment there. Point this at the
   * venue's "manage your membership" page or leave unset to fall back to a
   * mailto: built from `ownerEmail`.
   */
  manageFallbackUrl?: string;
  /** Owner contact used for the mailto: fallback of `manageUrl()`. */
  ownerEmail?: string;
  /**
   * Reverse map from Square subscription plan *variation* id -> TierId, i.e.
   * the inverse of `PlanRef.tierRefs`. Lets `parseWebhook` label `activated`
   * events with the CODEC tier id instead of the raw variation id.
   */
  tierRefs?: Record<TierId, string>;
  /**
   * TierId -> priceCents, used for `quick_pay.price_money` on payment links.
   * Only needed when `checkoutUrl` is called on a provider instance that did
   * not create the plan itself (e.g. plans made by hand in the Square
   * Dashboard); `createPlan` records its program's prices automatically.
   */
  tierPrices?: Record<TierId, number>;
}

const BASE_URLS = {
  sandbox: "https://connect.squareupsandbox.com",
  production: "https://connect.squareup.com",
} as const;

// VERIFY: Square API version header. Pin and verify against the current
// Square release notes before first client launch.
const SQUARE_VERSION = "2025-01-23";

/**
 * Extract Square's event id from a raw webhook body without full parsing —
 * webhook handlers MUST dedupe on this (Square redelivers; spec §4 requires
 * idempotent handlers). Store seen ids (KV, DB, or in-memory for launch-tier
 * single-instance deploys) and skip already-processed ids.
 */
export function webhookEventId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { event_id?: unknown };
    return typeof parsed.event_id === "string" ? parsed.event_id : null;
  } catch {
    return null;
  }
}

export class SquareProvider implements BillingProvider {
  private readonly opts: SquareProviderOptions;
  private readonly baseUrl: string;
  /** TierId -> priceCents, seeded from options and topped up by createPlan. */
  private readonly tierPrices: Record<TierId, number>;

  constructor(options: SquareProviderOptions) {
    this.opts = options;
    this.baseUrl = BASE_URLS[options.environment];
    this.tierPrices = { ...options.tierPrices };
  }

  // ---------------------------------------------------------------- plans

  /**
   * Create the club's subscription plan on Square via the Catalog API.
   *
   * Spec §6 (the pickup constraint): Square catalog-item subscriptions
   * (order-template model) require shipping and are NOT available for
   * in-person pickup. Therefore:
   *
   * - `fulfillment: "pickup"` -> static-price membership: one
   *   `SUBSCRIPTION_PLAN` catalog object plus one
   *   `SUBSCRIPTION_PLAN_VARIATION` per tier, each with a single phase whose
   *   STATIC price comes from `tier.priceCents`. Fulfillment (pickup night)
   *   is operational, not billed. This is the default for wine clubs.
   * - `fulfillment: "ship"` -> catalog-item (order-template) subscription —
   *   not built yet; built when a client pays for shipping fulfillment.
   */
  async createPlan(program: ClubProgram): Promise<PlanRef> {
    if (program.fulfillment === "ship") {
      throw new Error(
        "SquareProvider.createPlan: fulfillment \"ship\" requires a catalog-item " +
          "(order-template) subscription, which is not implemented. Per spec §6, " +
          "shipped-fulfillment plans are built when a client pays for shipping " +
          "fulfillment. Use fulfillment \"pickup\" for static-price memberships.",
      );
    }

    const planClientId = "#plan";
    const tierClientIds: Record<TierId, string> = {};
    for (const tier of program.tiers) {
      tierClientIds[tier.id] = `#tier-${tier.id}`;
      this.tierPrices[tier.id] = tier.priceCents;
    }

    const objects = [
      {
        type: "SUBSCRIPTION_PLAN",
        id: planClientId,
        subscription_plan_data: { name: program.name },
      },
      ...program.tiers.map((tier) => ({
        type: "SUBSCRIPTION_PLAN_VARIATION",
        id: tierClientIds[tier.id],
        subscription_plan_variation_data: {
          name: `${program.name} — ${tier.label}`,
          subscription_plan_id: planClientId,
          phases: [
            {
              ordinal: 0,
              cadence: cadenceToSquare(program.cadence),
              pricing: {
                type: "STATIC",
                // VERIFY: current Catalog API shape for static phase pricing.
                // Recent API versions use `pricing: { type: "STATIC",
                // price_money }`; older ones used `recurring_price_money`
                // directly on the phase. Check the SubscriptionPhase /
                // SubscriptionPricing reference for the pinned Square-Version.
                price_money: { amount: tier.priceCents, currency: "USD" },
              },
            },
          ],
        },
      })),
    ];

    const res = await this.request("/v2/catalog/batch-upsert", {
      idempotency_key: randomUUID(),
      batches: [{ objects }],
    });

    const mappings: Array<{ client_object_id: string; object_id: string }> =
      res.id_mappings ?? [];
    const byClientId = new Map(
      mappings.map((m) => [m.client_object_id, m.object_id]),
    );

    const providerId = byClientId.get(planClientId);
    if (!providerId) {
      throw new Error(
        "SquareProvider.createPlan: batch upsert response had no id mapping for the plan object",
      );
    }

    const tierRefs: Record<TierId, string> = {};
    for (const tier of program.tiers) {
      const variationId = byClientId.get(tierClientIds[tier.id]!);
      if (!variationId) {
        throw new Error(
          `SquareProvider.createPlan: no id mapping for tier "${tier.id}"`,
        );
      }
      tierRefs[tier.id] = variationId;
    }

    return { providerId, tierRefs };
  }

  // ------------------------------------------------------------- checkout

  /**
   * Hosted checkout for one tier: Checkout API `CreatePaymentLink`
   * (`POST /v2/online-checkout/payment-links`) with
   * `checkout_options.subscription_plan_id` set to the tier's
   * SUBSCRIPTION_PLAN_VARIATION id. Square hosts the payment page;
   * card-on-file and recurring billing are Square's problem (spec §5).
   */
  async checkoutUrl(plan: PlanRef, tier: TierId): Promise<string> {
    const variationId = plan.tierRefs[tier];
    if (!variationId) {
      throw new Error(
        `SquareProvider.checkoutUrl: unknown tier "${tier}" (known: ${Object.keys(plan.tierRefs).join(", ")})`,
      );
    }

    const priceCents = this.tierPrices[tier];
    if (priceCents === undefined) {
      throw new Error(
        `SquareProvider.checkoutUrl: no price known for tier "${tier}" — ` +
          "call createPlan first or pass tierPrices in the constructor " +
          "(required for quick_pay.price_money on the payment link)",
      );
    }

    const res = await this.request("/v2/online-checkout/payment-links", {
      idempotency_key: randomUUID(),
      // quick_pay creates an ad-hoc item for the link; the subscription
      // itself is driven by checkout_options.subscription_plan_id.
      quick_pay: {
        name: tier,
        // VERIFY: with a subscription_plan_id present, confirm against the
        // CreatePaymentLink docs whether quick_pay price_money must match the
        // plan variation's phase price or is superseded by it. We always send
        // the tier's real price so either reading bills correctly.
        price_money: { amount: priceCents, currency: "USD" },
        location_id: this.opts.locationId,
      },
      checkout_options: {
        // VERIFY: field name `subscription_plan_id` and whether it takes the
        // SUBSCRIPTION_PLAN_VARIATION id (current docs) or the parent
        // SUBSCRIPTION_PLAN id (older API versions).
        subscription_plan_id: variationId,
        ...(this.opts.redirectUrl ? { redirect_url: this.opts.redirectUrl } : {}),
      },
    });

    const url: string | undefined = res.payment_link?.url;
    if (!url) {
      throw new Error(
        "SquareProvider.checkoutUrl: CreatePaymentLink response had no payment_link.url",
      );
    }
    return url;
  }

  // --------------------------------------------------------------- manage

  /**
   * Spec §5: Square subscribers manage their membership through their Square
   * buyer account — the link arrives in Square's own receipts/emails. Square's
   * API does not hand out a per-member management/portal URL, so this returns
   * a configured fallback:
   *
   * 1. `manageFallbackUrl` if set (e.g. the venue's "manage your membership"
   *    page explaining the Square buyer-account flow), else
   * 2. `mailto:` to `ownerEmail` with a prefilled subject, so pause/skip/cancel
   *    requests route to the owner.
   *
   * VERIFY: check Square's current buyer self-serve surface at build time
   * (spec §5). If pause is not buyer-self-serve, the mailto route is the
   * supported path — say so in the client handoff doc
   * (docs/HANDOFF-TEMPLATE.md).
   */
  async manageUrl(memberEmail: string): Promise<string> {
    if (this.opts.manageFallbackUrl) return this.opts.manageFallbackUrl;
    if (this.opts.ownerEmail) {
      const subject = encodeURIComponent("Manage my membership");
      const body = encodeURIComponent(
        `Hi — I'd like to update my membership. My signup email is ${memberEmail}.`,
      );
      return `mailto:${this.opts.ownerEmail}?subject=${subject}&body=${body}`;
    }
    throw new Error(
      "SquareProvider.manageUrl: set manageFallbackUrl or ownerEmail — Square has no per-member portal URL (spec §5)",
    );
  }

  // -------------------------------------------------------------- webhook

  /**
   * Verify and normalize a Square webhook request.
   *
   * Signature: `x-square-hmacsha256-signature` must equal
   * base64(HMAC-SHA256(webhookSignatureKey, notificationUrl + rawBody)),
   * compared timing-safely. A bad or missing signature THROWS (never process
   * an unauthenticated body). Irrelevant/unmapped event types return null.
   *
   * Idempotency: this method does NOT dedupe. Handlers must dedupe on
   * Square's `event_id` — see `webhookEventId()`.
   */
  async parseWebhook(req: Request): Promise<MemberEvent | null> {
    const rawBody = await req.text();
    const signature = req.headers.get("x-square-hmacsha256-signature");
    if (!signature || !this.verifySignature(rawBody, signature)) {
      throw new Error("SquareProvider.parseWebhook: invalid webhook signature");
    }

    let payload: SquareWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as SquareWebhookPayload;
    } catch {
      throw new Error("SquareProvider.parseWebhook: body is not valid JSON");
    }

    return this.mapEvent(payload);
  }

  private verifySignature(rawBody: string, signature: string): boolean {
    const expected = createHmac("sha256", this.opts.webhookSignatureKey)
      .update(this.opts.webhookNotificationUrl + rawBody)
      .digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, "base64");
    } catch {
      return false;
    }
    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  }

  /**
   * Map Square subscription lifecycle + invoice/payment events to the
   * normalized MemberEvent union.
   *
   * VERIFY (spec §5): every event-name string and status value below must be
   * checked against the current Square webhook docs before first client
   * launch — do not trust memory or the spec for event strings.
   */
  private async mapEvent(
    payload: SquareWebhookPayload,
  ): Promise<MemberEvent | null> {
    const type = payload.type;
    const at = payload.created_at ?? new Date().toISOString();

    // VERIFY: "subscription.created" — new subscription (buyer completed
    // checkout). Payload object path: data.object.subscription.
    if (type === "subscription.created") {
      const sub = payload.data?.object?.subscription;
      if (!sub) return null;
      const email = await this.emailForCustomer(sub.customer_id);
      if (!email) return null;
      return { type: "activated", email, tier: this.tierForSubscription(sub), at };
    }

    // VERIFY: "subscription.updated" — status transitions arrive here.
    // Square subscription statuses: PENDING | ACTIVE | PAUSED | CANCELED |
    // DEACTIVATED (verify list). The event does not carry the previous
    // status, so mapping is by current status:
    //   PAUSED                 -> paused
    //   ACTIVE                 -> resumed  (an update INTO active)
    //   CANCELED | DEACTIVATED -> canceled
    if (type === "subscription.updated") {
      const sub = payload.data?.object?.subscription;
      if (!sub) return null;
      const email = await this.emailForCustomer(sub.customer_id);
      if (!email) return null;
      switch (sub.status) {
        case "PAUSED":
          return { type: "paused", email, at };
        case "ACTIVE":
          return { type: "resumed", email, at };
        case "CANCELED":
        case "DEACTIVATED":
          return { type: "canceled", email, at };
        default:
          return null;
      }
    }

    // VERIFY: payment-failure surface. Square bills subscriptions through
    // Invoices; the failure signals are "invoice.payment_made" 's absence
    // plus explicit failure events. Check current docs for the exact names:
    // "invoice.scheduled_charge_failed" (automatic card charge failed) and
    // whether "invoice.payment_failed" exists in the pinned Square-Version.
    if (
      type === "invoice.scheduled_charge_failed" ||
      type === "invoice.payment_failed"
    ) {
      const invoice = payload.data?.object?.invoice;
      const customerId = invoice?.primary_recipient?.customer_id;
      const emailFromInvoice = invoice?.primary_recipient?.email_address;
      const email =
        emailFromInvoice ?? (await this.emailForCustomer(customerId));
      if (!email) return null;
      return { type: "payment_failed", email, at };
    }

    // Anything else (catalog.version.updated, payment.updated, invoice
    // events we don't act on, ...) is irrelevant to the member lifecycle.
    return null;
  }

  private tierForSubscription(sub: SquareSubscription): TierId {
    // VERIFY: field name `plan_variation_id` (current) vs legacy `plan_id`.
    const variationId = sub.plan_variation_id ?? sub.plan_id;
    if (variationId && this.opts.tierRefs) {
      for (const [tierId, ref] of Object.entries(this.opts.tierRefs)) {
        if (ref === variationId) return tierId;
      }
    }
    // Fall back to the raw variation id — still stable and greppable.
    return variationId ?? "unknown";
  }

  /**
   * Square subscription webhook payloads carry `customer_id`, not an email;
   * resolve it via the Customers API.
   */
  private async emailForCustomer(
    customerId: string | undefined,
  ): Promise<string | null> {
    if (!customerId) return null;
    const res = await this.request(
      `/v2/customers/${encodeURIComponent(customerId)}`,
      undefined,
      "GET",
    );
    const email: string | undefined = res.customer?.email_address;
    return email ?? null;
  }

  // ----------------------------------------------------------------- http

  private async request(
    path: string,
    body?: unknown,
    method: "GET" | "POST" = body === undefined ? "GET" : "POST",
  ): Promise<any> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.opts.accessToken}`,
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Square API ${method} ${path} failed: ${res.status} ${res.statusText} ${text}`.trim(),
      );
    }
    return res.json();
  }
}

function cadenceToSquare(cadence: ClubProgram["cadence"]): string {
  // VERIFY: Square SubscriptionCadence enum values. Believed-current values
  // used here: WEEKLY, MONTHLY, QUARTERLY (NOT "EVERY_THREE_MONTHS" — confirm
  // against the SubscriptionCadence reference for the pinned Square-Version).
  switch (cadence) {
    case "weekly":
      return "WEEKLY";
    case "monthly":
      return "MONTHLY";
    case "quarterly":
      return "QUARTERLY";
  }
}

// ------------------------------------------------------- payload typings

interface SquareSubscription {
  customer_id?: string;
  status?: string;
  plan_variation_id?: string;
  plan_id?: string;
}

interface SquareWebhookPayload {
  event_id?: string;
  type?: string;
  created_at?: string;
  data?: {
    object?: {
      subscription?: SquareSubscription;
      invoice?: {
        primary_recipient?: {
          customer_id?: string;
          email_address?: string;
        };
      };
    };
  };
}
