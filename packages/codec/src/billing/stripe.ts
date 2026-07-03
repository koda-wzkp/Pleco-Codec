// codec/billing/stripe.ts
//
// StripeProvider — CODEC-v2-CORE spec §7. STUB: build at first Toast/no-POS
// sale (LRW, TPL). Hard limit from spec §2: two adapters; a third gets built
// when a client pays for it, not before.
//
// Intended mechanics when built (spec §7):
// - Billing: Products + Prices (recurring); Stripe Checkout sessions or
//   Payment Links for signup.
// - Manage: Stripe customer portal — self-serve pause/cancel/card-update out
//   of the box. This is the feature that eliminates most member-support
//   load; lead with it in proposals.
// - Webhooks: `checkout.session.completed`, `customer.subscription.updated`,
//   `customer.subscription.deleted`, `invoice.payment_failed` -> MemberEvent.
// - Accounting: Stripe -> QuickBooks needs a connector — a named line item in
//   Toast-client proposals, not a surprise.
//
// Table22 migration note (spec §7, LRW-class engagements): assume NO card
// portability — Table22 owns its Stripe account; transfers require their
// cooperation, so don't plan on it. Migration = re-enrollment campaign:
// announce "bringing the club home," email members the new signup link,
// sunset the Table22 listing after one billing cycle of overlap. Budget for
// churn honestly in the proposal; a loved club converts most members, not
// all. Members lose nothing — the Stripe portal gives them MORE self-serve
// control than Table22's email-support model.

import type {
  BillingProvider,
  ClubProgram,
  MemberEvent,
  PlanRef,
  TierId,
} from "./provider.js";

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

function stub(method: string): never {
  throw new NotImplementedError(
    `StripeProvider.${method} is a stub — per CODEC-v2-CORE spec §7, the Stripe ` +
      "adapter is built at the first Toast/no-POS sale (LRW, TPL), not before. " +
      "Intended mechanics: Products + Prices (recurring) for plans; Stripe " +
      "Checkout / Payment Links for checkoutUrl; the Stripe customer portal " +
      "for manageUrl (self-serve pause/cancel/card-update); webhooks " +
      "`checkout.session.completed`, `customer.subscription.updated`, " +
      "`customer.subscription.deleted`, `invoice.payment_failed` mapped to " +
      "MemberEvent in parseWebhook.",
  );
}

export interface StripeProviderOptions {
  secretKey: string;
  webhookSigningSecret: string;
  /** Stripe customer portal configuration/return URL, when built. */
  portalReturnUrl?: string;
}

export class StripeProvider implements BillingProvider {
  constructor(_options: StripeProviderOptions) {}

  async createPlan(_program: ClubProgram): Promise<PlanRef> {
    stub("createPlan");
  }

  checkoutUrl(_plan: PlanRef, _tier: TierId): Promise<string> {
    stub("checkoutUrl");
  }

  async manageUrl(_memberEmail: string): Promise<string> {
    stub("manageUrl");
  }

  async parseWebhook(_req: Request): Promise<MemberEvent | null> {
    stub("parseWebhook");
  }

  /**
   * Stripe events carry a top-level `id` (e.g. "evt_123"). This is pure JSON
   * parsing — no API call, no secret — so it is implemented even while the rest
   * of the adapter is stubbed: the webhook route can dedupe processor-blindly
   * the moment the real parseWebhook lands.
   */
  webhookEventId(rawBody: string): string | null {
    try {
      const parsed = JSON.parse(rawBody) as { id?: unknown };
      return typeof parsed.id === "string" ? parsed.id : null;
    } catch {
      return null;
    }
  }
}
