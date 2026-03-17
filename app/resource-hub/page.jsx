'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, FileQuestion, ArrowRight, Sparkles, Share2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { ContributeResourceModal } from '@/components/resource-hub/ContributeResourceModal'

export default function ResourceHubPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [isContributeOpen, setIsContributeOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    checkUser()
  }, [])

  return (
    <div className="space-y-10">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          Resource Hub
          <Sparkles className="h-5 w-5 text-primary animate-pulse" />
        </h1>
        <p className="text-muted-foreground text-lg">Access curated study materials and practice papers</p>
      </motion.div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <ResourceCard
          icon={<BookOpen className="h-6 w-6" />}
          title="Reference Notes"
          description="Comprehensive notes and study guides organized by subject and topic."
          onClick={() => router.push('/resource-hub/notes')}
          color="primary"
        />
        <ResourceCard
          icon={<FileQuestion className="h-6 w-6" />}
          title="PYQ"
          description="Previous Year Questions and practice papers to help you prepare for exams."
          onClick={() => router.push('/resource-hub/pyq')}
          color="blue"
        />
        <ResourceCard
          icon={<Share2 className="h-6 w-6" />}
          title="Contribute"
          description={user ? "Share your own resources with the community." : "Sign in to contribute your own resources."}
          onClick={() => user ? setIsContributeOpen(true) : router.push('/')}
          color="violet"
          badge={!user ? "Login Required" : null}
        />
      </div>

      <ContributeResourceModal 
        open={isContributeOpen} 
        onOpenChange={setIsContributeOpen}
        userId={user?.id}
      />
    </div>
  )
}

function ResourceCard({ icon, title, description, onClick, color = "primary", badge = null }) {
  const colorGradients = {
    primary: "from-primary/50 to-blue-500/50",
    blue: "from-blue-500/50 to-violet-500/50",
    violet: "from-violet-500/50 to-fuchsia-500/50"
  }

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative group cursor-pointer h-full"
    >
      {/* Premium Glow Effect */}
      <div className={`absolute -inset-0.5 bg-gradient-to-r ${colorGradients[color] || colorGradients.primary} rounded-2xl blur opacity-0 group-hover:opacity-20 transition duration-500`} />
      
      <div className="relative glass-card p-8 rounded-2xl border border-white/10 group-hover:border-primary/50 bg-card/50 backdrop-blur-xl transition-all duration-300 flex flex-col h-full overflow-hidden">
        {badge && (
          <div className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary">
            {badge}
          </div>
        )}

        {/* Animated Background Highlight */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-colors duration-500" />
        
        <div className="flex items-center justify-between mb-8">
          <div className="relative">
            <div className="absolute -inset-2 bg-primary/20 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-3 bg-primary/10 rounded-xl text-primary ring-1 ring-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
              {icon}
            </div>
          </div>
          <div className="p-2 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-300">
             <ArrowRight className="h-4 w-4 text-primary" />
          </div>
        </div>

        <div className="space-y-3 flex-1">
          <h2 className="text-2xl font-bold tracking-tight group-hover:text-primary transition-colors">
            {title}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
          <span>{badge ? 'Login to Access' : 'Explore Knowledge'}</span>
          <div className="h-1 w-12 bg-white/10 rounded-full overflow-hidden">
             <motion.div 
               className="h-full bg-primary" 
               initial={{ x: "-100%" }}
               whileHover={{ x: "100%" }}
               transition={{ duration: 0.8, repeat: Infinity }}
             />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
