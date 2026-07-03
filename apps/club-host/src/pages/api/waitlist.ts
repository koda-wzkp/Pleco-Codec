// POST /api/waitlist — founding-member waitlist capture (Sunset).
//
// Body (JSON, from the engine's WaitlistForm):
//   { firstName, email, tierInterest, addOnInterest, company }
//
// - `company` is the honeypot: any non-empty value = bot; silently 200 and drop.
// - tier + add-on interest become the free-text note carried in the owner
//   notification (Resend contacts have no note field).
// - handleWaitlistSignup upserts the contact (idempotent) AND emails the owner.

import type { APIRoute } from 'astro';
import { activeInstance } from '../../instances/index.js';
import { comms } from '../../lib/providers.js';

export const prerender = false;

interface WaitlistBody {
  firstName?: string;
  email?: string;
  tierInterest?: string;
  addOnInterest?: boolean;
  company?: string; // honeypot
}

export const POST: APIRoute = async ({ request }) => {
  const instance = activeInstance();

  let body: WaitlistBody;
  try {
    body = (await request.json()) as WaitlistBody;
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  // Honeypot: a filled `company` field means a bot. Acknowledge with 200 so the
  // bot sees success, but do nothing.
  if (body.company && body.company.trim().length > 0) {
    return json({ ok: true });
  }

  const email = (body.email ?? '').trim();
  if (!email || !email.includes('@')) {
    return json({ ok: false, error: 'a valid email is required' }, 422);
  }

  const firstName = body.firstName?.trim() || undefined;
  const note = buildNote(instance, body);

  try {
    await comms(instance).handleWaitlistSignup({ email, firstName, note });
  } catch {
    return json({ ok: false, error: 'could not join right now' }, 500);
  }

  return json({ ok: true });
};

function buildNote(
  instance: ReturnType<typeof activeInstance>,
  body: WaitlistBody,
): string | undefined {
  const parts: string[] = [];
  if (body.tierInterest && body.tierInterest !== 'not-sure') {
    const tier = instance.config.program.tiers.find((t) => t.id === body.tierInterest);
    parts.push(`interested in ${tier?.label ?? body.tierInterest}`);
  } else if (body.tierInterest === 'not-sure') {
    parts.push('undecided on tier');
  }
  if (body.addOnInterest) parts.push('wants the add-on');
  return parts.length ? parts.join('; ') : undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
