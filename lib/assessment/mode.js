// Which integrity regime an attempt was sat under (Plan P10).
//
// Owner constraint: a classroom exam has a teacher who can review flags; a
// self-paced subject has nobody, so its integrity must stand on its own (the
// P10.5 viva). Everything downstream branches on this, which is exactly why it
// is derived SERVER-SIDE from the data — never accepted from the client, who
// would otherwise pick the cheaper regime.

export const CLASSROOM = 'classroom'
export const SELF_PACED = 'self_paced'

// A subject taught by any classroom course is in classroom mode. `reader` should
// be the service-role client: a student cannot necessarily see the course row
// that makes their own attempt classroom-mode, and mis-reading that as
// self-paced would route them to the wrong integrity regime.
export async function resolveAttemptMode(reader, { subjectId }) {
  if (!reader || !subjectId) return SELF_PACED
  try {
    const { data, error } = await reader
      .from('classroom_courses')
      .select('id')
      .eq('subject_id', subjectId)
      .limit(1)
    if (error) throw error
    return data && data.length > 0 ? CLASSROOM : SELF_PACED
  } catch (error) {
    // Fail toward the STRICTER regime: self-paced requires the learner to pass a
    // viva, so an error here can never accidentally hand out an easier pass.
    console.warn(`[Integrity] Mode lookup failed, defaulting to self-paced: ${String(error?.message || error).slice(0, 200)}`)
    return SELF_PACED
  }
}

// Does this attempt need a viva before anything may be certified? Self-paced
// passes do; classroom passes are reviewed by a human instead.
export function vivaRequired({ mode, passed }) {
  return mode === SELF_PACED && passed === true
}
