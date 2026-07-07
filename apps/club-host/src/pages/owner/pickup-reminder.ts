// POST /owner/pickup-reminder — owner-triggered pickup/fulfillment reminder.
// Sends the pickup-reminder campaign to the audience's subscribed (active)
// members. Gated by the /owner middleware. Redirects back to the dashboard
// with a flash result in the query string.

import type { APIRoute } from 'astro';
import { activeInstance } from '../../instances/index.js';
import { comms } from '../../lib/providers.js';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const instance = activeInstance();
  const form = await request.formData();
  const pickupOn = String(form.get('pickupOn') ?? '').trim();
  const details = String(form.get('details') ?? '').trim() || undefined;

  if (!pickupOn) {
    return redirect('/owner?pickup=' + encodeURIComponent('error:enter a pickup date'), 302);
  }

  try {
    const sent = await comms(instance).pickupReminderCampaign({ pickupOn, details });
    return redirect('/owner?pickup=' + encodeURIComponent(`sent:${sent}`), 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'send failed';
    return redirect('/owner?pickup=' + encodeURIComponent(`error:${msg}`), 302);
  }
};
