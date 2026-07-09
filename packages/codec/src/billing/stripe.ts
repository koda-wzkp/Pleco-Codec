// codec/billing/stripe.ts
//
// StripeProvider — CODEC-v2-CORE spec §7. Implemented for Living Room-class
// engagements (Stripe-on-Toast shops, Table22 migrations).
//
// Zero runtime dependencies: Stripe is driven via its REST API with global
// `fetch` (form-encoded bodies), and webhook signatures are verified with
// `node:crypto`. Same shape as SquareProvider.
//
// IMPORTANT (spec §7): Stripe event-name strings and object fields below carry
// `// VERIFY:` comments. Resolve them against the current Stripe API docs and a
// test-mode account before the first client launch — do not trust memory.
//
// Table22 migration note: assume NO card portability (Table22 owns its Stripe
// account). Migration = re-enrollment: email members the new signup link, run
// one billing cycle of overlap, then sunset the Table22 listing. Members gain
// the Stripe customer portal — MORE self-serve control than Table22's email
// support model.

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  BillingProvider,
  ClubProgram,
  MemberEvent,
  MemberRecord,
  MemberStatus,
  PlanRef,
  TierId,
} from "./provider.js";

export interface StripeProviderOptions {
  secretKey: string;
  webhookSigningSecret: string;
  /** Return URL for the billing portal (where "manage" sends members back to). */
  portalReturnUrl?: string;
  /** After-checkout redirect (thank-you page) on payment links. */
  redirectUrl?: string;
  /**
   * Reverse map Stripe Price id -> TierId, i.e. the inverse of PlanRef.tierRefs.
   * Lets parseWebhook/listMembers label events with the CODEC tier id instead
   * of the raw price id. Set after createPlan.
   */
  tierRefs?: Record<TierId, string>;
  /** TierId -> priceCents, for the owner MRR read when the plan wasn't created in-process. */
  tierPrices?: Record<TierId, number>;
  /** Signature timestamp tolerance in seconds (default 300, Stripe's own default). */
  toleranceSeconds?: number;
}

const BASE_URL = "https://api.stripe.com";

export class StripeProvider implements BillingProvider {
  private readonly opts: StripeProviderOptions;
  private readonly tierPrices: Record<TierId, number>;

  constructor(options: StripeProviderOptions) {
    this.opts = options;
    this.tierPrices = { ...options.tierPrices };
  }

  // ---------------------------------------------------------------- plans

  /**
   * Create the club's plan on Stripe: one Product for the club, one recurring
   * Price per tier. Returns { providerId: productId, tierRefs: {tier: priceId} }.
   *
   * Cadence -> recurring interval: weekly=week, monthly=month, quarterly=month
   * with interval_count=3. Fulfillment is operational (pickup/ship both bill the
   * same recurring price); Stripe has no Square-style pickup constraint.
   */
  async createPlan(program: ClubProgram): Promise<PlanRef> {
    // VERIFY: POST /v1/products { name } — current Product create shape.
    const product = await this.request("POST", "/v1/products", {
      name: program.name,
    });
    const productId: string | undefined = product.id;
    if (!productId) {
      throw new Error("StripeProvider.createPlan: product create returned no id");
    }

    const { interval, intervalCount } = cadenceToStripe(program.cadence);
    const tierRefs: Record<TierId, string> = {};
    for (const tier of program.tiers) {
      this.tierPrices[tier.id] = tier.priceCents;
      // VERIFY: POST /v1/prices — recurring[interval], recurring[interval_count],
      // unit_amount (cents), currency, product.
      const price = await this.request("POST", "/v1/prices", {
        product: productId,
        currency: "usd",
        unit_amount: tier.priceCents,
        "recurring[interval]": interval,
        "recurring[interval_count]": intervalCount,
        nickname: `${program.name} — ${tier.label}`,
      });
      if (!price.id) {
        throw new Error(
          `StripeProvider.createPlan: price create for tier "${tier.id}" returned no id`,
        );
      }
      tierRefs[tier.id] = price.id;
    }

    return { providerId: productId, tierRefs };
  }

  // ------------------------------------------------------------- checkout

  /**
   * Hosted signup for one tier: a reusable Stripe Payment Link on the tier's
   * recurring Price. A recurring price makes the link create a subscription.
   * Stripe hosts the page; card data never touches the site (spec §7).
   */
  async checkoutUrl(plan: PlanRef, tier: TierId): Promise<string> {
    const priceId = plan.tierRefs[tier];
    if (!priceId) {
      throw new Error(
        `StripeProvider.checkoutUrl: unknown tier "${tier}" (known: ${Object.keys(plan.tierRefs).join(", ")})`,
      );
    }
    // VERIFY: POST /v1/payment_links — line_items[0][price], [quantity], and
    // after_completion[type]=redirect for the thank-you page.
    const body: Record<string, unknown> = {
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
    };
    if (this.opts.redirectUrl) {
      body["after_completion[type]"] = "redirect";
      body["after_completion[redirect][url]"] = this.opts.redirectUrl;
    }
    const link = await this.request("POST", "/v1/payment_links", body);
    if (!link.url) {
      throw new Error("StripeProvider.checkoutUrl: payment link create returned no url");
    }
    return link.url;
  }

