import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAssessmentTeacher, assessmentErrorResponse, assertEditable } from '@/lib/assessment/route-helpers'
import { addQuestions } from '@/lib/assessment/authoring-store'
import { generateAssessmentItems } from '@/lib/ai/pipelines/assessment'
import { normalizeGeneratedItemsWithReport, summarizeDropped, ITEM_PUBLIC_COLUMNS } from '@/lib/assessment/items'
import { parseOr400 } from '@/lib/validation/schemas'

const generateSchema = z.object({
  topicIds: z.array(z.string().uuid()).max(30).optional().default([]),
  itemCount: z.number().int().min(3).max(24).optional().default(8),
  difficulty: z.number().int().min(1).max(5).optional().default(3),
  // Off by default. Generated questions are a DRAFT of a test — a teacher
  // should read them before a class sits them, and silently pinning unreviewed
  // AI output onto a graded paper is exactly the failure mode this feature
  // should not have.
  attach: z.boolean().optional().default(false)
})

// Generate questions into this paper's subject bank, and optionally pin them.
//
// The generated items land in `assessment_items` like any other, so they are
// immediately reviewable and editable in the bank picker, and a teacher can
// keep the good ones and drop the rest. Nothing here bypasses that review step
// unless `attach` is explicitly requested.
export async function POST(request, { params }) {
  try {
    const { supabase, admin, user, assessment } = await requireAssessmentTeacher(params.assessmentId)
    assertEditable(assessment)

    const parsed = parseOr400(generateSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { topicIds, itemCount, difficulty, attach } = parsed.data

    const { data: subject } = await admin
      .from('subjects').select('id, title').eq('id', assessment.subject_id).maybeSingle()
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

    const withLedger = process.env.CONTENT_LEDGER === 'true'
    let query = admin
      .from('topics')
      .select(withLedger ? 'id, title, difficulty, content, concept_ledger' : 'id, title, difficulty, content')
      .eq('subject_id', assessment.subject_id)
    if (topicIds.length > 0) query = query.in('id', topicIds)

    const { data: topics } = await query

    // Items are built from what a lesson actually taught, so an ungenerated
    // topic would produce questions on material the class has never seen.
    const taught = (topics || []).filter((t) => String(t.content || '').length > 50)
    if (taught.length === 0) {
      return NextResponse.json({
        error: 'These topics have no lesson content yet. Generate the lessons first — questions are built from what was taught.'
      }, { status: 400 })
    }

    // The teacher's own provider keys, same as every other generation path.
    const { data: userSecrets } = await supabase
      .from('user_secrets').select('*').eq('id', user.id).maybeSingle()

    const { items: generated } = await generateAssessmentItems({
      subjectTitle: subject.title,
      topics: taught,
      lessonContent: taught.map((t) => String(t.content || '').slice(0, 4000)).join('\n\n'),
      itemCount,
      difficulty,
      userSecrets
    })

    const { rows, dropped } = normalizeGeneratedItemsWithReport(generated, {
      subjectId: assessment.subject_id,
      topicId: topicIds.length === 1 ? topicIds[0] : null
    })

    if (dropped.length > 0) {
      console.log(`[Assessment] Dropped ${dropped.length} generated item(s): ${summarizeDropped(dropped)}`)
    }

    if (rows.length === 0) {
      return NextResponse.json({
        error: 'Generation returned no usable questions. Try again, or lower the count.',
        dropped: summarizeDropped(dropped)
      }, { status: 422 })
    }

    const { data: inserted, error } = await admin
      .from('assessment_items')
      .insert(rows)
      .select(ITEM_PUBLIC_COLUMNS)
    if (error) throw new Error(error.message)

    let attached = 0
    if (attach) {
      const gradable = (inserted || []).filter((i) => i.kind === 'mcq' || i.kind === 'worked_example')
      const added = await addQuestions(
        admin,
        assessment.id,
        gradable.map((item) => ({ source: 'item', itemId: item.id, points: 1 }))
      )
      attached = added.length
    }

    return NextResponse.json({
      success: true,
      // Answer-free: this response goes to a browser, and the teacher's editing
      // view fetches the full versions through the authoring endpoint.
      items: inserted || [],
      created: (inserted || []).length,
      attached,
      dropped: dropped.length
    }, { status: 201 })
  } catch (error) {
    return assessmentErrorResponse(error)
  }
}
