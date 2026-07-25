import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildTutorSystemPrompt, SOCRATIC_INSTRUCTIONS } from '../lib/ai/pipelines/doubt-chat-prompt.js'

const base = {
  subjectTitle: 'Algorithms',
  topicTitle: 'Recursion',
  topicDescription: 'Functions that call themselves',
  topicContent: 'LESSON-BODY-SENTINEL'
}

describe('buildTutorSystemPrompt', () => {
  test('keeps the original tutor framing, scope guard and content context', () => {
    const p = buildTutorSystemPrompt(base)
    assert.match(p, /expert AI Tutor specialized in "Algorithms"/)
    assert.match(p, /Topic: Recursion/)
    assert.match(p, /politely refuse and ask to stay on topic/)
    assert.match(p, /LESSON-BODY-SENTINEL/)
  })

  test('truncates a very long lesson body instead of sending all of it', () => {
    const p = buildTutorSystemPrompt({ ...base, topicContent: 'x'.repeat(20000) })
    assert.ok(p.length < 20000)
  })

  test('falls back to a placeholder when the topic has no content yet', () => {
    const p = buildTutorSystemPrompt({ ...base, topicContent: '' })
    assert.match(p, /No specific content generated yet/)
  })

  test('is Socratic by default and can be turned off', () => {
    assert.match(buildTutorSystemPrompt(base), /ASK BEFORE YOU TELL/)
    assert.doesNotMatch(buildTutorSystemPrompt({ ...base, socratic: false }), /ASK BEFORE YOU TELL/)
  })

  test('the Socratic stance is bounded — it can never stonewall the student', () => {
    // The failure mode of "ask before you tell" is a tutor that refuses to
    // answer; these are the escape hatches that prevent it.
    assert.match(SOCRATIC_INSTRUCTIONS, /ANSWER DIRECTLY/)
    assert.match(SOCRATIC_INSTRUCTIONS, /ONE question at a time/)
    assert.match(SOCRATIC_INSTRUCTIONS, /asked about this same point more than once/)
    assert.match(SOCRATIC_INSTRUCTIONS, /Never leave a wrong answer standing/)
    assert.match(SOCRATIC_INSTRUCTIONS, /never withhold an answer/)
  })

  test('carries learner memory and the proactive nudge when present', () => {
    const p = buildTutorSystemPrompt({
      ...base,
      learnerContext: 'MEMORY-SENTINEL',
      proactiveNudge: 'NUDGE-SENTINEL'
    })
    assert.match(p, /MEMORY-SENTINEL/)
    assert.match(p, /NUDGE-SENTINEL/)
  })

  test('omits memory sections entirely for a learner with no history', () => {
    const p = buildTutorSystemPrompt(base)
    assert.doesNotMatch(p, /LEARNER MEMORY/)
    assert.doesNotMatch(p, /PROACTIVE HELP/)
  })
})
