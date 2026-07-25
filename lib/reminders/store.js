// Reminder persistence helpers (Plan P11.1).
//
// Same posture as the P8 memory helpers: `notification_preferences` and
// `push_subscriptions` do not exist until the P14 migration, so every read
// degrades to "defaults / no devices" and every write is best-effort. A learner
// must never see an error page because reminders are not provisioned yet.

import { DEFAULT_PREFERENCES, normalizePreferences } from './schedule.js'

export function remindersEnabled() {
  return process.env.REVIEW_REMINDERS === 'true'
}

// Columns a learner is allowed to change. `last_reminder_on` is deliberately
// absent: it is the once-a-day guard, and a client that could reset it could
// make the sender ping itself repeatedly.
export const EDITABLE_PREFERENCE_COLUMNS = [
  'review_reminders',
  'push_enabled',
  'email_enabled',
  'reminder_hour',
  'timezone',
  'weekly_review_goal'
]

const PREFERENCE_COLUMNS = [...EDITABLE_PREFERENCE_COLUMNS, 'last_reminder_on'].join(', ')

function warn(scope, error) {
  console.warn(`[Reminders] ${scope} skipped: ${String(error?.message || error).slice(0, 200)}`)
}

/**
 * One learner's preferences, with defaults filled in. Returns the defaults (and
 * `exists: false`) when the row or the whole table is missing, so the settings
 * UI can render sensible values before anyone has saved anything.
 */
export async function fetchPreferences(reader, userId) {
  if (!reader || !userId) return { ...DEFAULT_PREFERENCES, exists: false }
  try {
    const { data, error } = await reader
      .from('notification_preferences')
      .select(PREFERENCE_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return { ...normalizePreferences(data), exists: !!data }
  } catch (error) {
    warn('preferences read', error)
    return { ...DEFAULT_PREFERENCES, exists: false }
  }
}

/** Upsert a preferences patch. Returns { ok, error }. */
export async function savePreferences(client, userId, patch) {
  if (!client || !userId) return { ok: false, error: 'no_client' }
  const row = { user_id: userId }
  for (const column of EDITABLE_PREFERENCE_COLUMNS) {
    if (patch[column] !== undefined) row[column] = patch[column]
  }
  try {
    const { error } = await client
      .from('notification_preferences')
      .upsert(row, { onConflict: 'user_id' })
    if (error) throw error
    return { ok: true }
  } catch (error) {
    warn('preferences write', error)
    return { ok: false, error: String(error?.message || error) }
  }
}

/**
 * Preference rows for every learner who has opted into a channel we can
 * actually deliver on. Being subscribed to push IS the opt-in (the browser
 * permission prompt), so a learner with a subscription but no preferences row
 * is included and treated with the defaults.
 */
export async function fetchReminderCandidates(admin) {
  if (!admin) return []
  const ids = new Set()

  try {
    const { data, error } = await admin.from('push_subscriptions').select('user_id')
    if (error) throw error
    for (const row of data || []) ids.add(row.user_id)
  } catch (error) {
    warn('subscription scan', error)
  }

  let rows = []
  try {
    const { data, error } = await admin
      .from('notification_preferences')
      .select(`user_id, ${PREFERENCE_COLUMNS}`)
    if (error) throw error
    rows = data || []
  } catch (error) {
    warn('preferences scan', error)
  }

  const byId = new Map()
  for (const row of rows) {
    // Email opt-in is a second way in, even with no browser subscribed.
    if (row.email_enabled) ids.add(row.user_id)
    byId.set(row.user_id, row)
  }

  return [...ids].map((userId) => ({
    userId,
    prefs: normalizePreferences(byId.get(userId))
  }))
}

/** Web Push endpoints for a set of learners, grouped by user id. */
export async function fetchSubscriptionsFor(admin, userIds = []) {
  const grouped = new Map()
  if (!admin || userIds.length === 0) return grouped
  try {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, platform')
      .in('user_id', userIds)
    if (error) throw error
    for (const row of data || []) {
      if (!grouped.has(row.user_id)) grouped.set(row.user_id, [])
      grouped.get(row.user_id).push(row)
    }
  } catch (error) {
    warn('subscription read', error)
  }
  return grouped
}

/** Drop endpoints the push service reported as permanently gone. */
export async function deleteSubscriptions(admin, ids = []) {
  if (!admin || ids.length === 0) return
  try {
    const { error } = await admin.from('push_subscriptions').delete().in('id', ids)
    if (error) throw error
  } catch (error) {
    warn('subscription prune', error)
  }
}

export async function markPushSucceeded(admin, ids = []) {
  if (!admin || ids.length === 0) return
  try {
    const { error } = await admin
      .from('push_subscriptions')
      .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
      .in('id', ids)
    if (error) throw error
  } catch (error) {
    warn('subscription touch', error)
  }
}

/**
 * Record that this learner has had their reminder for their local day. Written
 * before nothing else matters: if this fails the next hourly run would send a
 * duplicate, so the sender treats a failure here as a reason to log loudly.
 */
export async function recordReminderSent(admin, userId, localDate) {
  if (!admin || !userId || !localDate) return { ok: false }
  try {
    const { error } = await admin
      .from('notification_preferences')
      .upsert({ user_id: userId, last_reminder_on: localDate }, { onConflict: 'user_id' })
    if (error) throw error
    return { ok: true }
  } catch (error) {
    warn('send bookkeeping', error)
    return { ok: false }
  }
}
