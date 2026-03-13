'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, BookOpen, Network, Share2, Copy, Check, Globe, Lock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import GraphVisualizer from '@/components/GraphVisualizer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cloneSubject } from '@/lib/actions'
import { ThemeToggle } from '@/components/sub-components/theme-toggle'

export default function PublicSubjectPage() {
  const router = useRouter()
  const params = useParams()
  const { username, subjectId } = params // Note: username is in URL but we might not need it for fetching if UUID is unique
  
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState(null)
  const [topics, setTopics] = useState([])
  const [dependencies, setDependencies] = useState([])
  const [error, setError] = useState(null)
  const [isCopied, setIsCopied] = useState(false)
  const [cloning, setCloning] = useState(false)
  
  const [currentTab, setCurrentTab] = useState('overview')

  const supabase = createClient()

  useEffect(() => {
    loadPublicData()
  }, [subjectId])

  const loadPublicData = async () => {
    try {
      setLoading(true)
      
      // 1. Fetch Subject
      // We rely on RLS to allow access if is_public = true
      const { data: subjectData, error: subjectError } = await supabase
        .from('subjects')
        .select('*')
        .eq('id', subjectId)
        .single()

      if (subjectError || !subjectData) {
        throw new Error('Subject not found or private')
      }

      if (!subjectData.is_public) {
        throw new Error('This subject is private')
      }

      setSubject(subjectData)

      // 2. Fetch Topics
      const { data: topicsData, error: topicsError } = await supabase
        .from('topics')
        .select('id, title, description, status, estimated_minutes, difficulty, subject_id, created_at')
        .eq('subject_id', subjectId)
        .order('created_at', { ascending: true })

      if (topicsError) throw topicsError
      setTopics(topicsData || [])

      // 3. Fetch Dependencies
      const { data: depsData, error: depsError } = await supabase
        .from('topic_dependencies')
        .select('*')
        .eq('subject_id', subjectId)

      if (depsError) throw depsError
      setDependencies(depsData || [])

    } catch (err) {
      console.error('Error loading public subject:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
    setIsCopied(true)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleCloneSubject = async () => {
    try {
        setCloning(true)
        const { success, newSubjectId, error } = await cloneSubject(subjectId)
        
        if (success) {
            toast.success('Subject cloned successfully!')
            // Redirect to the new subject in user's workspace
            router.push(`/subjects/${newSubjectId}`)
        } else {
            if (error && error.includes('complete your profile')) {
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
            setCloning(false)
        }
    } catch (err) {
        toast.error('An unexpected error occurred')
        setCloning(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">Loading Public Subject...</span>
        </div>
      </div>
    )
  }

  if (error) {
     return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="bg-destructive/10 text-destructive p-6 rounded-lg max-w-md text-center border border-destructive/20">
          <Lock className="h-12 w-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>{error}</p>
          <Button variant="outline" className="mt-6 text-foreground" onClick={() => router.push('/')}>
            Go Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background selection:bg-primary/20 selection:text-primary">
      {/* Top Bar */}
      <div className="border-b border-border bg-background/80 backdrop-blur-md z-40 shrink-0 sticky top-0 pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/community')} className="hover:bg-muted shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">{subject.title}</h1>
                  <span className="hidden md:flex px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border bg-emerald-500/10 text-emerald-500 border-emerald-500/20 items-center gap-1 shrink-0">
                    <Globe className="h-3 w-3" /> Public
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                    <span className="truncate">{topics.length} topics • {decodeURIComponent(username)}</span>
                    <span className="md:hidden flex px-1.5 py-0 rounded-full text-[9px] uppercase font-bold tracking-wider border bg-emerald-500/10 text-emerald-500 border-emerald-500/20 items-center gap-1 shrink-0">
                     Public
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
               <Button 
                    variant="outline" 
                    className="bg-background border-input hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={handleCopyLink}
                >
                    {isCopied ? <Check className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}
                    {isCopied ? 'Copied' : 'Share'}
                </Button>
                <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="container mx-auto px-4 md:px-6 pt-4 shrink-0">
            <TabsList className="bg-white/5 border border-white/5 p-1 w-full sm:w-auto grid grid-cols-3 sm:flex">
              <TabsTrigger value="overview" className="data-[state=active]:bg-background/50 text-xs md:text-sm">Overview</TabsTrigger>
              <TabsTrigger value="graph" className="data-[state=active]:bg-background/50 text-xs md:text-sm">
                  <span className="md:hidden">Graph</span>
                  <span className="hidden md:inline">Knowledge Graph</span>
              </TabsTrigger>
              <TabsTrigger value="topics" className="data-[state=active]:bg-background/50 text-xs md:text-sm">
                  <span className="md:hidden">Topics</span>
                  <span className="hidden md:inline">All Topics</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] container mx-auto">

            {/* Reusable Components for Responsive Layout */}
            {(() => {
                const MetricsCard = () => (
                 <div className="grid grid-cols-2 gap-4">
                   <Card className="bg-card border-border hover:border-primary/50 transition-colors">
                     <CardContent className="p-4 md:p-6 flex flex-col items-center justify-center text-center">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                            <Network className="h-4 w-4 md:h-5 md:w-5 text-blue-500" />
                        </div>
                        <div className="text-xl md:text-2xl font-bold">{topics.length}</div>
                        <div className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-widest mt-1">Modules</div>
                     </CardContent>
                   </Card>
                    <Card className="bg-card border-border hover:border-primary/50 transition-colors">
                     <CardContent className="p-4 md:p-6 flex flex-col items-center justify-center text-center">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                            <BookOpen className="h-4 w-4 md:h-5 md:w-5 text-amber-500" />
                        </div>
                        <div className="text-xl md:text-2xl font-bold">
                          {Math.floor(topics.reduce((acc, t) => acc + (t.estimated_minutes || 0), 0) / 60)}h
                        </div>
                        <div className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-widest mt-1">Duration</div>
                     </CardContent>
                   </Card>
                 </div>
                );

                const CloneCard = () => (
                 <Card className="bg-gradient-to-b from-card to-muted border-border shadow-lg lg:sticky lg:top-24">
                    <CardHeader className="pb-3 md:pb-6">
                        <CardTitle className="text-lg md:text-xl">Ready to start?</CardTitle>
                        <CardDescription className="text-xs md:text-sm">Clone this entire curriculum to your personal dashboard to track progress, unlock topics, and customize your learning.</CardDescription>
                    </CardHeader>
                    <CardContent className="pb-6">
                        <Button 
                            className="w-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:scale-[1.02] active:scale-[0.98] h-11 md:h-12 text-sm md:text-base font-semibold" 
                            onClick={handleCloneSubject}
                            disabled={cloning}
                        >
                            {cloning ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 md:h-5 md:w-5 animate-spin" />
                                    Cloning Path...
                                </>
                            ) : (
                                <>
                                    <Copy className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                                    Clone to Dashboard
                                </>
                            )}
                        </Button>
                        <p className="text-[10px] md:text-xs text-muted-foreground text-center mt-3 md:mt-4 px-2 md:px-4 leading-relaxed">
                            Includes all {topics.length} topics, dependency graphs, and AI-generated content access.
                        </p>
                    </CardContent>
                 </Card>
                );

            return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              <div className="lg:col-span-2 space-y-8">
                {/* Hero / Description Card */}
                <Card className="bg-gradient-to-br from-primary/5 via-primary/0 to-transparent border-primary/10 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 md:p-12 opacity-5 pointer-events-none">
                        <BookOpen className="w-48 h-48 md:w-64 md:h-64" />
                    </div>
                    <CardHeader>
                      <CardTitle className="text-xl md:text-2xl flex items-center gap-2">
                          <BookOpen className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                          About this Path
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                      <p className="text-base md:text-lg text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {subject.description || "Dive into this curated learning path. Explore the interconnected topics and master the subject at your own pace."}
                      </p>
                    </CardContent>
                </Card>

                  <div className="lg:hidden space-y-6">
                    <MetricsCard />
                    <CloneCard />
                </div>
                
                {/* Syllabus Preview */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Network className="h-5 w-5 text-primary" />
                        Syllabus Preview
                    </h3>
                    <div className="grid gap-2 sm:gap-3">
                        {topics.slice(0, 5).map((topic, index) => (
                            <div key={topic.id} className="flex items-start gap-2 sm:gap-4 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm mt-0.5">
                                    {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-sm sm:text-base break-words leading-snug">{topic.title}</h4>
                                    {topic.estimated_minutes && (
                                        <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                                            {topic.estimated_minutes} mins
                                        </div>
                                    )}
                                </div>
                                <div className="text-muted-foreground mt-1">
                                    <Lock className="h-3 w-3 sm:h-4 sm:w-4 opacity-50" />
                                </div>
                            </div>
                        ))}
                        {topics.length > 5 && (
                            <div className="text-center py-2 text-xs sm:text-sm text-muted-foreground">
                                + {topics.length - 5} more topics
                            </div>
                        )}
                         {topics.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground italic bg-muted/20 rounded-xl">
                                No topics available in preview.
                            </div>
                        )}
                    </div>
                </div>
              </div>

              {/* Desktop Sidebar (Hidden on Mobile) */}
              <div className="hidden lg:col-span-1 lg:block space-y-6">
                 <MetricsCard />
                 <CloneCard />
              </div>
            </div>
            );
            })()}

          </TabsContent>

          <TabsContent value="graph" className="flex-1 h-full p-0 data-[state=active]:flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
             <div className="h-full w-full bg-black/20">
               <GraphVisualizer
                 topics={topics}
                 dependencies={dependencies}
                 readOnly={true} // Assuming GraphVisualizer handles this or ignores interactions
                 onNodeClick={() => {}} // No op
                 onEdgeClick={() => {}} // No op
                 onConnect={() => {}} // No op
                 onPaneContextMenu={(e) => e.preventDefault()}
               />
             </div>
          </TabsContent>

           <TabsContent value="topics" className="flex-1 overflow-y-auto p-6 space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] container mx-auto">
             {topics.map((topic) => (
               <Card key={topic.id} className="glass-card hover:bg-white/5 transition-all border-white/5">
                 <CardHeader>
                   <div className="flex justify-between items-start">
                     <div>
                       <CardTitle className="text-lg mb-2">{topic.title}</CardTitle>
                       <CardDescription className="line-clamp-2">{topic.description}</CardDescription>
                     </div>
                     <span className="text-xs text-muted-foreground bg-white/5 px-2 py-1 rounded">
                       {topic.estimated_minutes} min
                     </span>
                   </div>
                 </CardHeader>
               </Card>
             ))}
           </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
