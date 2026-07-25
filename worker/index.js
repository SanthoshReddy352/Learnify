// Custom service-worker code for Web Push (Plan P11.1).
//
// @ducanh2912/next-pwa compiles this file and `importScripts` it from the
// generated `public/sw.js`, so the Workbox caching config in next.config.js is
// untouched — this only adds the two push listeners Workbox does not provide.
//
// NOTE: next-pwa is configured with `disable: NODE_ENV === 'development'`, so
// there is no service worker under `npm run dev`. Push can only be exercised
// against a production build (`npm run build && npm run start`) or a deployment.

// Fallback copy for the (unexpected) case of a push with no readable payload —
// showing nothing would leave the browser to display its own "This site has
// been updated in the background" notification, which is worse than a generic
// but honest one of ours.
const FALLBACK = {
  title: 'Learnify',
  body: 'You have reviews ready.',
  url: '/dashboard',
  tag: 'learnify-reviews'
}

self.addEventListener('push', (event) => {
  let data = FALLBACK
  try {
    if (event.data) data = { ...FALLBACK, ...event.data.json() }
  } catch {
    // Non-JSON payload; keep the fallback.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      // Reuse the existing PWA icons rather than shipping new assets.
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-24x24.png',
      // A shared tag means a newer reminder REPLACES the previous one instead of
      // stacking three days of them on the lock screen.
      tag: data.tag || FALLBACK.tag,
      renotify: false,
      // Reviews are not an emergency: no vibration, no sound insistence, and it
      // clears itself when the learner dismisses the shade.
      requireInteraction: false,
      data: { url: data.url || FALLBACK.url }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification?.data?.url || FALLBACK.url

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })

      // Prefer focusing a tab the learner already has open — opening a second
      // copy of the dashboard is a small but real annoyance.
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              await client.navigate(target)
            } catch {
              // Cross-origin or unsupported: focus is still better than nothing.
            }
          }
          return client.focus()
        }
      }

      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    })()
  )
})
