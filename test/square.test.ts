import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  SquareProvider,
  webhookEventId,
  type ClubProgram,
} from "../src/billing/index.js";
import { mockFetch } from "./helpers.js";

const SIGNATURE_KEY = "test-signature-key";
const NOTIFICATION_URL = "https://example.com/api/webhooks/billing";

function provider(extra: Record<string, unknown> = {}) {
  return new SquareProvider({
    accessToken: "test-token",
    locationId: "L123",
    webhookSignatureKey: SIGNATURE_KEY,
    webhookNotificationUrl: NOTIFICATION_URL,
    environment: "sandbox",
    ownerEmail: "owner@example.com",
    ...extra,
  });
}

function sign(body: string): string {
  return createHmac("sha256", SIGNATURE_KEY)
    .update(NOTIFICATION_URL + body)
    .digest("base64");
}

function webhookRequest(body: string, signature = sign(body)): Request {
  return new Request(NOTIFICATION_URL, {
    method: "POST",
    headers: { "x-square-hmacsha256-signature": signature },
    body,
  });
}

const program: ClubProgram = {
  name: "The Test Wine Club",
  cadence: "monthly",
  tiers: [
    { id: "club-2", label: "Club 2", priceCents: 4000, description: "2 bottles" },
    { id: "club-4", label: "Club 4", priceCents: 6500, description: "4 bottles" },
  ],
  fulfillment: "pickup",
};

// ------------------------------------------------------------- signatures

test("parseWebhook accepts a correctly signed payload", async () => {
  const body = JSON.stringify({
    event_id: "evt-1",
    type: "subscription.created",
    created_at: "2026-07-02T00:00:00Z",
    data: {
      object: { subscription: { customer_id: "CUST1", status: "ACTIVE" } },
    },
  });
  const fm = mockFetch({
    "/v2/customers/CUST1": { customer: { email_address: "member@example.com" } },
  });
  try {
    const event = await provider().parseWebhook(webhookRequest(body));
    assert.ok(event);
    assert.equal(event.type, "activated");
    assert.equal(event.email, "member@example.com");
    assert.equal(event.at, "2026-07-02T00:00:00Z");
  } finally {
    fm.restore();
  }
});

test("parseWebhook throws on a bad signature", async () => {
  const body = JSON.stringify({ type: "subscription.created" });
  await assert.rejects(
    provider().parseWebhook(webhookRequest(body, "AAAA" + sign(body).slice(4))),
    /invalid webhook signature/,
  );
});

test("parseWebhook throws on a missing signature", async () => {
  const body = JSON.stringify({ type: "subscription.created" });
  const req = new Request(NOTIFICATION_URL, { method: "POST", body });
  await assert.rejects(provider().parseWebhook(req), /invalid webhook signature/);
});

test("parseWebhook returns null for irrelevant event types", async () => {
  const body = JSON.stringify({ type: "catalog.version.updated", data: {} });
  const event = await provider().parseWebhook(webhookRequest(body));
  assert.equal(event, null);
});

// ---------------------------------------------------------- event mapping

test("subscription.created maps to activated with tier reverse-mapped", async () => {
  const body = JSON.stringify({
    type: "subscription.created",
    created_at: "2026-07-02T00:00:00Z",
    data: {
      object: {
        subscription: {
          customer_id: "CUST1",
          status: "ACTIVE",
          plan_variation_id: "VAR-CLUB-2",
        },
      },
    },
  });
  const fm = mockFetch({
    "/v2/customers/CUST1": { customer: { email_address: "m@example.com" } },
  });
  try {
    const p = provider({ tierRefs: { "club-2": "VAR-CLUB-2", "club-4": "VAR-CLUB-4" } });
    const event = await p.parseWebhook(webhookRequest(body));
    assert.deepEqual(event, {
      type: "activated",
      email: "m@example.com",
      tier: "club-2",
      at: "2026-07-02T00:00:00Z",
    });
  } finally {
    fm.restore();
  }
});

for (const [status, expected] of [
  ["PAUSED", "paused"],
  ["ACTIVE", "resumed"],
  ["CANCELED", "canceled"],
  ["DEACTIVATED", "canceled"],
] as const) {
  test(`subscription.updated with status ${status} maps to ${expected}`, async () => {
    const body = JSON.stringify({
      type: "subscription.updated",
      created_at: "2026-07-02T01:00:00Z",
      data: { object: { subscription: { customer_id: "CUST1", status } } },
    });
    const fm = mockFetch({
      "/v2/customers/CUST1": { customer: { email_address: "m@example.com" } },
    });
    try {
      const event = await provider().parseWebhook(webhookRequest(body));
      assert.ok(event);
      assert.equal(event.type, expected);
      assert.equal(event.email, "m@example.com");
    } finally {
      fm.restore();
    }
  });
}

