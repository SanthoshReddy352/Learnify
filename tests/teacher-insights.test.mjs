import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  CELL_STATES,
  CONCERN_ORDER,
  classifyCell,
  conceptsForTopic,
  normalizeRowKey,
  buildClassHeatmap,
  describeHeatmap,
  describeStudentConcern,
  buildClassHeadline,
  buildWeeklyTrend,
  idleDaysFrom
} from '../lib/teacher/insights.js'

describe('classifyCell', () => {
  test('no progress row or a locked topic is "not started", not a concern', () => {
    assert.equal(classifyCell({}), CELL_STATES.NOT_STARTED)
    assert.equal(classifyCell({ status: 'locked' }), CELL_STATES.NOT_STARTED)
    assert.equal(classifyCell({ status: 'available', reviewCount: 0 }), CELL_STATES.NOT_STARTED)
  })

  test('reached but not yet recalled is "in progress", outside the concern ramp', () => {
    // This is the cry-wolf guard: normal pacing must not look like trouble.
    assert.equal(classifyCell({ status: 'learning', reviewCount: 0 }), CELL_STATES.IN_PROGRESS)
    assert.equal(classifyCell({ status: 'mastered', reviewCount: 0 }), CELL_STATES.IN_PROGRESS)
    assert.ok(!CONCERN_ORDER.includes(CELL_STATES.IN_PROGRESS))
  })

  test('bands follow recall quality around the SM-2 hinge at 3', () => {
    const base = { status: 'reviewing', reviewCount: 3 }
    assert.equal(classifyCell({ ...base, averageQuality: 1.5 }), CELL_STATES.STRUGGLING)
    assert.equal(classifyCell({ ...base, averageQuality: 2.4 }), CELL_STATES.STRUGGLING)
    assert.equal(classifyCell({ ...base, averageQuality: 3.0 }), CELL_STATES.WATCH)
    assert.equal(classifyCell({ ...base, averageQuality: 3.8 }), CELL_STATES.STEADY)
    assert.equal(classifyCell({ ...base, averageQuality: 4.8 }), CELL_STATES.SOLID)
  })

  test('a strong but overdue topic is flagged to watch before it decays', () => {
    const cell = classifyCell({ status: 'mastered', reviewCount: 2, averageQuality: 4.8, overdue: true })
    assert.equal(cell, CELL_STATES.WATCH)
  })

  test('reviews with no rating cannot be banded, so they stay "in progress"', () => {
    assert.equal(
      classifyCell({ status: 'reviewing', reviewCount: 2, averageQuality: null }),
      CELL_STATES.IN_PROGRESS
    )
  })
})

describe('conceptsForTopic / normalizeRowKey', () => {
  test('reads concepts from a P6.5 ledger, as strings or objects', () => {
    assert.deepEqual(
      conceptsForTopic({ concept_ledger: { concepts_introduced: ['Recursion', { concept: 'Base case' }] } }),
      ['Recursion', 'Base case']
    )
  })

  test('a missing or malformed ledger yields nothing rather than throwing', () => {
    assert.deepEqual(conceptsForTopic({}), [])
    assert.deepEqual(conceptsForTopic({ concept_ledger: 'nope' }), [])
    assert.deepEqual(conceptsForTopic({ concept_ledger: { concepts_introduced: [null, '  '] } }), [])
  })

  test('keys normalize like P8.1 so casing and punctuation collapse to one row', () => {
    assert.equal(normalizeRowKey('Big-O Notation'), normalizeRowKey('big o notation'))
  })
})

