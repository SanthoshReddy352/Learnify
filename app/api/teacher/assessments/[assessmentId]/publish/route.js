import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAssessmentTeacher, assessmentErrorResponse } from '@/lib/assessment/route-helpers'
import {
  loadQuestionsForTeacher,
  loadBankCounts,
  updateAssessment
} from '@/lib/assessment/authoring-store'
import { validateForPublish } from '@/lib/assessment/authoring'
import { parseOr400 } from '@/lib/validation/schemas'

const publishSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'close']).default('publish')
})

// Publish, un-publish, or close a paper.
//
// Publishing is validated HERE and refused loudly rather than being allowed
// through with warnings: it is the moment the paper becomes visible to a class,
// and everything validateForPublish checks is a condition that would otherwise
// fail during the test itself — an unfillable blueprint, a time limit longer
// than the window, a paper with two questions on it.
export async function POST(request, { params }) {
  try {
    const { supabase, admin, assessment } = await requireAssessmentTeacher(params.assessmentId)

    const parsed = parseOr400(publishSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { action } = parsed.data

    if (action === 'close') {
      return NextResponse.json({
        assessment: await updateAssessment(supabase, assessment.id, { status: 'closed' })
      })
    }

    if (action === 'unpublish') {
      // Only safe while nobody has sat it. Reopening a paper for editing after
      // attempts exist would let the questions change underneath results that
      // have already been recorded against them.
      const { count, error } = await admin
        .from('assessment_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('assessment_id', assessment.id)

      if (error) throw new Error(error.message)
      if ((count || 0) > 0) {
        return NextResponse.json({
          error: `${count} student(s) have already started this assessment, so its questions can no longer be edited. Close it instead.`
        }, { status: 409 })
      }

      return NextResponse.json({
        assessment: await updateAssessment(supabase, assessment.id, {
          status: 'draft',
          published_at: null
        })
      })
    }

    const [questions, bankCounts] = await Promise.all([
      loadQuestionsForTeacher(admin, assessment.id),
      loadBankCounts(admin, assessment.subject_id)
    ])

    const validation = validateForPublish({ assessment, questions, bankCounts })
    if (!validation.ok) {
      return NextResponse.json({
        error: 'This assessment is not ready to publish.',
        validation
      }, { status: 422 })
    }

    const published = await updateAssessment(supabase, assessment.id, {
      status: 'published',
      published_at: new Date().toISOString()
    })

    // Warnings are returned rather than swallowed — a partly-fillable blueprint
    // publishes fine but the teacher should know the paper will serve short.
    return NextResponse.json({ assessment: published, warnings: validation.warnings })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}
