import { NextResponse } from 'next/server'
import { requireAssessmentTeacher, assessmentErrorResponse } from '@/lib/assessment/route-helpers'
import { loadAttempts } from '@/lib/assessment/authoring-store'
import { summarizeFlags } from '@/lib/assessment/integrity'

// The results roster for one paper.
//
// Includes every ACTIVE member of the classroom, not just those who submitted —
// "who hasn't sat this yet" is the question a teacher actually opens this page
// to answer, and a list of completed attempts cannot answer it.
export async function GET(request, { params }) {
  try {
    const { supabase, admin, assessment } = await requireAssessmentTeacher(params.assessmentId)

    const [attempts, roster] = await Promise.all([
      loadAttempts(admin, assessment.id),
      loadRoster(supabase, admin, assessment)
    ])

    // Latest attempt per student. A paper may allow several, and the roster
    // shows the most recent — earlier ones stay available through the existing
    // per-attempt review.
    const latest = new Map()
    for (const attempt of attempts) {
      const existing = latest.get(attempt.user_id)
      if (!existing || (attempt.started_at || '') > (existing.started_at || '')) {
        latest.set(attempt.user_id, attempt)
      }
    }

    const rows = roster.map((student) => {
      const attempt = latest.get(student.userId) || null
      return {
        ...student,
        attemptId: attempt?.id || null,
        status: attempt?.status || 'not_started',
        score: attempt?.score ?? null,
        passed: attempt?.passed ?? null,
        submittedAt: attempt?.submitted_at || null,
        // Advisory only — the P10 stance is that browser signals are surfaced
        // for a human to judge and never auto-penalize.
        flags: attempt?.flags?.length ? summarizeFlags(attempt.flags) : []
      }
    })

    const graded = rows.filter((r) => typeof r.score === 'number')
    const scores = graded.map((r) => Number(r.score))

    return NextResponse.json({
      assessment,
      rows,
      stats: {
        total: rows.length,
        submitted: rows.filter((r) => r.status === 'submitted').length,
        inProgress: rows.filter((r) => r.status === 'in_progress').length,
        notStarted: rows.filter((r) => r.status === 'not_started').length,
        passed: graded.filter((r) => r.passed).length,
        averageScore: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
        medianScore: median(scores)
      }
    })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}

// Members read through the TEACHER'S client (RLS confirms the classroom);
// names are then resolved with the service role, because a teacher can see the
// classroom membership but profiles are not broadly readable.
async function loadRoster(supabase, admin, assessment) {
  const { data: members, error } = await supabase
    .from('classroom_members')
    .select('id, student_user_id, status')
    .eq('classroom_id', assessment.classroom_id)
    .eq('status', 'active')

  if (error) throw new Error(error.message)

  const userIds = (members || []).map((m) => m.student_user_id)
  if (userIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, full_name')
    .in('id', userIds)

  const byId = new Map((profiles || []).map((p) => [p.id, p]))

  return (members || []).map((member) => {
    const profile = byId.get(member.student_user_id)
    return {
      memberId: member.id,
      userId: member.student_user_id,
      name: profile?.full_name || profile?.username || 'Student'
    }
  })
}

function median(values = []) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid])
}
