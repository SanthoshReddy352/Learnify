// Topic-content generation core (Plan P5 / P6).
//
// Extracted from app/api/generate-topic-content/route.js so the SAME pipeline
// runs both synchronously (the existing route) and inside the Inngest
// background worker (lib/inngest/functions/generate-topic-content.js). This
// module does NO auth and NO database writes — callers resolve access and
// persist the result. Pure prompt/text helpers live in ./topic-content-prompt.js
// (alias-free, unit-tested); this file adds the AI + mermaid orchestration.

import { generateTextWithFallback, generateObjectWithFallback } from '@/lib/ai/generate'
import { ensureValidMermaid } from '@/lib/ai/mermaid'
import { topicOutlineSchema, conceptLedgerSchema, contentVerificationSchema } from '@/lib/validation/schemas'
import { gatherGrounding, buildReferencesSection } from '@/lib/ai/pipelines/grounding'
import {
  TOPIC_CONTENT_MAX_TOKENS,
  buildPersonalizationContext,
  buildTopicContentPrompt,
  buildOutlinePrompt,
  buildSectionPrompt,
  buildLedgerExtractionPrompt,
  buildVerificationPrompt,
  cleanTopicContent,
  sectionProgress
} from '@/lib/ai/pipelines/topic-content-prompt'

// Re-export the pure helpers so callers can import everything from one place.
export {
  TOPIC_CONTENT_MAX_TOKENS,
  buildPersonalizationContext,
  buildTopicContentPrompt,
  buildOutlinePrompt,
  buildSectionPrompt,
  buildLedgerExtractionPrompt,
  buildVerificationPrompt,
  cleanTopicContent,
  sectionProgress
}

// P6.5: extract the concept ledger (subject-memory record) from a finished lesson.
export async function extractConceptLedger({ topicTitle, content, userSecrets }) {
  return generateObjectWithFallback({
    schema: conceptLedgerSchema,
    system: 'You extract a compact concept ledger from a lesson. Output only the JSON.',
    prompt: buildLedgerExtractionPrompt({ topicTitle, content }),
    maxOutputTokens: 1200,
    userSecrets
  })
}

// P6.6: verify the lesson against the sources it was grounded in.
export async function verifyContentAgainstSources({ topicTitle, content, groundingContext, userSecrets }) {
  return generateObjectWithFallback({
    schema: contentVerificationSchema,
    system: 'You are a careful fact-checker. Output only the JSON.',
    prompt: buildVerificationPrompt({ topicTitle, content, groundingContext }),
    maxOutputTokens: 1500,
    userSecrets
  })
}

// Per-section token budget for sectioned generation (P6.4). Small enough that a
// section never truncates; the whole lesson is the sum across sections.
export const SECTION_MAX_TOKENS = 3500
const MAX_SECTIONS = 12

// Shared tail: clean → validate/repair mermaid → report. Used by both modes.
//
// Exported because the Inngest worker runs each stage as a separate step (see
// lib/inngest/functions/generate-topic-content.js): on a time-capped host a
// whole generation cannot fit in one function invocation, but each individual
// stage comfortably can.
export async function finalizeContent(rawContent, { userSecrets, onProgress } = {}) {
  const finalContent = cleanTopicContent(rawContent)
  if (!finalContent) {
    throw new Error('AI returned empty content')
  }

  onProgress?.({ progress: 70, stage: 'Validating diagrams' })

  // Validate every mermaid diagram server-side; self-repair failures, drop the
  // unrepairable. Broken diagrams never reach clients.
  const mermaidResult = await ensureValidMermaid(finalContent, { userSecrets })
  if (mermaidResult.stats.total > 0) {
    console.log(`[Content] Mermaid validation: ${JSON.stringify(mermaidResult.stats)}`)
  }

  onProgress?.({ progress: 90, stage: 'Finalizing' })

  return { content: mermaidResult.content, diagrams: mermaidResult.stats }
}

// Single-pass generation (the original behavior): one exhaustive call.
async function runSinglePass(inputs) {
  const {
    topicTitle,
    subjectTitle,
    difficulty = 5,
    topicDescription,
    personalizationContext = '',
    curriculumContext = '',
    neighborContext = '',
    learnerContext = '',
    groundingContext = '',
    userSecrets,
    onProgress
  } = inputs

  onProgress?.({ progress: 15, stage: 'Writing the lesson' })

  const prompt = buildTopicContentPrompt({
    topicTitle,
    subjectTitle,
    difficulty,
    topicDescription,
    personalizationContext,
    curriculumContext,
    neighborContext,
    learnerContext,
    groundingContext
  })

  const rawContent = await generateTextWithFallback({
    // Aligned with the PROPER-LENGTH guidance in the prompt — "exhaustive" here
    // was pulling generation back toward the over-length the user complained about.
    system: 'You are an expert tutor. Write clear, accurate, well-structured lessons — thorough but never padded or repetitive.',
    prompt,
    maxOutputTokens: TOPIC_CONTENT_MAX_TOKENS,
    userSecrets
  })

  return finalizeContent(rawContent, { userSecrets, onProgress })
}

// Two-pass sectioned generation (P6.4): plan an outline, then write each section
// against a bounded budget so long lessons never truncate mid-sentence.
// Grounding is re-sent per section; trim it there to keep token cost bounded.
const trimSectionGrounding = (groundingContext) =>
  groundingContext ? String(groundingContext).slice(0, 1500) : ''

/**
 * Stage 1 of sectioned generation: plan the lesson as an ordered section list.
 * Exported so the Inngest worker can run it as its own step.
 */
