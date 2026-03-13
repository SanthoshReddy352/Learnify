'use client'

import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { TrendingUp, X, Menu, Settings, Home, User, LogOut, Globe, Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/sub-components/theme-toggle'

export function Sidebar({ open, setOpen }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const isActive = (path) => pathname === path

  return (
    <aside className={`
      fixed z-40 transition-all duration-300 flex flex-col shadow-2xl overflow-hidden group glass
      pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
      /* Mobile Styles */
      inset-y-0 left-0 h-full w-64
      ${open ? 'translate-x-0' : '-translate-x-full'}
      
      /* Desktop Styles */
      md:translate-x-0
      md:top-6 md:bottom-6 md:left-6 md:rounded-3xl
      md:pt-0 md:pb-0
      ${open ? 'md:w-64' : 'md:w-[70px]'}
    `}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className={`flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity ${open ? 'opacity-100' : 'md:opacity-0 md:hidden'} duration-200`} onClick={() => router.push('/')}>
            <Image src="/icons/icon-192x192.png" alt="Learnify Logo" width={32} height={32} className="h-8 w-8 rounded-full flex-shrink-0" />
            {open && <span className="text-xl font-bold tracking-tight">Learnify</span>}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(!open)}
          className={`text-muted-foreground hover:text-foreground ml-auto`}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5 hidden md:block" />}
          {/* On mobile, when closed, this Sidebar is hidden, so we don't see the Menu button here. 
              The Header has the trigger. When open, we see X to close. */}
        </Button>
      </div>
      
      <nav className="p-2 space-y-2 flex-1 overflow-y-auto custom-scrollbar">
        <ThemeToggle 
            className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-white/5 mb-2`} 
        />
        <Button 
          variant="ghost" 
          className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary`} 
          onClick={() => router.push('/')}
          data-active={isActive('/')}
        >
          <Home className="h-5 w-5 flex-shrink-0" />
          {open && <span className="ml-3 truncate">Home</span>}
        </Button>
        <Button 
          variant="ghost" 
          className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary`} 
          data-active={isActive('/dashboard')}
          onClick={() => router.push('/dashboard')}
        >
          <TrendingUp className="h-5 w-5 flex-shrink-0" />
          {open && <span className="ml-3 truncate">Dashboard</span>}
        </Button>
        <Button 
          variant="ghost" 
          className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary`} 
          onClick={() => router.push('/dashboard/community')}
          data-active={isActive('/dashboard/community')}
        >
          <Globe className="h-5 w-5 flex-shrink-0" />
          {open && <span className="ml-3 truncate">Community</span>}
        </Button>
        <Button 
          variant="ghost" 
          className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary`} 
          onClick={() => router.push('/resource-hub')}
          data-active={pathname.startsWith('/resource-hub')}
        >
          <Layers className="h-5 w-5 flex-shrink-0" />
          {open && <span className="ml-3 truncate">Resource Hub</span>}
        </Button>
        <Button 
          variant="ghost" 
          className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary`} 
          onClick={() => router.push('/dashboard/settings')}
          data-active={isActive('/dashboard/settings')}
        >
          <Settings className="h-5 w-5 flex-shrink-0" />
          {open && <span className="ml-3 truncate">Settings</span>}
        </Button>

        <Button 
          variant="ghost" 
          className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary`} 
          onClick={() => router.push('/dashboard/profile')}
          data-active={isActive('/dashboard/profile')}
        >
          <User className="h-5 w-5 flex-shrink-0" />
          {open && <span className="ml-3 truncate">Profile</span>}
        </Button>

        <div className="pt-4 mt-auto border-t border-white/5 space-y-2">

             <Button 
              variant="ghost" 
              className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-red-500/10 text-muted-foreground hover:text-red-500`}
              onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/')
              }}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {open && <span className="ml-3 truncate">Sign Out</span>}
            </Button>
        </div>
      </nav>
    </aside>
  )
}
