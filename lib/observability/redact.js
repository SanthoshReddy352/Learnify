// Secret redaction for error reports (Plan P13.2).
//
// This module is the REASON the observability layer exists rather than a plain
// `console.error` plus a webhook. Learnify stores per-user provider API keys
// (`user_secrets`, Phase 0.3), and provider SDKs are happy to put a request URL,
// an auth header, or an echoed request body into an error message. Shipping raw
// error text to a third-party sink could therefore leak a learner's own API key —
// a key they pay for. Everything that leaves the process goes through here first.
//
// Redaction is deliberately over-eager: a false positive costs a few characters
// of debuggability, a false negative costs someone's credentials.
//
// Pure and alias-free so `node --test` loads it directly.

export const REDACTED = '[redacted]'

// ORDER MATTERS, and getting it wrong is a false negative — the dangerous kind.
// The whole-value rules run BEFORE the generic labelled rule, because the generic
// rule stops at the first whitespace: on `Authorization: Bearer abc123` it would
// match the label plus the word "Bearer", redact only that, and leave the actual
// token in the report. A unit test pins this.
const PATTERNS = [
  // `Authorization: <anything to the delimiter>` — the value is consumed whole,
  // scheme and credential together.
  {
    name: 'authorization-header',
    re: /(\bauthorization\b["'\s]*[:=]\s*)["']?[^\n"',}\]]+/gi,
    replace: (_m, label) => `${label}${REDACTED}`
  },
  // A bare `Bearer <token>` with no label in front of it.
  { name: 'bearer', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replace: () => `Bearer ${REDACTED}` },
  // key=..., "apiKey": "...", api-key: ..., token=...
  {
    name: 'labelled-secret',
    re: /(\b(?:api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|secret|password|passwd|auth[-_]?token|service[-_]?role[-_]?key|private[-_]?key|signing[-_]?key|event[-_]?key|dsn)\b["'\s]*[:=]\s*["']?)([^\s"'&,;}\]]{4,})/gi,
    replace: (_m, label) => `${label}${REDACTED}`
  },
  // Google AI Studio / Google Cloud keys.
  { name: 'google-key', re: /\bAIza[0-9A-Za-z_-]{10,}/g, replace: () => REDACTED },
  // Anthropic.
  { name: 'anthropic-key', re: /\bsk-ant-[0-9A-Za-z_-]{10,}/g, replace: () => REDACTED },
  // OpenAI and the many OpenAI-compatible providers that copied the prefix.
  { name: 'openai-key', re: /\bsk-(?!ant-)[0-9A-Za-z_-]{16,}/g, replace: () => REDACTED },
  // Supabase / Inngest / anything else shaped like a JWT (three base64url parts).
  {
    name: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    replace: () => REDACTED
  },
  // A query string carrying a key, e.g. ?key=... or &access_token=...
  {
    name: 'query-secret',
    re: /([?&](?:key|api[-_]?key|token|access[-_]?token|secret|password)=)[^&\s]+/gi,
    replace: (_m, label) => `${label}${REDACTED}`
  },
  // Emails: not secrets, but personal data that has no business in an error
  // report shipped off-platform.
  {
    name: 'email',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replace: () => REDACTED
  }
]

/** Redact secrets and personal data from a string. */
export function redactString(input) {
  if (typeof input !== 'string' || input.length === 0) return input
  let output = input
  for (const { re, replace } of PATTERNS) {
    output = output.replace(re, replace)
  }
  return output
}

// Keys whose VALUE is dropped wholesale, whatever it looks like — a secret does
// not have to match a pattern to be a secret.
const SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
  'authorization', 'auth', 'token', 'secret', 'password', 'passwd', 'credentials',
  'geminiapikey', 'gemini_api_key', 'anthropicapikey', 'anthropic_api_key',
  'openaicompatapikey', 'openai_compat_api_key', 'servicerolekey', 'service_role_key',
  'privatekey', 'private_key', 'p256dh', 'endpoint', 'dsn', 'cookie', 'setcookie', 'set_cookie'
])

const MAX_DEPTH = 6
const MAX_STRING = 2000

/**
 * Deep-redact an arbitrary value for inclusion in a report.
 *
 * Truncates long strings, drops sensitive keys by name, and refuses to recurse
 * forever — an error's `cause` chain or a supabase-js error can carry a whole
 * request object, and an unbounded walk would be both a memory risk and a way to
 * smuggle a secret in at depth.
 */
export function redactValue(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    const cleaned = redactString(value)
    return cleaned.length > MAX_STRING ? `${cleaned.slice(0, MAX_STRING)}…[truncated]` : cleaned
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (depth >= MAX_DEPTH) return '[depth limit]'

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: redactString(value.stack || ''),
      ...(value.cause ? { cause: redactValue(value.cause, depth + 1, seen) } : {})
    }
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]'
    seen.add(value)

    if (Array.isArray(value)) {
      // Cap array length too: a batch payload can be thousands of rows.
      return value.slice(0, 50).map((item) => redactValue(item, depth + 1, seen))
    }

    const out = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-\s]/g, ''))
        ? REDACTED
        : redactValue(item, depth + 1, seen)
    }
    return out
  }

  return undefined
}
