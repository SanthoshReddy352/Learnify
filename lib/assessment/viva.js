// Viva pass decision (Plan P10.5). Pure + alias-free: this is the gate a
// self-paced certificate will depend on, so the rule lives in one tested place
// rather than inside a route handler.

import { VIVA_PASS_MEAN, VIVA_MIN_PER_ANSWER } from '../ai/pipelines/viva-prompt.js'

export { VIVA_PASS_MEAN, VIVA_MIN_PER_ANSWER }

// Which concepts are worth examining orally. Preference order:
//   1. concepts the learner got RIGHT while unsure or guessing, and
//   2. concepts they got right while confident,
// because the viva exists to confirm that a correct answer reflects
// understanding. Concepts they got WRONG are excluded — those already failed on
// the exam, and re-testing them here would just punish the same miss twice.
export function selectVivaConcepts(results = [], limit = 3) {
  const byConcept = new Map()
  for (const r of results) {
    if (!r?.concept || !r.correct) continue
    const entry = byConcept.get(r.concept) || { concept: r.concept, weight: 0 }
    // A right answer the learner was unsure about is the most worth probing.
    entry.weight += r.confidence === 'sure' ? 1 : r.confidence === 'guess' ? 3 : 2
    byConcept.set(r.concept, entry)
  }

  return [...byConcept.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((e) => e.concept)
}

// Decide the viva from the per-answer scores. Two conditions, both required:
// a good enough mean AND no single answer that shows no understanding — so one
// strong answer cannot carry a blank one.
export function gradeViva(scores = []) {
  const values = (scores || [])
    .map((s) => Number(s?.score))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.min(1, n)))

  if (values.length === 0) {
    return { passed: false, mean: 0, weakest: 0, reason: 'no answers were scored' }
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const weakest = Math.min(...values)
  const meanOk = mean >= VIVA_PASS_MEAN
  const perAnswerOk = weakest >= VIVA_MIN_PER_ANSWER

  return {
    passed: meanOk && perAnswerOk,
    mean: Math.round(mean * 100) / 100,
    weakest: Math.round(weakest * 100) / 100,
    reason: meanOk && perAnswerOk
      ? 'explanations showed understanding'
      : !meanOk
        ? 'explanations did not show enough understanding overall'
        : 'at least one concept could not be explained at all'
  }
}
