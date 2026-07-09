// haptera/billing/provider.ts
//
// The BillingProvider interface — HAPTERA-CORE spec §4, verbatim.
//
// Rules (spec §4):
// - Adapters normalize; nothing downstream ever branches on processor.
// - Webhook handlers are idempotent (processors redeliver).
// - Every `MemberEvent` fans out to (a) a Resend action and (b) a notification
//   email to the owner. That is the entire v1 "member system."

export type TierId = string; // e.g. "club-2", "club-4", "club-2-reserve"

export interface ClubProgram {
  name: string;                      // "The Sunset Wine Club"
  cadence: "weekly" | "monthly" | "quarterly";
  tiers: Array<{
    id: TierId;
    label: string;                   // "Club 2"
    priceCents: number;              // 4000
    description: string;             // "2 bottles/month + member perks"
  }>;
  fulfillment: "pickup" | "ship";    // drives Square plan type — see §6
}

export interface PlanRef { providerId: string; tierRefs: Record<TierId, string>; }

export type MemberEvent =
  | { type: "activated";      email: string; tier: TierId; at: string }
  | { type: "paused";         email: string; at: string }
  | { type: "resumed";        email: string; at: string }
  | { type: "canceled";       email: string; at: string }
  | { type: "payment_failed"; email: string; at: string };

export type MemberStatus = "active" | "paused" | "canceled" | "unknown";

/**
 * A normalized member row for the OWNER read layer (member list, counts, MRR,
 * 30/60/90 trend, CSV). Sourced live from the processor — the processor
 * dashboard stays the system of record; this is a clean read over it, no
 * parallel members database. `priceCents` is the tier's monthly-normalized
 * price when known.
 */
export interface MemberRecord {
  customerId: string;
  email: string | null;
  tier: TierId;
  status: MemberStatus;
  priceCents: number | null;
  createdAt: string | null;
  canceledAt: string | null;
}

export interface BillingProvider {
  createPlan(program: ClubProgram): Promise<PlanRef>;
  checkoutUrl(plan: PlanRef, tier: TierId): string | Promise<string>;
  manageUrl(memberEmail: string): Promise<string>;   // self-serve pause/cancel/card
  parseWebhook(req: Request): Promise<MemberEvent | null>; // verify signature; null = irrelevant event
  // Extract the processor's stable event id from a raw webhook body so handlers
  // can dedupe idempotently (processors redeliver — spec §4). Pure parsing: no
  // network, no secrets. Returns null if the body has no extractable id. Call
  // this BEFORE parseWebhook (which consumes the request body). Keeping it on
  // the interface lets the webhook route stay processor-blind.
  webhookEventId(rawBody: string): string | null;
  // Live read of members for the owner dashboard. Reads from the processor
  // (system of record); no local datastore. Keeping it on the interface lets
  // the owner UI stay processor-blind.
  listMembers(): Promise<MemberRecord[]>;
}
