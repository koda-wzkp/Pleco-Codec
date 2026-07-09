# {VENUE NAME} — Membership Program Handoff

**Client:** {CLIENT / VENUE NAME}
**Prepared by:** Pleco
**Date:** {DATE}
**Engagement:** Haptera membership build (one-time). Care plan: {YES — see §6 / NO — this document is the support plan}.

This document is yours. Everything in it belongs to you: the accounts, the money, the member list, the website. Pleco never sits in the money path.

---

## 1. Accounts you own

| What | Where | Account owner | Login / access |
|---|---|---|---|
| Payment processing + subscriptions | {Square Dashboard / Stripe Dashboard} | {OWNER NAME/EMAIL} | {how access was handed over} |
| Member email + waitlist audience | Resend ({resend.com}) | {OWNER NAME/EMAIL} | {…} |
| Website + domain | {Vercel / registrar} | {OWNER NAME/EMAIL} | {…} |
| Website code | {Git host / repo URL} | {OWNER NAME/EMAIL} | {…} |

**Rule of thumb:** if Pleco disappeared tomorrow, nothing stops working. Billing, payouts, and member emails all run on the accounts above — all yours.

## 2. How your club billing works (30 seconds)

Members sign up on your website. The signup button sends them to a checkout page hosted by {Square/Stripe}. {Square/Stripe} stores the card, charges it every {month/week/quarter}, and deposits the money with your normal payouts. Your website never touches card numbers.

Your member list lives in two places:
- **{Square/Stripe} dashboard** — the source of truth for who is paying, paused, or canceled.
- **Resend audience** — the email list used for member/waitlist communication.

## 3. How to change prices

{SQUARE VERSION:}
1. Square Dashboard → **Items & Orders → Subscription plans**.
2. Open the plan variation for the tier (e.g. "{Club 2}").
3. Price changes on subscription plans apply per Square's rules — existing subscribers {are / are not} moved automatically; VERIFY the current behavior in Square's help before changing, or create a new variation and point new signups at it.
4. If you create a **new** variation, tell whoever maintains the website: the tier's checkout link must be regenerated (one config value).

{STRIPE VERSION: prices are immutable — create a new Price on the Product, update the checkout link, optionally migrate existing subscriptions from the dashboard.}

## 4. How to pause or cancel a member

1. Find the member in the {Square/Stripe} dashboard (search by name or email).
2. Open their subscription and choose **Pause** (or **Cancel**).
3. That's it — the system emails you a confirmation, and the member stops being charged. Resuming is the same screen.

Members who email you asking to pause/cancel: do the above; no need to send them anywhere else. {If Stripe: members can also do this themselves via the "Manage your membership" link on the site.}

## 5. Emails the system sends automatically

| When | Member gets | You get |
|---|---|---|
| New member signs up | Welcome + what happens next | "New member: {name}, {tier}" |
| A card charge fails | Friendly "update your card" note | "Flag for {pickup night} follow-up" |
| Member cancels | Graceful goodbye | Cancellation notice |
| Member pauses/resumes | — | Notice |

These go out from `{FROM ADDRESS}` via your Resend account. Copy changes are a maintenance request (or a care-plan item).

## 6. What the care plan covers {DELETE IF NO CARE PLAN}

- {e.g. copy changes, price/tier changes including checkout-link regeneration, monitoring webhook health, Resend deliverability checks}
- {response time, monthly fee, how to reach us}
- Not covered: {e.g. new features (member portal, gift memberships), redesigns — quoted separately}.

## 7. If something breaks

1. **Members can't sign up:** check the {Square/Stripe} dashboard status page and that the checkout links still resolve.
2. **No email notifications:** check Resend dashboard → logs; check the API key hasn't been revoked.
3. **Everything else:** {SUPPORT CONTACT}. The website code is documented in its own README; any competent web developer can maintain it — that's by design.

## 8. Key configuration values (for your developer)

| Value | Where it lives |
|---|---|
| Processor + environment | {env vars / config file location} |
| Tier checkout URLs | {…} |
| Webhook URL + signature key | {processor dashboard → webhooks; env var names} |
| Resend API key + audience ID | {…} |
| Owner notification address | {…} |
