import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { generateVivaQuestions } from '@/lib/ai/pipelines/viva'
import { selectVivaConcepts } from '@/lib/assessment/viva'
import { SELF_PACED } from '@/lib/assessment/mode'
import { vivaStartRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Open an oral viva on a passed self-paced exam (Plan P10.5).
//
// A self-paced subject has no invigilator and no reviewer, so this — explaining
// your own answers — is the integrity gate, not browser telemetry. Questions are
// built from concepts the learner answered CORRECTLY: the viva confirms that a
// right answer reflects understanding, rather than re-punishing a wrong one.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(vivaStartRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { attemptId } = parsed.data

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({
        error: 'The viva requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }

    const { data: attempt, error } = await admin
      .from('assessment_attempts')
      .select('id, user_id, subject_id, status, passed, mode, responses, items, viva_passed')
      .eq('id', attemptId)
      .single()
    if (error || !attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

    // Admin bypasses RLS, so ownership is checked here explicitly.
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
    if (attempt.viva_passed === true) {
      return NextResponse.json({ error: 'The viva for this attempt is already passed' }, { status: 409 })
    }

    // Rebuild {concept, correct, confidence} from the stored attempt: the item
    // rows hold the concept tags, the responses hold the outcomes.
    const responses = Array.isArray(attempt.responses) ? attempt.responses : []
    const itemIds = responses.map((r) => r.item_id).filter(Boolean)
    const { data: items } = await admin
      .from('assessment_items')
      .select('id, concept')
      .in('id', itemIds.length > 0 ? itemIds : ['00000000-0000-0000-0000-000000000000'])
    const conceptById = new Map((items || []).map((i) => [i.id, i.concept]))

    const results = responses.map((r) => ({
      concept: conceptById.get(r.item_id) || '',
      correct: !!r.correct,
      confidence: r.confidence || 'unsure'
    }))

    const concepts = selectVivaConcepts(results, 3)
    if (concepts.length === 0) {
      return NextResponse.json({
        error: 'No correctly-answered concepts to examine'
      }, { status: 409 })
    }

    const { data: subject } = await admin
      .from('subjects').select('title').eq('id', attempt.subject_id).maybeSingle()
    const { data: userSecrets } = await supabase
      .from('user_secrets').select('*').eq('id', user.id).maybeSingle()

    const { questions } = await generateVivaQuestions({
      subjectTitle: subject?.title || 'this subject',
      concepts,
      questionCount: Math.min(3, concepts.length),
      userSecrets
    })

    if (questions.length === 0) {
      return NextResponse.json({ error: 'Could not prepare viva questions' }, { status: 502 })
    }

    // Questions are not persisted here: they are echoed back on submit and
    // re-scored server-side against the answer text, so there is nothing a
    // learner gains by editing them — and a stored question set would let them
    // fish for an easier one by restarting.
    return NextResponse.json({ success: true, questions })
  } catch (error) {
    console.error('Error starting viva:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
