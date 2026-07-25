// Exam/practice engine (Plan P9.2 / P9.3 / P9.4).
//
// Pure and deterministic given its inputs (including an explicit seed), so an
// attempt can be reconstructed exactly for grading and review, and so all of it
// is unit-testable. Alias-free — imported directly by `node --test`.

import { isGradable } from './items.js'
import { normalizeConceptKey, signalFromObservation } from '../memory/concept-state.js'

// Percentage needed to pass a summative exam. A pass is a claim about the
// learner's knowledge, so it lives in one place rather than being inlined.
export const PASS_SCORE = 70

// --- Deterministic shuffling (also the P10.1 randomization primitive) -------

// mulberry32: tiny, fast, well-distributed seeded PRNG. Only used for question
// ordering — never for anything security-sensitive.
export function makeRng(seed) {
  let a = (Number(seed) || 0) >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedFromString(text) {
  let h = 2166136261 >>> 0
  const s = String(text || '')
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

// Fisher-Yates against the seeded RNG. Returns a new array.
export function shuffleWithRng(list = [], rng) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// --- Item selection --------------------------------------------------------

// Target difficulty for a concept given what this learner has shown: weak →
// easier items (a wall of hard questions on a shaky concept teaches nothing),
// solid → harder ones. This is the cheap, bank-driven form of adaptive
// difficulty: no live IRT loop, no extra model calls.
export function targetDifficultyFor(masteryRow) {
  const observations = Number(masteryRow?.observations ?? 0)
  if (observations === 0) return 3
  const mastery = Number(masteryRow?.mastery ?? 0)
  if (mastery >= 0.8) return 5
  if (mastery >= 0.6) return 4
  if (mastery >= 0.4) return 3
  return 2
}

// How many near-target items a concept's pick is drawn from (P10.1). Always
// taking the single closest-difficulty item would serve two learners in the same
// state the same exam; sampling from a small near-target window keeps difficulty
// honest while making per-user papers differ.
export const DEFAULT_POOL_BREADTH = 3

// Pick `count` items, round-robin ACROSS concepts (interleaving beats blocking
// by concept for retention — P9.3), each concept contributing an item drawn from
// its near-target-difficulty window. Deterministic for a given seed.
export function selectExamItems({
  items = [],
  conceptRows = [],
  count = 12,
  seed = 1,
  gradableOnly = true,
  poolBreadth = DEFAULT_POOL_BREADTH
} = {}) {
  const pool = (gradableOnly ? items.filter(isGradable) : items.slice())
  if (pool.length === 0) return []

  const stateByKey = new Map(
    (conceptRows || []).filter((r) => r?.concept_key).map((r) => [r.concept_key, r])
  )
  const rng = makeRng(seed)

  // Group by concept, then order each group by distance from the learner's
  // target difficulty (ties broken by the seeded shuffle, so repeat attempts on
  // the same bank aren't identical).
  const groups = new Map()
  for (const item of pool) {
    const key = item.concept_key || normalizeConceptKey(item.concept)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  for (const [key, group] of groups) {
    const target = targetDifficultyFor(stateByKey.get(key))
    const shuffled = shuffleWithRng(group, rng)
    shuffled.sort((a, b) => Math.abs((a.difficulty ?? 3) - target) - Math.abs((b.difficulty ?? 3) - target))

    // P10.1: shuffle the near-target window so the served item varies per
    // attempt, then keep the rest in difficulty order behind it for longer exams.
    const breadth = Math.max(1, Number(poolBreadth) || 1)
    const window = shuffleWithRng(shuffled.slice(0, breadth), rng)
    groups.set(key, [...window, ...shuffled.slice(breadth)])
  }

  // Weakest concepts first, so a short exam still covers what matters most.
  const keys = shuffleWithRng([...groups.keys()], rng).sort((a, b) => {
    const ma = stateByKey.get(a)
    const mb = stateByKey.get(b)
    const wa = Number(ma?.observations ?? 0) > 0 ? Number(ma.mastery ?? 0) : 0.5
    const wb = Number(mb?.observations ?? 0) > 0 ? Number(mb.mastery ?? 0) : 0.5
    return wa - wb
  })

  const selected = []
  let round = 0
  while (selected.length < count) {
    let addedThisRound = false
    for (const key of keys) {
      const group = groups.get(key)
      if (round < group.length) {
        selected.push(group[round])
        addedThisRound = true
        if (selected.length >= count) break
      }
    }
    if (!addedThisRound) break // bank exhausted
    round += 1
  }

  return selected
}

// --- Presentation ----------------------------------------------------------

// Shape an item for the client: answer key removed, options shuffled per
// attempt (P10.1 — kills answer-position sharing). `order` records the
// permutation so grading can map a presented choice back to the real option.
export function presentItem(item, seed) {
  const rng = makeRng(seed)
  const optionCount = Array.isArray(item?.options) ? item.options.length : 0
  const order = shuffleWithRng(
    Array.from({ length: optionCount }, (_, i) => i),
    rng
  )

  return {
    itemId: item.id,
    concept: item.concept,
    conceptKey: item.concept_key,
    kind: item.kind,
    difficulty: item.difficulty,
    stem: item.stem,
    options: order.map((i) => item.options[i]),
    order
  }
}

// Build the full presented set for an attempt. The returned `served` array is
// what gets stored in `assessment_attempts.items` — grading reads it back so the
// score always refers to exactly what the learner saw.
export function presentItems(items = [], attemptSeed = 1) {
  return items.map((item, index) => presentItem(item, attemptSeed + index * 7919))
}

// Map a presented option index back to the item's real option index.
export function resolveChoice(order = [], presentedIndex) {
  if (presentedIndex === null || presentedIndex === undefined) return null
  const idx = Number(presentedIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= order.length) return null
  return order[idx]
}

// --- Grading + calibration -------------------------------------------------

// Confidence × correctness. "Sure and wrong" is the single most valuable
// resurfacing signal in retention research — the learner does not know they
// don't know — so it is scored hardest and flagged for follow-up. A correct
// guess is credited, but not as mastery.
export function observationFor({ correct, confidence = 'unsure' }) {
  if (correct) {
    if (confidence === 'sure') return 1
    if (confidence === 'guess') return 0.6
    return 0.85
  }
  if (confidence === 'sure') return 0
  if (confidence === 'guess') return 0.25
  return 0.15
}

export function calibrationFor({ correct, confidence = 'unsure' }) {
  if (!correct && confidence === 'sure') return 'overconfident'
  if (correct && confidence === 'guess') return 'lucky'
  return null
}

// Grade one response against the stored item + the served permutation.
export function gradeResponse({ item, served, response }) {
  const chosenReal = resolveChoice(served?.order || [], response?.chosenIndex)
  const correct = chosenReal !== null && chosenReal === Number(item?.correct_index)
  const confidence = response?.confidence || 'unsure'

  return {
    itemId: item.id,
    concept: item.concept,
    conceptKey: item.concept_key,
    chosenIndex: response?.chosenIndex ?? null,
    correct,
    answered: chosenReal !== null,
    confidence,
    calibration: calibrationFor({ correct, confidence }),
    observation: observationFor({ correct, confidence }),
    explanation: item.explanation || '',
    correctIndexPresented: (served?.order || []).indexOf(Number(item?.correct_index)),
    ms: Number(response?.ms) || 0
  }
}

// Grade a whole attempt. UNANSWERED ITEMS COUNT AS WRONG — this is a summative
// exam, so skipping cannot be cheaper than answering.
export function gradeAttempt({ items = [], served = [], responses = [] } = {}) {
  const itemById = new Map(items.map((i) => [i.id, i]))
  const servedById = new Map(served.map((s) => [s.itemId, s]))
  const responseById = new Map((responses || []).map((r) => [r.itemId, r]))

  const results = []
  for (const s of served) {
    const item = itemById.get(s.itemId)
    if (!item) continue
    results.push(
      gradeResponse({
        item,
        served: s,
        response: responseById.get(s.itemId) || { chosenIndex: null, confidence: 'unsure' }
      })
    )
  }

  const total = results.length
  const correctCount = results.filter((r) => r.correct).length
  const score = total === 0 ? 0 : Math.round((correctCount / total) * 10000) / 100

  return {
    results,
    total,
    correctCount,
    score,
    passed: total > 0 && score >= PASS_SCORE,
    // Concepts the learner was confidently wrong about — the highest-value
    // things to resurface first.
    overconfidentConcepts: [
      ...new Set(results.filter((r) => r.calibration === 'overconfident').map((r) => r.concept))
    ],
    weakConcepts: [...new Set(results.filter((r) => !r.correct).map((r) => r.concept))]
  }
}

// Fold graded results into per-concept memory signals (P8.1). Several items can
// test one concept, so outcomes are averaged into ONE observation per concept —
// otherwise a concept tested three times would move mastery three times as far
// as one tested once.
export function conceptSignalsFromResults(results = [], { kind = 'quiz' } = {}) {
  const byConcept = new Map()
  for (const r of results) {
    if (!r?.concept) continue
    const entry = byConcept.get(r.concept) || { sum: 0, count: 0, struggle: false }
    entry.sum += r.observation
    entry.count += 1
    if (!r.correct) entry.struggle = true
    byConcept.set(r.concept, entry)
  }

  return [...byConcept.entries()].map(([concept, e]) => ({
    concept,
    signal: signalFromObservation(e.sum / e.count, { kind, struggle: e.struggle })
  }))
}

// Integrity flags moved to ./integrity.js in P10 (timing, answer patterns,
// cross-user sequence similarity, session events). Re-exported here so existing
// callers keep one import site.
export { detectAttemptFlags } from './integrity.js'
