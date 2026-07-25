// Pure prompt builder for project-based learning tracks (Plan P7.4).
// Alias-free so it is unit-testable under `node --test`.

export function buildProjectPrompt({
  subjectTitle,
  subjectDescription = '',
  difficulty = 3,
  personalizationContext = ''
}) {
  return `Design ONE hands-on PROJECT a learner builds to apply the subject "${subjectTitle}".

    Return:
    - title: a short, motivating project name.
    - summary: 1–2 sentences on what they will build and what they will learn.
    - milestones: 3–6 ordered milestones. Each milestone has a title, a description of what to build/do, and 2–4 concrete checkpoints (verifiable "done when…" steps).

    RULES:
    - Practical and achievable, not busywork. Something a learner can actually build.
    - Scope to difficulty ${difficulty}/5 (simpler at low difficulty).
    - Milestones build on each other in a logical order.
    ${subjectDescription ? `\nSubject context: ${subjectDescription}` : ''}
    ${personalizationContext ? `\n${personalizationContext}` : ''}`
}
