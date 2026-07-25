import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { REDACTED, redactString, redactValue } from '../lib/observability/redact.js'
import { parseSentryDsn, fingerprint, buildReport } from '../lib/observability/report.js'

describe('redactString', () => {
  test('strips a Google AI Studio key', () => {
    const out = redactString('Request failed: key=AIzaSyD-1234567890abcdefghijklmnop invalid')
    assert.ok(!out.includes('AIzaSy'), out)
    assert.ok(out.includes(REDACTED))
  })

  test('strips Anthropic and OpenAI-style keys', () => {
    assert.ok(!redactString('x-api-key: sk-ant-api03-AAAABBBBCCCCDDDD').includes('sk-ant'))
    assert.ok(!redactString('Using sk-proj-abcdefghijklmnopqrstuvwxyz012345').includes('sk-proj'))
  })

  // Regression: the generic labelled rule stops at whitespace, so when it ran
  // first it redacted only the word "Bearer" and left the credential in place.
  test('strips a bearer token behind an Authorization label', () => {
    const out = redactString('Authorization: Bearer abc123def456ghi789')
    assert.equal(out.includes('abc123def456ghi789'), false, out)
  })

  test('strips a bare bearer token and a JWT', () => {
    assert.ok(!redactString('sent Bearer abc123def456ghi789 upstream').includes('abc123def456'))

    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    assert.ok(!redactString(`token ${jwt}`).includes('eyJhbGci'))
  })

  test('an authorization header inside JSON is consumed whole', () => {
    const out = redactString('{"headers":{"authorization":"Bearer sk-ant-api03-SECRETVALUE1234"}}')
    assert.ok(!out.includes('SECRETVALUE1234'), out)
    assert.ok(!out.includes('sk-ant'), out)
  })

  test('strips a secret out of a query string', () => {
    const out = redactString('GET https://api.example.com/v1/models?key=AIzaSyABCDEFGHIJKLMNOP&alt=json')
    assert.ok(!out.includes('AIzaSy'))
    assert.ok(out.includes('alt=json'), 'non-secret params should survive')
  })

  test('strips labelled secrets whatever the punctuation', () => {
    for (const input of [
      '{"apiKey":"supersecretvalue"}',
      'api_key = supersecretvalue',
      'password: supersecretvalue',
      'service_role_key=supersecretvalue'
    ]) {
      assert.ok(!redactString(input).includes('supersecretvalue'), input)
    }
  })

  test('strips email addresses — personal data has no place in a report', () => {
    const out = redactString('failed for learner@example.com')
    assert.ok(!out.includes('learner@example.com'))
  })

  test('leaves ordinary error text intact', () => {
    const message = 'Topic not found: the subject has no generated lesson yet'
    assert.equal(redactString(message), message)
  })

  test('non-strings pass through untouched', () => {
    assert.equal(redactString(null), null)
    assert.equal(redactString(42), 42)
  })
})

describe('redactValue', () => {
  test('drops sensitive keys by NAME, even when the value looks harmless', () => {
    const out = redactValue({ apiKey: 'abc', gemini_api_key: 'x', topicId: 't1' })
    assert.equal(out.apiKey, REDACTED)
    assert.equal(out.gemini_api_key, REDACTED)
    assert.equal(out.topicId, 't1')
  })

  test('key matching ignores case, dashes and spaces', () => {
    const out = redactValue({ 'API-Key': 'a', 'Access Token': 'b', AUTHORIZATION: 'c' })
    assert.deepEqual(Object.values(out), [REDACTED, REDACTED, REDACTED])
  })

  test('recurses into nested objects and arrays', () => {
    const out = redactValue({ req: { headers: { authorization: 'Bearer zzz' } }, items: [{ token: 'q' }] })
    assert.equal(out.req.headers.authorization, REDACTED)
    assert.equal(out.items[0].token, REDACTED)
  })

  test('unwraps an Error, including its cause chain, with redaction', () => {
    const cause = new Error('upstream said key=AIzaSyABCDEFGHIJKLMNOP')
    const out = redactValue(new Error('wrapper', { cause }))
    assert.equal(out.name, 'Error')
    assert.equal(out.message, 'wrapper')
    assert.ok(!JSON.stringify(out.cause).includes('AIzaSy'))
  })

  test('survives circular references instead of hanging', () => {
    const node = { name: 'a' }
    node.self = node
    assert.equal(redactValue(node).self, '[circular]')
  })

  test('stops at a depth limit so a deep payload cannot smuggle a secret past it', () => {
    let deep = { secretish: 'x' }
    for (let i = 0; i < 12; i += 1) deep = { nested: deep }
    assert.ok(JSON.stringify(redactValue(deep)).includes('[depth limit]'))
  })

  test('truncates very long strings and caps long arrays', () => {
    assert.ok(redactValue('a'.repeat(5000)).endsWith('[truncated]'))
    assert.equal(redactValue(new Array(500).fill('x')).length, 50)
  })

  test('drops functions rather than stringifying them', () => {
    assert.equal(redactValue({ fn: () => {} }).fn, undefined)
  })
})