describe('buildClassHeatmap', () => {
  const students = [
    { studentUserId: 'a', name: 'Asha' },
    { studentUserId: 'b', name: 'Ben' },
    { studentUserId: 'c', name: 'Cato' }
  ]
  const now = new Date('2026-07-25T12:00:00Z')

  const topics = [
    { id: 't1', title: 'Recursion' },
    { id: 't2', title: 'Sorting' }
  ]

  const progressRows = [
    { student_user_id: 'a', topic_id: 't1', status: 'reviewing', next_review_at: null },
    { student_user_id: 'b', topic_id: 't1', status: 'reviewing', next_review_at: null },
    { student_user_id: 'c', topic_id: 't1', status: 'locked', next_review_at: null },
    { student_user_id: 'a', topic_id: 't2', status: 'mastered', next_review_at: null }
  ]

  const reviewLogs = [
    { user_id: 'a', topic_id: 't1', quality_rating: 2 },
    { user_id: 'b', topic_id: 't1', quality_rating: 1 },
    { user_id: 'a', topic_id: 't2', quality_rating: 5 }
  ]

  test('falls back to topic rows when no ledgers are present', () => {
    const map = buildClassHeatmap({ students, topics, progressRows, reviewLogs, now })
    assert.equal(map.source, 'topics')
    assert.deepEqual(map.rows.map((r) => r.label), ['Recursion', 'Sorting'])
  })

  test('worst row first, so the weakest area needs no scanning', () => {
    const map = buildClassHeatmap({ students, topics, progressRows, reviewLogs, now })
    assert.equal(map.rows[0].label, 'Recursion')
    assert.equal(map.rows[0].strugglingCount, 2)
  })

  test('students with no evidence are excluded from the row score, not counted as fine', () => {
    const map = buildClassHeatmap({ students, topics, progressRows, reviewLogs, now })
    const recursion = map.rows[0]
    // Cato has not reached it: 3 cells rendered, only 2 scored.
    assert.equal(recursion.cells.length, 3)
    assert.equal(recursion.evidenceCount, 2)
    assert.equal(recursion.cells.find((c) => c.studentUserId === 'c').state, CELL_STATES.NOT_STARTED)
    // Two struggling out of two scored = maximum concern, undiluted.
    assert.equal(recursion.concern, 1)
  })

  test('rows nobody has evidence on sink below rows that do, rather than reading as fine', () => {
    const map = buildClassHeatmap({
      students,
      topics: [...topics, { id: 't3', title: 'Untouched' }],
      progressRows,
      reviewLogs,
      now
    })
    assert.equal(map.rows[map.rows.length - 1].label, 'Untouched')
    assert.equal(map.rows[map.rows.length - 1].concern, null)
  })

  test('uses concept rows when ledgers exist, merging the topics that teach each concept', () => {
    const withLedgers = [
      { id: 't1', title: 'Recursion', concept_ledger: { concepts_introduced: ['Base case'] } },
      { id: 't2', title: 'Sorting', concept_ledger: { concepts_introduced: ['Base case', 'Partitioning'] } }
    ]
    const map = buildClassHeatmap({ students, topics: withLedgers, progressRows, reviewLogs, now })
    assert.equal(map.source, 'concepts')
    const baseCase = map.rows.find((r) => r.label === 'Base case')
    assert.deepEqual(baseCase.topicIds, ['t1', 't2'])
  })

  test('a concept spanning topics takes the student’s WORST topic, not their best', () => {
    // Asha struggles on t1 (quality 2) but is solid on t2 (quality 5). The
    // concept both teach must not be reported as understood.
    const withLedgers = [
      { id: 't1', title: 'Recursion', concept_ledger: { concepts_introduced: ['Base case'] } },
      { id: 't2', title: 'Sorting', concept_ledger: { concepts_introduced: ['Base case'] } }
    ]
    const map = buildClassHeatmap({ students, topics: withLedgers, progressRows, reviewLogs, now })
    const cell = map.rows[0].cells.find((c) => c.studentUserId === 'a')
    assert.equal(cell.state, CELL_STATES.STRUGGLING)
  })

  test('empty input is safe', () => {
    const map = buildClassHeatmap({})
    assert.deepEqual(map.rows, [])
    assert.deepEqual(map.students, [])
  })
})

describe('describeHeatmap', () => {
  test('names the weakest row and how many others have trouble', () => {
    const heatmap = {
      source: 'topics',
      rows: [
        { label: 'Recursion', concern: 1, strugglingCount: 2 },
        { label: 'Sorting', concern: 0.6, strugglingCount: 1 },
        { label: 'Arrays', concern: 0, strugglingCount: 0 }
      ]
    }
    const line = describeHeatmap(heatmap)
    assert.match(line, /^Recursion is the weakest topic — 2 students struggling\./)
    assert.match(line, /1 other topic also has struggling results\./)
  })

  test('says so plainly when nothing is struggling', () => {
    const line = describeHeatmap({ source: 'concepts', rows: [{ label: 'X', concern: 0, strugglingCount: 0 }] })
    assert.equal(line, 'No concept is showing a struggling result yet.')
  })

  test('nothing to say with no evidence at all', () => {
    assert.equal(describeHeatmap({ source: 'topics', rows: [{ label: 'X', concern: null }] }), null)
    assert.equal(describeHeatmap(null), null)
  })
})

