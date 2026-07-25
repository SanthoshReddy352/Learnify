// Teacher-facing insight derivation (Plan P12).
//
// The owner's note on this phase was that the UI is the biggest flaw: the
// analytics page had every number but no answer. Everything here exists to turn
// rows into the three things a teacher acts on — **which concepts is the class
// failing**, **who needs a look this week**, and **is effort holding up** — in
// plain language, so the page can render conclusions instead of a data dump.
//
// Pure and alias-free (see lib/memory/concept-state.js) so `node --test` loads
// it directly. lib/classrooms/queries.js does the I/O and calls in here.

import { zonedDayKey, shiftDayKey, weekStartKey } from '../time/zone.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

// Cell states. The four `concern` steps are a SEQUENTIAL one-hue ramp (dataviz
// skill: heatmap → sequential), and the quantity encoded is deliberately
// **concern**, not mastery — on a mastery ramp the cells a teacher needs to spot
// would be the palest and would recede into the surface. `not-started` and
// `in-progress` are outside the ramp on purpose: a topic nobody has reached yet
// is normal pacing, and painting it as trouble would make the grid cry wolf.
export const CELL_STATES = {
  NOT_STARTED: 'not-started',
  IN_PROGRESS: 'in-progress',
  SOLID: 'solid',
  STEADY: 'steady',
  WATCH: 'watch',
  STRUGGLING: 'struggling'
}

// Ramp order, least → most concerning. The UI maps these to the validated ramp.
export const CONCERN_ORDER = [
  CELL_STATES.SOLID,
  CELL_STATES.STEADY,
  CELL_STATES.WATCH,
  CELL_STATES.STRUGGLING
]

export const CELL_LABELS = {
  [CELL_STATES.NOT_STARTED]: 'Not started',
  [CELL_STATES.IN_PROGRESS]: 'Learning, not reviewed yet',
  [CELL_STATES.SOLID]: 'Solid',
  [CELL_STATES.STEADY]: 'Steady',
  [CELL_STATES.WATCH]: 'Worth watching',
  [CELL_STATES.STRUGGLING]: 'Struggling'
}

const COMPLETED_STATUSES = new Set(['reviewing', 'mastered'])

/**
 * Classify one student's standing on one topic.
 *
 * Evidence order matters: review quality is the only real signal of retention,
 * so it decides the band whenever it exists. Status alone can say "reached" but
 * not "understood", which is why a mastered topic with no rated review lands on
 * STEADY rather than SOLID — we have not seen them recall it.
 */
export function classifyCell({ status = null, averageQuality = null, reviewCount = 0, overdue = false } = {}) {
  if (!status || status === 'locked') return CELL_STATES.NOT_STARTED
  if (status === 'available' && reviewCount === 0) return CELL_STATES.NOT_STARTED
  if (reviewCount === 0) {
    return COMPLETED_STATUSES.has(status) || status === 'learning'
      ? CELL_STATES.IN_PROGRESS
      : CELL_STATES.NOT_STARTED
  }

  if (averageQuality === null || averageQuality === undefined) {
    return CELL_STATES.IN_PROGRESS
  }

  // SM-2 quality is 0–5; 3 is the "recalled with difficulty" hinge.
  if (averageQuality < 2.5) return CELL_STATES.STRUGGLING
  if (averageQuality < 3.5) return CELL_STATES.WATCH
  // A strong rating that is nonetheless overdue is not yet a problem, but it is
  // the cell a teacher should look at before it becomes one.
  if (overdue) return CELL_STATES.WATCH
  if (averageQuality < 4.3) return CELL_STATES.STEADY
  return CELL_STATES.SOLID
}

/**
 * Concept keys a topic teaches, from the P6.5 concept ledger. Returns [] when
 * ledgers are absent (flag off / pre-P14), which is what makes the heatmap fall
 * back to topic rows instead of rendering empty.
 */
export function conceptsForTopic(topic) {
  const ledger = topic?.concept_ledger
  if (!ledger || typeof ledger !== 'object') return []
  const introduced = Array.isArray(ledger.concepts_introduced) ? ledger.concepts_introduced : []
  return introduced
    .map((entry) => (typeof entry === 'string' ? entry : entry?.concept || entry?.name))
    .map((label) => (typeof label === 'string' ? label.trim() : ''))
    .filter(Boolean)
}

