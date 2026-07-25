// Project-track generation (Plan P7.4). Thin orchestrator over the pure prompt
// builder + the fallback-aware object generator.

import { generateObjectWithFallback } from '@/lib/ai/generate'
import { projectTrackSchema } from '@/lib/validation/schemas'
import { buildProjectPrompt } from './project-prompt.js'

export { buildProjectPrompt }

export async function generateProjectTrack({
  subjectTitle,
  subjectDescription = '',
  difficulty = 3,
  personalizationContext = '',
  userSecrets
}) {
  return generateObjectWithFallback({
    schema: projectTrackSchema,
    system: 'You design practical, scaffolded learning projects. Output only the JSON.',
    prompt: buildProjectPrompt({ subjectTitle, subjectDescription, difficulty, personalizationContext }),
    maxOutputTokens: 2500,
    userSecrets
  })
}
