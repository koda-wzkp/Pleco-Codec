// POST /api/webhooks/billing — the processor's webhook endpoint.
//
// Flow (processor-blind; spec §4):
//   raw body → provider.webhookEventId → dedupe (idempotency store)
//            → provider.parseWebhook (verify signature) → MemberEvent
//            → comms.dispatchMemberEvent (member email + owner notify)
//            → mark event id seen (only after successful dispatch, so a failed
//              dispatch is safely retried on the processor's redelivery).
//
// This route never names a processor: which adapter runs is decided by the
// active instance's config.processor, inside billingProvider().

import type { APIRoute } from 'astro';
import { activeInstance } from '../../../instances/index.js';
import { billingProvider, comms } from '../../../lib/providers.js';
import { idempotencyStore } from '../../../lib/idempotency.js';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const instance = activeInstance();
  const provider = billingProvider(instance);

  // Read the raw body once; parseWebhook needs the exact bytes for signature
  // verification, so hand it a fresh Request carrying the same body + headers.
  const raw = await request.text();

  // Idempotency: skip event ids we've already fully processed.
  const eventId = provider.webhookEventId(raw);
  if (eventId && (await idempotencyStore.seen(eventId))) {
    return json({ ok: true, deduped: true });
  }

  let event;
  try {
    const verifiable = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: raw,
    });
    event = await provider.parseWebhook(verifiable);
  } catch (err) {
    // Bad/missing signature or unparseable body: reject, do not process.
    return json({ ok: false, error: 'invalid webhook' }, 400);
  }

  if (!event) {
    // Irrelevant event (not part of the member lifecycle). Record the id so we
    // don't re-examine redeliveries, and acknowledge.
    if (eventId) await idempotencyStore.markSeen(eventId);
    return json({ ok: true, ignored: true });
  }

  try {
    await comms(instance).dispatchMemberEvent(event);
  } catch (err) {
    // Comms failed — return 5xx so the processor redelivers and we retry.
    // Do NOT mark seen.
    return json({ ok: false, error: 'dispatch failed' }, 500);
  }

  if (eventId) await idempotencyStore.markSeen(eventId);
  return json({ ok: true, type: event.type });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
