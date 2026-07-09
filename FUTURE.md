# FUTURE — deferred scope (parking lot)

These are real someday-features that **no current client (Sunset, Outer Heaven,
Living Room) needs to launch and run their club.** They are deliberately OUT of
the Phase 1 build to avoid scope creep. Each becomes its own scoped build with
its own prompt if and when a client genuinely needs it.

If you find yourself reaching for one of these mid-build, stop and add a note
here instead of building it.

## Deferred features
- **Loyalty points / rewards accrual** — no client asked for point-based rewards.
- **Referral programs** — not needed to launch any of the three clubs.
- **Gift memberships** — out of scope; revisit if a retail-gifting client appears.
- **POS-integrated perk redemption at the register** — perks are operational
  (pickup night, tastings), not register-integrated in v1.
- **Multi-location / franchise management** — all three clients are single-location.
- **Advanced analytics** beyond MRR + member count + 30/60/90-day view.
- **Proration / mid-cycle tier-switching UI** — no client is blocked without it.
  (Revisit only if the audit of a specific client shows they're blocked.)
- **A third billing adapter** — Square and Stripe cover all three clients. Toast
  has no subscription rails, so Toast shops (Living Room) use Stripe.

## Hard line (never build)
- Any **"platform" behavior** where Haptera sits in the money path or takes a cut.
  This contradicts the entire product: billing runs on the client's own
  processor, the client owns the code and the member list, no platform fee ever.

## Notes captured during the build
- **2026-07-03 — self-serve in-dashboard launch toggle.** The owner dashboard
  shows launch mode and the one-line config flip that switches waitlist→billing.
  A live "flip it from the dashboard" button needs a small persisted flag
  (KV/DB) since the app has no datastore in v1. Deferred: the config flip +
  redeploy is the launch-tier mechanism. Revisit if a client wants to self-flip.
- **2026-07-03 — historical MRR across price changes.** Owner MRR + 30/60/90 are
  computed live from the Square API (current members + signup/cancel dates). If
  a client later needs MRR reconstructed at past dates *through* price changes,
  that needs a persisted event log (the webhook already sees every MemberEvent).
  Deferred with the datastore decision.
