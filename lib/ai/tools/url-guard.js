// SSRF guard for the server-side fetchers in ./web.js (P6 follow-up).
//
// `webExtract` fetches URLs the process did not author. Today they come from
// public search results, but a fetcher that will retrieve any URL handed to it
// is a request-forgery primitive: on a hosting platform, `http://169.254.169.254`
// is the instance metadata endpoint, and `http://127.0.0.1:54321` is whatever
// else happens to be listening next to the app.
//
// So: allow http(s) on normal ports only, and refuse any host that RESOLVES to
// a private, loopback, link-local or otherwise non-public address. Resolution
// matters — `localtest.me` and friends are public names pointing at 127.0.0.1,
// so a name-only blocklist catches nothing.
//
// Known residual gap: between our DNS lookup and fetch's own, a hostile resolver
// could answer differently (DNS rebinding). Closing that needs connecting to a
// pinned IP with a manual Host header. Not done here because every URL reaching
// this module comes from a public search for an educational topic, not from user
// input — if that ever changes, pin the address.

import { lookup } from 'node:dns/promises'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const ALLOWED_PORTS = new Set(['', '80', '443'])

// Hosts that never resolve anywhere useful to us, blocked by name so we do not
// even pay for the DNS round trip.
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.onion']

/** Parse a dotted-quad into four octets, or null when it is not an IPv4 literal. Pure. */
export function parseIpv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(host || ''))
  if (!m) return null
  const parts = m.slice(1, 5).map(Number)
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null
}

/** True when an IPv4 literal is outside the public internet. Pure. */
export function isPrivateIpv4(host) {
  const p = parseIpv4(host)
  if (!p) return false
  const [a, b] = p
  if (a === 0) return true // "this network"
  if (a === 10) return true // RFC1918
  if (a === 127) return true // loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // link-local — cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 0) return true // IETF protocol assignments + TEST-NET-1
  if (a === 192 && b === 88) return true // 6to4 relay anycast
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 198 && b === 51) return true // TEST-NET-2
  if (a === 203 && b === 0) return true // TEST-NET-3
  if (a >= 224) return true // multicast + reserved + broadcast
  return false
}

/** True when an IPv6 literal is outside the public internet. Pure. */
export function isPrivateIpv6(host) {
  let h = String(host || '').toLowerCase().trim()
  if (!h) return false
  h = h.replace(/^\[/, '').replace(/\]$/, '').split('%')[0] // strip brackets + zone id
  if (!h.includes(':')) return false

  // IPv4-mapped (::ffff:1.2.3.4) and NAT64 (64:ff9b::1.2.3.4) carry a v4 address
  // in the tail — judge them by that address, not by the v6 wrapper.
  const tail = h.split(':').pop()
  if (parseIpv4(tail)) return isPrivateIpv4(tail)

  if (h === '::' || h === '::1') return true // unspecified / loopback
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(h)) return true // ff00::/8 multicast
  if (h.startsWith('2001:db8:')) return true // documentation
  return false
}

/** True for any IP literal (v4 or v6) we refuse to fetch. Pure. */
export function isPrivateAddress(host) {
  return isPrivateIpv4(host) || isPrivateIpv6(host)
}

/** True for hostnames blocked without resolving them. Pure. */
export function isBlockedHostname(host) {
  const h = String(host || '').toLowerCase().trim().replace(/\.$/, '')
  if (!h) return true
  if (h === 'localhost') return true
  if (!h.includes('.') && !h.includes(':')) return true // bare intranet name
  return BLOCKED_SUFFIXES.some((s) => h.endsWith(s))
}

/**
 * Pure structural check: scheme, port and hostname, with no DNS.
 * Returns { ok, url, hostname, reason }.
 */
export function screenUrlShape(rawUrl) {
  let u
  try {
    u = new URL(String(rawUrl || '').trim())
  } catch {
    return { ok: false, reason: 'not a valid URL' }
  }
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) {
    return { ok: false, reason: `blocked scheme ${u.protocol}` }
  }
  if (!ALLOWED_PORTS.has(u.port)) {
    return { ok: false, reason: `blocked port ${u.port}` }
  }
  const hostname = u.hostname.replace(/^\[/, '').replace(/\]$/, '')
  if (isPrivateAddress(hostname)) {
    return { ok: false, reason: 'address is not on the public internet' }
  }
  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: 'host is not publicly routable' }
  }
  return { ok: true, url: u.toString(), hostname }
}

/**
 * Full check: structure, then DNS — every address the name resolves to must be
 * public, so one private answer in a round-robin cannot slip through.
 */
export async function assertPublicUrl(rawUrl) {
  const shape = screenUrlShape(rawUrl)
  if (!shape.ok) return shape
  // An IP literal was already judged by screenUrlShape — resolving it is pointless.
  if (parseIpv4(shape.hostname) || shape.hostname.includes(':')) return shape

  let addresses
  try {
    addresses = await lookup(shape.hostname, { all: true, verbatim: true })
  } catch (err) {
    return { ok: false, reason: `could not resolve host (${err.code || err.message})` }
  }
  if (!addresses.length) return { ok: false, reason: 'host resolved to no addresses' }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      return { ok: false, reason: 'host resolves to a non-public address' }
    }
  }
  return shape
}

/**
 * fetch() with the guard applied to the initial URL AND to every redirect hop —
 * `redirect: 'follow'` would let a public URL bounce us straight to
 * 169.254.169.254, so redirects are followed by hand.
 */
export async function guardedFetch(rawUrl, { headers = {}, signal, maxRedirects = 4 } = {}) {
  let target = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const check = await assertPublicUrl(target)
    if (!check.ok) throw new Error(check.reason)

    const res = await fetch(check.url, { headers, signal, redirect: 'manual' })
    if (res.status < 300 || res.status > 399) return res

    const location = res.headers.get('location')
    if (!location) return res
    try {
      target = new URL(location, check.url).toString()
    } catch {
      throw new Error('redirect to an unparseable location')
    }
  }
  throw new Error('too many redirects')
}
