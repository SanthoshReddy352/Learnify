'use client'

import { Button } from '@/components/ui/button'
import { User, Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export function Header({ setSidebarOpen }) {
  const [user, setUser] = useState(null)
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
  }, [])

  return (
    <header className="fixed top-0 right-0 left-0 h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] bg-background/50 backdrop-blur-md border-b border-white/5 z-30 flex items-center justify-between md:justify-end px-4 md:px-8">
        {/* Mobile Menu Trigger */}
        <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
        >
            <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden md:inline-block">
                {user?.email}
            </span>
             <Button variant="ghost" className="h-8 w-8 rounded-full bg-primary/10 p-0 border border-primary/20 hover:bg-primary/20 transition-colors pointer-events-none">
                <User className="h-4 w-4 text-primary" />
            </Button>
        </div>
    </header>
  )
}
