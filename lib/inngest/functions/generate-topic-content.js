import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTopicAccess } from '@/lib/classrooms/access'
import { fetchTopicNeighbors, buildNeighborContext } from '@/lib/topics/neighbors'
import { fetchConceptState, buildLearnerMemoryContext } from '@/lib/memory/concept-state'
import {
  buildPersonalizationContext,
  planLessonSections,
  writeLessonSection,
  sectionProgress,
  finalizeContent,
  extractConceptLedger,
  verifyContentAgainstSources,
  generateTopicContentFromInputs
} from '@/lib/ai/pipelines/topic-content'
import { gatherGrounding, buildReferencesSection } from '@/lib/ai/pipelines/grounding'
import { inngest, EVENTS } from '@/lib/inngest/client'
import { reportError } from '@/lib/observability/report'

// Background worker for topic-content generation (Plan P5).
//
// WHY THIS IS BUILT AS STEPS, not one long function body:
//
// Inngest does not run this code on Inngest's servers — it calls back into our
// own /api/inngest route, which is an ordinary serverless function bound by the
// host's time limit (60s on Vercel Hobby, and that limit CANNOT be raised).
// A full generation takes ~100s and grows with every optional stage, so a worker
// written as one uninterrupted call times out exactly like the synchronous route
// it was supposed to rescue.
//
// `step.run()` is the mechanism that actually solves it: each step is a SEPARATE
// invocation with its own fresh time budget, and completed steps are memoized.
// So a lesson of N sections runs as N+4 short invocations and can take as long as
// it likes in total, while no single invocation goes near the cap. A retry also
// resumes from the last completed step instead of re-paying for the whole lesson.
//
// SECURITY — the one rule to preserve here: a step's return value is persisted by
// Inngest. `user_secrets` holds the learner's OWN provider API keys (Phase 0.3),
// so secrets are re-read inside each step that needs them and are NEVER returned
// from one. Everything crossing a step boundary is prompt text and lesson markdown.

const MAX_SECTIONS_HARD_CAP = 12

