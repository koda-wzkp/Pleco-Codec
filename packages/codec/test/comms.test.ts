import assert from "node:assert/strict";
import test from "node:test";
import { ResendComms } from "../src/comms/index.js";
import { mockFetch, type RecordedCall } from "./helpers.js";

function comms(overrides: Record<string, unknown> = {}) {
  return new ResendComms({
    apiKey: "re_test",
    audienceId: "aud_1",
    from: "Club <club@venue.example>",
    ownerEmail: "owner@venue.example",
    venueName: "The Test Wine Club",
    manageUrl: "https://venue.example/membership",
    ...overrides,
  });
}

function emailsTo(calls: RecordedCall[], recipient: string) {
  return calls.filter(
    (c) => c.url.endsWith("/emails") && c.body?.to?.includes(recipient),
  );
}

test("activated fans out: contact added + member welcome + owner notification", async () => {
  const fm = mockFetch({
    "/audiences/aud_1/contacts": { id: "c1" },
    "/emails": { id: "e1" },
  });
  try {
    await comms().dispatchMemberEvent({
      type: "activated",
      email: "m@example.com",
      tier: "club-2",
      at: "2026-07-02T00:00:00Z",
    });

    const contactCall = fm.calls.find((c) => c.url.includes("/contacts"));
    assert.ok(contactCall, "adds the member as a Resend contact");
    assert.equal(contactCall.method, "POST");
    assert.equal(contactCall.body.email, "m@example.com");
    assert.equal(contactCall.body.unsubscribed, false);
    assert.equal(contactCall.headers["authorization"], "Bearer re_test");

    const memberMail = emailsTo(fm.calls, "m@example.com");
    assert.equal(memberMail.length, 1, "one welcome email to the member");
    assert.match(memberMail[0]!.body.subject, /Welcome/);

    const ownerMail = emailsTo(fm.calls, "owner@venue.example");
    assert.equal(ownerMail.length, 1, "one notification to the owner");
    assert.match(ownerMail[0]!.body.subject, /New member/);
    assert.match(ownerMail[0]!.body.subject, /club-2/);
  } finally {
    fm.restore();
  }
});

test("payment_failed sends the member a nudge with the manage link + flags the owner", async () => {
  const fm = mockFetch({ "/emails": { id: "e" } });
  try {
    await comms().dispatchMemberEvent({
      type: "payment_failed",
      email: "m@example.com",
      at: "2026-07-02T00:00:00Z",
    });
    const memberMail = emailsTo(fm.calls, "m@example.com");
    assert.equal(memberMail.length, 1);
    assert.match(memberMail[0]!.body.html, /https:\/\/venue\.example\/membership/);
    const ownerMail = emailsTo(fm.calls, "owner@venue.example");
    assert.match(ownerMail[0]!.body.subject, /Payment failed/);
    assert.match(ownerMail[0]!.body.subject, /pickup-night follow-up/);
  } finally {
    fm.restore();
  }
});

test("canceled sends a goodbye, unsubscribes the contact, notifies owner", async () => {
  const fm = mockFetch({
    "/audiences/aud_1/contacts": { id: "c1" },
    "/emails": { id: "e" },
  });
  try {
    await comms().dispatchMemberEvent({
      type: "canceled",
      email: "m@example.com",
      at: "2026-07-02T00:00:00Z",
    });
    const contactCall = fm.calls.find((c) => c.url.includes("/contacts"));
    assert.equal(contactCall?.body.unsubscribed, true);
    assert.equal(emailsTo(fm.calls, "m@example.com").length, 1);
    assert.equal(emailsTo(fm.calls, "owner@venue.example").length, 1);
  } finally {
    fm.restore();
  }
});

test("paused/resumed notify the owner but send no member email", async () => {
  for (const type of ["paused", "resumed"] as const) {
    const fm = mockFetch({
      "/audiences/aud_1/contacts": { id: "c1" },
      "/emails": { id: "e" },
    });
    try {
      await comms().dispatchMemberEvent({
        type,
        email: "m@example.com",
        at: "2026-07-02T00:00:00Z",
      });
      assert.equal(emailsTo(fm.calls, "m@example.com").length, 0);
      assert.equal(emailsTo(fm.calls, "owner@venue.example").length, 1);
    } finally {
      fm.restore();
    }
  }
});