// Same normalization as P8.1 so "Big-O Notation" and "big o notation" are one
// row, and so heatmap rows can later join to user_concept_state.
export function normalizeRowKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CONCERN_WEIGHT = {
  [CELL_STATES.STRUGGLING]: 1,
  [CELL_STATES.WATCH]: 0.6,
  [CELL_STATES.STEADY]: 0.2,
  [CELL_STATES.SOLID]: 0
}

/**
 * The class-wide grid: rows are concepts (when P6.5 ledgers exist) or topics,
 * columns are students, cells are the bands above.
 *
 * Rows are returned worst-first, because "which concepts is the whole class
 * failing?" is the question the grid exists to answer — a teacher should not have
 * to scan for the dark band.
 *
 * Cells with no evidence are excluded from a row's score rather than counted as
 * zero concern: eight students who have not reached a topic must not dilute the
 * two who are stuck on it.
 */
export function buildClassHeatmap({
  students = [],
  topics = [],
  progressRows = [],
  reviewLogs = [],
  now = new Date()
} = {}) {
  const studentList = students
    .map((s) => ({ studentUserId: s.studentUserId, name: s.name }))
    .filter((s) => s.studentUserId)

  // (student, topic) → evidence
  const progressByPair = new Map()
  for (const row of progressRows) {
    progressByPair.set(`${row.student_user_id}:${row.topic_id}`, row)
  }

  const qualityByPair = new Map()
  for (const log of reviewLogs) {
    if (log?.quality_rating === null || log?.quality_rating === undefined) continue
    const key = `${log.user_id}:${log.topic_id}`
    const bucket = qualityByPair.get(key) || { sum: 0, count: 0 }
    bucket.sum += log.quality_rating
    bucket.count += 1
    qualityByPair.set(key, bucket)
  }

  const cellFor = (studentUserId, topicId) => {
    const progress = progressByPair.get(`${studentUserId}:${topicId}`)
    const quality = qualityByPair.get(`${studentUserId}:${topicId}`)
    const averageQuality = quality ? quality.sum / quality.count : null
    return {
      state: classifyCell({
        status: progress?.status || null,
        averageQuality,
        reviewCount: quality?.count || 0,
        overdue: Boolean(progress?.next_review_at) && new Date(progress.next_review_at) <= now
      }),
      averageQuality: averageQuality === null ? null : Number(averageQuality.toFixed(1)),
      reviewCount: quality?.count || 0
    }
  }

  // Ledgers present on any topic → concept rows; otherwise topic rows. Reported
  // as `source` so the UI can say which it is showing rather than implying the
  // rows are concepts when they are topics.
  const conceptMap = new Map()
  for (const topic of topics) {
    for (const label of conceptsForTopic(topic)) {
      const key = normalizeRowKey(label)
      if (!key) continue
      if (!conceptMap.has(key)) conceptMap.set(key, { key, label, topicIds: [] })
      conceptMap.get(key).topicIds.push(topic.id)
    }
  }
  const useConcepts = conceptMap.size > 0
  const source = useConcepts ? 'concepts' : 'topics'

  const rowDefs = useConcepts
    ? [...conceptMap.values()]
    : topics.map((topic) => ({
        key: topic.id,
        label: topic.title || 'Untitled topic',
        topicIds: [topic.id]
      }))

  const rows = rowDefs.map((def) => {
    const cells = studentList.map((student) => {
      // A concept row spans several topics; the student's standing on it is the
      // most concerning cell among them — a concept is not understood just
      // because one of the topics that teaches it went well.
      const perTopic = def.topicIds.map((topicId) => cellFor(student.studentUserId, topicId))
      const withEvidence = perTopic.filter((c) => c.state !== CELL_STATES.NOT_STARTED)
      const chosen = withEvidence.length === 0
        ? { state: CELL_STATES.NOT_STARTED, averageQuality: null, reviewCount: 0 }
        : withEvidence.reduce((worst, c) => (
            CONCERN_ORDER.indexOf(c.state) > CONCERN_ORDER.indexOf(worst.state) ? c : worst
          ))
      return { studentUserId: student.studentUserId, name: student.name, ...chosen }
    })

    const scored = cells.filter((c) => CONCERN_WEIGHT[c.state] !== undefined)
    const concern = scored.length > 0
      ? scored.reduce((sum, c) => sum + CONCERN_WEIGHT[c.state], 0) / scored.length
      : null

    return {
      key: def.key,
      label: def.label,
      topicIds: def.topicIds,
      cells,
      concern,
      strugglingCount: cells.filter((c) => c.state === CELL_STATES.STRUGGLING).length,
      watchCount: cells.filter((c) => c.state === CELL_STATES.WATCH).length,
      evidenceCount: scored.length
    }
  })

  rows.sort((a, b) => {
    // Rows nobody has evidence on sink to the bottom — they are not "fine",
    // they are unknown, and mixing them in with real results would mislead.
    if ((a.concern === null) !== (b.concern === null)) return a.concern === null ? 1 : -1
    if (b.strugglingCount !== a.strugglingCount) return b.strugglingCount - a.strugglingCount
    if ((b.concern ?? 0) !== (a.concern ?? 0)) return (b.concern ?? 0) - (a.concern ?? 0)
    return a.label.localeCompare(b.label)
  })

  return { source, students: studentList, rows }
}

