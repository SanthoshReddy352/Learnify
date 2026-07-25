import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { ITEM_PUBLIC_COLUMNS } from '@/lib/assessment/items'
import { selectExamItems, presentItems, seedFromString } from '@/lib/assessment/exam'
import { fetchConceptState } from '@/lib/memory/concept-state'
import { examStartRequestSchema, parseOr400 } from '@/lib/validation/schemas'
import { randomUUID } from 'crypto'

// Start a summative exam (Plan P9.4).
//
// The attempt row is created with the service role and holds the exact items in
// the exact order served, including the per-attempt option permutation (P10.1
// randomization). Grading reads that back, so the score always refers to what
// the learner actually saw and the client cannot influence it.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(examStartRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { subjectId, itemCount } = parsed.data

    // RLS is the access gate: it admits the subject's owner and classroom
    // participants, which is exactly who may sit its exam.
    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('id, title')
      .eq('id', subjectId)
      .single()
    if (subjectError || !subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({
        error: 'Exams require SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }

    // Answer keys are not needed to serve an exam, so this read stays on the
    // user's client and the public column list.
    const { data: items, error: itemsError } = await supabase
      .from('assessment_items')
      .select(ITEM_PUBLIC_COLUMNS)
      .eq('subject_id', subjectId)
    if (itemsError) {
      return NextResponse.json({
        error: 'The item bank is not available yet. Generate assessment items first.'
      }, { status: 409 })
    }

    const conceptRows = await fetchConceptState(supabase, { userId: user.id, subjectId })

    // Only auto-gradable kinds sit in an exam — open "why" items are formative
    // (and, later, viva material for P10.5); scoring free text automatically
    // would put an unreliable number behind a certificate.
    const selected = selectExamItems({
      items: items || [],
      conceptRows,
      count: itemCount,
      seed: seedFromString(`${user.id}:${subjectId}:${Date.now()}`),
      gradableOnly: true
    })

    if (selected.length < 4) {
      return NextResponse.json({
        error: `Not enough questions in the bank yet (${selected.length}). Generate more assessment items first.`
      }, { status: 409 })
    }

    const attemptId = randomUUID()
    const served = presentItems(selected, seedFromString(attemptId))

    const { error: insertError } = await admin.from('assessment_attempts').insert({
      id: attemptId,
      user_id: user.id,
      subject_id: subjectId,
      kind: 'exam',
      status: 'in_progress',
      items: served
    })
    if (insertError) {
      console.error('Failed to open exam attempt:', insertError)
      return NextResponse.json({
        error: 'Could not start the exam. The attempts table may not be migrated yet.'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      attemptId,
      subjectTitle: subject.title,
      // `order` stays server-side: the client has no use for the permutation and
      // it must not be able to shape grading.
      items: served.map(({ order, ...visible }) => visible)
    })
  } catch (error) {
    console.error('Error starting exam:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
