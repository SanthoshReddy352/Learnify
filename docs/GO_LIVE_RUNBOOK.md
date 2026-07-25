# Learnify — Go-Live Runbook (P14)

> Written 2026-07-25. This is the complete list of things **you** have to do to take
> P5–P13 live. Work top to bottom. Every step says what to do, where to do it, and
> how to know it worked.
>
> Production Supabase project: **`bljhrkulhkokfdpwwvlc`** (ap-southeast-1).

---

## Already done — do NOT redo these

| Done | What |
|------|------|
| ✅ | **All 9 database migrations applied to production** and verified (see Appendix A for the exact list). |
| ✅ | **A real security bug was found and fixed during the apply** — see the box below. |
| ✅ | Code leftovers finished: SSRF hardening, search resilience, content reporting, and P9.5 certificates. |
| ✅ | 364 unit tests green, lint clean, production build clean. |

> ### ⚠️ The bug the migration check caught
>
> The P9 migration protected exam answer keys with:
> ```sql
> revoke select (correct_index, answer_key) on public.assessment_items from anon, authenticated;
> ```
> That statement **reports success and does nothing.** Supabase grants *table-level*
> SELECT on new public tables, and in Postgres a table-level grant is not a bundle of
> column grants you can subtract from — it keeps covering every column.
>
> **The impact if it had shipped:** every logged-in user could read the correct answer
> to every exam question straight out of the item bank, and every exam score and every
> certificate would have been meaningless.
>
> It is fixed in production now (revoke the table grant, then grant back only the safe
> columns) and verified by actually switching to the `authenticated` role and being
> refused. The repo migration is corrected and `20260725000900_fix_assessment_answer_key_shielding.sql`
> repairs any other environment that ran the old version.

---

## Step 1 — Ship the code

Nothing below matters until the new code is deployed. You have ~150 changed/new files
covering P5–P13 that have never been pushed.

```bash
git checkout -b release/p5-p14
```

```bash
git add -A && git commit -m "Ship P5-P13: async generation, grounded content, multi-modal learning, user memory, assessment, integrity, reminders, teacher analytics, ops"
```

```bash
git push -u origin release/p5-p14
```

Then open a PR on GitHub and merge it to `main`. Vercel will build from `main`.

**How to know it worked:** the GitHub Actions CI check goes green (this will be the
first real run of the rewritten workflow), and Vercel shows a successful deployment.

> **Do not push to the `public` remote** (`learnify-edu`) until after Step 2.1 — the
> leaked API key is still in that history.

---

## Step 2 — Things only you can do (accounts and dashboards)

### 2.1 — Rotate the leaked Gemini API key 🔴 **DO THIS FIRST**

Your `GEMINI_API_KEY` is sitting in public git history (commit `b2ffc07`, file
`.env.local.backup`). Google has already flagged it as leaked, which is why it errors.

1. Go to **https://aistudio.google.com/apikey**
2. Find the existing key in the list. Click the **⋮** menu next to it → **Delete**.
   *(Delete it first. A rotated-but-not-deleted key is still a leaked key.)*
3. Click **Create API key** → choose your project → **Copy** the new key.
4. Paste it into `.env` as `GEMINI_API_KEY=` (Step 3) **and** into Vercel (Step 4).

**How to know it worked:** the old key returns 400 "API key not valid" and generation
using the new key succeeds.

### 2.2 — Enable leaked-password protection

1. Go to **https://supabase.com/dashboard/project/bljhrkulhkokfdpwwvlc/auth/providers**
2. Find the **Password** / **Email** provider settings.
3. Turn on **"Prevent use of leaked passwords"** (checks HaveIBeenPwned).
4. Save.

**How to know it worked:** the Supabase security advisor stops reporting
"Leaked Password Protection Disabled". It is the only WARN currently attributable to
you — everything else in that report is a documented, accepted decision.

### 2.3 — Delete `.env.local`

It is UTF-16 encoded, which means Next.js and dotenv **silently ignore it entirely**.
It currently contains zero variables, so there is nothing to lose — but leaving it there
guarantees that someone (probably you, at 2am) eventually adds a variable to it and
loses an hour wondering why it has no effect.

```bash
rm .env.local
```

**Rule from here on: environment variables go in `.env`, never `.env.local`.**

