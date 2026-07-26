-- Teacher-authored assessments (papers a teacher drafts, schedules and publishes).
--
-- WHY THESE TABLES AND NOT A BIGGER REWRITE:
--
-- Everything DOWNSTREAM of a paper already exists — the item bank
-- (assessment_items), seeded per-learner selection and option permutation
-- (lib/assessment/exam.js), grading, integrity flags, viva and certificates.
-- What was missing was the paper itself: an exam only existed at the moment a
-- STUDENT pressed "start", assembled on the fly. A teacher had no way to say
-- "these questions, this class, this window".
--
-- So this migration adds only the authoring layer and lets the existing engine
-- do the rest.
--
-- THE CENTRAL DESIGN CHOICE — a question is either PINNED or a BLUEPRINT:
--
--   pinned    -> a specific assessment_items row; every student sees that exact
--                question. This is what teachers mean by "a test".
--   blueprint -> a rule ("3 questions on TCP handshake, difficulty 2-4") that
--                the existing selectExamItems() fills per student at start time.
--
-- One schema therefore covers both a conventional fixed paper and an adaptive
-- draw, and the adaptive case reuses the selection engine rather than
-- duplicating it. A paper can mix the two freely.
--
-- SECURITY NOTE — the answer key:
--
-- assessment_items.correct_index / answer_key / explanation are REVOKED from
-- anon and authenticated at the column level (see the P9 migration). Authoring
-- needs to read and write those columns, and the fix is NOT to loosen that
-- grant — it is for teacher authoring routes to use the service role behind a
-- requireTeacher() check. Nothing here re-grants those columns, and
-- assessment_questions is deliberately unreadable by students for the same
-- reason: it is the map from a paper to its answers.

-- ---------------------------------------------------------------------------
-- assessments — the paper
-- ---------------------------------------------------------------------------
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  -- Which subject's item bank this paper draws from.
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,

  title text not null check (length(trim(title)) between 1 and 200),
  instructions text check (length(instructions) <= 5000),

  -- draft: editable, invisible to students.
  -- published: locked for editing, visible, sittable inside its window.
  -- closed: no new attempts; results stay readable.
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),

  opens_at timestamptz,
  closes_at timestamptz,
  duration_minutes integer check (duration_minutes between 1 and 600),

  pass_score integer not null default 70 check (pass_score between 0 and 100),
  max_attempts integer not null default 1 check (max_attempts between 1 and 10),

  shuffle_questions boolean not null default true,
  -- Per-attempt option permutation is also what makes the P10 shared-answer
  -- detector work, so turning it off has an integrity cost, not just a
  -- fairness one.
  shuffle_options boolean not null default true,
  require_fullscreen boolean not null default false,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A window that closes before it opens would silently make the paper
  -- unsittable, with nothing on screen to explain why.
  constraint assessments_window_ordered check (
    opens_at is null or closes_at is null or closes_at > opens_at
  )
);

create index if not exists assessments_classroom_idx on public.assessments (classroom_id, status);
create index if not exists assessments_subject_idx on public.assessments (subject_id);

-- ---------------------------------------------------------------------------
-- assessment_questions — the paper's contents
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  position integer not null default 0,

  source text not null default 'item' check (source in ('item', 'blueprint')),

  -- source = 'item'
  item_id uuid references public.assessment_items(id) on delete cascade,

  -- source = 'blueprint'
  concept_key text,
  difficulty_min smallint check (difficulty_min between 1 and 5),
  difficulty_max smallint check (difficulty_max between 1 and 5),
  draw_count integer check (draw_count between 1 and 20),

  points numeric(6, 2) not null default 1 check (points > 0 and points <= 100),
  created_at timestamptz not null default now(),

  -- The two shapes are mutually exclusive and each has its own required
  -- fields. Enforced here rather than in application code because a
  -- half-populated row would fail at exam-start time — in front of a class,
  -- mid-test — instead of at authoring time.
  constraint assessment_questions_shape check (
    (source = 'item' and item_id is not null)
    or (
      source = 'blueprint'
      and concept_key is not null
      and draw_count is not null
      and difficulty_min is not null
      and difficulty_max is not null
      and difficulty_max >= difficulty_min
    )
  )
);

