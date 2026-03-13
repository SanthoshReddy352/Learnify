'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileQuestion, Search, Calendar, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { getCommunityResources } from '@/lib/actions'
import { ResourceCard } from '@/components/resource-hub/ResourceCard'

export default function PYQPage() {
  const router = useRouter()
  const [resources, setResources] = useState([])
  const [filteredResources, setFilteredResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function loadResources() {
      const result = await getCommunityResources('pyq')
      if (result.success) {
        setResources(result.resources)
        setFilteredResources(result.resources)
      } else {
        console.error('Failed to fetch pyqs:', result.error)
      }
      setLoading(false)
    }
    loadResources()
  }, [])

  useEffect(() => {
    const query = searchQuery.toLowerCase()
    const filtered = resources.filter(res => 
      res.name.toLowerCase().includes(query) || 
      res.subject.toLowerCase().includes(query) ||
      (res.details && res.details.toLowerCase().includes(query))
    )
    setFilteredResources(filtered)
  }, [searchQuery, resources])

  return (
    <div className="relative overflow-hidden">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-8"
        >
          <Button 
            variant="ghost" 
            onClick={() => router.push('/resource-hub')}
            className="mb-4 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Hub
          </Button>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-500/10 rounded-2xl">
              <FileQuestion className="h-8 w-8 text-orange-500" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">PYQ (Previous Year Questions)</h1>
              <p className="text-muted-foreground text-lg">Practice with official past examination papers.</p>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-12">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search by topic, subject or year..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 bg-white/5 border-white/10 focus:border-orange-500/50 h-12 text-lg rounded-2xl"
            />
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
            <p className="text-muted-foreground animate-pulse">Fetching practice papers...</p>
          </div>
        ) : filteredResources.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredResources.map((res) => (
                <ResourceCard key={res.id} resource={res} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 border border-dashed border-white/10 rounded-3xl bg-card/20"
          >
            <FileQuestion className="h-16 w-16 text-muted-foreground/30 mx-auto mb-6" />
            <h3 className="text-2xl font-bold mb-2">
                {searchQuery ? 'No Results Found' : 'Practice Papers Coming Soon'}
            </h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
                {searchQuery 
                    ? `We couldn't find any papers matching "${searchQuery}".`
                    : "We are currently indexing official examination papers. Practice sets will be available shortly."}
            </p>
            {!searchQuery && (
                <Button 
                    onClick={() => router.push('/resource-hub')}
                    variant="link" 
                    className="mt-4 text-orange-500"
                >
                    Contribute a Paper
                </Button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
