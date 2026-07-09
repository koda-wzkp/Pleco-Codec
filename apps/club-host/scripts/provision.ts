// Client provisioning — one-time setup for a club instance.
//
// For the active instance (HAPTERA_INSTANCE), creates the plan on the client's
// processor and generates a hosted checkout link per tier, then prints:
//   1. the SQUARE_/STRIPE_TIER_REFS env line to paste into the deploy env
//   2. the `checkoutUrls` block to paste into the instance's `launch` config
//
// This is what makes onboarding config-only in practice: run it once with the
// client's live (or sandbox) credentials, paste the two outputs, flip launch
// mode to billing, deploy. Processor-blind: it talks to the BillingProvider
// interface; only the env-var name is chosen by processor.
//
// Usage:
//   cd apps/club-host
//   cp .env.example .env   # fill in the processor + Resend secrets
//   HAPTERA_INSTANCE=outer-heaven npx tsx --env-file=.env scripts/provision.ts
//
// Nothing here writes files or sends email; it only creates the plan + links.

import { activeInstance } from '../src/instances/index.js';
import { billingProvider } from '../src/lib/providers.js';
import type { TierId } from 'pleco-haptera/billing';

const instance = activeInstance();
const { config } = instance;
const provider = billingProvider(instance);

console.log(`\nProvisioning "${config.venueName}" on ${config.processor}…\n`);

const plan = await provider.createPlan(config.program);
console.log('PlanRef.providerId:', plan.providerId);

const refEnv = config.processor === 'square' ? 'SQUARE_TIER_REFS' : 'STRIPE_TIER_REFS';
const refLine = Object.entries(plan.tierRefs)
  .map(([tier, ref]) => `${tier}=${ref}`)
  .join(',');

const checkoutUrls: Record<TierId, string> = {};
for (const tier of config.program.tiers) {
  checkoutUrls[tier.id] = await provider.checkoutUrl(plan, tier.id);
}

console.log('\n── 1. Paste into the deploy environment ──');
console.log(`${refEnv}=${refLine}`);

console.log(`\n── 2. Paste into src/instances/${instance.id}.ts (launch block) ──`);
console.log('    launch: {');
console.log('      mode: "billing",');
console.log('      checkoutUrls: ' + JSON.stringify(checkoutUrls, null, 8).replace(/\n/g, '\n      ') + ',');
console.log('    },');

console.log('\nDone. Flip launch mode to "billing" (if not already) and redeploy.\n');
