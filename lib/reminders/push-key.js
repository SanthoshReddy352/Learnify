// VAPID key encoding for the browser (Plan P11.1).
//
// `PushManager.subscribe` wants `applicationServerKey` as raw bytes, but a VAPID
// public key travels as URL-safe base64 (no padding, `-`/`_` instead of `+`/`/`).
// Getting this conversion subtly wrong yields an opaque InvalidAccessError at
// subscribe time, so it lives here as a pure function with tests rather than
// inline in a component.
//
// Alias-free so `node --test` can load it directly.

/** URL-safe base64 (RFC 4648 §5, unpadded) → Uint8Array. */
export function urlBase64ToUint8Array(base64UrlString) {
  const input = String(base64UrlString || '').trim()
  if (!input) throw new Error('Missing VAPID public key')

  const padding = '='.repeat((4 - (input.length % 4)) % 4)
  const base64 = (input + padding).replace(/-/g, '+').replace(/_/g, '/')

  // atob in the browser; Buffer under Node (so this is testable server-side).
  const raw = typeof atob === 'function'
    ? atob(base64)
    : Buffer.from(base64, 'base64').toString('binary')

  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * An uncompressed P-256 public key is 65 bytes starting with 0x04. Checking that
 * before calling subscribe turns "a truncated key was pasted into the env var"
 * from an unexplained browser error into a message that names the cause.
 */
export function assertVapidPublicKey(base64UrlString) {
  const bytes = urlBase64ToUint8Array(base64UrlString)
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error(
      `VAPID public key looks malformed (${bytes.length} bytes; expected 65 starting with 0x04)`
    )
  }
  return bytes
}
