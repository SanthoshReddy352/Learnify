import { NextResponse } from 'next/server'
import {
  requireAssessmentTeacher,
  assessmentErrorResponse,
  assertEditable
} from '@/lib/assessment/route-helpers'
import {
  loadQuestionsForTeacher,
  loadBankCounts,
  loadAssignments,
  updateAssessment,
  deleteAssessment,
  settingsToRow
} from '@/lib/assessment/authoring-store'
import { validateForPublish, totalPoints, totalQuestionCount } from '@/lib/assessment/authoring'
import { assessmentSettingsSchema, parseOr400 } from '@/lib/validation/schemas'

// The teacher's full editing view of one paper.
//
// Returns the publish check alongside the paper on every read, so the authoring
// UI can show "why can't I publish this yet" continuously rather than only
// after a failed publish attempt. The blueprint-feasibility part of that check
// is the valuable one: a rule the item bank cannot fill is invisible when you
// look at the draft, and would otherwise only surface as a short paper during
// the actual test.
export async function GET(request, { params }) {
  try {
    const { admin, assessment } = await requireAssessmentTeacher(params.assessmentId)

    const [questions, bankCounts, assignedMemberIds] = await Promise.all([
      loadQuestionsForTeacher(admin, assessment.id),
      loadBankCounts(admin, assessment.subject_id),
      loadAssignments(admin, assessment.id)
    ])

    return NextResponse.json({
      assessment,
      questions,
      assignedMemberIds,
      summary: {
        questionCount: totalQuestionCount(questions),
        totalPoints: totalPoints(questions)
      },
      validation: validateForPublish({ assessment, questions, bankCounts })
    })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}

export async function PATCH(request, { params }) {
  try {
    const { supabase, assessment } = await requireAssessmentTeacher(params.assessmentId)

    const parsed = parseOr400(assessmentSettingsSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

    // Settings stay editable while published — extending a deadline mid-exam is
    // a normal and necessary thing for a teacher to do. Only the QUESTIONS are
    // frozen after publish (see the questions route).
    const patch = settingsToRow(parsed.data)
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ assessment })
    }

    // Written through the teacher's own client so RLS re-checks ownership on
    // the write, not just on the read that authorized it.
    return NextResponse.json({
      assessment: await updateAssessment(supabase, assessment.id, patch)
    })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}

export async function DELETE(request, { params }) {
  try {
    const { supabase, assessment } = await requireAssessmentTeacher(params.assessmentId)

    // Deleting a paper students have already sat would orphan their attempts
    // and destroy the record of a real assessment. Closing it is the intended
    // action there, and it keeps results readable.
    assertEditable(assessment)

    await deleteAssessment(supabase, assessment.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}
