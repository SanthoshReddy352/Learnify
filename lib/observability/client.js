'use client'

// Browser-side error reporting (Plan P13.2).
//
// Posts to /api/observability/report, which runs the same redact-then-report path
// as server errors. Fire-and-forget and silent on failure: a page that has already
// crashed must not then show an error about failing to report the error.

export function reportClientError(error, extra = {}) {
  try {
    if (typeof window === 'undefined') return

    const body = JSON.stringify({
      message: String(error?.message || error || 'Unknown client error').slice(0, 1000),
      name: String(error?.name || 'ClientError').slice(0, 100),
      stack: String(error?.stack || '').slice(0, 8000),
      digest: error?.digest ? String(error.digest).slice(0, 200) : undefined,
      path: window.location?.pathname?.slice(0, 500),
      ...extra
    })

    // keepalive lets the request survive the navigation that often follows a
    // crash (the user hits reload before fetch would otherwise complete).
    fetch('/api/observability/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {})
  } catch {
    // Never throw from the reporter.
  }
}
