// Teacher-authored assessment papers (the authoring half of the exam system).
//
// Alias-free and side-effect-free so it is directly unit-testable under
// `node --test`. Routes do auth and I/O; every rule about what a paper IS lives
// here.
//
// THE MODEL:
//
// A paper is an ordered list of questions, each of which is one of two shapes:
//
//   pinned    — a specific item from the bank. Every student gets exactly this
//               question. This is what a teacher normally means by "a test".
//   blueprint — a rule ("3 questions on TCP handshake, difficulty 2-4"), filled
//               per student at start time from the bank.
//
// Blueprints are not a gimmick: they are how a paper stays honest across
// re-sits and across a class sharing answers, and they reuse the existing
// difficulty-targeting selection engine rather than duplicating it. A paper can
// mix both shapes freely — a fixed core plus a randomized tail is a very normal
// exam design.

import { isGradable } from './items.js'
import { makeRng, shuffleWithRng, targetDifficultyFor } from './exam.js'
import { normalizeConceptKey } from '../memory/concept-state.js'

export const DRAFT = 'draft'
export const PUBLISHED = 'published'
export const CLOSED = 'closed'

// A paper below this many questions is almost always an accident (a teacher who
// set it up and forgot to add questions), and a score out of one or two items is
// noise rather than a measurement.
export const MIN_QUESTIONS = 3

// How far past the requested count a blueprint draw looks before shuffling.
// See resolvePaperItems: without a window the draw is deterministic and every
// student in the same concept state sits an identical paper.
export const POOL_BREADTH = 3

// --- Points ----------------------------------------------------------------

// A blueprint contributes `points` PER DRAWN QUESTION, not once — otherwise a
// rule drawing 5 questions would be worth the same as a single pinned one, and
// the paper's total would not match what students actually sit.
export function questionPoints(question) {
  const points = Number(question?.points ?? 1)
  if (!Number.isFinite(points) || points <= 0) return 0
  const draws = question?.source === 'blueprint' ? Number(question?.draw_count ?? 1) : 1
  return points * Math.max(1, draws)
}

export function totalPoints(questions = []) {
  return questions.reduce((sum, q) => sum + questionPoints(q), 0)
}

// How many questions a student will actually face.
export function totalQuestionCount(questions = []) {
  return questions.reduce(
    (n, q) => n + (q?.source === 'blueprint' ? Math.max(1, Number(q.draw_count ?? 1)) : 1),
    0
  )
}

// --- Publish validation ----------------------------------------------------

/**
 * Can this paper be published?
 *
 * Publishing is the point of no return that students see, so every condition
 * that would make the paper fail LATER — at start time, in front of a class —
 * is checked HERE instead. The expensive one is blueprint feasibility: a rule
 * asking for 5 items on a concept the bank has 2 of will silently serve short
 * papers, and the teacher has no way to discover that by looking at the draft.
 *
 * @param bankCounts Map/object of concept_key -> count of gradable items
 *                   available at that concept, used for blueprint feasibility.
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateForPublish({ assessment, questions = [], bankCounts = {} } = {}) {
  const errors = []
  const warnings = []

  const title = String(assessment?.title || '').trim()
  if (!title) errors.push('The assessment needs a title.')

  const count = totalQuestionCount(questions)
  if (count < MIN_QUESTIONS) {
    errors.push(`A paper needs at least ${MIN_QUESTIONS} questions (this one has ${count}).`)
  }

  const opensAt = assessment?.opens_at ? Date.parse(assessment.opens_at) : null
  const closesAt = assessment?.closes_at ? Date.parse(assessment.closes_at) : null
  if (opensAt && closesAt && closesAt <= opensAt) {
    errors.push('The close time must be after the open time.')
  }

  const duration = Number(assessment?.duration_minutes ?? 0)
  if (opensAt && closesAt && duration > 0) {
    const windowMinutes = (closesAt - opensAt) / 60000
    if (duration > windowMinutes) {
      errors.push(
        `The time limit (${duration} min) is longer than the window it is open for (${Math.round(windowMinutes)} min).`
      )
    }
  }

  const lookup = bankCounts instanceof Map ? bankCounts : new Map(Object.entries(bankCounts || {}))

  for (const question of questions) {
    if (question?.source !== 'blueprint') continue
    const key = question.concept_key
    const want = Math.max(1, Number(question.draw_count ?? 1))
    const have = Number(lookup.get(key) ?? 0)
    if (have === 0) {
      errors.push(`No questions exist in the bank for "${key}". Generate some, or remove that rule.`)
    } else if (have < want) {
      // A warning, not an error: a short draw still produces a sittable paper.
      warnings.push(`"${key}" asks for ${want} questions but the bank has ${have}. Students will see ${have}.`)
    }
  }

  // A pinned item that cannot be auto-graded would leave the score incomplete
  // with no indication to either party.
  const ungradable = questions.filter((q) => q?.source === 'item' && q.item && !isGradable(q.item))
  if (ungradable.length > 0) {
    errors.push(
      `${ungradable.length} question(s) cannot be auto-graded (open "why" items). Use those for practice instead.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// --- Window / eligibility --------------------------------------------------

/**
 * What a student should be told about this paper right now.
 *
 * Derived from stored timestamps rather than a stored state, so nothing has to
 * run on a schedule to flip a paper open — and a paper cannot get stuck in the
 * wrong state because a cron missed a beat.
 */
