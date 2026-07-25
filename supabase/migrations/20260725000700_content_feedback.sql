-- content_feedback: the learner-facing half of P6.6 verification.
--
-- P6.6 already runs an automated pass (`verifyContentAgainstSources`) that logs
-- unsupported claims. The missing half was the human one: a learner who spots
-- something wrong in a generated lesson had nowhere to say so, which is the
-- cheapest and highest-signal correction channel a generated-content product
-- has. This table is that channel.
--
-- Deliberately NOT a moderation queue. A report is a note attached to a topic,
-- readable by the person who owns the subject (the learner themselves in a
-- self-paced subject, the teacher in a classroom one), so the fix loop is
-- "regenerate this topic", not "wait for a central reviewer" — nobody is staffed
-- to be that reviewer on a free platform.

create table if not exists public.content_feedback (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- What kind of problem, so reports can be triaged without reading every note.
  reason text not null check (reason in (
    'inaccurate', 'outdated', 'confusing', 'incomplete', 'broken_diagram', 'bad_reference', 'other'
  )),
  -- The passage the learner was looking at. Capped in the API too; the check is
  -- here so the constraint survives a future caller that forgets.
  quoted_text text check (quoted_text is null or char_length(quoted_text) <= 2000),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'fixed', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_feedback_topic_idx
  on public.content_feedback (topic_id, status);
create index if not exists content_feedback_user_idx
  on public.content_feedback (user_id, created_at desc);

drop trigger if exists set_content_feedback_updated_at on public.content_feedback;
create trigger set_content_feedback_updated_at
  before update on public.content_feedback
  for each row execute function public.update_updated_at_column();

alter table public.content_feedback enable row level security;

-- A learner may file a report on a topic, attributed to themselves.
drop policy if exists "Users report content" on public.content_feedback;
create policy "Users report content"
  on public.content_feedback for insert
  with check (auth.uid() = user_id);

-- Readable by the reporter and by whoever owns the subject the topic belongs to
-- — the person who can actually act on it by regenerating the lesson.
drop policy if exists "Reporter and subject owner read feedback" on public.content_feedback;
create policy "Reporter and subject owner read feedback"
  on public.content_feedback for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.topics t
      join public.subjects s on s.id = t.subject_id
      where t.id = content_feedback.topic_id
        and s.user_id = auth.uid()
    )
  );

-- Only the subject owner resolves a report. The reporter deliberately cannot
-- edit their own row after filing: a report is a record of what someone saw at
-- a point in time, and a mutable one is worth less than none.
drop policy if exists "Subject owner resolves feedback" on public.content_feedback;
create policy "Subject owner resolves feedback"
  on public.content_feedback for update
  using (
    exists (
      select 1
      from public.topics t
      join public.subjects s on s.id = t.subject_id
      where t.id = content_feedback.topic_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.topics t
      join public.subjects s on s.id = t.subject_id
      where t.id = content_feedback.topic_id
        and s.user_id = auth.uid()
    )
  );