### 2.4 — Generate your VAPID keys (needed for push reminders)

```bash
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep the terminal open — you need both
in Step 3.

> **Generate these exactly once.** If you regenerate them later, every device that has
> already enabled notifications is silently invalidated and every learner has to turn
> notifications on again.

### 2.5 — Copy your Supabase service role key

1. Go to **https://supabase.com/dashboard/project/bljhrkulhkokfdpwwvlc/settings/api-keys**
2. Find **`service_role`** — click reveal, then copy.

> This key bypasses all RLS. It is **server-side only**. Never put it in a variable whose
> name starts with `NEXT_PUBLIC_`, and never paste it into client code.

### 2.6 — Set up Inngest (needed for async generation + reminder cron)

1. Sign up at **https://www.inngest.com** (free tier is enough).
2. Create an app.
3. From the app's settings, copy the **Event Key** and the **Signing Key**.
4. After your Vercel deploy is live, register your endpoint:
   `https://<your-domain>/api/inngest`
   (Inngest calls this "sync" or "add app".)

**How to know it worked:** the Inngest dashboard lists your functions —
`generate-topic-content` and `send-review-reminders`.

### 2.7 — (Optional) Scrub the leaked key from git history

Only meaningful **after** 2.1, and it rewrites history, which breaks every existing clone.
Since the key will already be dead, this is cosmetic. Skip it unless you specifically want
the repo clean.

---

## Step 3 — Fix your `.env` file

### 3.1 — Delete these dead variables

I traced every `process.env.*` read in the codebase. These four are read by nothing:

| Delete | Why it's dead |
|--------|---------------|
| `DB_NAME` | Left over from the MongoDB scaffold, deleted in Phase 1.6. |
| `CORS_ORIGINS` | Blanket CORS was removed in Phase 0.9 (the Android app is same-origin). |
| `OPENROUTER_API_KEY` | Pre-dates the AI SDK migration. Nothing reads it. |
| `GEMINI_API_KEYS` | Plural. The code reads the singular `GEMINI_API_KEY`. |
| `NEXT_PUBLIC_BASE_URL` | Nothing reads it. The code uses `NEXT_PUBLIC_APP_URL`. |

### 3.2 — 🔴 Your AI provider order points at a provider you have not configured

`.env` currently says:

```
AI_PROVIDER_ORDER=openai-compatible,google,anthropic
```

…but there is **no `OPENAI_COMPAT_BASE_URL` in `.env`**. So the first provider in the
chain is unconfigured and every generation falls through to Google — using the leaked
key, on an exhausted free quota. **This is most likely why generation is unreliable right now.**

Pick one:

- **Option A — you still use OpenCode Zen / another OpenAI-compatible endpoint.** Add:
  ```
  OPENAI_COMPAT_BASE_URL=https://your-endpoint/v1
  OPENAI_COMPAT_API_KEY=...
  OPENAI_COMPAT_MODELS=big-pickle
  ```
- **Option B — you want Google to be primary.** Change the order to:
  ```
  AI_PROVIDER_ORDER=google,openai-compatible,anthropic
  ```

Either works. Just do not leave an unconfigured provider first in the list.

### 3.3 — Add the missing variables

| Variable | Where it comes from | What breaks without it |
|----------|--------------------|-----------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Step 2.5 | 🔴 **The biggest one.** Practice grading, exams, the viva, certificates, reminders, and the async generation worker all return a clear 500. |
| `INNGEST_EVENT_KEY` | Step 2.6 | Async generation never starts; the reminder cron never runs. |
| `INNGEST_SIGNING_KEY` | Step 2.6 | Inngest cannot authenticate to your `/api/inngest` endpoint. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Step 2.4 (public key) | The browser cannot subscribe to push. |
| `VAPID_PRIVATE_KEY` | Step 2.4 (private key) | The sender refuses to run and logs why. |
| `VAPID_SUBJECT` | You — e.g. `mailto:gsreddy1182006@gmail.com` | Defaults to a fake address. Push services use this to contact you about problems. |
| `NEXT_PUBLIC_APP_URL` | Your real domain, e.g. `https://learnify.vercel.app` | Reminder links in **email** are relative and therefore broken. Push is unaffected. |

**Optional — only if you want them:**

