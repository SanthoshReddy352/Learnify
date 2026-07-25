// Teacher review queue for exam integrity (Plan P10.4).
//
// Flags are ADVISORY. This module orders a teacher's attention and nothing else:
// no automatic penalty, no automatic invalidation, no "cheating" verdict. Every
// signal here has an innocent explanation, so a human decides and the decision is
// recorded in `attempt_reviews`.
//
// Alias-free apart from the sibling integrity module, so the ranking logic is
// unit-testable under `node --test`.

import { summarizeFlags } from './integrity.js'

// Human-readable, deliberately non-accusatory descriptions. The wording is part
// of the design: a teacher reading "answer sequence matches another attempt"
// makes a judgement, one reading "CHEATING DETECTED" just believes the machine.
export const FLAG_LABELS = {
  impossibly_fast: 'Answered faster than the questions can be read',
  uniform_timing: 'Unusually even pacing across answers',
  same_position: 'Nearly every answer in the same option position',
  shared_answers: 'Answer sequence closely matches another attempt',
  left_exam_window: 'Left the exam window during the attempt'
}

export function describeFlag(flag) {
  const label = FLAG_LABELS[flag?.kind] || flag?.kind || 'Unknown signal'
  return flag?.detail ? `${label} (${flag.detail})` : label
}

// Order attempts by how much they merit a look. Attempts with no flags are kept
// (a teacher should still see normal results) but sort last.
export function rankAttemptsForReview(attempts = []) {
  return (attempts || [])
    .map((attempt) => {
      const flags = Array.isArray(attempt?.flags) ? attempt.flags : []
      const summary = summarizeFlags(flags)
      return {
        ...attempt,
        flags,
        flagDescriptions: flags.map(describeFlag),
        severity: summary.severity,
        level: summary.level
      }
    })
    .sort(
      (a, b) =>
        b.severity - a.severity ||
        new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0)
    )
}

// Fetch graded exam attempts for a classroom's courses. `reader` must be the
// service-role client: the teacher RLS policy on assessment_attempts covers the
// direct case, but the student names come from `profiles` and the attempts span
// several students, so this read is done privileged and scoped explicitly to the
// classroom's own subject + student ids.
export async function fetchClassroomAttempts(reader, { subjectIds = [], studentIds = [], limit = 200 }) {
  if (!reader || subjectIds.length === 0 || studentIds.length === 0) return []

  const { data, error } = await reader
    .from('assessment_attempts')
    .select('id, user_id, subject_id, kind, status, score, passed, flags, integrity_events, mode, submitted_at')
    .in('subject_id', subjectIds)
    .in('user_id', studentIds)
    .eq('kind', 'exam')
    .eq('status', 'graded')
    .order('submitted_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data || []
}
