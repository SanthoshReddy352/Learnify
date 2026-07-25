import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MASTERED_AT,
  normalizeConceptKey,
  conceptsFromLedger,
  signalFromQuality,
  signalFromCorrectness,
  lessonSignal,
  doubtSignal,
  mergeConceptSignal,
  buildConceptStateRows,
  summarizeConceptState,
  buildLearnerMemoryContext,
  buildProactiveNudge,
  scoreTopicWeakness,
  orderReviewQueue
} from '../lib/memory/concept-state.js'

describe('normalizeConceptKey', () => {
  test('collapses case, punctuation and whitespace into one key', () => {
    const key = normalizeConceptKey('Big-O Notation.')
    assert.equal(key, 'big o notation')
    assert.equal(normalizeConceptKey('  big   o  notation '), key)
    assert.equal(normalizeConceptKey('big o notation'), key)
  })

  test('keeps + and # so language names stay distinct', () => {
    assert.equal(normalizeConceptKey('C++'), 'c++')
    assert.equal(normalizeConceptKey('C#'), 'c#')
    assert.notEqual(normalizeConceptKey('C++'), normalizeConceptKey('C#'))
  })

  test('empty-ish input yields an empty key', () => {
    assert.equal(normalizeConceptKey(null), '')
    assert.equal(normalizeConceptKey('  ...  '), '')
  })
})

describe('conceptsFromLedger', () => {
  test('merges introduced concepts and defined terms, de-duplicated by key', () => {
    const concepts = conceptsFromLedger({
      concepts_introduced: ['Recursion', 'Base case'],
      terms_defined: ['recursion.', 'Stack frame']
    })
    assert.deepEqual(concepts, ['Recursion', 'Base case', 'Stack frame'])
  })

  test('falls back to the topic title when there is no ledger', () => {
    assert.deepEqual(conceptsFromLedger(null, 'Dynamic Programming'), ['Dynamic Programming'])
    assert.deepEqual(conceptsFromLedger({}, ''), [])
  })
})

describe('mergeConceptSignal', () => {
  const now = new Date('2026-07-25T00:00:00Z')

  test('first observation seeds mastery instead of decaying up from zero', () => {
    const row = mergeConceptSignal(undefined, signalFromQuality(5), { now })
    assert.equal(row.mastery, 1)
    assert.equal(row.observations, 1)
    assert.equal(row.successes, 1)
    assert.equal(row.struggles, 0)
    assert.equal(row.last_signal, 'review')
    assert.equal(row.last_seen_at, now.toISOString())
  })

  test('later observations move mastery partway (EMA), not all the way', () => {
    const existing = { mastery: 1, exposures: 1, observations: 1, successes: 1, struggles: 0 }
    const row = mergeConceptSignal(existing, signalFromQuality(0), { now })
    assert.equal(row.mastery, 0.6) // 1 + 0.4 * (0 - 1)
    assert.equal(row.struggles, 1)
    assert.equal(row.successes, 1)
  })

  test('a failed review counts as a struggle and pulls mastery down', () => {
    const existing = { mastery: 0.8, exposures: 2, observations: 2, successes: 2, struggles: 0 }
    const row = mergeConceptSignal(existing, signalFromQuality(2), { now })
    assert.ok(row.mastery < 0.8)
    assert.equal(row.struggles, 1)
  })

  test('exposure-only signals record exposure without touching mastery', () => {
    const existing = { mastery: 0.42, exposures: 3, observations: 1, successes: 1, struggles: 0 }
    const lesson = mergeConceptSignal(existing, lessonSignal(), { now })
    assert.equal(lesson.mastery, 0.42)
    assert.equal(lesson.exposures, 4)
    assert.equal(lesson.observations, 1)
    assert.equal(lesson.struggles, 0)

    // Asking a question tallies a struggle but never penalizes mastery.
    const doubt = mergeConceptSignal(existing, doubtSignal(), { now })
    assert.equal(doubt.mastery, 0.42)
    assert.equal(doubt.observations, 1)
    assert.equal(doubt.struggles, 1)
  })

  test('mastery stays clamped to 0..1', () => {
    const row = mergeConceptSignal({ mastery: 1, observations: 5 }, signalFromCorrectness(true), {})
    assert.ok(row.mastery <= 1)
    const low = mergeConceptSignal({ mastery: 0, observations: 5 }, signalFromCorrectness(false), {})
    assert.ok(low.mastery >= 0)
  })
})

describe('buildConceptStateRows', () => {
  test('produces one upsert row per concept, merged onto existing state', () => {
    const rows = buildConceptStateRows({
      userId: 'u1',
      subjectId: 's1',
      concepts: ['Recursion', 'Base case'],
      signal: signalFromQuality(5),
      existing: [{ concept_key: 'recursion', mastery: 0.2, exposures: 1, observations: 1 }]
    })
    assert.equal(rows.length, 2)
    const recursion = rows.find((r) => r.concept_key === 'recursion')
    assert.equal(recursion.user_id, 'u1')
    assert.equal(recursion.subject_id, 's1')
    assert.equal(recursion.concept, 'Recursion')
    assert.equal(recursion.mastery, 0.52) // 0.2 + 0.4 * (1 - 0.2)
    const baseCase = rows.find((r) => r.concept_key === 'base case')
    assert.equal(baseCase.mastery, 1) // no prior observation → seeded
  })

  test('drops duplicate and empty concepts, and needs user + subject + signal', () => {
    const rows = buildConceptStateRows({
      userId: 'u1',
      subjectId: 's1',
      concepts: ['Recursion', 'recursion!', '  ', ''],
      signal: lessonSignal()
    })
    assert.equal(rows.length, 1)
    assert.deepEqual(buildConceptStateRows({ userId: 'u1', concepts: ['x'], signal: lessonSignal() }), [])
    assert.deepEqual(buildConceptStateRows({ userId: 'u1', subjectId: 's1', concepts: ['x'] }), [])
  })
})

