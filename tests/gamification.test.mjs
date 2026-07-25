import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { deriveXp, levelForXp, evaluateBadges, deriveGamification, deriveCountsFromLogs } from '../lib/gamification/xp.js'

describe('deriveXp', () => {
  test('sums rewards across stat categories', () => {
    assert.equal(deriveXp({ topicsCompleted: 2, reviewsCompleted: 1 }), 2 * 50 + 20)
    assert.equal(deriveXp({}), 0)
  })
})

describe('levelForXp', () => {
  test('0 XP is level 1 with 0 progress', () => {
    const l = levelForXp(0)
    assert.equal(l.level, 1)
    assert.equal(l.progress, 0)
  })

  test('level boundaries follow the quadratic curve (100*(L-1)^2)', () => {
    assert.equal(levelForXp(100).level, 2) // 100*(2-1)^2 = 100
    assert.equal(levelForXp(399).level, 2)
    assert.equal(levelForXp(400).level, 3) // 100*(3-1)^2 = 400
  })

  test('progress is fractional within a level', () => {
    const l = levelForXp(250) // between 100 and 400
    assert.equal(l.level, 2)
    assert.ok(l.progress > 0 && l.progress < 1)
  })

  test('negative / garbage xp clamps to level 1', () => {
    assert.equal(levelForXp(-50).level, 1)
    assert.equal(levelForXp(undefined).level, 1)
  })
})

describe('evaluateBadges', () => {
  test('no progress earns nothing', () => {
    assert.deepEqual(evaluateBadges({}), [])
  })

  test('thresholds unlock the right badges', () => {
    const ids = evaluateBadges({ topicsCompleted: 10, reviewsCompleted: 25, streakDays: 7, subjectsCompleted: 1 })
    assert.ok(ids.includes('first-steps'))
    assert.ok(ids.includes('getting-going'))
    assert.ok(ids.includes('reviewer'))
    assert.ok(ids.includes('consistent'))
    assert.ok(ids.includes('subject-master'))
    assert.ok(!ids.includes('scholar')) // needs 50 topics
  })
})

describe('deriveCountsFromLogs', () => {
  const now = new Date('2026-07-25T12:00:00')
  const at = (daysAgo, type = 'learning') => ({
    session_type: type,
    created_at: new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 9).toISOString()
  })

  test('counts review sessions', () => {
    const { reviewsCompleted } = deriveCountsFromLogs([at(0, 'review'), at(1, 'review'), at(2, 'learning')], now)
    assert.equal(reviewsCompleted, 2)
  })

  test('counts a consecutive-day streak ending today', () => {
    const { streakDays } = deriveCountsFromLogs([at(0), at(1), at(2)], now)
    assert.equal(streakDays, 3)
  })

  test('a gap breaks the streak', () => {
    const { streakDays } = deriveCountsFromLogs([at(0), at(1), at(3)], now)
    assert.equal(streakDays, 2)
  })

  test('streak still counts if today has no log but yesterday does', () => {
    const { streakDays } = deriveCountsFromLogs([at(1), at(2)], now)
    assert.equal(streakDays, 2)
  })

  test('no logs → zero streak and reviews', () => {
    assert.deepEqual(deriveCountsFromLogs([], now), { reviewsCompleted: 0, streakDays: 0 })
  })
})

describe('deriveGamification', () => {
  test('returns level, progress, and per-badge earned flags', () => {
    const g = deriveGamification({ topicsCompleted: 1 })
    assert.equal(g.level, 1)
    assert.equal(g.earnedCount, 1)
    const first = g.badges.find((b) => b.id === 'first-steps')
    assert.equal(first.earned, true)
    const scholar = g.badges.find((b) => b.id === 'scholar')
    assert.equal(scholar.earned, false)
  })
})
