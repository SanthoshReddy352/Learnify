import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAssessmentTeacher,
  assessmentErrorResponse,
  assertEditable
} from '@/lib/assessment/route-helpers'
import {
  addQuestions,
  removeQuestion,
  createManualItem,
  loadBankForTeacher
} from '@/lib/assessment/authoring-store'
import {
  assessmentQuestionSchema,
  manualAssessmentItemSchema,
  parseOr400
} from '@/lib/validation/schemas'
import { normalizeConceptKey } from '@/lib/memory/concept-state'

// The three ways a teacher builds a paper, all landing in the same schema:
//
//   1. pick from the bank  -> { questions: [{ source: 'item', itemId }] }
//   2. add a blueprint rule -> { questions: [{ source: 'blueprint', ... }] }
//   3. write one by hand    -> { manual: {...} }, which becomes a normal bank
//                              item and is then pinned
//
// Writing by hand deliberately produces an ordinary assessment_items row rather
// than a special "manual question" shape. Everything downstream — selection,
// grading, per-concept analytics, the practice engine — then treats it exactly
// like a generated item, with no second code path to keep in sync.
const addQuestionsSchema = z.object({
  questions: z.array(assessmentQuestionSchema).max(100).optional().default([]),
  manual: manualAssessmentItemSchema.optional()
}).refine(
  (body) => body.questions.length > 0 || body.manual,
  { message: 'Provide at least one question, or a manual question to create.' }
)

export async function GET(request, { params }) {
  try {
    const { admin, assessment } = await requireAssessmentTeacher(params.assessmentId)
    // The bank picker. Includes answers — the caller has been confirmed to
    // teach this classroom, and they are choosing which questions to set.
    return NextResponse.json({ items: await loadBankForTeacher(admin, assessment.subject_id) })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}

export async function POST(request, { params }) {
  try {
    const { admin, assessment } = await requireAssessmentTeacher(params.assessmentId)
    assertEditable(assessment)

    const parsed = parseOr400(addQuestionsSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { questions, manual } = parsed.data
    const toAdd = [...questions]

    if (manual) {
      const created = await createManualItem(admin, {
        subjectId: assessment.subject_id,
        item: {
          ...manual,
          // The same normalization generated items go through, so a hand-written
          // question groups with them under one concept instead of creating a
          // near-duplicate key that fragments the analytics.
          conceptKey: normalizeConceptKey(manual.concept)
        }
      })
      toAdd.push({ source: 'item', itemId: created.id, points: 1 })
    }

    const added = await addQuestions(admin, assessment.id, toAdd)
    return NextResponse.json({ success: true, added: added.length }, { status: 201 })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}

export async function DELETE(request, { params }) {
  try {
    const { admin, assessment } = await requireAssessmentTeacher(params.assessmentId)
    assertEditable(assessment)

    const questionId = new URL(request.url).searchParams.get('questionId')
    if (!questionId) {
      return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
    }

    await removeQuestion(admin, { assessmentId: assessment.id, questionId })
    return NextResponse.json({ success: true })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}
