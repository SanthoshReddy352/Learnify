-- Classroom feature foundation
-- Apply after the base schema and profile-related migrations.

ALTER TABLE public.subjects
ADD COLUMN IF NOT EXISTS cheat_sheet TEXT;

CREATE TABLE IF NOT EXISTS public.teacher_role_allowlist (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.classrooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  teacher_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.classroom_courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (classroom_id, subject_id)
);

CREATE TABLE IF NOT EXISTS public.classroom_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (classroom_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS public.classroom_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_topic_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  classroom_course_id UUID NOT NULL REFERENCES public.classroom_courses(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'learning', 'reviewing', 'mastered')),
  repetition_count INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 0,
  difficulty_factor DECIMAL(3,2) NOT NULL DEFAULT 2.5,
  next_review_at TIMESTAMPTZ,
  first_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (classroom_course_id, student_user_id, topic_id)
);

ALTER TABLE public.study_logs
ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL;

ALTER TABLE public.study_logs
ADD COLUMN IF NOT EXISTS classroom_course_id UUID REFERENCES public.classroom_courses(id) ON DELETE SET NULL;

ALTER TABLE public.study_logs
ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'personal'
  CHECK (source_type IN ('personal', 'classroom'));

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON public.classrooms(teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_classroom_courses_classroom ON public.classroom_courses(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_members_classroom ON public.classroom_members(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_members_student ON public.classroom_members(student_user_id);
CREATE INDEX IF NOT EXISTS idx_classroom_invites_classroom ON public.classroom_invites(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_invites_email ON public.classroom_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_student_topic_progress_lookup
  ON public.student_topic_progress(classroom_course_id, student_user_id);
CREATE INDEX IF NOT EXISTS idx_student_topic_progress_due
  ON public.student_topic_progress(classroom_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_study_logs_classroom
  ON public.study_logs(classroom_id, classroom_course_id, source_type);

ALTER TABLE public.teacher_role_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_topic_progress ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Teacher can view own allowlist entry" ON public.teacher_role_allowlist;
CREATE POLICY "Teacher can view own allowlist entry"
  ON public.teacher_role_allowlist
  FOR SELECT
  USING (email = public.auth_email());

DROP POLICY IF EXISTS "Teachers can view own classrooms" ON public.classrooms;
CREATE POLICY "Teachers can view own classrooms"
  ON public.classrooms
  FOR SELECT
  USING (teacher_user_id = auth.uid());

DROP POLICY IF EXISTS "Students can view joined classrooms" ON public.classrooms;
CREATE POLICY "Students can view joined classrooms"
  ON public.classrooms
  FOR SELECT
  USING (public.is_classroom_student(id));

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

DROP POLICY IF EXISTS "Users can view classroom subjects" ON public.subjects;
CREATE POLICY "Users can view classroom subjects"
  ON public.subjects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_courses
      WHERE classroom_courses.subject_id = subjects.id
        AND (
          public.is_classroom_teacher(classroom_courses.classroom_id)
          OR public.is_classroom_student(classroom_courses.classroom_id)
        )
    )
  );

DROP POLICY IF EXISTS "Users can view classroom topics" ON public.topics;
CREATE POLICY "Users can view classroom topics"
  ON public.topics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_courses
      WHERE classroom_courses.subject_id = topics.subject_id
        AND (
          public.is_classroom_teacher(classroom_courses.classroom_id)
          OR public.is_classroom_student(classroom_courses.classroom_id)
        )
    )
  );

DROP POLICY IF EXISTS "Users can view classroom dependencies" ON public.topic_dependencies;
CREATE POLICY "Users can view classroom dependencies"
  ON public.topic_dependencies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_courses
      WHERE classroom_courses.subject_id = topic_dependencies.subject_id
        AND (
          public.is_classroom_teacher(classroom_courses.classroom_id)
          OR public.is_classroom_student(classroom_courses.classroom_id)
        )
    )
  );

