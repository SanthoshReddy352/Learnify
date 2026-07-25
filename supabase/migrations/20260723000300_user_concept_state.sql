-- user_concept_state: per-user, per-concept mastery (Plan P8.1).
--
-- The "user memory" half of the two-tier memory model (the other half is the
-- per-topic concept ledger from P6.5, which is shared subject memory). Nothing
-- new is collected: rows are derived from signals the app already produces —
-- SM-2 review quality, doubt-chat questions, lesson completions, and the P8.4
-- placement check. Read back into content generation, the doubt-chat tutor, and
-- the review queue so "topic 2 knows how the learner did in topic 1".
--
-- DEFERRED to P14 (see standing constraint). All code paths that touch this
-- table are behind USER_MEMORY=true and are written to fail soft, so the table's
-- absence changes nothing until it is applied.

create table if not exists public.user_concept_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- Normalized join key (lowercased, punctuation-stripped) so "Big-O notation"
  -- and "big o notation" are one concept. `concept` keeps the display label.
  concept_key text not null,
  concept text not null,
  -- Exponential moving average of observed performance on this concept, 0..1.
  mastery real not null default 0 check (mastery >= 0 and mastery <= 1),
  -- Counters kept alongside the EMA: `exposures` includes signals that carry no
  -- performance observation (reading a lesson, asking a question), so mastery
  -- and exposure can disagree — which is exactly the "seen it but shaky" case.
  exposures integer not null default 0 check (exposures >= 0),
  -- Signals that carried an actual performance observation (graded review,
  -- placement answer). The EMA is seeded from the first one instead of decaying
  -- up from 0, so one perfect review reads as mastery, not 0.4.
  observations integer not null default 0 check (observations >= 0),
  successes integer not null default 0 check (successes >= 0),
  struggles integer not null default 0 check (struggles >= 0),
  last_signal text check (last_signal in ('review', 'lesson', 'doubt', 'diagnostic', 'quiz')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject_id, concept_key)
);

create index if not exists user_concept_state_user_subject_idx
  on public.user_concept_state (user_id, subject_id);
-- Weak-concept lookups (review-queue ordering, proactive doubt-chat nudges).
create index if not exists user_concept_state_weak_idx
  on public.user_concept_state (user_id, mastery);

-- Reuse the existing shared trigger (search_path pinned in Phase 0.6).
drop trigger if exists set_user_concept_state_updated_at on public.user_concept_state;
create trigger set_user_concept_state_updated_at
  before update on public.user_concept_state
  for each row execute function public.update_updated_at_column();

alter table public.user_concept_state enable row level security;

-- Owner-only, all four verbs: this is the learner's own private memory. Unlike
-- generation_jobs, users legitimately write these rows (via server actions
-- running under their session), so INSERT/UPDATE/DELETE are granted — a user
-- forging their own mastery only misleads their own learning path, and nothing
-- gated (certificates in P9/P10) is ever derived from this table.
drop policy if exists "Users read own concept state" on public.user_concept_state;
create policy "Users read own concept state"
  on public.user_concept_state for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own concept state" on public.user_concept_state;
create policy "Users insert own concept state"
  on public.user_concept_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own concept state" on public.user_concept_state;
create policy "Users update own concept state"
  on public.user_concept_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own concept state" on public.user_concept_state;
create policy "Users delete own concept state"
  on public.user_concept_state for delete
  using (auth.uid() = user_id);
