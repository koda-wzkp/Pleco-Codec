// End-to-end: a signed Square webhook → MemberEvent → Resend comms fan-out,
// with idempotent redelivery. Mirrors the algorithm in
// src/pages/api/webhooks/billing.ts, exercised against the real built engine
// (pleco-codec) with global fetch mocked (no live Square/Resend).
//
// This is the acceptance path: "webhook→MemberEvent→comms covered end-to-end."
// The live-processor $1-tier version needs real Square credentials and is run
// in staging (documented in the app README).

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { SquareProvider, StripeProvider } from 'pleco-codec/billing';
import { ResendComms } from 'pleco-codec/comms';

const SIG_KEY = 'test-sig-key';
const NOTIFY_URL = 'https://club.example/api/webhooks/billing';

function makeProvider() {
  return new SquareProvider({
    accessToken: 'test-token',
    locationId: 'L1',
    webhookSignatureKey: SIG_KEY,
    webhookNotificationUrl: NOTIFY_URL,
    environment: 'sandbox',
    ownerEmail: 'owner@venue.example',
    tierRefs: { 'beans-2': 'VAR-2' },
  });
}

function makeComms() {
  return new ResendComms({
    apiKey: 'test-resend',
    audienceId: 'aud_1',
    from: 'Bean Club <club@venue.example>',
    ownerEmail: 'owner@venue.example',
    venueName: 'Outer Heaven Espresso',
    contactEmail: 'hello@venue.example',
  });
}

function sign(body) {
  return createHmac('sha256', SIG_KEY).update(NOTIFY_URL + body).digest('base64');
}

function webhookRequest(body) {
  return new Request(NOTIFY_URL, {
    method: 'POST',
    headers: { 'x-square-hmacsha256-signature': sign(body) },
    body,
  });
}

