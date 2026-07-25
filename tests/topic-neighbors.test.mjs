import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildNeighborContext } from '../lib/topics/neighbors.js'

describe('buildNeighborContext', () => {
  test('returns empty string when the topic has no neighbours', () => {
    assert.equal(buildNeighborContext(), '')
    assert.equal(buildNeighborContext({ prerequisites: [], followups: [] }), '')
  })

  test('prerequisites are framed as already-known, do-not-re-teach', () => {
    const ctx = buildNeighborContext({
      prerequisites: [{ title: 'Variables', description: 'Named storage for values.' }],
      followups: []
    })
    assert.match(ctx, /ALREADY TAUGHT/)
    assert.match(ctx, /"Variables": Named storage for values\./)
    assert.match(ctx, /Do NOT re-explain/)
    assert.doesNotMatch(ctx, /TAUGHT LATER/)
  })

  test('followups are framed as do-not-pre-teach and omit descriptions', () => {
    const ctx = buildNeighborContext({
      prerequisites: [],
      followups: [{ title: 'Recursion' }]
    })
    assert.match(ctx, /TAUGHT LATER/)
    assert.match(ctx, /"Recursion"/)
    assert.match(ctx, /Do NOT pre-teach/)
    assert.doesNotMatch(ctx, /ALREADY TAUGHT/)
  })

  test('prerequisite without a description still renders its title', () => {
    const ctx = buildNeighborContext({
      prerequisites: [{ title: 'Set Theory', description: '' }],
      followups: []
    })
    assert.match(ctx, /- "Set Theory"$/m)
  })

  test('includes both sections when the topic sits mid-graph', () => {
    const ctx = buildNeighborContext({
      prerequisites: [{ title: 'A', description: 'first' }],
      followups: [{ title: 'C' }]
    })
    assert.match(ctx, /ALREADY TAUGHT/)
    assert.match(ctx, /TAUGHT LATER/)
  })
})
