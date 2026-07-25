'use client'

import { useCallback, useEffect, useState } from 'react'
import { assertVapidPublicKey } from './push-key.js'

// Browser-side Web Push enrolment (Plan P11.1).
//
// Feature-detected throughout: on a browser (or an Android WebView) with no
// Push API the hook reports `supported: false` and the UI hides the control
// rather than offering a switch that cannot work — same posture as the P7.1 TTS
// hook.

export function usePushSubscription(vapidPublicKey) {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState('default')
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    setSupported(ok)
    if (!ok) {
      setReady(true)
      return
    }

    setPermission(Notification.permission)

    let cancelled = false
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager?.getSubscription())
      .then((existing) => {
        if (!cancelled) setSubscribed(!!existing)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async () => {
    if (!supported) return { ok: false, error: 'This browser cannot receive push notifications.' }
    if (!vapidPublicKey) {
      return { ok: false, error: 'Push is not configured on this server yet.' }
    }

    setBusy(true)
    try {
      const applicationServerKey = assertVapidPublicKey(vapidPublicKey)

      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        return {
          ok: false,
          error: result === 'denied'
            ? 'Notifications are blocked for this site. Re-allow them in your browser settings.'
            : 'Notification permission was dismissed.'
        }
      }

      // `ready` rather than `getRegistration` — the service worker may still be
      // installing on a first visit, and subscribing to a not-yet-active worker
      // fails with an error that reads like a permission problem.
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          // Required by Chrome: a push must always be shown to the user, never
          // used as a silent background wake-up.
          userVisibleOnly: true,
          applicationServerKey
        }))

      const json = subscription.toJSON()
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          platform: 'web'
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        // The server could not store it, so do not leave a browser subscription
        // dangling that nothing will ever send to.
        await subscription.unsubscribe().catch(() => {})
        return { ok: false, error: data.error || 'Could not register this device.' }
      }

      setSubscribed(true)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not enable notifications.' }
    } finally {
      setBusy(false)
    }
  }, [supported, vapidPublicKey])

  const disable = useCallback(async () => {
    if (!supported) return { ok: true }
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager?.getSubscription()
      const endpoint = subscription?.endpoint

      if (subscription) await subscription.unsubscribe().catch(() => {})
      // Remove the server row even if the local unsubscribe failed, so we stop
      // pushing to an endpoint the learner has asked us to forget.
      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint })
      }).catch(() => {})

      setSubscribed(false)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not turn notifications off.' }
    } finally {
      setBusy(false)
    }
  }, [supported])

  return { supported, permission, subscribed, busy, ready, enable, disable }
}
