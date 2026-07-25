import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WEEKLY_GOAL,
  activityDayKeys,
  streakInZone,
  deriveWeeklyGoal,
  suggestWeeklyGoal,
  deriveActivityCalendar,
  deriveSubjectCompletion
} from '../lib/gamification/goals.js'
import { shiftDayKey, weekStartKey, dayOfWeekForKey } from '../lib/time/zone.js'

const log = (iso, type = 'review') => ({ created_at: iso, session_type: type })

describe('day-key arithmetic', () => {
  test('shifting crosses month and year boundaries', () => {
    assert.equal(shiftDayKey('2026-03-01', -1), '2026-02-28')
    assert.equal(shiftDayKey('2026-01-01', -1), '2025-12-31')
    assert.equal(shiftDayKey('2026-12-31', 1), '2027-01-01')
  })

  test('weeks start on Monday', () => {
    // 2026-07-25 is a Saturday.
    assert.equal(dayOfWeekForKey('2026-07-25'), 6)
    assert.equal(weekStartKey('2026-07-25'), '2026-07-20')
    // A Sunday belongs to the week that started the previous Monday.
    assert.equal(weekStartKey('2026-07-26'), '2026-07-20')
    assert.equal(weekStartKey('2026-07-20'), '2026-07-20')
  })

  test('day shifting is DST-safe because it works on the calendar date', () => {
    // Around the US spring-forward (2026-03-08), a naive +24h on an instant
    // would skip or repeat a day. Calendar arithmetic cannot.
    assert.equal(shiftDayKey('2026-03-07', 1), '2026-03-08')
    assert.equal(shiftDayKey('2026-03-08', 1), '2026-03-09')
  })
})

describe('activityDayKeys', () => {
  test('buckets timestamps into the learner’s own local days', () => {
    // 2026-07-25T20:30Z is already 2026-07-26 in Asia/Kolkata.
    const logs = [log('2026-07-25T20:30:00Z')]
    assert.deepEqual([...activityDayKeys(logs, 'UTC')], ['2026-07-25'])
    assert.deepEqual([...activityDayKeys(logs, 'Asia/Kolkata')], ['2026-07-26'])
  })

  test('drops entries with a missing or unparseable timestamp', () => {
    assert.equal(activityDayKeys([{}, { created_at: 'nope' }], 'UTC').size, 0)
  })
})

describe('streakInZone', () => {
  const now = new Date('2026-07-25T12:00:00Z')

  test('counts consecutive days ending today', () => {
    const logs = ['2026-07-25', '2026-07-24', '2026-07-23'].map((d) => log(`${d}T09:00:00Z`))
    assert.equal(streakInZone(logs, { now, timeZone: 'UTC' }), 3)
  })

  test('a gap ends the streak', () => {
    const logs = ['2026-07-25', '2026-07-23'].map((d) => log(`${d}T09:00:00Z`))
    assert.equal(streakInZone(logs, { now, timeZone: 'UTC' }), 1)
  })

  test('nothing logged yet today does not break a live streak', () => {
    const logs = ['2026-07-24', '2026-07-23'].map((d) => log(`${d}T09:00:00Z`))
    assert.equal(streakInZone(logs, { now, timeZone: 'UTC' }), 2)
  })

  test('two days of silence does break it', () => {
    const logs = [log('2026-07-23T09:00:00Z')]
    assert.equal(streakInZone(logs, { now, timeZone: 'UTC' }), 0)
  })

  test('no logs at all is a zero streak, not a crash', () => {
    assert.equal(streakInZone([], { now, timeZone: 'UTC' }), 0)
    assert.equal(streakInZone(undefined, { now, timeZone: 'UTC' }), 0)
  })
})

describe('deriveWeeklyGoal', () => {
  // Saturday — day 6 of a Monday-start week.
  const saturday = new Date('2026-07-25T12:00:00Z')

  test('counts only review sessions inside the current local week', () => {
    const logs = [
      log('2026-07-20T09:00:00Z'), // Monday, in week
      log('2026-07-25T09:00:00Z'), // today, in week
      log('2026-07-19T09:00:00Z'), // Sunday, previous week
      log('2026-07-24T09:00:00Z', 'learning') // not a review
    ]
    const g = deriveWeeklyGoal({ logs, goal: 10, now: saturday, timeZone: 'UTC' })
    assert.equal(g.done, 2)
    assert.equal(g.goal, 10)
    assert.equal(g.remaining, 8)
    assert.equal(g.weekStart, '2026-07-20')
    assert.equal(g.dayOfWeek, 6)
    assert.equal(g.daysLeft, 1)
    assert.equal(g.met, false)
  })

  test('pace compares against the week elapsed, not the raw fraction', () => {
    // Tuesday (day 2 of 7): 6 of 14 is under half the goal, but pace-wise only
    // 4 were expected by now, so the learner is ahead — not "43% behind".
    const tuesday = new Date('2026-07-21T12:00:00Z')
    const logs = Array.from({ length: 6 }, () => log('2026-07-21T09:00:00Z'))
    const g = deriveWeeklyGoal({ logs, goal: 14, now: tuesday, timeZone: 'UTC' })
    assert.equal(g.pace, 'ahead')
    assert.ok(g.progress < 0.5)
  })

  test('behind pace late in the week', () => {
    const g = deriveWeeklyGoal({ logs: [log('2026-07-20T09:00:00Z')], goal: 14, now: saturday, timeZone: 'UTC' })
    assert.equal(g.pace, 'behind')
  })

  test('a met goal is reported met and progress caps at 1', () => {
    const logs = Array.from({ length: 12 }, () => log('2026-07-22T09:00:00Z'))
    const g = deriveWeeklyGoal({ logs, goal: 10, now: saturday, timeZone: 'UTC' })
    assert.equal(g.met, true)
    assert.equal(g.progress, 1)
    assert.equal(g.remaining, 0)
  })

  test('a nonsense goal falls back to the default', () => {
    assert.equal(deriveWeeklyGoal({ logs: [], goal: 0, now: saturday }).goal, DEFAULT_WEEKLY_GOAL)
    assert.equal(deriveWeeklyGoal({ logs: [], goal: null, now: saturday }).goal, DEFAULT_WEEKLY_GOAL)
  })

  test('week boundaries follow the learner’s zone', () => {
    // Monday 00:30 IST is still Sunday 19:00 UTC — the previous week in UTC.
    const logs = [log('2026-07-19T19:00:00Z')]
    const now = new Date('2026-07-22T12:00:00Z')
    assert.equal(deriveWeeklyGoal({ logs, goal: 10, now, timeZone: 'Asia/Kolkata' }).done, 1)
    assert.equal(deriveWeeklyGoal({ logs, goal: 10, now, timeZone: 'UTC' }).done, 0)
  })
})

