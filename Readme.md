# Learnify

**AI-powered adaptive learning and study orchestrator.**

Learnify builds personalized learning roadmaps from knowledge graphs, spaced repetition (SM‑2), and AI-generated content. Instead of a static list of topics, a subject is a dependency graph: topics unlock only once their prerequisites are mastered, and reviews are scheduled to maximize long-term retention.

---

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Feature flags](#feature-flags)
- [Scripts](#scripts)
- [Database](#database)
- [Mobile (Android)](#mobile-android)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## How it works

1. You give Learnify a subject (and optionally a syllabus).
2. An AI pass generates a **directed acyclic graph** of topics with prerequisite edges.
3. The **unlock engine** keeps topic statuses consistent: `locked → available → learning → reviewing → mastered`.
4. Lesson content is generated per topic — grounded in real web sources and cited, with mermaid diagrams validated server-side before they ever reach a browser.
5. Completing a topic starts an **SM‑2** review schedule, and reminders bring you back on the day a review comes due.
6. Everything you do feeds a per-concept memory that adapts later lessons, the review queue, and the AI tutor.

## Features

**Learning core**
- Subject and topic management, manual or AI-generated
- Knowledge-graph visualizer (React Flow) with a dependency-aware unlock engine
- SM‑2 spaced repetition with a due-review queue that puts weak concepts first and interleaves subjects
- AI-generated lessons, flashcards, and cheat sheets; a Socratic doubt-chat tutor

**Content quality**
- Web-grounded generation with a "References & Further Learning" citation section
- Two-pass generation (outline → bounded sections) so long lessons are never truncated
- Server-side mermaid validation with AI self-repair; broken diagrams cannot reach clients
- Per-topic **concept ledgers**, so a lesson knows what earlier topics already taught and doesn't re-teach them

**Practice and assessment**
- In-lesson retrieval practice with confidence calibration captured *before* the reveal
- Server-graded subject exams; answer keys are shielded with a column-level `revoke`, not just RLS
- Assessment integrity: per-attempt question/option randomization, advisory anomaly signals, teacher review for classrooms, and an oral viva for self-paced learners

**Multi-modal delivery**
- Text-to-speech narration (Web Speech API — no paid TTS)
- Sandboxed interactive artifacts and simulations
- Project-based learning tracks
- Derived XP, levels, and badges (no stored counter, nothing to cheat)

**Engagement**
- Due-review reminders over Web Push and optional email, delivered at an hour you choose in your own timezone
- Weekly review goals, streaks, and a 14-day activity view

**Classrooms**
- Teacher-managed classrooms, courses, invites, and per-student progress
- Teacher analytics: a class-wide concept heatmap, at-risk flags in plain language, and per-student drill-down

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 14** (App Router) |
| UI | React 18, Tailwind CSS, shadcn/ui, Framer Motion |
| Visualization | React Flow, Mermaid, Recharts |
| Database / auth / storage / realtime | Supabase (PostgreSQL, RLS everywhere) |
| AI | **Vercel AI SDK v7** — Google Gemini, Anthropic, and *any* OpenAI-compatible endpoint, with per-user BYOK keys and an automatic fallback ladder |
| Background jobs | Inngest (async generation, reminder cron) |
| Validation | Zod, mirroring the database's own CHECK constraints |
| Types | Incremental TypeScript, starting with `lib/` |
| Tests | Node's built-in runner (`node --test`) — zero test dependencies |
| Mobile | Capacitor (Android) |
| Package manager | **npm** (`package-lock.json` is the lockfile) |

> **Note on AI providers:** Learnify is provider-agnostic. There is no OpenRouter-specific code — OpenRouter, Ollama, LM Studio, Groq, vLLM and similar all work through the generic OpenAI-compatible adapter. Users can supply their own keys in Settings, and a user's key always outranks the platform's.

## Getting started

### Prerequisites

- **Node.js 22+** — required, not just recommended: the unit tests import TypeScript from `lib/` directly and rely on Node's built-in type stripping.
- npm
- A [Supabase](https://supabase.com/) project
- At least one AI provider key (Google Gemini, Anthropic, or any OpenAI-compatible endpoint)

### Installation

```bash
git clone https://github.com/SanthoshReddy352/Learnify.git
cd Learnify
npm install
```

### Run it

```bash
npm run dev
```

Open <http://localhost:3000>.

For background jobs (async generation, reminders) run the Inngest dev server alongside it — it discovers `app/api/inngest` and needs no keys locally:

```bash
npx inngest-cli@latest dev
```

### Production build

```bash
npm run build && npm start
```

> **Don't run `npm run build` while the dev server is running.** Both use `.next/`, and mixed dev/prod artifacts cause `Cannot find module './vendor-chunks/...'` errors at runtime. Stop the dev server, delete `.next/`, then build.

## Environment variables

Put them in **`.env`**, not `.env.local`.

> ⚠️ The `.env.local` in this repo is UTF‑16 encoded, which Next.js and dotenv silently ignore. Anything you add there is dead. Use `.env` (UTF‑8), or re-save/delete `.env.local` to avoid losing an afternoon to it.

**Required**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**Required for anything server-graded** — practice grading, exams, the viva, classroom content generation, and background jobs. Server-side only; never expose it to the client.

```bash
SUPABASE_SERVICE_ROLE_KEY=...
```

**AI providers** — at least one. Within Google, a user's own key from Settings always wins.

```bash
GEMINI_API_KEY=...
GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash
ANTHROPIC_API_KEY=...
ANTHROPIC_MODELS=claude-sonnet-5
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1   # or http://localhost:11434/v1
OPENAI_COMPAT_API_KEY=...                             # optional for local servers
OPENAI_COMPAT_MODELS=deepseek/deepseek-chat,llama3.3
AI_PROVIDER_ORDER=openai-compatible,google,anthropic
```

**Background jobs** — not needed locally; the Inngest dev server discovers the app.

```bash
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
```

**Review reminders** (optional). Generate the VAPID pair **once** with `npx web-push generate-vapid-keys` — rotating it unregisters every device.

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
NEXT_PUBLIC_APP_URL=https://your-deployment
RESEND_API_KEY=...            # optional: enables email digests
REMINDER_EMAIL_FROM=...       # optional: required alongside RESEND_API_KEY
```

**Error observability** (optional). Either, both, or neither — with neither, errors are still logged locally.

```bash
SENTRY_DSN=...                # posted as a Sentry envelope over plain fetch, no SDK
ERROR_WEBHOOK_URL=...         # or any endpoint that accepts a JSON POST
```

## Feature flags

Newer subsystems ship **off by default** and are enabled per environment. Each one fails soft: with a flag off (or its table not yet migrated), the feature does nothing rather than erroring.

| Flag | Turns on |
|---|---|
| `CONTENT_LEDGER` | Concept-ledger extraction + continuity context between topics |
| `CONTENT_SECTIONED` | Two-pass outline → per-section generation |
| `CONTENT_GROUNDING` | Web retrieval and citations |
| `CONTENT_VERIFY` | Source-grounded fact-check pass |
| `CONTENT_PROJECT` / `CONTENT_ARTIFACT` | Persisting project tracks / interactive artifacts |
| `NEXT_PUBLIC_ASYNC_GENERATION` | Async generation with live Realtime progress |
| `USER_MEMORY` | Per-concept learner memory |
| `SOCRATIC_CHAT` | **On by default**; set `false` for the old answer-first tutor |
| `ASSESSMENTS` | Item bank, practice, exams, viva |
| `REVIEW_REMINDERS` | The hourly due-review reminder sender |

See [`docs/IMPROVEMENT_PLAN.md`](docs/IMPROVEMENT_PLAN.md) for the order to enable them in and what to verify at each step.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `0.0.0.0:3000` |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next config) |
| `npm test` | Unit tests via `node --test` |
| `npm run eval` | Offline AI evals: mermaid parse rate, schema robustness, prompt-injection screener. Add `--net` for a live grounding check. |
| `npm run db:pull` / `db:validate` | Refresh / validate the Prisma schema mirror |
| `npm run db:schema-dump` | Dump the production schema to `schema/` |
| `npm run android:dev` / `android:prod` | Point Capacitor at the dev or prod config and sync |

## Database

Supabase PostgreSQL with **row-level security on every table**. `supabase-js` is the runtime client precisely so RLS keeps applying; Prisma is present only as a schema mirror for drift detection, never as the data client.

Migrations live in [`supabase/migrations/`](supabase/migrations) and are applied in filename order. Several are intentionally **unapplied** — features are built against their schema contract and stay dark behind a flag until a single planned production pass. `docs/IMPROVEMENT_PLAN.md` (§ P14) is the runbook: migration order and dependencies, env vars, flag-flip order, and per-feature verification.

Enable Realtime for `topics`, `topic_dependencies`, and `generation_jobs`.

## Mobile (Android)

Capacitor wraps the deployed site, so the app is same-origin and needs no CORS.

```bash
npm run android:dev      # point Capacitor at the dev config and sync
npx cap open android     # open in Android Studio
```

> Web Push does not work inside the Capacitor Android WebView. Browsers and installed PWAs get review reminders today; native Android push needs an FCM adapter.

## Project structure

```
app/
  (marketing)/          landing page
  (auth)/               login, signup, password reset
  (app)/                signed-in shell — dashboard, subjects, classrooms, teacher, community
  (immersive)/          full-screen learning view
  api/                  route handlers (AI generation, assessment, notifications, inngest, …)
components/
  ui/                   shadcn primitives
  subjects/ teacher/ settings/ dashboard/ sub-components/
lib/
  ai/                   provider registry, pipelines, mermaid validation, web tools
  sm2.ts unlock-engine.ts   the two algorithms, fully typed and unit-tested
  memory/ teacher/ assessment/ gamification/ reminders/ tts/ observability/ time/
  inngest/ jobs/        background workers and enqueueing
  supabase/             browser, server, admin clients + middleware
  validation/           zod schemas mirroring DB constraints
supabase/migrations/    SQL migrations (some intentionally unapplied — see P14)
tests/                  node --test unit tests
evals/                  offline AI quality harness
docs/                   feature specs, DB schema, improvement plan
```

Route groups are invisible in URLs: `app/(app)/dashboard/page.js` serves `/dashboard`.

## Documentation

| Doc | Contents |
|---|---|
| [`docs/IMPROVEMENT_PLAN.md`](docs/IMPROVEMENT_PLAN.md) | **Start here.** Status tracker, architectural decision log, and the P14 production runbook |
| [`docs/Learnify DB Schema.md`](docs/Learnify%20DB%20Schema.md) | Full database schema |
| [`docs/Learnify Developer Documentation.md`](docs/Learnify%20Developer%20Documentation.md) | Developer guide |
| [`docs/Learnify Onboardin Dev Guide.md`](docs/Learnify%20Onboardin%20Dev%20Guide.md) | Onboarding |
| `docs/FEATURE *.md` | Per-feature specs |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branching, PRs, and local checks |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: branch from `main`, run `npm run lint && npm test` before opening a PR, and keep new business logic in a pure, unit-tested module under `lib/`.

## License

See [LICENSE](LICENSE) if present; otherwise all rights reserved by the repository owner.