  // --------------------------------------------------------------- manage

  /**
   * Self-serve management via the Stripe customer portal (spec §7) — pause,
   * cancel, update card, all hosted by Stripe. This is the Table22-replacement
   * value. Portal sessions are single-use and short-lived, so this resolves the
   * member by email at call time and mints a fresh session: call it from a
   * per-member "/manage" route, not a static link.
   */
  async manageUrl(memberEmail: string): Promise<string> {
    const customerId = await this.customerIdForEmail(memberEmail);
    if (!customerId) {
      throw new Error(
        `StripeProvider.manageUrl: no Stripe customer found for ${memberEmail}`,
      );
    }
    // VERIFY: POST /v1/billing_portal/sessions { customer, return_url }.
    const body: Record<string, unknown> = { customer: customerId };
    if (this.opts.portalReturnUrl) body.return_url = this.opts.portalReturnUrl;
    const session = await this.request("POST", "/v1/billing_portal/sessions", body);
    if (!session.url) {
      throw new Error("StripeProvider.manageUrl: portal session returned no url");
    }
    return session.url;
  }

  // -------------------------------------------------------------- webhook

  webhookEventId(rawBody: string): string | null {
    try {
      const parsed = JSON.parse(rawBody) as { id?: unknown };
      return typeof parsed.id === "string" ? parsed.id : null;
    } catch {
      return null;
    }
  }

