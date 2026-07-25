// Per-user, per-concept mastery — the "user memory" tier (Plan P8.1).
//
// Subject memory (P6.5 concept ledgers) says what a topic TEACHES. This module
// says what THIS learner actually knows, derived from signals the app already
// produces: SM-2 review quality, doubt-chat questions, lesson completions, and
// the P8.4 placement check. It is read back into content generation (P8.2), the
// review queue (P8.2), and the doubt-chat tutor (P8.3).
//
// Deliberately alias-free (no `@/` imports) and side-effect-free apart from the
// two explicitly-named DB helpers, which take whatever supabase-js client the
// caller already has — same pattern as lib/topics/neighbors.js — so the decision
// logic is unit-testable under `node --test`.

// How far a single observation moves mastery. 0.4 is responsive enough that two
// good reviews read as mastery, damped enough that one bad day doesn't erase it.
export const MASTERY_ALPHA = 0.4
// Mastery at/above this reads as "knows it"; below SHAKY_BELOW reads as "weak".
export const MASTERED_AT = 0.8
export const SHAKY_BELOW = 0.5
// A concept asked about this many times is surfaced proactively by the tutor.
export const STRUGGLE_NUDGE_AT = 3

const MAX_CONCEPTS_PER_SIGNAL = 12
const MAX_CONTEXT_CONCEPTS = 10
const MAX_CONCEPT_CHARS = 120

