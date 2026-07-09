# Adapter proposal: <provider name>

Date: <YYYY-MM-DD>
Author: <name>
Client need: <which paying deployment needs this — generic description
only, e.g. "a coffee roaster's bean club"; no client names, pricing, or
engagement details in this public repo>
Contract: [SPEC.md](./SPEC.md)

**Stage:** `FEASIBILITY` <!-- FEASIBILITY → MAPPING → APPROVED -->

> **How to use this template.** Copy it to `docs/adapters/<provider>.md`
> and fill in **Part 1 only**. Parts 2 and 3 stay as-is — do not fill them
> in, delete the STOP banner, or advance the stage until every Part 1 row
> is `CONFIRMED` with evidence. An adapter also needs a paying client and
> gets built one at a time; feasibility work is cheap, adapter code is not.
> Remember the sorting test before you even start: Haptera absorbs owned
> mechanisms (clubs, queues, catalogs, comms) and coexists with discovery
> networks — if this provider is a discovery network in network mode, the
> answer is coexistence, not an adapter.

---

## Part 1 — Feasibility checklist (gates everything below)

Every row needs a **status** (`CONFIRMED` / `BLOCKED` / `UNVERIFIED`) and
**evidence**: a link to provider docs stating the behavior, or better, a
note of a live API call you made against a sandbox/test account. "It
probably works" and "the docs imply" are `UNVERIFIED`. Reservation-network
write access is `UNVERIFIED` until a partner agreement says otherwise in
writing — a docs page is not sufficient evidence for partner-gated access.

### 1.1 Sorting test

| Question | Answer | Status |
| --- | --- | --- |
| Is this an owned mechanism to absorb, or a discovery network to coexist with? | | |
| If it has both modes (e.g. reservations direct vs. network), which mode is this adapter for? | | |

If the answer is "coexist" — stop here; file this document as the record
of why there is no adapter.

### 1.2 Access model

| Question | Answer | Evidence | Status |
| --- | --- | --- | --- |
| Is there a public API, or is access partner/invite-gated? | | | |
| Can the **client's own account** issue the credentials (Model A)? | | | |
| Auth mechanism (API key, OAuth, other) and who owns the app registration? | | | |
| Is there a sandbox/test environment? | | | |

### 1.3 Write permissions, per mechanism

Only the mechanisms this adapter would declare. "Read-only" is a finding,
not a failure — it changes what the adapter can be.

| Mechanism | Operations needed (from SPEC §3) | Provider supports? | Evidence | Status |
| --- | --- | --- | --- | --- |
| club | list tiers, hosted checkout, find-by-email, pause/resume/cancel, deferred start | | | |
| waitlist | join/list/remove/promote (or modelable on provider objects) | | | |
| catalog | list/read items, availability | | | |
| comms | audience and/or delivery, unsubscribe handling | | | |

### 1.4 Webhooks / change notification

| Question | Answer | Evidence | Status |
| --- | --- | --- | --- |
| Are webhooks available for the objects above? Which events? | | | |
| Signature/verification mechanism? | | | |
| Delivery guarantees (retries, ordering) — and can we reconcile by full re-read? | | | |

### 1.5 Rate limits and operational ceilings

| Question | Answer | Evidence | Status |
| --- | --- | --- | --- |
| Published rate limits, or at least documented 429 behavior? | | | |
| Idempotency support on writes? | | | |
| API versioning scheme we can pin? | | | |

### 1.6 Terms of service

| Question | Answer | Evidence | Status |
| --- | --- | --- | --- |
| Does the ToS permit third-party intermediaries / agency access on a client's behalf? | | | |
| Any prohibition on the specific flows above (e.g. automated writes, data export)? | | | |
| Any data-handling terms that would conflict with "no Haptera member database"? | | | |

### Feasibility verdict

<!-- One of: GO (all rows CONFIRMED) / NO-GO (why) / BLOCKED-ON (what) -->

---

> ⛔ **STOP.** Everything below this line is filled in only after every
> Part 1 row is `CONFIRMED` and the verdict is GO. If you are editing
> below while any row above says `UNVERIFIED`, you are speccing against
> assumed access — that is how phantom adapters happen.

## Part 2 — Mechanism mapping

Stage becomes `MAPPING`. One row per Haptera concept, naming the exact
provider API surface, as in [square.md](./square.md).

| Haptera concept | Provider surface | Notes / gaps |
| --- | --- | --- |
| Club tier | | |
| Membership (state, pause/resume/cancel) | | |
| Member (magic-link lookup by email) | | |
| Market item | | |
| Waitlist entry | | |
| Comms audience / delivery | | |
| Sync events (webhooks) | | |

Manifest draft — per-mechanism `confirmed` / `partial` / `unverified` with
notes:

```
mechanisms:
  club:      <status> — <notes>
  waitlist:  <status> — <notes>
  catalog:   <status> — <notes>
  comms:     <status> — <notes>
```

Lifecycle notes (only where this provider deviates from SPEC §2 defaults):

- Install/credential verification:
- Configure (what deployment config binds to what provider object):
- Sync/reconciliation cadence:
- Webhook specifics (signature, dedupe key, coarse events):
- Teardown specifics:
- Error mapping to SPEC §4.1 codes / idempotency strategy:

## Part 3 — Open questions and decision log

Open questions (anything still `UNVERIFIED` at mapping time lives here,
visibly, until resolved):

- …

Decision log (dated, append-only):

- <YYYY-MM-DD> — …
