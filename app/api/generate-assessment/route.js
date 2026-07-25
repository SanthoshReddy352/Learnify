import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateAssessmentItems } from '@/lib/ai/pipelines/assessment'
import { normalizeGeneratedItemsWithReport, summarizeDropped } from '@/lib/assessment/items'
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

    // Generation is non-deterministic, and a single bad run where every item
    // trips a validation rule used to surface to the learner as a hard failure.
    // Retry once before giving up — the second sample is usually fine, and the
    // cost of one extra call beats a dead-end button.
    let rows = []
    let lastDropped = []
    for (let attempt = 1; attempt <= 2; attempt += 1) {
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

      const report = normalizeGeneratedItemsWithReport(generated.items, {
        subjectId,
        topicId: topicId || null
      })
      rows = report.rows
      lastDropped = report.dropped

      if (report.dropped.length > 0) {
        // Always log, even on a successful run: a rule quietly eating half of
        // every batch is exactly the kind of thing that stays invisible.
        console.warn(
          `[Assessment] attempt ${attempt}: kept ${rows.length}, dropped ${report.dropped.length} — ${summarizeDropped(report.dropped)}`
        )
      }
      if (rows.length > 0) break
    }

    if (rows.length === 0) {
      // 422, not 502: the upstream model answered fine, its output just did not
      // survive validation. 502 also collides with the host's own gateway errors,
      // which made this look like infrastructure rather than content.
      return NextResponse.json({
        error: 'The model could not produce usable questions for this lesson. Try again, or regenerate the lesson if it is very short.',
        details: summarizeDropped(lastDropped) || 'the model returned no items'
      }, { status: 422 })
    }

    // Storage deferred to P14 (assessment_items); write only when enabled so the
    // route stays usable (preview-only) before the migration lands.
    let stored = 0
    let storageError = null
    if (process.env.ASSESSMENTS === 'true') {
      const { data: inserted, error: insertError } = await supabase
        .from('assessment_items')
        .insert(rows)
        .select('id')
      if (insertError) {
        // Surfaced, not just logged. A silent insert failure is indistinguishable
        // from "storage is turned off" at the client, and both render as
        // questions that mysteriously never come back.
        console.error('Failed to store assessment items:', insertError)
        storageError = insertError.message
      } else {
        stored = inserted?.length || 0
      }
    } else {
      storageError = 'ASSESSMENTS is not enabled on the server, so questions are preview-only.'
    }

    return NextResponse.json({
      success: true,
      generated: rows.length,
      stored,
      storageError,
      // Never echo answer keys back to the client — the caller is the subject
      // owner, who in a self-paced subject is also the person sitting the exam.
      items: rows.map(({ correct_index, answer_key, explanation, ...safe }) => safe)
    })
  } catch (error) {
    console.error('Error generating assessment items:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
