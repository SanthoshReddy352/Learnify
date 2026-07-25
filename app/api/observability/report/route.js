import { NextResponse } from 'next/server'
import { reportError } from '@/lib/observability/report'
import { clientErrorReportSchema, parseOr400 } from '@/lib/validation/schemas'

// Sink for browser-side errors (Plan P13.2).
//
// A crashed render is the failure users actually notice and the one server logs
// never show, so the error boundaries POST here and this route forwards through
// the same redact-then-report path as server errors.
//
// Deliberately UNAUTHENTICATED: the most valuable client errors happen on the
// login and landing pages, where there is no session to authenticate with. The
// exposure is bounded instead by shape — zod caps every field's length, the body
// is size-limited, and nothing here reads or writes the database. A caller can
// at worst write noise into the error sink.
export const runtime = 'nodejs'

// Anything larger is not a stack trace, it is an attempt to fill the log.
const MAX_BODY_BYTES = 16 * 1024

export async function POST(request) {
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Report too large' }, { status: 413 })
    }

    let json
    try {
      json = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = parseOr400(clientErrorReportSchema, json)
    if (parsed.error) {
      return NextResponse.json({ error: 'Invalid report' }, { status: 400 })
    }
    const body = parsed.data

    const error = new Error(body.message)
    error.name = body.name || 'ClientError'
    if (body.stack) error.stack = body.stack

    // Not awaited on the response path — but this route exists only to report, so
    // awaiting costs nothing the caller cares about and guarantees delivery
    // before the serverless invocation is frozen.
    await reportError(error, {
      scope: 'client',
      tags: {
        digest: body.digest || null,
        path: body.path || null,
        // The UA string is useful for "only breaks on old Safari" and carries no
        // secret; redactValue still runs over it.
        userAgent: request.headers.get('user-agent')?.slice(0, 200) || null
      }
    })

    return NextResponse.json({ ok: true })
  } catch {
    // This endpoint must never itself produce an error worth reporting.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
