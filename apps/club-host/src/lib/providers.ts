// Factory: turn the active ClubInstance + env secrets into engine objects.
// This is the ONLY place a concrete processor adapter is constructed; the
// pages and routes talk to the BillingProvider interface and never branch on
// processor (acceptance: no processor branching outside the adapter/config layer).

import {
  SquareProvider,
  StripeProvider,
  type BillingProvider,
} from 'pleco-codec/billing';
import { ResendComms } from 'pleco-codec/comms';
import type { ClubInstance } from '../instances/types.js';
import { env, requireEnv } from './env.js';

/** Build the billing adapter named by the instance config. */
export function billingProvider(instance: ClubInstance): BillingProvider {
  const program = instance.config.program;
  const tierPrices = Object.fromEntries(
    program.tiers.map((t) => [t.id, t.priceCents]),
  );

  switch (instance.config.processor) {
    case 'square':
      return new SquareProvider({
        accessToken: requireEnv('SQUARE_ACCESS_TOKEN'),
        locationId: requireEnv('SQUARE_LOCATION_ID'),
        webhookSignatureKey: requireEnv('SQUARE_WEBHOOK_SIGNATURE_KEY'),
        webhookNotificationUrl: requireEnv('SQUARE_WEBHOOK_NOTIFICATION_URL'),
        environment: env('SQUARE_ENV') === 'production' ? 'production' : 'sandbox',
        redirectUrl: env('SQUARE_REDIRECT_URL'),
        manageFallbackUrl: env('SQUARE_MANAGE_URL'),
        ownerEmail: instance.config.ownerNotifyEmail,
        // Reverse map (tierId -> plan variation id), set after createPlan and
        // supplied via env so parseWebhook can label activated events by tier.
        tierRefs: parseTierRefs(env('SQUARE_TIER_REFS')),
        tierPrices,
      });
    case 'stripe':
      // Living Room class. StripeProvider is a stub until the Stripe adapter is
      // built (Phase 1 follow-on) — this constructs it so the wiring is correct;
      // its methods throw NotImplementedError until implemented.
      return new StripeProvider({
        secretKey: requireEnv('STRIPE_SECRET_KEY'),
        webhookSigningSecret: requireEnv('STRIPE_WEBHOOK_SIGNING_SECRET'),
        portalReturnUrl: env('STRIPE_PORTAL_RETURN_URL'),
      });
  }
}

/**
 * Processor-blind "manage your membership" href for the footer link. Resolves
 * the right static surface from env (Square buyer-account page or Stripe portal
 * return), falling back to a mailto. Kept here in the adapter/config layer so
 * pages never reference a processor-specific env var.
 */
export function manageHref(instance: ClubInstance): string {
  return (
    env('SQUARE_MANAGE_URL') ??
    env('STRIPE_PORTAL_RETURN_URL') ??
    `mailto:${instance.contactEmail}`
  );
}

/** Build the Resend comms layer for the instance. */
export function comms(instance: ClubInstance): ResendComms {
  return new ResendComms({
    apiKey: requireEnv('RESEND_API_KEY'),
    audienceId: instance.config.resendAudienceId,
    from: instance.fromAddress,
    ownerEmail: instance.config.ownerNotifyEmail,
    venueName: instance.config.venueName,
    contactEmail: instance.contactEmail,
    manageUrl: env('SQUARE_MANAGE_URL') ?? env('STRIPE_PORTAL_RETURN_URL'),
    welcomeNextStep: instance.welcomeNextStep,
  });
}

/** Parse SQUARE_TIER_REFS="club-2=VAR1,club-4=VAR2" into a record. */
function parseTierRefs(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [tier, ref] = pair.split('=');
    if (tier && ref) out[tier.trim()] = ref.trim();
  }
  return Object.keys(out).length ? out : undefined;
}