| Variable | Turns on |
|----------|----------|
| `RESEND_API_KEY` + `REMINDER_EMAIL_FROM` | Email reminder digests. **Both or neither.** Without them, the email toggle shows as disabled with the reason, and push still works. |
| `SENTRY_DSN` and/or `ERROR_WEBHOOK_URL` | Ships errors somewhere you can see them. Without either, errors are still logged to Vercel's logs, just not aggregated. **Strongly recommended for a real launch** — otherwise you find out about bugs from users. |

### 3.4 — Your finished `.env` should look like this

```ini
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://bljhrkulhkokfdpwwvlc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing>
SUPABASE_SERVICE_ROLE_KEY=<from step 2.5 — server only>

# --- AI providers ---
AI_PROVIDER_ORDER=google,openai-compatible,anthropic
GEMINI_API_KEY=<the NEW key from step 2.1>
GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash
# OPENAI_COMPAT_BASE_URL=...
# OPENAI_COMPAT_API_KEY=...
# OPENAI_COMPAT_MODELS=...

# --- Background jobs ---
INNGEST_EVENT_KEY=<from step 2.6>
INNGEST_SIGNING_KEY=<from step 2.6>

# --- Push reminders ---
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key from step 2.4>
VAPID_PRIVATE_KEY=<private key from step 2.4 — server only>
VAPID_SUBJECT=mailto:you@example.com
NEXT_PUBLIC_APP_URL=https://your-domain

# --- Observability (optional but recommended) ---
# SENTRY_DSN=
# ERROR_WEBHOOK_URL=

# --- Feature flags: ALL OFF for now. Step 6 turns them on one at a time. ---
```

---

## Step 4 — Put the same variables in Vercel

1. Go to your Vercel project → **Settings** → **Environment Variables**.
2. Add every variable from Step 3.4, one at a time.
3. For each, tick **Production**, **Preview**, and **Development**.

> ### Two traps that will cost you an hour each
>
> 1. **Environment variables do not apply to an existing deployment.** After adding or
>    changing any of them you must **Deployments → ⋮ → Redeploy**. Nothing takes effect
>    until you do.
> 2. **`NEXT_PUBLIC_*` variables are baked into the JavaScript bundle at build time.**
>    So a change to `NEXT_PUBLIC_VAPID_PUBLIC_KEY` or `NEXT_PUBLIC_ASYNC_GENERATION`
>    needs a **rebuild**, not just a restart. Redeploy — do not use "Restore".

---

## Step 5 — Confirm the database is healthy (2 minutes)

Everything here should already pass — this is just your independent confirmation.
Run in the **Supabase SQL editor**:
https://supabase.com/dashboard/project/bljhrkulhkokfdpwwvlc/sql

```sql
-- Must return ZERO rows. If it returns anything, exam answer keys are readable
-- by any logged-in user and every score is meaningless.
select grantee, column_name
from information_schema.column_privileges
where table_name = 'assessment_items'
  and privilege_type = 'SELECT'
  and grantee in ('anon','authenticated')
  and column_name in ('correct_index','answer_key','explanation');
```

```sql
-- Must return 9 rows, all with rls_enabled = true.
select c.relname, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('generation_jobs','user_concept_state','assessment_items',
                    'assessment_attempts','attempt_reviews','notification_preferences',
                    'push_subscriptions','content_feedback','certificates')
order by c.relname;
```

```sql
-- Must return 1 row. Live progress bars depend on this.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'generation_jobs';
```

---

## Step 6 — Turn on the features, one at a time

**This is the part to be patient with.** Every flag is off right now, which means the app
today behaves exactly as it did before P5. Turn on **one group**, redeploy, verify it,
*then* move to the next. If you flip them all at once and something misbehaves, you will
not know which one did it.

Add each flag to `.env` **and** Vercel, then redeploy.