export async function planLessonSections(inputs) {
  const {
    topicTitle,
    subjectTitle,
    difficulty = 5,
    topicDescription,
    personalizationContext = '',
    curriculumContext = '',
    neighborContext = '',
    learnerContext = '',
    groundingContext = '',
    userSecrets
  } = inputs

  const outline = await generateObjectWithFallback({
    schema: topicOutlineSchema,
    system: 'You are an expert curriculum author. Plan a lesson as an ordered list of sections.',
    prompt: buildOutlinePrompt({
      topicTitle,
      subjectTitle,
      difficulty,
      topicDescription,
      personalizationContext,
      curriculumContext,
      neighborContext,
      learnerContext,
      groundingContext
    }),
    maxOutputTokens: 2000,
    userSecrets
  })

  const sections = (outline?.sections || []).slice(0, MAX_SECTIONS)
  if (sections.length === 0) {
    throw new Error('Outline produced no sections')
  }
  return sections
}

/**
 * Stage 2 of sectioned generation: write ONE section. Exported so the worker can
 * run each section as its own step — this is what keeps any single invocation
 * well inside a host's function time limit no matter how long the lesson is.
 */
export async function writeLessonSection({ sections, index, ...inputs }) {
  const {
    topicTitle,
    subjectTitle,
    difficulty = 5,
    personalizationContext = '',
    neighborContext = '',
    learnerContext = '',
    groundingContext = '',
    userSecrets
  } = inputs

  const sectionText = await generateTextWithFallback({
    system: 'You are an expert tutor writing ONE section of a lesson. Be thorough but stay strictly in scope.',
    prompt: buildSectionPrompt({
      section: sections[index],
      sections,
      index,
      topicTitle,
      subjectTitle,
      difficulty,
      personalizationContext,
      neighborContext,
      learnerContext,
      groundingContext: trimSectionGrounding(groundingContext)
    }),
    maxOutputTokens: SECTION_MAX_TOKENS,
    userSecrets
  })

  return cleanTopicContent(sectionText)
}

async function runSectioned(inputs) {
  const { onProgress, userSecrets } = inputs

  onProgress?.({ progress: 8, stage: 'Planning sections' })
  const sections = await planLessonSections(inputs)

  const parts = []
  for (let i = 0; i < sections.length; i += 1) {
    onProgress?.({
      progress: sectionProgress(i, sections.length),
      stage: `Writing section ${i + 1}/${sections.length}: ${sections[i].heading}`
    })
    parts.push(await writeLessonSection({ ...inputs, sections, index: i }))
  }

  const assembled = parts.filter(Boolean).join('\n\n')
  return finalizeContent(assembled, { userSecrets, onProgress })
}

// Full generation from resolved inputs. No auth, no DB. `onProgress` is an
// optional ({ progress, stage }) => void callback the background worker uses to
// stream Realtime progress; the sync route omits it. When `sectioned` is true
// (P6.4) it plans + writes section-by-section, falling back to single-pass if
// the outline step fails, so enabling it can never fully break generation.
export async function generateTopicContentFromInputs(inputs) {
  // P6.2: retrieve real sources first, ground the prompt in them, and append a
  // citations section. Best-effort — grounding failure falls through ungrounded.
  let groundingContext = ''
  let references = []
  if (inputs.grounded) {
    inputs.onProgress?.({ progress: 4, stage: 'Researching sources' })
    try {
      const grounding = await gatherGrounding({
        topicTitle: inputs.topicTitle,
        subjectTitle: inputs.subjectTitle
      })
      groundingContext = grounding.groundingContext
      references = grounding.references
    } catch (error) {
      console.warn(
        `[Content] Grounding failed, generating ungrounded: ${String(error?.message || error).slice(0, 200)}`
      )
    }
  }

  const withGrounding = { ...inputs, groundingContext }

  let result
  if (inputs.sectioned) {
    try {
      result = await runSectioned(withGrounding)
    } catch (error) {
      console.warn(
        `[Content] Sectioned generation failed, falling back to single-pass: ${String(error?.message || error).slice(0, 200)}`
      )
      result = await runSinglePass(withGrounding)
    }
  } else {
    result = await runSinglePass(withGrounding)
  }

  // P6.5: extract the concept ledger from the lesson body (before references are
  // appended). Best-effort — a failed extraction never blocks content.
  if (inputs.extractLedger) {
    inputs.onProgress?.({ progress: 92, stage: 'Summarizing concepts' })
    try {
      result.ledger = await extractConceptLedger({
        topicTitle: inputs.topicTitle,
        content: result.content,
        userSecrets: inputs.userSecrets
      })
    } catch (error) {
      console.warn(`[Content] Concept-ledger extraction failed: ${String(error?.message || error).slice(0, 200)}`)
    }
  }

  // P6.6: fact-check the lesson against its sources (grounded runs only).
  if (groundingContext && inputs.verify) {
    inputs.onProgress?.({ progress: 96, stage: 'Fact-checking against sources' })
    try {
      const verification = await verifyContentAgainstSources({
        topicTitle: inputs.topicTitle,
        content: result.content,
        groundingContext,
        userSecrets: inputs.userSecrets
      })
      result.verification = verification
      if (!verification.supported) {
        console.warn(`[Content] Verification flagged ${verification.issues.length} unsupported claim(s)`)
      }
    } catch (error) {
      console.warn(`[Content] Verification failed: ${String(error?.message || error).slice(0, 200)}`)
    }
  }

  if (references.length > 0) {
    const refsSection = buildReferencesSection(references)
    if (refsSection) {
      result = { ...result, content: `${result.content}\n\n${refsSection}`, references }
    }
  }

  return result
}
