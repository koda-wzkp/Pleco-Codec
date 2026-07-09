# Haptera — Client Launch Checklist

A per-client runbook for taking a `club-host` instance live. Everything below is
operational: the code is built and tested (engine 54, host 9). These are the
steps that need **real accounts, credentials, and human judgment** — none can be
done from the build environment.

Do this once per client. Order matters where noted.

---

## 0. Before you start — accounts the client owns

Confirm the client owns and has granted you access to:

- [ ] **Processor** — Square (Outer Heaven, Sunset) or Stripe (Living Room).
- [ ] **Resend** account + an Audience for this club (`resendAudienceId`).
- [ ] **Domain** for the club site + a **Vercel** project.
- [ ] A verified **From address** in Resend for member mail.

> Rule of thumb: if Pleco disappeared tomorrow, nothing stops working. Every
> account above is the client's.

## 1. Resolve the `// VERIFY:` API strings  ⚠️ blocks launch

The Square and Stripe adapters annotate every processor-specific string
(`event names`, status values, field paths, API version, cadence/interval enums)
with `// VERIFY:`. **These were written from docs/memory and must be confirmed
against a live test-mode account before any real money moves.**

- [ ] Square: `grep -rn "VERIFY:" packages/haptera/src/billing/square.ts` — resolve
      each against the current Square API + a sandbox account. Pin
      `Square-Version`.
- [ ] Stripe: `grep -rn "VERIFY:" packages/haptera/src/billing/stripe.ts` — resolve
      each against the current Stripe API + a test-mode account.
- [ ] Remove or update each `// VERIFY:` note as you confirm it.

## 2. Fill the instance config

Edit `apps/club-host/src/instances/<client>.ts`:

- [ ] Real tier labels, prices (cents), descriptions, cadence, fulfillment.
- [ ] `retentionRitual`, `venueName`, copy, perks.
- [ ] `ownerNotifyEmail`, `resendAudienceId`.
- [ ] `scope` (care plan yes/no; if no, a completed handoff doc URL — see
      `packages/haptera/docs/HANDOFF-TEMPLATE.md`).
- [ ] Replace every `REPLACE…` placeholder.

For **Living Room specifically**: confirm the two tier prices (currently marked
`PLACEHOLDER`) with the venue before provisioning.

## 3. Provision the plan + checkout links

With the client's credentials in `apps/club-host/.env`:

```sh
HAPTERA_INSTANCE=<client> npm run provision --workspace @pleco/club-host
```

- [ ] Paste the printed `SQUARE_TIER_REFS` / `STRIPE_TIER_REFS` line into the
      deploy env.
- [ ] Paste the printed `checkoutUrls` block into the instance's `launch` config
      (for direct-billing clients).

> Sunset stays `launch.mode: "waitlist"` until go-live (step 8). You can still
> provision the plan ahead of time.

## 4. Configure the webhook

In the processor dashboard:

- [ ] Create a webhook subscription pointing at
      `https://<club-domain>/api/webhooks/billing`.
- [ ] **Square:** copy the signature key → `SQUARE_WEBHOOK_SIGNATURE_KEY`; set
      `SQUARE_WEBHOOK_NOTIFICATION_URL` to the **exact** URL above (a trailing-slash
      or scheme mismatch fails every signature check).
- [ ] **Stripe:** copy the signing secret → `STRIPE_WEBHOOK_SIGNING_SECRET`.
- [ ] Subscribe to the lifecycle events the adapter maps (subscription
      created/updated/deleted, invoice payment-failed).

## 5. Set environment variables

Per `apps/club-host/.env.example`, in the Vercel project:

- [ ] `HAPTERA_INSTANCE`, `PUBLIC_SITE_URL`, `OWNER_PASSCODE`, `RESEND_API_KEY`.
- [ ] Processor secrets (Square or Stripe block), plus the `TIER_REFS` from step 3.
- [ ] Never commit secrets; they live only in the deploy env.

## 6. Deploy

- [ ] In `apps/club-host/astro.config.mjs`, swap the `@astrojs/node` adapter for
      `@astrojs/vercel`.
- [ ] Vercel project **Root Directory = `apps/club-host`**; one project per client.
- [ ] Deploy; confirm the club page and `/owner/login` load over HTTPS.
- [ ] (Marketing site, one-time) move the marketing Vercel project's Root
      Directory to `apps/marketing` so its deploy doesn't break after this merges.

## 7. End-to-end test with a $1 tier  ⚠️ blocks launch

- [ ] Temporarily add a $1 test tier (or use the processor's test mode).
- [ ] Complete a real checkout → confirm the webhook fires, a `MemberEvent` is
      produced, the member gets the welcome email, and the owner gets the notice.
- [ ] Trigger a payment failure (test card) → confirm the nudge + owner flag.
- [ ] Pause / cancel via `/manage` → confirm the paused/canceled emails + owner
      notices.
- [ ] Confirm the owner dashboard shows the test member, MRR, and CSV export.
- [ ] Refund + cancel + remove the test member.

## 8. Go live

- [ ] **Direct-billing clients (OHE, Living Room):** publish the club page; the
      tier buttons are live checkout.
- [ ] **Waitlist clients (Sunset):** collect founding signups. At go-live, flip
      `launch` from `waitlist` to `billing` (with the step-3 `checkoutUrls`) and
      redeploy — that one edit is the whole switchover. Then send the launch
      campaign (`ResendComms.waitlistLaunchCampaign`).
- [ ] **Living Room (Table22 migration):** email members the new signup link; run
      one billing cycle of overlap; then sunset the Table22 listing.

## 9. Handoff

- [ ] Complete `packages/haptera/docs/HANDOFF-TEMPLATE.md` for the client (accounts,
      how billing works, changing prices, pausing members, the automated emails,
      support).
- [ ] Confirm the client can sign into `/owner`, export their member CSV, and
      reach the processor dashboard themselves.

---

### Operational notes

- **Idempotency store** is in-memory (fine for one long-lived server per club).
  If a club moves to serverless/multi-instance, implement `IdempotencyStore` over
  a shared KV/DB — nothing else changes.
- **Pickup reminders** are owner-triggered from the dashboard on the roast/
  fulfillment schedule (or wire a cron to `pickupReminderCampaign`).
- **Deferred features** live in `FUTURE.md`; a self-serve in-dashboard launch
  toggle and historical-MRR-through-price-changes both need a small datastore and
  are out of v1.