> ### 🔴 ON VERCEL HOBBY, DO 6.4 FIRST. Read this before flipping anything.
>
> Generation takes **~100 seconds** and runs on the request path unless async is on.
> Every flag in 6.1–6.3 makes it **longer** (`CONTENT_LEDGER` adds a whole extra AI
> call; grounding adds web fetches).
>
> **Vercel Hobby caps every function at 60 seconds and that cap cannot be raised.**
> The synchronous path therefore *cannot* finish a generation on Hobby — the platform
> kills the request and serves an HTML error page, which the browser reports as
> `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. **That message means
> "timed out", not "bad JSON".**
>
> **So on Hobby the order is: 6.4 → 6.1 → 6.2 → 6.3 → 6.5 …**
>
> #### Why raising `maxDuration` is not the answer
>
> A `maxDuration` above your plan's limit **fails the build outright** — it is not
> clamped and it is not a warning. Both routes are pinned to `60` for exactly this
> reason. *(If you move to Pro, raise both to `300`: `app/api/inngest/route.js` and
> `app/api/generate-topic-content/route.js`.)*
>
> #### Why async generation works anyway
>
> Inngest does not run your code on Inngest's servers — it calls back into
> `/api/inngest`, which is an ordinary Vercel function under the same 60s cap. What
> makes it work is that **each `step.run()` is a separate invocation with its own
> fresh 60s budget**, and finished steps are memoized. The worker is written as
> steps — outline, then one step per section, then finalize/ledger/verify/save — so
> a lesson runs as ~8–16 short invocations and can take as long in total as it needs
> while no single one goes near the cap. A retry also resumes from the last completed
> step rather than re-paying for the whole lesson.
>
> Consequence worth knowing: **the worker always generates section-by-section**,
> regardless of `CONTENT_SECTIONED`. That flag governs the *synchronous* route only.

### 6.1 — `CONTENT_LEDGER=true` ← start here on Pro. **On Hobby, do 6.4 first.**

**Turns on:** concept-ledger extraction after each lesson, and continuity between topics.

**Why first:** P8 (user memory), P9 (assessment items), and P12 (the teacher heatmap) all
get substantially better with ledgers, and P9's exam questions are generated *from* them.

**Verify:** generate a topic. Then run:
```sql
select title, concept_ledger is not null as has_ledger
from topics where concept_ledger is not null limit 5;
```
Then generate the *next* topic in that subject and read it — it should reference the earlier
topic rather than re-teaching it from scratch.

### 6.2 — `CONTENT_SECTIONED=true`

**Turns on:** two-pass generation (outline first, then each section separately).

**Verify:** generate a long/difficult topic. The old failure was the lesson stopping
mid-sentence. It should now end properly. If the outline step fails it silently falls back
to the old single-pass path, so this cannot break generation.

### 6.3 — `CONTENT_GROUNDING=true` and `CONTENT_VERIFY=true`

**Turns on:** real web sources, citations, and an automated fact-check pass.

**Verify:** a generated lesson ends with a **"References & Further Learning"** section with
real, clickable links.

**Note:** search now falls back DuckDuckGo HTML → DuckDuckGo Lite → Wikipedia, with retries,
so the rate-limit problem that used to silently produce zero sources is much less likely.
If you still get a lesson with no references, that is the fallback chain being exhausted —
it degrades to an ungrounded lesson rather than failing.

### 6.4 — `NEXT_PUBLIC_ASYNC_GENERATION=true`

**Turns on:** generation moves off the request path, with a live progress bar.

**Requires:** the Inngest keys from Step 2.6, and the endpoint synced.

**Verify:** generate a topic. You should see real stage names ("Writing the lesson…") and a
moving percentage, not a spinner. Then check:
```sql
select kind, status, progress, stage from generation_jobs order by created_at desc limit 5;
```
The newest row should reach `succeeded`.

⚠️ **This is a `NEXT_PUBLIC_` flag — it needs a full rebuild, not a restart.**

**On Hobby this is not optional and not last — it is the step that makes generation
work at all.** Do it before 6.1. If you flip it and generation still fails, the cause
is almost always one of: the Inngest **event key** missing (the enqueue call needs it),
the app not synced, or `SUPABASE_SERVICE_ROLE_KEY` missing (the worker refuses to start
without it and says so in `generation_jobs.error`).

Useful when debugging — the job row records its own failure:
```sql
select status, stage, progress, error from generation_jobs order by created_at desc limit 5;
```

### 6.5 — `USER_MEMORY=true`

**Turns on:** per-concept mastery memory driving lesson depth, the tutor, and review order.

**Verify:** do a review, then:
```sql
select concept, mastery, observations from user_concept_state order by updated_at desc limit 5;
```
Rows should appear. Take a placement check on a subject and confirm more rows appear.

### 6.6 — `CONTENT_PROJECT=true` and `CONTENT_ARTIFACT=true`

**Turns on:** project tracks (subject page) and interactive demos (lesson page) get *saved*.

**Verify:** generate one of each. Reload the page — they should still be there.

### 6.7 — `ASSESSMENTS=true` ← the big one

**Turns on:** the item bank, in-lesson practice, exams, the viva, **and certificates**.

**Requires:** `SUPABASE_SERVICE_ROLE_KEY` must be set, or grading returns a clear 500.

**Verify, in this order:**
1. On a subject with generated lessons, click to generate assessment items. Confirm the
   questions only cover things the lessons actually taught.
2. In a lesson, answer a practice question. **Pick a confidence level before revealing.**
   Answer one confidently-wrong on purpose — it should tell you that gap comes back sooner.
3. Sit a full exam. Midway, **switch to another browser tab once and come back.** The
   result screen should mention it, and:
   ```sql
   select mode, score, passed, integrity_events from assessment_attempts
   where kind = 'exam' order by created_at desc limit 1;
   ```
   should show the event.
4. On a **self-paced** subject, pass the exam. The viva must appear. Complete it.
5. **Then the certificate panel appears.** Click "Get my certificate". Copy the code.
6. Open `https://<your-domain>/verify/<the-code>` **in a private/incognito window**
   (to prove it works logged out). It should show the name, subject, score, and
   "Valid certificate".
