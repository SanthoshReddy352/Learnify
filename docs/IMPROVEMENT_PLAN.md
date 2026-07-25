# Learnify Improvement Plan — Status Tracker

> Source: full codebase + Supabase audit (2026-07-22).
> Update the Status column as work lands. Statuses: `todo` / `in-progress` / `done` / `blocked` / `wontfix`.

## Remaining roadmap — execution order (reprioritized 2026-07-23)

Phases 0–3 (security, UX debt, foundation, AI SDK migration) plus the S/P/U/E/M work are **done** (historical record below). Old pending items `3.4`, `3.5`, `3.6`, `4.1–4.3` were folded into the reprioritized phases below. The remaining work runs in this order:

| Order | Phase | Why here | Absorbs |
|-------|-------|----------|---------|
| 1 | **P5 — Async generation backbone + evals** | Everything downstream (web-grounded agentic gen, two-pass lessons, learning artifacts) is slower + multi-step; generation already ~100s and would time out on Vercel. Unblocks all heavy generation. Eval harness measures quality as agentic steps are added. | old 3.5, 3.6 |
| 2 | **P6 — Agentic, grounded content pipeline** | The trust fix + the continuity fixes are the same rewrite. Grounds content in real sources (web search/extract), cites YouTube/GfG/Wikipedia, injects DAG-neighbor context, generates section-by-section (no truncation), and emits concept ledgers (subject memory). | old 5.1–5.4 (prev draft) |
| 3 | **P7 — Multi-modal & multi-mode learning** | Delivers on the learning-style promise the profile already collects. Free TTS + reference media + interactive artifacts/simulations/projects/gamification. Zero-to-low token cost (protects the free-platform budget). | — |
| 4 ✅ | **P8 — User memory & personalization loop** (done in code) | Turns per-user history (SM-2 + doubt-chat) into an episodic memory that adapts generation, doubt-chat, and the review queue. | old 5.5–5.6 (prev draft) |
| 5 ✅ | **P9 — Assessment & certification** (P9.1–P9.4 done in code; P9.5 certificates deliberately wait for P10) | Tests are the backbone; items generated from concept ledgers (P6) so they're provably aligned to what was taught. | old Phase 6 (prev draft) |
| 6 ✅ | **P10 — Assessment integrity (mode-differentiated)** (done in code) | Classroom = teacher-reviewed flags; self-paced = fully automated + oral viva. Gates P9 certificates. | old Phase 7 (prev draft) |
| 7 ✅ | **P11 — Engagement & reminders** (done in code) | Review reminders activate SM-2 (inert without them). Small, high-ROI, independent — **can be built early in parallel.** | — |
| 8 ✅ | **P12 — Teacher analytics (UI-first)** (done in code) | Insightful, easy-to-read class dashboards; richest once P9 concept-tagged data exists, but UI scaffolding can start on existing progress data. | — |
| 9 ✅ | **P13 — Ops & docs** (done in code) | CI, error observability, README refresh. | old 4.1–4.3 |
| 10 (LAST) | **P14 — Production runbook** | Every `supabase/migrations/*.sql` accumulated across P5–P13 applied to prod together in dependency order, plus env vars, flag flips and verification — the owner's complete go-live checklist. Nothing touches the prod DB before this. | all deferred migrations + all env/flag/owner actions |

> **Standing constraint — defer prod DB migrations (owner, 2026-07-23):** No schema/DB migration is applied to the production Supabase (`bljhrkulhkokfdpwwvlc`) as phases land. Each migration is written as a `supabase/migrations/*.sql` file and code is built against its schema contract, but it stays UNAPPLIED. **All production database changes are applied together in the final phase (P14),** after every phase's code is done. Local dev / a Supabase branch may be used for testing in the meantime.

> **Standing constraint — free platform / budget cap (owner, 2026-07-23):** Learnify is intended to be free so education is accessible; the LLM path must favor cheaper/fewer tokens. Consequences threaded through the phases below: **AI image generation stays deferred** (visual richness comes from mermaid + *linked* external media, not generation); **TTS uses the browser Web Speech API + Android native TTS** (no paid TTS); web-grounding results are cached and reused across learners.

## Phase 0 — Security (do first)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.1 | Rotate leaked `GEMINI_API_KEY` (in git history: commit `b2ffc07`, `.env.local.backup`) | **blocked — owner action** | Must be done in Google AI Studio by the account owner. Update `.env.local` + Vercel env after rotating. |
| 0.2 | Untrack `.env.local.backup`, add to `.gitignore` | done | File removed from index; history scrub optional after key rotation. |
| 0.3 | Move `gemini_api_key` / `huggingface_api_key` out of publicly-readable `profiles` into owner-only `user_secrets` table | done | Migration `secure_user_secrets`; columns dropped from `profiles`; 6 API routes repointed. |
| 0.4 | Fix broken RLS policy "Invitees can view pending classrooms" (self-join typo) | done | Now correctly matches `classroom_invites.classroom_id = classrooms.id`. |
| 0.5 | Lock down SECURITY DEFINER function exposure | done (partial by design) | `handle_new_user` (the only state-changing one) revoked from PUBLIC/anon/authenticated. The read-only helpers (`auth_email`, `is_teacher`, `is_classroom_*`) intentionally stay executable — RLS policies invoke them under the querying role (incl. anon for public subject reads) and they only reveal the caller's own auth context. Advisor will keep WARNing on them; accepted. |
| 0.6 | Pin `search_path` on `update_updated_at_column`, `handle_new_user` | done | `SET search_path = public, pg_temp`. |
| 0.7 | Remove broad SELECT (listing) policy on public `topic-images` bucket | done | Object URLs still work; listing no longer allowed. |
| 0.8 | Enable leaked-password protection (HaveIBeenPwned) | **blocked — owner action** | Supabase Dashboard → Auth → Passwords. Not exposed via API. |
| 0.9 | Lock down `next.config.js` headers (X-Frame-Options ALLOWALL, `frame-ancestors *`, blanket CORS) | done | Android app loads the deployed site directly (same origin), so CORS removal is safe. |
| 0.10 | Server-side auth gating in middleware (redirect logged-out users from app pages to `/login?next=…`) | done | Public paths: landing, auth pages, `/community`, `/resource-hub`, `/u/*`, callback, static assets. |
| 0.11 | PRIVACY: public/community sharing leaked the author's progress (topic `status`, SM-2 fields, `next_review_at`) and private `user_notes` — both in the UI and via the all-columns RLS policy | done | Migration `shared_views_privacy_and_bulk_rpc`: dropped "Users can view public topics" policy; added sanitized `shared_topics` + `shared_subject_stats` security-definer views. Share page shows neutral node states; clone reads through the view. Verified: anon sees 0 raw topic rows. |

## Phase 1 — UX debt

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Route groups `(auth)` / `(app)` / `(marketing)` / `(immersive)` so login/signup no longer render inside the dashboard sidebar+header | done | `GlobalNavigation.jsx` deleted; each group has its own layout. URLs unchanged (groups are invisible in paths). |
| 1.2 | Cap "Due for Review" widget at 6 items + collapsible "Show all" | done | Reviews already arrive most-overdue first from `lib/analytics.js`. |
| 1.3 | Quiet mermaid failure states (chip + retry + collapsed details, never raw parser output in content) | done | Client fallback only; the real upstream fix (server-side render/repair) is 3.3. |
| 1.4 | Light-mode pass on glass styles | done (sweep) | ~370 `*-white/5..20` utilities → theme-aware `border-border`/`bg-foreground` equivalents across 35 files; scrollbars now use `hsl(var(--foreground)/…)`. Lightbox overlays intentionally kept white-alpha (always-dark backdrop). |
| 1.5 | Remove `maximumScale: 1` (restore pinch-zoom) | done | |
| 1.6 | Delete MongoDB scaffold, drop `mongodb` + `uuid` deps, remove `serverComponentsExternalPackages` | done | |
| 1.7 | Single package manager (yarn), removed `package-lock.json` + bogus `resolutions: next ^16` | done | Security pins (glob/tar/minimatch/serialize-javascript) kept. |
| 1.8 | Stop refetching `/api/user/role` on every route change in sidebar | done | Fetches once per mount. |

## Phase 2 — Foundation

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Unit tests for SM-2 and unlock engine | done | 22 tests via Node's built-in runner (`yarn test` → `node --test`), zero new deps. Unlock logic extracted to pure `lib/unlock-engine.js`. Removed stray `tests/__init__.py`. |
| 2.2 | Unlock engine writes in one round trip | done | Decision logic stays in unit-tested JS (`computeUnlockUpdates`); all status changes applied via single `apply_topic_status_updates` RPC (SECURITY INVOKER, RLS still applies per row). |
| 2.3 | Bulk inserts for subject clone + graph generation (kill N+1) | done | IDs pre-generated with `randomUUID()` so old→new maps need no readbacks; topics + dependencies each land in one request. Dependency insert uses upsert-ignore against the unique constraint. |
| 2.4 | Split `app/(app)/subjects/[id]/page.js` into components | done | 2,076 → 1,262 lines. Pure text helpers → `components/subjects/subject-text.jsx`; all 7 dialogs → prop-driven components in `components/subjects/subject-dialogs.jsx`. Verified via production build; authenticated click-through pending owner login. |
| 2.5 | Incremental TypeScript adoption starting with `lib/` | done (started) | `tsconfig.json` replaces jsconfig; `lib/sm2.ts` + `lib/unlock-engine.ts` fully typed; tests run the TS directly (Node 24 type stripping). NOTE: typescript pinned to 5.9.x — v7 (Go compiler) breaks Next 14 path aliases. |
| 2.6 | Explicit ownership checks in server actions (belt + suspenders over RLS) | done | `assertTopicOwnership` / `assertSubjectOwnership` guards on all mutating actions in `lib/actions.js`. |
| 2.7 | Fix doubt-chat user-key bug (profile query never selects the key) | done | Repointed to `user_secrets` as part of 0.3. |

## Phase 3 — AI platform (agentic architecture)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Vercel AI SDK (v7) provider registry replacing `lib/gemini.js` | done | `lib/ai/registry.js` + `lib/ai/generate.js`: Google (user BYOK key outranks system key), any OpenAI-compatible endpoint, Anthropic — env-configured order + model fallback ladder. `lib/gemini.js` deleted; all 5 AI routes migrated. |
| 3.2 | Structured outputs: curriculum + flashcards via `generateObject` + zod | done | `aiCurriculumSchema` / `aiFlashcardsSchema`; no more JSON-out-of-markdown parsing in `generate-graph` / `generate-topic-flashcards`. |
| 3.3 | Mermaid-only content pipeline: server-side validate → AI self-repair → drop | done | `lib/ai/mermaid.js` (jsdom + `mermaid.parse`, 2 repair attempts fed the real parser error, fail-open if validator infra breaks). Wikimedia search + `<<IMAGE>>` placeholders removed. Broken diagrams can no longer reach clients. Follow-up idea: structured content blocks instead of one markdown blob. |
| 3.4 | Image agent: multi-backend generation, outputs persisted to `topic-images` bucket | **wontfix (deferred, budget cap)** | Owner decision reaffirmed 2026-07-23: free-platform budget cap → no AI image generation. Visual richness instead comes from mermaid + **linked** external media (YouTube/articles) surfaced in P7. |
| 3.5 | Background job architecture (`generation_jobs` table + Edge Function / Inngest) with Realtime progress to client | todo → **reprioritized into P5** | Kills serverless-timeout risk; real progress UI. Now the #1 remaining item — agentic web-grounded generation makes async mandatory. |
| 3.6 | Eval harness: mermaid parse rate, schema pass rate across providers | todo → **reprioritized into P5** | `validateMermaid` imports in plain Node — evals can reuse it directly. Extended in P5 to score grounding/citation quality. |

