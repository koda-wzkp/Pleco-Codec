// codec/config.ts
//
// CodecInstanceConfig — the per-client instance spec, CODEC-v2-CORE spec §10.
//
// Acceptance §12: a new client instance requires ONLY an instance spec (an
// object of this type plus brand tokens/copy) — no core changes.

import type { ClubProgram, TierId } from "./billing/provider.js";

/**
 * §10 item 5 — launch mode and the waitlist -> billing switchover. Flipping
 * this value (and supplying the checkout URLs) is the one-line switchover:
 * tier CTAs turn from waitlist anchors into hosted checkout links.
 */
export type LaunchConfig =
  | {
      mode: "waitlist";
      /** In-page anchor the tier CTAs point at, e.g. "#wine-club". */
      anchor: string;
      /** Planned switchover date/trigger, in writing (§10 item 5). */
      switchover?: string;
    }
  | {
      mode: "billing";
      /** Hosted checkout URL per tier, from BillingProvider.checkoutUrl. */
      checkoutUrls: Record<TierId, string>;
    };

export interface CodecInstanceConfig {
  /** Client/venue display name — used in comms copy and owner emails. */
  venueName: string;

  /**
   * §10 item 1 — processor, chosen via the spec §2 routing rule: the
   * client's existing processor if it has real subscription rails,
   * otherwise the default alternative. This field is the ONLY place a
   * processor is named; the site layer stays processor-blind.
   */
  processor: "square" | "stripe";

  /** §10 item 2 — tiers, prices, cadence, fulfillment. */
  program: ClubProgram;

  /**
   * §10 item 3 — the retention ritual and its calendar (pickup night,
   * tasting night, game night...). The ritual is the retention engine;
   * write it down: what it is, when it recurs, and how members hear about
   * it. Free text by design — it's operational, not code.
   */
  retentionRitual: {
    name: string;              // "Members' tasting night"
    calendarNote: string;      // "First Thursday monthly, timed with bottle pickup"
  };

  /** §10 item 5 — launch mode + switchover (see LaunchConfig). */
  launch: LaunchConfig;

  /** §10 item 6 — owner notification address + Resend audience. */
  ownerNotifyEmail: string;
  resendAudienceId: string;

  /**
   * §10 item 7 — scope boundary in writing: what's included, care plan
   * yes/no. If `carePlan` is false, `handoffDocUrl` must point at the
   * completed client handoff doc (see docs/HANDOFF-TEMPLATE.md).
   */
  scope: {
    carePlan: boolean;
    /** One-line statement of what the engagement includes. */
    included: string;
    /** Required when carePlan is false. */
    handoffDocUrl?: string;
  };
}
