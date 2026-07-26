// Database access for teacher-authored assessments.
//
// SEPARATE FROM lib/assessment/authoring.js ON PURPOSE: that module is pure
// rules (unit-tested, no I/O); this one is the I/O. Routes should read like
// auth -> store call -> rules call -> response.
//
// THE ANSWER-KEY RULE THAT SHAPES THIS WHOLE FILE:
//
// assessment_items.correct_index / answer_key / explanation have their SELECT
// privilege revoked from `anon` and `authenticated` at the column level. That
// is the last line of defence behind RLS, and it must not be weakened to make
// authoring convenient.
//
// Teachers legitimately need to see answers — they are writing the test. So
// every read that includes an answer column goes through the SERVICE ROLE
// client, and is gated by an explicit ownership check performed FIRST via the
// caller's own client (assertTeacherOwnsAssessment). Order matters: the service
// role bypasses RLS entirely, so the permission check must happen before it is
// used, never as a filter inside the privileged query.

import { ITEM_PUBLIC_COLUMNS } from './items.js'

// Answer columns included. Only ever selected with the service role, and only
// after the caller has been confirmed to teach the classroom.
const ITEM_AUTHORING_COLUMNS = `${ITEM_PUBLIC_COLUMNS}, correct_index, answer_key, explanation`

const ASSESSMENT_COLUMNS = `
  id, classroom_id, subject_id, created_by, title, instructions, status,
  opens_at, closes_at, duration_minutes, pass_score, max_attempts,
  shuffle_questions, shuffle_options, require_fullscreen,
  published_at, created_at, updated_at
`

/**
 * Confirm the caller teaches the classroom this assessment belongs to.
 *
 * Uses the CALLER'S client so RLS does the deciding — a teacher who does not
 * teach this classroom simply cannot see the row. Returns the assessment so
 * callers do not re-fetch it.
 *
 * Every privileged (service-role) operation in this file must call this first.
 */