// Install a fetch mock that answers Square customer lookups and records every
// Resend call. Returns { calls, restore }.
function mockFetch() {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = typeof url === 'string' ? url : url.url;
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method, body });
    // Square customer lookup
    if (u.includes('/v2/customers/')) {
      return new Response(
        JSON.stringify({ customer: { email_address: 'member@example.com' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // Stripe customer lookup
    if (u.includes('api.stripe.com/v1/customers/')) {
      return new Response(
        JSON.stringify({ id: 'cus_1', email: 'member@example.com' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // Resend endpoints (contacts upsert, emails) — 200/201 OK
    if (u.includes('api.resend.com')) {
      return new Response(JSON.stringify({ id: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch to ${u}`);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// The route's algorithm, extracted so the test exercises the exact sequence.
async function handleWebhook(provider, comms, seen, req) {
  const raw = await req.clone().text();
  const eventId = provider.webhookEventId(raw);
  if (eventId && seen.has(eventId)) return { deduped: true };
  const event = await provider.parseWebhook(req);
  if (!event) { if (eventId) seen.add(eventId); return { ignored: true }; }
  await comms.dispatchMemberEvent(event);
  if (eventId) seen.add(eventId);
  return { type: event.type };
}

test('subscription.created → activated → welcome + owner notify (Resend)', async () => {
  const fm = mockFetch();
  try {
    const provider = makeProvider();
    const comms = makeComms();
    const seen = new Set();
    const body = JSON.stringify({
      event_id: 'evt-100',
      type: 'subscription.created',
      created_at: '2026-07-03T00:00:00Z',
      data: { object: { subscription: { customer_id: 'CUST1', status: 'ACTIVE', plan_variation_id: 'VAR-2' } } },
    });

    const r1 = await handleWebhook(provider, comms, seen, webhookRequest(body));
    assert.equal(r1.type, 'activated');

    // Resend received: a contact upsert, a member welcome email, an owner notify.
    const emailCalls = fm.calls.filter((c) => c.url.endsWith('/emails'));
    const contactCalls = fm.calls.filter((c) => c.url.includes('/contacts'));
    assert.equal(contactCalls.length, 1, 'one contact upsert');
    assert.equal(emailCalls.length, 2, 'member welcome + owner notification');
    const recipients = emailCalls.map((c) => c.body.to[0]).sort();
    assert.deepEqual(recipients, ['member@example.com', 'owner@venue.example']);
    const welcome = emailCalls.find((c) => c.body.to[0] === 'member@example.com');
    assert.match(welcome.body.subject, /Welcome to Outer Heaven Espresso/);

    // Idempotent redelivery: same event id → no new Resend calls.
    const before = fm.calls.length;
    const r2 = await handleWebhook(provider, comms, seen, webhookRequest(body));
    assert.equal(r2.deduped, true);
    assert.equal(fm.calls.length, before, 'redelivery makes no further calls');
  } finally {
    fm.restore();
  }
});

test('payment_failed → member nudge + owner flag', async () => {
  const fm = mockFetch();
  try {
    const provider = makeProvider();
    const comms = makeComms();
    const seen = new Set();
    const body = JSON.stringify({
      event_id: 'evt-200',
      type: 'invoice.scheduled_charge_failed',
      created_at: '2026-07-03T01:00:00Z',
      data: { object: { invoice: { primary_recipient: { email_address: 'member@example.com' } } } },
    });
    const r = await handleWebhook(provider, comms, seen, webhookRequest(body));
    assert.equal(r.type, 'payment_failed');
    const emailCalls = fm.calls.filter((c) => c.url.endsWith('/emails'));
    // member nudge + owner flag (no contact mutation on payment_failed)
    assert.equal(emailCalls.length, 2);
    const nudge = emailCalls.find((c) => c.body.to[0] === 'member@example.com');
    assert.match(nudge.body.subject, /card/i);
  } finally {
    fm.restore();
  }
});

test('Stripe: signed subscription.created → activated → welcome + owner notify', async () => {
  const SECRET = 'whsec_test';
  const fm = mockFetch();
  try {
    const provider = new StripeProvider({
      secretKey: 'sk_test',
      webhookSigningSecret: SECRET,
      tierRefs: { 'lr-2': 'price_2' },
      tierPrices: { 'lr-2': 5000 },
    });
    const comms = new ResendComms({
      apiKey: 'r', audienceId: 'aud_1', from: 'Wine Club <club@venue.example>',
      ownerEmail: 'owner@venue.example', venueName: 'Living Room Wines',
    });
    const seen = new Set();
    const body = JSON.stringify({
      id: 'evt_lr_1',
      type: 'customer.subscription.created',
      created: 1767225600,
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ price: { id: 'price_2' } }] } } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
    const req = new Request('https://venue.example/api/webhooks/billing', {
      method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${v1}` }, body,
    });

    const r = await handleWebhook(provider, comms, seen, req);
    assert.equal(r.type, 'activated');
    const emailCalls = fm.calls.filter((c) => c.url.endsWith('/emails'));
    assert.equal(emailCalls.length, 2, 'member welcome + owner notify');
    const recipients = emailCalls.map((c) => c.body.to[0]).sort();
    assert.deepEqual(recipients, ['member@example.com', 'owner@venue.example']);
  } finally {
    fm.restore();
  }
});

test('bad signature → parseWebhook throws (never processed)', async () => {
  const fm = mockFetch();
  try {
    const provider = makeProvider();
    const comms = makeComms();
    const seen = new Set();
    const body = JSON.stringify({ event_id: 'evt-x', type: 'subscription.created', data: {} });
    const bad = new Request(NOTIFY_URL, {
      method: 'POST',
      headers: { 'x-square-hmacsha256-signature': 'AAAAbad' },
      body,
    });
    await assert.rejects(handleWebhook(provider, comms, seen, bad), /invalid webhook signature/);
    assert.equal(fm.calls.filter((c) => c.url.endsWith('/emails')).length, 0);
  } finally {
    fm.restore();
  }
});
