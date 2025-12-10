'use client'

import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { usePathname } from 'next/navigation'

export function AppInitializer() {
  const pathname = usePathname()

  useEffect(() => {
    const handleBackButton = async () => {
        App.addListener('backButton', async (data) => {
            if (pathname === '/' || pathname === '/dashboard') {
                await App.exitApp()
            } else {
                window.history.back()
            }
        })
    }
    
    handleBackButton()

    return () => {
        App.removeAllListeners()
    }
  }, [pathname])

  return null
}