export function windowState(assessment, now = Date.now()) {
  if (!assessment) return 'unavailable'
  if (assessment.status === DRAFT) return 'draft'
  if (assessment.status === CLOSED) return 'closed'

  const opensAt = assessment.opens_at ? Date.parse(assessment.opens_at) : null
  const closesAt = assessment.closes_at ? Date.parse(assessment.closes_at) : null

  if (opensAt && now < opensAt) return 'scheduled'
  if (closesAt && now > closesAt) return 'closed'
  return 'open'
}

/**
 * May this student start an attempt?
 *
 * Returns a REASON, not just a boolean, because every one of these is something
 * the student is entitled to see explained — "you can't start this" with no
 * cause is the kind of thing that generates a support message mid-exam.
 */
export function canAttempt({ assessment, attemptsUsed = 0, now = Date.now() } = {}) {
  const state = windowState(assessment, now)

  if (state === 'draft') return { allowed: false, reason: 'This assessment has not been published yet.' }
  if (state === 'scheduled') {
    return {
      allowed: false,
      reason: `This assessment opens ${new Date(Date.parse(assessment.opens_at)).toLocaleString()}.`
    }
  }
  if (state === 'closed') return { allowed: false, reason: 'This assessment is closed.' }

  const max = Math.max(1, Number(assessment?.max_attempts ?? 1))
  if (attemptsUsed >= max) {
    return {
      allowed: false,
      reason: max === 1
        ? 'You have already submitted this assessment.'
        : `You have used all ${max} attempts.`
    }
  }

  return { allowed: true, attemptsRemaining: max - attemptsUsed }
}

/**
 * Milliseconds left in this attempt, honoring BOTH the per-attempt time limit
 * and the paper's close time — whichever runs out first.
 *
 * Both matter: without the close time a student starting one minute before
 * close would get the full duration and submit long after the paper shut.
 */
export function remainingMs({ assessment, startedAt, now = Date.now() } = {}) {
  const limits = []

  const duration = Number(assessment?.duration_minutes ?? 0)
  if (duration > 0 && startedAt) {
    limits.push(Date.parse(startedAt) + duration * 60000 - now)
  }
  if (assessment?.closes_at) {
    limits.push(Date.parse(assessment.closes_at) - now)
  }

  if (limits.length === 0) return null // untimed
  return Math.max(0, Math.min(...limits))
}

// --- Resolving a paper into the items one student sits ---------------------

