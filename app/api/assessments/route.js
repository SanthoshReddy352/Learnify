import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { windowState, canAttempt } from '@/lib/assessment/authoring'

// Per-user and cookie-backed, so there is nothing to prerender. Declared
// explicitly because otherwise the build attempts a static render, and the
// resulting failure surfaces as a misleading "failed to list assessments"
// error in the build log.
export const dynamic = 'force-dynamic'

// The assessments a student can see.
//
// The visibility rule is entirely RLS: the "Students read assigned published
// assessments" policy admits published/closed papers in classrooms they belong
// to, and only those either unassigned (whole class) or assigned to them.
// Drafts are invisible. This route therefore does a plain select and does NOT
// re-implement the rule — one place to get it right.
export async function GET(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const classroomId = new URL(request.url).searchParams.get('classroomId')

    let query = supabase
      .from('assessments')
      .select('id, classroom_id, subject_id, title, instructions, status, opens_at, closes_at, duration_minutes, pass_score, max_attempts')
      .order('opens_at', { ascending: true, nullsFirst: false })
    if (classroomId) query = query.eq('classroom_id', classroomId)

    const { data: assessments, error } = await query
    if (error) throw new Error(error.message)

    const attemptCounts = await countAttempts(user.id, (assessments || []).map((a) => a.id))
    const now = Date.now()

    return NextResponse.json({
      assessments: (assessments || []).map((assessment) => {
        const used = attemptCounts.get(assessment.id) || 0
        return {
          ...assessment,
          state: windowState(assessment, now),
          attemptsUsed: used,
          // Precomputed so the list can explain "why can't I start this"
          // without the client re-deriving rules the server owns.
          eligibility: canAttempt({ assessment, attemptsUsed: used, now })
        }
      })
    })
  } catch (error) {
    console.error('Failed to list assessments:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

// Attempt rows are readable by their owner under RLS, so the user's own client
// would do — but the count is also used to ENFORCE max_attempts at start time,
// and reading it with the service role keeps both paths on the same number.
async function countAttempts(userId, assessmentIds) {
  const counts = new Map()
  if (assessmentIds.length === 0) return counts

  const admin = createAdminClient()
  if (!admin) return counts

  const { data } = await admin
    .from('assessment_attempts')
    .select('assessment_id')
    .eq('user_id', userId)
    .in('assessment_id', assessmentIds)

  for (const row of data || []) {
    counts.set(row.assessment_id, (counts.get(row.assessment_id) || 0) + 1)
  }
  return counts
}
