// Assessment integrity signals (Plan P10.2 / P10.3).
//
// Everything here produces ADVISORY FLAGS. Nothing in this file blocks a
// submission, alters a score, or accuses anyone: a classroom flag goes to a
// teacher who decides (P10.4), and a self-paced attempt is gated by the oral
// viva (P10.5) rather than by browser telemetry. That restraint is deliberate —
// every one of these signals has an innocent explanation (a fast reader, a phone
// call mid-exam, a shared study guide), and no browser check is bulletproof.
//
// Pure and alias-free: unit-testable under `node --test`.

// An answer returned faster than the question could be read.
export const IMPOSSIBLY_FAST_MS = 1500
// Below this spread in per-answer timing, the pacing looks machine-like rather
// than human. Needs several answers before it means anything.
export const UNIFORM_TIMING_STDDEV_MS = 120
export const UNIFORM_TIMING_MIN_ANSWERS = 6
// Fraction of answers on one option position before "same letter throughout"
// stops looking like chance.
export const SAME_POSITION_RATIO = 0.85
export const SAME_POSITION_MIN_ANSWERS = 6
// How alike two learners' answer sequences must be to be worth a look.
export const SEQUENCE_MATCH_RATIO = 0.9
export const SEQUENCE_MIN_OVERLAP = 6

function flag(kind, detail, extra = {}) {
  return { kind, detail, ...extra }
}

// --- Timing ---------------------------------------------------------------

export function detectTimingFlags(results = []) {
  const answered = results.filter((r) => r?.answered && Number(r.ms) > 0)
  const flags = []

  const tooFast = answered.filter((r) => Number(r.ms) < IMPOSSIBLY_FAST_MS)
  if (tooFast.length > 0) {
    flags.push(
      flag(
        'impossibly_fast',
        `${tooFast.length} answer(s) submitted in under ${IMPOSSIBLY_FAST_MS}ms`,
        { count: tooFast.length }
      )
    )
  }

  if (answered.length >= UNIFORM_TIMING_MIN_ANSWERS) {
    const times = answered.map((r) => Number(r.ms))
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    const variance = times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length
    const stddev = Math.sqrt(variance)
    if (stddev < UNIFORM_TIMING_STDDEV_MS) {
      flags.push(
        flag(
          'uniform_timing',
          `per-answer timing varied by only ±${Math.round(stddev)}ms across ${times.length} answers`,
          { stddev: Math.round(stddev) }
        )
      )
    }
  }

  return flags
}

// --- Answer patterns -----------------------------------------------------

export function detectPatternFlags(results = []) {
  const answered = results.filter(
    (r) => r?.answered && r.chosenIndex !== null && r.chosenIndex !== undefined
  )
  if (answered.length < SAME_POSITION_MIN_ANSWERS) return []

  const counts = new Map()
  for (const r of answered) {
    const idx = Number(r.chosenIndex)
    counts.set(idx, (counts.get(idx) || 0) + 1)
  }

  const [topIndex, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topCount / answered.length >= SAME_POSITION_RATIO) {
    return [
      flag(
        'same_position',
        `${topCount} of ${answered.length} answers were option ${topIndex + 1}`,
        { position: topIndex, count: topCount }
      )
    ]
  }
  return []
}

// --- Cross-user sequence similarity --------------------------------------

// Compare this attempt's per-item choices against other learners' attempts on
// the same subject. Because options are shuffled PER ATTEMPT (P10.1), two people
// answering honestly almost never produce the same *presented-position*
// sequence — so a near-identical one is worth a human look.
//
// `others` is [{ attemptId, userId, responses: [{ item_id, chosen_index }] }].
export function detectSharedAnswerFlags(results = [], others = []) {
  const mine = new Map(
    results
      .filter((r) => r?.chosenIndex !== null && r?.chosenIndex !== undefined)
      .map((r) => [r.itemId, Number(r.chosenIndex)])
  )
  if (mine.size < SEQUENCE_MIN_OVERLAP) return []

  const matches = []
  for (const other of others || []) {
    let overlap = 0
    let same = 0
    for (const response of other?.responses || []) {
      const itemId = response?.item_id ?? response?.itemId
      const chosen = response?.chosen_index ?? response?.chosenIndex
      if (!mine.has(itemId) || chosen === null || chosen === undefined) continue
      overlap += 1
      if (Number(chosen) === mine.get(itemId)) same += 1
    }
    if (overlap >= SEQUENCE_MIN_OVERLAP && same / overlap >= SEQUENCE_MATCH_RATIO) {
      matches.push({
        attemptId: other.attemptId,
        overlap,
        same,
        ratio: Math.round((same / overlap) * 100) / 100
      })
    }
  }

  if (matches.length === 0) return []
  return [
    flag(
      'shared_answers',
      `answer sequence matches ${matches.length} other attempt(s) on the same items`,
      { matches }
    )
  ]
}

// --- Client-reported session events (P10.3) ------------------------------

// The UI reports blur / tab-hide / fullscreen-exit events. These are the weakest
// signals here — trivially suppressible — so they are summarized, capped, and
// never treated as proof of anything.
const KNOWN_EVENTS = new Set(['blur', 'hidden', 'fullscreen_exit'])
const MAX_EVENTS_RECORDED = 50

export function normalizeIntegrityEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .filter((e) => KNOWN_EVENTS.has(e?.kind))
    .slice(0, MAX_EVENTS_RECORDED)
    .map((e) => ({ kind: e.kind, at: Number(e.at) || 0 }))
}

export function detectSessionFlags(events = []) {
  const normalized = normalizeIntegrityEvents(events)
  if (normalized.length === 0) return []

  const counts = normalized.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1
    return acc
  }, {})

  const parts = []
  if (counts.hidden) parts.push(`left the tab ${counts.hidden}×`)
  if (counts.blur) parts.push(`lost focus ${counts.blur}×`)
  if (counts.fullscreen_exit) parts.push(`exited fullscreen ${counts.fullscreen_exit}×`)

  return [flag('left_exam_window', parts.join(', '), { counts })]
}

// --- Aggregate -----------------------------------------------------------

// All flags for one attempt. `others` and `events` are optional so a caller with
// neither still gets the timing/pattern checks.
export function detectAttemptFlags(results = [], { others = [], events = [] } = {}) {
  return [
    ...detectTimingFlags(results),
    ...detectPatternFlags(results),
    ...detectSharedAnswerFlags(results, others),
    ...detectSessionFlags(events)
  ]
}

// Rank an attempt for a teacher's queue (P10.4). This orders a review list; it
// is NOT a verdict, and the wording used in the UI must stay descriptive.
const FLAG_WEIGHTS = {
  shared_answers: 3,
  impossibly_fast: 2,
  uniform_timing: 2,
  same_position: 1,
  left_exam_window: 1
}

export function scoreFlagSeverity(flags = []) {
  return (flags || []).reduce((sum, f) => sum + (FLAG_WEIGHTS[f?.kind] || 0), 0)
}

export function summarizeFlags(flags = []) {
  const severity = scoreFlagSeverity(flags)
  return {
    severity,
    // Thresholds are for SORTING a teacher's attention, nothing else.
    level: severity === 0 ? 'none' : severity >= 3 ? 'review' : 'watch',
    kinds: (flags || []).map((f) => f?.kind).filter(Boolean)
  }
}