/**
 * Turn a paper into the concrete ordered item list for ONE student.
 *
 * Deterministic given `seed`, so an attempt can be reconstructed exactly — the
 * same property the rest of the exam engine relies on for grading and review.
 *
 * Blueprint draws deliberately go through the same difficulty-targeting the
 * self-serve exam uses (targetDifficultyFor against the learner's concept
 * state), so a blueprint on a shaky concept serves easier items rather than a
 * wall of hard ones.
 *
 * @returns {{ items: object[], points: number[], short: {conceptKey: string, wanted: number, got: number}[] }}
 *          `short` reports blueprints the bank could not fill — surfaced to the
 *          teacher rather than silently swallowed.
 */
export function resolvePaperItems({
  questions = [],
  items = [],
  conceptRows = [],
  seed = 1,
  shuffleQuestions = false
} = {}) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const stateByKey = new Map(
    (conceptRows || []).filter((r) => r?.concept_key).map((r) => [r.concept_key, r])
  )
  const rng = makeRng(seed)

  // Pinned items are claimed first so a blueprint can never draw a question the
  // student is already answering elsewhere on the same paper.
  const used = new Set()
  for (const q of questions) {
    if (q?.source === 'item' && q.item_id) used.add(q.item_id)
  }

  const ordered = [...questions].sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0))

  const resolved = []
  const short = []

  for (const question of ordered) {
    if (question?.source === 'item') {
      const item = byId.get(question.item_id)
      // A missing item means the bank row was deleted after authoring. Skip it
      // rather than serving a blank question.
      if (item) resolved.push({ item, points: Number(question.points ?? 1) })
      continue
    }

    const key = question?.concept_key
    const want = Math.max(1, Number(question?.draw_count ?? 1))
    const min = Number(question?.difficulty_min ?? 1)
    const max = Number(question?.difficulty_max ?? 5)

    const candidates = items.filter((item) => {
      if (used.has(item.id)) return false
      if (!isGradable(item)) return false
      const itemKey = item.concept_key || normalizeConceptKey(item.concept)
      if (itemKey !== key) return false
      const difficulty = Number(item.difficulty ?? 3)
      return difficulty >= min && difficulty <= max
    })

    // Order by closeness to what this learner should be seeing.
    const target = targetDifficultyFor(stateByKey.get(key))
    const ranked = shuffleWithRng(candidates, rng).sort(
      (a, b) => Math.abs((a.difficulty ?? 3) - target) - Math.abs((b.difficulty ?? 3) - target)
    )

    // Then draw from a WINDOW around the target rather than taking the top N.
    //
    // Sorting by distance-to-target is deterministic, so taking the closest
    // `want` items served every student in the same concept state the exact
    // same questions — which defeats the main reason to use a blueprint at all
    // (a paper that differs per student is far harder to share answers for).
    // Widening to `want + POOL_BREADTH` and shuffling keeps difficulty honest
    // while making the draw genuinely vary. This mirrors what the self-serve
    // exam engine does with DEFAULT_POOL_BREADTH.
    const window = shuffleWithRng(ranked.slice(0, want + POOL_BREADTH), rng)
    const drawn = [...window, ...ranked.slice(want + POOL_BREADTH)].slice(0, want)
    for (const item of drawn) {
      used.add(item.id)
      resolved.push({ item, points: Number(question.points ?? 1) })
    }

    if (drawn.length < want) {
      short.push({ conceptKey: key, wanted: want, got: drawn.length })
    }
  }

  const final = shuffleQuestions ? shuffleWithRng(resolved, rng) : resolved

  return {
    items: final.map((entry) => entry.item),
    points: final.map((entry) => entry.points),
    short
  }
}

/**
 * Score an attempt against the paper's per-question point weights.
 *
 * Kept separate from the engine's flat percentage because a teacher-authored
 * paper is allowed to weight questions, and a pass/fail that ignored those
 * weights would contradict the paper the class was shown.
 */
export function scoreWeighted({ responses = [], points = [] } = {}) {
  let earned = 0
  let possible = 0

  responses.forEach((response, index) => {
    const weight = Number(points[index] ?? 1)
    possible += weight
    if (response?.correct) earned += weight
  })

  return {
    earned,
    possible,
    percent: possible > 0 ? Math.round((earned / possible) * 100) : 0
  }
}
