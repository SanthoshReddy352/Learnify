'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, ArrowLeft, Network, BookOpen, Settings, Trash2, Sparkles, Play, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import GraphVisualizer from '@/components/GraphVisualizer'
import { isDueForReview } from '@/lib/sm2'

export default function SubjectPage() {
  const router = useRouter()
  const params = useParams()
  const subjectId = params.id
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState(null)
  const [topics, setTopics] = useState([])
  const [dependencies, setDependencies] = useState([])
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false)
  const [isAIGenerateOpen, setIsAIGenerateOpen] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiConfig, setAiConfig] = useState({
    seedText: '',
    difficulty: 3,
    totalMinutes: 300
  })
  const [newTopic, setNewTopic] = useState({
    title: '',
    description: '',
    content: '',
    estimated_minutes: 30,
    difficulty: 3
  })
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setUser(user)
      loadSubjectData()
      setLoading(false)
    }
    checkUser()

    // Set up realtime subscriptions
    const topicsChannel = supabase
      .channel('topics-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topics',
          filter: `subject_id=eq.${subjectId}`
        },
        () => {
          loadTopics()
        }
      )
      .subscribe()

    const depsChannel = supabase
      .channel('dependencies-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topic_dependencies',
          filter: `subject_id=eq.${subjectId}`
        },
        () => {
          loadDependencies()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(topicsChannel)
      supabase.removeChannel(depsChannel)
    }
  }, [subjectId])

  const loadSubjectData = async () => {
    await Promise.all([loadSubject(), loadTopics(), loadDependencies()])
  }

  const loadSubject = async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .single()

    if (error) {
      console.error('Error loading subject:', error)
      toast.error('Failed to load subject')
    } else {
      setSubject(data)
    }
  }

  const loadTopics = async () => {
    const { data, error } = await supabase
      .from('topics')
      .select('*')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading topics:', error)
    } else {
      setTopics(data || [])
    }
  }

  const loadDependencies = async () => {
    const { data, error } = await supabase
      .from('topic_dependencies')
      .select('*')
      .eq('subject_id', subjectId)

    if (error) {
      console.error('Error loading dependencies:', error)
    } else {
      setDependencies(data || [])
    }
  }

  const handleCreateTopic = async () => {
    if (!newTopic.title.trim()) {
      toast.error('Please enter a topic title')
      return
    }

    // First topic is always available
    const status = topics.length === 0 ? 'available' : 'locked'

    const { data, error } = await supabase
      .from('topics')
      .insert([{
        subject_id: subjectId,
        title: newTopic.title,
        description: newTopic.description,
        content: newTopic.content,
        estimated_minutes: newTopic.estimated_minutes,
        difficulty: newTopic.difficulty,
        status: status
      }])
      .select()

    if (error) {
      console.error('Error creating topic:', error)
      toast.error('Failed to create topic')
    } else {
      toast.success('Topic created successfully!')
      setNewTopic({
        title: '',
        description: '',
        content: '',
        estimated_minutes: 30,
        difficulty: 3
      })
      setIsCreateTopicOpen(false)
      loadTopics()
    }
  }

  const handleDeleteTopic = async (topicId) => {
    const { error } = await supabase
      .from('topics')
      .delete()
      .eq('id', topicId)

    if (error) {
      console.error('Error deleting topic:', error)
      toast.error('Failed to delete topic')
    } else {
      toast.success('Topic deleted successfully')
      loadTopics()
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'locked': return 'text-muted-foreground'
      case 'available': return 'text-accent'
      case 'learning': return 'text-chart-4'
      case 'reviewing': return 'text-chart-3'
      case 'mastered': return 'text-primary'
      default: return 'text-muted-foreground'
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'locked': return 'bg-muted/20 text-muted-foreground'
      case 'available': return 'bg-accent/20 text-accent'
      case 'learning': return 'bg-chart-4/20 text-chart-4'
      case 'reviewing': return 'bg-chart-3/20 text-chart-3'
      case 'mastered': return 'bg-primary/20 text-primary'
      default: return 'bg-muted/20 text-muted-foreground'
    }
  }

  if (loading || !subject) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-xl text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="border-b border-border bg-card/30 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'Montserrat' }}>{subject.title}</h1>
                <p className="text-sm text-muted-foreground">{topics.length} topics</p>
              </div>
            </div>
            <Button onClick={() => setIsCreateTopicOpen(true)} className="neon-glow">
              <Plus className="mr-2 h-5 w-5" />
              Add Topic
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="graph">Knowledge Graph</TabsTrigger>
            <TabsTrigger value="topics">All Topics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Total Topics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" style={{ fontFamily: 'Montserrat' }}>{topics.length}</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Available</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-accent" style={{ fontFamily: 'Montserrat' }}>
                    {topics.filter(t => t.status === 'available').length}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">Mastered</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary" style={{ fontFamily: 'Montserrat' }}>
                    {topics.filter(t => t.status === 'mastered').length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {subject.description && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{subject.description}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="graph">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="h-[600px]">
                  <GraphVisualizer
                    topics={topics}
                    dependencies={dependencies}
                    onNodeClick={(topicId) => {
                      toast.info('Topic details coming soon!')
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="topics" className="space-y-4">
            {topics.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Montserrat' }}>No Topics Yet</h3>
                  <p className="text-muted-foreground mb-4">Add your first topic to start learning!</p>
                  <Button onClick={() => setIsCreateTopicOpen(true)}>
                    <Plus className="mr-2 h-5 w-5" />
                    Add First Topic
                  </Button>
                </CardContent>
              </Card>
            ) : (
              topics.map((topic) => (
                <Card key={topic.id} className="bg-card border-border hover:border-primary/30 transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-2" style={{ fontFamily: 'Montserrat' }}>{topic.title}</CardTitle>
                        <CardDescription className="line-clamp-2">{topic.description || 'No description'}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(topic.status)}`}>
                          {topic.status}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTopic(topic.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>⏱ {topic.estimated_minutes} min</span>
                      <span>⭐ Difficulty: {topic.difficulty}/5</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Topic Dialog */}
      <Dialog open={isCreateTopicOpen} onOpenChange={setIsCreateTopicOpen}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Montserrat' }}>Add New Topic</DialogTitle>
            <DialogDescription>Create a new learning topic for this subject.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="topic-title">Topic Title</Label>
              <Input
                id="topic-title"
                placeholder="e.g., Variables and Data Types"
                value={newTopic.title}
                onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-description">Description</Label>
              <Textarea
                id="topic-description"
                placeholder="Brief overview of what this topic covers..."
                value={newTopic.description}
                onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                className="bg-background border-border min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-content">Content</Label>
              <Textarea
                id="topic-content"
                placeholder="Detailed learning content, notes, or resources..."
                value={newTopic.content}
                onChange={(e) => setNewTopic({ ...newTopic, content: e.target.value })}
                className="bg-background border-border min-h-[120px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estimated-minutes">Estimated Time (minutes)</Label>
                <Input
                  id="estimated-minutes"
                  type="number"
                  min="5"
                  max="240"
                  value={newTopic.estimated_minutes}
                  onChange={(e) => setNewTopic({ ...newTopic, estimated_minutes: parseInt(e.target.value) || 30 })}
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select
                  value={newTopic.difficulty.toString()}
                  onValueChange={(value) => setNewTopic({ ...newTopic, difficulty: parseInt(value) })}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Very Easy</SelectItem>
                    <SelectItem value="2">2 - Easy</SelectItem>
                    <SelectItem value="3">3 - Medium</SelectItem>
                    <SelectItem value="4">4 - Hard</SelectItem>
                    <SelectItem value="5">5 - Very Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateTopicOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTopic}>Create Topic</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
