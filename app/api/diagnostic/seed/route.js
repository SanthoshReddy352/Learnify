import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { diagnosticResultSchema, parseOr400 } from '@/lib/validation/schemas'
import { recordConceptSignal, signalFromCorrectness, normalizeConceptKey } from '@/lib/memory/concept-state'

// Seed the learner's concept memory from a placement check (Plan P8.4).
//
// This is the learner's OWN private memory: it personalizes their lessons,
// review order, and tutor, and gates nothing. Self-reported results are
// therefore accepted as-is — the only person a faked answer misleads is the
// learner. Anything that must be trustworthy (P9 certificates, P10 integrity)
// is graded server-side and does not read this table.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(diagnosticResultSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { subjectId, answers } = parsed.data

    // Ownership check on top of RLS (the memory row's FK points at this subject).
    const { data: subject, error } = await supabase
      .from('subjects')
      .select('id')
      .eq('id', subjectId)
      .eq('user_id', user.id)
      .single()
    if (error || !subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

    // One signal per outcome: correct and incorrect answers move mastery in
    // opposite directions, so they can't be batched into a single upsert. The
    // two batches must stay DISJOINT — two questions can tag the same concept,
    // and concurrent upserts on one row would lose a signal. A concept the
    // learner got wrong anywhere counts as missed (the conservative read).
    // Dedupe on the normalized key, since that is what the row is keyed by —
    // "Recursion" and "recursion." are one concept.
    const missedKeys = new Set(
      answers.filter((a) => !a.correct).map((a) => normalizeConceptKey(a.concept))
    )
    const missedConcepts = answers.filter((a) => !a.correct).map((a) => a.concept)
    const correctConcepts = answers
      .filter((a) => a.correct && !missedKeys.has(normalizeConceptKey(a.concept)))
      .map((a) => a.concept)

    const [seededCorrect, seededMissed] = await Promise.all([
      correctConcepts.length > 0
        ? recordConceptSignal(supabase, {
            userId: user.id,
            subjectId,
            concepts: correctConcepts,
            signal: signalFromCorrectness(true)
          })
        : [],
      missedConcepts.length > 0
        ? recordConceptSignal(supabase, {
            userId: user.id,
            subjectId,
            concepts: missedConcepts,
            signal: signalFromCorrectness(false)
          })
        : []
    ])

    const recorded = seededCorrect.length + seededMissed.length
    return NextResponse.json({
      success: true,
      recorded,
      // false when USER_MEMORY is off or the table isn't there yet (pre-P14) —
      // the UI still shows the result, it just isn't remembered.
      persisted: recorded > 0
    })
  } catch (error) {
    console.error('Error seeding diagnostic results:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
