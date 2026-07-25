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

// Validate + shape generated items into DB rows. Drops anything malformed
// instead of storing it: a bad `correct_index` would mark a right answer wrong
// and poison both the learner's score and their concept memory.
export function normalizeGeneratedItems(items = [], { subjectId, topicId = null } = {}) {
  if (!subjectId) return []

  const rows = []
  for (const raw of items) {
    const kind = raw?.kind === 'why' || raw?.kind === 'worked_example' ? raw.kind : 'mcq'
    const concept = String(raw?.concept || '').replace(/\s+/g, ' ').trim()
    const concept_key = normalizeConceptKey(concept)
    const stem = String(raw?.stem || '').trim()
    if (!concept_key || !stem) continue

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
      if (!answer_key) continue
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
    if (options.length < 2) continue
    if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index >= options.length) continue

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

  return rows
}

function clampDifficulty(value) {
  const n = Math.round(Number(value) || 3)
  return Math.max(1, Math.min(5, n))
}
