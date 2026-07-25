import { generateText, generateObject } from 'ai'
import { getModelCandidates } from './registry.js'

/**
 * Some OpenAI-compatible endpoints (e.g. OpenCode Zen / big-pickle) do not
 * support the AI SDK's native structured-output transport (responseFormat
 * JSON schema). Detect those failures so we can fall back to text+parse.
 */
function isStructuredOutputUnsupported(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  return (
    msg.includes('responseformat') ||
    msg.includes('structuredoutput') ||
    msg.includes('response_format') ||
    msg.includes('did not match schema') ||
    msg.includes('no object generated') ||
    msg.includes('json_schema')
  )
}

function stripJsonFences(text) {
  return String(text || '')
    .replace(/^﻿/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

/** Pull the first balanced JSON object/array out of arbitrary model text. */
function extractJson(text) {
  const cleaned = stripJsonFences(text)
  try {
    return JSON.parse(cleaned)
  } catch {}
  const start = cleaned.search(/[[{]/)
  if (start === -1) throw new Error('No JSON found in model output')
  const open = cleaned[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < cleaned.length; i += 1) {
    const c = cleaned[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === open) depth += 1
    else if (c === close) {
      depth -= 1
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1))
    }
  }
  throw new Error('Unbalanced JSON in model output')
}

/**
 * Fallback-aware generation helpers (Phase 3.1/3.2).
 * Each helper walks the model registry in order until one call succeeds.
 */

function normalizeSecrets({ userSecrets, userGeminiKey }) {
  if (userSecrets) return userSecrets
  if (userGeminiKey) return { gemini_api_key: userGeminiKey }
  return null
}

async function withFallback(operation, { userSecrets } = {}) {
  const candidates = getModelCandidates({ userSecrets })
  if (candidates.length === 0) {
    throw new Error('No AI providers configured. Set GEMINI_API_KEY (or another provider) in the environment.')
  }

  let lastError = null
  for (const candidate of candidates) {
    try {
      const result = await operation(candidate.model)
      console.log(`[AI] Success with ${candidate.label}`)
      return result
    } catch (error) {
      console.warn(`[AI] ${candidate.label} failed: ${String(error?.message || error).slice(0, 300)}`)
      lastError = error
    }
  }

  throw lastError || new Error('All AI model candidates failed')
}

/**
 * Generate plain text.
 * @param {{ system?: string, prompt?: string, messages?: Array<{role: string, content: string}>,
 *           temperature?: number, maxOutputTokens?: number, userGeminiKey?: string | null }} opts
 * @returns {Promise<string>}
 */
export async function generateTextWithFallback({
  system,
  prompt,
  messages,
  temperature = 0.7,
  maxOutputTokens = 8000,
  userSecrets = null,
  userGeminiKey = null
}) {
  const { text } = await withFallback(
    (model) =>
      generateText({
        model,
        system,
        ...(messages ? { messages } : { prompt }),
        temperature,
        maxOutputTokens
      }),
    { userSecrets: normalizeSecrets({ userSecrets, userGeminiKey }) }
  )

  if (!text || !text.trim()) {
    throw new Error('AI returned empty content')
  }
  return text
}

/**
 * Generate a zod-validated object.
 *
 * Fast path: native generateObject (structured outputs) for capable providers.
 * Fallback: for endpoints that don't support structured-output transport
 * (e.g. OpenCode Zen big-pickle), generate TEXT with a strict-JSON instruction,
 * extract + JSON.parse + zod-validate. This keeps structured generation working
 * across arbitrary OpenAI-compatible models — not just Gemini/OpenAI.
 *
 * @returns {Promise<object>} the validated object
 */
export async function generateObjectWithFallback({
  schema,
  system,
  prompt,
  messages,
  temperature = 0.7,
  maxOutputTokens = 16000,
  userSecrets = null,
  userGeminiKey = null
}) {
  const secrets = normalizeSecrets({ userSecrets, userGeminiKey })
  const candidates = getModelCandidates({ userSecrets: secrets })
  if (candidates.length === 0) {
    throw new Error('No AI providers configured. Set an AI provider key in Settings or the environment.')
  }

  const jsonSystem = [
    system || '',
    '',
    'Respond with ONLY a single valid JSON value that satisfies the requested structure.',
    'No markdown code fences, no commentary, no leading or trailing text.'
  ].join('\n')

  let lastError = null
  for (const candidate of candidates) {
    // 1. Native structured output
    try {
      const { object } = await generateObject({
        model: candidate.model,
        schema,
        system,
        ...(messages ? { messages } : { prompt }),
        temperature,
        maxOutputTokens
      })
      console.log(`[AI] Success with ${candidate.label} (structured)`)
      return object
    } catch (error) {
      if (!isStructuredOutputUnsupported(error)) {
        console.warn(`[AI] ${candidate.label} failed: ${String(error?.message || error).slice(0, 200)}`)
        lastError = error
        continue
      }
      // 2. Text + parse fallback for providers without structured-output support
      try {
        const { text } = await generateText({
          model: candidate.model,
          system: jsonSystem,
          ...(messages ? { messages } : { prompt }),
          temperature,
          maxOutputTokens
        })
        const parsed = schema.parse(extractJson(text))
        console.log(`[AI] Success with ${candidate.label} (text+parse)`)
        return parsed
      } catch (fallbackError) {
        console.warn(`[AI] ${candidate.label} text+parse failed: ${String(fallbackError?.message || fallbackError).slice(0, 200)}`)
        lastError = fallbackError
      }
    }
  }

  throw lastError || new Error('All AI model candidates failed to produce a valid object')
}
