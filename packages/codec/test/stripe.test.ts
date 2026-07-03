import assert from "node:assert/strict";
import test from "node:test";
import { StripeProvider, NotImplementedError } from "../src/billing/index.js";

const provider = new StripeProvider({
  secretKey: "sk_test",
  webhookSigningSecret: "whsec_test",
});

test("every stubbed StripeProvider method throws NotImplementedError citing spec §7", async () => {
  // webhookEventId is intentionally excluded — it is real (pure JSON parsing);
  // see the dedicated test below.
  const attempts: Array<() => Promise<unknown>> = [
    () =>
      provider.createPlan({
        name: "x",
        cadence: "monthly",
        tiers: [],
        fulfillment: "pickup",
      }),
    async () => provider.checkoutUrl({ providerId: "p", tierRefs: {} }, "t"),
    () => provider.manageUrl("m@example.com"),
    () =>
      provider.parseWebhook(new Request("https://example.com", { method: "POST" })),
    () => provider.listMembers(),
  ];
  for (const attempt of attempts) {
    await assert.rejects(attempt, (err: unknown) => {
      assert.ok(err instanceof NotImplementedError);
      assert.match(err.message, /§7/);
      assert.match(err.message, /first Toast\/no-POS sale/);
      return true;
    });
  }
});

test("webhookEventId extracts Stripe's top-level event id (implemented, not stubbed)", () => {
  assert.equal(provider.webhookEventId(JSON.stringify({ id: "evt_123" })), "evt_123");
  assert.equal(provider.webhookEventId("not json"), null);
  assert.equal(provider.webhookEventId("{}"), null);
});

test("stub message documents the intended mechanics", async () => {
  await assert.rejects(provider.manageUrl("m@example.com"), (err: Error) => {
    assert.match(err.message, /customer portal/);
    assert.match(err.message, /checkout\.session\.completed/);
    assert.match(err.message, /customer\.subscription\.updated/);
    assert.match(err.message, /customer\.subscription\.deleted/);
    assert.match(err.message, /invoice\.payment_failed/);
    return true;
  });
});
