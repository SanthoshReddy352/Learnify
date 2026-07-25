// Read a JSON API response without turning a platform error into a lie.
//
// `await res.json()` on an HTML error page throws
//   Unexpected token '<', "<!DOCTYPE "... is not valid JSON
// and that string then gets shown to the user as if it were the failure. It is
// not — it is the *parser's* complaint about an error page the platform served
// instead of our handler's JSON. The actual cause (almost always a function
// timeout on a long generation) is invisible.
//
// So: read the body as text, try to parse it, and when it is not JSON, say what
// the status code actually means.

const NON_JSON_BY_STATUS = {
  401: 'Your session expired. Sign in again and retry.',
  404: 'That endpoint was not found — the deployment may be mid-update.',
  413: 'The request was too large for the server to accept.',
  429: 'Too many requests right now. Wait a moment and retry.',
  502: 'The server did not return a valid response (bad gateway).',
  503: 'The service is temporarily unavailable.'
}

// A request that ran out of time. 504 is the standard gateway timeout; Vercel
// also serves an HTML page for FUNCTION_INVOCATION_TIMEOUT.
const TIMEOUT_STATUSES = new Set([408, 504])

const TIMEOUT_MESSAGE =
  'The server ran out of time before generation finished. Long lessons exceed the ' +
  'hosting time limit on the synchronous path — turn on async generation ' +
  '(NEXT_PUBLIC_ASYNC_GENERATION=true) so this runs in the background worker.'

/** Pure: explain a non-JSON response body from its status. Unit-testable. */
export function explainNonJsonResponse(status, bodyText = '') {
  if (TIMEOUT_STATUSES.has(status)) return TIMEOUT_MESSAGE

  // A timeout on Vercel can also surface as a 500-class HTML page whose body
  // names the error, so check the body before falling back to a generic message.
  const body = String(bodyText || '')
  if (/FUNCTION_INVOCATION_TIMEOUT|Task timed out|GATEWAY_TIMEOUT/i.test(body)) {
    return TIMEOUT_MESSAGE
  }
  if (/FUNCTION_PAYLOAD_TOO_LARGE/i.test(body)) {
    return 'The response was too large for the platform to return.'
  }

  if (NON_JSON_BY_STATUS[status]) return NON_JSON_BY_STATUS[status]
  if (status >= 500) {
    return `The server hit an error (HTTP ${status}) and returned a page instead of a result. Check the server logs.`
  }
  return `The server returned an unexpected response (HTTP ${status}).`
}

/**
 * Parse a fetch Response as JSON, throwing a message a human can act on.
 * Throws on a non-OK status too, preferring the API's own `error` field.
 */
export async function readJson(response, fallbackMessage = 'Request failed') {
  const text = await response.text().catch(() => '')

  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // Not JSON at all — the platform answered, not our handler.
      throw new Error(explainNonJsonResponse(response.status, text))
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `${fallbackMessage} (HTTP ${response.status})`)
  }
  return data
}