/** One plain sentence naming the weakest rows, or null when there is nothing to say. */
export function describeHeatmap(heatmap) {
  const rows = (heatmap?.rows || []).filter((row) => row.concern !== null)
  if (rows.length === 0) return null

  const noun = heatmap.source === 'concepts' ? 'concept' : 'topic'
  const trouble = rows.filter((row) => row.strugglingCount > 0)
  if (trouble.length === 0) {
    return `No ${noun} is showing a struggling result yet.`
  }

  const [worst] = trouble
  const others = trouble.length - 1
  const who = `${worst.strugglingCount} student${worst.strugglingCount === 1 ? '' : 's'}`
  const tail = others > 0
    ? ` ${others} other ${others === 1 ? noun : `${noun}s`} also ${others === 1 ? 'has' : 'have'} struggling results.`
    : ''
  return `${worst.label} is the weakest ${noun} — ${who} struggling.${tail}`
}

// ---------------------------------------------------------------------------
// Who needs a look
// ---------------------------------------------------------------------------

export const ATTENTION_LEVELS = ['on-track', 'low', 'medium', 'high']

/**
 * Score and describe one student's standing.
 *
 * Copy rule, inherited from the P10.4 integrity labels: every line is
 * **observational**, describing what the data shows and what the teacher could
 * do — never a judgement of the student. "No sessions logged in 9 days" is
 * actionable; "disengaged" is a verdict a study log cannot support. A unit test
 * enforces this.
 */
export function describeStudentConcern({
  overall = { totalTopics: 0, completionPercentage: 0 },
  dueReviews = 0,
  idleDays = null,
  averageQuality = null,
  currentWeekMinutes = 0,
  previousWeekMinutes = 0,
  weakTopicCount = 0,
  totalMinutes = 0
} = {}) {
  let priorityScore = 0
  const reasons = []

  if (idleDays === null) {
    priorityScore += 4
    reasons.push('No study sessions logged yet.')
  } else if (idleDays >= 7) {
    priorityScore += 4
    reasons.push(`No sessions logged in ${idleDays} days.`)
  } else if (idleDays >= 4) {
    priorityScore += 2
    reasons.push(`Last session was ${idleDays} days ago.`)
  }

  if (dueReviews >= 6) {
    priorityScore += 3
    reasons.push(`${dueReviews} reviews are past their due date.`)
  } else if (dueReviews >= 3) {
    priorityScore += 2
    reasons.push(`${dueReviews} reviews are past their due date.`)
  } else if (dueReviews > 0) {
    priorityScore += 1
    reasons.push(`${dueReviews} review${dueReviews === 1 ? '' : 's'} due.`)
  }

  if (averageQuality !== null && averageQuality < 2.5) {
    priorityScore += 3
    reasons.push(`Recall ratings average ${averageQuality}/5.`)
  } else if (averageQuality !== null && averageQuality < 3.2) {
    priorityScore += 2
    reasons.push(`Recall ratings average ${averageQuality}/5.`)
  }

  if (overall.totalTopics > 0 && overall.completionPercentage <= 25) {
    priorityScore += 2
    reasons.push(`${overall.completionPercentage}% of topics completed so far.`)
  } else if (
    overall.totalTopics > 0 &&
    overall.completionPercentage < 50 &&
    currentWeekMinutes === 0 &&
    totalMinutes > 0
  ) {
    priorityScore += 1
    reasons.push('No time logged this week, with less than half the course done.')
  }

  if (previousWeekMinutes > 0 && currentWeekMinutes < previousWeekMinutes - 30) {
    priorityScore += 2
    reasons.push('Study time is well below last week.')
  }

  if (weakTopicCount >= 3) {
    priorityScore += 1
    reasons.push(`${weakTopicCount} topics have low recall ratings.`)
  }

  let level = 'on-track'
  let label = 'On track'
  let action = 'Nothing needed — the current pace is working.'

  if (priorityScore >= 7) {
    level = 'high'
    label = 'Worth a conversation'
    action = 'Check in directly and agree on which topics to revisit first.'
  } else if (priorityScore >= 4) {
    level = 'medium'
    label = 'Worth a look'
    action = 'Follow up this week on the overdue or low-rated topics.'
  } else if (priorityScore >= 2) {
    level = 'low'
    label = 'Keep an eye on'
    action = 'A short nudge is probably enough.'
  }

  return {
    level,
    label,
    priorityScore,
    reasons: reasons.slice(0, 3),
    // The single most useful line for a teacher scanning a list.
    headline: reasons[0] || 'Keeping pace with reviews.',
    action
  }
}

