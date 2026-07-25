-- certificates: verifiable completion records (Plan P9.5).
--
-- Held back until P10 existed, on purpose. A certificate is a claim made to a
-- third party who was not there, so it may only be issued off evidence the
-- server produced: a graded exam (P9.4) and, where nobody was invigilating —
-- a self-paced subject — a passed viva (P10.5) as well.
--
-- DEPENDS ON 20260723000400_assessment.sql and 20260723000500_assessment_integrity.sql.

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  -- Human-transcribable public identifier (LRN-XXXX-XXXX-XXXX, Crockford base32
  -- so it survives being read off a printed page). This is the only handle the
  -- verification endpoint accepts, and it is high-entropy precisely so that the
  -- endpoint cannot be enumerated.
  serial text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- One certificate per passing attempt. The unique constraint is the whole
  -- anti-duplication mechanism — a retry of the issue endpoint returns the
  -- existing certificate instead of minting a second one for the same exam.
  attempt_id uuid not null unique references public.assessment_attempts(id) on delete cascade,
  mode text not null check (mode in ('classroom', 'self_paced')),
  score numeric(5,2) not null,
  -- Frozen display values (learner name, subject title, concepts assessed). A
  -- subject renamed later must not silently rewrite an issued certificate.
  snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists certificates_user_idx
  on public.certificates (user_id, issued_at desc);
create index if not exists certificates_subject_idx
  on public.certificates (subject_id);

drop trigger if exists set_certificates_updated_at on public.certificates;
create trigger set_certificates_updated_at
  before update on public.certificates
  for each row execute function public.update_updated_at_column();

alter table public.certificates enable row level security;

-- READ-ONLY to end users, like assessment_attempts and generation_jobs. Issuing
-- is a service-role write behind /api/certificates/issue, which re-checks
-- eligibility. A certificate a learner could INSERT would certify nothing.
drop policy if exists "Users read own certificates" on public.certificates;
create policy "Users read own certificates"
  on public.certificates for select
  using (auth.uid() = user_id);

-- A teacher can see certificates earned in a subject they teach.
drop policy if exists "Teachers read course certificates" on public.certificates;
create policy "Teachers read course certificates"
  on public.certificates for select
  using (
    exists (
      select 1
      from public.classroom_courses
      where classroom_courses.subject_id = certificates.subject_id
        and public.is_classroom_teacher(classroom_courses.classroom_id)
    )
  );

-- Public verification.
--
-- Deliberately a SECURITY DEFINER FUNCTION keyed on the serial, not a view
-- granted to anon. A view would let anyone SELECT * and walk out with every
-- learner's name and subject; a function that returns at most the single row
-- whose serial you already know cannot be enumerated. It returns only what a
-- verifier needs and nothing that identifies the holder beyond the name they
-- already put on the certificate — no user id, no email, no attempt detail.
create or replace function public.verify_certificate(p_serial text)
returns table (
  serial text,
  learner_name text,
  subject_title text,
  score numeric,
  mode text,
  concepts jsonb,
  issued_at timestamptz,
  revoked boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.serial,
    coalesce(c.snapshot->>'learner_name', 'Learner') as learner_name,
    coalesce(c.snapshot->>'subject_title', 'Subject') as subject_title,
    c.score,
    c.mode,
    coalesce(c.snapshot->'concepts', '[]'::jsonb) as concepts,
    c.issued_at,
    (c.revoked_at is not null) as revoked
  from public.certificates c
  where c.serial = upper(trim(p_serial))
  limit 1;
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
