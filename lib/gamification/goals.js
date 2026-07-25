// Weekly goals, streaks and progress visibility (Plan P11.2).
//
// Companion to xp.js: where that derives level and badges, this derives the
// short-horizon signals — "am I on track this week?", "how many days in a row
// have I shown up?", "which subject is nearly done?". Same two rules apply:
// everything is DERIVED from study_logs and topic status (no counter to cheat,
// no table, no migration beyond the goal target itself), and the framing is
// personal progress, never comparison with other learners.
//
// Alias-free and pure so `node --test` can load it directly. All day bucketing
// goes through the learner's own timezone (lib/time/zone.js) — a streak that
// resets at 5:30am local because a UTC server rolled over reads as unfair.

import { zonedDayKey, shiftDayKey, weekStartKey, dayOfWeekForKey } from '../time/zone.js'

export const DEFAULT_WEEKLY_GOAL = 15

// A goal that is missed every week stops being a goal. These bounds keep the
// suggestion honest when we propose one from observed history.
const MIN_SUGGESTED_GOAL = 3
const MAX_SUGGESTED_GOAL = 60

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Local day keys on which the learner logged anything at all. */
export function activityDayKeys(logs = [], timeZone = 'UTC') {
  const keys = new Set()
  for (const log of logs) {
    if (!log?.created_at) continue
    const at = new Date(log.created_at)
    if (Number.isNaN(at.getTime())) continue
    keys.add(zonedDayKey(at, timeZone))
  }
  return keys
}

/**
 * Consecutive local days with activity, counting back from today — or from
 * yesterday if nothing is logged yet today, so the streak is not reported as
 * broken during the day before the learner has had a chance to study.
 */
export function streakInZone(logs = [], { now = new Date(), timeZone = 'UTC' } = {}) {
  const days = activityDayKeys(logs, timeZone)
  let cursor = zonedDayKey(now, timeZone)
  if (!days.has(cursor)) cursor = shiftDayKey(cursor, -1)

  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor = shiftDayKey(cursor, -1)
  }
  return streak
}

/**
 * Progress against the weekly review goal, over a Monday-to-Sunday local week.
 *
 * `pace` is what makes this useful rather than decorative: it compares reviews
 * done against reviews that *should* be done by this point in the week, so a
 * learner on day 2 with 4/15 is told they are ahead, not that they are 27% done.
 */
export function deriveWeeklyGoal({
  logs = [],
  goal = DEFAULT_WEEKLY_GOAL,
  now = new Date(),
  timeZone = 'UTC'
} = {}) {
  const target = Number.isFinite(Number(goal)) && Number(goal) > 0
    ? Math.round(Number(goal))
    : DEFAULT_WEEKLY_GOAL
  const todayKey = zonedDayKey(now, timeZone)
  const startKey = weekStartKey(todayKey)
  // Monday = day 1 … Sunday = day 7.
  const dayOfWeek = ((dayOfWeekForKey(todayKey) + 6) % 7) + 1

  let done = 0
  for (const log of logs) {
    if (log?.session_type !== 'review') continue
    if (!log?.created_at) continue
    const at = new Date(log.created_at)
    if (Number.isNaN(at.getTime())) continue
    if (zonedDayKey(at, timeZone) >= startKey) done += 1
  }

  const expectedByNow = (target * dayOfWeek) / 7
  return {
    goal: target,
    done,
    remaining: Math.max(0, target - done),
    met: done >= target,
    progress: target > 0 ? Math.min(1, done / target) : 0,
    weekStart: startKey,
    dayOfWeek,
    daysLeft: 7 - dayOfWeek,
    // 'ahead' | 'on_track' | 'behind' — a 1-review tolerance band keeps the
    // label from flipping on a single review.
    pace: done >= expectedByNow + 1 ? 'ahead' : done >= expectedByNow - 1 ? 'on_track' : 'behind'
  }
}

/**
 * A goal target proposed from what the learner actually did over recent weeks,
 * so a first-time goal is achievable instead of aspirational. Rounded up a
 * little (a goal should stretch), then clamped.
 */
export function suggestWeeklyGoal({ logs = [], now = new Date(), timeZone = 'UTC', weeks = 4 } = {}) {
  const todayKey = zonedDayKey(now, timeZone)
  const since = shiftDayKey(weekStartKey(todayKey), -7 * Math.max(1, weeks))

  let reviews = 0
  for (const log of logs) {
    if (log?.session_type !== 'review' || !log?.created_at) continue
    const at = new Date(log.created_at)
    if (Number.isNaN(at.getTime())) continue
    if (zonedDayKey(at, timeZone) >= since) reviews += 1
  }

  const perWeek = reviews / Math.max(1, weeks)
  const suggested = Math.ceil(perWeek * 1.1)
  return Math.min(MAX_SUGGESTED_GOAL, Math.max(MIN_SUGGESTED_GOAL, suggested || MIN_SUGGESTED_GOAL))
}

/**
 * Last `days` local days as a compact calendar strip, oldest first — the
 * "small wins" view. Counts are per day so a heavy day can read differently
 * from a token one.
 */
export function deriveActivityCalendar({ logs = [], now = new Date(), timeZone = 'UTC', days = 14 } = {}) {
  const counts = new Map()
  for (const log of logs) {
    if (!log?.created_at) continue
    const at = new Date(log.created_at)
    if (Number.isNaN(at.getTime())) continue
    const key = zonedDayKey(at, timeZone)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const todayKey = zonedDayKey(now, timeZone)
  const span = Math.max(1, days)
  const strip = []
  for (let i = span - 1; i >= 0; i -= 1) {
    const key = shiftDayKey(todayKey, -i)
    const count = counts.get(key) || 0
    strip.push({
      dateKey: key,
      label: DAY_LABELS[dayOfWeekForKey(key)],
      count,
      active: count > 0,
      isToday: key === todayKey
    })
  }
  return strip
}

/**
 * Subject-completion overview from the stats the dashboard already loads.
 *
 * `nextUp` surfaces the subjects closest to done rather than the ones with the
 * most work left: finishing something is the win worth pointing at, and it is
 * also the cheapest one available.
 */
export function deriveSubjectCompletion(subjectStats = []) {
  const subjects = subjectStats
    .filter((s) => s && Number(s.totalTopics) > 0)
    .map((s) => ({
      id: s.id,
      title: s.title,
      progress: Number(s.progress) || 0,
      totalTopics: Number(s.totalTopics) || 0,
      masteredTopics: Number(s.masteredTopics) || 0,
      remaining: Math.max(0, (Number(s.totalTopics) || 0) - (Number(s.masteredTopics) || 0))
    }))

  const completed = subjects.filter((s) => s.remaining === 0)
  const started = subjects.filter((s) => s.remaining > 0 && s.masteredTopics > 0)
  const notStarted = subjects.filter((s) => s.masteredTopics === 0)

  const nextUp = [...started]
    .sort((a, b) => a.remaining - b.remaining || b.progress - a.progress)
    .slice(0, 3)

  return {
    totalSubjects: subjects.length,
    completedCount: completed.length,
    inProgressCount: started.length,
    notStartedCount: notStarted.length,
    nextUp
  }
}
