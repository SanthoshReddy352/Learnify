import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { scoreVivaAnswer } from '@/lib/ai/pipelines/viva'
import { gradeViva, VIVA_PASS_MEAN } from '@/lib/assessment/viva'
import { SELF_PACED } from '@/lib/assessment/mode'
import { vivaSubmitRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Score an oral viva and record the outcome (Plan P10.5).
//
// The learner's explanations are scored by the agent server-side and the verdict
// is computed by the pure `gradeViva` rule, then written with the service role —
// so the gate that a self-paced certificate will depend on is not something the
// client can set.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(vivaSubmitRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { attemptId, answers } = parsed.data

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({
        error: 'The viva requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }

    const { data: attempt, error } = await admin
      .from('assessment_attempts')
      .select('id, user_id, subject_id, status, passed, mode, viva_passed')
      .eq('id', attemptId)
      .single()
    if (error || !attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

    if (attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (attempt.status !== 'graded' || !attempt.passed) {
      return NextResponse.json({ error: 'This attempt has not been passed' }, { status: 409 })
    }
    if (attempt.mode !== SELF_PACED) {
      return NextResponse.json({
        error: 'Classroom attempts are reviewed by the teacher, not by viva'
      }, { status: 409 })
    }
    // A viva that could be retried until it passes would be no gate at all.
    if (attempt.viva_passed !== null && attempt.viva_passed !== undefined) {
      return NextResponse.json({
        error: 'A viva has already been recorded for this attempt'
      }, { status: 409 })
    }

    const { data: userSecrets } = await supabase
      .from('user_secrets').select('*').eq('id', user.id).maybeSingle()

    // Score sequentially: a handful of short calls, and it keeps the token
    // profile predictable on the free-platform budget.
    const scored = []
    for (const answer of answers) {
      try {
        const result = await scoreVivaAnswer({
          concept: answer.concept,
          question: answer.question,
          expectedPoints: answer.expectedPoints,
          explanation: answer.explanation,
          userSecrets
        })
        scored.push({
          concept: answer.concept,
          question: answer.question,
          explanation: answer.explanation,
          score: result.score,
          covered: result.covered,
          missing: result.missing,
          feedback: result.feedback
        })
      } catch (scoreError) {
        // A scoring failure must not be a free pass OR an unfair fail: record it
        // as unscored and bail out rather than averaging a guess into the result.
        console.error('Viva scoring failed:', scoreError)
        return NextResponse.json({
          error: 'Could not score your explanations right now. Nothing was recorded — please try again.'
        }, { status: 503 })
      }
    }

    const verdict = gradeViva(scored)

    const { error: updateError } = await admin
      .from('assessment_attempts')
      .update({
        viva: { scored, verdict, at: new Date().toISOString() },
        viva_passed: verdict.passed
      })
      .eq('id', attemptId)
      .is('viva_passed', null) // guards a double submit racing itself
    if (updateError) {
      console.error('Failed to record viva result:', updateError)
      return NextResponse.json({ error: 'Could not record the viva result' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      passed: verdict.passed,
      mean: verdict.mean,
      reason: verdict.reason,
      passMean: VIVA_PASS_MEAN,
      answers: scored.map((s) => ({
        concept: s.concept,
        score: s.score,
        covered: s.covered,
        missing: s.missing,
        feedback: s.feedback
      }))
    })
  } catch (error) {
    console.error('Error submitting viva:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