// Normalized join key so "Big-O Notation", "big o notation" and "Big O
// notation." collapse to one concept. The display label is stored separately.
export function normalizeConceptKey(concept) {
  return String(concept || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s+#]/gu, ' ') // keep letters/digits/space and + # (C++, C#)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONCEPT_CHARS)
}

function tidyLabel(concept) {
  return String(concept || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONCEPT_CHARS)
}

// The concepts a topic covers: from its P6.5 ledger when present, else the
// topic title (a coarse but always-available fallback pre-P14).
export function conceptsFromLedger(ledger, fallbackTitle = '') {
  const fromLedger = [
    ...(Array.isArray(ledger?.concepts_introduced) ? ledger.concepts_introduced : []),
    ...(Array.isArray(ledger?.terms_defined) ? ledger.terms_defined : [])
  ]
    .map(tidyLabel)
    .filter(Boolean)

  const source = fromLedger.length > 0 ? fromLedger : [tidyLabel(fallbackTitle)].filter(Boolean)

  // De-duplicate on the normalized key, keeping the first spelling seen.
  const seen = new Set()
  const out = []
  for (const label of source) {
    const key = normalizeConceptKey(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(label)
    if (out.length >= MAX_CONCEPTS_PER_SIGNAL) break
  }
  return out
}

// --- Signals ---------------------------------------------------------------
// A signal is { kind, observation, struggle }. `observation` is performance in
// 0..1 and is the ONLY thing that moves mastery; a null observation (reading a
// lesson, asking a question) just records exposure. That split is what lets the
// state express "has seen this a lot and still shaky".

// SM-2 quality (0-5) → review signal.
export function signalFromQuality(quality) {
  const q = Math.max(0, Math.min(5, Number(quality) || 0))
  return {
    kind: 'review',
    observation: q / 5,
    struggle: q < 3
  }
}

// A graded item (placement check today, P9 assessments later) → signal.
export function signalFromCorrectness(correct, kind = 'diagnostic') {
  return { kind, observation: correct ? 1 : 0, struggle: !correct }
}

// A graded item whose confidence is known (P9.2): the caller has already folded
// correctness AND confidence into one 0..1 observation, so a lucky guess does
// not read as mastery and a confident miss lands hard.
export function signalFromObservation(observation, { kind = 'quiz', struggle = false } = {}) {
  return { kind, observation: Math.max(0, Math.min(1, Number(observation) || 0)), struggle }
}

// Reading a lesson: exposure only, no claim about performance.
export function lessonSignal() {
  return { kind: 'lesson', observation: null, struggle: false }
}

// Asking about a topic: exposure + a struggle tally (repeat questions are the
// signal, not any single one), but no mastery penalty — asking is not failing.
export function doubtSignal() {
  return { kind: 'doubt', observation: null, struggle: true }
}

// Fold one signal into one concept's existing row (or undefined for a new one).
// Returns the column values to persist; pure, `now` injected for testability.
export function mergeConceptSignal(existing, signal, { now = new Date() } = {}) {
  const prevMastery = Number(existing?.mastery ?? 0)
  const prevObservations = Number(existing?.observations ?? 0)
  const hasObservation = typeof signal?.observation === 'number'

  let mastery = prevMastery
  if (hasObservation) {
    mastery = prevObservations === 0
      // Seed from the first real observation rather than decaying up from 0.
      ? signal.observation
      : prevMastery + MASTERY_ALPHA * (signal.observation - prevMastery)
  }

  return {
    mastery: Math.round(Math.max(0, Math.min(1, mastery)) * 1000) / 1000,
    exposures: Number(existing?.exposures ?? 0) + 1,
    observations: prevObservations + (hasObservation ? 1 : 0),
    successes: Number(existing?.successes ?? 0) + (hasObservation && signal.observation >= 0.7 ? 1 : 0),
    struggles: Number(existing?.struggles ?? 0) + (signal?.struggle ? 1 : 0),
    last_signal: signal?.kind || 'lesson',
    last_seen_at: new Date(now).toISOString()
  }
}

// Build the full upsert payload for one signal applied to several concepts.
export function buildConceptStateRows({
  userId,
  subjectId,
  concepts = [],
  signal,
  existing = [],
  now = new Date()
}) {
  if (!userId || !subjectId || !signal) return []

  const byKey = new Map(
    (existing || []).filter((r) => r?.concept_key).map((r) => [r.concept_key, r])
  )

  const rows = []
  const used = new Set()
  for (const label of concepts) {
    const concept = tidyLabel(label)
    const concept_key = normalizeConceptKey(concept)
    if (!concept_key || used.has(concept_key)) continue
    used.add(concept_key)

    rows.push({
      user_id: userId,
      subject_id: subjectId,
      concept_key,
      concept,
      ...mergeConceptSignal(byKey.get(concept_key), signal, { now })
    })
    if (rows.length >= MAX_CONCEPTS_PER_SIGNAL) break
  }
  return rows
}

// --- Reading the state back ------------------------------------------------

// Bucket rows for prompt/UI use. `mastered` is high-confidence knowledge,
// `shaky` is where extra scaffolding pays off.
export function summarizeConceptState(rows = []) {
  const mastered = []
  const shaky = []

  for (const row of rows) {
    if (!row?.concept) continue
    const mastery = Number(row.mastery ?? 0)
    // Requires a real observation — an exposure-only row proves nothing.
    if (mastery >= MASTERED_AT && Number(row.observations ?? 0) > 0) {
      mastered.push(row)
    } else if (
      Number(row.struggles ?? 0) >= 2 ||
      (Number(row.observations ?? 0) > 0 && mastery < SHAKY_BELOW)
    ) {
      shaky.push(row)
    }
  }

  mastered.sort((a, b) => Number(b.mastery ?? 0) - Number(a.mastery ?? 0))
  shaky.sort((a, b) => Number(a.mastery ?? 0) - Number(b.mastery ?? 0))
  return { mastered, shaky }
}

// Prompt block for generation (P8.2) and the tutor (P8.3). Returns '' when the
// learner has no usable history, so callers can inject it unconditionally.
export function buildLearnerMemoryContext(rows = []) {
  const { mastered, shaky } = summarizeConceptState(rows)
  if (mastered.length === 0 && shaky.length === 0) return ''

  const parts = [
    'LEARNER MEMORY (THIS student\'s own history in this subject, from their graded reviews, questions, and placement check — not a general audience profile):'
  ]

  if (mastered.length > 0) {
    parts.push(
      `ALREADY DEMONSTRATED MASTERY:
${mastered.slice(0, MAX_CONTEXT_CONCEPTS).map((r) => `- ${r.concept}`).join('\n')}

INSTRUCTION: Treat these as known. Use them as building blocks and reference them by name; do NOT re-teach or re-derive them.`
    )
  }

  if (shaky.length > 0) {
    parts.push(
      `REPEATEDLY STRUGGLED WITH:
${shaky
  .slice(0, MAX_CONTEXT_CONCEPTS)
  .map((r) => {
    const why = Number(r.struggles ?? 0) >= 2 ? `asked about / failed ${r.struggles}×` : 'low recall score'
    return `- ${r.concept} (${why})`
  })
  .join('\n')}

INSTRUCTION: Wherever this lesson depends on the above, slow down: restate the idea in different words, add one extra worked example, and make the connection to this topic explicit. Do NOT assume these are solid.`
    )
  }

  return parts.join('\n\n')
}

// Tutor-facing nudge (P8.3): the single most-struggled concept worth offering
// unprompted help on. Returns '' when nothing crosses the bar.
export function buildProactiveNudge(rows = []) {
  const candidates = (rows || [])
    .filter((r) => r?.concept && (Number(r.struggles ?? 0) >= STRUGGLE_NUDGE_AT ||
      (Number(r.observations ?? 0) >= 2 && Number(r.mastery ?? 0) < SHAKY_BELOW)))
    .sort((a, b) => Number(b.struggles ?? 0) - Number(a.struggles ?? 0))

  if (candidates.length === 0) return ''
  const top = candidates.slice(0, 2).map((r) => r.concept)

  return `PROACTIVE HELP: This student has repeatedly struggled with: ${top.join(', ')}. If their question touches any of these, address the underlying gap rather than just the surface question. If the conversation reaches a natural pause and the gap is still unresolved, offer once — briefly, without nagging — to work through it with them.`
}

// --- Review-queue ordering (P8.2) -----------------------------------------

// Weakness of a due topic in 0..1 (1 = weakest). Prefers this learner's concept
// state for the topic's ledger concepts; falls back to the topic's own SM-2 ease
// factor, which is the only weakness signal available pre-P14.
export function scoreTopicWeakness(topic, stateByKey = new Map()) {
  const concepts = conceptsFromLedger(topic?.concept_ledger, topic?.title)
  const masteries = concepts
    .map((c) => stateByKey.get(normalizeConceptKey(c)))
    .filter((r) => r && Number(r.observations ?? 0) > 0)
    .map((r) => Number(r.mastery ?? 0))

  if (masteries.length > 0) {
    return 1 - Math.min(...masteries)
  }

  // SM-2 ease factor runs 1.3 (hardest) … 2.5+ (easiest).
  const ef = Number(topic?.difficulty_factor ?? 2.5)
  return Math.max(0, Math.min(1, (2.5 - ef) / 1.2))
}

// Order the due queue weak-concepts-first, then most-overdue, and interleave
// subjects (mixing subjects beats blocking by subject for retention). Pure:
// returns a new array, never mutates the input.
export function orderReviewQueue(dueReviews = [], conceptRows = [], { now = new Date() } = {}) {
  const stateByKey = new Map(
    (conceptRows || []).filter((r) => r?.concept_key).map((r) => [r.concept_key, r])
  )
  const nowMs = new Date(now).getTime()

  const scored = (dueReviews || []).map((topic, index) => {
    const dueMs = topic?.next_review_at ? new Date(topic.next_review_at).getTime() : nowMs
    const overdueDays = Math.max(0, (nowMs - dueMs) / 86400000)
    const weakness = scoreTopicWeakness(topic, stateByKey)
    return {
      topic,
      index,
      // Weakness leads; overdue-ness saturates at ~2 weeks so one ancient item
      // can't monopolize the head of the queue.
      score: 0.65 * weakness + 0.35 * Math.min(1, overdueDays / 14)
    }
  })

  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index))

  // Greedy subject interleave: take the best-scoring item whose subject differs
  // from the previous pick when one exists, else just take the best remaining.
  const remaining = scored.slice()
  const ordered = []
  let lastSubject = null
  while (remaining.length > 0) {
    let pick = remaining.findIndex((s) => (s.topic?.subjectId ?? null) !== lastSubject)
    if (pick === -1) pick = 0
    const [chosen] = remaining.splice(pick, 1)
    ordered.push(chosen.topic)
    lastSubject = chosen.topic?.subjectId ?? null
  }
  return ordered
}

