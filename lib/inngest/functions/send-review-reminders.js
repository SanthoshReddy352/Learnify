import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/lib/inngest/client'
import { collectDueByUser, shouldSendReminder, buildReminderDigest } from '@/lib/reminders/schedule'
import { streakInZone } from '@/lib/gamification/goals'
import {
  remindersEnabled,
  fetchReminderCandidates,
  fetchSubscriptionsFor,
  deleteSubscriptions,
  markPushSucceeded,
  recordReminderSent
} from '@/lib/reminders/store'
import {
  sendWebPush,
  sendReminderEmail,
  webPushConfigured,
  emailConfigured
} from '@/lib/reminders/deliver'
import { reportError } from '@/lib/observability/report'

// Due-review reminder sender (Plan P11.1).
//
// SM-2 schedules reviews but nothing pulled the learner back on the day one came
// due, which made the whole review engine inert for anyone who did not
// spontaneously open the app. This closes that loop.
//
// Runs hourly in UTC and resolves each learner's OWN local hour, so one job
// serves every timezone without ever firing in the middle of someone's night.
// All judgement (should this person be reminded, and what does it say?) lives in
// the pure lib/reminders/schedule.js; this function is I/O and bookkeeping.

// Chunk size for the bulk due-review query. Keeps a single `in (...)` filter
// from growing unbounded as the user base does.
const USER_CHUNK = 200
// How far back to read study logs when computing the streak shown in the copy.
const STREAK_LOOKBACK_DAYS = 45

const chunk = (items, size) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export const sendReviewRemindersJob = inngest.createFunction(
  { id: 'send-review-reminders', name: 'Send due-review reminders' },
  // Hourly on the hour, UTC. The per-learner hour is resolved from their own
  // timezone inside the run, so this single schedule covers every zone.
  { cron: '0 * * * *' },
  async () => {
    try {
      return await runReviewReminders()
    } catch (error) {
      // A cron with nobody watching it is the classic silent failure: reminders
      // would simply stop and no one would notice for weeks. Awaited so the
      // report flushes before the invocation ends.
      await reportError(error, { scope: 'cron:send-review-reminders' })
      throw error
    }
  }
)

/**
 * The whole run, extracted so the manual trigger route can call it directly
 * (useful for the P14 verification pass without waiting for the top of an hour).
 * Returns a summary rather than throwing on partial failure: one learner's dead
 * push endpoint must not abort everyone else's reminder.
 */
export async function runReviewReminders({ now = new Date() } = {}) {
  const summary = { checked: 0, sent: 0, skipped: {}, pushed: 0, emailed: 0, pruned: 0 }
  const skip = (reason) => {
    summary.skipped[reason] = (summary.skipped[reason] || 0) + 1
  }

  if (!remindersEnabled()) {
    return { ...summary, disabled: 'REVIEW_REMINDERS is not true' }
  }
  if (!webPushConfigured() && !emailConfigured()) {
    // Nothing could be delivered, so do not read the database at all — and say
    // why, because "reminders silently do nothing" is the hardest failure to
    // debug (the same trap the P14 runbook warns about for flags).
    return { ...summary, disabled: 'no delivery channel configured (VAPID keys or email sender)' }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { ...summary, disabled: 'SUPABASE_SERVICE_ROLE_KEY is required to send reminders' }
  }

  const candidates = await fetchReminderCandidates(admin)
  summary.checked = candidates.length
  if (candidates.length === 0) return summary

  // Two bulk reads for the whole cohort instead of two per learner.
  const userIds = candidates.map((c) => c.userId)
  const dueByUser = new Map()
  for (const ids of chunk(userIds, USER_CHUNK)) {
    const { data, error } = await admin
      .from('subjects')
      .select('id, title, user_id, topics (id, title, next_review_at, status)')
      .in('user_id', ids)
    if (error) {
      console.warn(`[Reminders] due-review read failed: ${error.message}`)
      continue
    }
    for (const [userId, topics] of collectDueByUser(data || [], now)) {
      dueByUser.set(userId, topics)
    }
  }

  const logsByUser = new Map()
  const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 86400000).toISOString()
  for (const ids of chunk(userIds, USER_CHUNK)) {
    const { data, error } = await admin
      .from('study_logs')
      .select('user_id, created_at')
      .in('user_id', ids)
      .gte('created_at', since)
    if (error) {
      // The streak is decoration on the reminder; losing it is not worth
      // skipping the send.
      console.warn(`[Reminders] streak read failed: ${error.message}`)
      continue
    }
    for (const row of data || []) {
      if (!logsByUser.has(row.user_id)) logsByUser.set(row.user_id, [])
      logsByUser.get(row.user_id).push(row)
    }
  }

  const decided = candidates
    .map((candidate) => ({
      ...candidate,
      dueTopics: dueByUser.get(candidate.userId) || [],
      decision: shouldSendReminder({
        prefs: candidate.prefs,
        now,
        dueCount: (dueByUser.get(candidate.userId) || []).length
      })
    }))
    .filter((candidate) => {
      if (candidate.decision.send) return true
      skip(candidate.decision.reason)
      return false
    })

  if (decided.length === 0) return summary

  const subscriptions = await fetchSubscriptionsFor(admin, decided.map((c) => c.userId))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
  const goneSubscriptionIds = []
  const succeededSubscriptionIds = []

  for (const candidate of decided) {
    const { userId, prefs, dueTopics, decision } = candidate
    const digest = buildReminderDigest({
      dueTopics,
      streakDays: streakInZone(logsByUser.get(userId) || [], { now, timeZone: prefs.timezone }),
      appUrl
    })

    let delivered = false

    if (prefs.push_enabled && webPushConfigured()) {
      for (const subscription of subscriptions.get(userId) || []) {
        const result = await sendWebPush(subscription, digest)
        if (result.ok) {
          delivered = true
          summary.pushed += 1
          succeededSubscriptionIds.push(subscription.id)
        } else if (result.gone) {
          goneSubscriptionIds.push(subscription.id)
        } else {
          console.warn(`[Reminders] push failed for ${userId}: ${result.error}`)
        }
      }
    }

    if (prefs.email_enabled && emailConfigured()) {
      const email = await resolveEmail(admin, userId)
      if (email) {
        const result = await sendReminderEmail({
          to: email,
          subject: digest.email.subject,
          text: digest.email.text
        })
        if (result.ok) {
          delivered = true
          summary.emailed += 1
        } else {
          console.warn(`[Reminders] email failed for ${userId}: ${result.error}`)
        }
      }
    }

    if (delivered) {
      summary.sent += 1
      // Only record a send that actually reached a channel. Marking the day as
      // done after a total failure would suppress the retry on the next hourly
      // run for no reason.
      await recordReminderSent(admin, userId, decision.localDate)
    } else {
      skip('delivery_failed')
    }
  }

  await deleteSubscriptions(admin, goneSubscriptionIds)
  await markPushSucceeded(admin, succeededSubscriptionIds)
  summary.pruned = goneSubscriptionIds.length

  return summary
}

// The learner's email lives in auth.users, which only the service role can read.
async function resolveEmail(admin, userId) {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error) throw error
    return data?.user?.email || null
  } catch (error) {
    console.warn(`[Reminders] email lookup failed for ${userId}: ${error?.message || error}`)
    return null
  }
}
