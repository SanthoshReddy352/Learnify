// Diagnostic placement generation (Plan P8.4). Thin orchestrator over the pure
// prompt builders + the fallback-aware object generator.

import { generateObjectWithFallback } from '@/lib/ai/generate'
import { diagnosticSchema } from '@/lib/validation/schemas'
import {
  buildDiagnosticPrompt,
  buildTopicDigest,
  gradeDiagnostic,
  suggestSkippableTopics
} from './diagnostic-prompt.js'

export { buildDiagnosticPrompt, buildTopicDigest, gradeDiagnostic, suggestSkippableTopics }

export async function generateDiagnostic({
  subjectTitle,
  subjectSyllabus = '',
  topics = [],
  questionCount = 8,
  difficulty = 3,
  userSecrets
}) {
  const result = await generateObjectWithFallback({
    schema: diagnosticSchema,
    system:
      'You write short, well-calibrated diagnostic placement questions. Each question tests exactly one concept. Output only the JSON.',
    prompt: buildDiagnosticPrompt({
      subjectTitle,
      subjectSyllabus,
      topicDigest: buildTopicDigest(topics),
      questionCount,
      difficulty
    }),
    maxOutputTokens: 3000,
    userSecrets
  })

  // Guard against a model that returns an out-of-range answer index — that would
  // silently mark a correct answer wrong and poison the learner's memory.
  const questions = (result?.questions || []).filter(
    (q) => Array.isArray(q.options) && q.correct_index >= 0 && q.correct_index < q.options.length
  )
  if (questions.length === 0) {
    throw new Error('Diagnostic generation returned no usable questions')
  }

  return { questions: questions.slice(0, questionCount) }
}