export const generateTopicContentJob = inngest.createFunction(
  { id: 'generate-topic-content', name: 'Generate topic content', retries: 2 },
  { event: EVENTS.TOPIC_CONTENT_REQUESTED },
  async ({ event, step }) => {
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

    // Re-read inside each step that needs it. Deliberately not hoisted into a
    // step result — see the security note above.
    const loadSecrets = async () => {
      const { data } = await admin.from('user_secrets').select('*').eq('id', userId).maybeSingle()
      return data
    }

    try {
      // MUST be a step. The function body replays on every invocation, so an
      // unwrapped write here would reset progress to 5 before each of the N
      // section steps — the progress bar would jump backwards all run.
      await step.run('mark-running', () =>
        setJob({
          status: 'running',
          stage: 'Starting',
          progress: 5,
          started_at: new Date().toISOString()
        })
      )

      // ---- Step 1: resolve access + build every prompt context string. ------
      // Returns only non-secret text, so it is safe to memoize.
      const context = await step.run('prepare-context', async () => {
        const topicAccess = await resolveTopicAccess(admin, {
          userId,
          topicId,
          classroomId,
          classroomCourseId
        })
        const effectiveTopic = topicAccess.topic
        const effectiveSubject = topicAccess.subject
        const subjectId = effectiveTopic?.subject_id || effectiveSubject?.id

        const { data: userProfile } = await admin
          .from('profiles')
          .select('education_level, learning_goals, preferred_learning_style, occupation')
          .eq('id', userId)
          .maybeSingle()

        let neighborContext = ''
        try {
          const neighbors = await fetchTopicNeighbors(admin, {
            subjectId,
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
          const conceptRows = await fetchConceptState(admin, { userId, subjectId })
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

        // Only serializable prompt text crosses the step boundary — a Supabase
        // client cannot, and `resolveTopicAccess().adminClient` is the same
        // service-role client we already hold as `admin`.
        return {
          subjectId,
          topicTitle: topicTitle || effectiveTopic?.title || 'Untitled Topic',
          subjectTitle: subjectTitle || effectiveSubject?.title || 'Untitled Subject',
          difficulty: difficulty || effectiveTopic?.difficulty || 5,
          topicDescription:
            topicDescription || effectiveTopic?.description || topicTitle || effectiveTopic?.title,
          personalizationContext: buildPersonalizationContext(userProfile),
          curriculumContext,
          neighborContext,
          learnerContext
        }
      })

      // ---- Step 2: web grounding (P6.2). Best-effort. ----------------------
      const grounding = await step.run('gather-grounding', async () => {
        if (process.env.CONTENT_GROUNDING !== 'true') {
          return { groundingContext: '', references: [] }
        }
        await setJob({ progress: 4, stage: 'Researching sources' })
        try {
          return await gatherGrounding({
            topicTitle: context.topicTitle,
            subjectTitle: context.subjectTitle
          })
        } catch (error) {
          console.warn(
            `[Content] Grounding failed, generating ungrounded: ${String(error?.message || error).slice(0, 200)}`
          )
          return { groundingContext: '', references: [] }
        }
      })

      const promptInputs = { ...context, groundingContext: grounding.groundingContext }

      // ---- Step 3: plan the sections. --------------------------------------
      // The worker ALWAYS generates section-by-section, regardless of
      // CONTENT_SECTIONED (which governs the synchronous route). One long call
      // cannot fit in a single invocation, so sectioning is not optional here —
      // it is the thing that makes the worker viable at all.
      const sections = await step.run('plan-sections', async () => {
        await setJob({ progress: 8, stage: 'Planning sections' })
        try {
          const planned = await planLessonSections({
            ...promptInputs,
            userSecrets: await loadSecrets()
          })
          return planned.slice(0, MAX_SECTIONS_HARD_CAP)
        } catch (error) {
          console.warn(
            `[Content] Outline failed, falling back to single-pass: ${String(error?.message || error).slice(0, 200)}`
          )
          return []
        }
      })

      // ---- Step 4..N: write each section as its OWN invocation. ------------
      let assembled = ''
      if (sections.length > 0) {
        const parts = []
        for (let i = 0; i < sections.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop -- steps are sequential by design
          const part = await step.run(`write-section-${i}`, async () => {
            await setJob({
              progress: sectionProgress(i, sections.length),
              stage: `Writing section ${i + 1}/${sections.length}: ${sections[i].heading}`
            })
            return writeLessonSection({
              ...promptInputs,
              sections,
              index: i,
              userSecrets: await loadSecrets()
            })
          })
          parts.push(part)
        }
        assembled = parts.filter(Boolean).join('\n\n')
      }

      // ---- Step 5: finalize (clean + validate/repair mermaid). -------------
      // If the outline step failed we fall back to one whole-lesson call here.
      // That single call may exceed a 60s cap on a constrained host — it is the
      // degraded path, and it is still better than failing outright.
      const finalized = await step.run('finalize', async () => {
        await setJob({ progress: 70, stage: 'Validating diagrams' })
        const userSecrets = await loadSecrets()
        if (assembled) {
          return finalizeContent(assembled, { userSecrets })
        }
        const fallback = await generateTopicContentFromInputs({
          ...promptInputs,
          userSecrets,
          sectioned: false,
          grounded: false, // already gathered in step 2
          extractLedger: false,
          verify: false
        })
        return { content: fallback.content, diagrams: fallback.diagrams }
      })

      // ---- Step 6: concept ledger (P6.5). Best-effort. ---------------------
      const ledger = await step.run('extract-ledger', async () => {
        if (process.env.CONTENT_LEDGER !== 'true') return null
        await setJob({ progress: 92, stage: 'Summarizing concepts' })
        try {
          return await extractConceptLedger({
            topicTitle: context.topicTitle,
            content: finalized.content,
            userSecrets: await loadSecrets()
          })
        } catch (error) {
          console.warn(
            `[Content] Concept-ledger extraction failed: ${String(error?.message || error).slice(0, 200)}`
          )
          return null
        }
      })

      // ---- Step 7: source verification (P6.6). Best-effort. ----------------
      await step.run('verify-content', async () => {
        if (!grounding.groundingContext || process.env.CONTENT_VERIFY !== 'true') return null
        await setJob({ progress: 96, stage: 'Fact-checking against sources' })
        try {
          const verification = await verifyContentAgainstSources({
            topicTitle: context.topicTitle,
            content: finalized.content,
            groundingContext: grounding.groundingContext,
            userSecrets: await loadSecrets()
          })
          if (!verification.supported) {
            console.warn(
              `[Content] Verification flagged ${verification.issues.length} unsupported claim(s)`
            )
          }
          return verification
        } catch (error) {
          console.warn(`[Content] Verification failed: ${String(error?.message || error).slice(0, 200)}`)
          return null
        }
      })

      // ---- Step 8: persist. ------------------------------------------------
      await step.run('save-content', async () => {
        const refsSection = grounding.references?.length
          ? buildReferencesSection(grounding.references)
          : ''
        const content = refsSection ? `${finalized.content}\n\n${refsSection}` : finalized.content

        const { error: updateError } = await admin
          .from('topics')
          .update({ content })
          .eq('id', topicId)
        if (updateError) {
          throw new Error(`Failed to save generated content: ${updateError.message}`)
        }

        // P6.5: persist the ledger in a SEPARATE update — a failed extraction or
        // a missing column must never risk the content save above.
        if (ledger && process.env.CONTENT_LEDGER === 'true') {
          const { error: ledgerError } = await admin
            .from('topics')
            .update({ concept_ledger: ledger })
            .eq('id', topicId)
          if (ledgerError) {
            console.error('Failed to store concept ledger:', ledgerError)
          }
        }
        return { saved: true }
      })

      await setJob({
        status: 'succeeded',
        progress: 100,
        stage: 'Done',
        result: { diagrams: finalized.diagrams },
        finished_at: new Date().toISOString()
      })

      return { ok: true, diagrams: finalized.diagrams }
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