export async function assertTeacherOwnsAssessment(supabase, assessmentId) {
  const { data, error } = await supabase
    .from('assessments')
    .select(ASSESSMENT_COLUMNS)
    .eq('id', assessmentId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Assessment not found')
  return data
}

export async function listAssessments(supabase, { classroomId }) {
  const { data, error } = await supabase
    .from('assessments')
    .select(ASSESSMENT_COLUMNS)
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function createAssessment(supabase, { userId, classroomId, subjectId, settings }) {
  const { data, error } = await supabase
    .from('assessments')
    .insert({
      classroom_id: classroomId,
      subject_id: subjectId,
      created_by: userId,
      ...settingsToRow(settings)
    })
    .select(ASSESSMENT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data
}

/** Map the API's camelCase settings onto database columns. */
export function settingsToRow(settings = {}) {
  const row = {}
  const set = (column, value) => {
    if (value !== undefined) row[column] = value
  }

  set('title', settings.title)
  set('instructions', settings.instructions)
  set('opens_at', settings.opensAt)
  set('closes_at', settings.closesAt)
  set('duration_minutes', settings.durationMinutes)
  set('pass_score', settings.passScore)
  set('max_attempts', settings.maxAttempts)
  set('shuffle_questions', settings.shuffleQuestions)
  set('shuffle_options', settings.shuffleOptions)
  set('require_fullscreen', settings.requireFullscreen)

  return row
}

export async function updateAssessment(supabase, assessmentId, patch) {
  const { data, error } = await supabase
    .from('assessments')
    .update(patch)
    .eq('id', assessmentId)
    .select(ASSESSMENT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteAssessment(supabase, assessmentId) {
  const { error } = await supabase.from('assessments').delete().eq('id', assessmentId)
  if (error) throw new Error(error.message)
}

/**
 * The paper's questions, with each pinned question's item inlined INCLUDING its
 * answer — this is the teacher's editing view.
 *
 * `admin` must be the service-role client and the caller must already have been
 * authorized; see the file header.
 */
export async function loadQuestionsForTeacher(admin, assessmentId) {
  const { data: questions, error } = await admin
    .from('assessment_questions')
    .select('id, assessment_id, position, source, item_id, concept_key, difficulty_min, difficulty_max, draw_count, points')
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: true })

  if (error) throw new Error(error.message)

  const itemIds = (questions || []).map((q) => q.item_id).filter(Boolean)
  if (itemIds.length === 0) return questions || []

  const { data: items, error: itemsError } = await admin
    .from('assessment_items')
    .select(ITEM_AUTHORING_COLUMNS)
    .in('id', itemIds)

  if (itemsError) throw new Error(itemsError.message)

  const byId = new Map((items || []).map((item) => [item.id, item]))
  return (questions || []).map((q) => ({ ...q, item: q.item_id ? byId.get(q.item_id) || null : null }))
}

/**
 * Every gradable item in the subject's bank, for the "pick from bank" picker.
 * Teacher view, so answers are included.
 */
export async function loadBankForTeacher(admin, subjectId) {
  const { data, error } = await admin
    .from('assessment_items')
    .select(ITEM_AUTHORING_COLUMNS)
    .eq('subject_id', subjectId)
    .order('concept', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * concept_key -> count of AUTO-GRADABLE items, for blueprint feasibility.
 *
 * Counting all items would be wrong: open "why" items are never served in an
 * exam, so a concept with ten of them and no MCQs would validate as fillable
 * and then serve an empty blueprint.
 */
export async function loadBankCounts(admin, subjectId) {
  const { data, error } = await admin
    .from('assessment_items')
    .select('concept_key, kind')
    .eq('subject_id', subjectId)

  if (error) throw new Error(error.message)

  const counts = new Map()
  for (const row of data || []) {
    if (row.kind !== 'mcq' && row.kind !== 'worked_example') continue
    counts.set(row.concept_key, (counts.get(row.concept_key) || 0) + 1)
  }
  return counts
}

/** Append questions to a paper, continuing the existing position sequence. */
export async function addQuestions(admin, assessmentId, questions = []) {
  if (questions.length === 0) return []

  const { data: last } = await admin
    .from('assessment_questions')
    .select('position')
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  let next = Number(last?.position ?? -1) + 1

  const rows = questions.map((q) => {
    const base = {
      assessment_id: assessmentId,
      position: q.position ?? next++,
      points: q.points ?? 1,
      source: q.source
    }
    return q.source === 'item'
      ? { ...base, item_id: q.itemId }
      : {
          ...base,
          concept_key: q.conceptKey,
          draw_count: q.drawCount,
          difficulty_min: q.difficultyMin ?? 1,
          difficulty_max: q.difficultyMax ?? 5
        }
  })

  const { data, error } = await admin.from('assessment_questions').insert(rows).select('id')
  if (error) throw new Error(error.message)
  return data || []
}

export async function removeQuestion(admin, { assessmentId, questionId }) {
  const { error } = await admin
    .from('assessment_questions')
    .delete()
    .eq('id', questionId)
    // Scoped to the assessment the caller was authorized for — the service role
    // ignores RLS, so the scope has to be in the query itself.
    .eq('assessment_id', assessmentId)

  if (error) throw new Error(error.message)
}

/** Persist a question a teacher typed by hand as a normal bank item. */
export async function createManualItem(admin, { subjectId, item }) {
  const { data, error } = await admin
    .from('assessment_items')
    .insert({
      subject_id: subjectId,
      topic_id: item.topicId ?? null,
      concept: item.concept,
      concept_key: item.conceptKey,
      kind: 'mcq',
      difficulty: item.difficulty ?? 3,
      stem: item.stem,
      options: item.options,
      correct_index: item.correctIndex,
      explanation: item.explanation || ''
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data
}

/** Replace the assignment allow-list. No rows means the whole class. */
export async function setAssignments(admin, { assessmentId, memberIds = [] }) {
  const { error: clearError } = await admin
    .from('assessment_assignments')
    .delete()
    .eq('assessment_id', assessmentId)
  if (clearError) throw new Error(clearError.message)

  if (memberIds.length === 0) return

  const { error } = await admin.from('assessment_assignments').insert(
    memberIds.map((id) => ({ assessment_id: assessmentId, classroom_member_id: id }))
  )
  if (error) throw new Error(error.message)
}

export async function loadAssignments(admin, assessmentId) {
  const { data, error } = await admin
    .from('assessment_assignments')
    .select('classroom_member_id')
    .eq('assessment_id', assessmentId)

  if (error) throw new Error(error.message)
  return (data || []).map((row) => row.classroom_member_id)
}

/** Attempts for one paper, for the teacher's results roster. */
export async function loadAttempts(admin, assessmentId) {
  const { data, error } = await admin
    .from('assessment_attempts')
    .select('id, user_id, status, score, passed, flags, started_at, submitted_at')
    .eq('assessment_id', assessmentId)
    .order('submitted_at', { ascending: false, nullsFirst: false })

  if (error) throw new Error(error.message)
  return data || []
}

/** How many attempts this user has already made on this paper. */
export async function countUserAttempts(admin, { assessmentId, userId }) {
  const { count, error } = await admin
    .from('assessment_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  return count || 0
}
