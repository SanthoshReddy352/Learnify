-- Assessment: concept-tagged item bank + graded attempts (Plan P9).
--
-- Items are generated FROM the P6.5 concept ledgers, so every question is
-- provably aligned to something a lesson actually taught, and every item keeps
-- its concept tag — which is what lets a missed question point at a concept
-- (feeding user_concept_state, P8.1) instead of just lowering a score.
--
-- DEFERRED to P14 (see standing constraint). All code paths are behind
-- ASSESSMENTS=true and fail soft, so the tables' absence changes nothing.

-- ---------------------------------------------------------------------------
-- assessment_items — the reusable bank, one row per question.
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  -- Concept tag + its normalized join key (same normalization as
  -- user_concept_state.concept_key — lib/memory/concept-state.js).
  concept text not null,
  concept_key text not null,
  -- 'mcq' = recall/application; 'why' = elaborative interrogation (P9.3);
  -- 'worked_example' = a partially-faded solution the learner completes (P9.3).
  kind text not null default 'mcq' check (kind in ('mcq', 'why', 'worked_example')),
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  stem text not null,
  options jsonb,                       -- mcq/worked_example: array of strings
  correct_index smallint,              -- index into options
  answer_key text,                     -- 'why' items: the model answer
  explanation text,                    -- shown after the learner answers
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assessment_items_subject_idx
  on public.assessment_items (subject_id);
create index if not exists assessment_items_topic_idx
  on public.assessment_items (topic_id);
-- Concept-scoped item lookups (targeted practice on a weak concept).
create index if not exists assessment_items_concept_idx
  on public.assessment_items (subject_id, concept_key);

drop trigger if exists set_assessment_items_updated_at on public.assessment_items;
create trigger set_assessment_items_updated_at
  before update on public.assessment_items
  for each row execute function public.update_updated_at_column();

alter table public.assessment_items enable row level security;

-- Row access follows the subject: its owner, plus students enrolled in a
-- classroom course that teaches it (mirrors the existing classroom read paths).
drop policy if exists "Subject owners manage assessment items" on public.assessment_items;
create policy "Subject owners manage assessment items"
  on public.assessment_items for all
  using (
    exists (
      select 1 from public.subjects s
      where s.id = assessment_items.subject_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.subjects s
      where s.id = assessment_items.subject_id and s.user_id = auth.uid()
    )
  );

-- Classroom reads reuse the existing SECURITY DEFINER helpers rather than
-- querying classroom_members directly: that table's own RLS would otherwise
-- apply to the subquery and hide the very membership row being checked. Same
-- shape as the "Users can view classroom topics" policy.
drop policy if exists "Classroom participants read assessment items" on public.assessment_items;
create policy "Classroom participants read assessment items"
  on public.assessment_items for select
  using (
    exists (
      select 1
      from public.classroom_courses
      where classroom_courses.subject_id = assessment_items.subject_id
        and (
          public.is_classroom_teacher(classroom_courses.classroom_id)
          or public.is_classroom_student(classroom_courses.classroom_id)
        )
    )
  );

-- ANSWER-KEY SHIELDING (column-level, deliberate).
--
-- RLS is row-level, so without this a learner — who OWNS their self-paced
-- subject — could read `correct_index` straight out of the bank before an exam.
-- Postgres column privileges close that: end-user roles can read the stem and
-- options but NOT the answer columns. Grading runs through the service role
-- (which bypasses both RLS and column grants) in app/api/exam/*, and hands back
-- correctness + explanation after the fact.
--
-- CONSEQUENCE: `select *` on this table as an end user ERRORS. Client and
-- RLS-client reads MUST enumerate columns (see ITEM_PUBLIC_COLUMNS in
-- lib/assessment/items.js). That is a loud failure by design — the quiet
-- alternative is leaking answer keys.
--
-- IT MUST BE WRITTEN THIS WAY ROUND. `revoke select (correct_index, answer_key)`
-- on its own reports success and does nothing: Supabase's default privileges
-- grant TABLE-level SELECT to anon/authenticated, and a table-level grant is not
-- a bundle of column grants you can subtract from — it keeps covering every
-- column. Verified against production on 2026-07-25, where the original form had
-- left both answer columns readable. Drop the table grant, then grant back the
-- exact public column list.
revoke select on public.assessment_items from anon, authenticated;

grant select (
  id, subject_id, topic_id, concept, concept_key,
  kind, difficulty, stem, options, created_at, updated_at
) on public.assessment_items to anon, authenticated;

-- ---------------------------------------------------------------------------
-- assessment_attempts — one row per practice item answered or exam sat.
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- 'practice' = formative, in-lesson, ungraded. 'exam' = summative, graded,
  -- gates certification (P9.5, after P10).
  kind text not null default 'practice' check (kind in ('practice', 'exam')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'graded', 'abandoned')),
  -- The exact items served, in the order served, with the per-attempt option
  -- shuffle (P10.1 randomization) so grading and review agree with what was seen.
  items jsonb not null default '[]'::jsonb,
  -- [{ item_id, chosen_index, confidence, correct, ms }]
  responses jsonb not null default '[]'::jsonb,
  score numeric(5,2),
  passed boolean,
  -- P10 integrity hooks: timing/focus anomalies land here as ADVISORY flags.
  flags jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assessment_attempts_user_idx
  on public.assessment_attempts (user_id, subject_id);
create index if not exists assessment_attempts_kind_idx
  on public.assessment_attempts (user_id, kind, status);

drop trigger if exists set_assessment_attempts_updated_at on public.assessment_attempts;
create trigger set_assessment_attempts_updated_at
  before update on public.assessment_attempts
  for each row execute function public.update_updated_at_column();

alter table public.assessment_attempts enable row level security;

-- READ-ONLY for end users. Attempts are created, scored and closed by the
-- server via the service role — exactly like generation_jobs — so a learner
-- cannot forge a score or a pass. This is the difference between this table and
-- user_concept_state (P8.1), which is owner-writable precisely because it gates
-- nothing.
drop policy if exists "Users read own attempts" on public.assessment_attempts;
create policy "Users read own attempts"
  on public.assessment_attempts for select
  using (auth.uid() = user_id);

-- Teachers read attempts for subjects they teach through a classroom course
-- (the data behind P12 analytics and P10.4 review).
drop policy if exists "Teachers read attempts for their courses" on public.assessment_attempts;
create policy "Teachers read attempts for their courses"
  on public.assessment_attempts for select
  using (
    exists (
      select 1
      from public.classroom_courses
      where classroom_courses.subject_id = assessment_attempts.subject_id
        and public.is_classroom_teacher(classroom_courses.classroom_id)
    )
  );
