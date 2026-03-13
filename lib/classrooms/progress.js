import { calculateNextReviewDate, calculateSM2 } from '@/lib/sm2'

async function getCourseGraph(supabase, classroomId, classroomCourseId) {
  const { data: classroomCourse, error: classroomCourseError } = await supabase
    .from('classroom_courses')
    .select(`
      id,
      classroom_id,
      subject_id,
      order_index,
      published_at,
      subjects (
        id,
        title,
        description,
        cheat_sheet
      )
    `)
    .eq('id', classroomCourseId)
    .eq('classroom_id', classroomId)
    .single()

  if (classroomCourseError || !classroomCourse) {
    throw new Error('Classroom course not found')
  }

  const { data: topics, error: topicError } = await supabase
    .from('topics')
    .select('id, title, description, content, flashcards, estimated_minutes, difficulty, created_at')
    .eq('subject_id', classroomCourse.subject_id)
    .order('created_at', { ascending: true })

  if (topicError) {
    throw new Error(topicError.message)
  }

  const { data: dependencies, error: dependencyError } = await supabase
    .from('topic_dependencies')
    .select('id, topic_id, depends_on_topic_id')
    .eq('subject_id', classroomCourse.subject_id)

  if (dependencyError) {
    throw new Error(dependencyError.message)
  }

  return {
    classroomCourse,
    topics: topics || [],
    dependencies: dependencies || []
  }
}

async function getProgressMap(supabase, classroomCourseId, studentUserId) {
  const { data, error } = await supabase
    .from('student_topic_progress')
    .select('*')
    .eq('classroom_course_id', classroomCourseId)
    .eq('student_user_id', studentUserId)

  if (error) {
    throw new Error(error.message)
  }

  const progressMap = new Map()
  ;(data || []).forEach((row) => {
    progressMap.set(row.topic_id, row)
  })

  return progressMap
}

async function seedMissingProgress(supabase, { classroomId, classroomCourseId, studentUserId, topics }) {
  const progressMap = await getProgressMap(supabase, classroomCourseId, studentUserId)
  const missingRows = topics
    .filter((topic) => !progressMap.has(topic.id))
    .map((topic) => ({
      classroom_id: classroomId,
      classroom_course_id: classroomCourseId,
      student_user_id: studentUserId,
      topic_id: topic.id,
      status: 'locked'
    }))

  if (missingRows.length > 0) {
    const { error } = await supabase
      .from('student_topic_progress')
      .insert(missingRows)

    if (error) {
      throw new Error(error.message)
    }
  }

  return getProgressMap(supabase, classroomCourseId, studentUserId)
}

async function recomputeUnlockedStatuses(supabase, { classroomId, classroomCourseId, studentUserId, topics, dependencies }) {
  const progressMap = await seedMissingProgress(supabase, {
    classroomId,
    classroomCourseId,
    studentUserId,
    topics
  })

  const prerequisiteMap = new Map()
  topics.forEach((topic) => {
    prerequisiteMap.set(topic.id, [])
  })

  dependencies.forEach((dependency) => {
    const list = prerequisiteMap.get(dependency.topic_id) || []
    list.push(dependency.depends_on_topic_id)
    prerequisiteMap.set(dependency.topic_id, list)
  })

  const updates = []

  for (const topic of topics) {
    const progress = progressMap.get(topic.id)

    if (!progress) {
      continue
    }

    if (progress.status === 'reviewing' || progress.status === 'mastered') {
      continue
    }

    const prereqIds = prerequisiteMap.get(topic.id) || []
    const allMet = prereqIds.every((prereqId) => {
      const prereq = progressMap.get(prereqId)
      return prereq && (prereq.status === 'reviewing' || prereq.status === 'mastered')
    })

    const nextStatus = prereqIds.length === 0 || allMet ? 'available' : 'locked'

    // Preserve active learning sessions while prerequisites are still satisfied.
    if (progress.status === 'learning' && nextStatus === 'available') {
      continue
    }

    if (progress.status !== nextStatus) {
      updates.push({
        id: progress.id,
        status: nextStatus
      })
      progressMap.set(topic.id, {
        ...progress,
        status: nextStatus
      })
    }
  }

  for (const update of updates) {
    const { error } = await supabase
      .from('student_topic_progress')
      .update({ status: update.status })
      .eq('id', update.id)

    if (error) {
      throw new Error(error.message)
    }
  }

  return getProgressMap(supabase, classroomCourseId, studentUserId)
}

