-- Fix classroom course content access for classroom members.
-- Apply this if add_classroom_feature.sql was already run before the latest changes.

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
