import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTopicAccess } from '@/lib/classrooms/access'
import { fetchTopicNeighbors, buildNeighborContext } from '@/lib/topics/neighbors'
import { fetchConceptState, buildLearnerMemoryContext } from '@/lib/memory/concept-state'
import {
  buildPersonalizationContext,
  generateTopicContentFromInputs
} from '@/lib/ai/pipelines/topic-content'
import { inngest, EVENTS } from '@/lib/inngest/client'
import { reportError } from '@/lib/observability/report'

// Background worker for topic-content generation (Plan P5).
//
// Runs the SAME pipeline as the synchronous route
// (lib/ai/pipelines/topic-content.js) but off the request path, streaming
// progress into `generation_jobs` (clients watch it via Supabase Realtime).
// It authenticates via the service-role admin client and re-derives access
// from the userId captured at enqueue time.
export const generateTopicContentJob = inngest.createFunction(
  { id: 'generate-topic-content', name: 'Generate topic content', retries: 2 },
  { event: EVENTS.TOPIC_CONTENT_REQUESTED },
  async ({ event }) => {
    const {
      jobId,
      userId,
      topicId,
      subjectTitle,
      topicTitle,
      topicDescription,
      difficulty,
      classroomId,
      classroomCourseId
    } = event.data

    const admin = createAdminClient()
    if (!admin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for background generation')
    }

    const setJob = (patch) => admin.from('generation_jobs').update(patch).eq('id', jobId)

    await setJob({
      status: 'running',
      stage: 'Starting',
      progress: 5,
      started_at: new Date().toISOString()
    })

    try {
      const topicAccess = await resolveTopicAccess(admin, {
        userId,
        topicId,
        classroomId,
        classroomCourseId
      })
      const effectiveTopic = topicAccess.topic
      const effectiveSubject = topicAccess.subject

      const [{ data: userSecrets }, { data: userProfile }] = await Promise.all([
        admin.from('user_secrets').select('*').eq('id', userId).maybeSingle(),
        admin
          .from('profiles')
          .select('education_level, learning_goals, preferred_learning_style, occupation')
          .eq('id', userId)
          .maybeSingle()
      ])

      let neighborContext = ''
      try {
        const neighbors = await fetchTopicNeighbors(admin, {
          subjectId: effectiveTopic?.subject_id || effectiveSubject?.id,
          topicId,
          includeLedger: process.env.CONTENT_LEDGER === 'true'
        })
        neighborContext = buildNeighborContext(neighbors)
      } catch (neighborError) {
        console.error('Failed to build neighbor context (worker):', neighborError)
      }

      // P8.2 learner memory. The admin client bypasses RLS, so scope the read
      // explicitly to this job's user — never anyone else's memory.
      let learnerContext = ''
      try {
        const conceptRows = await fetchConceptState(admin, {
          userId,
          subjectId: effectiveTopic?.subject_id || effectiveSubject?.id
        })
        learnerContext = buildLearnerMemoryContext(conceptRows)
      } catch (memoryError) {
        console.error('Failed to build learner memory context (worker):', memoryError)
      }

      const curriculumContext = [
        effectiveSubject?.description
          ? `Teacher subject description:\n${String(effectiveSubject.description).trim()}`
          : '',
        effectiveSubject?.syllabus
          ? `Teacher syllabus / scope:\n${String(effectiveSubject.syllabus).trim()}`
          : ''
      ]
        .filter(Boolean)
        .join('\n\n')

      const generated = await generateTopicContentFromInputs({
        topicTitle: topicTitle || effectiveTopic?.title || 'Untitled Topic',
        subjectTitle: subjectTitle || effectiveSubject?.title || 'Untitled Subject',
        difficulty: difficulty || effectiveTopic?.difficulty || 5,
        topicDescription:
          topicDescription || effectiveTopic?.description || topicTitle || effectiveTopic?.title,
        personalizationContext: buildPersonalizationContext(userProfile),
        curriculumContext,
        neighborContext,
        learnerContext,
        userSecrets,
        // P6.4 two-pass sectioned generation; off by default (CONTENT_SECTIONED).
        sectioned: process.env.CONTENT_SECTIONED === 'true',
        // P6.2 web-grounding + citations; off by default (CONTENT_GROUNDING).
        grounded: process.env.CONTENT_GROUNDING === 'true',
        // P6.5 ledger / P6.6 verify; off by default (ledger column exists post-P14).
        extractLedger: process.env.CONTENT_LEDGER === 'true',
        verify: process.env.CONTENT_VERIFY === 'true',
        onProgress: ({ progress, stage }) => setJob({ progress, stage })
      })
      const { content, diagrams } = generated

      const writer = topicAccess.adminClient || admin
      const { error: updateError } = await writer
        .from('topics')
        .update({ content })
        .eq('id', topicId)
      if (updateError) {
        throw new Error(`Failed to save generated content: ${updateError.message}`)
      }

      // P6.5: persist the concept ledger separately (missing column pre-P14 or a
      // failed extraction must never risk the content save above).
      if (generated.ledger && process.env.CONTENT_LEDGER === 'true') {
        const { error: ledgerError } = await writer
          .from('topics')
          .update({ concept_ledger: generated.ledger })
          .eq('id', topicId)
        if (ledgerError) {
          console.error('Failed to store concept ledger:', ledgerError)
        }
      }

      await setJob({
        status: 'succeeded',
        progress: 100,
        stage: 'Done',
        result: { diagrams },
        finished_at: new Date().toISOString()
      })

      return { ok: true, diagrams }
    } catch (error) {
      await setJob({
        status: 'failed',
        error: String(error?.message || error).slice(0, 500),
        finished_at: new Date().toISOString()
      })
      // Awaited deliberately: this is a background worker, and once the function
      // returns (or rethrows) the invocation can be frozen before a
      // fire-and-forget POST would flush.
      await reportError(error, {
        scope: 'worker:generate-topic-content',
        userId,
        tags: { jobId, topicId }
      })
      throw error
    }
  }
)
