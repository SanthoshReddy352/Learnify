// Review-reminder scheduling + digest copy (Plan P11.1).
//
// Everything in this file is pure so the decision "does this learner get a
// reminder right now, and what does it say?" is unit-testable without a clock,
// a database, or a push service. The sender (lib/inngest/functions/
// send-review-reminders.js) does I/O only; all judgement lives here.
//
// Alias-free imports (see lib/memory/concept-state.js) so `node --test` can
// load this module directly.

import { zonedParts } from '../time/zone.js'

export const DEFAULT_PREFERENCES = {
  review_reminders: true,
  push_enabled: true,
  email_enabled: false,
  reminder_hour: 18,
  timezone: 'UTC',
  weekly_review_goal: 15,
  last_reminder_on: null
}

// How many hours past the chosen hour a reminder may still go out. The sender
// runs hourly, so normally it fires in the requested hour; this only covers a
// missed or delayed run. It is deliberately short and never crosses into the
// next local day — a reminder arriving at 3am is worse than none at all.
export const SEND_WINDOW_HOURS = 3

export function normalizePreferences(row) {
  const prefs = { ...DEFAULT_PREFERENCES, ...(row || {}) }
  const hour = Number(prefs.reminder_hour)
  prefs.reminder_hour = Number.isInteger(hour) && hour >= 0 && hour <= 23
    ? hour
    : DEFAULT_PREFERENCES.reminder_hour
  const goal = Number(prefs.weekly_review_goal)
  prefs.weekly_review_goal = Number.isInteger(goal) && goal >= 1 && goal <= 500
    ? goal
    : DEFAULT_PREFERENCES.weekly_review_goal
  prefs.timezone = typeof prefs.timezone === 'string' && prefs.timezone.trim()
    ? prefs.timezone.trim()
    : 'UTC'
  return prefs
}

/**
 * The learner's own local hour and calendar date at instant `now`.
 *
 * An unknown or malformed IANA zone falls back to UTC rather than throwing:
 * a bad timezone string should cost someone a reminder at the wrong hour, not
 * break the whole nightly run for every other user.
 */
export function localPartsFor(now = new Date(), timeZone = 'UTC') {
  return zonedParts(now, timeZone)
}

/**
 * Decide whether to send this learner a due-review reminder right now.
 * Returns { send, reason } — `reason` names the gate that stopped it, which is
 * what the sender logs, so a "why did I get no reminder?" report is answerable.
 */
export function shouldSendReminder({ prefs, now = new Date(), dueCount = 0 } = {}) {
  const p = normalizePreferences(prefs)

  if (!p.review_reminders) return { send: false, reason: 'reminders_off' }
  if (!p.push_enabled && !p.email_enabled) return { send: false, reason: 'no_channel' }
  // Never send an empty reminder. "You have nothing due" is not worth a
  // notification, and sending one teaches people to ignore the channel.
  if (dueCount <= 0) return { send: false, reason: 'nothing_due' }

  const { hour, dateKey } = localPartsFor(now, p.timezone)

  if (p.last_reminder_on && String(p.last_reminder_on).slice(0, 10) === dateKey) {
    return { send: false, reason: 'already_sent_today' }
  }
  if (hour < p.reminder_hour) return { send: false, reason: 'too_early' }
  if (hour >= p.reminder_hour + SEND_WINDOW_HOURS) {
    return { send: false, reason: 'window_passed' }
  }

  return { send: true, reason: 'due', localDate: dateKey }
}

// Statuses that carry an SM-2 schedule. Mirrors lib/analytics.js
// getAllDueReviews — the widget and the reminder must agree on what "due" means,
// or a learner gets pinged about reviews the dashboard does not show.
const REVIEWABLE_STATUSES = new Set(['reviewing', 'mastered'])

/**
 * Group due topics by learner from the sender's one bulk query.
 *
 * Shape in: rows of `subjects` with their `topics` embedded (that is one round
 * trip for every candidate learner instead of one per learner). Shape out:
 * Map(userId → due topics, most overdue first).
 */
export function collectDueByUser(subjectRows = [], now = new Date()) {
  const cutoff = now.getTime()
  const byUser = new Map()

  for (const subject of subjectRows) {
    const userId = subject?.user_id
    if (!userId) continue
    for (const topic of subject.topics || []) {
      if (!REVIEWABLE_STATUSES.has(topic?.status)) continue
      if (!topic?.next_review_at) continue
      const dueAt = new Date(topic.next_review_at).getTime()
      if (!Number.isFinite(dueAt) || dueAt > cutoff) continue
      if (!byUser.has(userId)) byUser.set(userId, [])
      byUser.get(userId).push({
        id: topic.id,
        title: topic.title,
        next_review_at: topic.next_review_at,
        subjectId: subject.id,
        subjectTitle: subject.title
      })
    }
  }

  for (const topics of byUser.values()) {
    topics.sort((a, b) => new Date(a.next_review_at) - new Date(b.next_review_at))
  }
  return byUser
}

// How many topic titles the notification body names before summarizing. Push
// bodies get truncated by the OS, and a wall of titles is not more actionable
// than two plus a count.
const TITLES_IN_BODY = 2

/**
 * Notification + email copy for a set of due reviews.
 *
 * The tone is deliberately factual: it states what is due and how long it will
 * take. No streak-loss threats, no guilt, no "don't break your chain" — the
 * point is to make returning easy, not to punish absence. A unit test asserts
 * the copy carries none of that language.
 */
export function buildReminderDigest({ dueTopics = [], streakDays = 0, appUrl = '' } = {}) {
  const count = dueTopics.length
  const titles = dueTopics
    .map((t) => (t?.title || '').trim())
    .filter(Boolean)

  const title = count === 1
    ? '1 review is ready'
    : `${count} reviews are ready`

  const named = titles.slice(0, TITLES_IN_BODY).join(', ')
  const remaining = count - Math.min(titles.length, TITLES_IN_BODY)
  let body = named
    ? (remaining > 0 ? `${named} and ${remaining} more.` : `${named}.`)
    : 'Your scheduled reviews are ready.'

  // Reviews are short by design; saying so removes the main reason people put
  // them off. ~2 minutes per topic matches a recall-and-rate pass.
  body += ` About ${Math.max(2, count * 2)} min.`
  if (streakDays >= 2) body += ` You're on a ${streakDays}-day streak.`

  const path = '/dashboard'
  const url = appUrl ? `${appUrl.replace(/\/+$/, '')}${path}` : path

  const lines = titles.map((t) => `• ${t}`).join('\n')
  return {
    title,
    body,
    url,
    // One tag for all review reminders, so a new one replaces the last on the
    // lock screen instead of stacking up.
    tag: 'learnify-reviews',
    email: {
      subject: `Learnify: ${title}`,
      text: [
        title,
        '',
        lines || 'Your scheduled reviews are ready.',
        '',
        `Start reviewing: ${url}`,
        '',
        'You can change the time of these reminders, or turn them off, in Settings.'
      ].join('\n')
    }
  }
}
