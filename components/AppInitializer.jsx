'use client'

import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { usePathname } from 'next/navigation'

export function AppInitializer() {
  const pathname = usePathname()

  const pathnameRef = useRef(pathname)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !('serviceWorker' in navigator)) {
      return undefined
    }

    let cancelled = false

    const cleanupServiceWorkers = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations()
      const cacheKeys = 'caches' in window ? await caches.keys() : []

      if (registrations.length === 0 && cacheKeys.length === 0) {
        return
      }

      await Promise.allSettled(registrations.map((registration) => registration.unregister()))

      if ('caches' in window) {
        await Promise.allSettled(cacheKeys.map((cacheKey) => caches.delete(cacheKey)))
      }

      if (!cancelled) {
        window.location.reload()
      }
    }

    cleanupServiceWorkers()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let backButtonListener

    const setupListener = async () => {
      backButtonListener = await App.addListener('backButton', async () => {
        if (pathnameRef.current === '/' || pathnameRef.current === '/dashboard') {
          await App.exitApp()
        } else {
          window.history.back()
        }
      })
    }
    
    setupListener()

    return () => {
      if (backButtonListener) {
        backButtonListener.remove()
      }
    }
  }, [])

  return null
}