create index if not exists assessment_questions_assessment_idx
  on public.assessment_questions (assessment_id, position);

-- The same item twice in one paper is always an authoring mistake.
create unique index if not exists assessment_questions_unique_item
  on public.assessment_questions (assessment_id, item_id)
  where item_id is not null;

-- ---------------------------------------------------------------------------
-- assessment_assignments — who sits it
-- ---------------------------------------------------------------------------
-- NO ROWS MEANS THE WHOLE CLASS. That is the common case, and materializing a
-- row per student for it would mean back-filling every time someone joins the
-- classroom — a silent way for late joiners to miss a test.
create table if not exists public.assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  classroom_member_id uuid not null references public.classroom_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (assessment_id, classroom_member_id)
);

create index if not exists assessment_assignments_assessment_idx
  on public.assessment_assignments (assessment_id);

-- ---------------------------------------------------------------------------
-- Link attempts back to the paper they were sat under
-- ---------------------------------------------------------------------------
-- Nullable on purpose: self-serve practice and self-paced exams have no paper,
-- and every existing row is one of those. Additive, so nothing already stored
-- has to be migrated or re-interpreted.
alter table public.assessment_attempts
  add column if not exists assessment_id uuid references public.assessments(id) on delete set null;

create index if not exists assessment_attempts_assessment_idx
  on public.assessment_attempts (assessment_id, user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists set_assessments_updated_at on public.assessments;
create trigger set_assessments_updated_at
  before update on public.assessments
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_assignments enable row level security;

-- Teachers of the classroom own the paper outright.
drop policy if exists "Teachers manage classroom assessments" on public.assessments;
create policy "Teachers manage classroom assessments"
  on public.assessments for all
  using (public.is_classroom_teacher(classroom_id))
  with check (public.is_classroom_teacher(classroom_id));

-- Students see a paper only once it is published, and only if it is either
-- unassigned (whole class) or assigned to them. Draft papers are invisible —
-- a teacher must be able to prepare a test without the class watching.
drop policy if exists "Students read assigned published assessments" on public.assessments;
create policy "Students read assigned published assessments"
  on public.assessments for select
  using (
    status in ('published', 'closed')
    and public.is_classroom_student(classroom_id)
    and (
      not exists (
        select 1 from public.assessment_assignments aa
        where aa.assessment_id = assessments.id
      )
      or exists (
        select 1
        from public.assessment_assignments aa
        join public.classroom_members cm on cm.id = aa.classroom_member_id
        where aa.assessment_id = assessments.id
          and cm.student_user_id = auth.uid()
      )
    )
  );

-- Teachers only. There is deliberately NO student policy: this table maps a
-- paper to the exact items on it, which is one join away from the answer key.
-- Students receive their questions from the exam-start route, which runs with
-- the service role and strips the answer columns before responding.
drop policy if exists "Teachers manage assessment questions" on public.assessment_questions;
create policy "Teachers manage assessment questions"
  on public.assessment_questions for all
  using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_questions.assessment_id
        and public.is_classroom_teacher(a.classroom_id)
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_questions.assessment_id
        and public.is_classroom_teacher(a.classroom_id)
    )
  );

drop policy if exists "Teachers manage assessment assignments" on public.assessment_assignments;
create policy "Teachers manage assessment assignments"
  on public.assessment_assignments for all
  using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_assignments.assessment_id
        and public.is_classroom_teacher(a.classroom_id)
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_assignments.assessment_id
        and public.is_classroom_teacher(a.classroom_id)
    )
  );

-- A student may see that they personally are assigned, and nothing about who
-- else is.
drop policy if exists "Students read own assessment assignments" on public.assessment_assignments;
create policy "Students read own assessment assignments"
  on public.assessment_assignments for select
  using (
    exists (
      select 1 from public.classroom_members cm
      where cm.id = assessment_assignments.classroom_member_id
        and cm.student_user_id = auth.uid()
    )
  );
