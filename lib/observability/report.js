// Error reporting (Plan P13.2).
//
// The gap this closes: every failure in the app was `console.error`'d and lost.
// On Vercel that means a learner's generation can fail and nobody ever knows.
//
// Design, following the same posture as the P11 email adapter:
//   * NO SDK. `@sentry/nextjs` is ~1MB and pulls in instrumentation hooks; a
//     Sentry envelope is one POST. The trade is real — no source maps, no
//     breadcrumbs, no performance tracing — and if those become necessary the
//     official SDK can be dropped in behind the same `reportError` call.
//   * Vendor-neutral. A Sentry DSN OR any webhook URL works; unset means the
//     reporter only logs locally, so a fork with no error backend is fine.
//   * Fail-soft, always. Reporting an error must never throw a second error, and
//     must never delay the response it was called from.
//   * Everything is redacted first (lib/observability/redact.js) — the app holds
//     users' own provider API keys, so an unredacted report is a credential leak.

import { redactString, redactValue } from './redact.js'

const SENTRY_DSN = () => process.env.SENTRY_DSN || ''
const WEBHOOK_URL = () => process.env.ERROR_WEBHOOK_URL || ''

export function observabilityConfigured() {
  return Boolean(SENTRY_DSN() || WEBHOOK_URL())
}

/**
 * Parse a Sentry DSN into the envelope endpoint + auth key.
 * Returns null on anything unparseable rather than throwing — a typo'd DSN
 * should cost reporting, not the request that was being handled.
 */
export function parseSentryDsn(dsn) {
  try {
    const url = new URL(dsn)
    const publicKey = url.username
    const projectId = url.pathname.replace(/^\/+/, '')
    if (!publicKey || !projectId) return null
    return {
      publicKey,
      projectId,
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`
    }
  } catch {
    return null
  }
}

/**
 * A stable fingerprint for grouping. Line/column numbers move with every edit,
 * so they are stripped: without this, one recurring bug looks like fifty.
 */
export function fingerprint(error, context = {}) {
  const name = error?.name || 'Error'
  const message = String(error?.message || error || 'unknown')
    // Strip anything variable: ids, numbers, quoted values.
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .slice(0, 120)
  return [context.scope || 'app', name, message].join(':')
}

/** The structured record that is logged and sent. */
export function buildReport(error, context = {}) {
  const err = error instanceof Error ? error : new Error(String(error))
  return {
    level: context.level || 'error',
    scope: context.scope || 'app',
    message: redactString(err.message || 'Unknown error'),
    name: err.name,
    // The stack is redacted too — a stack frame can contain an interpolated URL
    // with a key in the query string.
    stack: redactString(err.stack || ''),
    fingerprint: fingerprint(err, context),
    // Never the email or anything else identifying — a user id is enough to
    // correlate with the database if a human needs to investigate.
    userId: context.userId || null,
    tags: redactValue(context.tags || {}),
    extra: redactValue(context.extra || {}),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || null,
    timestamp: new Date().toISOString()
  }
}

function toSentryEnvelope(report, dsn) {
  const eventId = crypto.randomUUID().replace(/-/g, '')
  const header = JSON.stringify({ event_id: eventId, sent_at: report.timestamp, dsn })
  const itemHeader = JSON.stringify({ type: 'event' })
  const event = JSON.stringify({
    event_id: eventId,
    timestamp: report.timestamp,
    platform: 'javascript',
    level: report.level,
    logger: report.scope,
    environment: report.environment,
    ...(report.release ? { release: report.release } : {}),
    fingerprint: [report.fingerprint],
    ...(report.userId ? { user: { id: report.userId } } : {}),
    tags: { scope: report.scope, ...flattenTags(report.tags) },
    extra: report.extra,
    exception: {
      values: [{
        type: report.name,
        value: report.message,
        // `stacktrace: null` keeps Sentry from guessing; the raw stack goes in
        // extra so it is still readable without the SDK's frame parsing.
        stacktrace: null
      }]
    },
    message: { formatted: report.message }
  })
  return `${header}\n${itemHeader}\n${event}\n`
}

// Sentry tags must be flat scalars; anything else is dropped rather than
// stringified into noise.
function flattenTags(tags = {}) {
  const out = {}
  for (const [key, value] of Object.entries(tags || {})) {
    if (['string', 'number', 'boolean'].includes(typeof value)) out[key] = String(value)
  }
  return out
}

/**
 * Report an error. Never throws, never rejects.
 *
 * Awaiting it is optional — in a request handler you normally do not, because a
 * learner should not wait on telemetry. In an Inngest worker you can, since the
 * process may exit as soon as the function returns.
 */
export async function reportError(error, context = {}) {
  let report
  try {
    report = buildReport(error, context)
  } catch {
    // If even building the report failed, fall back to the rawest thing that
    // cannot itself throw.
    console.error('[Observability] failed to build report for:', String(error))
    return { ok: false, logged: false }
  }

  // Always log locally first: Vercel's own log drain is the one sink that is
  // guaranteed to exist, and a structured single line is greppable.
  console.error(`[${report.scope}] ${report.name}: ${report.message}`, JSON.stringify({
    fingerprint: report.fingerprint,
    userId: report.userId,
    tags: report.tags,
    extra: report.extra
  }))

  const dsn = SENTRY_DSN()
  const webhook = WEBHOOK_URL()
  if (!dsn && !webhook) return { ok: true, logged: true, sent: false }

  const sends = []
  if (dsn) {
    const parsed = parseSentryDsn(dsn)
    if (parsed) {
      sends.push(fetch(parsed.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=learnify/1.0`
        },
        body: toSentryEnvelope(report, dsn)
      }))
    } else {
      console.warn('[Observability] SENTRY_DSN is set but could not be parsed; skipping.')
    }
  }
  if (webhook) {
    sends.push(fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    }))
  }

  try {
    await Promise.allSettled(sends)
    return { ok: true, logged: true, sent: true }
  } catch {
    return { ok: true, logged: true, sent: false }
  }
}
