import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { mapWithConcurrency, mapInWaves } from '../lib/ai/concurrency.js'

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('mapWithConcurrency', () => {
  // The property everything downstream depends on: lesson sections and repaired
  // diagrams are re-assembled by index, so out-of-order results would scramble
  // a lesson silently instead of failing.
  test('returns results in input order despite out-of-order completion', async () => {
    const out = await mapWithConcurrency([30, 5, 20, 1], 4, async (ms, i) => {
      await tick(ms)
      return i
    })
    assert.deepEqual(out, [0, 1, 2, 3])
  })

  test('never exceeds the concurrency limit', async () => {
    let running = 0
    let peak = 0

    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      running += 1
      peak = Math.max(peak, running)
      await tick(5)
      running -= 1
    })

    assert.ok(peak <= 3, `peak concurrency was ${peak}`)
  })

  test('actually runs in parallel', async () => {
    const started = Date.now()
    await mapWithConcurrency([1, 2, 3, 4], 4, () => tick(40))
    // Serial would be ~160ms; parallel should be well under that.
    assert.ok(Date.now() - started < 130, 'tasks overlapped')
  })

  test('propagates the first rejection', async () => {
    await assert.rejects(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      }),
      /boom/
    )
  })

  test('stops starting new work after a failure', async () => {
    let started = 0
    await assert.rejects(
      mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 2, async (i) => {
        started += 1
        await tick(2)
        if (i === 0) throw new Error('fail fast')
      })
    )
    assert.ok(started < 20, `started ${started} of 20`)
  })

  test('handles an empty list', async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), [])
  })

  test('treats a limit above the list length as fully parallel', async () => {
    const out = await mapWithConcurrency([1, 2], 99, async (n) => n * 2)
    assert.deepEqual(out, [2, 4])
  })
})

describe('mapInWaves', () => {
  test('returns results in input order', async () => {
    const out = await mapInWaves([30, 5, 20, 1, 9], 3, {
      runItem: async (ms, i) => { await tick(ms); return i }
    })
    assert.deepEqual(out, [0, 1, 2, 3, 4])
  })

  test('runs a wave in parallel but waves in sequence', async () => {
    const events = []
    await mapInWaves([1, 2, 3, 4, 5], 3, {
      runItem: async (n) => {
        events.push(`start-${n}`)
        await tick(20)
        events.push(`end-${n}`)
      }
    })

    // First wave overlaps: all three start before any ends.
    assert.deepEqual(events.slice(0, 3), ['start-1', 'start-2', 'start-3'])
    // Second wave does not begin until the first has fully drained.
    const firstWaveEnd = events.indexOf('start-4')
    assert.ok(
      events.slice(0, firstWaveEnd).filter((e) => e.startsWith('end-')).length === 3,
      'wave 1 fully finished before wave 2 started'
    )
  })

  test('never exceeds the wave size concurrently', async () => {
    let running = 0
    let peak = 0
    await mapInWaves(Array.from({ length: 11 }, (_, i) => i), 3, {
      runItem: async () => {
        running += 1
        peak = Math.max(peak, running)
        await tick(5)
        running -= 1
      }
    })
    assert.ok(peak <= 3, `peak concurrency was ${peak}`)
  })

  test('reports wave boundaries for progress', async () => {
    const waves = []
    await mapInWaves([1, 2, 3, 4, 5], 2, {
      onWaveStart: async (info) => { waves.push(info) },
      runItem: async () => 'x'
    })
    assert.deepEqual(waves, [
      { start: 0, end: 2, total: 5 },
      { start: 2, end: 4, total: 5 },
      { start: 4, end: 5, total: 5 }
    ])
  })

  // THE property this whole shape exists for. Inngest re-executes the function
  // body on every invocation and matches work to already-completed results by
  // step id, so ids must be identical on every replay no matter what order
  // things finished in. A worker pool cannot promise that; fixed waves can.
  test('assigns identical step ids across replays with different timings', async () => {
    const idsForRun = async (delays) => {
      const ids = []
      await mapInWaves(delays, 3, {
        onWaveStart: async ({ start }) => { ids.push(`progress-wave-${start}`) },
        runItem: async (ms, index) => {
          await tick(ms)
          ids.push(`write-section-${index}`)
          return index
        }
      })
      return ids
    }

    // Same input, wildly different completion orders within each wave.
    const runA = await idsForRun([1, 30, 5, 2, 40, 3, 1])
    const runB = await idsForRun([40, 1, 30, 3, 1, 20, 2])

    const sortKey = (list) => [...list].sort()
    assert.deepEqual(sortKey(runA), sortKey(runB), 'the same set of step ids every time')
    assert.equal(new Set(runA).size, runA.length, 'no duplicate step ids')
    // And every section index is covered exactly once.
    for (let i = 0; i < 7; i += 1) {
      assert.ok(runA.includes(`write-section-${i}`), `section ${i} has a step`)
    }
  })

  test('a memoized replay reuses results instead of re-running the work', async () => {
    // Mimics Inngest: completed step ids short-circuit on the next invocation.
    const memo = new Map()
    let executions = 0

    const run = () => mapInWaves([1, 2, 3, 4, 5], 2, {
      runItem: async (n, index) => {
        const id = `write-section-${index}`
        if (memo.has(id)) return memo.get(id)
        executions += 1
        const value = n * 10
        memo.set(id, value)
        return value
      }
    })

    const first = await run()
    const replay = await run()

    assert.deepEqual(first, [10, 20, 30, 40, 50])
    assert.deepEqual(replay, first, 'replay produces the identical lesson')
    assert.equal(executions, 5, 'the replay re-ran nothing')
  })

  test('propagates a failure so the function can retry from the last good step', async () => {
    await assert.rejects(
      mapInWaves([1, 2, 3], 2, {
        runItem: async (n) => { if (n === 2) throw new Error('provider 429'); return n }
      }),
      /provider 429/
    )
  })

  test('handles an empty list and a wave larger than the input', async () => {
    assert.deepEqual(await mapInWaves([], 3, { runItem: async () => 1 }), [])
    assert.deepEqual(await mapInWaves([1, 2], 99, { runItem: async (n) => n }), [1, 2])
  })
})
