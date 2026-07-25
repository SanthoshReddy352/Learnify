// Reminder delivery adapters (Plan P11.1).
//
// Channel-agnostic by design: the sender asks for "deliver this digest to this
// learner" and this module decides which configured channels can carry it. Two
// adapters ship: Web Push over VAPID (self-hosted, keyless as far as vendors go
// — it talks straight to the browser's own push service, which fits the
// free-platform budget cap) and email over a provider's HTTP API (opt-in, no
// dependency, no-ops when unconfigured).
//
// A third adapter — FCM for the Capacitor Android build — drops in here without
// touching the scheduler: the Android WebView does not implement the Web Push
// API, so native push needs a Firebase project the owner has to create. Tracked
// as a P14 owner action rather than guessed at here.

import webpush from 'web-push'

// --- Web Push (VAPID) --------------------------------------------------------

export function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  // The VAPID `sub` must be a contact URL/mailto the push service can reach if
  // our sending misbehaves. Some push services reject a bare string.
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@learnify.app'
  return { publicKey, privateKey, subject }
}

export function webPushConfigured() {
  return getVapidConfig() !== null
}

/**
 * A push service replying 404/410 means the subscription is permanently gone
 * (browser data cleared, PWA uninstalled). Those rows should be deleted, not
 * retried — anything else is treated as transient.
 */
export function isSubscriptionGone(statusCode) {
  return statusCode === 404 || statusCode === 410
}

/**
 * Deliver one digest to one browser subscription.
 * Never throws: returns { ok, gone, error } so one dead endpoint cannot abort a
 * run that still has other learners to reach.
 */
export async function sendWebPush(subscription, digest) {
  const vapid = getVapidConfig()
  if (!vapid) return { ok: false, gone: false, error: 'vapid_not_configured' }
  if (!subscription?.endpoint || !subscription?.p256dh || !subscription?.auth) {
    return { ok: false, gone: false, error: 'invalid_subscription' }
  }

  const payload = JSON.stringify({
    title: digest.title,
    body: digest.body,
    url: digest.url,
    tag: digest.tag
  })

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      },
      payload,
      {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey
        },
        // Reviews are not time-critical to the minute; let the push service
        // hold it for a few hours if the device is offline, then drop it rather
        // than deliver yesterday's reminder tomorrow.
        TTL: 6 * 60 * 60
      }
    )
    return { ok: true, gone: false }
  } catch (error) {
    const status = error?.statusCode
    return {
      ok: false,
      gone: isSubscriptionGone(status),
      error: `push_${status || 'error'}: ${error?.message || 'unknown'}`
    }
  }
}

// --- Email -------------------------------------------------------------------

export function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.REMINDER_EMAIL_FROM
  if (!apiKey || !from) return null
  return { apiKey, from, endpoint: 'https://api.resend.com/emails' }
}

export function emailConfigured() {
  return getEmailConfig() !== null
}

/**
 * Send one plain-text digest email. No SDK — a single fetch against the
 * provider's HTTP API, so email stays an optional env-var away and adds no
 * dependency for deployments that do not want it.
 */
export async function sendReminderEmail({ to, subject, text }) {
  const config = getEmailConfig()
  if (!config) return { ok: false, error: 'email_not_configured' }
  if (!to) return { ok: false, error: 'no_recipient' }

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: config.from, to: [to], subject, text })
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return { ok: false, error: `email_${response.status}: ${detail.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: `email_error: ${error?.message || 'unknown'}` }
  }
}
