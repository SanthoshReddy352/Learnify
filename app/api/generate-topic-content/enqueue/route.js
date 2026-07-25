import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveTopicAccess } from '@/lib/classrooms/access'
import { enqueueTopicContentJob } from '@/lib/jobs/enqueue'
import { generateTopicContentRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Async variant of generate-topic-content (Plan P5): verifies access, enqueues
// a background job, and returns a jobId immediately. The client subscribes to
// the `generation_jobs` row via Supabase Realtime for progress + completion.
// The synchronous ../route.js is kept for back-compat.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = parseOr400(generateTopicContentRequestSchema, await request.json())
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const {
      topicId,
      subjectTitle,
      topicTitle,
      topicDescription,
      difficulty = 5,
      classroomId,
      classroomCourseId
    } = parsed.data

    // Fail fast: verify the user can actually access this topic before enqueuing
    // (so we never queue work for an unauthorized topic).
    const topicAccess = await resolveTopicAccess(supabase, {
      userId: user.id,
      topicId,
      classroomId,
      classroomCourseId
    })
    if (topicAccess.mode === 'classroom' && !topicAccess.adminClient) {
      return NextResponse.json({
        error: 'Classroom content generation requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }

    const { jobId } = await enqueueTopicContentJob(supabase, {
      userId: user.id,
      input: {
        topicId,
        subjectId: topicAccess.topic?.subject_id || topicAccess.subject?.id,
        subjectTitle,
        topicTitle,
        topicDescription,
        difficulty,
        classroomId,
        classroomCourseId
      }
    })

    return NextResponse.json({ success: true, jobId }, { status: 202 })
  } catch (error) {
    console.error('Error enqueuing topic content job:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 })
  }
}
