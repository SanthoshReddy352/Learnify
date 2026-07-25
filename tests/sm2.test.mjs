import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { calculateSM2, calculateNextReviewDate, isDueForReview } from '../lib/sm2.ts'

describe('calculateSM2', () => {
  test('first successful review gives a 1-day interval', () => {
    const result = calculateSM2(5, 0, 0, 2.5)
    assert.equal(result.interval, 1)
    assert.equal(result.repetition, 1)
    assert.equal(result.efactor, 2.6) // 2.5 + 0.1 for quality 5
  })

  test('second successful review gives a 6-day interval', () => {
    const result = calculateSM2(4, 1, 1, 2.5)
    assert.equal(result.interval, 6)
    assert.equal(result.repetition, 2)
    assert.equal(result.efactor, 2.5) // quality 4 leaves efactor unchanged
  })

  test('third review multiplies the last interval by the ease factor', () => {
    const result = calculateSM2(5, 6, 2, 2.5)
    assert.equal(result.repetition, 3)
    assert.equal(result.interval, Math.round(6 * result.efactor))
  })

  test('quality below 3 resets repetition and interval', () => {
    const result = calculateSM2(2, 30, 5, 2.5)
    assert.equal(result.repetition, 0)
    assert.equal(result.interval, 1)
  })

  test('failed review still lowers the ease factor', () => {
    const before = 2.5
    const result = calculateSM2(0, 10, 3, before)
    assert.ok(result.efactor < before)
  })

  test('ease factor never drops below 1.3', () => {
    let efactor = 2.5
    for (let i = 0; i < 20; i++) {
      efactor = calculateSM2(0, 1, 0, efactor).efactor
    }
    assert.equal(efactor, 1.3)
  })

  test('interval is always at least 1 day', () => {
    for (let quality = 0; quality <= 5; quality++) {
      const result = calculateSM2(quality, 0, 0, 1.3)
      assert.ok(result.interval >= 1, `quality ${quality} produced interval ${result.interval}`)
    }
  })

  test('efactor is rounded to two decimals', () => {
    const result = calculateSM2(3, 6, 2, 2.5)
    assert.equal(result.efactor, Math.round(result.efactor * 100) / 100)
  })

  test('defaults apply when optional args are omitted', () => {
    const result = calculateSM2(5)
    assert.deepEqual(result, { interval: 1, repetition: 1, efactor: 2.6 })
  })
})

describe('calculateNextReviewDate', () => {
  test('returns an ISO date intervalDays in the future', () => {
    const before = Date.now()
    const iso = calculateNextReviewDate(3)
    const after = Date.now()
    const t = new Date(iso).getTime()
    const threeDays = 3 * 24 * 60 * 60 * 1000
    assert.ok(t >= before + threeDays && t <= after + threeDays)
  })
})

describe('isDueForReview', () => {
  test('null/undefined is never due', () => {
    assert.equal(isDueForReview(null), false)
    assert.equal(isDueForReview(undefined), false)
  })

  test('past date is due, future date is not', () => {
    assert.equal(isDueForReview(new Date(Date.now() - 1000).toISOString()), true)
    assert.equal(isDueForReview(new Date(Date.now() + 86400000).toISOString()), false)
  })
})