describe('suggestWeeklyGoal', () => {
  const now = new Date('2026-07-25T12:00:00Z')

  test('a learner with no history gets an achievable floor, not an aspiration', () => {
    assert.equal(suggestWeeklyGoal({ logs: [], now, timeZone: 'UTC' }), 3)
  })

  test('scales with observed weekly volume and stretches slightly', () => {
    // 40 reviews over the 4-week lookback = 10/week → 11.
    const logs = Array.from({ length: 40 }, (_, i) =>
      log(`2026-07-${String(10 + (i % 14)).padStart(2, '0')}T09:00:00Z`)
    )
    const suggested = suggestWeeklyGoal({ logs, now, timeZone: 'UTC' })
    assert.ok(suggested >= 10 && suggested <= 12, `expected ~11, got ${suggested}`)
  })

  test('clamped so a heavy week cannot propose an impossible target', () => {
    const logs = Array.from({ length: 2000 }, () => log('2026-07-24T09:00:00Z'))
    assert.equal(suggestWeeklyGoal({ logs, now, timeZone: 'UTC' }), 60)
  })
})

describe('deriveActivityCalendar', () => {
  const now = new Date('2026-07-25T12:00:00Z')

  test('returns the requested span oldest-first, ending today', () => {
    const strip = deriveActivityCalendar({ logs: [], now, timeZone: 'UTC', days: 7 })
    assert.equal(strip.length, 7)
    assert.equal(strip[0].dateKey, '2026-07-19')
    assert.equal(strip[6].dateKey, '2026-07-25')
    assert.equal(strip[6].isToday, true)
    assert.equal(strip[6].label, 'Sat')
  })

  test('marks active days and counts sessions per day', () => {
    const logs = [
      log('2026-07-25T09:00:00Z'),
      log('2026-07-25T10:00:00Z', 'learning'),
      log('2026-07-23T09:00:00Z')
    ]
    const strip = deriveActivityCalendar({ logs, now, timeZone: 'UTC', days: 7 })
    const byKey = Object.fromEntries(strip.map((d) => [d.dateKey, d]))
    assert.equal(byKey['2026-07-25'].count, 2)
    assert.equal(byKey['2026-07-25'].active, true)
    assert.equal(byKey['2026-07-24'].active, false)
    assert.equal(byKey['2026-07-23'].count, 1)
  })
})

describe('deriveSubjectCompletion', () => {
  const stats = [
    { id: 'a', title: 'Done', progress: 100, totalTopics: 10, masteredTopics: 10 },
    { id: 'b', title: 'Nearly', progress: 90, totalTopics: 10, masteredTopics: 9 },
    { id: 'c', title: 'Halfway', progress: 50, totalTopics: 10, masteredTopics: 5 },
    { id: 'd', title: 'Untouched', progress: 0, totalTopics: 10, masteredTopics: 0 },
    { id: 'e', title: 'Empty', progress: 0, totalTopics: 0, masteredTopics: 0 }
  ]

  test('buckets subjects and ignores ones with no topics', () => {
    const c = deriveSubjectCompletion(stats)
    assert.equal(c.totalSubjects, 4)
    assert.equal(c.completedCount, 1)
    assert.equal(c.inProgressCount, 2)
    assert.equal(c.notStartedCount, 1)
  })

  test('nextUp points at what is closest to finished, not what has the most left', () => {
    const c = deriveSubjectCompletion(stats)
    assert.deepEqual(c.nextUp.map((s) => s.id), ['b', 'c'])
    assert.equal(c.nextUp[0].remaining, 1)
  })

  test('empty input is safe', () => {
    const c = deriveSubjectCompletion([])
    assert.equal(c.totalSubjects, 0)
    assert.deepEqual(c.nextUp, [])
  })
})
