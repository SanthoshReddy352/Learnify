import { createAdminClient } from '@/lib/supabase/admin'

export async function resolveTopicAccess(supabase, { userId, topicId, classroomId = null, classroomCourseId = null }) {
  const { data: ownedTopic, error: ownedTopicError } = await supabase
    .from('topics')
    .select(`
      id,
      title,
      description,
      difficulty,
      content,
      flashcards,
      subject_id,
      subjects!inner (
        id,
        title,
        description,
        syllabus,
        user_id
      )
    `)
    .eq('id', topicId)
    .eq('subjects.user_id', userId)
    .maybeSingle()

  if (ownedTopicError) {
    throw new Error(ownedTopicError.message)
  }

  if (ownedTopic) {
    return {
      topic: ownedTopic,
      subject: ownedTopic.subjects,
      mode: 'owner',
      adminClient: createAdminClient()
    }
  }

  if (!classroomId || !classroomCourseId) {
    throw new Error('Topic not found or access denied')
  }

  const { data: membership, error: membershipError } = await supabase
    .from('classroom_members')
    .select('id')
    .eq('classroom_id', classroomId)
    .eq('student_user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    throw new Error(membershipError.message)
  }

  if (!membership) {
    throw new Error('Topic not found or access denied')
  }

  const adminClient = createAdminClient()
  const reader = adminClient || supabase

  const { data: classroomCourse, error: classroomCourseError } = await reader
    .from('classroom_courses')
    .select(`
      id,
      classroom_id,
      subject_id,
      subjects (
        id,
        title,
        description,
        syllabus,
        user_id
      )
    `)
    .eq('id', classroomCourseId)
    .eq('classroom_id', classroomId)
    .single()

  if (classroomCourseError || !classroomCourse) {
    throw new Error('Classroom course not found')
  }

  const { data: topic, error: classroomTopicError } = await reader
    .from('topics')
    .select('id, title, description, difficulty, content, flashcards, subject_id')
    .eq('id', topicId)
    .eq('subject_id', classroomCourse.subject_id)
    .maybeSingle()

  if (classroomTopicError) {
    throw new Error(classroomTopicError.message)
  }

  if (!topic) {
    throw new Error('Topic not found in classroom course')
  }

  const { data: progressRow, error: progressError } = await reader
    .from('student_topic_progress')
    .select('status')
    .eq('classroom_id', classroomId)
    .eq('classroom_course_id', classroomCourseId)
    .eq('student_user_id', userId)
    .eq('topic_id', topicId)
    .maybeSingle()

  if (progressError) {
    throw new Error(progressError.message)
  }

  if (!progressRow || progressRow.status === 'locked') {
    throw new Error('Topic is locked')
  }

  return {
    topic,
    subject: classroomCourse.subjects,
    mode: 'classroom',
    adminClient,
    progressStatus: progressRow.status
  }
}
