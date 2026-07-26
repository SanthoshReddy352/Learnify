import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { gradeAttempt, conceptSignalsFromResults, PASS_SCORE } from '@/lib/assessment/exam'
import { scoreWeighted } from '@/lib/assessment/authoring'
import { detectAttemptFlags, normalizeIntegrityEvents, summarizeFlags } from '@/lib/assessment/integrity'
import { resolveAttemptMode, vivaRequired } from '@/lib/assessment/mode'
import { recordConceptSignal } from '@/lib/memory/concept-state'
import { examSubmitRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Submit and grade a summative exam (Plan P9.4).
//
// Everything that decides the score happens here, on the server, against the
// items stored at start time: the client sends only which option it picked and
// how confident it was. That is what makes a pass mean something — and why this
// path does NOT read `user_concept_state` (P8.1), which is owner-writable.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(examSubmitRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { attemptId, responses, integrityEvents } = parsed.data

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({
        error: 'Exams require SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }

    const { data: attempt, error: attemptError } = await admin
      .from('assessment_attempts')
      .select('id, user_id, subject_id, kind, status, items, assessment_id')
      .eq('id', attemptId)
      .single()
    if (attemptError || !attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
    }

    // The admin client bypasses RLS, so ownership is checked explicitly here.
    if (attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    // Re-grading a closed attempt would let a learner resubmit until they pass.
    if (attempt.status !== 'in_progress') {
      return NextResponse.json({ error: 'This attempt is already closed' }, { status: 409 })
    }

    const served = Array.isArray(attempt.items) ? attempt.items : []
    const itemIds = served.map((s) => s.itemId).filter(Boolean)

    const { data: items, error: itemsError } = await admin
      .from('assessment_items')
      .select('id, concept, concept_key, kind, correct_index, explanation')
      .in('id', itemIds)
    if (itemsError) {
      return NextResponse.json({ error: 'Could not load the exam items' }, { status: 500 })
    }

    const graded = gradeAttempt({ items: items || [], served, responses })

    // A teacher-authored paper may weight its questions and set its own pass
    // mark, so its score is recomputed against those. Weights are read back
    // from the ATTEMPT (stored at start time), never from the paper as it
    // stands now — a teacher editing the paper afterwards must not silently
    // re-score work that has already been submitted.
    let score = graded.score
    let passed = graded.passed
    let effectivePassScore = PASS_SCORE

    if (attempt.assessment_id) {
      const { data: paper } = await admin
        .from('assessments')
        .select('pass_score')
        .eq('id', attempt.assessment_id)
        .maybeSingle()

      const weights = graded.results.map(
        (result) => Number(served.find((s) => s.itemId === result.itemId)?.points ?? 1)
      )
      const weighted = scoreWeighted({ responses: graded.results, points: weights })

      effectivePassScore = Number(paper?.pass_score ?? PASS_SCORE)
      score = weighted.percent
      passed = weighted.possible > 0 && weighted.percent >= effectivePassScore
    }

    // P10.2: compare this answer sequence against other learners' recent
    // attempts on the same subject. Options are shuffled per attempt, so two
    // honest learners almost never produce the same presented-position sequence
    // — a near-identical one is worth a human look (and nothing more).
    let others = []
    try {
      const { data: recent } = await admin
        .from('assessment_attempts')
        .select('id, user_id, responses')
        .eq('subject_id', attempt.subject_id)
        .eq('kind', 'exam')
        .eq('status', 'graded')
        .neq('user_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(50)
      others = (recent || []).map((r) => ({
        attemptId: r.id,
        responses: Array.isArray(r.responses) ? r.responses : []
      }))
    } catch (compareError) {
      console.warn('Cross-attempt comparison skipped:', compareError.message)
    }

    const events = normalizeIntegrityEvents(integrityEvents)
    const flags = detectAttemptFlags(graded.results, { others, events })

    // Which integrity regime applies — derived server-side, never client-sent.
    const mode = await resolveAttemptMode(admin, { subjectId: attempt.subject_id })

    const { error: updateError } = await admin
      .from('assessment_attempts')
      .update({
        status: 'graded',
        mode,
        integrity_events: events,
        responses: graded.results.map((r) => ({
          item_id: r.itemId,
          chosen_index: r.chosenIndex,
          confidence: r.confidence,
          correct: r.correct,
          ms: r.ms
        })),
        score,
        passed,
        flags,
        submitted_at: new Date().toISOString()
      })
      .eq('id', attemptId)
      .eq('status', 'in_progress') // guards against a double submit racing itself
    if (updateError) {
      console.error('Failed to record exam result:', updateError)
      return NextResponse.json({ error: 'Could not record the result' }, { status: 500 })
    }

    // Feed the outcome back into the learner's concept memory (P8.1) so weak
    // concepts resurface in lessons and reviews. One averaged signal per concept.
    for (const { concept, signal } of conceptSignalsFromResults(graded.results, { kind: 'quiz' })) {
      await recordConceptSignal(supabase, {
        userId: user.id,
        subjectId: attempt.subject_id,
        concepts: [concept],
        signal
      })
    }

    return NextResponse.json({
      success: true,
      score,
      passed,
      passScore: effectivePassScore,
      total: graded.total,
      correctCount: graded.correctCount,
      weakConcepts: graded.weakConcepts,
      overconfidentConcepts: graded.overconfidentConcepts,
      mode,
      // Self-paced passes still have to explain themselves (P10.5). Classroom
      // passes go to a teacher instead (P10.4).
      vivaRequired: vivaRequired({ mode, passed }),
      // The learner sees their own flags — being quietly marked would be
      // indefensible — but they are described, never scored or accused.
      integrityNotes: summarizeFlags(flags).kinds,
      results: graded.results.map((r) => ({
        itemId: r.itemId,
        concept: r.concept,
        correct: r.correct,
        correctIndexPresented: r.correctIndexPresented,
        chosenIndex: r.chosenIndex,
        calibration: r.calibration,
        explanation: r.explanation
      }))
    })
  } catch (error) {
    console.error('Error submitting exam:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