// ---------------------------------------------------------------------------
// Class headline
// ---------------------------------------------------------------------------

/**
 * Two or three sentences a teacher can read in five seconds. This is the
 * "plain-language summaries" half of the phase: the numbers are all still on the
 * page, but nobody should have to assemble the conclusion themselves.
 */
export function buildClassHeadline({ summary = {}, students = [], heatmap = null } = {}) {
  const lines = []
  const roster = summary.rosterSize || students.length || 0

  if (roster === 0) {
    return ['No active students yet — invite the class to see analytics here.']
  }

  const needsLook = students.filter((s) => s.attention?.level === 'high' || s.attention?.level === 'medium').length
  const active = summary.activeStudentsThisWeek || 0

  lines.push(
    needsLook === 0
      ? `All ${roster} student${roster === 1 ? '' : 's'} are keeping pace this week.`
      : `${needsLook} of ${roster} student${roster === 1 ? '' : 's'} could use a look this week.`
  )

  lines.push(
    active === 0
      ? 'Nobody has logged study time in the last seven days.'
      : `${active} studied in the last seven days${
          summary.averageCompletion !== undefined ? `, and the class averages ${summary.averageCompletion}% of topics completed` : ''
        }.`
  )

  const heatmapLine = describeHeatmap(heatmap)
  if (heatmapLine) lines.push(heatmapLine)

  return lines
}

// ---------------------------------------------------------------------------
// Effort trend
// ---------------------------------------------------------------------------

/**
 * Weekly class effort and recall quality, oldest first.
 *
 * Returns both measures per week but they are DELIBERATELY charted separately:
 * minutes and a 0–5 rating share no scale, and a dual-axis chart is the one
 * thing the dataviz skill forbids outright.
 */
export function buildWeeklyTrend({ logs = [], weeks = 6, now = new Date(), timeZone = 'UTC' } = {}) {
  const thisWeekStart = weekStartKey(zonedDayKey(now, timeZone))
  const span = Math.max(1, weeks)

  const buckets = new Map()
  for (let i = span - 1; i >= 0; i -= 1) {
    const key = shiftDayKey(thisWeekStart, -7 * i)
    buckets.set(key, { weekStart: key, minutes: 0, reviews: 0, qualitySum: 0, qualityCount: 0 })
  }

  for (const log of logs) {
    if (!log?.created_at) continue
    const at = new Date(log.created_at)
    if (Number.isNaN(at.getTime())) continue
    const key = weekStartKey(zonedDayKey(at, timeZone))
    const bucket = buckets.get(key)
    if (!bucket) continue

    bucket.minutes += log.duration_minutes || 0
    if (log.session_type === 'review') {
      bucket.reviews += 1
      if (log.quality_rating !== null && log.quality_rating !== undefined) {
        bucket.qualitySum += log.quality_rating
        bucket.qualityCount += 1
      }
    }
  }

  return [...buckets.values()].map((bucket) => ({
    weekStart: bucket.weekStart,
    // "Jul 20" — short enough for an axis tick at mobile width.
    label: formatWeekLabel(bucket.weekStart),
    minutes: Math.round(bucket.minutes),
    reviews: bucket.reviews,
    averageQuality: bucket.qualityCount > 0
      ? Number((bucket.qualitySum / bucket.qualityCount).toFixed(1))
      : null
  }))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatWeekLabel(dayKey) {
  const [, month, day] = String(dayKey).split('-').map(Number)
  return `${MONTHS[(month || 1) - 1]} ${day}`
}

/** Idle-days helper shared by the query layer. */
export function idleDaysFrom(lastActivity, now = new Date()) {
  if (!lastActivity) return null
  return Math.floor((now.getTime() - new Date(lastActivity).getTime()) / DAY_IN_MS)
}
