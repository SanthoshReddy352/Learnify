import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { urlBase64ToUint8Array, assertVapidPublicKey } from '../lib/reminders/push-key.js'

// A real uncompressed P-256 public key (65 bytes, leading 0x04), the shape a
// VAPID public key always has.
const VALID_KEY =
  'BEhmqsfgESt8avdfT3oCBDvKTAS9WUdovGn4elJPbTDFsk6UX01pxaQUyP3PIsD_b0boE0e6kvK8zCaXow-BpWw'

describe('urlBase64ToUint8Array', () => {
  test('decodes an unpadded URL-safe key to the right byte length', () => {
    const bytes = urlBase64ToUint8Array(VALID_KEY)
    assert.equal(bytes instanceof Uint8Array, true)
    assert.equal(bytes.length, 65)
    assert.equal(bytes[0], 0x04)
  })

  test('translates the URL-safe alphabet, not just the padding', () => {
    // '-' and '_' must map to '+' and '/'; treating them literally yields
    // different bytes, which is exactly the silent-failure case.
    assert.deepEqual(
      [...urlBase64ToUint8Array('-_-_')],
      [...urlBase64ToUint8Array('+/+/')]
    )
  })

  test('handles every padding remainder', () => {
    assert.equal(urlBase64ToUint8Array('QQ').length, 1) // needs '=='
    assert.equal(urlBase64ToUint8Array('QUJD').length, 3) // already aligned
  })

  test('an empty key is rejected loudly', () => {
    assert.throws(() => urlBase64ToUint8Array(''), /Missing VAPID public key/)
    assert.throws(() => urlBase64ToUint8Array(null), /Missing VAPID public key/)
  })
})

describe('assertVapidPublicKey', () => {
  test('accepts a well-formed key and returns its bytes', () => {
    assert.equal(assertVapidPublicKey(VALID_KEY).length, 65)
  })

  test('a truncated key is named as the cause instead of failing at subscribe()', () => {
    assert.throws(() => assertVapidPublicKey(VALID_KEY.slice(0, 40)), /looks malformed/)
  })

  test('rejects a 65-byte blob that is not an uncompressed point', () => {
    // Right length, wrong leading byte — a compressed or mangled key.
    const wrongPrefix = Buffer.concat([Buffer.from([0x03]), Buffer.alloc(64, 1)])
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    assert.throws(() => assertVapidPublicKey(wrongPrefix), /looks malformed/)
  })
})