DROP POLICY IF EXISTS "Teachers can insert classrooms" ON public.classrooms;
CREATE POLICY "Teachers can insert classrooms"
  ON public.classrooms
  FOR INSERT
  WITH CHECK (public.is_teacher() AND teacher_user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can update classrooms" ON public.classrooms;
CREATE POLICY "Teachers can update classrooms"
  ON public.classrooms
  FOR UPDATE
  USING (teacher_user_id = auth.uid())
  WITH CHECK (teacher_user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can delete classrooms" ON public.classrooms;
CREATE POLICY "Teachers can delete classrooms"
  ON public.classrooms
  FOR DELETE
  USING (teacher_user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers and students can view classroom courses" ON public.classroom_courses;
CREATE POLICY "Teachers and students can view classroom courses"
  ON public.classroom_courses
  FOR SELECT
  USING (public.is_classroom_teacher(classroom_id) OR public.is_classroom_student(classroom_id));

DROP POLICY IF EXISTS "Teachers can insert classroom courses" ON public.classroom_courses;
CREATE POLICY "Teachers can insert classroom courses"
  ON public.classroom_courses
  FOR INSERT
  WITH CHECK (public.is_classroom_teacher(classroom_id));

DROP POLICY IF EXISTS "Teachers can update classroom courses" ON public.classroom_courses;
CREATE POLICY "Teachers can update classroom courses"
  ON public.classroom_courses
  FOR UPDATE
  USING (public.is_classroom_teacher(classroom_id))
  WITH CHECK (public.is_classroom_teacher(classroom_id));

DROP POLICY IF EXISTS "Teachers can delete classroom courses" ON public.classroom_courses;
CREATE POLICY "Teachers can delete classroom courses"
  ON public.classroom_courses
  FOR DELETE
  USING (public.is_classroom_teacher(classroom_id));

DROP POLICY IF EXISTS "Teachers can manage classroom members" ON public.classroom_members;
CREATE POLICY "Teachers can manage classroom members"
  ON public.classroom_members
  FOR ALL
  USING (public.is_classroom_teacher(classroom_id))
  WITH CHECK (public.is_classroom_teacher(classroom_id));

DROP POLICY IF EXISTS "Students can view own classroom membership" ON public.classroom_members;
CREATE POLICY "Students can view own classroom membership"
  ON public.classroom_members
  FOR SELECT
  USING (student_user_id = auth.uid());

DROP POLICY IF EXISTS "Students can join invited classrooms" ON public.classroom_members;
CREATE POLICY "Students can join invited classrooms"
  ON public.classroom_members
  FOR INSERT
  WITH CHECK (student_user_id = auth.uid());

DROP POLICY IF EXISTS "Students can activate own membership" ON public.classroom_members;
CREATE POLICY "Students can activate own membership"
  ON public.classroom_members
  FOR UPDATE
  USING (student_user_id = auth.uid())
  WITH CHECK (student_user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can manage classroom invites" ON public.classroom_invites;
CREATE POLICY "Teachers can manage classroom invites"
  ON public.classroom_invites
  FOR ALL
  USING (public.is_classroom_teacher(classroom_id))
  WITH CHECK (public.is_classroom_teacher(classroom_id));

DROP POLICY IF EXISTS "Students can view own invites" ON public.classroom_invites;
CREATE POLICY "Students can view own invites"
  ON public.classroom_invites
  FOR SELECT
  USING (lower(email) = public.auth_email());

DROP POLICY IF EXISTS "Students can accept own invites" ON public.classroom_invites;
CREATE POLICY "Students can accept own invites"
  ON public.classroom_invites
  FOR UPDATE
  USING (lower(email) = public.auth_email())
  WITH CHECK (lower(email) = public.auth_email());

DROP POLICY IF EXISTS "Teachers and students can view classroom progress" ON public.student_topic_progress;
CREATE POLICY "Teachers and students can view classroom progress"
  ON public.student_topic_progress
  FOR SELECT
  USING (
    public.is_classroom_teacher(classroom_id)
    OR (student_user_id = auth.uid() AND public.is_classroom_student(classroom_id))
  );

DROP POLICY IF EXISTS "Students can insert own classroom progress" ON public.student_topic_progress;
CREATE POLICY "Students can insert own classroom progress"
  ON public.student_topic_progress
  FOR INSERT
  WITH CHECK (student_user_id = auth.uid() AND public.is_classroom_student(classroom_id));

DROP POLICY IF EXISTS "Students can update own classroom progress" ON public.student_topic_progress;
CREATE POLICY "Students can update own classroom progress"
  ON public.student_topic_progress
  FOR UPDATE
  USING (student_user_id = auth.uid() AND public.is_classroom_student(classroom_id))
  WITH CHECK (student_user_id = auth.uid() AND public.is_classroom_student(classroom_id));

DROP POLICY IF EXISTS "Teachers can view classroom study logs" ON public.study_logs;
CREATE POLICY "Teachers can view classroom study logs"
  ON public.study_logs
  FOR SELECT
  USING (
    source_type = 'classroom'
    AND classroom_id IS NOT NULL
    AND public.is_classroom_teacher(classroom_id)
  );

DROP TRIGGER IF EXISTS update_classrooms_updated_at ON public.classrooms;
CREATE TRIGGER update_classrooms_updated_at
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_topic_progress_updated_at ON public.student_topic_progress;
CREATE TRIGGER update_student_topic_progress_updated_at
  BEFORE UPDATE ON public.student_topic_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
