import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTopicDigest,
  buildDiagnosticPrompt,
  gradeDiagnostic,
  suggestSkippableTopics
} from '../lib/ai/pipelines/diagnostic-prompt.js'
import { diagnosticSchema, diagnosticResultSchema } from '../lib/validation/schemas.js'

describe('buildTopicDigest', () => {
  test('prefers the concept-ledger summary over the raw description', () => {
    const digest = buildTopicDigest([
      { title: 'Recursion', description: 'raw desc', concept_ledger: { summary: 'LEDGER SUMMARY' } },
      { title: 'Loops', description: 'raw desc' },
      { title: 'Arrays' }
    ])
    assert.match(digest, /- Recursion: LEDGER SUMMARY/)
    assert.match(digest, /- Loops: raw desc/)
    assert.match(digest, /- Arrays$/m)
  })

  test('is empty for a subject with no topics', () => {
    assert.equal(buildTopicDigest([]), '')
  })
})

describe('buildDiagnosticPrompt', () => {
  test('asks for concept-tagged items and states the count', () => {
    const p = buildDiagnosticPrompt({ subjectTitle: 'Algorithms', questionCount: 6 })
    assert.match(p, /"Algorithms"/)
    assert.match(p, /exactly 6 multiple-choice questions/)
    assert.match(p, /concept:/)
    assert.match(p, /correct_index/)
  })

  test('frames it as placement, not an exam, and guards against guess-inflation', () => {
    const p = buildDiagnosticPrompt({ subjectTitle: 'S' })
    assert.match(p, /not an exam and carries no grade/)
    assert.match(p, /plausible misconceptions/)
    assert.match(p, /Spread the questions ACROSS the listed topics/)
  })

  test('includes the topic digest and syllabus when given', () => {
    const p = buildDiagnosticPrompt({ subjectTitle: 'S', topicDigest: '- A: x', subjectSyllabus: 'SYL-SENTINEL' })
    assert.match(p, /TOPICS IN THIS SUBJECT/)
    assert.match(p, /SYL-SENTINEL/)
  })
})

describe('gradeDiagnostic', () => {
  const questions = [
    { question: 'q1', options: ['a', 'b'], correct_index: 0, concept: 'Recursion', topic_title: 'Recursion' },
    { question: 'q2', options: ['a', 'b'], correct_index: 1, concept: 'Base case', topic_title: 'Recursion' },
    { question: 'q3', options: ['a', 'b'], correct_index: 0, concept: 'Loops', topic_title: 'Loops' }
  ]

  test('scores answered questions and tags each outcome to its concept', () => {
    const r = gradeDiagnostic(questions, [0, 0, 0])
    assert.equal(r.answeredCount, 3)
    assert.equal(r.correctCount, 2)
    assert.equal(r.score, 67)
    assert.deepEqual(r.graded, [
      { concept: 'Recursion', topicTitle: 'Recursion', correct: true },
      { concept: 'Base case', topicTitle: 'Recursion', correct: false },
      { concept: 'Loops', topicTitle: 'Loops', correct: true }
    ])
  })

  test('skipped questions are neither credited nor penalized', () => {
    const r = gradeDiagnostic(questions, [0, null, undefined])
    assert.equal(r.answeredCount, 1)
    assert.equal(r.correctCount, 1)
    assert.equal(r.score, 100)
    assert.equal(r.graded.length, 1)
  })

  test('answering nothing scores zero instead of dividing by zero', () => {
    const r = gradeDiagnostic(questions, [])
    assert.equal(r.score, 0)
    assert.equal(r.graded.length, 0)
  })
})

describe('suggestSkippableTopics', () => {
  test('only suggests topics answered fully correctly', () => {
    const suggestions = suggestSkippableTopics([
      { concept: 'a', topicTitle: 'Recursion', correct: true },
      { concept: 'b', topicTitle: 'Recursion', correct: true },
      { concept: 'c', topicTitle: 'Loops', correct: true },
      { concept: 'd', topicTitle: 'Loops', correct: false }
    ])
    assert.deepEqual(suggestions, [{ topicTitle: 'Recursion', correct: 2, total: 2 }])
  })

  test('ignores answers with no topic attribution', () => {
    assert.deepEqual(suggestSkippableTopics([{ concept: 'a', topicTitle: '', correct: true }]), [])
  })
})

describe('diagnostic schemas', () => {
  test('accepts a well-formed generated question set', () => {
    const parsed = diagnosticSchema.safeParse({
      questions: [{ question: 'q', options: ['a', 'b', 'c'], correct_index: 1, concept: 'Recursion' }]
    })
    assert.ok(parsed.success)
    assert.equal(parsed.data.questions[0].topic_title, '')
  })

  test('rejects a question with one option or a negative answer index', () => {
    assert.ok(!diagnosticSchema.safeParse({
      questions: [{ question: 'q', options: ['a'], correct_index: 0, concept: 'c' }]
    }).success)
    assert.ok(!diagnosticSchema.safeParse({
      questions: [{ question: 'q', options: ['a', 'b'], correct_index: -1, concept: 'c' }]
    }).success)
  })

  test('result payload requires a uuid subject and at least one tagged answer', () => {
    assert.ok(diagnosticResultSchema.safeParse({
      subjectId: '00000000-0000-4000-8000-000000000000',
      answers: [{ concept: 'Recursion', correct: true }]
    }).success)
    assert.ok(!diagnosticResultSchema.safeParse({ subjectId: 'nope', answers: [] }).success)
  })
})
