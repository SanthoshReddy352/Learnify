import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveTopicAccess } from '@/lib/classrooms/access'
import { ITEM_PUBLIC_COLUMNS } from '@/lib/assessment/items'
import { selectExamItems } from '@/lib/assessment/exam'
import { fetchConceptState } from '@/lib/memory/concept-state'
import { practiceItemsRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Serve a few in-lesson retrieval-practice items for a topic (Plan P9.2).
//
// Formative: ungraded, unlimited retries, answers revealed immediately after the
// learner commits. Options are served in their stored order and the answer key
// is never sent — grading happens in /api/practice/grade. There is no
// per-attempt option shuffle here because practice gates nothing; the shuffle
// that matters for integrity (P10.1) is on the exam path, where the served order
// is stored server-side rather than echoed by the client.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(practiceItemsRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { topicId, limit } = parsed.data

    // Access check first (owner or enrolled classroom student).
    const access = await resolveTopicAccess(supabase, {
      userId: user.id,
      topicId,
      classroomId: null,
      classroomCourseId: null
    }).catch(() => null)
    if (!access) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

    const subjectId = access.topic?.subject_id || access.subject?.id

    // ITEM_PUBLIC_COLUMNS matters: `select *` would hit the revoked answer
    // columns and error (see the P9 migration).
    const { data: items, error } = await supabase
      .from('assessment_items')
      .select(ITEM_PUBLIC_COLUMNS)
      .eq('topic_id', topicId)
    if (error) {
      // Table absent until P14 → no practice available, not an error page.
      console.warn('Practice items unavailable:', error.message)
      return NextResponse.json({ success: true, items: [], available: false })
    }

    const conceptRows = await fetchConceptState(supabase, { userId: user.id, subjectId })

    // Interleave across concepts and aim difficulty at what this learner has
    // shown. `gradableOnly: false` keeps open "why" items in practice — they are
    // excluded only from graded exams.
    const selected = selectExamItems({
      items: items || [],
      conceptRows,
      count: limit,
      seed: Date.now() & 0xffff,
      gradableOnly: false
    })

    return NextResponse.json({
      success: true,
      available: true,
      items: selected.map((item) => ({
        itemId: item.id,
        concept: item.concept,
        kind: item.kind,
        difficulty: item.difficulty,
        stem: item.stem,
        options: item.options || []
      }))
    })
  } catch (error) {
    console.error('Error serving practice items:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
