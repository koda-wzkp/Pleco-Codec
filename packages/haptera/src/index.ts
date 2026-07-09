// pleco-haptera — Haptera v2 core.
//
// Membership programs on client-owned rails: billing adapters normalize
// processors into MemberEvents; comms fan them out via Resend; the site
// layer renders tiers and links out to hosted checkout. One-time build, no
// platform cut, Pleco never in the money path.
//
// Subpath exports: pleco-haptera/billing, pleco-haptera/comms, pleco-haptera/site,
// pleco-haptera/config.
//
// Note: React COMPONENTS are re-exported only from `pleco-haptera/site` (react
// is an optional peer dependency; importing the root must not require it).
// The site layer's prop TYPES are re-exported here type-only.

export * from "./billing/index.js";
export * from "./comms/index.js";
export * from "./config.js";

// Type-only site re-exports (erased at build; no runtime react import).
export type {
  LaunchMode,
  TierPanelsProps,
  PerksListProps,
  WaitlistFormProps,
  ManageLinkProps,
} from "./site/index.js";
