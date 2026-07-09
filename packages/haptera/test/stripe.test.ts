import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { StripeProvider, type ClubProgram } from "../src/billing/index.js";
import { mockFetch, type RecordedCall } from "./helpers.js";

const SIGNING_SECRET = "whsec_test";

function provider(extra: Record<string, unknown> = {}) {
  return new StripeProvider({
    secretKey: "sk_test",
    webhookSigningSecret: SIGNING_SECRET,
    portalReturnUrl: "https://venue.example/account",
    ...extra,
  });
}

const program: ClubProgram = {
  name: "Living Room Wine Club",
  cadence: "monthly",
  tiers: [
    { id: "club-2", label: "Club 2", priceCents: 4000, description: "2 bottles" },
    { id: "club-4", label: "Club 4", priceCents: 6500, description: "4 bottles" },
  ],
  fulfillment: "pickup",
};

// ------------------------------------------------------------------ plans

test("createPlan creates a product + one recurring price per tier", async () => {
  const fm = mockFetch({
    "/v1/products": { id: "prod_1" },
    "/v1/prices": (call: RecordedCall) => ({ id: `price_${call.body?.unit_amount ?? "x"}` }),
  });
  try {
    const ref = await provider().createPlan(program);
    assert.equal(ref.providerId, "prod_1");
    assert.deepEqual(ref.tierRefs, { "club-2": "price_4000", "club-4": "price_6500" });
    const priceCall = fm.calls.find((c) => c.url.endsWith("/v1/prices"))!;
    assert.equal(priceCall.headers["content-type"], "application/x-www-form-urlencoded");
  } finally {
    fm.restore();
  }
});

test("quarterly cadence uses month interval with interval_count 3", async () => {
  const fm = mockFetch({
    "/v1/products": { id: "prod_1" },
    "/v1/prices": { id: "price_x" },
  });
  try {
    await provider().createPlan({ ...program, cadence: "quarterly", tiers: [program.tiers[0]!] });
    const body = fm.calls.find((c) => c.url.endsWith("/v1/prices"))!.body;
    assert.equal(body["recurring[interval]"], "month");
    assert.equal(body["recurring[interval_count]"], "3");
  } finally {
    fm.restore();
  }
});

// --------------------------------------------------------------- checkout

test("checkoutUrl creates a payment link on the tier's price", async () => {
  const fm = mockFetch({
    "/v1/payment_links": { url: "https://buy.stripe.com/test_abc" },
  });
  try {
    const url = await provider({ redirectUrl: "https://venue.example/thanks" }).checkoutUrl(
      { providerId: "prod_1", tierRefs: { "club-2": "price_1" } },
      "club-2",
    );
    assert.equal(url, "https://buy.stripe.com/test_abc");
    const body = fm.calls[0]!.body;
    assert.equal(body["line_items[0][price]"], "price_1");
    assert.equal(body["after_completion[redirect][url]"], "https://venue.example/thanks");
  } finally {
    fm.restore();
  }
});

test("checkoutUrl throws on an unknown tier", async () => {
  await assert.rejects(
    provider().checkoutUrl({ providerId: "prod_1", tierRefs: {} }, "nope"),
    /unknown tier/,
  );
});

// ----------------------------------------------------------------- manage

test("manageUrl resolves the customer by email and mints a portal session", async () => {
  const fm = mockFetch({
    "/v1/customers?email=": { data: [{ id: "cus_1" }] },
    "/v1/billing_portal/sessions": { url: "https://billing.stripe.com/session/xyz" },
  });
  try {
    const url = await provider().manageUrl("m@example.com");
    assert.equal(url, "https://billing.stripe.com/session/xyz");
    const portalCall = fm.calls.find((c) => c.url.includes("/billing_portal/"))!;
    assert.equal(portalCall.body.customer, "cus_1");
    assert.equal(portalCall.body.return_url, "https://venue.example/account");
  } finally {
    fm.restore();
  }
});

test("manageUrl throws when no customer matches the email", async () => {
  const fm = mockFetch({ "/v1/customers?email=": { data: [] } });
  try {
    await assert.rejects(provider().manageUrl("nobody@example.com"), /no Stripe customer/);
  } finally {
    fm.restore();
  }
});

// ---------------------------------------------------------------- webhook