## Schema tooling (added 2026-07-22)

| # | Task | Status | Notes |
|---|------|--------|-------|
| S.1 | Audit Supabase for leftover/default tables | done — nothing to remove | `public` contains only the 17 app tables. `auth`/`storage`/`realtime`/`vault`/`extensions` are Supabase platform schemas (required, not removable); `realtime.messages_*` are auto-managed daily partitions. |
| S.2 | Schema-only dump script | done | `scripts/dump-schema.ps1` (Windows) / `.sh` (CI). Fill `scripts/.env.schema` from `scripts/schema.env.example`, then `yarn db:schema-dump` → `schema/production_schema.sql`. Uses pg_dump if installed, else Supabase CLI. |
| S.3 | Prisma schema mirror of production | done | `prisma/schema.prisma`, hand-generated from live introspection, `prisma validate` passes. Refresh from prod with `yarn db:pull` (needs `DATABASE_URL`). Runtime stays on supabase-js so RLS keeps applying — Prisma is schema source-of-truth/drift detection, not the data client. |
| S.4 | Zod validation layer | done | `lib/validation/schemas.js` mirrors DB CHECK constraints + API payloads; wired into generate-graph (incl. AI curriculum output), generate-topic-content, doubt-chat, and user settings routes. |

## Per-user AI provider config in Settings (added 2026-07-22)

| # | Task | Status | Notes |
|---|------|--------|-------|
| P.1 | Extend `user_secrets` for all providers | done | Migration `user_secrets_multi_provider`: added `anthropic_api_key`, `openai_compat_base_url`, `openai_compat_api_key`, `openai_compat_models` (owner-only RLS inherited). |
| P.2 | Registry reads per-user config, not just Gemini | done | `getModelCandidates({ userSecrets })` — user's Gemini/Anthropic keys and custom OpenAI-compatible endpoint all outrank env config. `generate.js` keeps `userGeminiKey` back-compat via `normalizeSecrets`. |
| P.3 | Settings UI: full AI Providers section | done | `app/(app)/dashboard/settings/page.js` — Gemini, Anthropic, and a custom OpenAI-compatible endpoint (base URL + model list + optional key). Masked display of existing keys; blank field = keep current. Settings API GET/POST rewritten + zod-validated. |

## Micro-UI fixes (2026-07-22)

| # | Task | Status | Notes |
|---|------|--------|-------|
| U.1 | Dashboard header avatar was a fake button | done | Had `pointer-events-none` + `cursor-help` + no handler but hover states and a "User Profile" tooltip. Now a real icon button → `/dashboard/profile`; email truncates at 220px. |
| U.2 | `.glass-card` border invisible in light mode | done | `border-foreground/5` (5% black on near-white) → `/10` for a visible edge in both themes. |
| U.3 | Cross-page overflow / breakpoint audit | done — no issues | Measured landing/login/community/resource-hub/dashboard/profile/settings/subjects/learn at 375/768/1280 in light+dark: `scrollWidth == clientWidth` everywhere (no horizontal scroll); decorative blobs are contained by `overflow-hidden`. |
| U.4 | Mojibake bullet in learn page | done | `app/(immersive)/learn/[topicId]/page.js:441` had a double-encoded `•` rendering as `â€¢`. Fixed to a proper UTF-8 bullet. Full codebase re-scanned for other mojibake — none found. |
| U.5 | Settings provider-order description hardcoded | done | Card description claimed a fixed "Gemini, endpoint, Anthropic" order; now order-agnostic ("configured providers used before platform defaults, with automatic fallback"). |
| U.6 | Authenticated route sweep (logged in as teacher) | done | Verified render + no overflow on dashboard, profile, settings, subjects, learn. Confirmed refactored subject dialogs (CreateTopic, AIGenerate) open and fit viewport. DoubtChat button correctly gated on real generated content (not a bug). |

## Env / provider routing (2026-07-22, live-verified)

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| E.1 | `.env.local` is UTF-16 → Next.js/dotenv silently ignores it | documented | The app's `NEXT_PUBLIC_SUPABASE_*` vars load from `.env` (UTF-8), which is why it works anyway. Any var added to `.env.local` is dead. **Put env vars in `.env`.** Consider re-saving `.env.local` as UTF-8 or deleting it to avoid confusion. |
| E.2 | Make OpenCode Zen primary | done | `AI_PROVIDER_ORDER=openai-compatible,google,anthropic` added to `.env`. |
| E.3 | Full AI pipeline live-verified via OpenCode Zen `big-pickle` | done | Content generation fell through invalid user Gemini key + leaked/quota system key → succeeded on `big-pickle`; mermaid validator ran (4/4 diagrams valid, 0 dropped). ⚠️ Generation took ~100s — reinforces need for Phase 3.5 background jobs (Vercel would time out). |
| E.4 | Leaked `GEMINI_API_KEY` still in `.env` and actively erroring ("reported as leaked") | **owner action** | Rotate it; the registry only reaches it as a fallback now, but it should be replaced/removed. Also the user's own Gemini key in Settings is invalid ("API key not valid") and their Google free-tier quota is exhausted — so Gemini is fully dead; OpenCode Zen carries all generation. |
| E.5 | `generateObject` (flashcards + curriculum) failed on OpenCode Zen big-pickle: "responseFormat not supported... only with structuredOutputs" | done | Rewrote `generateObjectWithFallback` (lib/ai/generate.js): try native structured output, and on structured-output-unsupported errors fall back to `generateText` + fenced-JSON extraction + zod validation. Works on any text-capable OpenAI-compatible model. Made the flashcards prompt state its JSON shape explicitly (native path injects schema; text path needs it in-prompt). Verified live: 3 valid flashcards generated from big-pickle. |
| E.6 | Content generateObject provider-order confirmed | done | With `AI_PROVIDER_ORDER=openai-compatible,google,anthropic`, big-pickle is now tried FIRST (verified in logs). |

## Mermaid render-vs-parse gap (2026-07-22)

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| M.1 | Diagrams passing server `parse()` still failed client `render()` → "Diagram unavailable" fallbacks | mitigated | Root cause: (a) server-side `render()` is impossible in jsdom (`SVGElement.getBBox` missing), so the validator can only `parse()`, which is lenient; (b) AI emitted render-breakers: literal newlines in labels, `<b>` tags, nested double quotes. |
| M.2 | Deterministic normalization added | done | `normalizeMermaidCode` in lib/ai/mermaid.js: literal newlines in quoted labels → `<br>`, strip HTML formatting tags (keep `<br>`). Safe regex approach — leaves nested-quote labels untouched (degrade to graceful fallback) rather than corrupting them. Unit-tested against the real failing diagrams. |
| M.3 | Prompt prevention | done | generate-topic-content prompt now forbids literal newlines in labels (use `<br>`), nested double quotes (use single), and HTML tags other than `<br>`. |
| M.4 | Quiet fallback confirmed working | done | The original complaint (raw parser errors leaking into content) stays fixed — errors are behind a collapsed "Technical details" disclosure with a Retry button; `console.error` logs are harmless. |
| M.5 | Retry button did nothing (re-rendered identical broken code) | done | Added client-side `fixMermaidRenderBreakers` in CodeBlock.jsx applied in the render path (first load + retry): strips HTML tags, converts literal newlines in labels to `<br>`, and demotes nested double quotes inside `[..]`/`{..}` labels to single quotes (bracket-scoped, safe). Live-verified on the topic that used to fail: all 5 diagrams render with SVGs, 0 fallbacks, 0 retry buttons, clean console in a fresh tab. Old stored diagrams now render without needing regeneration. |

## Dev-environment note

- **Never run `next build` while the `learnify-dev` server is running** — both use `.next/`, and the mixed prod/dev artifacts cause `Cannot find module './vendor-chunks/@capacitor.js'` 500s. Recovery: stop dev server, `rm -rf .next`, restart. Verify builds with the dev server stopped.
- Lib-file edits (e.g. `lib/ai/*`) don't always hot-reload into already-compiled route handlers; restart the dev server after changing them.

## Phase 4 — Polish

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | CI (lint + tests) on PRs | todo → **reprioritized into P13** | |
| 4.2 | Error observability (Sentry or similar) | todo → **reprioritized into P13** | |
| 4.3 | README/docs refresh (currently says Next 15 + OpenRouter; actual: Next 14 + Gemini) | todo → **reprioritized into P13** | |

## P5 — Async generation backbone + evals

> Prerequisite for everything below. Generation is already ~100s and about to become agentic (web calls) and multi-pass — it must move off the request path. Absorbs old 3.5 + 3.6.

> **Worker choice = Inngest** (owner, 2026-07-23) — keeps the entire Node/jsdom stack; per-section steps (P6.4) will fit under Vercel limits. `inngest@3.54.2` installed (project uses **npm** as of 2026-07-23). Still needs: the `generation_jobs` migration applied (deferred to P14), and `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` in prod (local dev needs neither — the Inngest Dev Server discovers `app/api/inngest`).

