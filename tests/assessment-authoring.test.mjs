import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  questionPoints,
  totalPoints,
  totalQuestionCount,
  validateForPublish,
  windowState,
  canAttempt,
  remainingMs,
  resolvePaperItems,
  scoreWeighted,
  MIN_QUESTIONS
} from '../lib/assessment/authoring.js'

const item = (id, conceptKey, difficulty, kind = 'mcq') => ({
  id,
  concept: conceptKey.replace(/-/g, ' '),
  concept_key: conceptKey,
  kind,
  difficulty,
  stem: `Question ${id}`,
  options: ['a', 'b', 'c', 'd']
})

const pinned = (itemId, position, points = 1) => ({
  source: 'item', item_id: itemId, position, points
})

const blueprint = (conceptKey, drawCount, position, extra = {}) => ({
  source: 'blueprint',
  concept_key: conceptKey,
  draw_count: drawCount,
  difficulty_min: 1,
  difficulty_max: 5,
  position,
  points: 1,
  ...extra
})

describe('points and counts', () => {
  test('a blueprint is worth its points PER drawn question', () => {
    // Otherwise a rule drawing 5 questions would weigh the same as one pinned
    // item and the paper total would not match what students actually sit.
    assert.equal(questionPoints(blueprint('tcp', 5, 0, { points: 2 })), 10)
    assert.equal(questionPoints(pinned('i1', 0, 2)), 2)
  })

  test('totals cover both shapes', () => {
    const questions = [pinned('i1', 0, 3), blueprint('tcp', 4, 1, { points: 2 })]
    assert.equal(totalPoints(questions), 3 + 8)
    assert.equal(totalQuestionCount(questions), 1 + 4)
  })

  test('a non-positive weight contributes nothing rather than subtracting', () => {
    assert.equal(questionPoints({ source: 'item', points: -5 }), 0)
  })
})

describe('validateForPublish', () => {
  const ok = { title: 'Midterm', max_attempts: 1 }

  test('accepts a well-formed paper', () => {
    const result = validateForPublish({
      assessment: ok,
      questions: [pinned('i1', 0), pinned('i2', 1), pinned('i3', 2)],
      bankCounts: {}
    })
    assert.equal(result.ok, true)
    assert.deepEqual(result.errors, [])
  })

  test('rejects a paper with too few questions', () => {
    const result = validateForPublish({ assessment: ok, questions: [pinned('i1', 0)] })
    assert.equal(result.ok, false)
    assert.match(result.errors.join(' '), new RegExp(`at least ${MIN_QUESTIONS}`))
  })

  test('rejects a missing title', () => {
    const result = validateForPublish({
      assessment: { title: '   ' },
      questions: [pinned('i1', 0), pinned('i2', 1), pinned('i3', 2)]
    })
    assert.match(result.errors.join(' '), /needs a title/)
  })

  test('rejects a close time before the open time', () => {
    const result = validateForPublish({
      assessment: { ...ok, opens_at: '2026-08-01T10:00:00Z', closes_at: '2026-08-01T09:00:00Z' },
      questions: [pinned('i1', 0), pinned('i2', 1), pinned('i3', 2)]
    })
    assert.match(result.errors.join(' '), /close time must be after/)
  })

  test('rejects a time limit longer than the window it is open for', () => {
    // Otherwise every student is guaranteed to be cut off mid-paper.
    const result = validateForPublish({
      assessment: {
        ...ok,
        opens_at: '2026-08-01T10:00:00Z',
        closes_at: '2026-08-01T10:30:00Z',
        duration_minutes: 90
      },
      questions: [pinned('i1', 0), pinned('i2', 1), pinned('i3', 2)]
    })
    assert.match(result.errors.join(' '), /longer than the window/)
  })

  // The failure a teacher cannot see by looking at the draft: a rule that the
  // bank cannot fill.
  test('rejects a blueprint on a concept with no items at all', () => {
    const result = validateForPublish({
      assessment: ok,
      questions: [blueprint('tcp-handshake', 3, 0)],
      bankCounts: { 'other-concept': 10 }
    })
    assert.equal(result.ok, false)
    assert.match(result.errors.join(' '), /No questions exist in the bank/)
  })

  test('warns (but allows) when the bank can only partly fill a blueprint', () => {
    const result = validateForPublish({
      assessment: ok,
      questions: [blueprint('tcp-handshake', 5, 0)],
      bankCounts: { 'tcp-handshake': 2 }
    })
    assert.equal(result.errors.filter((e) => /bank/.test(e)).length, 0)
    assert.match(result.warnings.join(' '), /asks for 5 .* has 2/)
  })

  test('rejects a pinned item that cannot be auto-graded', () => {
    const result = validateForPublish({
      assessment: ok,
      questions: [
        { ...pinned('i1', 0), item: item('i1', 'tcp', 3, 'why') },
        pinned('i2', 1),
        pinned('i3', 2)
      ]
    })
    assert.match(result.errors.join(' '), /cannot be auto-graded/)
  })

  test('accepts a Map for bankCounts as well as a plain object', () => {
    const result = validateForPublish({
      assessment: ok,
      questions: [blueprint('tcp', 3, 0)],
      bankCounts: new Map([['tcp', 5]])
    })
    assert.equal(result.ok, true)
  })
})