test("invoice.scheduled_charge_failed maps to payment_failed using invoice recipient email", async () => {
  const body = JSON.stringify({
    type: "invoice.scheduled_charge_failed",
    created_at: "2026-07-02T02:00:00Z",
    data: {
      object: {
        invoice: { primary_recipient: { email_address: "m@example.com" } },
      },
    },
  });
  const event = await provider().parseWebhook(webhookRequest(body));
  assert.deepEqual(event, {
    type: "payment_failed",
    email: "m@example.com",
    at: "2026-07-02T02:00:00Z",
  });
});

test("webhookEventId extracts Square's event_id for dedupe", () => {
  assert.equal(webhookEventId(JSON.stringify({ event_id: "evt-42" })), "evt-42");
  assert.equal(webhookEventId("not json"), null);
  assert.equal(webhookEventId("{}"), null);
});

// ----------------------------------------------------------------- plans

test("createPlan (pickup) upserts a SUBSCRIPTION_PLAN plus one variation per tier", async () => {
  const fm = mockFetch({
    "/v2/catalog/batch-upsert": {
      id_mappings: [
        { client_object_id: "#plan", object_id: "PLAN-REAL" },
        { client_object_id: "#tier-club-2", object_id: "VAR-2-REAL" },
        { client_object_id: "#tier-club-4", object_id: "VAR-4-REAL" },
      ],
    },
  });
  try {
    const ref = await provider().createPlan(program);
    assert.equal(ref.providerId, "PLAN-REAL");
    assert.deepEqual(ref.tierRefs, { "club-2": "VAR-2-REAL", "club-4": "VAR-4-REAL" });

    const call = fm.calls[0]!;
    assert.equal(call.method, "POST");
    assert.ok(call.url.startsWith("https://connect.squareupsandbox.com"));
    assert.equal(call.headers["authorization"], "Bearer test-token");

    const objects = call.body.batches[0].objects;
    assert.equal(objects[0].type, "SUBSCRIPTION_PLAN");
    assert.equal(objects[0].subscription_plan_data.name, "The Test Wine Club");
    assert.equal(objects.length, 3);
    const variation = objects[1];
    assert.equal(variation.type, "SUBSCRIPTION_PLAN_VARIATION");
    const phase = variation.subscription_plan_variation_data.phases[0];
    assert.equal(phase.cadence, "MONTHLY");
    assert.equal(phase.pricing.type, "STATIC");
    assert.equal(phase.pricing.price_money.amount, 4000);
  } finally {
    fm.restore();
  }
});

test("createPlan rejects fulfillment ship with a clear error (spec §6)", async () => {
  await assert.rejects(
    provider().createPlan({ ...program, fulfillment: "ship" }),
    /catalog-item|order-template/,
  );
});

test("weekly and quarterly cadences map to WEEKLY / QUARTERLY", async () => {
  for (const [cadence, expected] of [
    ["weekly", "WEEKLY"],
    ["quarterly", "QUARTERLY"],
  ] as const) {
    const fm = mockFetch({
      "/v2/catalog/batch-upsert": {
        id_mappings: [
          { client_object_id: "#plan", object_id: "P" },
          { client_object_id: "#tier-club-2", object_id: "V2" },
          { client_object_id: "#tier-club-4", object_id: "V4" },
        ],
      },
    });
    try {
      await provider().createPlan({ ...program, cadence });
      const phase =
        fm.calls[0]!.body.batches[0].objects[1].subscription_plan_variation_data
          .phases[0];
      assert.equal(phase.cadence, expected);
    } finally {
      fm.restore();
    }
  }
});

// -------------------------------------------------------------- checkout

test("checkoutUrl creates a payment link carrying the tier's variation id", async () => {
  const fm = mockFetch({
    "/v2/online-checkout/payment-links": {
      payment_link: { url: "https://checkout.example/pay/abc" },
    },
  });
  try {
    const p = provider({ redirectUrl: "https://venue.example/thanks" });
    const url = await p.checkoutUrl(
      { providerId: "PLAN", tierRefs: { "club-2": "VAR-2" } },
      "club-2",
    );
    assert.equal(url, "https://checkout.example/pay/abc");
    const call = fm.calls[0]!;
    assert.equal(call.body.checkout_options.subscription_plan_id, "VAR-2");
    assert.equal(call.body.checkout_options.redirect_url, "https://venue.example/thanks");
    assert.equal(call.body.quick_pay.location_id, "L123");
  } finally {
    fm.restore();
  }
});

test("checkoutUrl throws on an unknown tier", async () => {
  await assert.rejects(
    Promise.resolve(
      provider().checkoutUrl({ providerId: "PLAN", tierRefs: {} }, "nope"),
    ),
    /unknown tier/,
  );
});

// ---------------------------------------------------------------- manage

test("manageUrl returns the configured fallback URL when set", async () => {
  const p = provider({ manageFallbackUrl: "https://venue.example/membership" });
  assert.equal(await p.manageUrl("m@example.com"), "https://venue.example/membership");
});

test("manageUrl falls back to a mailto built from ownerEmail", async () => {
  const url = await provider().manageUrl("m@example.com");
  assert.ok(url.startsWith("mailto:owner@example.com?"));
  assert.ok(url.includes(encodeURIComponent("m@example.com")));
});