function buildPrerequisiteMap(topics, dependencies) {
  const prerequisiteMap = new Map()

  topics.forEach((topic) => {
    prerequisiteMap.set(topic.id, [])
  })

  dependencies.forEach((dependency) => {
    const list = prerequisiteMap.get(dependency.topic_id) || []
    list.push(dependency.depends_on_topic_id)
    prerequisiteMap.set(dependency.topic_id, list)
  })

  return prerequisiteMap
}

export async function getStudentCourseSnapshot(supabase, { classroomId, classroomCourseId, studentUserId }) {
  const { classroomCourse, topics, dependencies } = await getCourseGraph(supabase, classroomId, classroomCourseId)
  const progressMap = await recomputeUnlockedStatuses(supabase, {
    classroomId,
    classroomCourseId,
    studentUserId,
    topics,
    dependencies
  })
  const prerequisiteMap = buildPrerequisiteMap(topics, dependencies)
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]))

  return {
    classroomCourse,
    dependencies,
    topics: topics.map((topic) => ({
      ...topic,
      content: (progressMap.get(topic.id)?.status || 'locked') === 'locked' ? null : topic.content,
      flashcards: (progressMap.get(topic.id)?.status || 'locked') === 'locked' ? null : topic.flashcards,
      hasContent: Boolean(topic.content),
      hasFlashcards: Array.isArray(topic.flashcards) && topic.flashcards.length > 0,
      progress: progressMap.get(topic.id) || null,
      prerequisites: (prerequisiteMap.get(topic.id) || [])
        .map((prerequisiteId) => topicMap.get(prerequisiteId))
        .filter(Boolean)
        .map((prerequisiteTopic) => ({
          id: prerequisiteTopic.id,
          title: prerequisiteTopic.title,
          status: progressMap.get(prerequisiteTopic.id)?.status || 'locked'
        })),
      blockedBy: (prerequisiteMap.get(topic.id) || [])
        .map((prerequisiteId) => topicMap.get(prerequisiteId))
        .filter(Boolean)
        .filter((prerequisiteTopic) => {
          const prerequisiteProgress = progressMap.get(prerequisiteTopic.id)
          return !prerequisiteProgress || (prerequisiteProgress.status !== 'reviewing' && prerequisiteProgress.status !== 'mastered')
        })
        .map((prerequisiteTopic) => ({
          id: prerequisiteTopic.id,
          title: prerequisiteTopic.title,
          status: progressMap.get(prerequisiteTopic.id)?.status || 'locked'
        }))
    }))
  }
}

export async function startClassroomLearningSession(supabase, { classroomId, classroomCourseId, studentUserId, topicId }) {
  const snapshot = await getStudentCourseSnapshot(supabase, { classroomId, classroomCourseId, studentUserId })
  const topic = snapshot.topics.find((entry) => entry.id === topicId)

  if (!topic || !topic.progress) {
    throw new Error('Topic not found')
  }

  if (topic.progress.status === 'locked') {
    throw new Error('Topic is locked')
  }

  if (topic.progress.status === 'reviewing' || topic.progress.status === 'mastered') {
    return { success: true, status: topic.progress.status }
  }

  const { error } = await supabase
    .from('student_topic_progress')
    .update({
      status: 'learning',
      first_started_at: topic.progress.first_started_at || new Date().toISOString()
    })
    .eq('id', topic.progress.id)

  if (error) {
    throw new Error(error.message)
  }

  return { success: true, status: 'learning' }
}

export async function completeClassroomLearning(supabase, { classroomId, classroomCourseId, studentUserId, topicId, durationMinutes = 0 }) {
  const { classroomCourse, topics } = await getStudentCourseSnapshot(supabase, { classroomId, classroomCourseId, studentUserId })
  const topic = topics.find((entry) => entry.id === topicId)

  if (!topic || !topic.progress) {
    throw new Error('Topic not found')
  }

  if (topic.progress.status === 'locked') {
    throw new Error('Topic is locked')
  }

  if (topic.progress.status !== 'learning') {
    throw new Error('Start learning before marking this topic complete')
  }

  const nextReviewDate = calculateNextReviewDate(1)

  const { error: updateError } = await supabase
    .from('student_topic_progress')
    .update({
      status: 'reviewing',
      interval_days: 1,
      repetition_count: 0,
      difficulty_factor: 2.5,
      next_review_at: nextReviewDate,
      completed_at: new Date().toISOString(),
      first_started_at: topic.progress.first_started_at || new Date().toISOString()
    })
    .eq('id', topic.progress.id)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const { error: logError } = await supabase
    .from('study_logs')
    .insert({
      user_id: studentUserId,
      topic_id: topicId,
      subject_id: classroomCourse.subject_id,
      classroom_id: classroomId,
      classroom_course_id: classroomCourseId,
      session_type: 'learning',
      duration_minutes: Math.max(0, Math.round(durationMinutes)),
      quality_rating: null,
      source_type: 'classroom'
    })

  if (logError) {
    throw new Error(logError.message)
  }

  await getStudentCourseSnapshot(supabase, { classroomId, classroomCourseId, studentUserId })

  return {
    success: true,
    nextReviewDate
  }
}

