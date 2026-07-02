import assert from "node:assert/strict";
import test from "node:test";
import { defaultTemplates } from "../src/comms/index.js";

test("welcome renders venue, tier, next step and produces subject/html/text", () => {
  const email = defaultTemplates.welcome({
    venueName: "Test Wine Club",
    memberEmail: "m@example.com",
    tier: "Club 2",
    nextStep: "First pickup is Thursday, Sept 3.",
    contactEmail: "hello@venue.example",
  });
  assert.match(email.subject, /Test Wine Club/);
  assert.match(email.html, /Club 2/);
  assert.match(email.html, /First pickup is Thursday, Sept 3\./);
  assert.match(email.text, /hello@venue\.example/);
});

test("paymentFailed includes the manage link and never blames the member", () => {
  const email = defaultTemplates.paymentFailed({
    venueName: "Test Wine Club",
    memberEmail: "m@example.com",
    manageUrl: "https://venue.example/manage",
  });
  assert.match(email.html, /href="https:\/\/venue\.example\/manage"/);
  assert.match(email.text, /https:\/\/venue\.example\/manage/);
  assert.doesNotMatch(email.text, /your fault|you failed|declined by you/i);
});

test("goodbye keeps the door open", () => {
  const email = defaultTemplates.goodbye({
    venueName: "Test Wine Club",
    memberEmail: "m@example.com",
  });
  assert.match(email.text, /door's open/);
});

test("ownerNotification covers every event type", () => {
  for (const eventType of [
    "activated",
    "paused",
    "resumed",
    "canceled",
    "payment_failed",
  ]) {
    const email = defaultTemplates.ownerNotification({
      venueName: "V",
      memberEmail: "m@example.com",
      eventType,
      at: "2026-07-02T00:00:00Z",
    });
    assert.match(email.subject, /m@example\.com/);
    assert.match(email.subject, /^\[V\]/);
  }
});

test("launch template carries the billing date and checkout link", () => {
  const email = defaultTemplates.launch({
    venueName: "V",
    billingStartsOn: "September 1, 2026",
    checkoutUrl: "https://pay.example/x",
  });
  assert.match(email.text, /billing starts September 1, 2026/);
  assert.match(email.html, /href="https:\/\/pay\.example\/x"/);
});

test("templates escape HTML in interpolated content", () => {
  const email = defaultTemplates.launch({
    venueName: "V",
    billingStartsOn: `<script>alert(1)</script>`,
    checkoutUrl: "https://pay.example/x",
  });
  assert.doesNotMatch(email.html, /<script>/);
});
