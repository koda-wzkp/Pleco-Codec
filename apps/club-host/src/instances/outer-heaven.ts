// Outer Heaven Espresso — Nevada City, CA.
// Operating shop, pickup bean club, DIRECT-TO-BILLING now (no waitlist).
// Processor: Square. Comms timed to the roast -> pickup schedule.
//
// launch.mode = "billing": tier CTAs are hosted Square checkout links. The
// checkout URLs are produced by SquareProvider.checkoutUrl at deploy time (or
// filled from the Square dashboard) and pasted here — flipping a club live is
// a config change, not a rebuild.

import type { ClubInstance } from './types.js';

export const outerHeaven: ClubInstance = {
  id: 'outer-heaven',
  config: {
    venueName: 'Outer Heaven Espresso',
    processor: 'square',
    program: {
      name: 'The Outer Heaven Bean Club',
      cadence: 'monthly',
      tiers: [
        {
          id: 'beans-2',
          label: '2-Bag',
          priceCents: 3600,
          description: 'Two bags a month, roasted to order, ready at pickup.',
        },
        {
          id: 'beans-4',
          label: '4-Bag',
          priceCents: 6800,
          description: 'Four bags a month for the serious household or a shared habit.',
        },
      ],
      fulfillment: 'pickup',
    },
    retentionRitual: {
      name: 'Roast-day pickup',
      calendarNote: 'Beans roasted the same week, pickup timed to peak freshness.',
    },
    launch: {
      mode: 'billing',
      // VERIFY before launch: regenerate via SquareProvider.checkoutUrl against
      // the live plan, or copy from Square Dashboard -> the plan variation's
      // payment link. Placeholders until the real Square plan exists.
      checkoutUrls: {
        'beans-2': 'https://checkout.square.site/REPLACE-outer-heaven-beans-2',
        'beans-4': 'https://checkout.square.site/REPLACE-outer-heaven-beans-4',
      },
    },
    ownerNotifyEmail: 'roasts@outerheaven.example',
    resendAudienceId: 'REPLACE_OHE_RESEND_AUDIENCE_ID',
    scope: {
      carePlan: false,
      included: 'One-time build: bean-club billing on Outer Heaven’s own Square, signup page, roast-day comms.',
      handoffDocUrl: 'https://REPLACE/outer-heaven-handoff',
    },
  },
  copy: {
    headline: 'The Outer Heaven Bean Club',
    intro:
      'Fresh-roasted beans, reserved for members and timed to the roast. Pick up at the shop the week they’re roasted — never a stale bag.',
    tiersHeading: 'Choose your monthly haul',
    perks: [
      'Roasted to order, never sitting on a shelf',
      'Pickup timed to the roast for peak freshness',
      'Member-only single-origin drops',
      'Skip or cancel anytime — it’s your subscription',
    ],
    successCopy: 'You’re in. Watch your inbox for pickup timing before the next roast.',
    errorCopy: 'Something on our end hiccuped — your details are safe. Give it another tap in a moment.',
  },
  contactEmail: 'hello@outerheaven.example',
  fromAddress: 'Outer Heaven Bean Club <club@outerheaven.example>',
  welcomeNextStep:
    'We roast weekly; we’ll email you the day your beans are ready for pickup.',
};