describe('describeStudentConcern', () => {
  test('an idle student with overdue reviews and low recall escalates', () => {
    const meta = describeStudentConcern({
      overall: { totalTopics: 20, completionPercentage: 20 },
      dueReviews: 7,
      idleDays: 9,
      averageQuality: 2.1,
      totalMinutes: 100
    })
    assert.equal(meta.level, 'high')
    assert.ok(meta.priorityScore >= 7)
    assert.equal(meta.reasons.length, 3)
    assert.equal(meta.headline, meta.reasons[0])
  })

  test('a student keeping pace is on-track with nothing to do', () => {
    const meta = describeStudentConcern({
      overall: { totalTopics: 20, completionPercentage: 80 },
      dueReviews: 0,
      idleDays: 1,
      averageQuality: 4.5,
      currentWeekMinutes: 120,
      previousWeekMinutes: 110,
      totalMinutes: 900
    })
    assert.equal(meta.level, 'on-track')
    assert.equal(meta.priorityScore, 0)
    assert.deepEqual(meta.reasons, [])
    assert.match(meta.headline, /Keeping pace/)
  })

  test('levels are ordered by score across the thresholds', () => {
    const at = (dueReviews, idleDays) => describeStudentConcern({ dueReviews, idleDays, overall: { totalTopics: 0, completionPercentage: 0 } }).level
    assert.equal(at(1, 1), 'on-track') // score 1
    assert.equal(at(3, 1), 'low') // score 2
    assert.equal(at(3, 5), 'medium') // score 4
    assert.equal(at(7, 9), 'high') // score 7
  })

  test('a student with no data at all is surfaced, not silently on-track', () => {
    const meta = describeStudentConcern({ idleDays: null })
    assert.equal(meta.level, 'medium')
    assert.match(meta.headline, /No study sessions logged yet/)
  })

  // Mirrors the P10.4 integrity-label test. A study log can support "no sessions
  // in 9 days"; it cannot support a verdict about the student.
  test('every line is observational — never a judgement of the student', () => {
    const cases = [
      { idleDays: null },
      { idleDays: 12, dueReviews: 9, averageQuality: 1.2, overall: { totalTopics: 10, completionPercentage: 10 }, totalMinutes: 50, weakTopicCount: 5, previousWeekMinutes: 200, currentWeekMinutes: 0 },
      { idleDays: 5, dueReviews: 4, averageQuality: 3.0, overall: { totalTopics: 10, completionPercentage: 40 }, totalMinutes: 300 },
      { idleDays: 0, dueReviews: 0, averageQuality: 4.9, overall: { totalTopics: 10, completionPercentage: 100 } }
    ]
    const banned = [
      'lazy', 'disengaged', 'careless', 'weak student', 'poor student', 'failing',
      'bad', 'unmotivated', 'neglect', 'slacking', 'not trying', 'gave up',
      'struggling student', 'incapable', 'behind the class', 'worst'
    ]
    for (const input of cases) {
      const meta = describeStudentConcern(input)
      const copy = [meta.label, meta.action, meta.headline, ...meta.reasons].join(' ').toLowerCase()
      for (const word of banned) {
        assert.ok(!copy.includes(word), `"${word}" should not appear in teacher-facing copy: ${copy}`)
      }
    }
  })
})

