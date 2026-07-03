// GET /owner/members.csv — member list export. Ownership/portability is a core
// promise, so this is real: the owner can pull their whole list any time.
// Protected by the /owner middleware gate.

import type { APIRoute } from 'astro';
import { activeInstance } from '../../instances/index.js';
import { billingProvider } from '../../lib/providers.js';
import { toCsv } from '../../lib/metrics.js';

export const prerender = false;

export const GET: APIRoute = async () => {
  const instance = activeInstance();
  let members;
  try {
    members = await billingProvider(instance).listMembers();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return new Response(`Could not load members from the processor: ${msg}\n`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const csv = toCsv(members);
  const filename = `${instance.id}-members.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
};
