// Sunset Wine and Tapas — Carrabelle, FL.
// Pre-open pickup wine club. Founding-member WAITLIST that converts to billing
// when the venue opens (Sept go-live). Processor: Square.
//
// launch.mode = "waitlist": tier CTAs point at the on-page waitlist form
// (anchor "#join"). At go-live, flip this block to:
//   launch: { mode: 'billing', checkoutUrls: { 'club-2': '…', 'club-4': '…' } }
// and the same tier panels render as hosted checkout links. That one-line flip
// is Sunset's Sept switchover — no rebuild.

import type { ClubInstance } from './types.js';

export const sunset: ClubInstance = {
  id: 'sunset',
  config: {
    venueName: 'Sunset Wine and Tapas',
    processor: 'square',
    program: {
      name: 'The Sunset Wine Club',
      cadence: 'monthly',
      tiers: [
        {
          id: 'club-2',
          label: 'Club 2',
          priceCents: 4000,
          description: 'Two bottles a month, chosen by the house, ready at pickup.',
        },
        {
          id: 'club-4',
          label: 'Club 4',
          priceCents: 6500,
          description: 'Four bottles a month for the household that entertains.',
        },
        {
          id: 'club-2-reserve',
          label: 'Club 2 + Reserve',
          priceCents: 4000,
          description: 'Club 2 plus first dibs on the Reserve add-on when it opens. (Placeholder tier — pricing set at launch.)',
        },
      ],
      fulfillment: 'pickup',
    },
    retentionRitual: {
      name: 'Members’ tasting night',
      calendarNote: 'First Thursday monthly, timed with bottle pickup.',
    },
    launch: {
      mode: 'waitlist',
      anchor: '#join',
      switchover: 'Billing begins at venue open (targeting September); founding list is charged first.',
    },
    ownerNotifyEmail: 'club@sunsetwine.example',
    resendAudienceId: 'REPLACE_SUNSET_RESEND_AUDIENCE_ID',
    scope: {
      carePlan: false,
      included: 'One-time build: founding-member waitlist, launch campaign, wine-club billing on Sunset’s own Square.',
      handoffDocUrl: 'https://REPLACE/sunset-handoff',
    },
  },
  copy: {
    headline: 'The Sunset Wine Club',
    intro:
      'A pickup-only wine club on the Carrabelle coast. Join the founding list now — you’re only charged when we open our doors and your first pickup is ready.',
    tiersHeading: 'Reserve your founding spot',
    perks: [
      'Founding-member pricing, locked for good',
      'Members’ tasting night, first Thursday each month',
      'Bottles chosen by the house, ready for pickup',
      'No charge until we open — your spot is held free',
    ],
    successCopy: 'You’re on the founding list. We’ll email you before anyone else when memberships open.',
    errorCopy: 'That didn’t go through on our side — nothing you did. Your info is intact; try once more in a moment.',
    waitlistAddOnLabel: 'Interested in the Reserve add-on when it opens',
  },
  contactEmail: 'hello@sunsetwine.example',
  fromAddress: 'Sunset Wine Club <club@sunsetwine.example>',
  welcomeNextStep:
    'We’ll be in touch before your first pickup with everything you need to know.',
};
