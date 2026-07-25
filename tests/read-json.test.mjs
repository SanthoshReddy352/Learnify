import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { explainNonJsonResponse, readJson } from '../lib/http/read-json.js'

// Minimal stand-in for a fetch Response.
function fakeResponse({ status = 200, body = '' }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body
  }
}

describe('explainNonJsonResponse', () => {
  test('names a gateway timeout as a timeout, not a parse error', () => {
    assert.match(explainNonJsonResponse(504, '<!DOCTYPE html>'), /ran out of time/i)
    assert.match(explainNonJsonResponse(408, ''), /ran out of time/i)
  })

  test('detects a platform timeout page even behind a 500-class status', () => {
    const page = '<!DOCTYPE html><html><body>FUNCTION_INVOCATION_TIMEOUT</body></html>'
    assert.match(explainNonJsonResponse(500, page), /ran out of time/i)
    assert.match(explainNonJsonResponse(502, 'Task timed out after 60.00 seconds'), /ran out of time/i)
  })

  test('points at async generation as the fix, since that is the actual remedy', () => {
    assert.match(explainNonJsonResponse(504, ''), /NEXT_PUBLIC_ASYNC_GENERATION/)
  })

  test('explains the common non-timeout statuses', () => {
    assert.match(explainNonJsonResponse(401, ''), /session expired/i)
    assert.match(explainNonJsonResponse(404, ''), /not found/i)
    assert.match(explainNonJsonResponse(429, ''), /too many requests/i)
  })

  test('falls back to a server-error message for an unlabelled 5xx', () => {
    assert.match(explainNonJsonResponse(500, '<html>oops</html>'), /server hit an error/i)
  })
})

describe('readJson', () => {
  test('returns parsed JSON on success', async () => {
    const data = await readJson(fakeResponse({ body: '{"content":"hi"}' }))
    assert.deepEqual(data, { content: 'hi' })
  })

  test('NEVER surfaces a JSON syntax error for an HTML body', async () => {
    // The whole point of the module: the user must not be told
    // "Unexpected token '<'" when the real problem is a timeout.
    const res = fakeResponse({ status: 504, body: '<!DOCTYPE html><html></html>' })
    await assert.rejects(
      () => readJson(res),
      (err) => {
        assert.doesNotMatch(err.message, /Unexpected token|not valid JSON/i)
        assert.match(err.message, /ran out of time/i)
        return true
      }
    )
  })

  test('prefers the API\'s own error message on a JSON error response', async () => {
    const res = fakeResponse({ status: 409, body: '{"error":"Item bank is empty"}' })
    await assert.rejects(() => readJson(res), /Item bank is empty/)
  })

  test('falls back to the caller message when a JSON error has no error field', async () => {
    const res = fakeResponse({ status: 500, body: '{}' })
    await assert.rejects(() => readJson(res, 'Generation failed'), /Generation failed \(HTTP 500\)/)
  })

  test('treats an empty successful body as null rather than throwing', async () => {
    assert.equal(await readJson(fakeResponse({ status: 204, body: '' })), null)
  })
})
