import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateDiagnostic } from '@/lib/ai/pipelines/diagnostic'
import { diagnosticRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Generate a diagnostic placement check for a subject (Plan P8.4).
//
// The learner grades themselves in the UI and posts the outcome to
// /api/diagnostic/seed, which is why the answer keys are returned here: this
// check is self-placement, is not stored, and gates nothing. Graded assessments
// (P9) must NOT reuse this route — they need server-side grading.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(diagnosticRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { subjectId, questionCount } = parsed.data

    const { data: subject, error } = await supabase
      .from('subjects')
      .select('id, title, syllabus')
      .eq('id', subjectId)
      .eq('user_id', user.id)
      .single()
    if (error || !subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

    // The ledger column only exists after the P6.5 migration (P14).
    const topicColumns = process.env.CONTENT_LEDGER === 'true'
      ? 'title, description, difficulty, concept_ledger'
      : 'title, description, difficulty'
    const { data: topics } = await supabase
      .from('topics')
      .select(topicColumns)
      .eq('subject_id', subjectId)
      .order('difficulty', { ascending: true })

    const { data: userSecrets } = await supabase
      .from('user_secrets').select('*').eq('id', user.id).maybeSingle()

    const diagnostic = await generateDiagnostic({
      subjectTitle: subject.title,
      subjectSyllabus: subject.syllabus || '',
      topics: topics || [],
      questionCount,
      userSecrets
    })

    return NextResponse.json({ success: true, ...diagnostic })
  } catch (error) {
    console.error('Error generating diagnostic:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