describe('parseSentryDsn', () => {
  test('splits a well-formed DSN into endpoint and key', () => {
    const parsed = parseSentryDsn('https://abc123@o12345.ingest.sentry.io/6789')
    assert.equal(parsed.publicKey, 'abc123')
    assert.equal(parsed.projectId, '6789')
    assert.equal(parsed.endpoint, 'https://o12345.ingest.sentry.io/api/6789/envelope/')
  })

  test('a malformed DSN returns null rather than throwing', () => {
    // A typo'd DSN must cost reporting, never the request being handled.
    assert.equal(parseSentryDsn('not a url'), null)
    assert.equal(parseSentryDsn('https://o12345.ingest.sentry.io/6789'), null) // no key
    assert.equal(parseSentryDsn('https://abc123@o12345.ingest.sentry.io/'), null) // no project
    assert.equal(parseSentryDsn(''), null)
    assert.equal(parseSentryDsn(undefined), null)
  })
})

describe('fingerprint', () => {
  test('the same bug groups together across different ids and numbers', () => {
    const a = new Error('Topic 9d4c0001-88f5-49fb-89e3-62764d93ce7f failed after 3 attempts')
    const b = new Error('Topic 11111111-2222-3333-4444-555555555555 failed after 7 attempts')
    assert.equal(fingerprint(a, { scope: 'gen' }), fingerprint(b, { scope: 'gen' }))
  })

  test('different bugs stay apart, and scope separates them', () => {
    const err = new Error('boom')
    assert.notEqual(fingerprint(err, { scope: 'gen' }), fingerprint(new Error('other'), { scope: 'gen' }))
    assert.notEqual(fingerprint(err, { scope: 'gen' }), fingerprint(err, { scope: 'reminders' }))
  })

  test('handles a thrown non-Error', () => {
    assert.ok(fingerprint('just a string').length > 0)
  })
})

describe('buildReport', () => {
  test('redacts the message, the stack and the extras', () => {
    const error = new Error('provider rejected key=AIzaSyABCDEFGHIJKLMNOP')
    const report = buildReport(error, {
      scope: 'generate-topic-content',
      userId: 'u1',
      extra: { apiKey: 'zzz', topicId: 't1' }
    })
    assert.ok(!report.message.includes('AIzaSy'))
    assert.ok(!report.stack.includes('AIzaSy'))
    assert.equal(report.extra.apiKey, REDACTED)
    assert.equal(report.extra.topicId, 't1')
  })

  test('carries a user id but never an email', () => {
    const report = buildReport(new Error('x'), { userId: 'u1', extra: { email: 'a@b.com' } })
    assert.equal(report.userId, 'u1')
    assert.ok(!JSON.stringify(report).includes('a@b.com'))
  })

  test('wraps a thrown non-Error so reporting cannot itself fail', () => {
    const report = buildReport('plain string failure', { scope: 'x' })
    assert.equal(report.message, 'plain string failure')
    assert.equal(report.name, 'Error')
  })

  test('defaults level and scope', () => {
    const report = buildReport(new Error('x'))
    assert.equal(report.level, 'error')
    assert.equal(report.scope, 'app')
  })
})
