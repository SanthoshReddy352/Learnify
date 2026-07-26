-- Fix: "infinite recursion detected in policy for relation assessments" (42P17).
--
-- WHAT WENT WRONG in 20260726000000_teacher_authored_assessments.sql:
--
--   assessments."Students read assigned published assessments"
--     -> subqueries assessment_assignments
--   assessment_assignments."Teachers manage assessment assignments"
--     -> subqueries assessments
--
-- Two tables whose policies each read the other is a cycle, and Postgres
-- detects it and aborts. It bit EVERY caller, not just students: RLS evaluates
-- all permissive SELECT policies for a role, so the student policy ran on a
-- teacher's query too and the whole assessments feature was unreachable.
--
-- THE FIX, and why it is the same shape the rest of this schema already uses:
-- move each cross-table lookup into a SECURITY DEFINER function. The function
-- runs as its owner, so the inner read does not re-enter RLS, and the cycle is
-- broken at both ends. This is exactly what is_classroom_teacher() and
-- is_classroom_student() already do for the classroom tables.
--
-- Neither function widens access:
--   * assessment_visible_to_student answers only about auth.uid(), so it can
--     never reveal another student's assignment.
--   * teaches_assessment defers to is_classroom_teacher, which is itself scoped
--     to auth.uid().
-- EXECUTE is revoked from anon on both — they are policy helpers, not API.

-- Is this paper assigned to the CALLER?
-- No assignment rows at all means "the whole class", which is the common case.
create or replace function public.assessment_visible_to_student(p_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.assessment_assignments aa
      where aa.assessment_id = p_assessment_id
    )
    or exists (
      select 1
      from public.assessment_assignments aa
      join public.classroom_members cm on cm.id = aa.classroom_member_id
      where aa.assessment_id = p_assessment_id
        and cm.student_user_id = auth.uid()
    );
$$;

-- Does the CALLER teach the classroom this paper belongs to?
create or replace function public.teaches_assessment(p_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment_id
      and public.is_classroom_teacher(a.classroom_id)
  );
$$;

revoke execute on function public.assessment_visible_to_student(uuid) from anon;
revoke execute on function public.teaches_assessment(uuid) from anon;
grant execute on function public.assessment_visible_to_student(uuid) to authenticated;
grant execute on function public.teaches_assessment(uuid) to authenticated;

-- Rewrite the four policies that formed (or could later form) the cycle.

drop policy if exists "Students read assigned published assessments" on public.assessments;
create policy "Students read assigned published assessments"
  on public.assessments for select
  using (
    status in ('published', 'closed')
    and public.is_classroom_student(classroom_id)
    and public.assessment_visible_to_student(id)
  );

-- assessment_questions did not recurse today, but it referenced assessments the
-- same way. Routing it through the helper too means a future policy on
-- assessments cannot quietly recreate the cycle.
drop policy if exists "Teachers manage assessment questions" on public.assessment_questions;
create policy "Teachers manage assessment questions"
  on public.assessment_questions for all
  using (public.teaches_assessment(assessment_id))
  with check (public.teaches_assessment(assessment_id));

drop policy if exists "Teachers manage assessment assignments" on public.assessment_assignments;
create policy "Teachers manage assessment assignments"
  on public.assessment_assignments for all
  using (public.teaches_assessment(assessment_id))
  with check (public.teaches_assessment(assessment_id));

-- Unchanged in substance: this one only reads classroom_members, which has no
-- policy pointing back at assessments, so it was never part of the cycle.
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
