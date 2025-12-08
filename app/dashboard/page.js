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
import { Plus, Book, TrendingUp, LogOut, Menu, X } from 'lucide-react'
import { toast } from 'sonner'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newSubject, setNewSubject] = useState({ title: '', description: '' })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setUser(user)
      loadSubjects(user.id)
      setLoading(false)
    }
    checkUser()
  }, [])

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

  const handleCreateSubject = async () => {
    if (!newSubject.title.trim()) {
      toast.error('Please enter a subject title')
      return
    }

    const { data, error } = await supabase
      .from('subjects')
      .insert([{
        user_id: user.id,
        title: newSubject.title,
        description: newSubject.description,
        is_public: false
      }])
      .select()

    if (error) {
      console.error('Error creating subject:', error)
      toast.error('Failed to create subject')
    } else {
      toast.success('Subject created successfully!')
      setNewSubject({ title: '', description: '' })
      setIsCreateOpen(false)
      loadSubjects(user.id)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-xl text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`${
        sidebarOpen ? 'w-64' : 'w-20'
      } bg-card border-r border-border transition-all duration-300 fixed h-full z-40`}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <Book className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold" style={{ fontFamily: 'Montserrat' }}>Learnify</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        <nav className="p-4 space-y-2">
          <Button variant="secondary" className="w-full justify-start" onClick={() => {}}>
            <TrendingUp className="h-5 w-5" />
            {sidebarOpen && <span className="ml-2">Dashboard</span>}
          </Button>
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
            {sidebarOpen && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 ${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        <div className="p-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Montserrat' }}>My Subjects</h1>
                <p className="text-muted-foreground">Manage your learning subjects and track progress</p>
              </div>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="neon-glow">
                    <Plus className="mr-2 h-5 w-5" />
                    Create Subject
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle style={{ fontFamily: 'Montserrat' }}>Create New Subject</DialogTitle>
                    <DialogDescription>Start a new learning journey by creating a subject.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Subject Title</Label>
                      <Input
                        id="title"
                        placeholder="e.g., JavaScript Fundamentals"
                        value={newSubject.title}
                        onChange={(e) => setNewSubject({ ...newSubject, title: e.target.value })}
                        className="bg-background border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description (Optional)</Label>
                      <Textarea
                        id="description"
                        placeholder="What will you learn in this subject?"
                        value={newSubject.description}
                        onChange={(e) => setNewSubject({ ...newSubject, description: e.target.value })}
                        className="bg-background border-border min-h-[100px]"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateSubject}>Create Subject</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {subjects.length === 0 ? (
              <div className="text-center py-20">
                <Book className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Montserrat' }}>No Subjects Yet</h3>
                <p className="text-muted-foreground mb-6">Create your first subject to start learning!</p>
                <Button onClick={() => setIsCreateOpen(true)} className="neon-glow">
                  <Plus className="mr-2 h-5 w-5" />
                  Create Your First Subject
                </Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {subjects.map((subject) => (
                  <Card
                    key={subject.id}
                    className="bg-card border-border hover:border-primary/50 hover:neon-glow transition-all cursor-pointer"
                    onClick={() => router.push(`/subjects/${subject.id}`)}
                  >
                    <CardHeader>
                      <CardTitle className="text-2xl" style={{ fontFamily: 'Montserrat' }}>{subject.title}</CardTitle>
                      <CardDescription className="line-clamp-2">{subject.description || 'No description'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {subject.topics?.[0]?.count || 0} topics
                        </span>
                        <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                          Open →
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