describe('windowState', () => {
  const at = (iso) => Date.parse(iso)

  test('a draft is a draft regardless of its window', () => {
    assert.equal(windowState({ status: 'draft', opens_at: '2020-01-01T00:00:00Z' }), 'draft')
  })

  test('published but not yet open reads as scheduled', () => {
    const a = { status: 'published', opens_at: '2026-08-01T10:00:00Z' }
    assert.equal(windowState(a, at('2026-07-30T00:00:00Z')), 'scheduled')
  })

  test('inside the window it is open', () => {
    const a = { status: 'published', opens_at: '2026-08-01T10:00:00Z', closes_at: '2026-08-01T12:00:00Z' }
    assert.equal(windowState(a, at('2026-08-01T11:00:00Z')), 'open')
  })

  test('past the close time it is closed without anything having to run', () => {
    const a = { status: 'published', opens_at: '2026-08-01T10:00:00Z', closes_at: '2026-08-01T12:00:00Z' }
    assert.equal(windowState(a, at('2026-08-02T00:00:00Z')), 'closed')
  })

  test('a published paper with no window is simply open', () => {
    assert.equal(windowState({ status: 'published' }), 'open')
  })
})

describe('canAttempt', () => {
  const open = { status: 'published', max_attempts: 2 }

  test('allows a first attempt and reports what is left', () => {
    const result = canAttempt({ assessment: open, attemptsUsed: 0 })
    assert.equal(result.allowed, true)
    assert.equal(result.attemptsRemaining, 2)
  })

  test('blocks once attempts are exhausted, and says so', () => {
    const result = canAttempt({ assessment: open, attemptsUsed: 2 })
    assert.equal(result.allowed, false)
    assert.match(result.reason, /all 2 attempts/)
  })

  test('uses singular wording for a one-shot paper', () => {
    const result = canAttempt({ assessment: { status: 'published', max_attempts: 1 }, attemptsUsed: 1 })
    assert.match(result.reason, /already submitted/)
  })

  test('blocks a draft with a reason', () => {
    const result = canAttempt({ assessment: { status: 'draft' } })
    assert.equal(result.allowed, false)
    assert.match(result.reason, /not been published/)
  })
})

describe('remainingMs', () => {
  const now = Date.parse('2026-08-01T11:00:00Z')

  test('untimed and unbounded returns null', () => {
    assert.equal(remainingMs({ assessment: {}, startedAt: null, now }), null)
  })

  test('honors the per-attempt duration', () => {
    const out = remainingMs({
      assessment: { duration_minutes: 60 },
      startedAt: '2026-08-01T10:30:00Z',
      now
    })
    assert.equal(out, 30 * 60000)
  })

  // The case that matters: starting just before close must not grant the full
  // duration and let a student submit long after the paper shut.
  test('the paper close time wins when it comes first', () => {
    const out = remainingMs({
      assessment: { duration_minutes: 60, closes_at: '2026-08-01T11:10:00Z' },
      startedAt: '2026-08-01T11:00:00Z',
      now
    })
    assert.equal(out, 10 * 60000)
  })

  test('never goes negative', () => {
    const out = remainingMs({
      assessment: { closes_at: '2026-08-01T10:00:00Z' },
      startedAt: '2026-08-01T09:00:00Z',
      now
    })
    assert.equal(out, 0)
  })
})

