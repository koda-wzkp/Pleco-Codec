// Living Room Wines — Portland, OR.
// Operating wine bar (Toast POS shop), migrating a club OFF Table22.
// Processor: STRIPE (Toast has no subscription rails). Direct-to-billing now.
// Emphasis: self-serve member management via the Stripe customer portal — the
// value that replaces Table22's email-support model.
//
// Migration is a re-enrollment: no card portability from Table22, so members
// re-sign via the checkout links below; run one billing cycle of overlap, then
// sunset the Table22 listing. Budget for some churn in the proposal.
//
// launch.mode = "billing": tier CTAs are hosted Stripe payment links, produced
// by StripeProvider.checkoutUrl (or copied from the Stripe dashboard) and pasted
// here. Prices are placeholders pending confirmation with the venue.

import type { ClubInstance } from './types.js';

export const livingRoom: ClubInstance = {
  id: 'living-room',
  config: {
    venueName: 'Living Room Wines',
    processor: 'stripe',
    program: {
      name: 'The Living Room Wine Club',
      cadence: 'monthly',
      tiers: [
        {
          id: 'lr-2',
          label: 'Two-Bottle',
          priceCents: 5000, // PLACEHOLDER — confirm with the venue
          description: 'Two bottles a month, chosen by the bar, ready for pickup.',
        },
        {
          id: 'lr-4',
          label: 'Four-Bottle',
          priceCents: 9000, // PLACEHOLDER — confirm with the venue
          description: 'Four bottles a month for the household that pours often.',
        },
      ],
      fulfillment: 'pickup',
    },
    retentionRitual: {
      name: 'Members’ pour night',
      calendarNote: 'Monthly members’ tasting at the bar, timed with pickup.',
    },
    launch: {
      mode: 'billing',
      // VERIFY before launch: regenerate via StripeProvider.checkoutUrl against
      // the live prices, or copy the payment links from the Stripe dashboard.
      checkoutUrls: {
        'lr-2': 'https://buy.stripe.com/REPLACE-living-room-2',
        'lr-4': 'https://buy.stripe.com/REPLACE-living-room-4',
      },
    },
    ownerNotifyEmail: 'club@livingroomwines.example',
    resendAudienceId: 'REPLACE_LRW_RESEND_AUDIENCE_ID',
    scope: {
      carePlan: false,
      included:
        'One-time build: migrate the club off Table22 onto Living Room’s own Stripe, member self-serve portal, re-enrollment campaign.',
      handoffDocUrl: 'https://REPLACE/living-room-handoff',
    },
  },
  copy: {
    headline: 'The Living Room Wine Club',
    intro:
      'Our wine club is moving in-house — same club, now on our own rails, with everything you manage yourself. Re-join below; you’ll get a member portal to pause, skip, or update your card anytime.',
    tiersHeading: 'Re-join the club',
    perks: [
      'Bottles chosen by the bar, ready for pickup',
      'Members’ pour night each month',
      'Manage everything yourself — pause, skip, cancel, update card',
      'Founding-migration pricing for returning members',
    ],
    successCopy: 'You’re re-enrolled — welcome home. Watch your inbox for pickup details.',
    errorCopy: 'That didn’t go through on our side — nothing you did. Your info is intact; try once more in a moment.',
  },
  contactEmail: 'hello@livingroomwines.example',
  fromAddress: 'Living Room Wine Club <club@livingroomwines.example>',
  welcomeNextStep:
    'You can manage your membership anytime from the link in this email — pause, skip, or update your card yourself.',
};
