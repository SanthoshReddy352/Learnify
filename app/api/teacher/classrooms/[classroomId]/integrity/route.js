import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTeacher } from '@/lib/classrooms/auth'
import { getTeacherClassroomDetail } from '@/lib/classrooms/queries'
import { fetchClassroomAttempts, rankAttemptsForReview } from '@/lib/assessment/teacher-review'
import { attemptReviewRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Classroom exam-integrity review queue (Plan P10.4).
//
// GET  → graded exam attempts for this classroom's courses, ordered by how much
//        they merit a look, with plain-language descriptions of each advisory
//        flag. No verdicts: the teacher decides.
// POST → record the teacher's decision on one attempt.
export async function GET(_request, context) {
  try {
    const { classroomId } = await context.params
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)

    // Ownership of the classroom is enforced here (throws 'Classroom not found'
    // for someone else's classroom).
    const detail = await getTeacherClassroomDetail(supabase, classroomId, user.id)

    const subjectIds = (detail.courses || []).map((c) => c.subject_id).filter(Boolean)
    const activeMembers = (detail.members || []).filter((m) => m.status === 'active')
    const studentIds = activeMembers.map((m) => m.student_user_id).filter(Boolean)

    if (subjectIds.length === 0 || studentIds.length === 0) {
      return NextResponse.json({ attempts: [], reviews: [] })
    }

    const admin = createAdminClient()
    const reader = admin || supabase

    let attempts = []
    try {
      attempts = await fetchClassroomAttempts(reader, { subjectIds, studentIds })
    } catch (readError) {
      // Tables land in P14 — an empty queue is the honest answer, not a 500.
      console.warn('Integrity queue unavailable:', readError.message)
      return NextResponse.json({ attempts: [], reviews: [], available: false })
    }

    // Names + existing decisions, for display.
    const [{ data: profiles }, { data: reviews }] = await Promise.all([
      // `profiles` has no email column — same name fallback as the rest of the
      // classroom queries (full_name → username → "Student").
      reader.from('profiles').select('id, full_name, username').in('id', studentIds),
      reader
        .from('attempt_reviews')
        .select('attempt_id, decision, note, created_at')
        .in('attempt_id', attempts.map((a) => a.id).length > 0 ? attempts.map((a) => a.id) : ['00000000-0000-0000-0000-000000000000'])
    ])

    const nameById = new Map(
      (profiles || []).map((p) => [p.id, p.full_name || p.username || 'Student'])
    )
    const subjectById = new Map(
      (detail.courses || []).map((c) => [c.subject_id, c.subjects?.title || 'Course'])
    )
    const reviewByAttempt = new Map((reviews || []).map((r) => [r.attempt_id, r]))

    const ranked = rankAttemptsForReview(attempts).map((a) => ({
      attemptId: a.id,
      studentName: nameById.get(a.user_id) || 'Student',
      subjectTitle: subjectById.get(a.subject_id) || 'Course',
      score: a.score,
      passed: a.passed,
      submittedAt: a.submitted_at,
      level: a.level,
      severity: a.severity,
      flags: a.flagDescriptions,
      review: reviewByAttempt.get(a.id) || null
    }))

    return NextResponse.json({ available: true, attempts: ranked })
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized'
      ? 403
      : error.message === 'Classroom not found'
        ? 404
        : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}

export async function POST(request, context) {
  try {
    const { classroomId } = await context.params
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)

    // Confirms this teacher owns the classroom before anything is written.
    await getTeacherClassroomDetail(supabase, classroomId, user.id)

    const parsed = parseOr400(attemptReviewRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { attemptId, decision, note } = parsed.data

    // Written through the TEACHER'S client on purpose: the RLS policy on
    // attempt_reviews re-checks that they teach a course covering this attempt's
    // subject and that they are recording it as themselves. Using the admin
    // client here would silently drop that second check.
    const { error } = await supabase
      .from('attempt_reviews')
      .upsert(
        { attempt_id: attemptId, reviewer_user_id: user.id, decision, note },
        { onConflict: 'attempt_id,reviewer_user_id' }
      )
    if (error) {
      console.error('Failed to record attempt review:', error)
      return NextResponse.json({ error: 'Could not record the review' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized'
      ? 403
      : error.message === 'Classroom not found'
        ? 404
        : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}
