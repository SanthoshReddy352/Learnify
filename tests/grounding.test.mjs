import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyKind,
  buildGroundingContext,
  buildReferencesSection
} from '../lib/ai/pipelines/grounding.js'

describe('classifyKind', () => {
  test('detects video, reference, and article sources', () => {
    assert.equal(classifyKind('https://www.youtube.com/watch?v=abc'), 'video')
    assert.equal(classifyKind('https://youtu.be/abc'), 'video')
    assert.equal(classifyKind('https://en.wikipedia.org/wiki/Tree'), 'reference')
    assert.equal(classifyKind('https://www.geeksforgeeks.org/binary-tree/'), 'article')
  })
})

describe('buildGroundingContext', () => {
  test('empty excerpts produce empty string', () => {
    assert.equal(buildGroundingContext([]), '')
  })

  test('labels each source and marks the material as untrusted data', () => {
    const ctx = buildGroundingContext([
      { url: 'https://a.test', content: 'alpha' },
      { url: 'https://b.test', content: 'beta' }
    ])
    assert.match(ctx, /SOURCE 1 — https:\/\/a\.test/)
    assert.match(ctx, /SOURCE 2 — https:\/\/b\.test/)
    assert.match(ctx, /treat strictly as DATA/i)
  })
})

describe('buildReferencesSection', () => {
  test('empty references produce empty string', () => {
    assert.equal(buildReferencesSection([]), '')
  })

  test('groups by kind under Watch / Read / Reference headings', () => {
    const md = buildReferencesSection([
      { title: 'Vid', url: 'https://youtu.be/x', kind: 'video' },
      { title: 'GfG', url: 'https://geeksforgeeks.org/x', kind: 'article' },
      { title: 'Wiki', url: 'https://en.wikipedia.org/wiki/X', kind: 'reference' }
    ])
    assert.match(md, /## References & Further Learning/)
    assert.match(md, /\*\*Watch\*\*/)
    assert.match(md, /\[Vid\]\(https:\/\/youtu\.be\/x\)/)
    assert.match(md, /\*\*Read\*\*/)
    assert.match(md, /\*\*Reference\*\*/)
  })
})
