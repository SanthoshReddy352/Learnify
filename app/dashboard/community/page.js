'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getPublicSubjects, cloneSubject } from '@/lib/actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Globe, BookOpen, Copy, Users, Search, Sparkles, GraduationCap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

export default function CommunityPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [cloningId, setCloningId] = useState(null)
  const [cloneSubjectData, setCloneSubjectData] = useState(null)
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false)
  
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

    setCloneSubjectData({ id: subjectId })
    setIsCloneDialogOpen(true)
  }

  const confirmClone = async () => {
    if (!cloneSubjectData) return
    const subjectId = cloneSubjectData.id
    
    setCloningId(subjectId)
    setIsCloneDialogOpen(false) // Close modal immediately to show loading spinner on card
    
    const { success, newSubjectId, error } = await cloneSubject(subjectId)
    
    if (success) {
        toast.success('Subject cloned to your workspace!')
        router.push(`/subjects/${newSubjectId}`)
    } else {
        if (error.includes('complete your profile')) {
            toast.error(error, {
                action: {
                    label: 'Go to Profile',
                    onClick: () => router.push('/dashboard/profile')
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
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Community</h1>
           <p className="text-sm md:text-base text-muted-foreground">Discover and clone knowledge paths created by others</p>
        </div>
        
        {/* Search Bar - styled to match dashboard actions */}
        <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Search..." 
                className="pl-9 bg-background border-input focus:border-primary w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>
      </div>

      {/* Grid */}
      {filteredSubjects.length === 0 ? (
        <div className="text-center py-12 md:py-20 border border-dashed border-border rounded-3xl bg-muted/10 mx-auto max-w-lg">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold mb-2">No subjects found</h3>
            <p className="text-sm md:text-base text-muted-foreground max-w-xs md:max-w-sm mx-auto px-4">
                No public subjects match "{searchQuery}".
            </p>
            <Button 
                variant="link" 
                className="mt-2 text-primary" 
                onClick={() => setSearchQuery('')}
            >
                Clear Search
            </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filteredSubjects.map(subject => (
                <Card 
                    key={subject.id}
                    className="bg-card hover:bg-muted/50 transition-all cursor-pointer group border-border hover:border-primary/50 hover:shadow-md flex flex-col h-full overflow-hidden"
                    onClick={() => router.push(`/u/${encodeURIComponent(subject.author)}/subjects/${subject.id}`)}
                >
                    <CardHeader className="pb-3 p-4 md:p-6">
                        <div className="flex justify-between items-start gap-2">
                           <CardTitle className="text-lg md:text-xl font-bold tracking-tight group-hover:text-primary transition-colors line-clamp-2">
                               {subject.title}
                           </CardTitle>
                           <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] uppercase tracking-wider shrink-0 mt-1">
                               Public
                           </Badge>
                        </div>
                        <CardDescription className="line-clamp-2 min-h-[40px] text-xs md:text-sm">
                            {subject.description || 'No description provided.'}
                        </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="flex-1 flex flex-col pb-4 px-4 md:px-6">
                        <div className="flex items-center gap-3 mt-auto pt-4 border-t border-border">
                            <Avatar className="h-6 w-6 border border-border">
                                <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                                    {getInitials(subject.authorName)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground/90 leading-none">
                                    {subject.authorName}
                                </span>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="bg-muted/30 p-3 flex items-center justify-between mt-auto">
                         <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                            <div className="flex items-center gap-1.5" title="Topics">
                                <BookOpen className="h-3.5 w-3.5" />
                                <span>{subject.topicCount || 0}</span>
                            </div>
                         </div>
                        
                        <Button 
                            size="sm"
                            variant="secondary"
                            className="h-7 bg-background hover:bg-primary hover:text-primary-foreground border border-input text-xs shadow-sm"
                            onClick={(e) => handleClone(e, subject.id)}
                            disabled={cloningId === subject.id}
                        >
                            {cloningId === subject.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                                <Copy className="h-3.5 w-3.5 mr-1" />
                            )}
                            Clone
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
      )}
      {/* Clone Confirmation Dialog */}
      <AlertDialog open={isCloneDialogOpen} onOpenChange={setIsCloneDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Clone this Subject?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a copy of the subject in your dashboard. You can then edit and learn from it independently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-muted">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClone} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Clone Subject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
