import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PREFERENCES,
  SEND_WINDOW_HOURS,
  normalizePreferences,
  localPartsFor,
  shouldSendReminder,
  buildReminderDigest,
  collectDueByUser
} from '../lib/reminders/schedule.js'

describe('normalizePreferences', () => {
  test('fills defaults for a missing row', () => {
    const p = normalizePreferences(null)
    assert.equal(p.reminder_hour, DEFAULT_PREFERENCES.reminder_hour)
    assert.equal(p.timezone, 'UTC')
    assert.equal(p.review_reminders, true)
  })

  test('clamps an out-of-range hour and goal back to the defaults', () => {
    const p = normalizePreferences({ reminder_hour: 47, weekly_review_goal: 0 })
    assert.equal(p.reminder_hour, DEFAULT_PREFERENCES.reminder_hour)
    assert.equal(p.weekly_review_goal, DEFAULT_PREFERENCES.weekly_review_goal)
  })

  test('blank timezone falls back to UTC', () => {
    assert.equal(normalizePreferences({ timezone: '   ' }).timezone, 'UTC')
  })
})

describe('localPartsFor', () => {
  test('resolves the hour in the learner’s own zone, not the server’s', () => {
    // 2026-07-25T20:30Z is 2026-07-26 02:00 in Asia/Kolkata (UTC+5:30).
    const now = new Date('2026-07-25T20:30:00Z')
    assert.deepEqual(localPartsFor(now, 'UTC'), {
      hour: 20,
      dateKey: '2026-07-25',
      timeZone: 'UTC'
    })
    const ist = localPartsFor(now, 'Asia/Kolkata')
    assert.equal(ist.hour, 2)
    assert.equal(ist.dateKey, '2026-07-26')
  })

  test('midnight reads as hour 0, never 24', () => {
    assert.equal(localPartsFor(new Date('2026-07-25T00:10:00Z'), 'UTC').hour, 0)
  })

  test('an unknown zone falls back to UTC instead of throwing', () => {
    const parts = localPartsFor(new Date('2026-07-25T20:30:00Z'), 'Mars/Olympus_Mons')
    assert.equal(parts.timeZone, 'UTC')
    assert.equal(parts.hour, 20)
  })
})

describe('shouldSendReminder', () => {
  const at = (iso) => new Date(iso)
  const base = { reminder_hour: 18, timezone: 'UTC' }

  test('sends inside the window when reviews are due', () => {
    const r = shouldSendReminder({ prefs: base, now: at('2026-07-25T18:05:00Z'), dueCount: 3 })
    assert.equal(r.send, true)
    assert.equal(r.localDate, '2026-07-25')
  })

  test('never sends when nothing is due', () => {
    const r = shouldSendReminder({ prefs: base, now: at('2026-07-25T18:05:00Z'), dueCount: 0 })
    assert.deepEqual(r, { send: false, reason: 'nothing_due' })
  })

  test('respects the master switch and the per-channel switches', () => {
    assert.equal(
      shouldSendReminder({ prefs: { ...base, review_reminders: false }, now: at('2026-07-25T18:05:00Z'), dueCount: 3 }).reason,
      'reminders_off'
    )
    assert.equal(
      shouldSendReminder({
        prefs: { ...base, push_enabled: false, email_enabled: false },
        now: at('2026-07-25T18:05:00Z'),
        dueCount: 3
      }).reason,
      'no_channel'
    )
  })

  test('holds before the chosen hour', () => {
    const r = shouldSendReminder({ prefs: base, now: at('2026-07-25T17:59:00Z'), dueCount: 3 })
    assert.deepEqual(r, { send: false, reason: 'too_early' })
  })

  test('gives up rather than pinging late at night after a missed run', () => {
    const r = shouldSendReminder({
      prefs: base,
      now: at(`2026-07-25T${String(18 + SEND_WINDOW_HOURS).padStart(2, '0')}:00:00Z`),
      dueCount: 3
    })
    assert.deepEqual(r, { send: false, reason: 'window_passed' })
  })

  test('at most one reminder per local calendar day', () => {
    const r = shouldSendReminder({
      prefs: { ...base, last_reminder_on: '2026-07-25' },
      now: at('2026-07-25T18:05:00Z'),
      dueCount: 3
    })
    assert.deepEqual(r, { send: false, reason: 'already_sent_today' })
  })

  test('a timestamptz-shaped last_reminder_on still matches the day', () => {
    const r = shouldSendReminder({
      prefs: { ...base, last_reminder_on: '2026-07-25T00:00:00+00:00' },
      now: at('2026-07-25T18:05:00Z'),
      dueCount: 3
    })
    assert.equal(r.reason, 'already_sent_today')
  })

  test('the hour is evaluated in the learner’s zone', () => {
    // 12:30Z is 18:00 IST — in the window for an IST learner, too early in UTC.
    const now = at('2026-07-25T12:30:00Z')
    assert.equal(shouldSendReminder({ prefs: { ...base, timezone: 'Asia/Kolkata' }, now, dueCount: 2 }).send, true)
    assert.equal(shouldSendReminder({ prefs: base, now, dueCount: 2 }).send, false)
  })
})

