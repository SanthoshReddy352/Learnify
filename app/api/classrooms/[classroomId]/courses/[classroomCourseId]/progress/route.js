import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/classrooms/auth'
import {
  completeClassroomLearning,
  logClassroomStudyActivity,
  saveClassroomTopicNotes,
  startClassroomLearningSession,
  submitClassroomReview
} from '@/lib/classrooms/progress'

export async function POST(request, { params }) {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser(supabase)
    const body = await request.json()
    const payload = {
      classroomId: params.classroomId,
      classroomCourseId: params.classroomCourseId,
      studentUserId: user.id,
      topicId: body.topicId,
      durationMinutes: body.durationMinutes || 0
    }

    if (!payload.topicId) {
      return NextResponse.json({ error: 'topicId is required' }, { status: 400 })
    }

    if (body.action === 'start') {
      const result = await startClassroomLearningSession(supabase, payload)
      return NextResponse.json(result)
    }

    if (body.action === 'complete') {
      const result = await completeClassroomLearning(supabase, payload)
      return NextResponse.json(result)
    }

    if (body.action === 'review') {
      const quality = Number(body.quality)
      if (!Number.isFinite(quality) || quality < 0 || quality > 5) {
        return NextResponse.json({ error: 'quality must be between 0 and 5' }, { status: 400 })
      }

      const result = await submitClassroomReview(supabase, {
        ...payload,
        quality
      })
      return NextResponse.json(result)
    }

    if (body.action === 'log') {
      const result = await logClassroomStudyActivity(supabase, payload)
      return NextResponse.json(result)
    }

    if (body.action === 'save-notes') {
      const result = await saveClassroomTopicNotes(supabase, {
        ...payload,
        notes: typeof body.notes === 'string' ? body.notes : ''
      })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
}