describe('buildClassHeadline', () => {
  const students = [
    { attention: { level: 'high' } },
    { attention: { level: 'medium' } },
    { attention: { level: 'on-track' } }
  ]

  test('leads with how many need a look, then activity, then the weakest area', () => {
    const lines = buildClassHeadline({
      summary: { rosterSize: 3, activeStudentsThisWeek: 2, averageCompletion: 55 },
      students,
      heatmap: { source: 'topics', rows: [{ label: 'Recursion', concern: 1, strugglingCount: 2 }] }
    })
    assert.equal(lines.length, 3)
    assert.match(lines[0], /2 of 3 students could use a look this week\./)
    assert.match(lines[1], /2 studied in the last seven days, and the class averages 55%/)
    assert.match(lines[2], /Recursion is the weakest topic/)
  })

  test('says everyone is keeping pace when nobody is flagged', () => {
    const lines = buildClassHeadline({
      summary: { rosterSize: 4, activeStudentsThisWeek: 4, averageCompletion: 70 },
      students: [{ attention: { level: 'on-track' } }]
    })
    assert.match(lines[0], /All 4 students are keeping pace/)
  })

  test('an inactive week is stated rather than dressed up', () => {
    const lines = buildClassHeadline({
      summary: { rosterSize: 5, activeStudentsThisWeek: 0 },
      students: []
    })
    assert.match(lines[1], /Nobody has logged study time in the last seven days\./)
  })

  test('an empty roster gets an actionable empty state', () => {
    const lines = buildClassHeadline({ summary: { rosterSize: 0 }, students: [] })
    assert.equal(lines.length, 1)
    assert.match(lines[0], /invite the class/)
  })
})

describe('buildWeeklyTrend', () => {
  const now = new Date('2026-07-25T12:00:00Z') // Saturday; week starts Mon 2026-07-20

  test('returns the requested number of weeks, oldest first, ending this week', () => {
    const trend = buildWeeklyTrend({ logs: [], weeks: 4, now, timeZone: 'UTC' })
    assert.equal(trend.length, 4)
    assert.equal(trend[0].weekStart, '2026-06-29')
    assert.equal(trend[3].weekStart, '2026-07-20')
    assert.equal(trend[3].label, 'Jul 20')
  })

  test('buckets minutes, review counts and average quality per week', () => {
    const logs = [
      { created_at: '2026-07-21T09:00:00Z', session_type: 'review', duration_minutes: 10, quality_rating: 4 },
      { created_at: '2026-07-22T09:00:00Z', session_type: 'review', duration_minutes: 20, quality_rating: 2 },
      { created_at: '2026-07-22T10:00:00Z', session_type: 'learning', duration_minutes: 30, quality_rating: null },
      { created_at: '2026-07-14T09:00:00Z', session_type: 'review', duration_minutes: 5, quality_rating: 5 }
    ]
    const trend = buildWeeklyTrend({ logs, weeks: 3, now, timeZone: 'UTC' })
    const thisWeek = trend[trend.length - 1]
    assert.equal(thisWeek.minutes, 60)
    assert.equal(thisWeek.reviews, 2)
    assert.equal(thisWeek.averageQuality, 3)
    const lastWeek = trend[trend.length - 2]
    assert.equal(lastWeek.reviews, 1)
    assert.equal(lastWeek.averageQuality, 5)
  })

  test('a week with no rated reviews reports null quality, not zero', () => {
    // Zero would draw a line to the floor and read as "the class recalled
    // nothing", when in fact nothing was measured.
    const logs = [{ created_at: '2026-07-21T09:00:00Z', session_type: 'learning', duration_minutes: 40 }]
    const trend = buildWeeklyTrend({ logs, weeks: 2, now, timeZone: 'UTC' })
    assert.equal(trend[1].averageQuality, null)
    assert.equal(trend[1].minutes, 40)
  })

  test('logs outside the window and bad timestamps are ignored', () => {
    const logs = [
      { created_at: '2020-01-01T00:00:00Z', session_type: 'review', duration_minutes: 999, quality_rating: 1 },
      { created_at: 'not-a-date', session_type: 'review', duration_minutes: 999 },
      {}
    ]
    const trend = buildWeeklyTrend({ logs, weeks: 3, now, timeZone: 'UTC' })
    assert.equal(trend.reduce((sum, w) => sum + w.minutes, 0), 0)
  })
})

describe('idleDaysFrom', () => {
  test('null when there is no activity, whole days otherwise', () => {
    const now = new Date('2026-07-25T12:00:00Z')
    assert.equal(idleDaysFrom(null, now), null)
    assert.equal(idleDaysFrom('2026-07-25T06:00:00Z', now), 0)
    assert.equal(idleDaysFrom('2026-07-20T12:00:00Z', now), 5)
  })
})