test("addWaitlistContact treats an existing contact (409) as success", async () => {
  let posts = 0;
  const fm = mockFetch(
    {
      "/audiences/aud_1/contacts": (call: RecordedCall) => {
        if (call.method === "POST") posts++;
        return { id: "c1" };
      },
    },
    { status: (call) => (call.method === "POST" ? 409 : 200) },
  );
  try {
    await comms().addWaitlistContact({ email: "m@example.com", firstName: "Mo" });
    assert.equal(posts, 1);
    const patch = fm.calls.find((c) => c.method === "PATCH");
    assert.ok(patch, "falls back to PATCH upsert on conflict");
  } finally {
    fm.restore();
  }
});

test("handleWaitlistSignup adds the contact and notifies the owner with the note", async () => {
  const fm = mockFetch({
    "/audiences/aud_1/contacts": { id: "c1" },
    "/emails": { id: "e" },
  });
  try {
    await comms().handleWaitlistSignup({
      email: "m@example.com",
      firstName: "Mo",
      note: "Club 4, reserve add-on",
    });
    const ownerMail = emailsTo(fm.calls, "owner@venue.example");
    assert.equal(ownerMail.length, 1);
    assert.match(ownerMail[0]!.body.subject, /New waitlist signup/);
    assert.match(ownerMail[0]!.body.subject, /Club 4, reserve add-on/);
  } finally {
    fm.restore();
  }
});

test("waitlistLaunchCampaign emails subscribed contacts with billing date + link", async () => {
  const fm = mockFetch({
    "/audiences/aud_1/contacts": {
      data: [
        { email: "a@example.com", first_name: "A" },
        { email: "b@example.com", unsubscribed: true },
        { email: "c@example.com" },
      ],
    },
    "/emails": { id: "e" },
  });
  try {
    const sent = await comms().waitlistLaunchCampaign({
      billingStartsOn: "September 1, 2026",
      checkoutUrlFor: (c) => `https://pay.example/${c.email}`,
    });
    assert.equal(sent, 2, "skips unsubscribed contacts");
    const aMail = emailsTo(fm.calls, "a@example.com")[0]!;
    assert.match(aMail.body.text, /billing starts September 1, 2026/);
    assert.match(aMail.body.text, /https:\/\/pay\.example\/a@example\.com/);
  } finally {
    fm.restore();
  }
});

test("pickupReminderCampaign emails subscribed members with the pickup date", async () => {
  const fm = mockFetch({
    "/audiences/aud_1/contacts": {
      data: [
        { email: "a@example.com", first_name: "A" },
        { email: "b@example.com", unsubscribed: true },
      ],
    },
    "/emails": { id: "e" },
  });
  try {
    const sent = await comms().pickupReminderCampaign({
      pickupOn: "this Friday",
      details: "Ethiopia Guji, roasted Wednesday.",
    });
    assert.equal(sent, 1, "skips unsubscribed contacts");
    const aMail = emailsTo(fm.calls, "a@example.com")[0]!;
    assert.match(aMail.body.subject, /this Friday/);
    assert.match(aMail.body.text, /Ethiopia Guji, roasted Wednesday\./);
  } finally {
    fm.restore();
  }
});

test("per-client template overrides replace core copy (spec §9)", async () => {
  const fm = mockFetch({
    "/audiences/aud_1/contacts": { id: "c1" },
    "/emails": { id: "e" },
  });
  try {
    await comms({
      templates: {
        welcome: () => ({
          subject: "Bespoke welcome",
          html: "<p>hi</p>",
          text: "hi",
        }),
      },
    }).dispatchMemberEvent({
      type: "activated",
      email: "m@example.com",
      tier: "club-2",
      at: "2026-07-02T00:00:00Z",
    });
    const memberMail = emailsTo(fm.calls, "m@example.com")[0]!;
    assert.equal(memberMail.body.subject, "Bespoke welcome");
  } finally {
    fm.restore();
  }
});
