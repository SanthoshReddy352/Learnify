# Contributing to Learnify

Thanks for your interest. This document covers the workflow and the local checks CI will run against your branch.

## Setup

**Node.js 22+ is required**, not merely recommended — the unit tests import TypeScript from `lib/` directly and depend on Node's built-in type stripping.

```bash
git clone https://github.com/SanthoshReddy352/Learnify.git
cd Learnify
npm install
npm run dev
```

Environment variables go in **`.env`**, not `.env.local` — the `.env.local` in this repo is UTF‑16 and is silently ignored by Next.js and dotenv. See the [README](Readme.md#environment-variables) for the full list.

The package manager is **npm**. `package-lock.json` is the lockfile and is committed; don't add a `yarn.lock`, and use `npm ci` when you want a clean, lockfile-exact install.

## Before you open a PR

Run what CI runs:

```bash
npm run lint && npm test && npm run eval && npm run build
```

- **`npm test`** — unit tests via `node --test`. Please keep it green; a red suite blocks the merge.
- **`npm run eval`** — offline AI quality checks (mermaid parse rate, schema robustness, prompt-injection screener). No network, no provider, no cost.
- **`npm run build`** — catches issues the dev server tolerates. **Stop the dev server first**: both use `.next/`, and mixed artifacts cause `Cannot find module './vendor-chunks/...'` errors. If that happens, delete `.next/` and rebuild.

## Branching

| Kind | Branch name |
|---|---|
| Feature | `feature/<short-name>` |
| Bug fix | `fix/<short-name>` |
| Release prep | `release/<version>` |

Branch from `main`, which holds the stable version. Never commit directly to `main`.

## Pull requests

1. Describe **what changed and why**, referencing the issue number if there is one.
2. Note anything a reviewer cannot see from the diff: a migration you did not apply, a flag you left off, a check you could not run.
3. If you touched the schema or a feature flag, say so explicitly — see the conventions below.
4. Request a review, and merge once approved and CI is green.

## Code conventions

These come out of decisions recorded in [`docs/IMPROVEMENT_PLAN.md`](docs/IMPROVEMENT_PLAN.md); its decision log is the best place to understand *why* the codebase looks the way it does.

**Put decision logic in a pure module under `lib/`, and unit-test it.** Route handlers and components should do I/O and rendering. Pure modules must use **relative imports, not the `@/` alias** — `node --test` loads them directly and does not resolve path aliases.

**Never apply a migration to production as part of a feature PR.** Write it as a `supabase/migrations/*.sql` file, build the code against its schema contract, and leave it unapplied. All production database changes happen together in a planned pass (§ P14 of the improvement plan).

**New subsystems ship behind a flag, defaulting to off, and fail soft.** With the flag off — or the table not yet migrated — the feature does nothing rather than throwing. Reads degrade to "no data"; writes no-op.

**RLS is the security boundary, not application code.** `supabase-js` is the runtime client so policies keep applying. Where a route needs both authorization and privileged data, authorize with the user's client and then read with the admin client — never admin-only, which would skip access control.

**Never log or report a secret.** The app stores users' own AI provider keys. Anything leaving the process goes through `lib/observability/redact.js`; if you add a new sink or a new kind of context, add a redaction test with it.

**Validate every request payload with zod** in `lib/validation/schemas.js`, mirroring the database's own CHECK constraints.

**User-facing copy about a person is observational, never a verdict.** Teacher analytics may say "no sessions logged in 9 days"; it may not say "disengaged". Integrity flags describe what was observed and never accuse. Reminder copy states what is due without guilt-tripping. All three are enforced by unit tests — if you add copy in these areas, extend those tests.

**Charts follow the `dataviz` conventions already in the codebase**: no dual-axis charts, sequential single-hue ramps for magnitude, status colors always paired with an icon and a label, and a legend whenever there are two or more series.

## Reporting bugs and requesting features

Open a GitHub issue and tag it appropriately. For a bug, include what you expected, what happened, and the `Reference:` digest from the error screen if you saw one — it ties your crash to a specific server-side error.
