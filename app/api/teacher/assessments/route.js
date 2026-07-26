import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/classrooms/auth'
import { listAssessments, createAssessment } from '@/lib/assessment/authoring-store'
import { createAssessmentSchema, parseOr400 } from '@/lib/validation/schemas'

// Cookie-backed and per-teacher; nothing here is prerenderable.
export const dynamic = 'force-dynamic'

// List / create teacher-authored assessment papers.
//
// Both operations run on the CALLER'S client, so RLS decides which classrooms
// they may touch. requireTeacher is the coarse gate (is this account a teacher
// at all); RLS is the real one (do they teach THIS classroom). Neither alone is
// sufficient — a teacher account must not be able to write a paper into someone
// else's classroom.
export async function GET(request) {
  try {
    const supabase = await createClient()
    await requireTeacher(supabase)

    const classroomId = new URL(request.url).searchParams.get('classroomId')
    if (!classroomId) {
      return NextResponse.json({ error: 'classroomId is required' }, { status: 400 })
    }

    return NextResponse.json({ assessments: await listAssessments(supabase, { classroomId }) })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: statusFor(error) })
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)

    const parsed = parseOr400(createAssessmentSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { classroomId, subjectId, ...settings } = parsed.data

    const assessment = await createAssessment(supabase, {
      userId: user.id,
      classroomId,
      subjectId,
      settings
    })

    return NextResponse.json({ assessment }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: statusFor(error) })
  }
}

function statusFor(error) {
  if (error.message === 'Teacher access required' || error.message === 'Unauthorized') return 403
  if (error.message === 'Assessment not found') return 404
  return 400
}
