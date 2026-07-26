import { NextResponse } from 'next/server'
import { requireAssessmentTeacher, assessmentErrorResponse } from '@/lib/assessment/route-helpers'
import { setAssignments, loadAssignments } from '@/lib/assessment/authoring-store'
import { assignAssessmentSchema, parseOr400 } from '@/lib/validation/schemas'

// Who sits this paper.
//
// An EMPTY list means the whole class, and that is stored as zero rows rather
// than one row per member. The difference matters for late joiners: a
// materialized roster would silently exclude anyone who joins the classroom
// after the paper was set up, and nobody would notice until a student reported
// a missing test.
export async function GET(request, { params }) {
  try {
    const { admin, assessment } = await requireAssessmentTeacher(params.assessmentId)
    const memberIds = await loadAssignments(admin, assessment.id)

    return NextResponse.json({
      memberIds,
      wholeClass: memberIds.length === 0
    })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}

export async function PUT(request, { params }) {
  try {
    const { supabase, admin, assessment } = await requireAssessmentTeacher(params.assessmentId)

    const parsed = parseOr400(assignAssessmentSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { memberIds } = parsed.data

    if (memberIds.length > 0) {
      // Every id must belong to THIS classroom. Read through the teacher's own
      // client so RLS confirms it — the write below uses the service role, which
      // would otherwise happily attach a member of a classroom they do not
      // teach.
      const { data: members, error } = await supabase
        .from('classroom_members')
        .select('id')
        .eq('classroom_id', assessment.classroom_id)
        .in('id', memberIds)

      if (error) throw new Error(error.message)
      if ((members || []).length !== memberIds.length) {
        return NextResponse.json({
          error: 'One or more students are not members of this classroom.'
        }, { status: 400 })
      }
    }

    await setAssignments(admin, { assessmentId: assessment.id, memberIds })

    return NextResponse.json({ success: true, wholeClass: memberIds.length === 0 })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}
