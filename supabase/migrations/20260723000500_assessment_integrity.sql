-- Assessment integrity (Plan P10) — extends the P9 attempt record.
--
-- Integrity is MODE-DIFFERENTIATED (owner constraint): a classroom exam has a
-- teacher who can review flags, a self-paced exam has nobody, so its integrity
-- must be automated and defensible on its own. `mode` records which regime an
-- attempt was sat under, and it is derived SERVER-SIDE (does a classroom course
-- teach this subject?) — never sent by the client.
--
-- DEFERRED to P14. Requires 20260723000400_assessment.sql first.

alter table public.assessment_attempts
  -- 'classroom' → flags are advisory and surface to the teacher (P10.4).
  -- 'self_paced' → no reviewer exists, so the oral viva (P10.5) is the gate.
  add column if not exists mode text
    check (mode is null or mode in ('classroom', 'self_paced')),
  -- Client-reported focus/visibility/fullscreen events (P10.3). ADVISORY ONLY:
  -- a determined cheater can suppress these, so they are never a hard block —
  -- they exist to make casual tab-switching visible, nothing more.
  add column if not exists integrity_events jsonb not null default '[]'::jsonb,
  -- Oral viva transcript + per-question scores (P10.5).
  add column if not exists viva jsonb,
  -- Did the learner pass the viva? NULL = not required / not taken. For a
  -- self-paced attempt this — not the MCQ score alone — is what a future
  -- certificate (P9.5) must check.
  add column if not exists viva_passed boolean;

comment on column public.assessment_attempts.integrity_events is
  'Advisory client-reported focus/visibility events (P10.3). Suppressible by design — never gate on these alone.';
comment on column public.assessment_attempts.viva_passed is
  'Self-paced integrity gate (P10.5). A certificate must require this, not just `passed`.';

-- Teacher review decisions (P10.4). Flags are advisory; a human decides what
-- they mean, and that decision is recorded rather than applied automatically.
create table if not exists public.attempt_reviews (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  -- FK -> auth.users.id (the reviewing teacher)
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('cleared', 'flagged', 'invalidated')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, reviewer_user_id)
);

create index if not exists attempt_reviews_attempt_idx on public.attempt_reviews (attempt_id);

drop trigger if exists set_attempt_reviews_updated_at on public.attempt_reviews;
create trigger set_attempt_reviews_updated_at
  before update on public.attempt_reviews
  for each row execute function public.update_updated_at_column();

alter table public.attempt_reviews enable row level security;

-- Only the teacher of a classroom that teaches the attempt's subject may review,
-- and only as themselves. Uses the existing SECURITY DEFINER helper so the
-- subquery is not blocked by classroom_members' own RLS.
drop policy if exists "Teachers manage reviews for their courses" on public.attempt_reviews;
create policy "Teachers manage reviews for their courses"
  on public.attempt_reviews for all
  using (
    reviewer_user_id = auth.uid()
    and exists (
      select 1
      from public.assessment_attempts a
      join public.classroom_courses cc on cc.subject_id = a.subject_id
      where a.id = attempt_reviews.attempt_id
        and public.is_classroom_teacher(cc.classroom_id)
    )
  )
  with check (
    reviewer_user_id = auth.uid()
    and exists (
      select 1
      from public.assessment_attempts a
      join public.classroom_courses cc on cc.subject_id = a.subject_id
      where a.id = attempt_reviews.attempt_id
        and public.is_classroom_teacher(cc.classroom_id)
    )
  );

-- The student can see the outcome of a review of their own attempt (being
-- flagged without ever being told would be indefensible), but cannot write one.
drop policy if exists "Students read reviews of own attempts" on public.attempt_reviews;
create policy "Students read reviews of own attempts"
  on public.attempt_reviews for select
  using (
    exists (
      select 1 from public.assessment_attempts a
      where a.id = attempt_reviews.attempt_id and a.user_id = auth.uid()
    )
  );
