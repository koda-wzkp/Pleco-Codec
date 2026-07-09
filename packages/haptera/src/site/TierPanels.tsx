// haptera/site/TierPanels.tsx — processor-blind (spec §8).
//
// Renders ClubProgram.tiers as semantic, unstyled panels. Each tier's CTA
// href comes from the `launch` prop:
//
//   { mode: "waitlist", anchor: "#wine-club" }        — pre-launch
//   { mode: "billing", checkoutUrls: { [tierId]: url } } — post-launch
//
// Flipping launch mode is a one-line config change in the client instance —
// this is the waitlist -> billing switchover mechanism. This component never
// knows which processor is behind the URLs.
//
// Styling: none. Stable classNames (`haptera-tier-panels`, `haptera-tier-panel`,
// ...) let client sites style via their own tokens.

import type { ReactNode } from "react";
import type { ClubProgram, TierId } from "../billing/provider.js";

export type LaunchMode =
  | { mode: "waitlist"; anchor: string }
  | { mode: "billing"; checkoutUrls: Record<TierId, string> };

export interface TierPanelsProps {
  program: ClubProgram;
  launch: LaunchMode;
  /** CTA label; defaults depend on launch mode. */
  ctaLabel?: string;
  /** Price formatter; default renders "$40/mo"-style from priceCents + cadence. */
  formatPrice?: (priceCents: number, cadence: ClubProgram["cadence"]) => ReactNode;
}

const CADENCE_SUFFIX: Record<ClubProgram["cadence"], string> = {
  weekly: "/wk",
  monthly: "/mo",
  quarterly: "/qtr",
};

function defaultFormatPrice(
  priceCents: number,
  cadence: ClubProgram["cadence"],
): string {
  const dollars = priceCents / 100;
  const amount = Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
  return `${amount}${CADENCE_SUFFIX[cadence]}`;
}

export function tierCtaHref(launch: LaunchMode, tier: TierId): string {
  if (launch.mode === "waitlist") return launch.anchor;
  const url = launch.checkoutUrls[tier];
  if (!url) {
    throw new Error(
      `TierPanels: launch mode "billing" has no checkout URL for tier "${tier}"`,
    );
  }
  return url;
}

export function TierPanels({
  program,
  launch,
  ctaLabel,
  formatPrice = defaultFormatPrice,
}: TierPanelsProps) {
  const label =
    ctaLabel ?? (launch.mode === "waitlist" ? "Join the list" : "Become a member");
  return (
    <ul className="haptera-tier-panels">
      {program.tiers.map((tier) => (
        <li className="haptera-tier-panel" key={tier.id} data-tier={tier.id}>
          <h3 className="haptera-tier-label">{tier.label}</h3>
          <p className="haptera-tier-price">
            {formatPrice(tier.priceCents, program.cadence)}
          </p>
          <p className="haptera-tier-description">{tier.description}</p>
          <a className="haptera-tier-cta" href={tierCtaHref(launch, tier.id)}>
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}