| # | Task | Status | Notes |
|---|------|--------|-------|
| P5.1 | `generation_jobs` table + Inngest worker | **done in code; migration deferred to P14; `yarn install` + live run pending** | Migration `supabase/migrations/20260723000000_generation_jobs.sql` (owner-only RLS, Realtime-enabled) — written, **intentionally NOT applied to prod** (see standing constraint; applies in P14). Pipeline extracted to `lib/ai/pipelines/topic-content.js` (+ pure `topic-content-prompt.js`, 9 unit tests) so sync route and worker share one code path. `inngest@3.54.2` installed via npm; 36/36 tests green. Inngest: `lib/inngest/client.js`, worker `lib/inngest/functions/generate-topic-content.js`, serve route `app/api/inngest/route.js` (`maxDuration=300`), enqueue helper `lib/jobs/enqueue.js` + async route `app/api/generate-topic-content/enqueue` (returns `202 {jobId}`). `inngest@^3.44.2` added to package.json. |
| P5.2 | Realtime progress to client | **done in code; live run pending P14** | Hook `lib/jobs/useGenerationJob.js` (enqueue → subscribe to the `generation_jobs` row via Realtime → catch-up SELECT for the race → resolve on terminal status) + `components/sub-components/GenerationProgress.jsx` (live stage + % bar, indeterminate fallback). Wired into both learn pages ((immersive) + classroom) behind **`NEXT_PUBLIC_ASYNC_GENERATION`** (default off → sync path unchanged; flip to `true` after P14 to activate async). Classroom path reloads via its course API (student RLS can't read the teacher topic directly). Lints clean; 36/36 tests green. Not live-verified — needs the `generation_jobs` table (P14). |
| P5.3 | Eval harness | **done + runs green** | `evals/run.mjs` + `npm run eval`. Offline (CI-safe, deterministic): schema robustness 100% (11 fixtures), mermaid parse rate 100% + normalizer lift, injection-screener accuracy (100% detection / 0% false-positive). `--net` adds a live grounding-retrieval eval (references count, grounding size, URL validity). `--ai` reserved for full-generation-across-providers (needs a configured provider). **Finding surfaced by `--net`:** keyless DuckDuckGo rate-limits under repeated calls → grounding intermittently returns 0 sources (see P6 review / follow-up on grounding resilience). |

## P6 — Agentic, grounded content pipeline (trust + continuity, one rewrite)

> **The trust fix and the continuity fixes are the same rewrite.** Root cause of the user's bugs, confirmed in code: `generate-topic-content` builds its prompt from only the topic's own title/description + syllabus + profile ([route.js:107-240](../app/api/generate-topic-content/route.js)) with *"Explain it ALL here, do not refer to external sources"* — an instruction to hallucinate — and it never reads DAG neighbors, so prerequisites are re-taught. And `maxOutputTokens: 16000` vs "cover EVERY SINGLE aspect" causes mid-sentence truncation. This phase flips the approach: **ground in real sources with tools instead of forbidding sources.** Reference implementation exists in the owner's own project (`D:/AGI` `namma_agent` — provider-agnostic layer + `tools/web.py` search/extract + `tools/learning_media.py`). Memory is two-tier as the owner proposed: **subject memory** = concept ledgers keyed to the existing `topic_dependencies` DAG; **user memory** = P8. Built on Postgres + `pgvector`, NOT a separate graph DB.

| # | Task | Status | Notes |
|---|------|--------|-------|
| P6.1 | Web search + web extract tools | **done + live-verified** | Ported the owner's `D:/AGI` `namma_agent` web tools to JS: `lib/ai/tools/web.js` (`webSearch` = keyless DuckDuckGo HTML endpoint, `webExtract` = jsdom HTML→text, pure `parseDdgHtml`/`unwrapDdgRedirect`/`htmlToText`) + `lib/ai/tools/web-screen.js` (prompt-injection screener from `docscan.py` — flagged web content is WRAPPED as untrusted data, never dropped). **Keyless = no vendor, fits budget cap.** 12 unit tests; **live smoke test passed** (real DDG search → GfG result → extract → screen). Next: P6.2 wires these into generation as a retrieve-then-ground step + citations. |
| P6.2 | Real reference material per topic (citations) + proper length | **done in code; behind `CONTENT_GROUNDING`; retrieval live-verified** | `lib/ai/pipelines/grounding.js`: `gatherGrounding` searches (P6.1 tools) → extracts + screens top sources → returns a grounding block (injected into prompts, replaces the "explain it ALL here" hallucination rule) + a citations list rendered as a "## References & Further Learning" markdown section (grouped Watch/Read/Reference, appended to content — no schema change, no generation cost). Wired into single-pass + sectioned; grounding trimmed for per-section calls (budget). **Length calibration (owner request):** replaced "cover EVERY SINGLE aspect" with PROPER-LENGTH guidance (thorough but not padded, not shallow, depth ∝ difficulty) across all three prompts. Gated by `CONTENT_GROUNDING=true` (default off; best-effort — falls through ungrounded on failure). Per-process grounding cache (cross-user cache = P14 DB). 6 grounding + 4 prompt unit tests (61/61); **live smoke test: real retrieval returned 4.9k chars of screened sources + 6 citations.** Full topic gen (grounding→prompt→AI) not live-run (AI provider constraints). |
| P6.3 | DAG-neighbor context injection | **done (unit-tested; live E2E pending a generation run)** | `lib/topics/neighbors.js` (`fetchTopicNeighbors` + pure `buildNeighborContext`), wired into `generate-topic-content` after the teacher-context block, best-effort (never fails generation). Direct prerequisites → "already taught, build on them, do NOT re-teach"; direct dependents → "taught later, do NOT pre-empt". 5 unit tests in `tests/topic-neighbors.test.mjs` (27/27 suite green). Uses direct edges + title/description now; will read concept ledgers (P6.5) once they exist. |
| P6.4 | Two-pass generation: section outline → bounded section fill | **done in code; behind `CONTENT_SECTIONED`; live run pending** | Pass 1: `topicOutlineSchema` via `generateObjectWithFallback` (5–10 sections, honors neighbor context). Pass 2: each section via `generateTextWithFallback` at `SECTION_MAX_TOKENS=3500` → no truncation; per-section progress fills the 15–65% band for P5.2. Assembled → clean → mermaid. New pure builders `buildOutlinePrompt`/`buildSectionPrompt` (5 unit tests). Gated by `CONTENT_SECTIONED=true` (default off = single-pass unchanged); **auto-falls back to single-pass if the outline step fails**, so enabling it can't break generation. Wired into route + worker. 41/41 tests, lints clean. Not live-verified (provider/run constraints). |
| P6.5 | Concept-ledger extraction (subject-memory substrate) | **done in code; behind `CONTENT_LEDGER`; migration → P14** | `extractConceptLedger` (conceptLedgerSchema) runs post-generation → `{ summary, concepts_introduced[], terms_defined[], notation_introduced[], prerequisites_used[] }`. Stored on `topics.concept_ledger jsonb` (migration `20260723000100_topic_concept_ledger.sql`, deferred) via a SEPARATE update so a missing column/failed extraction never risks the content save. `fetchTopicNeighbors({ includeLedger })` now prefers the ledger summary over the raw description in P6.3 continuity context — only selecting the column when the flag is on (missing-column-safe). Pure `buildLedgerExtractionPrompt` unit-tested. |
| P6.6 | Source-grounded verification pass | **automated pass done in code; report-affordance is a follow-up** | `verifyContentAgainstSources` (contentVerificationSchema) runs on grounded lessons → `{ supported, issues[{claim, issue}] }`; logs unsupported claims. Behind `CONTENT_VERIFY`, best-effort. Pure `buildVerificationPrompt` unit-tested. **Remaining:** the learner-facing "report this looks wrong" affordance + correction loop needs a feedback table (its migration would join P14) + UI — tracked as a small follow-up, not blocking P6. |

### P6 review findings (2026-07-23)

**Fixed during review:**
- **Cache poisoning** — `gatherGrounding` cached *empty* results, so a transient DuckDuckGo 0-result/rate-limit run would starve every later regeneration of that topic of grounding for the whole process lifetime. Now only meaningful results are cached.
- **Contradictory length signal** — the single-pass system prompt still said "comprehensive and exhaustive," pulling against the new PROPER-LENGTH user-prompt guidance. Aligned to "thorough but never padded."

**Follow-ups — ALL CLOSED 2026-07-25:**
- **Grounding resilience** — ✅ done. `webSearch` now walks a source chain with retry+backoff, treating an empty result as a failure (which is exactly how a DDG rate-limit presents: HTTP 200, no results): **DuckDuckGo HTML → DuckDuckGo Lite** (different markup, separate rate-limit bucket, `parseDdgLiteHtml`) **→ Wikipedia opensearch** (`parseWikipediaOpenSearch` — keyless, effectively never rate-limited, and for an educational topic it returns exactly the kind of reference worth citing). Both new parsers are pure + unit-tested; live-verified against the real network. The grounding cache is now bounded (200 entries, LRU) with a 12h TTL, which also cuts call volume.
- **SSRF surface** — ✅ done. New `lib/ai/tools/url-guard.js`: http(s) only, normal ports only, and **every host must RESOLVE to a public address** — a name-only blocklist catches nothing, since `localtest.me` and friends are public names pointing at 127.0.0.1. Blocks loopback/RFC1918/CGNAT/link-local (incl. `169.254.169.254`, the cloud metadata credential endpoint)/multicast/reserved, IPv6 loopback+ULA+link-local, and **unwraps IPv4-mapped and NAT64 addresses** rather than trusting the v6 wrapper. `guardedFetch` follows redirects by hand and re-checks each hop — `redirect: 'follow'` would let a public URL bounce straight to the metadata endpoint. Search results are screened at parse time too. 23 unit tests; live-verified that `http://169.254.169.254/latest/meta-data/` is refused. Residual gap documented in the module: DNS rebinding between our lookup and fetch's, unmitigated because every URL reaching it comes from a public search, not user input.
- **Minor** — ✅ done. `fetchText` now streams and stops at `FETCH_CAP` instead of buffering the whole body first.
- **"Report this looks wrong" (P6.6 human half)** — ✅ done. `content_feedback` table (reporter + subject owner read; only the owner resolves; the reporter deliberately cannot edit a filed report), `app/api/content-feedback`, and `components/sub-components/ReportContentButton.jsx` next to the lesson content in both learn pages. Picks up the reader's current text selection, since that is usually the exact passage being objected to. Deliberately not a moderation queue — nobody is staffed to be a central reviewer on a free platform, so a report routes to whoever can regenerate the topic.

## P7 — Multi-modal & multi-mode learning (deliver on the learning-style promise)

> The profile collects a `preferred_learning_style`, but the platform only ships one delivery mode (text). This phase makes the profile mean something. All items are chosen to stay within the free-platform budget cap.

| # | Task | Status | Notes |
|---|------|--------|-------|
| P7.1 | Free TTS narration | **done in code; live audio-verify pending** | `lib/tts/speech-text.js` (pure `stripMarkdownForSpeech` + `chunkForSpeech`, 7 unit tests — strips code/mermaid/URLs, chunks long text since Web Speech stalls on long utterances), `lib/tts/useTts.js` (play/pause/resume/stop, feature-detected, cleans up on unmount), `components/sub-components/TtsControls.jsx` (renders nothing when unsupported). Wired into both learn pages' "Comprehensive Guide" header. **Zero token cost, keyless.** Web Speech API works on web + Android WebView; a Capacitor native-TTS plugin can be added later for robust Android. Can't audio-verify here (no browser/login). |
| P7.2 | Reference-media surfacing in-lesson | **covered by P6.2 (links); rich embeds optional** | P6.2 already appends a "References & Further Learning" markdown section (grouped Watch/Read/Reference) that renders as clickable links in-lesson via MarkdownComponents. Optional follow-up: inline YouTube thumbnail/embed rendering for `Watch` links. |
| P7.3 | Interactive artifacts & simulations | **done + wired** | `interactiveArtifactSchema` + pure `buildArtifactPrompt` (self-contained, network-free widget) → `generateArtifact` + route `app/api/generate-artifact`. **Security-critical renderer `components/sub-components/ArtifactFrame.jsx`**: untrusted model HTML via iframe `srcDoc` with `sandbox="allow-scripts"` and NO `allow-same-origin` (null origin — no access to app cookies/session/DOM) + `default-src 'none'` CSP. **"Try an interactive demo" button wired into the immersive learn page** → generates + mounts `ArtifactFrame`. Storage `topics.artifact jsonb` behind `CONTENT_ARTIFACT` (migration → P14). Pure builder + schema unit-tested. Live AI/render verify pending (provider). |
| P7.4 | Project-based learning tracks | **done + wired** | `projectTrackSchema` + pure `buildProjectPrompt` → `generateProjectTrack` + route `app/api/generate-project`. **`components/subjects/ProjectTrackPanel.jsx` (generate button + milestone/checkpoint checklist, local check state) wired into the subject overview tab.** Storage `subjects.project_track jsonb` behind `CONTENT_PROJECT` (migration → P14). Pure builder + schema unit-tested. |
| P7.5 | Reward-based / gamified learning | **done + wired (real counts)** | `lib/gamification/xp.js` — XP/level/badges **DERIVED from existing progress**, so **no table, no migration, cheat-proof**. Quadratic level curve, 7 badges, personal-progress framing (no leaderboards). `GamificationPanel.jsx` on the dashboard. Real review count + streak now fed via `getGamificationCounts` (pure `deriveCountsFromLogs` over `study_logs`). 14 unit tests. |
| P7.6 | Accessibility pass | **mermaid a11y + new components done; full sweep remains** | Mermaid diagrams expose `role="img"` + `aria-label` from `%%title`/`%%desc:` (CodeBlock.jsx). New P7 controls are keyboard-accessible (TTS buttons carry `aria-label`; project checkpoints are `<button aria-pressed>`; artifact iframe has a `title`). Remaining (needs assistive-tech + visual testing, not doable headless): full keyboard-nav + contrast sweep across the app. |

## P8 — User memory & personalization loop

> Turns per-user history into an episodic memory (the user-wide memory the owner described). No new data collection — aggregation over data already captured (SM-2 + doubt-chat).

| # | Task | Status | Notes |
|---|------|--------|-------|
| P8.1 | `user_concept_state` (per-user, per-concept mastery) | **done in code; behind `USER_MEMORY`; migration → P14** | Migration `20260723000300_user_concept_state.sql` (owner-only RLS on all four verbs — it's the learner's own private memory). Engine `lib/memory/concept-state.js`: `normalizeConceptKey` (so "Big-O Notation" / "big o notation" are one concept), signal constructors, EMA mastery (`MASTERY_ALPHA=0.4`, **seeded from the first real observation** so one perfect review isn't read as 0.4), `summarizeConceptState`, `buildLearnerMemoryContext`, `buildProactiveNudge`, `scoreTopicWeakness`, `orderReviewQueue` — all pure + 23 unit tests. Key design call: **only signals carrying a performance observation move mastery**; reading a lesson or asking a question records exposure/struggle counts only — that split is what lets state say "has seen this a lot and is still shaky". DB helpers fail soft (missing table pre-P14 → no memory, never an error). |
| P8.2 | Wire user memory into generation + review queue | **done in code; behind `USER_MEMORY`** | Writes: `submitReview` (graded quality → mastery) and `completeLearning` (exposure only) in `lib/actions.js` via `rememberTopicSignal`, best-effort. Reads: `learnerContext` threaded into **all three** content prompts (single-pass, outline, per-section) + the outline prompt now allows a short refresher section for a *weak-for-this-student* prerequisite; wired in both the sync route and the Inngest worker (worker scopes the admin-client read to the job's own user). Review queue: `getAllDueReviews` → `orderReviewQueue` = weakest-concept-first + **subject interleaving**. Note: interleaving changes the due-widget order even with memory off (weakness then falls back to each topic's SM-2 ease factor) — deliberate, retention-science-backed. |
| P8.3 | Socratic + proactive doubt-chat | **done in code** | Tutor prompt extracted to pure `lib/ai/pipelines/doubt-chat-prompt.js` (7 unit tests). `SOCRATIC_INSTRUCTIONS` = ask ONE guiding question before telling, with explicit escape hatches so it can never stonewall (answers directly when the student asks to be told, is stuck, already attempted, repeats a question, or asks something definitional; never leaves a wrong answer standing). Learner memory + `buildProactiveNudge` (offer help once on a repeatedly-struggled concept, no nagging) injected into the system prompt. Each question also records a doubt signal → the struggle tally that later triggers the nudge. `SOCRATIC_CHAT=false` reverts to the old answer-first tutor. |
| P8.4 | Diagnostic placement | **done + wired** | `diagnosticSchema` / `diagnosticRequestSchema` / `diagnosticResultSchema`; pure `buildDiagnosticPrompt` + `buildTopicDigest` (prefers P6.5 ledger summaries) + `gradeDiagnostic` + `suggestSkippableTopics` (13 unit tests); `generateDiagnostic` drops items whose `correct_index` is out of range (a bad index would mark a right answer wrong and poison the memory). Routes `app/api/generate-diagnostic` + `app/api/diagnostic/seed` (seeds `user_concept_state`; correct/missed batches kept disjoint on the normalized key so concurrent upserts can't lose a signal). UI `components/subjects/PlacementCheckPanel.jsx` mounted in the subject overview tab. **Deliberately advisory:** nothing is auto-marked mastered — a 1–2 question sample isn't proof, and silently changing statuses would be a destructive surprise. Graded client-side because the check gates nothing; **P9 assessments must be server-graded and must not reuse this route.** |

> **P8 verification:** 134/134 unit tests green (`npm test`), lint clean (no new warnings), production build clean with both new API routes registered. Not live-run: `user_concept_state` doesn't exist until P14, so with `USER_MEMORY` unset every read returns "no memory" and every write no-ops — behavior today is identical to pre-P8 except the review-queue interleaving. Live E2E (real signals accumulating → prompts changing) is a P14 follow-up.

## P9 — Assessment & certification

> Tests are the backbone. Items generated **from concept ledgers (P6.5)** so every question is provably aligned to what was taught. Formative (frequent, in-lesson) + summative (graded, gates certification).

| # | Task | Status | Notes |
|---|------|--------|-------|
| P9.1 | Item generation from concept ledgers | **done in code; behind `ASSESSMENTS`; migration → P14** | Migration `20260723000400_assessment.sql`: `assessment_items` (concept + `concept_key` tag joining to P8.1, kinds `mcq`/`why`/`worked_example`) + `assessment_attempts`. Pure `buildConceptInventory` **binds generation to what the ledgers say was actually taught** ("the only permitted material"); route refuses topics with no generated lesson. `normalizeGeneratedItems` (lib/assessment/items.js) drops malformed items — notably an out-of-range `correct_index`, which would mark a right answer wrong and poison concept memory. Route `app/api/generate-assessment` never echoes answer keys back, since in a self-paced subject the bank's owner is also the examinee. |
| P9.2 | In-lesson retrieval practice + confidence calibration | **done + wired** | `app/api/practice/items` (serves items, answer key never sent) + `app/api/practice/grade`; `components/sub-components/RetrievalPractice.jsx` mounted in the immersive learn page under the lesson. **Confidence is captured BEFORE the reveal** and folded into the mastery observation, so a lucky guess isn't mastery (0.6) and a confident miss lands hardest (0.0) and is surfaced to the learner as "that gap comes back sooner". Open `why` items aren't machine-graded — the learner self-compares against the model answer, and it's recorded as exposure, not a score. |
| P9.3 | Retention-science pass | **done (folded into P9.1/P9.2/P8.2)** | Interleaving: `selectExamItems` round-robins ACROSS concepts, and the review queue already interleaves (P8.2 `orderReviewQueue`). Elaborative interrogation: the `why` item kind ("explain why X beats Y"), ~25% of generated items. Worked-example fading: the `worked_example` kind (solution worked most of the way, one step missing) for procedural material. Confidence calibration is P9.2. |
| P9.4 | Summative exams (subject-level, graded) | **done + wired** | `app/api/exam/start` + `app/api/exam/submit`; `components/subjects/ExamPanel.jsx` on the subject page. **Everything that decides a score is server-side:** the attempt row stores the exact items and the per-attempt option permutation (P10.1 randomization) and grading reads that back, so the client only ever says which position it picked. Unanswered = wrong (with a confirm prompt first). Adaptive difficulty comes from the bank via `targetDifficultyFor` (weak concept → easier items) — no live IRT loop, no extra model calls. Pass mark `PASS_SCORE=70`. Exams use auto-gradable kinds ONLY; open `why` items are deliberately excluded so no unreliable number sits behind a certificate. Results feed back into P8.1 as one averaged signal per concept. |
| P9.5 | Verifiable certifications | **done + wired (2026-07-25)** | Built last, once P10 existed. Pure `lib/assessment/certificate.js` (17 tests): Crockford-base32 `formatSerial` (no I/L/O/U so a serial survives being read off paper), `normalizeSerial` folding the lookalikes a human mistypes, `certificateEligibility`, and a frozen `buildCertificateSnapshot` so a later subject rename cannot rewrite an issued certificate. **The load-bearing rule: a self-paced attempt needs `viva_passed`, not just `passed`** — an unproctored MCQ score alone must never mint a certificate — and an unknown `mode` falls to the stricter self-paced regime, mirroring `resolveAttemptMode`. A teacher's `invalidated` review overrides a classroom pass. Migration `20260725000800_certificates.sql`: service-role writes only (same trust boundary as `assessment_attempts`), one certificate per attempt via a unique constraint on `attempt_id`. **Public verification is a SECURITY DEFINER *function*, not a view granted to anon** — a view would let anyone `select *` and walk out with every learner's name and subject; a function keyed on a high-entropy serial cannot be enumerated. Routes `app/api/certificates` (GET own / POST issue); UI `components/subjects/CertificatePanel.jsx` gated behind the viva in `ExamPanel`; public pages `/verify` + `/verify/[serial]` (added to the middleware public-path list — the person checking a certificate is an employer, not a learner). |

### P9 notes (2026-07-25)

**Answer-key shielding is a column privilege, not just RLS.** RLS is row-level, and in a self-paced subject the learner *owns* the subject — so row policies alone would let them read `correct_index` out of the bank before an exam. The migration does `revoke select (correct_index, answer_key) … from anon, authenticated`; grading reads those columns through the service role. Consequence to remember: **`select *` on `assessment_items` as an end user ERRORS** — reads must enumerate `ITEM_PUBLIC_COLUMNS`. That is a loud failure by design; the quiet alternative leaks answers. Both grading routes use the two-client pattern: authorize with the user's RLS client, then read the answer with the admin client (admin-only would bypass access control; RLS-only can't see the answer).

**Trust boundary between P8 and P9:** `user_concept_state` (P8.1) is owner-writable because it gates nothing; `assessment_attempts` is **read-only to end users** (service-role writes, like `generation_jobs`) because a pass will gate certification. The exam path never reads P8 state to decide a score — only to pick difficulty.

**Bug caught by the tests, worth remembering:** `aiAssessmentItemsSchema.options` originally had `.min(2)`. Since the prompt asks for a *mix* including open `why` items (no options), a single `why` item would have failed schema validation for the **whole batch** and broken item generation entirely. Per-kind rules now live in `normalizeGeneratedItems`, which drops only the offending item.

**P9 verification:** 173/173 unit tests green (39 new), lint clean, production build clean with all five new API routes registered. Not live-run: the tables land in P14, and `ASSESSMENTS` is off, so `generate-assessment` previews items without storing and practice/exam report "not available yet".

## P10 — Assessment integrity (mode-differentiated)

> **Owner constraint (2026-07-23):** classroom exams have a teacher-in-the-loop and CAN be human-reviewed; **self-paced subjects cannot afford human review** → their integrity must be fully automated and defensible without a reviewer. No browser check is bulletproof — layered deterrence + integrity-by-design, not surveillance theater. Webcam proctoring and AI-answer "detection" are out of scope (privacy cost + unreliability).

| # | Task | Status | Notes |
|---|------|--------|-------|
| P10.1 | Question-bank randomization (both modes) | **done in code** | Options were already shuffled per attempt in P9.4 (permutation stored server-side). P10 adds `poolBreadth` (default 3) to `selectExamItems`: each concept's item is drawn from a small near-target-difficulty window instead of always the single closest, so two learners in the same state get different papers while difficulty stays honest. Tested to never drift more than one difficulty step off target. |
| P10.2 | Server-side timing & answer-pattern anomaly detection | **done in code** | Pure `lib/assessment/integrity.js`: impossibly-fast answers, machine-like uniform pacing (needs ≥6 answers), "same option position throughout" (≥6 answers, ≥85%), and **cross-user sequence similarity** — since options are shuffled per attempt, two honest learners almost never produce the same presented-position sequence. The submit route compares against the 50 most recent graded attempts on the subject. |
| P10.3 | Exam UX hardening | **done + wired** | `components/subjects/ExamRunner.jsx`: one question at a time, no back-navigation, 90s per question (times out and advances), fullscreen request, `beforeunload` warning, and blur/`visibilitychange`/fullscreen-exit recorded as advisory events sent with the submission. `ExamPanel` is now a three-phase shell (idle → runner → result/viva). |
| P10.4 | **Classroom mode** — human-review workflow | **done + wired** | `GET/POST /api/teacher/classrooms/[classroomId]/integrity` + `components/teacher/IntegrityReviewPanel.jsx` in the teacher analytics page. Attempts are ranked by how much they merit a look (clean ones still listed, sorted last) with **plain-language, non-accusatory descriptions** — a unit test asserts no label contains "cheat/fraud/dishonest/guilty". Decisions (`cleared`/`flagged`/`invalidated`) are recorded in `attempt_reviews` **through the teacher's own client**, so the RLS policy re-checks they teach that course; the admin client would have skipped that. |
| P10.5 | **Self-paced mode** — fully automated integrity (no reviewer) | **done + wired** | `/api/viva/start` + `/api/viva/submit` + `components/subjects/VivaPanel.jsx`. After passing a self-paced exam the learner explains 2–3 answers in their own words; the agent scores understanding and the pure `gradeViva` rule decides. Questions are built from concepts they got **right** (the viva confirms a correct answer reflects understanding — re-testing a miss would punish it twice) and weighted toward the ones they were least confident about. Pass needs BOTH a mean ≥0.6 AND no single answer <0.3, so one strong answer can't carry a blank one. One attempt only (`viva_passed` guard) — a retryable viva is no gate. Scoring failure returns 503 and records nothing rather than guessing a pass or an unfair fail. |

### P10 notes (2026-07-25)

**Mode is derived server-side, never sent by the client** (`lib/assessment/mode.js`): a subject taught by any classroom course is `classroom`, otherwise `self_paced` — and a lookup failure defaults to `self_paced`, the *stricter* regime, so an error can never hand out an easier pass.

**Everything in P10.2/P10.3 is advisory and nothing auto-penalizes.** Each signal has an innocent explanation (a fast reader, a phone call, a shared study guide), and the browser checks are defeated by a second device and can be suppressed outright. They exist to raise the effort for casual copying and to give a teacher context. The signals that actually carry weight are the per-attempt randomization (P10.1) and, for self-paced learners, the viva (P10.5). The learner also sees their own flags on the result screen — being marked silently would be indefensible.

**Prompt-injection inside a viva answer is treated as evidence of gaming**, not as instructions: the scoring prompt says so explicitly and scores it 0.

**P10 verification:** 208/208 unit tests green (35 new), lint clean, production build clean with all five new routes registered. Not live-run — the tables land in P14.

## P11 — Engagement & reminders

> Independent and high-ROI — **can be built early in parallel with P5–P6.** Spaced repetition is inert until something pulls the learner back on the review date.

| # | Task | Status | Notes |
|---|------|--------|-------|
| P11.1 | Review reminders (push + email) | **done in code; behind `REVIEW_REMINDERS`; migration → P14; live send pending** | Migration `20260723000600_reminders.sql` (`notification_preferences` owner-writable, `push_subscriptions` owner-read/delete + service-role write) — written, **NOT applied**. Pure `lib/reminders/schedule.js` (`collectDueByUser`, `shouldSendReminder`, `buildReminderDigest`) + `lib/time/zone.js` (DST-safe local-day arithmetic). Sender = Inngest **hourly cron** `lib/inngest/functions/send-review-reminders.js`, registered in the existing serve route; two bulk reads for the whole cohort, not per user. Channels: **Web Push over VAPID** (`web-push@3.6.7`, self-hosted — no push vendor, fits the budget cap) + **optional email** over a provider's HTTP API (no SDK, no-op unless `RESEND_API_KEY`+`REMINDER_EMAIL_FROM` are set). SW handlers in `worker/index.js` (compiled by next-pwa into `sw.js`, verified in the build). Routes: `notifications/preferences`, `notifications/subscribe`, `notifications/test-push`. UI `components/settings/ReminderSettings.jsx` on the settings page. |
| P11.2 | Streaks, goals, progress visibility | **done + wired** | Pure `lib/gamification/goals.js` — weekly review goal with a **pace** verdict (compares against the week elapsed, so 6/14 on Tuesday reads "ahead", not "behind"), zone-aware streak, 14-day activity strip, and subject-completion buckets whose `nextUp` surfaces what is *closest to finished*. All derived from `study_logs` + topic status (no counter to cheat); the only stored value is the goal target itself. `getEngagementData` returns raw timestamps so day/week boundaries are drawn in the learner's own timezone client-side. `WeeklyGoalPanel.jsx` sits beside `GamificationPanel` on the dashboard. |

### P11 notes (2026-07-25)

**The hard part was time, not delivery.** One hourly UTC cron serves every timezone: each learner's local hour and calendar date are resolved from their own `timezone` (`lib/time/zone.js`), so a reminder can never land at 3am. Three rules fell out of that: at most one send per **local** calendar day; a short 3-hour window past the chosen hour so a missed cron run retries but a delayed one does not ping at midnight; and all day arithmetic done on the calendar date rather than by adding 24h to an instant, because the latter skips or repeats a day across DST — which a learner experiences as a streak breaking for no reason.

**Nothing is ever sent when nothing is due.** An empty "you have no reviews" notification is the fastest way to train someone to ignore the channel.

**`last_reminder_on` is not client-writable.** It lives in an owner-writable table, so the once-a-day guard is enforced by the API's column whitelist (`EDITABLE_PREFERENCE_COLUMNS`), not by RLS — a client that could reset it could make the sender ping repeatedly. Same shape of reasoning as the P9 answer-key revoke: row-level policies are the wrong tool for a per-column trust boundary.

**Only a delivery that actually reached a channel is recorded as sent.** Marking the day done after a total failure would suppress the next hourly retry for no reason, and a push endpoint the service reports `404/410` for is pruned rather than retried forever.

**The copy is tested, not just trusted** (the P10.4 precedent): a unit test asserts the reminder never says "don't lose", "losing", "break your", "behind", "last chance" and similar. Reminders exist to make returning easy; streak-loss threats are a different product.

**Web Push, not a push vendor.** VAPID talks straight to the browser's own push service — free, no account, no per-message cost. The consequence to know: the **Capacitor Android WebView does not implement the Web Push API**, so the Android build gets nothing from this until an FCM adapter is added (`lib/reminders/deliver.js` is written so it drops in beside the other two). That needs a Firebase project, so it is a P14 owner action, not something to guess at. Web push works on desktop browsers and installed-PWA Android Chrome today.

**Dev caveat:** next-pwa is configured `disable: NODE_ENV === 'development'`, so there is **no service worker under `npm run dev`** — push can only be exercised against `npm run build && npm start` or a deployment.

**A route named `test` breaks `npm test`.** `node --test` treats any file under a directory called `test` as a test file, so `app/api/notifications/test/route.js` was reported as a failing suite. Renamed to `test-push`.

## P12 — Teacher analytics (UI-first, insightful)

> **Owner: the UI is the biggest flaw here** — analytics must be insightful, easy to access, and easy to understand, not a data dump. Richest once P9 concept-tagged data exists; UI scaffolding can start on existing progress data.

| # | Task | Status | Notes |
|---|------|--------|-------|
| P12.1 | Class-wide concept heatmap | **done + wired** | `buildClassHeatmap` in pure `lib/teacher/insights.js` → `components/teacher/ConceptHeatmap.jsx`. **Rows are concepts when P6.5 ledgers exist, topics otherwise**, and the payload says which — so it is useful on today's data and gets better after `CONTENT_LEDGER`, instead of rendering empty until P14. Rows arrive worst-first; clicking a square opens that student. Legend + per-cell `title`/`aria-label` + a table view, so color is never the only carrier. Derived from rows the analytics query already fetched — **no extra DB round trips**. |
| P12.2 | At-risk-student flags | **done + wired** | The attention scorer moved out of `queries.js` into pure, unit-tested `describeStudentConcern` (it previously had no tests), reworded to be observational, and promoted to the **top** of the page as "Needs a look this week" — one sentence + one action per student, with on-track students collapsed but present. `buildClassHeadline` writes the 2–3 sentence plain-language read that opens the page. |
| P12.3 | Per-student progress view | **done + wired** | `components/teacher/StudentDetailDialog.jsx`: why-flagged reasons first, then four KPIs, then **"where this student is stuck"** read out of the class heatmap (so the drill-down can never disagree with the grid), a one-bar course-coverage breakdown, a six-week study-time chart from a new per-student `weeklyTrend`, per-course progress, and the raw session log behind a `<details>`. |
| P12.4 | Analytics UX overhaul | **done** | Page rewritten and ordered by what a teacher does with it: plain-language read → who needs a look → what to reteach → is effort holding up → secondary detail. **Three KPIs, not six.** Two single-measure charts in `ClassTrend.jsx`. Follows the `dataviz` skill; heatmap ramp validated with its validator (see notes). Access was already prominent from the classroom page (a primary "Open Analytics" button plus two other links), so nothing was added there. |

### P12 notes (2026-07-25)

**The heatmap encodes concern, not mastery.** This is the one design decision everything else follows from. On a mastery ramp the cells a teacher needs to find would be the *palest* and would recede into the surface — exactly backwards. Encoding concern instead puts trouble at the dark end, where it reads at a glance, and `palette.md`'s sequential rule explicitly allows the "near zero" end to recede.

**Colors were computed, not chosen.** The ramp (`--heat-1..4` in `globals.css`) was run through the skill's `validate_palette.js` against **this app's own card surfaces** (`#ffffff` / `#0b0b0e`, not the skill's defaults): lightness monotone, adjacent ΔL ≥ 0.06, single hue (10–11° spread) in both modes. The reported light-end contrast FAIL is the *ordinal* rule, which does not apply to a sequential heatmap. The app's `--primary` was validated too and passes every categorical check in both modes, so both charts use it. Orange for the ramp because blue would collide with `--primary` and orange is already this app's "needs attention" hue.

**Two charts, never two y-axes.** Minutes and a 0–5 recall rating share no scale; a dual axis would put a meaningless crossing point on screen that teachers would read meaning into. `connectNulls` is off on the recall line for the same reason — a week where nobody rated a review is a gap, not a zero, and bridging it would invent a measurement.

**"Not started" is deliberately outside the ramp.** A topic nobody has reached yet is normal pacing. Painting it as concern would make the grid cry wolf, and a grid that cries wolf gets ignored. Same reasoning for excluding no-evidence cells from a row's score: eight students who have not reached a topic must not dilute the two who are stuck on it.

**A concept spanning several topics takes the student's WORST topic, not their average** — a concept is not understood because one of the lessons teaching it went well.

**Teacher-facing copy is observational, enforced by a test** — the P10.4 precedent extended to P12. `describeStudentConcern` may say "no sessions logged in 9 days"; it may not say "disengaged". A study log can support the first and not the second, and a teacher acting on a dashboard verdict about a student is a real harm. The test asserts the copy never contains "lazy", "unmotivated", "not trying", "behind the class" and similar.

**P12 verification:** 297/297 unit tests green (32 new), lint clean (no new warnings; the analytics page's own `exhaustive-deps` warning is gone), production build clean. **Not live-verified** — the page is behind teacher auth and the in-app browser could not load a local preview, so the layout has not been eyeballed in situ. The color decisions are validator-backed rather than eyeballed; the *layout* (label collisions at mobile width, grid overflow with a large roster) still wants a real look.

## P13 — Ops & docs

> Absorbs old 4.1–4.3.

| # | Task | Status | Notes |
|---|------|--------|-------|
| P13.1 | CI (lint + tests) on PRs | **done** | `.github/workflows/ci.yml` **rewritten — it was broken, not missing.** It ran `yarn` (no `yarn.lock` since the npm switch, so `cache: yarn` fails), **never ran the 297 tests despite the job being named `test`**, set `SUPABASE_URL`/`SUPABASE_ANON_KEY` (wrong names — the app reads `NEXT_PUBLIC_*`), and gated on `yarn audit --level moderate`, which fails permanently against the standing transitive advisories. Now: `npm ci` → lint → **test** → **offline evals** → build, with placeholder public env (verified locally: the build succeeds with only those two vars), plus `concurrency` cancel-in-progress and a separate **report-only** audit job. |
| P13.2 | Error observability | **done + wired** | No SDK: `lib/observability/report.js` posts a **Sentry envelope over plain `fetch`** when `SENTRY_DSN` is set, and/or to `ERROR_WEBHOOK_URL` — vendor-neutral, and a no-op that still logs locally when neither is set. `fingerprint()` strips ids and numbers so one recurring bug is one issue. Boundaries: `app/global-error.jsx` (root-layout failures, which were a blank white page and nothing in the logs) and `app/(app)/error.jsx` (keeps the shell, shows the Next `digest` as a quotable reference). Client errors reach the same path via `app/api/observability/report`. Wired into content generation, the generation worker, and the reminder cron. |
| P13.3 | README/docs refresh | **done** | `Readme.md` rewritten and `CONTRIBUTING.md` replaced. It was worse than stale: the markdown was a mangled Google-Doc export — every table-of-contents link was a `google.com/search` URL, underscores were backslash-escaped (`NEXT\_PUBLIC\_…`), and no code block was fenced. Content fixed too: Next 15 → **14**, "OpenRouter API" → **AI SDK v7 multi-provider with per-user BYOK**, yarn → **npm**, `.env.local` → **`.env`** (with the UTF‑16 trap called out), and the invented `lib/graph/` + `lib/sm2/` directories replaced with the real tree including route groups. Added: the feature-flag table, `npm test` / `npm run eval`, Inngest, `supabase/migrations` and why some are unapplied, and the observability env vars. |

### P13 notes (2026-07-25)

**The CI that existed was worse than no CI.** A workflow named `test` that never runs tests, plus an `audit` job that is permanently red, trains a team to ignore the check marks. Two deliberate calls in the rewrite: the audit job is **report-only** (`|| true`) because the outstanding high-severity advisories are in transitive dependencies with no non-breaking fix, and gating on them would make every PR red for reasons no PR author can act on; and the build gets **placeholder** Supabase env vars rather than repository secrets, because `next build` only needs the browser client's constructor to not throw — CI should not hold production credentials to prove the app compiles.

**Redaction is the reason the observability layer exists.** Learnify stores users' own provider API keys (Phase 0.3), and provider errors routinely echo a request URL or an auth header. Shipping raw error text to a third-party sink would leak a key the learner pays for. So `lib/observability/redact.js` is the load-bearing part, it runs over message + stack + context before anything leaves the process, and it is deliberately over-eager — a false positive costs a few characters of debuggability, a false negative costs credentials. Emails are stripped too: a user id is enough to correlate.

**A bug the redaction tests caught immediately, worth remembering:** with the generic `label: value` rule ordered first, `Authorization: Bearer abc123…` matched the label plus the *word* "Bearer" — the rule stops at whitespace — so it redacted "Bearer" and **left the credential in the report**. Whole-value rules (`authorization`, bare `Bearer`) now run before the generic one, and a regression test pins it. This is exactly the false negative that makes hand-rolled redaction dangerous.

**No Sentry SDK, and the trade is explicit.** `@sentry/nextjs` is ~1MB plus instrumentation hooks; an envelope is one POST. What is given up: source maps, breadcrumbs, and performance tracing. If those become necessary, the official SDK drops in behind the same `reportError()` call sites with no other changes.

**P13 verification:** 324/324 unit tests green (27 new), lint clean (no new warnings), production build clean with the new route registered, `npm run eval` green, and the CI build path verified locally by temporarily replacing `.env` with only the two placeholder vars. **Not verified:** the workflow has not run on GitHub (no PR was pushed), and no error has been delivered to a real Sentry project or webhook — both need the owner.

## P14 — Production runbook (FINAL, do last)

> **This is the owner's complete go-live checklist.** Per the standing constraint no migration has touched prod, and every feature built in P5–P13 sits behind a flag that is OFF. Nothing below has been run against production — it is written to be executed in order, top to bottom, by the owner (2026-07-25).
>
> Target project: **`bljhrkulhkokfdpwwvlc`** (ap-southeast-1).
>
> **Golden rule for this phase:** apply migrations first, flip flags second, verify third — one feature at a time. If a flag is flipped before its table exists, the feature does not crash (every path fails soft), it just silently does nothing, which is harder to debug than a clean failure.

### P14.0 — Owner-only actions (cannot be done from code)

| # | Action | Where | Why it matters |
|---|--------|-------|----------------|
| P14.0a | **Rotate the leaked `GEMINI_API_KEY`** | Google AI Studio | It is in git history (commit `b2ffc07`, `.env.local.backup`) and Google already reports it as leaked. Update `.env` **and** Vercel env after rotating. Carried from Phase 0.1 / E.4. |
| P14.0b | **Enable leaked-password protection** | Supabase Dashboard → Auth → Passwords | HaveIBeenPwned check; not exposed via API. Carried from Phase 0.8. |
| P14.0c | Decide whether to scrub git history | local + remote | Optional, and only meaningful *after* P14.0a. Rewriting history breaks existing clones. |
| P14.0d | Re-save or delete `.env.local` | local | It is UTF-16, so Next/dotenv ignores it entirely (E.1). Leaving it invites hours lost to "why is my env var not working". |
| P14.0e | **Generate the VAPID key pair** | local shell | `npx web-push generate-vapid-keys` → put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`, in `.env` **and** Vercel. Generate ONCE: rotating the pair invalidates every registered device, and each learner has to re-enable notifications. |
| P14.0f | (Optional) Android native push via FCM | Firebase console | Web Push does not work in the Capacitor Android WebView, so the Android build gets no reminders until an FCM adapter is added to `lib/reminders/deliver.js`. Needs a Firebase project + `google-services.json` + `@capacitor/push-notifications`. Web and installed-PWA users are unaffected. |

### P14.1 — Apply migrations, in this exact order

Each depends on the ones above it. All are in `supabase/migrations/`.

| Order | File | Phase | Creates / changes | Depends on |
|-------|------|-------|-------------------|------------|
| 1 | `20260723000000_generation_jobs.sql` | P5.1 | `generation_jobs` (+ owner-only RLS, Realtime) | — |
| 2 | `20260723000100_topic_concept_ledger.sql` | P6.5 | `topics.concept_ledger jsonb` | — |
| 3 | `20260723000200_p7_project_and_artifact.sql` | P7.3/P7.4 | `subjects.project_track`, `topics.artifact` | — |
| 4 | `20260723000300_user_concept_state.sql` | P8.1 | `user_concept_state` (owner-writable, all four verbs) | — |
| 5 | `20260723000400_assessment.sql` | P9.1 | `assessment_items`, `assessment_attempts`, **column-level `revoke` on `correct_index`/`answer_key`** | — |
| 6 | `20260723000500_assessment_integrity.sql` | P10 | `assessment_attempts.{mode,integrity_events,viva,viva_passed}`, `attempt_reviews` | **#5** |
| 7 | `20260723000600_reminders.sql` | P11 | `notification_preferences` (also holds the P11.2 weekly goal), `push_subscriptions` | — |

**Check immediately after applying #5** — this one is easy to lose:

```sql
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_name = 'assessment_items' and column_name in ('correct_index','answer_key');
```

`anon` and `authenticated` must NOT appear. If they do, the answer keys are readable by any learner and every exam score is meaningless — re-run the `revoke`.

### P14.2 — Environment variables

Set in **`.env` locally and in Vercel** (not `.env.local`).

| Variable | Required for | Notes |
|----------|--------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | **P9 practice grading, P9.4 exams, P10.5 viva**, classroom generation, P5 worker | Already used by classroom content generation. Without it those routes return a clear 500 — they never silently fall back to client-side grading. **Server-side only; never expose to the client.** |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | P5 async generation in prod | Local dev needs neither (`npx inngest-cli dev` discovers `app/api/inngest`). |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_COMPAT_*` | AI generation | At least one provider. `AI_PROVIDER_ORDER` currently `openai-compatible,google,anthropic`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | **P11.1 push reminders** | Generate once with `npx web-push generate-vapid-keys` (see P14.0e). The public key is intentionally public (the browser needs it); the private key is server-only. Without both, the sender refuses to run and says why. |
| `VAPID_SUBJECT` | P11.1 (optional) | A `mailto:` the push service can use to contact you. Defaults to `mailto:support@learnify.app` — set it to a real address you read. |
| `NEXT_PUBLIC_APP_URL` | P11.1 (optional) | Makes reminder links absolute (`https://…/dashboard`). Without it the notification still opens `/dashboard` relative to the app origin, which is correct for push but not for email. **Set it if email digests are on.** |
| `RESEND_API_KEY`, `REMINDER_EMAIL_FROM` | P11.1 email digests (optional) | Both or neither. Absent = the email switch is shown disabled with the reason, and only push is used. Any provider with a compatible HTTP API can be swapped in `lib/reminders/deliver.js`. |
| `SENTRY_DSN` and/or `ERROR_WEBHOOK_URL` | P13.2 error observability (optional) | Either, both, or neither. With neither, errors are still logged locally (Vercel's log drain) but nothing is shipped. The DSN path posts a Sentry envelope over plain `fetch` — **no SDK, so no source maps**; add `@sentry/nextjs` later if those are wanted. Everything is redacted before it leaves the process. |

### P14.3 — Flip the flags, in this order

Turn on **one group at a time** and verify before moving on. Each row assumes the migrations above are applied.

| Step | Flag(s) | Turns on | Verify by |
|------|---------|----------|-----------|
| 1 | `CONTENT_LEDGER=true` | Concept-ledger extraction + continuity context | Generate a topic; confirm `topics.concept_ledger` is populated and the next topic's lesson references prior topics instead of re-teaching them. **Do this first — P8 and P9 both get much better with ledgers, and P9 items are built from them.** |
| 2 | `CONTENT_SECTIONED=true` | Two-pass outline → section generation | Generate a long topic; confirm no mid-sentence truncation. Auto-falls back to single-pass if the outline step fails. |
| 3 | `CONTENT_GROUNDING=true` + `CONTENT_VERIFY=true` | Web grounding, citations, fact-check | Confirm a "References & Further Learning" section appears. **Watch for the known DDG rate-limit** (grounding silently returns nothing under repeated calls) — see the P6 follow-ups. |
| 4 | `NEXT_PUBLIC_ASYNC_GENERATION=true` | Async generation + live progress | Generate a topic; the progress bar should show real stages via Realtime rather than an indeterminate spinner. Needs the Inngest keys from P14.2. |
| 5 | `USER_MEMORY=true` | Per-concept learner memory (P8) | Do a review, then check `user_concept_state` has a row; take the placement check and confirm rows appear. Then regenerate a topic and confirm the prompt adapts (weak concepts get more scaffolding). |
| 6 | `CONTENT_PROJECT=true`, `CONTENT_ARTIFACT=true` | Persisting project tracks / artifacts | Generate each once from the subject page / learn page. |
| 7 | `ASSESSMENTS=true` | Item bank, practice, exams, viva (P9/P10) | See P14.4 — this one has the most to check. |
| 8 | `REVIEW_REMINDERS=true` | Due-review reminders (P11.1) | Needs the VAPID keys from P14.2 **and** the Inngest keys (the sender is a cron function on the same serve endpoint). In Settings → Review reminders, turn on notifications for the device and hit **Send a test notification** — that exercises the whole chain (permission → service worker → VAPID → endpoint) in one click. Then set your hour to the next one and confirm a real reminder arrives with reviews due. The dashboard's weekly-goal panel (P11.2) needs no flag — it is live already, reading the goal target from `notification_preferences` once migration #7 is applied. |

`SOCRATIC_CHAT` needs no action (default ON). Set it to `false` only if the Socratic tutor turns out to annoy real learners.

### P14.4 — Post-apply verification

**Database**

- [ ] Supabase advisors: no new ERROR-level findings. WARNs on the pre-existing SECURITY DEFINER helpers and the sanitized share views are **expected and accepted** (Phase 0.5, 2026-07-22 decision).
- [ ] `generation_jobs` is in the `supabase_realtime` publication (P5.2 depends on it).
- [ ] The `assessment_items` column revoke holds (query in P14.1).
- [ ] RLS spot-check as a **second, non-owner account**: it must see zero rows of another user's `user_concept_state` and `assessment_attempts`.

**Features, end to end**

- [ ] **P5** — generate a topic with async on; progress advances, content saves, job row reaches `succeeded`.
- [ ] **P6** — a generated lesson cites real sources and does not re-teach its prerequisites.
- [ ] **P7** — TTS speaks the lesson (**needs a real browser + audio — never verified in this project**), an artifact renders in its sandboxed iframe, a project track generates, the dashboard shows XP/badges.
- [ ] **P8** — placement check seeds memory; review outcomes move mastery; the due-review widget puts weak topics first.
- [ ] **P9** — generate items for a topic (confirm they only cover taught concepts), answer practice with each confidence level, sit an exam, confirm the score is recorded server-side.
- [ ] **P10** — during an exam, switch tabs once: the result screen should mention it and `assessment_attempts.integrity_events` should hold the event. Pass a **self-paced** exam and confirm the viva appears and gates. Sit a **classroom** exam as a student and confirm it appears in the teacher's analytics page with any flags described in plain language.
- [ ] **P11** — **needs a production build, not `npm run dev`** (next-pwa disables the service worker in development). Enable device notifications in Settings, send the test notification, and confirm it arrives and that clicking it focuses the existing tab on `/dashboard` rather than opening a second one. Then set the reminder hour to the next hour with at least one review due and confirm exactly ONE reminder arrives and `notification_preferences.last_reminder_on` is set to your local date. Re-run the following hour to confirm no duplicate. Check the Inngest dashboard shows `send-review-reminders` firing hourly. Dashboard: the weekly-goal panel shows the streak and a pace verdict.

**Rollback:** every flag is independently reversible — setting it back to `false` restores the previous behavior immediately, with no data loss (the columns and tables simply stop being read). The migrations are additive (new tables/columns only, nothing dropped or altered), so a bad flip never needs a migration rollback.

### P14.5 — Things this phase does NOT cover

- **P9.5 verifiable certificates** are still unbuilt, by design — they wait for P10 to be live and validated. When built, a self-paced certificate must require `viva_passed`, not just `passed`.
- **P13 needs no migration**, but two of its pieces need the owner to finish: pushing a PR so the rewritten workflow actually runs on GitHub, and setting `SENTRY_DSN` or `ERROR_WEBHOOK_URL` so errors go somewhere. Neither blocks P14.
- **P12 gets better after flag step 1** — the concept heatmap falls back to topic rows until `CONTENT_LEDGER=true` populates `topics.concept_ledger`. Nothing breaks; the rows just say "topics" instead of "concepts". Worth re-checking the teacher page after that flip.
- **P11 Android native push** — Web Push covers browsers and installed PWAs but not the Capacitor WebView; the FCM adapter is P14.0f (owner) plus a small addition to `lib/reminders/deliver.js`.
- The **P6 follow-ups** remain open: grounding resilience (DDG rate-limiting), SSRF hardening of `webExtract` (block private/link-local IPs before fetching), and the "report this looks wrong" feedback affordance (P6.6) — that last one would add a table and so belongs in a future migration batch.

| # | Task | Status | Notes |
|---|------|--------|-------|
| P14.1 | Apply the migrations in order | **DONE 2026-07-25** | **Nine** applied to prod (the seven queued + `content_feedback` + `certificates`), plus a repair migration. Verified: all 9 tables present with RLS on, `generation_jobs` in the Realtime publication, new columns present, no new ERROR advisors. See P14 notes for the bug this caught. |
| P14.2 | Set env vars in `.env` + Vercel | **todo — owner** | Spoon-fed in [GO_LIVE_RUNBOOK.md](GO_LIVE_RUNBOOK.md) step 3–4. `SUPABASE_SERVICE_ROLE_KEY` is **absent from `.env`** and gates the most features. |
| P14.3 | Flip flags in order, verifying each | **todo — owner** | Runbook step 6. Eight groups; `CONTENT_LEDGER` first, `REVIEW_REMINDERS` last. |
| P14.4 | Post-apply verification | **DB half done**; feature half owner | DB checks passed (runbook step 5). Per-feature E2E needs a deployed app + login. |
| P14.0 | Owner dashboard actions | **blocked — owner only** | Rotate the leaked Gemini key; enable leaked-password protection; generate VAPID keys; delete `.env.local`. Runbook step 2. |

### P14 notes (2026-07-25)

**The migration-verification query earned its place in the runbook on its first real run.**
P9's answer-key shield was written as `revoke select (correct_index, answer_key) on
public.assessment_items from anon, authenticated`. Applied to production, it reported
success and changed nothing: Supabase's default privileges grant **table-level** SELECT on
new public tables, and in Postgres a table-level grant is not a bundle of column grants
that a column-level `revoke` can subtract from — it keeps covering every column. Both
answer columns stayed readable by every logged-in user, which would have made every exam
score and every certificate meaningless while looking completely fine.

The correct shape is **revoke the table grant, then grant back the allowlist**:
`revoke select on … from anon, authenticated` followed by
`grant select (id, subject_id, topic_id, concept, concept_key, kind, difficulty, stem,
options, created_at, updated_at) … to anon, authenticated`. `explanation` is excluded too —
it gives the answer away as effectively as `correct_index`, and the grading routes serve it
through the service role after the learner answers. Fixed in prod, corrected in
`20260723000400_assessment.sql`, and repaired for any other environment by
`20260725000900_fix_assessment_answer_key_shielding.sql`. Verified functionally by switching
to the `authenticated` role and being refused on both columns while the public columns still
read.

**Generalizable lesson:** a `revoke` that succeeds is not evidence that a privilege is gone.
Column-level privilege changes must be verified by querying `information_schema.column_privileges`
or by actually assuming the role — which is precisely what the runbook check does.

**A live-config problem surfaced while writing the runbook:** `.env` sets
`AI_PROVIDER_ORDER=openai-compatible,google,anthropic` but contains no `OPENAI_COMPAT_BASE_URL`,
so the first provider in the chain is unconfigured and every generation falls through to
Google — on the leaked key with an exhausted quota. That is the likely explanation for
unreliable generation in production. Also dead in `.env` and safe to delete: `DB_NAME`,
`CORS_ORIGINS`, `OPENROUTER_API_KEY`, `GEMINI_API_KEYS`, `NEXT_PUBLIC_BASE_URL` (traced
against every `process.env.*` read in the codebase).

## AI provider configuration (Phase 3.1)

All optional except one Google key. Order of use: `AI_PROVIDER_ORDER` (default `google,openai-compatible,anthropic`); within Google, a user's BYOK key always outranks the system key.

```
GEMINI_API_KEY=...                       # system Google key (rotate the leaked one!)
GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash
OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1   # Ollama/LM Studio/OpenRouter/vLLM/...
OPENAI_COMPAT_API_KEY=...                # optional for local servers
OPENAI_COMPAT_MODELS=llama3.3,qwen2.5
ANTHROPIC_API_KEY=...
ANTHROPIC_MODELS=claude-sonnet-5
AI_PROVIDER_ORDER=google,openai-compatible,anthropic
```

## Feature flags (all default OFF unless noted)

| Flag | Phase | What it turns on |
|------|-------|------------------|
| `NEXT_PUBLIC_ASYNC_GENERATION` | P5.2 | Async generation + Realtime progress (needs `generation_jobs`) |
| `CONTENT_SECTIONED` | P6.4 | Two-pass outline → per-section generation |
| `CONTENT_GROUNDING` | P6.2 | Web retrieval + citations |
| `CONTENT_LEDGER` | P6.5 | Concept-ledger extraction + reads (needs `topics.concept_ledger`) |
| `CONTENT_VERIFY` | P6.6 | Source-grounded fact-check pass |
| `CONTENT_PROJECT` / `CONTENT_ARTIFACT` | P7.3/P7.4 | Persisting project tracks / interactive artifacts |
| `USER_MEMORY` | P8 | Per-concept learner memory reads + writes (needs `user_concept_state`) |
| `SOCRATIC_CHAT` | P8.3 | **Default ON**; set to `false` for the old answer-first tutor |
| `ASSESSMENTS` | P9/P10 | Persisting generated items (needs `assessment_items` + `assessment_attempts`; exams, practice grading and the viva also need `SUPABASE_SERVICE_ROLE_KEY`) |
| `REVIEW_REMINDERS` | P11.1 | The hourly reminder sender (needs `notification_preferences` + `push_subscriptions`, `SUPABASE_SERVICE_ROLE_KEY`, and VAPID keys and/or an email sender). Off = the cron runs and returns a summary saying it is disabled; nothing is ever sent. The settings panel and the P11.2 dashboard panel work regardless. |

> Flags go in **`.env`, not `.env.local`** — `.env.local` is UTF-16 and Next/dotenv silently ignores it (finding E.1). Anything set there is dead.

## Decision log

- **2026-07-25 (P13: redaction is the feature; the SDK is not)** — Error observability was built as `redact → log → optionally ship`, with the redactor as the load-bearing piece: the app stores users' own AI provider keys, and provider errors echo request URLs and auth headers, so an unredacted report shipped to a third party is a credential leak. It is deliberately over-eager (a false positive costs debuggability, a false negative costs someone's key), and the tests caught a real false negative on day one — a generic `label: value` rule ordered ahead of the `Authorization` rule redacted the word "Bearer" and left the token. Three further calls: **no Sentry SDK** (an envelope is one `fetch`; the cost is source maps and breadcrumbs, and the official SDK can drop in behind the same call sites); **vendor-neutral sinks** so a DSN, a webhook, or neither all work; and the **audit job is report-only**, because gating on transitive advisories with no non-breaking fix would make every PR red and teach the team to ignore CI. The pre-existing workflow was worse than absent — a job named `test` that never ran the tests, on a package manager the project had left.
- **2026-07-25 (P12: the heatmap encodes concern, not mastery)** — The owner's note was that the UI, not the data, was the flaw: every number was on screen and no question was answered. Four calls: (1) **the grid encodes concern so trouble is the DARK end** — on a mastery ramp the cells a teacher needs would be the palest and recede, which is backwards; (2) **the colors were computed, not chosen** — the ramp and `--primary` were run through the dataviz validator against *this app's own* card surfaces, and the one FAIL reported is the ordinal rule, which does not apply to a sequential heatmap; (3) **two charts, never two y-axes** — minutes and a 0–5 rating share no scale, and the recall line leaves gaps rather than bridging weeks nobody rated, because a zero there would claim a measurement that was never taken; (4) **"not reached yet" is outside the ramp entirely** — normal pacing must not read as trouble, or the grid cries wolf and gets ignored. The teacher-facing copy rule from P10.4 was extended here and is now enforced by a test: a study log can support "no sessions in 9 days", never a verdict about the student.
- **2026-07-25 (P11: a reminder is an invitation, not a debt collector)** — Four calls define the feature: (1) **time is per-learner, not per-server** — one hourly UTC cron resolves each learner's own local hour and calendar day, all day arithmetic is done on the calendar date so DST cannot skip or repeat a day, and there is a 3-hour catch-up window so a missed run retries but a late one never pings at midnight; (2) **at most one reminder a day, and never an empty one** — "nothing is due" is not worth a notification, and the once-a-day guard (`last_reminder_on`) is protected by an API column whitelist rather than RLS, because the table is owner-writable and this is a per-column trust boundary; (3) **the copy is unit-tested to contain no guilt** — no streak-loss threats, no "you're falling behind"; a reminder that shames is a reason to uninstall, and the test is the same device used for the P10.4 teacher labels; (4) **Web Push over VAPID, not a push vendor** — free and account-less, which fits the budget cap, at the cost of not working in the Capacitor Android WebView (FCM adapter deferred to a P14 owner action). P11.2 adds a **pace** verdict rather than a raw percentage, because "6 of 14 on Tuesday" is ahead, not 43% behind.
- **2026-07-25 (P10: integrity without surveillance)** — What the browser can observe is treated as weak by construction: every timing/pattern/focus signal is **advisory**, nothing auto-penalizes, and the learner sees their own flags (being marked silently would be indefensible). Teacher-facing labels are deliberately observational — a test asserts none of them say "cheat"/"fraud"/"dishonest". The two mechanisms actually relied on are **per-attempt randomization** (P10.1, cheap and effective against answer-sharing) and, where no reviewer exists, **explaining your answers out loud** (P10.5) — which is also good pedagogy, so the integrity gate and the learning are the same act. `mode` is derived server-side and fails toward the *stricter* regime.
- **2026-07-25 (P14 is a runbook, not a migration list)** — Owner will do all production work themselves in one pass, so P14 now records everything needed: migration order + dependencies, the env vars each feature needs, the flag-flip order (`CONTENT_LEDGER` first because P8/P9 both build on ledgers; `ASSESSMENTS` last), per-feature verification, rollback, and the owner-only dashboard actions carried from Phase 0.
- **2026-07-25 (P9: what a score is allowed to mean)** — Three rules fell out of building it: (1) **answer keys are shielded with a column-level `revoke`, not RLS**, because the self-paced learner owns their own subject and RLS is row-level; grading uses authorize-with-RLS-then-read-with-service-role. (2) **`assessment_attempts` is read-only to end users** (service-role writes) — the opposite of `user_concept_state`, and the difference is whether the row gates anything. (3) **Open "why" items never carry an auto-score.** Auto-grading free text is unreliable, so they are formative (self-compared against a model answer) and later viva material for P10.5; exams draw only on auto-gradable kinds, so no unreliable number ever sits behind a certificate.
- **2026-07-25 (P8: user memory is derived, private, and never a gate)** — `user_concept_state` is seeded only from signals already collected (SM-2 quality, doubt-chat questions, lesson completions, placement answers) — no new data collection. Three calls worth remembering: (1) **only performance observations move mastery** — exposure and questions are counted separately, so "seen it a lot, still shaky" is representable; (2) the table is **owner-writable** and self-reported placement results are trusted, because it only personalizes the learner's own lessons/queue/tutor — anything that must be trustworthy (P9 certificates, P10 integrity) is server-graded and must not read it; (3) placement is **advisory only** — no topic is auto-marked mastered off a 1–2 question sample.
- **2026-07-23 (package manager: yarn → npm)** — Owner switched to **npm**. `yarn.lock` deleted; `package-lock.json` is the lockfile (tracked). `resolutions` → npm `overrides` (security pins glob/tar/minimatch/serialize-javascript preserved); `packageManager: yarn` field removed. A stray mistyped `ingest` dep was removed; the intended `inngest@3.54.2` is installed. (Reverses the Phase 1.7 "yarn is the single package manager" decision.)
- **2026-07-23 (roadmap reprioritized → P5–P13)** — Remaining work reordered by dependency + leverage (see "Remaining roadmap — execution order" at top). Old 3.5/3.6 → P5; old 4.1–4.3 → P13. Completed phases 0–3 kept as historical record.
- **2026-07-23 (trust = grounding, not prohibition)** — FLIP the content approach: instead of "explain it ALL here, no external sources" (an instruction to hallucinate), go **agentic** — web search/extract tools ground content in real, current info and cite YouTube/GfG/Wikipedia as reference material per topic (P6). Reference implementation is the owner's own `D:/AGI` `namma_agent` (provider-agnostic layer + `tools/web.py` + `tools/learning_media.py`). Trust fix and continuity fix are the same rewrite (P6).
- **2026-07-23 (free-platform budget cap = standing constraint)** — Learnify is intended to be free; LLM path favors cheaper/fewer tokens. Consequences: AI **image generation stays deferred** (3.4 → wontfix) — visual richness comes from mermaid + *linked* external media, not generation; **TTS uses browser Web Speech API + Android native TTS** (P7.1, zero token cost); web-grounding results cached/reused across learners.
- **2026-07-23 (deliver on learning styles)** — Profile collects `preferred_learning_style` but only text delivery ships. P7 adds TTS, reference media, interactive artifacts/simulations, project tracks, and gamification so the stated style actually changes delivery.
- **2026-07-23 (memory is two-tier)** — **subject memory** = concept ledgers keyed to the existing `topic_dependencies` DAG (semantic, shared, P6.5); **user memory** = per-concept mastery from existing SM-2 + doubt-chat signals (episodic, per-learner, P8). Postgres + `pgvector`, NOT a separate graph DB.
- **2026-07-23 (integrity is mode-differentiated)** — Classroom exams → teacher-reviewed anomaly flags (P10.4). Self-paced subjects cannot afford human review → fully automated: integrity-by-design items + an oral viva scored by the doubt-chat agent gate self-paced certificates (P10.5). Webcam proctoring and AI-answer detection rejected (privacy cost + unreliability).
- **2026-07-23 (teacher analytics is UI-first)** — Owner: the UI is the biggest flaw. P12 prioritizes insightful, easy-to-read dashboards (concept heatmap, at-risk flags) over raw data dumps; follows the `dataviz` skill.
- **2026-07-22 (Phase 3)** — AI SDK v7 installed; `typescript` pinned to 5.9.x (yarn resolved `^7` = the Go-based compiler, which silently breaks Next 14's tsconfig path aliases — took the build down until pinned).
- **2026-07-22 (Phase 3)** — Content visuals are mermaid-only (owner decision): Wikimedia search, image URL validation, and `<<IMAGE>>` placeholders removed from the content pipeline; diagrams validated server-side with AI self-repair before save.

- **2026-07-22 (later)** — Public sharing privacy: raw `topics` reads for public subjects replaced by sanitized security-definer views (`shared_topics`, `shared_subject_stats`). The Supabase linter will WARN on security-definer views; accepted — the fixed `WHERE is_public` clause is the gate, and this is the standard column-limiting pattern.
- **2026-07-22 (later)** — Unlock engine: logic kept in tested JS (single source of truth) + one bulk RPC for writes, instead of duplicating the algorithm in SQL.
- **2026-07-22 (later)** — Tests: Node's built-in `node --test` runner instead of Jest — zero dependencies, works with the existing ESM `lib/` files on Node ≥22.
- **2026-07-22 (later)** — DB cleanup request: audited all schemas — `public` contains only Learnify's 17 tables. `auth`/`storage`/`realtime`/`vault`/`extensions` are Supabase platform infrastructure (not removable); `realtime.messages_*` are auto-managed daily partitions. Nothing to delete.

- **2026-07-22** — Image generation **deferred** by owner; mermaid diagram generation is the only visual pipeline going forward (affects 3.3/3.4 and the content-generation prompt design).
- **2026-07-22** — Prisma adopted as schema mirror + drift detection only; supabase-js remains the runtime data client so RLS policies keep applying.

- **2026-07-22** — Multi-provider layer: Vercel AI SDK chosen over hand-rolled adapters; supports arbitrary OpenAI-compatible endpoints via `@ai-sdk/openai-compatible` (`createOpenAICompatible({ baseURL })`).
- **2026-07-22** — CORS headers removed globally: Capacitor app uses `server.url` pointing at the deployed site, so mobile is same-origin and needs no CORS.
- **2026-07-22** — `profiles` keeps its open SELECT policy for community features after secrets moved out. Follow-up consideration: `learning_goals` / `occupation` are still visible to all authenticated users.