export async function submitClassroomReview(supabase, { classroomId, classroomCourseId, studentUserId, topicId, quality, durationMinutes = 0 }) {
  const { classroomCourse, topics } = await getStudentCourseSnapshot(supabase, { classroomId, classroomCourseId, studentUserId })
  const topic = topics.find((entry) => entry.id === topicId)

  if (!topic || !topic.progress) {
    throw new Error('Topic not found')
  }

  if (topic.progress.status === 'locked') {
    throw new Error('Topic is locked')
  }

  if (topic.progress.status !== 'reviewing' && topic.progress.status !== 'mastered') {
    throw new Error('Complete the learning phase before reviewing this topic')
  }

  const result = calculateSM2(
    quality,
    topic.progress.interval_days || 0,
    topic.progress.repetition_count || 0,
    topic.progress.difficulty_factor || 2.5
  )

  const nextReviewDate = calculateNextReviewDate(result.interval)
  const newStatus = result.repetition >= 3 && quality >= 4 ? 'mastered' : 'reviewing'

  const { error: updateError } = await supabase
    .from('student_topic_progress')
    .update({
      status: newStatus,
      interval_days: result.interval,
      repetition_count: result.repetition,
      difficulty_factor: result.efactor,
      next_review_at: nextReviewDate
    })
    .eq('id', topic.progress.id)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const { error: logError } = await supabase
    .from('study_logs')
    .insert({
      user_id: studentUserId,
      topic_id: topicId,
      subject_id: classroomCourse.subject_id,
      classroom_id: classroomId,
      classroom_course_id: classroomCourseId,
      session_type: 'review',
      duration_minutes: Math.max(0, Math.round(durationMinutes)),
      quality_rating: quality,
      source_type: 'classroom'
    })

  if (logError) {
    throw new Error(logError.message)
  }

  await getStudentCourseSnapshot(supabase, { classroomId, classroomCourseId, studentUserId })

  return {
    success: true,
    nextReviewDate,
    newStatus,
    interval: result.interval
  }
}

export async function logClassroomStudyActivity(supabase, { classroomId, classroomCourseId, studentUserId, topicId, durationMinutes = 0 }) {
  if (durationMinutes < 0.1) {
    return { success: true, ignored: true }
  }

  const { classroomCourse, topics } = await getStudentCourseSnapshot(supabase, { classroomId, classroomCourseId, studentUserId })
  const topic = topics.find((entry) => entry.id === topicId)

  if (!topic || !topic.progress) {
    throw new Error('Topic not found')
  }

  if (topic.progress.status === 'locked') {
    throw new Error('Topic is locked')
  }

  const { error: logError } = await supabase
    .from('study_logs')
    .insert({
      user_id: studentUserId,
      topic_id: topicId,
      subject_id: classroomCourse.subject_id,
      classroom_id: classroomId,
      classroom_course_id: classroomCourseId,
      session_type: 'learning',
      duration_minutes: Math.ceil(durationMinutes),
      quality_rating: null,
      source_type: 'classroom'
    })

  if (logError) {
    throw new Error(logError.message)
  }

  return { success: true }
}

export async function saveClassroomTopicNotes(supabase, { classroomId, classroomCourseId, studentUserId, topicId, notes }) {
  const { topics } = await getStudentCourseSnapshot(supabase, { classroomId, classroomCourseId, studentUserId })
  const topic = topics.find((entry) => entry.id === topicId)

  if (!topic || !topic.progress) {
    throw new Error('Topic not found')
  }

  if (topic.progress.status === 'locked') {
    throw new Error('Topic is locked')
  }

  const { error } = await supabase
    .from('student_topic_progress')
    .update({
      notes: notes || ''
    })
    .eq('id', topic.progress.id)

  if (error) {
    throw new Error(error.message)
  }

  return { success: true }
}
