/**
 * Pure unlock-engine logic for the knowledge-graph DAG.
 *
 * Semantics (must stay in sync with how the app treats statuses):
 * - 'mastered' and 'reviewing' topics are never touched (work already done).
 * - A prerequisite is satisfied when its status is 'mastered' or 'reviewing'.
 * - Topics with all prerequisites satisfied (or none): 'locked' -> 'available'.
 *   Topics already 'available'/'learning' stay as they are.
 * - Topics with unmet prerequisites: anything not 'locked' -> 'locked'.
 *
 * Pure function: no I/O, fully unit-tested in tests/unlock-engine.test.mjs.
 * The computed updates are applied in one round trip via the
 * apply_topic_status_updates RPC (see migrations/shared_views_privacy_and_bulk_rpc.sql).
 */

export type TopicStatus = 'locked' | 'available' | 'learning' | 'reviewing' | 'mastered'

export interface UnlockTopic {
  id: string
  status: TopicStatus | string
}

export interface UnlockDependency {
  topic_id: string
  depends_on_topic_id: string
}

export interface UnlockUpdate {
  id: string
  status: 'available' | 'locked'
}

const SATISFYING_STATUSES = new Set(['mastered', 'reviewing'])
const PROTECTED_STATUSES = new Set(['mastered', 'reviewing'])

/** Returns the minimal set of status changes to bring the DAG into a consistent state. */
export function computeUnlockUpdates(
  topics: UnlockTopic[],
  dependencies: UnlockDependency[]
): UnlockUpdate[] {
  const statusById = new Map<string, string>()
  const prereqsById = new Map<string, string[]>()

  for (const topic of topics) {
    statusById.set(topic.id, topic.status)
    prereqsById.set(topic.id, [])
  }

  for (const dep of dependencies) {
    const list = prereqsById.get(dep.topic_id)
    if (list) {
      list.push(dep.depends_on_topic_id)
    }
  }

  const updates: UnlockUpdate[] = []

  for (const topic of topics) {
    if (PROTECTED_STATUSES.has(topic.status)) {
      continue
    }

    const prereqIds = prereqsById.get(topic.id) || []
    const allMet = prereqIds.every((id) => SATISFYING_STATUSES.has(statusById.get(id) ?? ''))

    if (allMet) {
      if (topic.status === 'locked') {
        updates.push({ id: topic.id, status: 'available' })
      }
    } else if (topic.status !== 'locked') {
      updates.push({ id: topic.id, status: 'locked' })
    }
  }

  return updates
}
