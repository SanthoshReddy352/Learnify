'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

import { Navbar } from '@/components/navbar'

export function GlobalNavigation({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const isLandingPage = pathname === '/'
  const isLearnPage = pathname.startsWith('/learn/')

  // Collapse sidebar on route change (mobile only)
  useEffect(() => {
    if (window.innerWidth < 768) {
        setSidebarOpen(false)
    }
  }, [pathname])

  if (isLandingPage) {
    return (
      <div className="min-h-screen bg-background flex flex-col selection:bg-primary/20 selection:text-primary">
        <Navbar />
        <main className="flex-1 w-full animate-in fade-in duration-500 pt-[calc(7rem+env(safe-area-inset-top))] px-4 md:px-8 pb-8">
          {children}
        </main>
      </div>
    )
  }

  // Learn page: full immersive view, no sidebar or header
  if (isLearnPage) {
    return (
      <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex selection:bg-primary/20 selection:text-primary">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <main className={`flex-1 flex flex-col w-full transition-all duration-300 
          ${sidebarOpen ? 'md:ml-[304px]' : 'md:ml-[118px]'} 
          ml-0`}
      >
        <Header setSidebarOpen={setSidebarOpen} />
        <div className="pt-[calc(6rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)] px-4 md:pt-[calc(6rem+env(safe-area-inset-top))] md:p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
            {children}
        </div>
      </main>
    </div>
  )
}
