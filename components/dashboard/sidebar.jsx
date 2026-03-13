'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpen,
  Globe,
  GraduationCap,
  Home,
  LogOut,
  Mail,
  Menu,
  School,
  Settings,
  TrendingUp,
  User,
  X,
} from 'lucide-react'

import { ThemeToggle } from '@/components/sub-components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { createClient } from '@/lib/supabase/client'

export function Sidebar({ open, setOpen }) {
  const router = useRouter()
  const pathname = usePathname()
  const [roleInfo, setRoleInfo] = useState({ isTeacher: false, inviteCount: 0 })
  const supabase = createClient()

  useEffect(() => {
    const loadRoleInfo = async () => {
      try {
        const response = await fetch('/api/user/role')
        if (!response.ok) {
          return
        }

        const data = await response.json()
        setRoleInfo({
          isTeacher: !!data.isTeacher,
          inviteCount: data.inviteCount || 0,
        })
      } catch (error) {
        console.error('Failed to load role info', error)
      }
    }

    loadRoleInfo()
  }, [pathname])

  const isActive = (path) => {
    if (path === '/') {
      return pathname === '/'
    }

    return pathname === path || pathname.startsWith(`${path}/`)
  }

  const NavButton = ({ icon: Icon, label, path, onClick, children }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary`}
          onClick={onClick}
          data-active={isActive(path)}
        >
          <Icon className="h-5 w-5 flex-shrink-0" />
          {open &&
            (children || <span className="ml-3 truncate">{label}</span>)}
        </Button>
      </TooltipTrigger>
      {!open && <TooltipContent side="right">{label}</TooltipContent>}
    </Tooltip>
  )

  return (
    <aside
      className={`
        fixed z-40 flex h-full w-64 flex-col overflow-hidden shadow-2xl transition-all duration-300 group glass
        inset-y-0 left-0
        pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
        ${open ? 'translate-x-0' : '-translate-x-full'}
        md:top-6 md:bottom-6 md:left-6 md:h-auto md:translate-x-0 md:rounded-3xl md:pt-0 md:pb-0
        ${open ? 'md:w-64' : 'md:w-[70px]'}
      `}
    >
      <div className="flex items-center justify-between border-b border-white/5 p-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex cursor-pointer items-center gap-2 transition-opacity duration-200 hover:opacity-80 ${open ? 'opacity-100' : 'md:hidden md:opacity-0'}`}
              onClick={() => router.push('/')}
            >
              <Image
                src="/icons/icon-192x192.png"
                alt="Learnify Logo"
                width={32}
                height={32}
                className="h-8 w-8 flex-shrink-0 rounded-full"
              />
              {open && <span className="text-xl font-bold tracking-tight">Learnify</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">Go to Home</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(!open)}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="hidden h-5 w-5 md:block" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{open ? 'Collapse' : 'Expand'} Sidebar</TooltipContent>
        </Tooltip>
      </div>

      <nav className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ThemeToggle
                className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} mb-2 hover:bg-white/5`}
              />
            </div>
          </TooltipTrigger>
          {!open && <TooltipContent side="right">Switch Theme</TooltipContent>}
        </Tooltip>

        <NavButton icon={Home} label="Home" path="/" onClick={() => router.push('/')} />
        <NavButton
          icon={TrendingUp}
          label="Dashboard"
          path="/dashboard"
          onClick={() => router.push('/dashboard')}
        />
        <NavButton
          icon={BookOpen}
          label="Resource Hub"
          path="/resource-hub"
          onClick={() => router.push('/resource-hub')}
        />
        <NavButton
          icon={Globe}
          label="Community"
          path="/dashboard/community"
          onClick={() => router.push('/dashboard/community')}
        />
        <NavButton
          icon={School}
          label="Classrooms"
          path="/classrooms"
          onClick={() => router.push('/classrooms')}
        />
        <NavButton
          icon={Mail}
          label="Invites"
          path="/classrooms/invitations"
          onClick={() => router.push('/classrooms/invitations')}
        >
          <div className="ml-3 flex w-full items-center justify-between gap-2 overflow-hidden">
            <span className="truncate">Invites</span>
            {roleInfo.inviteCount > 0 && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                {roleInfo.inviteCount}
              </span>
            )}
          </div>
        </NavButton>

        {roleInfo.isTeacher && (
          <NavButton
            icon={GraduationCap}
            label="Teacher Portal"
            path="/teacher/classrooms"
            onClick={() => router.push('/teacher/classrooms')}
          />
        )}

        <NavButton
          icon={Settings}
          label="Settings"
          path="/dashboard/settings"
          onClick={() => router.push('/dashboard/settings')}
        />
        <NavButton
          icon={User}
          label="Profile"
          path="/dashboard/profile"
          onClick={() => router.push('/dashboard/profile')}
        />

        <div className="mt-auto space-y-2 border-t border-white/5 pt-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={`w-full ${open ? 'justify-start px-4' : 'justify-center px-2'} text-muted-foreground hover:bg-red-500/10 hover:text-red-500`}
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/')
                }}
              >
                <LogOut className="h-5 w-5 flex-shrink-0" />
                {open && <span className="ml-3 truncate">Sign Out</span>}
              </Button>
            </TooltipTrigger>
            {!open && <TooltipContent side="right">Sign Out</TooltipContent>}
          </Tooltip>
        </div>
      </nav>
    </aside>
  )
}
