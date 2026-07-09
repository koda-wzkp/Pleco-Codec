// haptera/site/PerksList.tsx — processor-blind (spec §8).
//
// Shared perks list with an optional glyph render prop for brand markers
// (e.g. the redfish-spot ocellus on a coastal client). Unstyled; stable
// classNames for client-side tokens.

import type { ReactNode } from "react";

export interface PerksListProps {
  perks: string[];
  /**
   * Optional brand marker rendered before each perk (the client's glyph).
   * When omitted, the list renders as a plain semantic <ul> and the client
   * styles `haptera-perks-list` markers via CSS.
   */
  glyph?: () => ReactNode;
}

export function PerksList({ perks, glyph }: PerksListProps) {
  return (
    <ul className="haptera-perks-list">
      {perks.map((perk) => (
        <li className="haptera-perk" key={perk}>
          {glyph ? (
            <span className="haptera-perk-glyph" aria-hidden="true">
              {glyph()}
            </span>
          ) : null}
          <span className="haptera-perk-text">{perk}</span>
        </li>
      ))}
    </ul>
  );
}
