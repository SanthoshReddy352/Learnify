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