7. Type a wrong code into `https://<your-domain>/verify` — it should say no certificate
   matches, not error.

> **Check this deliberately:** on a self-paced subject, pass the exam but *skip* the viva.
> The certificate must **not** be offered. That rule is the entire reason self-paced
> certificates are worth anything.

### 6.8 — `REVIEW_REMINDERS=true` ← do this last

**Turns on:** the hourly reminder sender.

**Requires:** VAPID keys, Inngest keys, and `SUPABASE_SERVICE_ROLE_KEY`.

⚠️ **This cannot be tested with `npm run dev`** — next-pwa disables the service worker in
development, so there is no push at all locally. Test against your deployed site.

**Verify:**
1. On the deployed site: **Settings → Review reminders** → enable notifications for this
   device (accept the browser permission prompt).
2. Click **Send a test notification**. This exercises the whole chain in one click:
   permission → service worker → VAPID → push endpoint. If it arrives, everything works.
3. Click the notification. It should focus your **existing** tab on `/dashboard`, not open
   a second one.
4. Set your reminder hour to the *next* hour, on a day you have at least one review due.
   Wait for it. Exactly **one** reminder should arrive, and:
   ```sql
   select reminder_hour, timezone, last_reminder_on from notification_preferences;
   ```
   `last_reminder_on` should be today's date **in your timezone**.
5. Let the following hour pass and confirm **no duplicate** arrives.
6. In the Inngest dashboard, confirm `send-review-reminders` is firing hourly.

**`SOCRATIC_CHAT` needs no action** — it defaults to ON. Set it to `false` only if the
Socratic tutor turns out to annoy real learners.

---

## Step 7 — Final sweep before you call it live

- [ ] Supabase advisors show **no new ERROR-level findings**.
      *(Two ERRORs on `shared_topics` / `shared_subject_stats` are expected and were
      accepted in Phase 0.5 — those views are the privacy fix, not a problem.)*
- [ ] Sign in as a **second, non-owner account**. Confirm it sees **zero** rows of the first
      account's `user_concept_state`, `assessment_attempts`, and `certificates`.
- [ ] TTS: open a lesson, click **Listen**, confirm audio plays. **This has never been
      verified in this project** — there was no browser with audio available. It is the one
      feature with no test coverage of any kind.
- [ ] Teacher analytics: open a classroom's analytics page **on a phone-width screen**.
      The layout was validated for colour but never eyeballed for label collisions or grid
      overflow with a real roster.
- [ ] Report a lesson via **"This looks wrong"** and confirm it lands:
      ```sql
      select reason, note, status from content_feedback order by created_at desc limit 5;
      ```

---

## Step 8 — If something goes wrong

**Every flag is independently reversible.** Set it back to `false`, redeploy, and the
previous behaviour returns immediately with no data loss — the tables and columns simply
stop being read.

