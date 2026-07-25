// Assessment item-bank helpers (Plan P9.1).
//
// Alias-free (imported by `node --test`). Turns validated AI output into
// `assessment_items` rows and defines the column list end users are allowed to
// read — the answer columns are revoked from `anon`/`authenticated` at the
// database level (see the P9 migration), so any select that forgets to
// enumerate columns fails loudly rather than leaking an answer key.

import { normalizeConceptKey } from '../memory/concept-state.js'

// Safe to expose to a learner BEFORE they answer. Deliberately omits
// `correct_index`, `answer_key` and `explanation`.
export const ITEM_PUBLIC_COLUMNS = 'id, subject_id, topic_id, concept, concept_key, kind, difficulty, stem, options'

// Kinds a machine can grade on its own. Open "why" items are deliberately NOT
// here: auto-scoring free text is unreliable, so they are used for formative
// practice (learner compares against the model answer) and, later, the P10.5
// oral viva — never for a score that gates anything.
export const GRADABLE_KINDS = new Set(['mcq', 'worked_example'])

export function isGradable(item) {
  return GRADABLE_KINDS.has(item?.kind)
}

const MAX_OPTIONS = 5

/**
 * Validate + shape generated items into DB rows, AND report what was thrown away.
 *
 * The dropping itself is deliberate — a bad `correct_index` would mark a right
 * answer wrong and poison both the score and the learner's concept memory. But
 * dropping SILENTLY was a mistake: when a model had a bad run and every item was
 * discarded, the only symptom was a bare "Generation returned no usable items"
 * with nothing anywhere to say which rule rejected them. The reasons are
 * per-rule and cheap, so they are always collected and logged by the caller.
 *
 * Returns { rows, dropped: [{ reason, kind, concept }] }.
 */
export function normalizeGeneratedItemsWithReport(items = [], { subjectId, topicId = null } = {}) {
  if (!subjectId) return { rows: [], dropped: [] }

  const rows = []
  const dropped = []
  const drop = (reason, raw, kind) => dropped.push({
    reason,
    kind: kind || raw?.kind || 'mcq',
    concept: String(raw?.concept || '').slice(0, 60)
  })

  for (const raw of items) {
    const kind = raw?.kind === 'why' || raw?.kind === 'worked_example' ? raw.kind : 'mcq'
    const concept = String(raw?.concept || '').replace(/\s+/g, ' ').trim()
    const concept_key = normalizeConceptKey(concept)
    const stem = String(raw?.stem || '').trim()
    if (!concept_key) { drop('missing concept', raw, kind); continue }
    if (!stem) { drop('missing stem', raw, kind); continue }

    const options = Array.isArray(raw?.options)
      ? raw.options.map((o) => String(o || '').trim()).filter(Boolean).slice(0, MAX_OPTIONS)
      : []

    let correct_index = raw?.correct_index === null || raw?.correct_index === undefined
      ? null
      : Number(raw.correct_index)

    if (kind === 'why') {
      // Open item: no options, no index, but it needs a model answer to be
      // useful at all.
      const answer_key = String(raw?.answer_key || '').trim()
      if (!answer_key) { drop('open item has no model answer', raw, kind); continue }
      rows.push({
        subject_id: subjectId,
        topic_id: topicId,
        concept,
        concept_key,
        kind,
        difficulty: clampDifficulty(raw?.difficulty),
        stem,
        options: [],
        correct_index: null,
        answer_key,
        explanation: String(raw?.explanation || '').trim()
      })
      continue
    }

    // Closed item: needs at least two options and an in-range answer index.
    if (options.length < 2) { drop(`only ${options.length} option(s)`, raw, kind); continue }
    if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index >= options.length) {
      drop(`correct_index ${correct_index} out of range for ${options.length} options`, raw, kind)
      continue
    }

    rows.push({
      subject_id: subjectId,
      topic_id: topicId,
      concept,
      concept_key,
      kind,
      difficulty: clampDifficulty(raw?.difficulty),
      stem,
      options,
      correct_index,
      answer_key: '',
      explanation: String(raw?.explanation || '').trim()
    })
  }

  return { rows, dropped }
}

/** Back-compat wrapper: the rows only. */
export function normalizeGeneratedItems(items = [], opts = {}) {
  return normalizeGeneratedItemsWithReport(items, opts).rows
}

/** One-line summary of what was rejected, for logs and error messages. */
export function summarizeDropped(dropped = []) {
  if (!dropped.length) return ''
  const counts = new Map()
  for (const d of dropped) counts.set(d.reason, (counts.get(d.reason) || 0) + 1)
  return [...counts.entries()].map(([reason, n]) => `${n}× ${reason}`).join(', ')
}

function clampDifficulty(value) {
  const n = Math.round(Number(value) || 3)
  return Math.max(1, Math.min(5, n))
}
