'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { ThemeToggle } from '@/components/sub-components/theme-toggle'
import Image from 'next/image'
import Link from 'next/link'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function Navbar() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    checkUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return null

  return (
    <motion.nav 
      initial={{ y: -100, x: "-50%", opacity: 0 }}
      animate={{ y: 0, x: "-50%", opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="fixed top-[calc(1.5rem+env(safe-area-inset-top))] left-1/2 w-[90%] max-w-5xl z-50 rounded-full"
    >
      <div className="glass rounded-full px-6 py-3 flex justify-between items-center shadow-2xl transition-all hover:bg-background/80 relative">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
          router.push('/')
        }}>
          <Image src="/icons/icon-192x192.png" alt="Learnify Logo" width={32} height={32} className="h-8 w-8 rounded-full" />
          <span className="text-lg font-bold tracking-tight text-foreground hidden sm:inline">Learnify</span>
        </div>
        <div className="hidden md:flex items-center gap-8 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/#features" className="text-sm font-medium text-zinc-950 dark:text-muted-foreground hover:text-primary transition-all hover:scale-105">Features</Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">View Platform Features</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/resource-hub" className="text-sm font-medium text-zinc-950 dark:text-muted-foreground hover:text-primary transition-all hover:scale-105">Resources</Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">Browse Learning Resources</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/#how-it-works" className="text-sm font-medium text-zinc-950 dark:text-muted-foreground hover:text-primary transition-all hover:scale-105">Methodology</Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">Our Learning Approach</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {user ? (
             <div className="flex items-center gap-4">
               <Tooltip>
                 <TooltipTrigger asChild>
                   <div>
                    <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-white/5" />
                   </div>
                 </TooltipTrigger>
                 <TooltipContent side="bottom">Switch Theme</TooltipContent>
               </Tooltip>
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button size="sm" onClick={() => router.push('/dashboard')} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 shadow-lg shadow-primary/25 transition-all hover:scale-105">
                     Open Dashboard
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent side="bottom">Go to your Dashboard</TooltipContent>
               </Tooltip>
             </div>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-white/5" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">Switch Theme</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/login')} className="text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-full">
                    Sign In
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Login to your account</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={() => router.push('/signup')} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 shadow-lg shadow-primary/25 transition-all hover:scale-105">
                    Get Started
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Create your account</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </motion.nav>
  )
}
