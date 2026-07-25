import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildProjectPrompt } from '../lib/ai/pipelines/project-prompt.js'
import { buildArtifactPrompt } from '../lib/ai/pipelines/artifact-prompt.js'
import { projectTrackSchema, interactiveArtifactSchema } from '../lib/validation/schemas.js'

describe('buildProjectPrompt', () => {
  test('asks for milestones + checkpoints scoped to difficulty', () => {
    const p = buildProjectPrompt({ subjectTitle: 'Web Dev', difficulty: 2 })
    assert.match(p, /"Web Dev"/)
    assert.match(p, /milestones/)
    assert.match(p, /checkpoints/)
    assert.match(p, /difficulty 2\/5/)
  })

  test('includes subject context when provided', () => {
    const p = buildProjectPrompt({ subjectTitle: 'X', subjectDescription: 'ctx-sentinel' })
    assert.match(p, /ctx-sentinel/)
  })
})

describe('buildArtifactPrompt', () => {
  test('demands a self-contained, network-free, interactive widget', () => {
    const p = buildArtifactPrompt({ topicTitle: 'Sorting' })
    assert.match(p, /"Sorting"/)
    assert.match(p, /self-contained/i)
    assert.match(p, /no fetch|no network|NO external resources/i)
    assert.match(p, /INTERACTIVE/)
  })
})

describe('P7 schemas', () => {
  test('projectTrackSchema accepts a valid track and defaults checkpoints', () => {
    const parsed = projectTrackSchema.parse({
      title: 'Build a To-Do App',
      summary: 'Practice CRUD.',
      milestones: [{ title: 'Setup', description: 'init project' }]
    })
    assert.deepEqual(parsed.milestones[0].checkpoints, [])
  })

  test('projectTrackSchema rejects an empty milestone list', () => {
    assert.equal(projectTrackSchema.safeParse({ title: 't', summary: 's', milestones: [] }).success, false)
  })

  test('interactiveArtifactSchema requires html', () => {
    assert.equal(interactiveArtifactSchema.safeParse({ title: 't', description: 'd' }).success, false)
    assert.equal(
      interactiveArtifactSchema.safeParse({ title: 't', description: 'd', html: '<html></html>' }).success,
      true
    )
  })
})
