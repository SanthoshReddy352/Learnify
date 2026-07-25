import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateAssessmentItems } from '@/lib/ai/pipelines/assessment'
import { normalizeGeneratedItems } from '@/lib/assessment/items'
import { generateAssessmentRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Build (or extend) a subject's concept-tagged item bank (Plan P9.1).
//
// Items are generated FROM the topics' P6.5 concept ledgers, so every question
// is aligned to material a lesson actually taught. Pass a topicId to generate
// for one topic (used by in-lesson practice), or omit it to draw across the
// whole subject (used to stock a summative exam).
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(generateAssessmentRequestSchema, await request.json().catch(() => ({})))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { subjectId, topicId, itemCount } = parsed.data

    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('id, title')
      .eq('id', subjectId)
      .eq('user_id', user.id)
      .single()
    if (subjectError || !subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }

    // The ledger column only exists after the P6.5 migration (P14).
    const withLedger = process.env.CONTENT_LEDGER === 'true'
    const topicColumns = withLedger
      ? 'id, title, difficulty, content, concept_ledger'
      : 'id, title, difficulty, content'

    let topicsQuery = supabase.from('topics').select(topicColumns).eq('subject_id', subjectId)
    if (topicId) topicsQuery = topicsQuery.eq('id', topicId)
    const { data: topics } = await topicsQuery

    if (!topics || topics.length === 0) {
      return NextResponse.json({ error: 'No topics to build items from' }, { status: 400 })
    }

    // Only draw on topics that have actually been generated — an empty lesson
    // has taught nothing, so items from it would test unseen material.
    const taught = topics.filter((t) => String(t.content || '').length > 50)
    if (taught.length === 0) {
      return NextResponse.json({
        error: 'Generate the lesson content first — items are built from what was taught.'
      }, { status: 400 })
    }

    const { data: userSecrets } = await supabase
      .from('user_secrets').select('*').eq('id', user.id).maybeSingle()

    const avgDifficulty = Math.round(
      taught.reduce((sum, t) => sum + (Number(t.difficulty) || 3), 0) / taught.length
    )

    const generated = await generateAssessmentItems({
      subjectTitle: subject.title,
      topicTitle: topicId ? taught[0]?.title || '' : '',
      topics: taught,
      // Single-topic runs get the lesson body for accuracy; subject-wide runs
      // rely on the concept inventory alone (sending every lesson would blow the
      // token budget).
      lessonContent: topicId ? taught[0]?.content || '' : '',
      itemCount,
      difficulty: avgDifficulty,
      userSecrets
    })

    const rows = normalizeGeneratedItems(generated.items, {
      subjectId,
      topicId: topicId || null
    })
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Generation returned no usable items' }, { status: 502 })
    }

    // Storage deferred to P14 (assessment_items); write only when enabled so the
    // route stays usable (preview-only) before the migration lands.
    let stored = 0
    if (process.env.ASSESSMENTS === 'true') {
      const { data: inserted, error: insertError } = await supabase
        .from('assessment_items')
        .insert(rows)
        .select('id')
      if (insertError) {
        console.error('Failed to store assessment items:', insertError)
      } else {
        stored = inserted?.length || 0
      }
    }

    return NextResponse.json({
      success: true,
      generated: rows.length,
      stored,
      // Never echo answer keys back to the client — the caller is the subject
      // owner, who in a self-paced subject is also the person sitting the exam.
      items: rows.map(({ correct_index, answer_key, explanation, ...safe }) => safe)
    })
  } catch (error) {
    console.error('Error generating assessment items:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
