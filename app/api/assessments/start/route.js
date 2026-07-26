import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'
import { presentItems, seedFromString } from '@/lib/assessment/exam'
import { resolvePaperItems, canAttempt, remainingMs } from '@/lib/assessment/authoring'
import { countUserAttempts } from '@/lib/assessment/authoring-store'
import { fetchConceptState } from '@/lib/memory/concept-state'
import { startAssessmentSchema, parseOr400 } from '@/lib/validation/schemas'

// Start an attempt at a teacher-authored paper.
//
// This is the counterpart to /api/exam/start: same storage, same grading path,
// but the items come from the PAPER rather than from a live selection over the
// whole bank.
//
// Two things are deliberately server-side and non-negotiable:
//
//   1. Eligibility. The window, the attempt cap and the assignment list are all
//      re-checked here. The listing endpoint returns the same verdict, but that
//      is for display — a client that skips the list must not be able to skip
//      the rule.
//   2. The answer key never leaves the server. Items are read with the service
//      role (the answer columns are revoked from end users) and shaped by
//      presentItems, which strips the key and permutes the options.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(startAssessmentSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { assessmentId } = parsed.data

    // RLS is the access gate: this select only returns a paper that is
    // published and either whole-class or assigned to this student.
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, classroom_id, subject_id, title, instructions, status, opens_at, closes_at, duration_minutes, pass_score, max_attempts, shuffle_questions, shuffle_options, require_fullscreen')
      .eq('id', assessmentId)
      .maybeSingle()

    if (assessmentError) throw new Error(assessmentError.message)
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({
        error: 'Assessments require SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }

    const attemptsUsed = await countUserAttempts(admin, { assessmentId, userId: user.id })
    const eligibility = canAttempt({ assessment, attemptsUsed })
    if (!eligibility.allowed) {
      return NextResponse.json({ error: eligibility.reason }, { status: 403 })
    }

    const [questions, bank, conceptRows] = await Promise.all([
      loadQuestions(admin, assessmentId),
      loadBank(admin, assessment.subject_id),
      fetchConceptState(supabase, { userId: user.id, subjectId: assessment.subject_id })
    ])

    if (questions.length === 0) {
      return NextResponse.json({ error: 'This assessment has no questions.' }, { status: 409 })
    }

    // Seeded PER STUDENT PER ATTEMPT, so blueprint draws and question order
    // differ between students and between re-sits, while staying reproducible
    // for grading and review.
    const attemptId = randomUUID()
    const { items, points, short } = resolvePaperItems({
      questions,
      items: bank,
      conceptRows,
      seed: seedFromString(`${user.id}:${assessmentId}:${attemptsUsed}`),
      shuffleQuestions: assessment.shuffle_questions
    })

    if (items.length === 0) {
      return NextResponse.json({
        error: 'This assessment could not be assembled — its questions are no longer in the item bank.'
      }, { status: 409 })
    }
    if (short.length > 0) {
      // The paper still runs; the teacher's validation surfaces the same gap.
      console.warn(`[Assessment] ${assessmentId} served short: ${JSON.stringify(short)}`)
    }

    const served = presentItems(items, seedFromString(attemptId))
      // Carry each question's weight with the item it belongs to, so grading
      // reads the weights back from the attempt rather than re-deriving them
      // from a paper the teacher may have since edited.
      .map((entry, index) => ({ ...entry, points: points[index] ?? 1 }))

    const { error: insertError } = await admin.from('assessment_attempts').insert({
      id: attemptId,
      user_id: user.id,
      subject_id: assessment.subject_id,
      assessment_id: assessmentId,
      kind: 'exam',
      status: 'in_progress',
      items: served
    })
    if (insertError) {
      console.error('Failed to open assessment attempt:', insertError)
      return NextResponse.json({ error: 'Could not start this assessment.' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      attemptId,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        instructions: assessment.instructions,
        passScore: assessment.pass_score,
        requireFullscreen: assessment.require_fullscreen,
        durationMinutes: assessment.duration_minutes
      },
      remainingMs: remainingMs({ assessment, startedAt: new Date().toISOString() }),
      // `order` and `points` stay server-side: the client has no use for the
      // permutation, and neither must be able to shape grading.
      items: served.map(({ order, points: _points, ...visible }) => visible)
    })
  } catch (error) {
    console.error('Error starting assessment:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}

async function loadQuestions(admin, assessmentId) {
  const { data, error } = await admin
    .from('assessment_questions')
    .select('id, position, source, item_id, concept_key, difficulty_min, difficulty_max, draw_count, points')
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

// Full rows INCLUDING difficulty and kind, which blueprint resolution needs.
// Answers are not selected — resolvePaperItems has no use for them, and not
// fetching a secret is stronger than fetching and discarding it.
async function loadBank(admin, subjectId) {
  const { data, error } = await admin
    .from('assessment_items')
    .select('id, subject_id, topic_id, concept, concept_key, kind, difficulty, stem, options')
    .eq('subject_id', subjectId)

  if (error) throw new Error(error.message)
  return data || []
}