// --- DB helpers ------------------------------------------------------------
// Everything below is best-effort by design: `user_concept_state` does not exist
// until the P14 migration, and personalization must never break learning. Each
// helper swallows its errors and degrades to "no memory".

export function userMemoryEnabled() {
  return process.env.USER_MEMORY === 'true'
}

// Read the learner's concept state for one subject.
export async function fetchConceptState(reader, { userId, subjectId, limit = 200 }) {
  if (!reader || !userId || !subjectId || !userMemoryEnabled()) return []
  try {
    const { data, error } = await reader
      .from('user_concept_state')
      .select('concept, concept_key, mastery, exposures, observations, successes, struggles, last_seen_at')
      .eq('user_id', userId)
      .eq('subject_id', subjectId)
      .order('last_seen_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  } catch (error) {
    console.warn(`[Memory] Concept-state read skipped: ${String(error?.message || error).slice(0, 200)}`)
    return []
  }
}

// Read the learner's concept state across ALL subjects (review-queue ordering).
export async function fetchConceptStateForUser(reader, { userId, limit = 500 }) {
  if (!reader || !userId || !userMemoryEnabled()) return []
  try {
    const { data, error } = await reader
      .from('user_concept_state')
      .select('concept, concept_key, mastery, exposures, observations, successes, struggles, last_seen_at')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  } catch (error) {
    console.warn(`[Memory] Concept-state read skipped: ${String(error?.message || error).slice(0, 200)}`)
    return []
  }
}

// Apply one signal to a set of concepts: read current rows, merge in JS (the
// tested path), upsert in a single round trip. Returns the rows written, or []
// when memory is off / unavailable.
export async function recordConceptSignal(client, { userId, subjectId, concepts = [], signal }) {
  if (!client || !userId || !subjectId || !signal || !userMemoryEnabled()) return []

  const keys = [...new Set(concepts.map(normalizeConceptKey).filter(Boolean))]
  if (keys.length === 0) return []

  try {
    const { data: existing, error: readError } = await client
      .from('user_concept_state')
      .select('concept_key, mastery, exposures, observations, successes, struggles')
      .eq('user_id', userId)
      .eq('subject_id', subjectId)
      .in('concept_key', keys)
    if (readError) throw readError

    const rows = buildConceptStateRows({
      userId,
      subjectId,
      concepts,
      signal,
      existing: existing || []
    })
    if (rows.length === 0) return []

    const { error: writeError } = await client
      .from('user_concept_state')
      .upsert(rows, { onConflict: 'user_id,subject_id,concept_key' })
    if (writeError) throw writeError

    return rows
  } catch (error) {
    console.warn(`[Memory] Concept-state write skipped: ${String(error?.message || error).slice(0, 200)}`)
    return []
  }
}

// The concepts a topic covers, for signal recording. Reads the P6.5 ledger when
// that column exists (CONTENT_LEDGER), else falls back to the topic title.
export async function fetchTopicConcepts(reader, { topicId, fallbackTitle = '' }) {
  if (!reader || !topicId || !userMemoryEnabled()) return conceptsFromLedger(null, fallbackTitle)
  // The ledger column only exists after the P6.5 migration (P14); selecting it
  // before that errors, so ask for it only when the flag says it is there.
  const columns = process.env.CONTENT_LEDGER === 'true' ? 'title, concept_ledger' : 'title'
  try {
    const { data, error } = await reader
      .from('topics')
      .select(columns)
      .eq('id', topicId)
      .maybeSingle()
    if (error) throw error
    return conceptsFromLedger(data?.concept_ledger, data?.title || fallbackTitle)
  } catch (error) {
    console.warn(`[Memory] Ledger read skipped: ${String(error?.message || error).slice(0, 200)}`)
    return conceptsFromLedger(null, fallbackTitle)
  }
}
