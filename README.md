# Pleco CODEC — monorepo

CODEC builds membership/club programs for small hospitality businesses. Billing
runs on the **client's own** Square or Stripe; signup lives on the client's own
site; the client owns the code and the member list. No platform cut, no
per-member fee. Core is Apache-2.0.

## Layout

```
packages/
  codec/          The engine (npm package `pleco-codec`). Billing adapters
                  (Square real, Stripe stub), Resend comms, and processor-blind
                  React site components. Zero runtime deps; React optional peer.
apps/
  marketing/      codec.pleco.dev — the marketing + OSS landing site (Astro).
  (host apps)     Per-client instances that consume packages/codec.
FUTURE.md         Deferred / out-of-scope features (the parking lot).
```

npm workspaces tie it together. From the repo root:

```sh
npm install                 # install all workspaces
npm test                    # run every workspace's tests (engine: 39 tests)
npm run build               # build every workspace
npm run build --workspace apps/marketing
npm test  --workspace packages/codec
```

## Product context

The feature set is defined by three real clients:
- **Sunset Wine and Tapas** (Carrabelle FL) — pickup wine club, pre-open;
  founding-member **waitlist that converts to billing** at launch. Square.
- **Outer Heaven Espresso** (Nevada City CA) — operating shop, pickup bean club,
  **direct-to-billing** now. Square.
- **Living Room Wines** (Portland OR) — operating wine bar, migrating a club
  **off Table22**; self-serve member management is the value. Stripe.

## ⚠️ Deploy note (read before merging to main)

The marketing site moved from the repo root into `apps/marketing/`. Its Vercel
project's **Root Directory must be set to `apps/marketing`** (Vercel → Project →
Settings → Build & Deployment → Root Directory) or the production build of
codec.pleco.dev will break on the first deploy after this merges. `vercel.json`
travels with the app at `apps/marketing/vercel.json`.

## Status

- `packages/codec` — engine: Square adapter + comms + site components done;
  Stripe adapter is a stub (built when a Stripe client — Living Room — is
  scheduled). See the Phase 0 audit for the full gap map.
- Phase 1 in progress: OHE/Sunset host app on the Square adapter first.
