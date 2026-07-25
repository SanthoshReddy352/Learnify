'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

// Authenticated app shell: floating sidebar + fixed header.
// Auth pages, the landing page, and learn sessions live in their own
// route groups and never render this chrome.
export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const isSubjectPage = pathname.startsWith('/subjects/')

  // Collapse sidebar on route change (mobile only)
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [pathname])

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
        <div className={`pb-[env(safe-area-inset-bottom)] w-full animate-in fade-in duration-500 ${
          isSubjectPage
            ? 'pt-[calc(4rem+env(safe-area-inset-top))]'
            : 'pt-[calc(6rem+env(safe-area-inset-top))] px-4 md:pt-[calc(6rem+env(safe-area-inset-top))] md:p-8 max-w-7xl mx-auto space-y-8'
        }`}>
          {children}
        </div>
      </main>
    </div>
  )
}
