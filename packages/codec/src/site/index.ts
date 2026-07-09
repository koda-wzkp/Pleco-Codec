// codec/site — the processor-blind site layer (spec §8).
//
// Acceptance §12: grep-ing this directory for the two processor names
// returns nothing. Components render entirely from props/content and link
// OUT to hosted checkout; they never touch card data. No PCI.

export { TierPanels, tierCtaHref } from "./TierPanels.js";
export type { TierPanelsProps, LaunchMode } from "./TierPanels.js";
export { PerksList } from "./PerksList.js";
export type { PerksListProps } from "./PerksList.js";
export { WaitlistForm } from "./WaitlistForm.js";
export type { WaitlistFormProps } from "./WaitlistForm.js";
export { ManageLink } from "./ManageLink.js";
export type { ManageLinkProps } from "./ManageLink.js";