describe('resolvePaperItems', () => {
  const bank = [
    item('i1', 'tcp-handshake', 2),
    item('i2', 'tcp-handshake', 3),
    item('i3', 'tcp-handshake', 4),
    item('i4', 'dns-lookup', 3),
    item('i5', 'dns-lookup', 5),
    item('i6', 'tcp-handshake', 3, 'why') // not auto-gradable
  ]

  test('serves pinned questions in position order', () => {
    const { items } = resolvePaperItems({
      questions: [pinned('i4', 1), pinned('i1', 0)],
      items: bank
    })
    assert.deepEqual(items.map((i) => i.id), ['i1', 'i4'])
  })

  test('fills a blueprint from the matching concept', () => {
    const { items, short } = resolvePaperItems({
      questions: [blueprint('dns-lookup', 2, 0)],
      items: bank,
      seed: 42
    })
    assert.equal(items.length, 2)
    assert.ok(items.every((i) => i.concept_key === 'dns-lookup'))
    assert.deepEqual(short, [])
  })

  test('a blueprint never re-draws an item already pinned on the same paper', () => {
    const { items } = resolvePaperItems({
      questions: [pinned('i4', 0), blueprint('dns-lookup', 2, 1)],
      items: bank,
      seed: 7
    })
    const ids = items.map((i) => i.id)
    assert.equal(new Set(ids).size, ids.length, 'no duplicates')
    assert.equal(ids.filter((id) => id === 'i4').length, 1)
  })

  test('blueprints respect the difficulty band', () => {
    const { items } = resolvePaperItems({
      questions: [blueprint('tcp-handshake', 5, 0, { difficulty_min: 4, difficulty_max: 5 })],
      items: bank,
      seed: 1
    })
    assert.deepEqual(items.map((i) => i.id), ['i3'])
  })

  test('blueprints never draw an item that cannot be auto-graded', () => {
    const { items } = resolvePaperItems({
      questions: [blueprint('tcp-handshake', 10, 0)],
      items: bank,
      seed: 3
    })
    assert.ok(!items.some((i) => i.kind === 'why'))
  })

  // Reported rather than silently swallowed — the teacher needs to know the
  // paper served short.
  test('reports a blueprint the bank could not fill', () => {
    const { short } = resolvePaperItems({
      questions: [blueprint('dns-lookup', 9, 0)],
      items: bank,
      seed: 5
    })
    assert.deepEqual(short, [{ conceptKey: 'dns-lookup', wanted: 9, got: 2 }])
  })

  test('skips a pinned item whose bank row was deleted after authoring', () => {
    const { items } = resolvePaperItems({
      questions: [pinned('i1', 0), pinned('deleted-id', 1)],
      items: bank
    })
    assert.deepEqual(items.map((i) => i.id), ['i1'])
  })

  test('is deterministic for a given seed', () => {
    const run = () => resolvePaperItems({
      questions: [blueprint('tcp-handshake', 2, 0)],
      items: bank,
      seed: 99
    }).items.map((i) => i.id)
    assert.deepEqual(run(), run())
  })

  test('different seeds can produce different papers', () => {
    const ids = (seed) => resolvePaperItems({
      questions: [blueprint('tcp-handshake', 1, 0)],
      items: bank,
      seed
    }).items.map((i) => i.id).join()
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(ids))
    assert.ok(seen.size > 1, 'seeded draws vary across students')
  })

  test('keeps points aligned with the items they belong to', () => {
    const { items, points } = resolvePaperItems({
      questions: [pinned('i1', 0, 5), blueprint('dns-lookup', 2, 1, { points: 3 })],
      items: bank,
      seed: 11
    })
    assert.equal(items.length, 3)
    assert.deepEqual(points, [5, 3, 3])
  })
})

describe('scoreWeighted', () => {
  test('weights questions by their points rather than counting them equally', () => {
    const out = scoreWeighted({
      responses: [{ correct: true }, { correct: false }],
      points: [9, 1]
    })
    assert.equal(out.earned, 9)
    assert.equal(out.possible, 10)
    assert.equal(out.percent, 90)
  })

  test('defaults a missing weight to 1', () => {
    const out = scoreWeighted({ responses: [{ correct: true }, { correct: true }], points: [] })
    assert.equal(out.percent, 100)
    assert.equal(out.possible, 2)
  })

  test('an empty paper scores 0 rather than dividing by zero', () => {
    assert.equal(scoreWeighted({ responses: [], points: [] }).percent, 0)
  })
})
