# Repo audit — koda-wzkp/Pleco-Codec

Date: 2026-07-07
Scope: everything tracked in this repository as of commit `3261dbb`.

## 1. What this repository actually is

This repo contains the **codec.pleco.dev marketing site and lead funnel**,
not the CODEC engine. There is no adapter code, no core library, no tests,
and no CI. Full inventory:

| Path | What it is | Status |
| --- | --- | --- |
| `src/pages/index.astro` | Landing page (hero, platform-tax comparison, how-it-works, open-source pitch, packages/pricing, live deployments, CTA) | Live, maintained |
| `src/pages/guide.astro` | "Own Your Club" ebook lead-capture page | Live, maintained |
| `src/pages/guide/thanks.astro` | Post-signup confirmation + ungated download | Live, maintained |
| `src/styles/global.css` | Single shared stylesheet | Live |
| `src/assets/brand/*.svg` | Pleco brand assets (7 files; only `logo-teal-square.svg` and `pleco-fish.svg` are referenced by pages) | Partially used — see §5 |
| `api/guide.js` | Vercel serverless function: validates email, sends ebook + lead notification via Resend | Live |
| `scripts/generate-og.mjs` | Playwright script that renders `public/og.png` | Utility |
| `public/` | Favicon, OG image, `Own-Your-Club-ebook.pdf` | Static assets |
| `astro.config.mjs`, `package.json` | Astro 5 static build; deps: `astro`, `resend`; dev dep: `playwright-core` | Minimal, appropriate |
| `README.md` | Documents the *site* (dev, brand assets, funnel env vars, deploy) | Accurate for the site; silent on CODEC itself — see §2 |
| `LICENSE` | Apache-2.0 | Intact |
| `docs/` | Did not exist before this pass | Added in this pass |

Architecture of what exists is sound for its purpose: fully static output,
one serverless function, no database anywhere (leads live in an inbox),
progressive enhancement throughout, no client-side trackers.

## 2. Claims vs. reality

The most important gap in the repo:

- **The landing page sells this repo as the CODEC engine.** The
  open-source section (`src/pages/index.astro:125-143`) renders a terminal
  showing `git clone https://github.com/koda-wzkp/Pleco-Codec` with the
  caption `# Square adapter, Stripe adapter, member events, comms.` and the
  copy "CODEC's core is released under Apache-2.0. Read it, fork it, deploy
  it yourself." **None of that code exists in this repo.** A visitor who
  clones it gets the marketing site. This undercuts the exact trust claim
  the section makes ("'you own it' isn't a promise — it's a license").
- The snippet also implies a **Stripe adapter exists**. Per the adapter
  policy (one adapter at a time, only for a paying client, only after
  feasibility), Stripe is secondary and unbuilt. The copy should not name
  it as present.
- `README.md` describes only the website and never says what CODEC is,
  which is backwards for the repo the landing page tells people to read.
  Fixed in this pass (see §7).

