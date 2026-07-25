import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseIpv4,
  isPrivateIpv4,
  isPrivateIpv6,
  isPrivateAddress,
  isBlockedHostname,
  screenUrlShape
} from '../lib/ai/tools/url-guard.js'

describe('parseIpv4', () => {
  test('accepts a dotted quad', () => {
    assert.deepEqual(parseIpv4('192.168.1.1'), [192, 168, 1, 1])
  })

  test('rejects out-of-range octets and non-literals', () => {
    assert.equal(parseIpv4('256.1.1.1'), null)
    assert.equal(parseIpv4('example.com'), null)
    assert.equal(parseIpv4('1.2.3'), null)
  })
})

describe('isPrivateIpv4', () => {
  test('blocks the cloud metadata endpoint', () => {
    // The single most important case: this is the instance credential endpoint
    // on AWS/GCP/Azure, and it is a plain unauthenticated HTTP GET.
    assert.equal(isPrivateIpv4('169.254.169.254'), true)
  })

  test('blocks loopback, RFC1918, CGNAT and reserved space', () => {
    for (const ip of [
      '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.0.1',
      '0.0.0.0', '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255'
    ]) {
      assert.equal(isPrivateIpv4(ip), true, `${ip} should be blocked`)
    }
  })

  test('allows public addresses, including ones adjacent to blocked ranges', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.255.255', '223.255.255.255']) {
      assert.equal(isPrivateIpv4(ip), false, `${ip} should be allowed`)
    }
  })
})

describe('isPrivateIpv6', () => {
  test('blocks loopback, unique-local, link-local and multicast', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1']) {
      assert.equal(isPrivateIpv6(ip), true, `${ip} should be blocked`)
    }
  })

  test('unwraps IPv4-mapped and NAT64 addresses instead of trusting the wrapper', () => {
    assert.equal(isPrivateIpv6('::ffff:127.0.0.1'), true)
    assert.equal(isPrivateIpv6('::ffff:169.254.169.254'), true)
    assert.equal(isPrivateIpv6('64:ff9b::10.0.0.1'), true)
    assert.equal(isPrivateIpv6('::ffff:8.8.8.8'), false)
  })

  test('strips brackets and zone ids', () => {
    assert.equal(isPrivateIpv6('[fe80::1%eth0]'), true)
  })

  test('allows a public v6 address', () => {
    assert.equal(isPrivateIpv6('2606:4700:4700::1111'), false)
  })
})

describe('isBlockedHostname', () => {
  test('blocks localhost and internal-only suffixes', () => {
    for (const h of ['localhost', 'app.localhost', 'db.local', 'metadata.google.internal', 'x.home.arpa']) {
      assert.equal(isBlockedHostname(h), true, `${h} should be blocked`)
    }
  })

  test('blocks bare intranet names with no dot', () => {
    assert.equal(isBlockedHostname('intranet'), true)
  })

  test('allows ordinary public names', () => {
    assert.equal(isBlockedHostname('en.wikipedia.org'), false)
    assert.equal(isBlockedHostname('geeksforgeeks.org'), false)
  })
})

describe('screenUrlShape', () => {
  test('accepts a normal https URL', () => {
    const r = screenUrlShape('https://en.wikipedia.org/wiki/Binary_tree')
    assert.equal(r.ok, true)
    assert.equal(r.hostname, 'en.wikipedia.org')
  })

  test('rejects non-http schemes', () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com']) {
      assert.equal(screenUrlShape(u).ok, false, `${u} should be rejected`)
    }
  })

  test('rejects a public host on an unusual port', () => {
    // Otherwise the fetcher doubles as an internal port scanner.
    assert.equal(screenUrlShape('http://example.com:8080/x').ok, false)
    assert.equal(screenUrlShape('http://example.com:80/x').ok, true)
  })

  test('rejects private literals directly', () => {
    assert.equal(screenUrlShape('http://169.254.169.254/latest/meta-data/').ok, false)
    assert.equal(screenUrlShape('http://127.0.0.1/admin').ok, false)
    assert.equal(screenUrlShape('http://[::1]/admin').ok, false)
  })

  test('rejects garbage instead of throwing', () => {
    assert.equal(screenUrlShape('not a url').ok, false)
    assert.equal(screenUrlShape('').ok, false)
    assert.equal(screenUrlShape(null).ok, false)
  })
})
