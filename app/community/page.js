'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getPublicSubjects, cloneSubject } from '@/lib/actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Globe, BookOpen, Copy, Users, Search, Sparkles, GraduationCap, ArrowUp, ArrowDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export default function CommunityPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [cloningId, setCloningId] = useState(null)
  
  // Auth state for interactions
  const [user, setUser] = useState(null)
  const supabase = createClient()

  useEffect(() => {
    checkUser()
    loadSubjects()
  }, [])

  const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
  }

  const loadSubjects = async () => {
    setLoading(true)
    const { success, subjects: data, error } = await getPublicSubjects()
    if (success) {
      setSubjects(data)
    } else {
      toast.error('Failed to load community subjects')
      console.error(error)
    }
    setLoading(false)
  }

  const handleClone = async (e, subjectId) => {
    e.stopPropagation() // Prevent card click
    if (!user) {
        toast.error('Please sign in to clone subjects')
        return
    }

    setCloningId(subjectId)
    const { success, newSubjectId, error } = await cloneSubject(subjectId)
    
    if (success) {
        toast.success('Subject cloned to your workspace!')
        router.push(`/subjects/${newSubjectId}`)
    } else {
        if (error.includes('complete your profile')) {
            toast.error(error, {
                action: {
                    label: 'Go to Profile',
                    onClick: () => router.push('/profile')
                },
                duration: 5000,
            })
        } else {
            toast.error(error || 'Failed to clone subject')
        }
    }
    setCloningId(null)
  }

  const filteredSubjects = subjects.filter(sub => 
    sub.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sub.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sub.authorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sub.author?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Helper to get initials
  const getInitials = (name) => {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
         <div className="relative">
             <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
             <Globe className="h-12 w-12 text-primary relative z-10 animate-bounce" />
         </div>
         <span className="text-lg font-medium text-muted-foreground animate-pulse">Exploring the community...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
        <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                Community
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
                Discover knowledge paths created by others. Clone them to your workspace to start your own journey.
            </p>
        </div>
        
        {/* Search Bar - styled to match header */}
        <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Search subjects, authors, topics..." 
                className="pl-10 h-11 bg-white/5 border-white/10 focus:border-primary/50 focus:bg-white/10 transition-all rounded-xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>
      </div>

      {/* Grid */}
      {filteredSubjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/10 rounded-3xl bg-white/5">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                <Search className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No subjects found</h3>
            <p className="text-muted-foreground max-w-sm text-center">
                We couldn&apos;t find any public subjects matching &quot;{searchQuery}&quot;. Try a different keyword.
            </p>
            <Button 
                variant="link" 
                className="mt-4 text-primary" 
                onClick={() => setSearchQuery('')}
            >
                Clear Search
            </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredSubjects.map(subject => (
                <Card 
                    key={subject.id}
                    className="glass-card hover:bg-white/10 transition-all duration-300 cursor-pointer group border-white/5 hover:border-primary/30 flex flex-col h-full overflow-hidden relative"
                    onClick={() => router.push(`/u/${encodeURIComponent(subject.author)}/subjects/${subject.id}`)}
                >
                    {/* Gradient Overlay on Hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                    <CardHeader className="pb-3 relative z-10">
                        <div className="flex justify-between items-start gap-3">
                           <div className="flex-1 space-y-1">
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 mb-2 py-0.5 px-2 text-[10px] uppercase tracking-wider">
                                    Community
                                </Badge>
                                <CardTitle className="text-xl font-bold tracking-tight leading-tight group-hover:text-primary transition-colors line-clamp-2">
                                    {subject.title}
                                </CardTitle>
                           </div>
                        </div>
                    </CardHeader>
                    
                    <CardContent className="flex-1 relative z-10 pb-4">
                        <CardDescription className="line-clamp-3 text-sm leading-relaxed mb-4 min-h-[60px]">
                            {subject.description || 'No description provided.'}
                        </CardDescription>
                        
                        <div className="flex items-center gap-3 mt-auto pt-4 border-t border-white/5">
                            <Avatar className="h-8 w-8 border border-white/10">
                                <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                                    {getInitials(subject.authorName)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-foreground/90 leading-none">
                                    {subject.authorName}
                                </span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                    @{subject.author}
                                </span>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="bg-black/20 p-3 flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground px-2">
                            <div className="flex items-center gap-1.5" title="Topics">
                                <BookOpen className="h-3.5 w-3.5" />
                                <span>{subject.topicCount || 0}</span>
                            </div>
                            {subject.profiles?.education_level && (
                                <div className="flex items-center gap-1.5" title="Level">
                                    <GraduationCap className="h-3.5 w-3.5" />
                                    <span>{subject.profiles.education_level}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1" title="Upvotes">
                                    <ArrowUp className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>{subject.upvotes || 0}</span>
                                </div>
                                <div className="flex items-center gap-1" title="Downvotes">
                                    <ArrowDown className="h-3.5 w-3.5 text-rose-500" />
                                    <span>{subject.downvotes || 0}</span>
                                </div>
                            </div>
                        </div>
                        
                        <Button 
                            size="sm"
                            className="h-8 bg-white/5 hover:bg-white/10 text-foreground border border-white/10 shadow-none hover:text-primary transition-all active:scale-95"
                            onClick={(e) => handleClone(e, subject.id)}
                            disabled={cloningId === subject.id}
                        >
                            {cloningId === subject.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Copy className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-2 sr-only md:not-sr-only md:inline-block">Clone</span>
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
      )}
    </div>
  )
}