**You will not need to roll back a migration.** All nine are additive: they create new
tables and add new nullable columns. Nothing was dropped, renamed, or altered, so no
existing query can break.

**If generation fails with `Unexpected token '<', "<!DOCTYPE "...`:** that is a **timeout**,
not a JSON problem — the platform killed the request and returned an HTML error page. On
Hobby the synchronous path cannot finish a generation; turn on `NEXT_PUBLIC_ASYNC_GENERATION`
(step 6.4). The client now reports this in plain language instead of the parser error.

**If a deployment fails to build:** check for a `maxDuration` above your plan's ceiling
(60 on Hobby, 300 on Pro). That is a hard build failure, and the error message names the
limit.

**If generation fails for any other reason:** check the provider order problem in Step 3.2
first. That is the most likely cause.

**If a feature silently does nothing:** its flag is on but its table is missing, or its
env var is absent. Every path fails soft by design — which is safe, but does mean "nothing
happens" is the symptom. Check the Vercel function logs.

---

## Appendix A — Migrations applied to production on 2026-07-25

| # | Migration | Creates |
|---|-----------|---------|
| 1 | `generation_jobs` | `generation_jobs` + Realtime |
| 2 | `topic_concept_ledger` | `topics.concept_ledger` |
| 3 | `p7_project_and_artifact` | `subjects.project_track`, `topics.artifact` |
| 4 | `user_concept_state` | `user_concept_state` |
| 5 | `assessment` | `assessment_items`, `assessment_attempts` |
| 5b | `assessment_answer_key_shielding_fix` | **The answer-key fix described at the top** |
| 6 | `assessment_integrity` | attempt `mode`/`integrity_events`/`viva`/`viva_passed`, `attempt_reviews` |
| 7 | `reminders` | `notification_preferences`, `push_subscriptions` |
| 8 | `content_feedback` | `content_feedback` |
| 9 | `certificates` | `certificates` + the `verify_certificate()` function |

## Appendix C — 🔒 `jsdom` is pinned to `~27.3.0`. Do not bump it casually.

**`jsdom@27.4.0` breaks every server route that touches jsdom, at runtime, in production only.**

The chain: `jsdom@27.4.0` bumped `html-encoding-sniffer` from `^4` to `^6`, and v6
depends on `@exodus/bytes`, which is **pure ESM** (`"type": "module"`). But
`html-encoding-sniffer` is CommonJS and `require()`s it. Vercel's serverless module
loader does not support `require()` of an ESM module, so the route dies at import time
with:

```
Error [ERR_REQUIRE_ESM]: require() of ES Module .../@exodus/bytes/encoding-lite.js
from .../html-encoding-sniffer/lib/html-encoding-sniffer.js not supported.
```

**This does not reproduce locally.** Node 22.12+ supports `require(esm)`, so on a dev
machine running Node 22.12/24 everything works — it only fails once deployed. `npm run
build` does not catch it either, because it is an *import-time* failure in the
serverless runtime, not a compile error.

Affected routes are every one that reaches jsdom — which is all content generation, via
mermaid validation (`lib/ai/mermaid.js`) and HTML→text extraction (`lib/ai/tools/web.js`).

**If you ever need to move jsdom:** check that `html-encoding-sniffer` resolves to v4,
not v6:

```bash
npm ls @exodus/bytes
```

That command must print `(empty)`. If `@exodus/bytes` appears anywhere in the tree, the
deployment will fail at runtime no matter how green the build is.

## Appendix B — Known gaps, deliberately not addressed

- **Android push does not work.** Web Push is not implemented in the Capacitor Android
  WebView. Browsers and installed PWAs get reminders; the Android app build does not.
  Fixing it needs a Firebase project and an FCM adapter in `lib/reminders/deliver.js`.
- **Full accessibility sweep** (keyboard navigation, contrast) has not been done — it needs
  assistive technology and a human eye, which could not be done headlessly.
- **TTS has never been heard.** See Step 7.
- **The `verify_certificate` advisor WARN is intentional.** It is a `SECURITY DEFINER`
  function callable by anonymous users — that is the entire point of public certificate
  verification. It returns at most the single row whose high-entropy serial you already
  know, so it cannot be enumerated, and it exposes no user id or email.
