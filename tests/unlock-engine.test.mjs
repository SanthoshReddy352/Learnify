import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeUnlockUpdates } from '../lib/unlock-engine.ts'

const topic = (id, status) => ({ id, status })
const dep = (topicId, dependsOn) => ({ topic_id: topicId, depends_on_topic_id: dependsOn })

describe('computeUnlockUpdates', () => {
  test('empty graph produces no updates', () => {
    assert.deepEqual(computeUnlockUpdates([], []), [])
  })

  test('locked topic with no prerequisites becomes available', () => {
    const updates = computeUnlockUpdates([topic('a', 'locked')], [])
    assert.deepEqual(updates, [{ id: 'a', status: 'available' }])
  })

  test('locked topic unlocks when all prerequisites are mastered or reviewing', () => {
    const topics = [topic('a', 'mastered'), topic('b', 'reviewing'), topic('c', 'locked')]
    const deps = [dep('c', 'a'), dep('c', 'b')]
    assert.deepEqual(computeUnlockUpdates(topics, deps), [{ id: 'c', status: 'available' }])
  })

  test('locked topic stays locked while any prerequisite is unmet', () => {
    const topics = [topic('a', 'mastered'), topic('b', 'learning'), topic('c', 'locked')]
    const deps = [dep('c', 'a'), dep('c', 'b')]
    assert.deepEqual(computeUnlockUpdates(topics, deps), [])
  })

  test('available topic is re-locked when its prerequisite is no longer satisfied', () => {
    const topics = [topic('a', 'available'), topic('b', 'available')]
    const deps = [dep('b', 'a')]
    assert.deepEqual(computeUnlockUpdates(topics, deps), [{ id: 'b', status: 'locked' }])
  })

  test('learning topic is re-locked when prerequisites are unmet', () => {
    const topics = [topic('a', 'locked'), topic('b', 'learning')]
    const deps = [dep('b', 'a')]
    const updates = computeUnlockUpdates(topics, deps)
    assert.deepEqual(updates, [
      { id: 'a', status: 'available' },
      { id: 'b', status: 'locked' },
    ])
  })

  test('mastered and reviewing topics are never touched', () => {
    const topics = [topic('a', 'locked'), topic('b', 'mastered'), topic('c', 'reviewing')]
    const deps = [dep('b', 'a'), dep('c', 'a')]
    // b and c depend on a locked prerequisite but keep their earned status
    assert.deepEqual(computeUnlockUpdates(topics, deps), [{ id: 'a', status: 'available' }])
  })

  test('already-correct statuses produce no redundant updates', () => {
    const topics = [topic('a', 'available'), topic('b', 'locked'), topic('c', 'mastered')]
    const deps = [dep('b', 'a')] // a not satisfied -> b correctly locked
    assert.deepEqual(computeUnlockUpdates(topics, deps), [])
  })

  test('dependencies pointing at unknown topics are ignored', () => {
    const topics = [topic('a', 'locked')]
    const deps = [dep('ghost', 'a'), dep('a', 'ghost')]
    // a's prereq 'ghost' has unknown status -> unmet -> a stays locked
    assert.deepEqual(computeUnlockUpdates(topics, deps), [])
  })

  test('chain unlocks one level at a time', () => {
    // a mastered -> b locked (unlockable), c depends on b (still locked)
    const topics = [topic('a', 'mastered'), topic('b', 'locked'), topic('c', 'locked')]
    const deps = [dep('b', 'a'), dep('c', 'b')]
    assert.deepEqual(computeUnlockUpdates(topics, deps), [{ id: 'b', status: 'available' }])
  })
})