Recommended copy fix (not applied in this pass — landing-page copy is a
business call, proposed here first per the no-silent-reorg rule): change the
terminal caption to describe what the repo actually contains ("adapter spec,
Square reference mapping, site source") until engine code is published, or
publish the engine code.

## 3. Constraint compliance

Checked against the CODEC architecture constraints. With no engine code in
the repo, most checks apply to *copy and docs* rather than code.

| Constraint | Finding |
| --- | --- |
| No CODEC/Pleco-owned member database | **Pass.** No database exists anywhere. The lead funnel is deliberately DB-less (`api/guide.js` — leads accumulate in an inbox). Site copy consistently says billing and members live on the client's Square/Stripe. |
| No shared multi-tenant member store | **Pass.** Nothing shared exists. |
| Processor-as-backend, magic-link auth | **Not contradicted.** No auth code exists to check. Site copy ("checkout happens on their hosted pages, so no card data ever touches the site") is consistent. |
| Money rail stays with the processor | **Pass** in copy: recurring charges "run on your own Square or Stripe." |
| Model A ownership, no build-and-transfer | **Pass** in copy: "The build lives in a GitHub repo in your account" — client-owned from day one, not built-then-transferred. No transfer language found anywhere. |
| Absorb vs. coexist | **Pass.** No reservation-network wrapping or absorption language. Discovery networks aren't mentioned at all. |
| Adapters one at a time, feasibility-gated | **Flag.** The terminal snippet names a Stripe adapter as if built (§2). |
| Reservation-network write access marked UNVERIFIED | N/A on the site; enforced in the new docs (`docs/adapters/SPEC.md` §3.5, `docs/adapters/TEMPLATE.md`). |

## 4. Client-identifying and business details in a public repo

- **Named venues** (`src/pages/index.astro:196-207`): "The Sunset Wine
  Club" at Sunset Wine and Tapas, Carrabelle, FL; "The Outer Heaven Bean
  Club" at Outer Heaven Espresso, Nevada City, CA — names, cities, and a
  one-line description of each engagement. This is deliberate social-proof
  copy on a public site, which is a legitimate choice **if written
  permission from each venue is on file** — confirm that. It is different
  in kind from client details leaking into docs; the new docs use only
  generic examples ("a coffee roaster", "a wine bar") and that rule is now
  stated in `docs/adapters/TEMPLATE.md`.
- **Pricing** (`src/pages/index.astro:146-187`): full package and care-plan
  pricing. Same reasoning: public pricing on a marketing page is a business
  decision, but be aware the repo history preserves every past price
  forever. Keep pricing out of docs and commit messages.
- **Competitor claim** (`src/pages/index.astro:97`): "Platforms like
  Table22 charge around 10% of top-line plus processing." A named
  competitor with an uncited fee figure in a public repo is an accuracy
  and goodwill exposure. Recommend citing a source or genericizing to
  "subscription platforms commonly charge ~10%."
- **Personal names/emails**: `conor@pleco.dev` appears as contact/reply-to
  defaults in `api/guide.js`, `README.md`, and both guide pages; comments
  reference "Conor" and "Koda" by name. Low risk — it is the published
  contact address — but code comments addressing teammates by name read as
  internal. Cosmetic.
- **`public/Own-Your-Club-ebook.pdf`** ships in the repo. Its contents were
  not audited in this pass; if it names clients or pricing beyond what the
  site already says, the same considerations apply.

## 5. Dead weight and hygiene

- **Stale `.gitignore` entries**: `Own-Your-Club-ebook.pdf`, `favicon.svg`,
  and `og.png` are listed in `.gitignore` yet all three are committed under
  `public/`. Either the ignore entries or the commits are unintended;
  currently the entries are no-ops. Decide and remove one side.
- **Unreferenced brand assets**: only `logo-teal-square.svg` and
  `pleco-fish.svg` are imported; `logo-dark.svg`, `logo-light.svg`,
  `lockup-dark.svg`, `lockup-light.svg`, `pleco-rays.svg` are unused. Cheap
  to keep as the brand kit, but they are dead weight if the kit's source of
  truth is `koda-wzkp/pleco-site`.
- **Missing referenced file**: `README.md` cited a reference design
  `codec-pleco-dev.html` that is not in the repo (removed in the README
  rewrite).
- **Possibly stale launch checklist**: the old README's "Before launch"
  items (make repo public; regenerate `og.png` with real fonts) may already
  be done — the committed `og.png` should be verified for the IBM Plex vs.
  Georgia fallback issue it describes.
- No CI, no tests. Acceptable for a static site; required before engine
  code lands.

## 6. Gaps

Relative to what CODEC claims to be, the repo is missing:

1. **Any engine/adapter code.** The gap between the open-source pitch and
   repo contents (§2) is the one that matters.
2. **Adapter architecture docs** — added in this pass
   (`docs/adapters/SPEC.md`, `docs/adapters/square.md`,
   `docs/adapters/TEMPLATE.md`).
3. **A README that says what CODEC is** — fixed in this pass.
4. Contributing/security policy docs — worth adding when outside
   contributions or engine code arrive, not before.

## 7. Proposed restructure (proposal only — nothing moved)

The site currently lives at the repo root and Vercel deploys it from there.
That is fine while the repo is site + docs. When the first engine/adapter
code is published, adopt one of:

- **Option A (recommended): split the site out** to its own repo
  (e.g. `pleco-codec-site`) and let this repo be the engine: `packages/core`,
  `packages/adapter-square`, `docs/`. The landing page's clone pitch then
  points at the thing it describes.
- **Option B: monorepo** — move the site to `site/` and add `packages/*`
  beside it; update the Vercel project root directory.

Either way, do it in the same change that publishes engine code, not
before. Until then the only structural change made in this pass is adding
`docs/`.

## 8. Actions taken in this pass

- Added `docs/adapters/SPEC.md` (adapter contract),
  `docs/adapters/square.md` (Square reference mapping),
  `docs/adapters/TEMPLATE.md` (feasibility-gated adapter template).
- Rewrote `README.md` to describe CODEC, state honestly what this repo
  does and does not contain, and link the docs.
- Left landing-page copy, pricing, venue names, brand assets, and
  `.gitignore` untouched — flagged above for owner decisions.
