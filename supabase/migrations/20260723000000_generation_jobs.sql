-- generation_jobs: async generation backbone (Plan P5).
--
-- Long-running AI generation (topic content today; curriculum/flashcards/
-- assessment later) runs off the request path in an Inngest worker. The client
-- tracks progress via Supabase Realtime on this table. The worker writes with
-- the service-role key (bypasses RLS); users only ever read/insert their own.

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('topic_content', 'curriculum', 'flashcards', 'assessment')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  stage text,                                   -- e.g. "Writing the lesson"
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists generation_jobs_user_id_idx on public.generation_jobs (user_id);
create index if not exists generation_jobs_status_idx on public.generation_jobs (status);
create index if not exists generation_jobs_topic_id_idx on public.generation_jobs (topic_id);

-- Reuse the existing shared trigger (search_path pinned in Phase 0.6).
drop trigger if exists set_generation_jobs_updated_at on public.generation_jobs;
create trigger set_generation_jobs_updated_at
  before update on public.generation_jobs
  for each row execute function public.update_updated_at_column();

alter table public.generation_jobs enable row level security;

-- Owner-only reads + inserts. Status/progress UPDATEs are performed by the
-- worker via the service-role key, which bypasses RLS — so no UPDATE policy is
-- granted to end users (they must not be able to forge job state).
drop policy if exists "Users read own generation jobs" on public.generation_jobs;
create policy "Users read own generation jobs"
  on public.generation_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "Users create own generation jobs" on public.generation_jobs;
create policy "Users create own generation jobs"
  on public.generation_jobs for insert
  with check (auth.uid() = user_id);

-- Realtime: clients subscribe to their own job rows for live progress.
alter publication supabase_realtime add table public.generation_jobs;
