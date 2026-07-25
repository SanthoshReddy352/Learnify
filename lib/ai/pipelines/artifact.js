// Interactive-artifact generation (Plan P7.3). Thin orchestrator over the pure
// prompt builder + the fallback-aware object generator. The returned `html` is
// UNTRUSTED and must only ever be rendered in the sandboxed ArtifactFrame.

import { generateObjectWithFallback } from '@/lib/ai/generate'
import { interactiveArtifactSchema } from '@/lib/validation/schemas'
import { buildArtifactPrompt } from './artifact-prompt.js'

export { buildArtifactPrompt }

export async function generateArtifact({ topicTitle, difficulty = 3, userSecrets }) {
  return generateObjectWithFallback({
    schema: interactiveArtifactSchema,
    system: 'You build small, self-contained, offline interactive learning widgets. Output only the JSON.',
    prompt: buildArtifactPrompt({ topicTitle, difficulty }),
    maxOutputTokens: 4000,
    userSecrets
  })
}
