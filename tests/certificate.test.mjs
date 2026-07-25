import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatSerial,
  normalizeSerial,
  certificateEligibility,
  buildCertificateSnapshot,
  conceptsFromAttempt
} from '../lib/assessment/certificate.js'

const passedExam = {
  kind: 'exam',
  status: 'graded',
  passed: true,
  score: 84,
  mode: 'classroom',
  viva_passed: null
}

describe('formatSerial', () => {
  test('produces the LRN-XXXX-XXXX-XXXX shape', () => {
    const serial = formatSerial(new Uint8Array(16).fill(0))
    assert.match(serial, /^LRN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  })

  test('never emits the ambiguous letters Crockford drops', () => {
    // Every byte value 0..255 mapped, so this covers the whole alphabet.
    const serial = formatSerial(Array.from({ length: 256 }, (_, i) => i).slice(0, 12))
    for (const bad of ['I', 'L', 'O', 'U']) {
      assert.ok(!serial.slice(4).includes(bad), `serial must not contain ${bad}: ${serial}`)
    }
  })

  test('refuses to build a serial from too little randomness', () => {
    assert.throws(() => formatSerial([1, 2, 3]), /at least 12 bytes/)
  })
})

describe('normalizeSerial', () => {
  test('round-trips a generated serial', () => {
    const serial = formatSerial(new Uint8Array(16).fill(7))
    assert.equal(normalizeSerial(serial), serial)
  })

  test('accepts lowercase, missing prefix, and stray spacing', () => {
    assert.equal(normalizeSerial('lrn-7777-7777-7777'), 'LRN-7777-7777-7777')
    assert.equal(normalizeSerial('7777 7777 7777'), 'LRN-7777-7777-7777')
  })

  test('folds the lookalike characters a human would mistype', () => {
    // Someone copying off paper reads 0 as O and 1 as I or L.
    assert.equal(normalizeSerial('LRN-O123-4567-89AB'), 'LRN-0123-4567-89AB')
    assert.equal(normalizeSerial('LRN-I234-5678-9ABC'), 'LRN-1234-5678-9ABC')
    assert.equal(normalizeSerial('LRN-L234-5678-9ABC'), 'LRN-1234-5678-9ABC')
  })

  test('rejects the wrong length and junk', () => {
    assert.equal(normalizeSerial('LRN-123-456'), null)
    assert.equal(normalizeSerial(''), null)
    assert.equal(normalizeSerial(null), null)
  })
})

describe('certificateEligibility', () => {
  test('issues for a passed, teacher-visible classroom exam', () => {
    const v = certificateEligibility(passedExam)
    assert.equal(v.eligible, true)
    assert.equal(v.mode, 'classroom')
  })

  test('REFUSES a self-paced pass until the viva is passed', () => {
    // The single most important rule in this module: an unproctored
    // multiple-choice score alone must never mint a certificate.
    const v = certificateEligibility({ ...passedExam, mode: 'self_paced', viva_passed: null })
    assert.equal(v.eligible, false)
    assert.match(v.reason, /own words/i)

    assert.equal(
      certificateEligibility({ ...passedExam, mode: 'self_paced', viva_passed: false }).eligible,
      false
    )
    assert.equal(
      certificateEligibility({ ...passedExam, mode: 'self_paced', viva_passed: true }).eligible,
      true
    )
  })

  test('treats an unknown mode as self-paced, the stricter regime', () => {
    // Mirrors resolveAttemptMode: a lookup failure must never hand out an
    // easier certificate.
    const v = certificateEligibility({ ...passedExam, mode: undefined })
    assert.equal(v.eligible, false)
  })

  test('refuses a failed, ungraded, practice or missing attempt', () => {
    assert.equal(certificateEligibility({ ...passedExam, passed: false }).eligible, false)
    assert.equal(certificateEligibility({ ...passedExam, status: 'submitted' }).eligible, false)
    assert.equal(certificateEligibility({ ...passedExam, kind: 'practice' }).eligible, false)
    assert.equal(certificateEligibility(null).eligible, false)
  })

  test('a teacher invalidating the attempt overrides the pass', () => {
    const v = certificateEligibility(passedExam, { review: { decision: 'invalidated' } })
    assert.equal(v.eligible, false)
    assert.match(v.reason, /invalid/i)
  })

  test('a teacher clearing the attempt leaves it eligible', () => {
    assert.equal(certificateEligibility(passedExam, { review: { decision: 'cleared' } }).eligible, true)
  })
})

describe('buildCertificateSnapshot', () => {
  test('freezes display values so later renames cannot rewrite history', () => {
    const snap = buildCertificateSnapshot({
      learnerName: 'Asha R',
      subjectTitle: 'Data Structures',
      score: 84.6,
      mode: 'self_paced',
      concepts: ['Big-O notation', 'Hashing'],
      vivaPassed: true,
      issuedAt: new Date('2026-07-25T10:00:00Z')
    })
    assert.equal(snap.learner_name, 'Asha R')
    assert.equal(snap.subject_title, 'Data Structures')
    assert.equal(snap.score, 85)
    assert.equal(snap.viva_passed, true)
    assert.deepEqual(snap.concepts, ['Big-O notation', 'Hashing'])
    assert.equal(snap.issued_at, '2026-07-25T10:00:00.000Z')
  })

  test('caps the concept list and survives missing values', () => {
    const snap = buildCertificateSnapshot({
      score: null,
      mode: 'classroom',
      concepts: Array.from({ length: 30 }, (_, i) => `c${i}`)
    })
    assert.equal(snap.concepts.length, 12)
    assert.equal(snap.learner_name, 'Learner')
    assert.equal(snap.score, 0)
  })
})

describe('conceptsFromAttempt', () => {
  test('dedupes concepts in served order', () => {
    const attempt = {
      items: [{ concept: 'Trees' }, { concept: 'Graphs' }, { concept: 'Trees' }, {}]
    }
    assert.deepEqual(conceptsFromAttempt(attempt), ['Trees', 'Graphs'])
  })

  test('handles a missing items array', () => {
    assert.deepEqual(conceptsFromAttempt({}), [])
    assert.deepEqual(conceptsFromAttempt(null), [])
  })
})
