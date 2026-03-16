'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Book, MoreVertical, Pencil, Trash2, Key, User, Activity, Clock, Trophy, Sparkles, PenTool } from 'lucide-react'
import { toast } from 'sonner'
import WeeklyStats from '@/components/WeeklyStats'
import GlobalReviewsWidget from '@/components/GlobalReviewsWidget'
import { getGlobalAnalytics, getStudyTimeByWeek, getAllDueReviews } from '@/lib/analytics'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [newSubject, setNewSubject] = useState({ title: '', description: '', syllabus: '' })

  const [analytics, setAnalytics] = useState({ totalMinutes: 0, subjectStats: [], weeklyData: [], dueReviews: [] })
  const [hasProfile, setHasProfile] = useState(false)

  const [hasGeminiKey, setHasGeminiKey] = useState(true)

  const [generating, setGenerating] = useState(false) 
  const [creationMode, setCreationMode] = useState('ai') // 'ai' | 'manual'
  const supabase = createClient()

  // Pre-fill edit form when a subject is selected for editing
  useEffect(() => {
    if (selectedSubject && isEditOpen) {
      setNewSubject({
        title: selectedSubject.title,
        description: selectedSubject.description || '',
        syllabus: selectedSubject.syllabus || ''
      })
    } else if (!isEditOpen && !isCreateOpen) {
      setNewSubject({ title: '', description: '', syllabus: '' })
    }
  }, [selectedSubject, isEditOpen, isCreateOpen])

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setUser(user)
      
      // Load all data in parallel to prevent layout shifts
      await Promise.all([
        loadSubjects(user.id),
        loadAnalytics(user.id),
        checkKeys(),
        checkProfile(user.id)
      ])
      
      setLoading(false)
    }
    checkUser()
  }, [])

  const checkKeys = async () => {
    try {
      const response = await fetch('/api/user/settings')
      if (response.ok) {
        const data = await response.json()
        setHasGeminiKey(data.hasGeminiKey)

      }
    } catch (error) {
      console.error('Failed to check API keys:', error)
    }
  }

  const checkProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('education_level')
      .eq('id', userId)
      .single()
    
    if (data && data.education_level) {
        setHasProfile(true)
    }
  }

  const loadSubjects = async (userId) => {
    const { data, error } = await supabase
      .from('subjects')
      .select(`
        *,
        topics(count)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading subjects:', error)
      toast.error('Failed to load subjects')
    } else {
      setSubjects(data || [])
    }
  }

  const loadAnalytics = async (userId) => {
    const [globalStats, weeklyStats, dueReviews] = await Promise.all([
      getGlobalAnalytics(userId),
      getStudyTimeByWeek(userId),
      getAllDueReviews(userId)
    ])
    
    setAnalytics({
      totalMinutes: globalStats.totalMinutes,
      subjectStats: globalStats.subjectStats,
      weeklyData: weeklyStats?.weekData || [],
      dueReviews: dueReviews
    })
  }

  const handleCreateSubject = async () => {
    if (!newSubject.title.trim()) {
      toast.error('Please enter a subject title')
      return
    }

    if (!hasProfile) {
        toast.error('Please complete your profile first to enable personalized curriculum generation')
        router.push('/dashboard/profile')
        return
    }

    if (creationMode === 'ai' && (!newSubject.description.trim() || !newSubject.syllabus.trim())) {
      toast.error('AI curriculum generation requires both a subject description and syllabus')
      return
    }

    setGenerating(true)
    const { data: subjectData, error } = await supabase
      .from('subjects')
      .insert([{
        user_id: user.id,
        title: newSubject.title,
        description: newSubject.description,
        syllabus: newSubject.syllabus,
        is_public: false
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating subject:', error)
      toast.error('Failed to add subject')
      setGenerating(false)
    } else {
      // If valid manual mode, we are done
      if (creationMode === 'manual') {
        toast.success('Subject created successfully!')
        setNewSubject({ title: '', description: '', syllabus: '' })
        setIsCreateOpen(false)
        setGenerating(false)
        loadSubjects(user.id)
        // Optional: Redirect immediately to the new subject
        router.push(`/subjects/${subjectData.id}`)
        return
      }

      // Trigger API Generation
      toast.message('Generating Personalized Curriculum...', {
        description: 'Using your profile to tailor topics. This may take a moment.',
        duration: 4000,
      })
      
      try {
          // Fire and forget - or wait if you want to confirm success before redirect
          await fetch('/api/generate-graph', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subjectId: subjectData.id,
                seedText: [subjectData.description, subjectData.syllabus].filter(Boolean).join('\n\n'),
                difficulty: 3, // Default, will be refined by AI context
                totalMinutes: 300 // Default
              })
          })
          
          toast.success('Subject created & curriculum generated!')
          setNewSubject({ title: '', description: '', syllabus: '' })
          setIsCreateOpen(false)
          loadSubjects(user.id)
      } catch (genError) {
          console.error("Generation trigger failed", genError)
          toast.error('Subject created, but generation failed.')
      } finally {
          setGenerating(false)
      }
    }
  }

  const handleUpdateSubject = async () => {
    if (!newSubject.title.trim()) {
      toast.error('Please enter a subject title')
      return
    }

    const { error } = await supabase
      .from('subjects')
      .update({
        title: newSubject.title,
        description: newSubject.description,
        syllabus: newSubject.syllabus
      })
      .eq('id', selectedSubject.id)

    if (error) {
      console.error('Error updating subject:', error)
      toast.error('Failed to update subject')
    } else {
      toast.success('Subject updated successfully!')
      setIsEditOpen(false)
      setSelectedSubject(null)
      loadSubjects(user.id)
    }
  }

  const handleDeleteSubject = async () => {
    const { error } = await supabase
      .from('subjects')
      .delete()
      .eq('id', selectedSubject.id)

    if (error) {
      console.error('Error deleting subject:', error)
      toast.error('Failed to delete subject')
    } else {
      toast.success('Subject deleted successfully')
      setIsDeleteOpen(false)
      setSelectedSubject(null)
      loadSubjects(user.id)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
          <Book className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">Loading Dashboard...</span>
        </div>
      </div>
    )
  }

  // AI Generation Loading Overlay
  if (generating) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 selection:bg-primary/20 selection:text-primary overflow-hidden relative z-50">
        {/* Background Ambient Glow */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        <div className="z-10 flex flex-col items-center animate-in fade-in zoom-in duration-500">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
            <Sparkles className="h-16 w-16 text-primary animate-spin-slow relative z-10" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-3 text-center">Synthesizing Curriculum...</h2>
          <p className="text-muted-foreground animate-pulse text-lg text-center max-w-md">
            Our agents are analyzing your subject, structuring dependencies, and generating a personalized learning path.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">My Subjects</h1>
            <p className="text-muted-foreground">Manage your learning subjects and track progress</p>
          </div>
          <div className="flex gap-3">
             <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                    <Plus className="mr-2 h-5 w-5" />
                    Add Subject
                </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-white/10 sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Subject</DialogTitle>
                <DialogDescription>Start a new learning journey by creating a subject.</DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="ai" value={creationMode} onValueChange={setCreationMode} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="ai" className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    AI Curriculum
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="gap-2">
                    <PenTool className="h-4 w-4" />
                    Manual Study
                  </TabsTrigger>
                </TabsList>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="title">Subject Title</Label>
                    <Input
                      id="title"
                      placeholder={creationMode === 'ai' ? "e.g., JavaScript Fundamentals" : "e.g., My Personal Notes"}
                      value={newSubject.title}
                      onChange={(e) => setNewSubject({ ...newSubject, title: e.target.value })}
                      className="bg-background/50 border-white/10 focus:border-primary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{creationMode === 'ai' ? 'Subject Description *' : 'Description (Optional)'}</Label>
                    <Textarea
                      id="description"
                      placeholder={creationMode === 'ai' ? "What is this subject about? Define the scope, learner level, and objective." : "Brief description of this subject."}
                      value={newSubject.description}
                      onChange={(e) => setNewSubject({ ...newSubject, description: e.target.value })}
                      className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="syllabus">{creationMode === 'ai' ? 'Syllabus *' : 'Syllabus (Optional)'}</Label>
                    <Textarea
                      id="syllabus"
                      placeholder={creationMode === 'ai' ? 'List the modules, chapters, or syllabus points the AI must cover.' : 'Optional syllabus, module list, or outline.'}
                      value={newSubject.syllabus}
                      onChange={(e) => setNewSubject({ ...newSubject, syllabus: e.target.value })}
                      className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[120px]"
                    />
                  </div>

                  {creationMode === 'ai' && (
                     <div className="rounded-md bg-primary/10 p-3 text-sm text-primary flex gap-2">
                        <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>We&apos;ll generate a personalized curriculum graph using your profile, the subject description, and the syllabus you provide.</p>
                     </div>
                  )}

                  {creationMode === 'manual' && (
                     <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground flex gap-2">
                        <PenTool className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>You&apos;ll start with an empty subject. You can add topics manually or use AI to generate specific ones later.</p>
                     </div>
                  )}
                </div>
              </Tabs>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateSubject}>
                  {creationMode === 'ai' ? 'Generate Subject' : 'Create Subject'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Global Review Reminders */ }
        {analytics.dueReviews && analytics.dueReviews.length > 0 && (
          <GlobalReviewsWidget reviews={analytics.dueReviews} />
        )}

        {/* Global Analytics Section */ }


        {/* API Key Missing Alert */}
        {(!hasGeminiKey) && !loading && (
          <div className="mb-8 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20 flex flex-col sm:flex-row items-start sm:items-center gap-4 animate-in fade-in slide-in-from-top-4">
             <div className="p-2 bg-orange-500/20 rounded-full shrink-0">
               <Key className="h-5 w-5 text-orange-500" />
             </div>
             <div className="flex-1 space-y-1">
               <h3 className="font-semibold text-orange-500">Missing API Keys</h3>
               {!hasGeminiKey && (
                 <p className="text-sm text-muted-foreground">
                   • <strong>Gemini Key</strong> is missing. Curriculum and text generation will not work.
                 </p>
               )}
             </div>
             <Button 
               size="sm" 
               variant="outline" 
               className="border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-500 text-orange-500 shrink-0 whitespace-nowrap mt-2 sm:mt-0"
               onClick={() => router.push('/dashboard/settings')}
             >
               Add Keys
             </Button>
          </div>
        )}

        {subjects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-card/20">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Book className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No Subjects Yet</h3>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">Your learning journey starts here. Create your first subject to begin building your knowledge graph.</p>
            <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-5 w-5" />
              Create Your First Subject
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <Card
                key={subject.id}
                className="glass-card hover:bg-white/5 transition-all cursor-pointer group border-white/5 hover:border-primary/30"
                onClick={() => router.push(`/subjects/${subject.id}`)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-xl font-bold tracking-tight group-hover:text-primary transition-colors flex-1">{subject.title}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                          <span className="sr-only">Open menu</span>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px] bg-card/95 backdrop-blur-sm border-white/10">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          setSelectedSubject(subject)
                          setIsEditOpen(true)
                        }}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => {
                          e.stopPropagation()
                          setSelectedSubject(subject)
                          setIsDeleteOpen(true)
                        }}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="line-clamp-2">{subject.description || 'No description provided.'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm mt-4 pt-4 border-t border-white/5">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Book className="h-4 w-4" />
                      {subject.topics?.[0]?.count || 0} topics
                    </span>
                    <div className="text-primary opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 duration-300 flex items-center text-xs font-semibold uppercase tracking-wider">
                      Open <span className="ml-1">→</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Global Analytics Section */ }
        {subjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-6">
            <div className="md:col-span-2">
              <WeeklyStats 
                data={analytics.weeklyData} 
                totalMinutes={analytics.totalMinutes} 
              />
            </div>
            <div className="space-y-4">
               {/* Total Time Card */}
               <Card className="glass-card bg-primary/5 border-primary/20">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Total Study Time</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="flex items-center gap-2">
                     <Clock className="h-5 w-5 text-primary" />
                     <span className="text-3xl font-bold text-primary">
                        {Math.floor(analytics.totalMinutes / 60)}h {analytics.totalMinutes % 60}m
                     </span>
                   </div>
                 </CardContent>
               </Card>
               
               {/* Subject Progress Overview */}
               <Card className="glass-card">
                 <CardHeader className="pb-3">
                   <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Subject Progress</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                    {analytics.subjectStats.slice(0, 3).map(stat => (
                      <div key={stat.id} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="truncate max-w-[150px] font-medium">{stat.title}</span>
                          <span className="text-muted-foreground">{stat.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary/50 rounded-full" 
                            style={{ width: `${stat.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {analytics.subjectStats.length > 3 && (
                      <p className="text-xs text-center text-muted-foreground pt-1">
                        + {analytics.subjectStats.length - 3} more subjects
                      </p>
                    )}
                    {(analytics.subjectStats || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No progress yet.</p>
                    )}
                 </CardContent>
               </Card>
            </div>
          </div>
        )}
        
        {/* Edit Subject Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="bg-card border-white/10 sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Subject</DialogTitle>
              <DialogDescription>Make changes to your subject here.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Subject Title</Label>
                <Input
                  id="edit-title"
                  value={newSubject.title}
                  onChange={(e) => setNewSubject({ ...newSubject, title: e.target.value })}
                  className="bg-background/50 border-white/10 focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description (Optional)</Label>
                <Textarea
                  id="edit-description"
                  value={newSubject.description}
                  onChange={(e) => setNewSubject({ ...newSubject, description: e.target.value })}
                  className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-syllabus">Syllabus</Label>
                <Textarea
                  id="edit-syllabus"
                  value={newSubject.syllabus}
                  onChange={(e) => setNewSubject({ ...newSubject, syllabus: e.target.value })}
                  className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[120px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateSubject}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent className="bg-card border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the subject
                <span className="font-semibold text-foreground"> &quot;{selectedSubject?.title}&quot; </span>
                and all of its topics and content.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/10 hover:bg-white/5">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteSubject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </>
  )
}
