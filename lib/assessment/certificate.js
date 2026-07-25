// Verifiable certificates (Plan P9.5).
//
// Deliberately the LAST thing built, because a certificate is a claim made to
// someone who was not there. Everything it asserts has to be something the
// system actually observed:
//
//   - the score came from a server-graded exam (P9.4), never client-reported;
//   - in a self-paced subject, where there is no teacher in the loop, a pass is
//     not enough — the learner also had to explain their answers aloud and pass
//     the viva (P10.5). A certificate issued on an unproctored multiple-choice
//     score alone would be worth exactly nothing, and issuing it anyway would
//     make every other certificate worth less too;
//   - in a classroom subject the teacher IS the check, so a pass suffices —
//     unless they invalidated the attempt on review (P10.4).
//
// Pure module: no DB, no I/O, fully unit-testable.

export const CERTIFICATE_MODES = ['classroom', 'self_paced']

// Crockford base32: no I, L, O or U, so a serial read off a screen or a printed
// page cannot be mistyped into a different valid-looking one.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const GROUPS = 3
const GROUP_LEN = 4

/**
 * Format random bytes as a human-transcribable serial: LRN-XXXX-XXXX-XXXX.
 * Pure — the caller supplies the randomness, so tests are deterministic.
 */
export function formatSerial(bytes) {
  const need = GROUPS * GROUP_LEN
  const src = Array.from(bytes || [])
  if (src.length < need) throw new Error(`formatSerial needs at least ${need} bytes`)
  const chars = src.slice(0, need).map((b) => ALPHABET[b % ALPHABET.length])
  const groups = []
  for (let i = 0; i < GROUPS; i += 1) {
    groups.push(chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(''))
  }
  return `LRN-${groups.join('-')}`
}

/**
 * Canonicalize a serial someone typed in. Verification is worthless if it only
 * works on copy-paste, so this folds the characters Crockford deliberately
 * excludes back onto the ones they are mistaken for.
 */
export function normalizeSerial(input) {
  const cleaned = String(input || '')
    .toUpperCase()
    .replace(/^LRN[-\s]*/, '')
    .replace(/[O]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[U]/g, 'V')
    .replace(/[^0-9A-Z]/g, '')
  if (cleaned.length !== GROUPS * GROUP_LEN) return null
  if (![...cleaned].every((c) => ALPHABET.includes(c))) return null
  const groups = []
  for (let i = 0; i < GROUPS; i += 1) {
    groups.push(cleaned.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN))
  }
  return `LRN-${groups.join('-')}`
}

/**
 * Can this attempt carry a certificate?
 * Returns { eligible, reason } — `reason` is learner-facing, so it says what to
 * do next rather than just refusing.
 */
export function certificateEligibility(attempt, { review = null } = {}) {
  if (!attempt) return { eligible: false, reason: 'That attempt could not be found.' }
  if (attempt.kind !== 'exam') {
    return { eligible: false, reason: 'Only a full subject exam can earn a certificate.' }
  }
  if (attempt.status !== 'graded') {
    return { eligible: false, reason: 'That attempt has not been graded yet.' }
  }
  if (attempt.passed !== true) {
    return { eligible: false, reason: 'This attempt did not reach the pass mark. You can sit the exam again.' }
  }

  const mode = attempt.mode === 'classroom' ? 'classroom' : 'self_paced'

  if (mode === 'self_paced' && attempt.viva_passed !== true) {
    return {
      eligible: false,
      reason:
        'One step left: explain a couple of your answers in your own words. Self-paced certificates need the spoken check, because nobody was invigilating the exam.'
    }
  }

  // A teacher who invalidated the attempt has overridden the score.
  if (review?.decision === 'invalidated') {
    return { eligible: false, reason: 'Your teacher marked this attempt as invalid.' }
  }

  return { eligible: true, mode }
}

/**
 * Freeze what the certificate asserts at issue time. A subject renamed or a
 * profile edited two years later must not silently rewrite an issued
 * certificate — so the display values are copied, not joined at read time.
 */
export function buildCertificateSnapshot({
  learnerName,
  subjectTitle,
  score,
  mode,
  concepts = [],
  vivaPassed = false,
  issuedAt = new Date()
}) {
  return {
    learner_name: String(learnerName || 'Learner').slice(0, 120),
    subject_title: String(subjectTitle || 'Subject').slice(0, 200),
    score: Math.round(Number(score) || 0),
    mode,
    // What was actually assessed, so the certificate says something more useful
    // than a number. Capped — a certificate is not a transcript.
    concepts: concepts.filter(Boolean).map((c) => String(c).slice(0, 80)).slice(0, 12),
    viva_passed: Boolean(vivaPassed),
    issued_at: (issuedAt instanceof Date ? issuedAt : new Date(issuedAt)).toISOString()
  }
}

/** Concepts the attempt actually covered, deduped, for the snapshot. */
export function conceptsFromAttempt(attempt) {
  const items = Array.isArray(attempt?.items) ? attempt.items : []
  const seen = new Set()
  const out = []
  for (const item of items) {
    const c = item?.concept
    if (!c || seen.has(c)) continue
    seen.add(c)
    out.push(c)
  }
  return out
}
