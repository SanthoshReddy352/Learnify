// Timezone-aware calendar helpers, shared by reminder scheduling (P11.1) and
// weekly goals / streaks (P11.2).
//
// Both features need to answer "what day and hour is it *where the learner
// is*?" — the reminder sender runs in UTC on a server, and a streak that breaks
// at 5:30am local because the server rolled over at midnight UTC is a bug the
// learner experiences as unfairness. Pure, no dependencies: `Intl` does the
// zone work, and all day arithmetic is done on the local calendar date so DST
// transitions cannot skip or repeat a day.

/** The hour (0-23) and calendar date at `date`, as seen in `timeZone`. */
export function zonedParts(date = new Date(), timeZone = 'UTC') {
  const read = (zone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date)
    const get = (type) => parts.find((p) => p.type === type)?.value
    return {
      hour: Number(get('hour')),
      dateKey: `${get('year')}-${get('month')}-${get('day')}`,
      timeZone: zone
    }
  }

  // An unknown or malformed IANA zone falls back to UTC rather than throwing:
  // one bad timezone string should cost that learner accuracy, not break the
  // run for everyone else.
  try {
    return read(timeZone)
  } catch {
    return read('UTC')
  }
}

/** Just the `YYYY-MM-DD` local date. */
export function zonedDayKey(date = new Date(), timeZone = 'UTC') {
  return zonedParts(date, timeZone).dateKey
}

const pad = (n) => String(n).padStart(2, '0')

function keyToUtcMs(dayKey) {
  const [y, m, d] = String(dayKey).slice(0, 10).split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}

function utcMsToKey(ms) {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/**
 * Move a `YYYY-MM-DD` key by whole days. Arithmetic happens on the calendar
 * date (as a UTC midnight), not on a wall-clock instant, so a day never gets
 * skipped or doubled across a DST boundary.
 */
export function shiftDayKey(dayKey, deltaDays) {
  return utcMsToKey(keyToUtcMs(dayKey) + deltaDays * 86400000)
}

/** Day of week for a key: 0 = Sunday … 6 = Saturday. */
export function dayOfWeekForKey(dayKey) {
  return new Date(keyToUtcMs(dayKey)).getUTCDay()
}

/** The Monday of the week containing `dayKey`. */
export function weekStartKey(dayKey) {
  const back = (dayOfWeekForKey(dayKey) + 6) % 7
  return shiftDayKey(dayKey, -back)
}
