// DAG-neighbor context for topic content generation (Plan P6.3).
//
// A topic is a node in the subject's dependency graph (`topic_dependencies`),
// but content generation used to prompt each topic in isolation — so every
// lesson re-taught its prerequisites and no lesson knew what came before or
// after it. This module gathers a topic's immediate neighbours and turns them
// into prompt context: prerequisites are "already taught, build on them", and
// dependents are "taught later, don't pre-empt".

const MAX_NEIGHBORS = 8
const MAX_DESC_CHARS = 300

function tidy(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s
}

// Fetch the topic's direct prerequisites (topics it depends on) and direct
// dependents (topics that depend on it), with titles + short descriptions.
// `reader` is any supabase-js client that can read the rows (RLS client for
// owners, admin client for classroom access — same client the caller writes with).
export async function fetchTopicNeighbors(reader, { subjectId, topicId, includeLedger = false }) {
  const empty = { prerequisites: [], followups: [] }
  if (!reader || !subjectId || !topicId) return empty

  const [{ data: prereqLinks }, { data: dependentLinks }] = await Promise.all([
    reader
      .from('topic_dependencies')
      .select('depends_on_topic_id')
      .eq('subject_id', subjectId)
      .eq('topic_id', topicId),
    reader
      .from('topic_dependencies')
      .select('topic_id')
      .eq('subject_id', subjectId)
      .eq('depends_on_topic_id', topicId)
  ])

  const prereqIds = (prereqLinks || []).map((r) => r.depends_on_topic_id).filter(Boolean)
  const dependentIds = (dependentLinks || []).map((r) => r.topic_id).filter(Boolean)

  const allIds = [...new Set([...prereqIds, ...dependentIds])]
  if (allIds.length === 0) return empty

  // Only select the ledger column when the caller opts in — it does not exist
  // until the P6.5 migration is applied (P14), and selecting a missing column errors.
  const columns = includeLedger ? 'id, title, description, concept_ledger' : 'id, title, description'
  const { data: neighborTopics } = await reader
    .from('topics')
    .select(columns)
    .in('id', allIds)

  const byId = new Map((neighborTopics || []).map((t) => [t.id, t]))

  // Prefer the concept-ledger summary (P6.5) over the raw description when present.
  const describe = (t) =>
    includeLedger && t.concept_ledger?.summary
      ? tidy(t.concept_ledger.summary, MAX_DESC_CHARS)
      : tidy(t.description, MAX_DESC_CHARS)

  const prerequisites = prereqIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, MAX_NEIGHBORS)
    .map((t) => ({ title: t.title, description: describe(t) }))

  const followups = dependentIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, MAX_NEIGHBORS)
    .map((t) => ({ title: t.title }))

  return { prerequisites, followups }
}

// Turn the neighbours into a prompt block. Returns '' when the topic has no
// neighbours (an entry-point topic with no dependents yet), so the caller can
// inject it unconditionally.
export function buildNeighborContext({ prerequisites = [], followups = [] } = {}) {
  if (prerequisites.length === 0 && followups.length === 0) return ''

  const parts = [
    'COURSE CONTINUITY CONTEXT (CRITICAL — this topic is one node in a learning graph, not a standalone article):'
  ]

  if (prerequisites.length > 0) {
    const list = prerequisites
      .map((p) => (p.description ? `- "${p.title}": ${p.description}` : `- "${p.title}"`))
      .join('\n')
    parts.push(
      `ALREADY TAUGHT — prerequisite topics the student completed BEFORE this one:
${list}

INSTRUCTION: The student ALREADY KNOWS the above. Reference these concepts by name and BUILD ON them. Do NOT re-explain or re-derive them from scratch — a one-line callback ("Recall from '<topic>' that …") is fine, a full re-teaching is NOT.`
    )
  }

  if (followups.length > 0) {
    const list = followups.map((f) => `- "${f.title}"`).join('\n')
    parts.push(
      `TAUGHT LATER — topics that depend on this one and come AFTER it:
${list}

INSTRUCTION: Do NOT pre-teach the above. Stay strictly scoped to THIS topic and leave those for their own lessons; you may at most name them as "coming up next".`
    )
  }

  return parts.join('\n\n')
}
