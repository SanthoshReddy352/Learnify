import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'

/**
 * Provider-agnostic model registry (Phase 3.1).
 *
 * Returns an ordered list of model candidates; lib/ai/generate.js walks the
 * list until one succeeds (replaces the old hand-rolled Gemini fallback loop
 * in lib/gemini.js).
 *
 * Configuration (all env vars optional except GEMINI_API_KEY as the default):
 *   AI_PROVIDER_ORDER      comma list, default "google,openai-compatible,anthropic"
 *   GEMINI_API_KEY         system Google key (user BYOK keys take priority)
 *   GEMINI_MODELS          comma list, default "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash"
 *   OPENAI_COMPAT_BASE_URL any OpenAI-compatible endpoint (Ollama, LM Studio,
 *                          OpenRouter, vLLM, Groq, ...) e.g. http://localhost:11434/v1
 *   OPENAI_COMPAT_API_KEY  key for that endpoint (optional for local servers)
 *   OPENAI_COMPAT_MODELS   comma list of model ids on that endpoint
 *   ANTHROPIC_API_KEY      Anthropic key
 *   ANTHROPIC_MODELS       comma list, default "claude-sonnet-5"
 */

const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
const DEFAULT_ANTHROPIC_MODELS = ['claude-sonnet-5']

function csv(value, fallback = []) {
  const items = String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length > 0 ? items : fallback
}

function googleCandidates(userSecrets) {
  const modelIds = csv(process.env.GEMINI_MODELS, DEFAULT_GEMINI_MODELS)
  const candidates = []
  const userKey = userSecrets?.gemini_api_key || null

  // The user's own key (BYOK) always outranks the system key.
  for (const apiKey of [userKey, process.env.GEMINI_API_KEY]) {
    if (!apiKey) continue
    const google = createGoogleGenerativeAI({ apiKey })
    for (const id of modelIds) {
      candidates.push({
        label: `google/${id}${apiKey === userKey ? ' (user key)' : ''}`,
        model: google(id)
      })
    }
  }

  return candidates
}

function openAICompatibleCandidates(userSecrets) {
  const candidates = []

  // User-configured endpoint (Settings page) first, env endpoint second.
  const sources = [
    {
      tag: ' (user endpoint)',
      baseURL: userSecrets?.openai_compat_base_url,
      apiKey: userSecrets?.openai_compat_api_key,
      models: csv(userSecrets?.openai_compat_models)
    },
    {
      tag: '',
      baseURL: process.env.OPENAI_COMPAT_BASE_URL,
      apiKey: process.env.OPENAI_COMPAT_API_KEY,
      models: csv(process.env.OPENAI_COMPAT_MODELS)
    }
  ]

  for (const source of sources) {
    if (!source.baseURL || source.models.length === 0) continue
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: source.baseURL,
      apiKey: source.apiKey || 'not-needed'
    })
    for (const id of source.models) {
      candidates.push({ label: `openai-compatible/${id}${source.tag}`, model: provider(id) })
    }
  }

  return candidates
}

function anthropicCandidates(userSecrets) {
  const modelIds = csv(process.env.ANTHROPIC_MODELS, DEFAULT_ANTHROPIC_MODELS)
  const candidates = []
  const userKey = userSecrets?.anthropic_api_key || null

  for (const apiKey of [userKey, process.env.ANTHROPIC_API_KEY]) {
    if (!apiKey) continue
    const anthropic = createAnthropic({ apiKey })
    for (const id of modelIds) {
      candidates.push({
        label: `anthropic/${id}${apiKey === userKey ? ' (user key)' : ''}`,
        model: anthropic(id)
      })
    }
  }

  return candidates
}

/**
 * @param {{ userSecrets?: {
 *   gemini_api_key?: string|null,
 *   anthropic_api_key?: string|null,
 *   openai_compat_base_url?: string|null,
 *   openai_compat_api_key?: string|null,
 *   openai_compat_models?: string|null
 * } | null }} opts  Per-user provider config from the user_secrets table;
 * user-configured providers always outrank server env config.
 * @returns {Array<{ label: string, model: import('ai').LanguageModel }>}
 */
export function getModelCandidates({ userSecrets = null } = {}) {
  const order = csv(process.env.AI_PROVIDER_ORDER, ['google', 'openai-compatible', 'anthropic'])
  const byProvider = {
    google: googleCandidates,
    'openai-compatible': openAICompatibleCandidates,
    anthropic: anthropicCandidates
  }

  const candidates = []
  for (const providerName of order) {
    const factory = byProvider[providerName]
    if (factory) {
      candidates.push(...factory(userSecrets))
    }
  }

  return candidates
}