  /**
   * Verify and normalize a Stripe webhook.
   *
   * Signature: the `Stripe-Signature` header is `t=<ts>,v1=<hmac>` where the hmac
   * is HMAC-SHA256(signingSecret, `${t}.${rawBody}`). A bad/missing signature or
   * a timestamp outside tolerance THROWS. Irrelevant events return null.
   */
  async parseWebhook(req: Request): Promise<MemberEvent | null> {
    const rawBody = await req.text();
    const header = req.headers.get("stripe-signature");
    if (!header || !this.verifySignature(rawBody, header)) {
      throw new Error("StripeProvider.parseWebhook: invalid webhook signature");
    }
    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      throw new Error("StripeProvider.parseWebhook: body is not valid JSON");
    }
    return this.mapEvent(event);
  }

  private verifySignature(rawBody: string, header: string): boolean {
    const parts = Object.fromEntries(
      header.split(",").map((kv) => {
        const [k, v] = kv.split("=");
        return [k?.trim(), v?.trim()];
      }),
    );
    const t = parts["t"];
    const v1 = parts["v1"];
    if (!t || !v1) return false;

    // Timestamp tolerance (replay protection).
    const tolerance = this.opts.toleranceSeconds ?? 300;
    const ts = Number(t);
    if (Number.isFinite(ts)) {
      const nowSec = Date.now() / 1000;
      if (Math.abs(nowSec - ts) > tolerance) return false;
    }

    const expected = createHmac("sha256", this.opts.webhookSigningSecret)
      .update(`${t}.${rawBody}`)
      .digest("hex");
    let a: Buffer;
    let b: Buffer;
    try {
      a = Buffer.from(v1, "hex");
      b = Buffer.from(expected, "hex");
    } catch {
      return false;
    }
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Map Stripe events to the normalized MemberEvent union.
   *
   * VERIFY (spec §7): every event type and field path below against the current
   * Stripe API before launch.
   *
   *   customer.subscription.created                    -> activated
   *   customer.subscription.updated (pause_collection) -> paused
   *   customer.subscription.updated (active, unpaused) -> resumed
   *   customer.subscription.deleted                    -> canceled
   *   invoice.payment_failed                           -> payment_failed
   *
   * We activate on subscription.created (not checkout.session.completed) so the
   * tier is available from the subscription's price and no duplicate welcome is
   * sent; checkout.session.completed is intentionally ignored.
   */
  private async mapEvent(event: StripeEvent): Promise<MemberEvent | null> {
    const type = event.type;
    const at = event.created
      ? new Date(event.created * 1000).toISOString()
      : new Date().toISOString();

    if (type === "customer.subscription.created") {
      const sub = event.data?.object as StripeSubscription | undefined;
      if (!sub) return null;
      const email = await this.emailForCustomer(sub.customer);
      if (!email) return null;
      return { type: "activated", email, tier: this.tierForSubscription(sub), at };
    }

    if (type === "customer.subscription.updated") {
      const sub = event.data?.object as StripeSubscription | undefined;
      if (!sub) return null;
      const email = await this.emailForCustomer(sub.customer);
      if (!email) return null;
      if (sub.pause_collection) return { type: "paused", email, at };
      if (sub.status === "active" || sub.status === "trialing") {
        return { type: "resumed", email, at };
      }
      return null;
    }

    if (type === "customer.subscription.deleted") {
      const sub = event.data?.object as StripeSubscription | undefined;
      if (!sub) return null;
      const email = await this.emailForCustomer(sub.customer);
      if (!email) return null;
      return { type: "canceled", email, at };
    }

    if (type === "invoice.payment_failed") {
      const invoice = event.data?.object as StripeInvoice | undefined;
      const email = invoice?.customer_email ?? (await this.emailForCustomer(invoice?.customer));
      if (!email) return null;
      return { type: "payment_failed", email, at };
    }

    // checkout.session.completed and everything else: not a lifecycle signal here.
    return null;
  }

  // ------------------------------------------------------- members (read)

  /**
   * Live member read for the owner dashboard: paginate GET /v1/subscriptions
   * (status=all, customer expanded), normalize to MemberRecord[]. No datastore.
   *
   * VERIFY: /v1/subscriptions params (status, expand[]=data.customer, limit,
   * starting_after) against the current Stripe API.
   */
  async listMembers(): Promise<MemberRecord[]> {
    const subs: StripeSubscription[] = [];
    let startingAfter: string | undefined;
    do {
      const qs = new URLSearchParams({ status: "all", limit: "100" });
      qs.append("expand[]", "data.customer");
      if (startingAfter) qs.set("starting_after", startingAfter);
      const res = await this.request("GET", `/v1/subscriptions?${qs.toString()}`);
      const page: StripeSubscription[] = res.data ?? [];
      subs.push(...page);
      startingAfter = res.has_more && page.length ? page[page.length - 1]!.id : undefined;
    } while (startingAfter);

    return subs.map((sub) => {
      const tier = this.tierForSubscription(sub);
      const customer =
        typeof sub.customer === "object" && sub.customer ? sub.customer : undefined;
      return {
        customerId: (customer?.id ?? (typeof sub.customer === "string" ? sub.customer : "unknown")) as string,
        email: customer?.email ?? null,
        tier,
        status: normalizeStatus(sub),
        priceCents: this.tierPrices[tier] ?? null,
        createdAt: sub.created ? new Date(sub.created * 1000).toISOString() : null,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      };
    });
  }

  // ------------------------------------------------------------- helpers

  private tierForSubscription(sub: StripeSubscription): TierId {
    // VERIFY: items.data[0].price.id path for the subscription's price.
    const priceId = sub.items?.data?.[0]?.price?.id;
    if (priceId && this.opts.tierRefs) {
      for (const [tierId, ref] of Object.entries(this.opts.tierRefs)) {
        if (ref === priceId) return tierId;
      }
    }
    return priceId ?? "unknown";
  }

  private async emailForCustomer(
    customer: string | StripeCustomer | undefined,
  ): Promise<string | null> {
    if (!customer) return null;
    if (typeof customer === "object") return customer.email ?? null;
    const res = await this.request("GET", `/v1/customers/${encodeURIComponent(customer)}`);
    return res.email ?? null;
  }

  private async customerIdForEmail(email: string): Promise<string | null> {
    // VERIFY: GET /v1/customers?email= returns matching customers in data[].
    const res = await this.request(
      "GET",
      `/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
    );
    return res.data?.[0]?.id ?? null;
  }

  // ----------------------------------------------------------------- http

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<any> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.opts.secretKey}`,
        // Stripe expects form-encoded bodies.
        ...(method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(body ? { body: formEncode(body) } : {}),
    };
    const res = await fetch(BASE_URL + path, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Stripe API ${method} ${path} failed: ${res.status} ${res.statusText} ${text}`.trim(),
      );
    }
    return res.json();
  }
}

function cadenceToStripe(cadence: ClubProgram["cadence"]): {
  interval: string;
  intervalCount: number;
} {
  // VERIFY: Stripe recurring.interval values (day/week/month/year) + interval_count.
  switch (cadence) {
    case "weekly":
      return { interval: "week", intervalCount: 1 };
    case "monthly":
      return { interval: "month", intervalCount: 1 };
    case "quarterly":
      return { interval: "month", intervalCount: 3 };
  }
}

function normalizeStatus(sub: StripeSubscription): MemberStatus {
  // VERIFY: Stripe subscription.status values. Pausing is via pause_collection
  // (status stays active), so check that first.
  if (sub.pause_collection) return "paused";
  switch (sub.status) {
    case "active":
    case "trialing":
      return "active";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "unknown";
    default:
      return "unknown";
  }
}

/** Form-encode a flat map of Stripe params (keys already use bracket notation). */
function formEncode(body: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) params.append(k, String(v));
  }
  return params.toString();
}

// ------------------------------------------------------- payload typings

interface StripeEvent {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: unknown };
}

interface StripeCustomer {
  id?: string;
  email?: string;
}

interface StripeSubscription {
  id: string;
  customer: string | StripeCustomer;
  status?: string;
  pause_collection?: unknown;
  created?: number;
  canceled_at?: number;
  items?: { data?: Array<{ price?: { id?: string } }> };
}

interface StripeInvoice {
  customer?: string;
  customer_email?: string;
}