describe('collectDueByUser', () => {
  const now = new Date('2026-07-25T12:00:00Z')
  const rows = [
    {
      id: 's1',
      title: 'Algorithms',
      user_id: 'u1',
      topics: [
        { id: 't1', title: 'Overdue most', next_review_at: '2026-07-20T00:00:00Z', status: 'reviewing' },
        { id: 't2', title: 'Overdue less', next_review_at: '2026-07-24T00:00:00Z', status: 'mastered' },
        { id: 't3', title: 'Not yet due', next_review_at: '2026-07-30T00:00:00Z', status: 'reviewing' }
      ]
    },
    {
      id: 's2',
      title: 'Physics',
      user_id: 'u2',
      topics: [{ id: 't4', title: 'Kinematics', next_review_at: '2026-07-25T11:00:00Z', status: 'reviewing' }]
    }
  ]

  test('groups by learner and puts the most overdue first', () => {
    const byUser = collectDueByUser(rows, now)
    assert.deepEqual(byUser.get('u1').map((t) => t.id), ['t1', 't2'])
    assert.equal(byUser.get('u1')[0].subjectTitle, 'Algorithms')
    assert.deepEqual(byUser.get('u2').map((t) => t.id), ['t4'])
  })

  test('only counts statuses that carry an SM-2 schedule, matching the dashboard widget', () => {
    const byUser = collectDueByUser(
      [
        {
          id: 's3',
          title: 'New',
          user_id: 'u3',
          topics: [
            { id: 'a', title: 'Learning', next_review_at: '2026-07-01T00:00:00Z', status: 'learning' },
            { id: 'b', title: 'Available', next_review_at: '2026-07-01T00:00:00Z', status: 'available' },
            { id: 'c', title: 'Locked', next_review_at: '2026-07-01T00:00:00Z', status: 'locked' }
          ]
        }
      ],
      now
    )
    assert.equal(byUser.has('u3'), false)
  })

  test('ignores rows with no schedule, a bad date, or no owner', () => {
    const byUser = collectDueByUser(
      [
        { id: 's4', title: 'X', user_id: 'u4', topics: [
          { id: 'd', title: 'No date', next_review_at: null, status: 'reviewing' },
          { id: 'e', title: 'Bad date', next_review_at: 'not-a-date', status: 'reviewing' }
        ] },
        { id: 's5', title: 'Orphan', topics: [{ id: 'f', next_review_at: '2026-07-01T00:00:00Z', status: 'reviewing' }] }
      ],
      now
    )
    assert.equal(byUser.size, 0)
  })

  test('empty input yields an empty map', () => {
    assert.equal(collectDueByUser([], now).size, 0)
    assert.equal(collectDueByUser(undefined, now).size, 0)
  })
})

describe('buildReminderDigest', () => {
  const topics = [
    { title: 'Binary Search Trees' },
    { title: 'Hash Tables' },
    { title: 'Graph Traversal' },
    { title: 'Dynamic Programming' }
  ]

  test('names a couple of topics and counts the rest', () => {
    const d = buildReminderDigest({ dueTopics: topics })
    assert.equal(d.title, '4 reviews are ready')
    assert.match(d.body, /Binary Search Trees, Hash Tables and 2 more\./)
  })

  test('singular title for a single review', () => {
    assert.equal(buildReminderDigest({ dueTopics: [topics[0]] }).title, '1 review is ready')
  })

  test('mentions a streak only once it exists', () => {
    assert.doesNotMatch(buildReminderDigest({ dueTopics: topics, streakDays: 1 }).body, /streak/)
    assert.match(buildReminderDigest({ dueTopics: topics, streakDays: 6 }).body, /6-day streak/)
  })

  test('links to an absolute URL when the app URL is known, else a path', () => {
    assert.equal(buildReminderDigest({ dueTopics: topics }).url, '/dashboard')
    assert.equal(
      buildReminderDigest({ dueTopics: topics, appUrl: 'https://learnify.app/' }).url,
      'https://learnify.app/dashboard'
    )
  })

  test('survives topics with missing titles', () => {
    const d = buildReminderDigest({ dueTopics: [{}, { title: '  ' }] })
    assert.equal(d.title, '2 reviews are ready')
    assert.match(d.body, /Your scheduled reviews are ready\./)
  })

  test('all review reminders share one tag so they replace rather than stack', () => {
    assert.equal(buildReminderDigest({ dueTopics: topics }).tag, 'learnify-reviews')
  })

  // Mirrors the P10.4 teacher-label test: the copy is checked, not just trusted.
  // A reminder exists to make coming back easy, so it must not shame absence or
  // threaten the streak the learner has built.
  test('copy never guilts, threatens the streak, or scolds', () => {
    const d = buildReminderDigest({ dueTopics: topics, streakDays: 9 })
    const copy = [d.title, d.body, d.email.subject, d.email.text].join(' ').toLowerCase()
    for (const word of [
      'don\'t lose', 'about to lose', 'losing', 'break your', 'failing',
      'behind', 'neglect', 'forgot', 'lazy', 'last chance', 'urgent'
    ]) {
      assert.ok(!copy.includes(word), `reminder copy should not say "${word}"`)
    }
  })

  test('email text lists every due topic and how to turn reminders off', () => {
    const d = buildReminderDigest({ dueTopics: topics, appUrl: 'https://learnify.app' })
    for (const t of topics) assert.ok(d.email.text.includes(t.title))
    assert.match(d.email.text, /Settings/)
  })
})
