-- Fix recursive RLS evaluation for classroom helpers.
-- Apply this if add_classroom_feature.sql has already been executed.

CREATE OR REPLACE FUNCTION public.auth_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_role_allowlist
    WHERE email = public.auth_email()
      AND role = 'teacher'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_classroom_teacher(classroom_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classrooms
    WHERE id = classroom_uuid
      AND teacher_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_classroom_student(classroom_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classroom_members
    WHERE classroom_id = classroom_uuid
      AND student_user_id = auth.uid()
      AND status = 'active'
  );
$$;

DROP POLICY IF EXISTS "Invitees can view pending classrooms" ON public.classrooms;
CREATE POLICY "Invitees can view pending classrooms"
  ON public.classrooms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_invites
      WHERE classroom_id = id
        AND lower(email) = public.auth_email()
        AND status = 'pending'
        AND expires_at > NOW()
    )
  );