function signed(body: string, secret = SIGNING_SECRET): Request {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return new Request("https://venue.example/api/webhooks/billing", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${v1}` },
    body,
  });
}

test("parseWebhook accepts a correctly signed subscription.created -> activated", async () => {
  const body = JSON.stringify({
    id: "evt_1",
    type: "customer.subscription.created",
    created: 1767225600,
    data: { object: { id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ price: { id: "price_2" } }] } } },
  });
  const fm = mockFetch({ "/v1/customers/cus_1": { id: "cus_1", email: "m@example.com" } });
  try {
    const p = provider({ tierRefs: { "club-2": "price_2" } });
    const event = await p.parseWebhook(signed(body));
    assert.ok(event);
    assert.equal(event.type, "activated");
    assert.equal(event.email, "m@example.com");
    assert.equal(event.tier, "club-2");
  } finally {
    fm.restore();
  }
});

test("parseWebhook throws on a bad signature", async () => {
  const body = JSON.stringify({ id: "evt_x", type: "customer.subscription.created", data: {} });
  await assert.rejects(provider().parseWebhook(signed(body, "wrong_secret")), /invalid webhook signature/);
});

test("parseWebhook throws on a missing signature", async () => {
  const req = new Request("https://venue.example/h", { method: "POST", body: "{}" });
  await assert.rejects(provider().parseWebhook(req), /invalid webhook signature/);
});

test("subscription.updated maps pause_collection -> paused, active -> resumed", async () => {
  const fm = mockFetch({ "/v1/customers/cus_1": { email: "m@example.com" } });
  try {
    const paused = JSON.stringify({
      id: "evt_2", type: "customer.subscription.updated", created: 1767225600,
      data: { object: { id: "sub_1", customer: "cus_1", status: "active", pause_collection: { behavior: "void" } } },
    });
    const e1 = await provider().parseWebhook(signed(paused));
    assert.equal(e1?.type, "paused");

    const resumed = JSON.stringify({
      id: "evt_3", type: "customer.subscription.updated", created: 1767225600,
      data: { object: { id: "sub_1", customer: "cus_1", status: "active" } },
    });
    const e2 = await provider().parseWebhook(signed(resumed));
    assert.equal(e2?.type, "resumed");
  } finally {
    fm.restore();
  }
});

test("subscription.deleted -> canceled; invoice.payment_failed -> payment_failed", async () => {
  const fm = mockFetch({ "/v1/customers/cus_1": { email: "m@example.com" } });
  try {
    const del = JSON.stringify({
      id: "evt_4", type: "customer.subscription.deleted", created: 1767225600,
      data: { object: { id: "sub_1", customer: "cus_1", status: "canceled" } },
    });
    assert.equal((await provider().parseWebhook(signed(del)))?.type, "canceled");

    const fail = JSON.stringify({
      id: "evt_5", type: "invoice.payment_failed", created: 1767225600,
      data: { object: { customer: "cus_1", customer_email: "m@example.com" } },
    });
    assert.equal((await provider().parseWebhook(signed(fail)))?.type, "payment_failed");
  } finally {
    fm.restore();
  }
});

test("checkout.session.completed is ignored (no duplicate activation)", async () => {
  const body = JSON.stringify({
    id: "evt_6", type: "checkout.session.completed", created: 1767225600,
    data: { object: { id: "cs_1" } },
  });
  assert.equal(await provider().parseWebhook(signed(body)), null);
});

test("webhookEventId extracts Stripe's top-level event id", () => {
  assert.equal(provider().webhookEventId(JSON.stringify({ id: "evt_9" })), "evt_9");
  assert.equal(provider().webhookEventId("not json"), null);
});

// -------------------------------------------------------------- listMembers

test("listMembers paginates and normalizes subscriptions with expanded customer", async () => {
  let page = 0;
  const fm = mockFetch({
    "/v1/subscriptions": () => {
      page++;
      if (page === 1) {
        return {
          has_more: true,
          data: [
            { id: "sub_1", customer: { id: "cus_1", email: "a@example.com" }, status: "active", created: 1767225600, items: { data: [{ price: { id: "price_2" } }] } },
          ],
        };
      }
      return {
        has_more: false,
        data: [
          { id: "sub_2", customer: { id: "cus_2", email: "b@example.com" }, status: "active", pause_collection: { behavior: "void" }, created: 1767225600, items: { data: [{ price: { id: "price_4" } }] } },
        ],
      };
    },
  });
  try {
    const p = provider({
      tierRefs: { "club-2": "price_2", "club-4": "price_4" },
      tierPrices: { "club-2": 4000, "club-4": 6500 },
    });
    const members = await p.listMembers();
    assert.equal(page, 2, "followed has_more/starting_after");
    assert.equal(members.length, 2);
    assert.equal(members[0]!.email, "a@example.com");
    assert.equal(members[0]!.tier, "club-2");
    assert.equal(members[0]!.status, "active");
    assert.equal(members[0]!.priceCents, 4000);
    assert.equal(members[1]!.status, "paused"); // pause_collection set
  } finally {
    fm.restore();
  }
});
