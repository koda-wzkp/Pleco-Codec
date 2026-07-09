// A host "instance" = the engine's CodecInstanceConfig (processor, program,
// launch mode, comms/owner, scope) PLUS the presentation data a rendered site
// needs (brand copy, perks, addresses). Nothing here names a processor outside
// `config.processor` — the pages stay processor-blind.
//
// Acceptance test: a new client is representable by one object of this type, with
// NO changes to packages/codec or to the host's pages/routes.

import type { CodecInstanceConfig } from 'pleco-codec/config';

export interface ClubInstance {
  /** URL-safe id, also the CODEC_INSTANCE selector value. */
  id: string;

  /** The engine instance spec (drives billing, comms, launch mode). */
  config: CodecInstanceConfig;

  /** Presentation copy for the club page. */
  copy: {
    /** Big page headline, e.g. "The Outer Heaven Bean Club". */
    headline: string;
    /** One-paragraph intro under the headline. */
    intro: string;
    /** Section heading above the tiers. */
    tiersHeading: string;
    /** Member perks rendered as a list. */
    perks: string[];
    /** Post-signup / waitlist success copy. */
    successCopy: string;
    /** Never-blames-the-user error copy for the waitlist form. */
    errorCopy: string;
    /** Optional add-on interest label for the waitlist (Sunset's Reserve). */
    waitlistAddOnLabel?: string;
  };

  /** Public contact address surfaced in member copy + reply-to. */
  contactEmail: string;

  /** "From" address for outbound member mail, e.g. "Bean Club <club@venue.com>". */
  fromAddress: string;

  /** "What happens next" line for the welcome email (first pickup, etc.). */
  welcomeNextStep?: string;
}
