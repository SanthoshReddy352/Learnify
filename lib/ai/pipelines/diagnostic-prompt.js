// Pure helpers for the diagnostic placement check (Plan P8.4).
// Alias-free so it is unit-testable under `node --test`.

const MAX_TOPICS_IN_PROMPT = 30
const MAX_SUMMARY_CHARS = 160

// Compact one-line-per-topic view of the subject's DAG for the prompt. Prefers
// each topic's P6.5 concept ledger summary over its raw description.
export function buildTopicDigest(topics = []) {
  return topics
    .slice(0, MAX_TOPICS_IN_PROMPT)
    .map((t) => {
      const gist = String(t?.concept_ledger?.summary || t?.description || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_SUMMARY_CHARS)
      return gist ? `- ${t.title}: ${gist}` : `- ${t.title}`
    })
    .filter(Boolean)
    .join('\n')
}

export function buildDiagnosticPrompt({
  subjectTitle,
  subjectSyllabus = '',
  topicDigest = '',
  questionCount = 8,
  difficulty = 3
}) {
  return `Write a SHORT diagnostic placement check for a learner starting the subject "${subjectTitle}".

    Its only purpose is to find out what they ALREADY know, so the course can skip what they have and slow down where they are weak. It is not an exam and carries no grade.

    Return exactly ${questionCount} multiple-choice questions. Each question has:
    - question: the question text, self-contained (no "as shown above").
    - options: 3–4 plausible options, exactly ONE correct.
    - correct_index: the 0-based index of the correct option.
    - concept: the ONE concept this question tests, as a short noun phrase (e.g. "recursion base case", "Big-O notation"). This is the tag the result is recorded against, so keep it specific and reuse the wording from the syllabus/topics below where possible.
    - topic_title: the topic from the list below that the question belongs to, or "" if none fits.

    RULES:
    - Spread the questions ACROSS the listed topics, foundational ones first — do not cluster on one topic.
    - Each question tests ONE concept. No compound or trick questions.
    - Wrong options must be plausible misconceptions, not obvious throwaways, so a guess does not read as knowledge.
    - Keep them answerable in under a minute each; calibrate to difficulty ${difficulty}/5.
    - No "all of the above" / "none of the above" options.
    ${topicDigest ? `\nTOPICS IN THIS SUBJECT:\n${topicDigest}\n` : ''}
    ${subjectSyllabus ? `\nSYLLABUS / SCOPE:\n${String(subjectSyllabus).slice(0, 4000)}\n` : ''}`
}

// Grade answers client-side-style: pure, given the generated questions and the
// learner's selected option indices. `answers[i]` is the chosen index, or null
// when skipped (a skip is neither credited nor penalized).
export function gradeDiagnostic(questions = [], answers = []) {
  const graded = []
  let correctCount = 0
  let answeredCount = 0

  questions.forEach((q, i) => {
    const chosen = answers?.[i]
    if (chosen === null || chosen === undefined) return
    answeredCount += 1
    const correct = Number(chosen) === Number(q?.correct_index)
    if (correct) correctCount += 1
    graded.push({
      concept: String(q?.concept || q?.topic_title || '').trim(),
      topicTitle: String(q?.topic_title || '').trim(),
      correct
    })
  })

  return {
    graded: graded.filter((g) => g.concept),
    answeredCount,
    correctCount,
    score: answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100)
  }
}

// Topics the learner answered every question on correctly — surfaced as ADVISORY
// "you may be able to move fast here" suggestions. Nothing is auto-marked
// mastered: a 1–2 question sample is not evidence enough to skip a topic, and
// silently changing statuses would be a destructive surprise.
export function suggestSkippableTopics(graded = []) {
  const byTopic = new Map()
  for (const g of graded) {
    if (!g.topicTitle) continue
    const entry = byTopic.get(g.topicTitle) || { total: 0, correct: 0 }
    entry.total += 1
    if (g.correct) entry.correct += 1
    byTopic.set(g.topicTitle, entry)
  }

  return [...byTopic.entries()]
    .filter(([, e]) => e.total > 0 && e.correct === e.total)
    .map(([topicTitle, e]) => ({ topicTitle, correct: e.correct, total: e.total }))
}
