// Assessment item generation (Plan P9.1). Thin orchestrator over the pure
// prompt builders + the fallback-aware object generator.

import { generateObjectWithFallback } from '@/lib/ai/generate'
import { aiAssessmentItemsSchema } from '@/lib/validation/schemas'
import { buildItemGenerationPrompt, buildConceptInventory } from './assessment-prompt.js'

export { buildItemGenerationPrompt, buildConceptInventory }

export async function generateAssessmentItems({
  subjectTitle,
  topicTitle = '',
  topics = [],
  lessonContent = '',
  itemCount = 8,
  difficulty = 3,
  userSecrets
}) {
  const conceptInventory = buildConceptInventory(topics)

  const result = await generateObjectWithFallback({
    schema: aiAssessmentItemsSchema,
    system:
      'You write assessment items that test only what was taught. Each item tests exactly one concept and carries its concept tag. Output only the JSON.',
    prompt: buildItemGenerationPrompt({
      subjectTitle,
      topicTitle,
      conceptInventory,
      lessonContent,
      itemCount,
      difficulty
    }),
    maxOutputTokens: 4000,
    userSecrets
  })

  return { items: result?.items || [], conceptInventory }
}
