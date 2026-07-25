import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { ITEM_PUBLIC_COLUMNS, isGradable } from '@/lib/assessment/items'
import { observationFor, calibrationFor } from '@/lib/assessment/exam'
import { recordConceptSignal, signalFromObservation, lessonSignal } from '@/lib/memory/concept-state'
import { practiceGradeRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Grade ONE practice response (Plan P9.2).
//
// Two-client pattern, and the reason for it matters: the learner's own client
// authorizes the read (RLS decides whether they may see this item at all), then
// the service-role client reads the answer columns, which are revoked from
// end-user roles at the database level. Neither half is sufficient alone —
// admin-only would bypass access control, RLS-only cannot see the answer.
//
// Confidence is captured BEFORE the reveal by the UI, so "sure and wrong" can be
// scored hardest and surfaced: not knowing that you don't know is the highest-
// value thing to resurface.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(practiceGradeRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { itemId, chosenIndex, confidence } = parsed.data

    // 1. Authorize through the user's own client / RLS.
    const { data: visible, error: visibleError } = await supabase
      .from('assessment_items')
      .select(ITEM_PUBLIC_COLUMNS)
      .eq('id', itemId)
      .maybeSingle()
    if (visibleError || !visible) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // 2. Read the answer with the service role.
    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({
        error: 'Grading requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }
    const { data: item, error: itemError } = await admin
      .from('assessment_items')
      .select('id, subject_id, concept, kind, correct_index, answer_key, explanation')
      .eq('id', itemId)
      .single()
    if (itemError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Open "why" items are not machine-graded — the learner compares their own
    // explanation against the model answer. Recording it as a scored outcome
    // would be inventing a result nobody measured.
    if (!isGradable(item)) {
      await recordConceptSignal(supabase, {
        userId: user.id,
        subjectId: item.subject_id,
        concepts: [item.concept],
        signal: lessonSignal()
      })
      return NextResponse.json({
        success: true,
        graded: false,
        modelAnswer: item.answer_key || '',
        explanation: item.explanation || ''
      })
    }

    const answered = chosenIndex !== null && chosenIndex !== undefined
    const correct = answered && Number(chosenIndex) === Number(item.correct_index)
    const calibration = calibrationFor({ correct, confidence })

    // Fold the outcome into the learner's concept memory (P8.1) — but only when
    // they actually answered; a skipped item measured nothing.
    if (answered) {
      await recordConceptSignal(supabase, {
        userId: user.id,
        subjectId: item.subject_id,
        concepts: [item.concept],
        signal: signalFromObservation(observationFor({ correct, confidence }), {
          kind: 'quiz',
          struggle: !correct
        })
      })
    }

    return NextResponse.json({
      success: true,
      graded: true,
      correct,
      correctIndex: item.correct_index,
      explanation: item.explanation || '',
      calibration,
      concept: item.concept
    })
  } catch (error) {
    console.error('Error grading practice response:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