describe('summarizeConceptState', () => {
  test('splits demonstrated mastery from repeated struggle', () => {
    const { mastered, shaky } = summarizeConceptState([
      { concept: 'Loops', mastery: 0.95, observations: 3, struggles: 0 },
      { concept: 'Recursion', mastery: 0.3, observations: 2, struggles: 1 },
      { concept: 'Pointers', mastery: 0.6, observations: 1, struggles: 3 }
    ])
    assert.deepEqual(mastered.map((r) => r.concept), ['Loops'])
    assert.deepEqual(shaky.map((r) => r.concept), ['Recursion', 'Pointers'])
  })

  test('an exposure-only row is neither mastered nor shaky', () => {
    const { mastered, shaky } = summarizeConceptState([
      { concept: 'Graphs', mastery: 1, observations: 0, struggles: 0 },
      { concept: 'Trees', mastery: 0, observations: 0, struggles: 0 }
    ])
    assert.equal(mastered.length, 0)
    assert.equal(shaky.length, 0)
  })
})

describe('buildLearnerMemoryContext', () => {
  test('returns empty string when there is no usable history', () => {
    assert.equal(buildLearnerMemoryContext(), '')
    assert.equal(buildLearnerMemoryContext([{ concept: 'Sets', mastery: 0.6, observations: 0 }]), '')
  })

  test('frames mastered concepts as do-not-re-teach and weak ones as slow-down', () => {
    const ctx = buildLearnerMemoryContext([
      { concept: 'Loops', mastery: MASTERED_AT + 0.1, observations: 2, struggles: 0 },
      { concept: 'Recursion', mastery: 0.2, observations: 2, struggles: 4 }
    ])
    assert.match(ctx, /ALREADY DEMONSTRATED MASTERY/)
    assert.match(ctx, /- Loops/)
    assert.match(ctx, /do NOT re-teach/)
    assert.match(ctx, /REPEATEDLY STRUGGLED WITH/)
    assert.match(ctx, /- Recursion \(asked about \/ failed 4×\)/)
    assert.match(ctx, /slow down/)
  })
})

describe('buildProactiveNudge', () => {
  test('stays silent until a concept is genuinely a pattern', () => {
    assert.equal(buildProactiveNudge(), '')
    assert.equal(buildProactiveNudge([{ concept: 'Loops', struggles: 1, observations: 1, mastery: 0.9 }]), '')
  })

  test('surfaces the most-struggled concepts with an offer-once instruction', () => {
    const nudge = buildProactiveNudge([
      { concept: 'Recursion', struggles: 5, observations: 2, mastery: 0.3 },
      { concept: 'Pointers', struggles: 3, observations: 1, mastery: 0.4 },
      { concept: 'Loops', struggles: 0, observations: 3, mastery: 0.9 }
    ])
    assert.match(nudge, /Recursion, Pointers/)
    assert.doesNotMatch(nudge, /Loops/)
    assert.match(nudge, /offer once/)
  })
})

describe('scoreTopicWeakness', () => {
  test('uses the learner\'s weakest concept in the topic when known', () => {
    const state = new Map([
      ['recursion', { concept_key: 'recursion', mastery: 0.2, observations: 2 }],
      ['base case', { concept_key: 'base case', mastery: 0.9, observations: 2 }]
    ])
    const topic = { title: 'Recursion', concept_ledger: { concepts_introduced: ['Recursion', 'Base case'] } }
    assert.equal(scoreTopicWeakness(topic, state), 0.8)
  })

  test('falls back to the SM-2 ease factor with no concept history', () => {
    assert.equal(scoreTopicWeakness({ title: 'X', difficulty_factor: 2.5 }, new Map()), 0)
    assert.equal(scoreTopicWeakness({ title: 'X', difficulty_factor: 1.3 }, new Map()), 1)
  })
})

describe('orderReviewQueue', () => {
  const now = new Date('2026-07-25T00:00:00Z')
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()

  test('weak concepts come before a barely-overdue easy topic', () => {
    const queue = orderReviewQueue(
      [
        { id: 'easy', title: 'Loops', subjectId: 's1', next_review_at: daysAgo(3), difficulty_factor: 2.6 },
        { id: 'weak', title: 'Recursion', subjectId: 's1', next_review_at: daysAgo(1), difficulty_factor: 1.3 }
      ],
      [],
      { now }
    )
    assert.deepEqual(queue.map((t) => t.id), ['weak', 'easy'])
  })

  test('interleaves subjects instead of blocking them together', () => {
    const queue = orderReviewQueue(
      [
        { id: 'a1', subjectId: 's1', next_review_at: daysAgo(10), difficulty_factor: 1.3 },
        { id: 'a2', subjectId: 's1', next_review_at: daysAgo(9), difficulty_factor: 1.4 },
        { id: 'b1', subjectId: 's2', next_review_at: daysAgo(8), difficulty_factor: 1.5 }
      ],
      [],
      { now }
    )
    assert.deepEqual(queue.map((t) => t.subjectId), ['s1', 's2', 's1'])
  })

  test('does not mutate the input and keeps every item exactly once', () => {
    const input = [
      { id: 'a', subjectId: 's1', next_review_at: daysAgo(1) },
      { id: 'b', subjectId: 's1', next_review_at: daysAgo(2) }
    ]
    const snapshot = JSON.stringify(input)
    const queue = orderReviewQueue(input, [], { now })
    assert.equal(JSON.stringify(input), snapshot)
    assert.deepEqual(queue.map((t) => t.id).sort(), ['a', 'b'])
  })
})
