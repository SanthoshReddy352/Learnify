import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveTopicAccess } from '@/lib/classrooms/access'
import { fetchTopicNeighbors, buildNeighborContext } from '@/lib/topics/neighbors'
import { fetchConceptState, buildLearnerMemoryContext } from '@/lib/memory/concept-state'
import { buildPersonalizationContext, generateTopicContentFromInputs } from '@/lib/ai/pipelines/topic-content'
import { generateTopicContentRequestSchema, parseOr400 } from '@/lib/validation/schemas'
import { reportError } from '@/lib/observability/report'

// DECISION (2026-07-22): visuals are mermaid-only. External image search and
// AI image generation are deferred — diagrams are validated and self-repaired
// server-side before content is saved (lib/ai/mermaid.js).

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = parseOr400(generateTopicContentRequestSchema, await request.json())
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const {
      topicId,
      subjectTitle,
      topicTitle,
      topicDescription,
      difficulty = 5,
      classroomId,
      classroomCourseId
    } = parsed.data

    const topicAccess = await resolveTopicAccess(supabase, {
      userId: user.id,
      topicId,
      classroomId,
      classroomCourseId
    })
    if (topicAccess.mode === 'classroom' && !topicAccess.adminClient) {
      return NextResponse.json({
        error: 'Classroom content generation requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }
    const effectiveTopic = topicAccess.topic
    const effectiveSubject = topicAccess.subject

    // === FETCH USER'S API KEY ===
    const { data: userSecrets, error: userError } = await supabase
      .from('user_secrets')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (userError) {
      console.error('Error fetching user data:', userError)
      // Don't fail hard
    }


    // === FETCH USER PROFILE FOR PERSONALIZATION ===
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('education_level, learning_goals, preferred_learning_style, occupation')
      .eq('id', user.id)
      .single()

    const personalizationContext = (!profileError && userProfile)
      ? buildPersonalizationContext(userProfile)
      : ''

    // === SUBJECT-BASED VISUAL REASONING ===
    const effectiveSubjectTitle = subjectTitle || effectiveSubject?.title || 'Untitled Subject'
    const effectiveSubjectDescription = String(effectiveSubject?.description || '').trim()
    const effectiveSubjectSyllabus = String(effectiveSubject?.syllabus || '').trim()
    const effectiveTopicTitle = topicTitle || effectiveTopic?.title || 'Untitled Topic'
    const effectiveTopicDescription = topicDescription || effectiveTopic?.description || effectiveTopicTitle
    const effectiveDifficulty = difficulty || effectiveTopic?.difficulty || 5
    const curriculumContext = [
      effectiveSubjectDescription ? `Teacher subject description:\n${effectiveSubjectDescription}` : '',
      effectiveSubjectSyllabus ? `Teacher syllabus / scope:\n${effectiveSubjectSyllabus}` : ''
    ].filter(Boolean).join('\n\n')

    // === DAG-NEIGHBOR CONTINUITY CONTEXT (Plan P6.3) ===
    // Tell the model what the student already learned (prerequisites) and what
    // comes next (dependents), so it references prior topics instead of
    // re-teaching them and stays scoped to this node in the graph.
    let neighborContext = ''
    try {
      const reader = topicAccess.adminClient || supabase
      const neighbors = await fetchTopicNeighbors(reader, {
        subjectId: effectiveTopic?.subject_id || effectiveSubject?.id,
        topicId,
        includeLedger: process.env.CONTENT_LEDGER === 'true'
      })
      neighborContext = buildNeighborContext(neighbors)
    } catch (neighborError) {
      // Continuity context is best-effort — never fail generation over it.
      console.error('Failed to build neighbor context:', neighborError)
    }

    // === LEARNER MEMORY (Plan P8.2) ===
    // What THIS student has already mastered vs. repeatedly struggled with in
    // this subject, from their own reviews/questions. Read through the user's
    // own client (owner-only RLS) even in classroom mode — the memory is theirs.
    let learnerContext = ''
    try {
      const conceptRows = await fetchConceptState(supabase, {
        userId: user.id,
        subjectId: effectiveTopic?.subject_id || effectiveSubject?.id
      })
      learnerContext = buildLearnerMemoryContext(conceptRows)
    } catch (memoryError) {
      // Personalization is best-effort — never fail generation over it.
      console.error('Failed to build learner memory context:', memoryError)
    }

    console.log(`Generating content for topic: ${effectiveTopicTitle}`)

    // Generation core is shared with the Inngest background worker
    // (lib/ai/pipelines/topic-content.js) — this route runs it synchronously.
    const generated = await generateTopicContentFromInputs({
      topicTitle: effectiveTopicTitle,
      subjectTitle: effectiveSubjectTitle,
      difficulty: effectiveDifficulty,
      topicDescription: effectiveTopicDescription,
      personalizationContext,
      curriculumContext,
      neighborContext,
      learnerContext,
      userSecrets,
      // P6.4 two-pass sectioned generation (kills truncation). Off by default;
      // enable with CONTENT_SECTIONED=true once verified.
      sectioned: process.env.CONTENT_SECTIONED === 'true',
      // P6.2 web-grounding + citations. Off by default; enable with
      // CONTENT_GROUNDING=true (adds network latency — pairs with async jobs).
      grounded: process.env.CONTENT_GROUNDING === 'true',
      // P6.5 concept-ledger extraction / P6.6 verification. Off by default; the
      // ledger column exists only after the P14 migration.
      extractLedger: process.env.CONTENT_LEDGER === 'true',
      verify: process.env.CONTENT_VERIFY === 'true'
    })
    const finalContent = generated.content
    const diagrams = generated.diagrams

    // Update the topic with the new content
    const writer = topicAccess.adminClient || supabase
    const { error: updateError } = await writer
        .from('topics')
        .update({ content: finalContent })
        .eq('id', topicId)

    if (updateError) {
        console.error('Error updating topic content:', updateError)
        throw new Error('Failed to save generated content')
    }

    // P6.5: persist the concept ledger in a SEPARATE update so a missing column
    // (pre-P14) or extraction miss never risks the content save above.
    if (generated.ledger && process.env.CONTENT_LEDGER === 'true') {
        const { error: ledgerError } = await writer
            .from('topics')
            .update({ concept_ledger: generated.ledger })
            .eq('id', topicId)
        if (ledgerError) {
            console.error('Failed to store concept ledger:', ledgerError)
        }
    }

    return NextResponse.json({
      success: true,
      content: finalContent,
      diagrams
    })

  } catch (error) {
    // Content generation is the longest, most provider-dependent path in the app
    // and the one whose failures a learner actually feels, so it reports rather
    // than only logging. `reportError` redacts before anything leaves the process
    // (provider errors routinely echo the request URL, key included).
    await reportError(error, { scope: 'generate-topic-content' })
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 })
  }
}
