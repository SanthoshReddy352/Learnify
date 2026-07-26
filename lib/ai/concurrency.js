// Bounded-concurrency mapping for independent AI calls.
//
// Kept dependency-free and alias-free so it is directly unit-testable.

/**
 * `Promise.all`-style map over `items`, but with at most `limit` tasks running
 * at once, and results returned IN INPUT ORDER regardless of completion order.
 *
 * Order matters more than it looks: the callers here assemble lesson sections
 * and re-insert repaired diagrams, so a result landing at the wrong index would
 * silently scramble a lesson rather than fail loudly.
 *
 * The bound exists because the alternative — firing every call at once — trips
 * provider rate limits, and a 429 partway through costs more wall-clock time
 * than the concurrency saved.
 *
 * Rejections propagate like `Promise.all`: the first failure wins, and no new
 * tasks are started after it.
 */
export async function mapWithConcurrency(items, limit, fn) {
  const list = Array.from(items || [])
  const results = new Array(list.length)
  const max = Math.max(1, Math.min(Number(limit) || 1, list.length))

  let cursor = 0
  let failed = false

  const worker = async () => {
    while (!failed) {
      const index = cursor
      cursor += 1
      if (index >= list.length) return
      try {
        results[index] = await fn(list[index], index)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }

  await Promise.all(Array.from({ length: max }, worker))
  return results
}

/**
 * Process `items` in fixed waves of `waveSize`, running each wave in parallel
 * and the waves themselves in order. Results come back in INPUT order.
 *
 * WHY THIS EXISTS ALONGSIDE mapWithConcurrency: a worker pool hands the next
 * item to whichever worker frees up first, so which task gets index N depends
 * on completion timing. That is fine in a plain async function and WRONG inside
 * an Inngest step function, which re-executes the whole body on every
 * invocation and matches work to previously-completed results BY STEP ID. Under
 * a pool those ids shift between replays and previously-finished sections get
 * re-run — paying for the same model call twice, or worse, assembling a lesson
 * out of order.
 *
 * Waves are replay-stable: item i is always in wave floor(i / waveSize) and
 * always gets the same id. The cost is a little idle time at each wave boundary,
 * which is a fair trade for correctness under replay.
 *
 * `onWaveStart` runs before each wave — used to report progress.
 */
export async function mapInWaves(items, waveSize, { runItem, onWaveStart } = {}) {
  const list = Array.from(items || [])
  const size = Math.max(1, Number(waveSize) || 1)
  const results = []

  for (let start = 0; start < list.length; start += size) {
    const wave = list.slice(start, start + size)

    if (onWaveStart) {
      // eslint-disable-next-line no-await-in-loop -- waves are sequential by design
      await onWaveStart({ start, end: start + wave.length, total: list.length })
    }

    // eslint-disable-next-line no-await-in-loop -- waves are sequential by design
    const waveResults = await Promise.all(
      wave.map((item, offset) => runItem(item, start + offset))
    )

    // Promise.all preserves input order, so pushing whole waves keeps the
    // overall result aligned with the input regardless of completion order.
    results.push(...waveResults)
  }

  return results
}
