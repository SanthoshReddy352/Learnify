'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Search, Sparkles, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getResources } from '@/lib/actions'
import { CommunityResourceCard } from '@/components/resource-hub/CommunityResourceCard'

export default function NotesPage() {
  const router = useRouter()
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchResources = async () => {
      setLoading(true)
      setError(null)
      const result = await getResources('notes')
      if (result.success) {
        setResources(result.resources)
      } else {
        setError(result.error)
      }
      setLoading(false)
    }
    fetchResources()
  }, [])

  const filteredResources = resources.filter(res => 
    res.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    res.subject.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-10">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div>
          <div className="flex items-center gap-2 mb-2 text-sm">
             <Button 
                variant="ghost" 
                size="sm"
                onClick={() => router.push('/resource-hub')}
                className="p-0 h-auto hover:bg-transparent text-muted-foreground hover:text-primary transition-colors font-medium"
              >
                Resource Hub
              </Button>
              <span className="text-muted-foreground/30">/</span>
              <span className="text-primary/80 font-semibold italic">Reference Notes</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Reference Notes</h1>
        </div>
        
        <div className="relative w-full md:w-96 group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-blue-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-300" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input 
              placeholder="Search notes..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-background/50 border-white/10 focus:border-primary/50 backdrop-blur-md rounded-xl"
            />
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="animate-pulse">Fetching community notes...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-destructive bg-destructive/5 rounded-3xl border border-dashed border-destructive/20 mb-8">
           <p className="text-xl font-bold mb-2">Error Loading Notes</p>
           <p className="text-sm opacity-80">{error}</p>
           <Button variant="outline" className="mt-6 border-destructive/20 hover:bg-destructive/10" onClick={() => window.location.reload()}>
              Try Again
           </Button>
        </div>
      ) : filteredResources.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredResources.map((resource) => (
              <CommunityResourceCard key={resource.id} resource={resource} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="relative py-24 border border-dashed border-white/10 rounded-3xl bg-card/10 backdrop-blur-sm overflow-hidden group"
        >
          <div className="absolute inset-0 bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="relative mb-8">
              <div className="absolute -inset-4 bg-primary/20 rounded-full blur-xl animate-pulse" />
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center ring-1 ring-primary/20 relative z-10">
                <BookOpen className="h-10 w-10 text-primary" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-primary/40 animate-bounce" />
            </div>
            <h3 className="text-2xl font-bold mb-3 tracking-tight">
              {searchQuery ? "No Notes Found" : "Curating Excellence"}
            </h3>
            <p className="text-muted-foreground max-w-sm mx-auto text-lg leading-relaxed">
              {searchQuery 
                ? `No results for "${searchQuery}". Try a different search term or contribute one yourself!` 
                : "We're currently hand-picking the most effective study materials for your journey. Check back soon!"}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}
