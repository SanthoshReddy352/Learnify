'use client'
// ... imports
import { useEffect, useState, useRef } from 'react' // Ensure React hooks are imported
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, ArrowLeft, Network, BookOpen, Settings, Trash2, Sparkles, Play, RotateCw, Home, Pencil, Share2, Copy, Check, Globe, Lock, Menu, MoreVertical, Download } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import React from 'react'
import MarkdownComponents from '@/components/sub-components/MarkdownComponents'
import CodeBlock from '@/components/sub-components/CodeBlock'
import { sanitizeLatex } from '@/lib/latexToUnicode'
import GraphVisualizer from '@/components/GraphVisualizer'
import RecommendationWidget from '@/components/RecommendationWidget'
import WeeklyStats from '@/components/WeeklyStats'
import ThreeDLoadingBar from '@/components/ThreeDLoadingBar'
import { isDueForReview } from '@/lib/sm2'
import { createDependency, deleteDependency, deleteTopic, updateUnlockedTopics, updateSubjectVisibility } from '@/lib/actions'
import { getWeakTopics, getStudyTimeByWeek } from '@/lib/analytics'
import WeakTopicsWidget from '@/components/WeakTopicsWidget'
import { Switch } from '@/components/ui/switch'
import { ThemeToggle } from '@/components/sub-components/theme-toggle'

function buildSafeFilename(title, suffix, extension) {
  const base = (title || 'learnify')
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()

  return `${base || 'learnify'}_${suffix}.${extension}`
}

async function exportBlob({ blob, filename, title, mimeType }) {
  if (typeof window === 'undefined') {
    return false
  }

  const file = typeof File !== 'undefined'
    ? new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' })
    : null

  if (navigator.share && navigator.canShare && file && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title: title || filename,
      files: [file]
    })
    return true
  }

  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return true
}

const noteMarkdownComponents = {
  ...MarkdownComponents,
  code: ({ node, inline, className, children, ...props }) => (
    <CodeBlock
      node={node}
      inline={inline}
      className={className}
      allowAddToNotes={false}
      {...props}
    >
      {children}
    </CodeBlock>
  ),
  blockquote: ({ node, ...props }) => {
    let color = 'blue'
    let found = false

    const processChildren = (children) => {
      return React.Children.map(children, child => {
        if (typeof child === 'string') {
          if (!found) {
            const match = child.match(/^\[(blue|green|purple|amber|rose)\]\s*/)
            if (match) {
              color = match[1]
              found = true
              return child.replace(match[0], '')
            }
          }
          return child
        }

        if (React.isValidElement(child) && child.props && child.props.children) {
          return React.cloneElement(child, {
            children: processChildren(child.props.children)
          })
        }

        return child
      })
    }

    const modifiedChildren = processChildren(props.children)

    const hlThemes = {
      blue: { border: 'border-blue-500', shadow: 'from-blue-500/10', shine: 'via-blue-400/10' },
      green: { border: 'border-emerald-500', shadow: 'from-emerald-500/10', shine: 'via-emerald-400/10' },
      purple: { border: 'border-purple-500', shadow: 'from-purple-500/10', shine: 'via-purple-400/10' },
      amber: { border: 'border-amber-500', shadow: 'from-amber-500/10', shine: 'via-amber-400/10' },
      rose: { border: 'border-rose-500', shadow: 'from-rose-500/10', shine: 'via-rose-400/10' }
    }
    const hlTheme = hlThemes[color] || hlThemes.blue

    return (
      <blockquote
        className={`not-prose my-3 pl-4 py-2 pr-4 rounded-r block border-l-4 ${hlTheme.border} bg-gradient-to-r ${hlTheme.shadow} to-transparent italic text-slate-700 dark:text-slate-300 shadow-sm relative overflow-hidden`}
      >
        <div className={`absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent ${hlTheme.shine} to-transparent animate-[shimmer_3s_infinite] opacity-50`} />
        <div className="relative z-10">
          {modifiedChildren}
        </div>
      </blockquote>
    )
  },
  input: ({ node, ...props }) => (
    <input {...props} className="mr-2 accent-primary" />
  )
}

export default function SubjectPage() {
  const router = useRouter()
  // ... rest of component
  const params = useParams()
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab')
  const [currentTab, setCurrentTab] = useState(urlTab || 'overview') 
  const subjectId = params.id
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState(null)
  const [topics, setTopics] = useState([])
  const [dependencies, setDependencies] = useState([])

  const [studyLogs, setStudyLogs] = useState([]) // Keep for legacy or specific log lists if needed
  const [analytics, setAnalytics] = useState({ weakTopics: [], weeklyData: [], totalMinutes: 0 })
  
  // ... (rest of state definitions)
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false)
  const [isAIGenerateOpen, setIsAIGenerateOpen] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false) // Added loading state for generation
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
  const [isLinkTopicsOpen, setIsLinkTopicsOpen] = useState(false)
  const [linkConfig, setLinkConfig] = useState({
    parentTopicId: '',
    childTopicId: ''
  })
  const [dependencyToDelete, setDependencyToDelete] = useState(null)
  const [topicToDelete, setTopicToDelete] = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [isTopicDetailsOpen, setIsTopicDetailsOpen] = useState(false)
  /* ... existing state ... */
  const [topicEditForm, setTopicEditForm] = useState({ title: '', description: '', content: '' })
  const [isEditSubjectOpen, setIsEditSubjectOpen] = useState(false)
  const [editMode, setEditMode] = useState('all') // 'all' | 'notes'
  const [updatedSubject, setUpdatedSubject] = useState({ title: '', description: '', syllabus: '' })
  
  const [isCopied, setIsCopied] = useState(false)

  const handleDownloadNotes = async () => {
    const topicsWithNotes = topics.filter(t => t.user_notes && t.user_notes.trim().length > 0)
    if (topicsWithNotes.length === 0) {
      toast.error('No notes available to download.')
      return
    }

    let content = `# Notes & Reminders: ${subject.title}\n\n`
    topicsWithNotes.forEach(t => {
      content += `---\n\n## ${t.title}\n\n${t.user_notes}\n\n`
    })

    try {
      await exportBlob({
        blob: new Blob([content], { type: 'text/markdown;charset=utf-8' }),
        filename: buildSafeFilename(subject?.title, 'notes', 'md'),
        title: `${subject?.title || 'Subject'} Notes`,
        mimeType: 'text/markdown'
      })
      toast.success('Notes export is ready.')
    } catch (error) {
      console.error('Notes export error:', error)
      toast.error('Failed to export notes.')
    }
  }

  const [isGeneratingCheatSheet, setIsGeneratingCheatSheet] = useState(false)

  const handleGenerateCheatSheet = async () => {
    setIsGeneratingCheatSheet(true)
    const tid = toast.loading('Synthesizing Master Cheat Sheet (This may take a minute)...')
    try {
      const response = await fetch('/api/generate-subject-cheatsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate cheat sheet')
      }

      toast.success('Cheat Sheet Generated!', { id: tid })
      // Update local subject state
      setSubject(prev => ({ ...prev, cheat_sheet: result.cheat_sheet }))
    } catch (error) {
      console.error('Cheat sheet generation error:', error)
      toast.error('Failed to generate cheat sheet', { id: tid })
    } finally {
      setIsGeneratingCheatSheet(false)
    }
  }

  const handleDownloadCheatSheetPDF = async () => {
    const element = document.getElementById('cheat-sheet-content');
    if (!element) {
      toast.error('Content not ready for PDF generation.');
      return;
    }
    
    toast.loading('Preparing PDF...', { id: 'pdf-toast' });
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      
      const opt = {
        margin:       [10, 10, 10, 10],
        filename:     buildSafeFilename(subject?.title, 'cheatsheet', 'pdf'),
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
      await exportBlob({
        blob: pdfBlob,
        filename: opt.filename,
        title: `${subject?.title || 'Subject'} Cheat Sheet`,
        mimeType: 'application/pdf'
      })
      toast.success('Cheat sheet export is ready.', { id: 'pdf-toast' });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF.', { id: 'pdf-toast' });
    }
  }

  /* ... */

  /* Header Pencil Button */
  /* This component part is around line 494 in original file, need to be careful with replace range */
  
  /* Applying changes to Dialog primarily and the click handlers */

/* STARTING WITH STATE DEFINITION */

  const supabase = createClient()

  const handleUpdateSubject = async () => {
    if (!updatedSubject.title.trim()) {
      toast.error('Please enter a subject title')
      return
    }

    const { error } = await supabase
      .from('subjects')
      .update({
        title: updatedSubject.title,
        description: updatedSubject.description,
        syllabus: updatedSubject.syllabus
      })
      .eq('id', subjectId)

    if (error) {
      console.error('Error updating subject:', error)
      toast.error('Failed to update subject')
    } else {
      toast.success('Subject updated successfully!')
      setSubject({ ...subject, title: updatedSubject.title, description: updatedSubject.description, syllabus: updatedSubject.syllabus })
      setIsEditSubjectOpen(false)
    }
  }

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setUser(user)
      
      // Run unlocking engine to ensure correctness before loading
      await updateUnlockedTopics(subjectId)
      
      loadSubjectData(user.id)
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
      
    // Subscribe to logs for realtime stats updates
    const logsChannel = supabase
      .channel('logs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'study_logs',
          filter: `subject_id=eq.${subjectId}`
        },
        () => {
          loadAnalytics()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(topicsChannel)
      supabase.removeChannel(depsChannel)
      supabase.removeChannel(logsChannel)
    }
  }, [subjectId])

  // Sync state with URL if it changes
  useEffect(() => {
    if (urlTab) {
      setCurrentTab(urlTab)
    }
  }, [urlTab])

  // Restore from localStorage if no URL param
  useEffect(() => {
    if (!urlTab) {
      const savedTab = localStorage.getItem(`subject_tab_${subjectId}`)
      if (savedTab) {
        // Update state and URL
        setCurrentTab(savedTab)
        router.replace(`/subjects/${subjectId}?tab=${savedTab}`, { scroll: false })
      }
    }
  }, [subjectId, urlTab, router])


  /* ... existing state ... */
  const userRef = useRef(null)

  useEffect(() => {
    userRef.current = user
  }, [user])

  const loadSubjectData = async (userId) => {
    await Promise.all([
        loadSubject(), 
        loadTopics(), 
        loadDependencies(),
        loadAnalytics(userId)
    ])
  }
  
  const loadAnalytics = async (userId) => {
    const targetUserId = userId || userRef.current?.id
    if (!targetUserId) return

    const [weak, stats] = await Promise.all([
        getWeakTopics(subjectId),
        getStudyTimeByWeek(targetUserId, subjectId)
    ])

    setAnalytics({
        weakTopics: weak || [],
        weeklyData: stats?.weekData || [],
        totalMinutes: stats?.totalMinutes || 0
    })
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
    // Optimization: Select only necessary fields for the list view and recommendations
    const { data, error } = await supabase
      .from('topics')
      .select('id, title, description, status, estimated_minutes, difficulty, next_review_at, subject_id, created_at, repetition_count, interval_days, difficulty_factor, user_notes')
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

    // Manual topics are always available by default
    const status = 'available'

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

  const handleDeleteTopic = (topic) => {
    setTopicToDelete(topic)
  }

  const confirmDeleteTopic = async () => {
    if (!topicToDelete) return

    const { success, error } = await deleteTopic(topicToDelete.id)

    if (!success) {
      console.error('Error deleting topic:', error)
      toast.error('Failed to delete topic')
    } else {
      toast.success('Topic deleted successfully')
      loadTopics()
      setIsTopicDetailsOpen(false) // Close details if open
      setTopicToDelete(null)
    }
  }

  const handleUpdateTopic = async () => {
    if (!topicEditForm.title.trim()) {
      toast.error('Topic title cannot be empty')
      return
    }

    const { error } = await supabase
      .from('topics')
      .update({
        title: topicEditForm.title,
        description: topicEditForm.description
      })
      .eq('id', selectedTopic.id)

    if (error) {
      console.error('Error updating topic:', error)
      toast.error('Failed to update topic')
    } else {
      toast.success('Topic updated successfully')
      loadTopics()
      setIsTopicDetailsOpen(false)
    }
  }



  const openTopicDetails = async (topic) => {
    setSelectedTopic(topic)
    setIsTopicDetailsOpen(true)
    
    // Initial state
    setTopicEditForm({
      title: topic.title,
      description: topic.description || ''
    })
  }

  const handleNodeClick = (node) => {
    // node.data contains the full topic object passed from GraphVisualizer
    openTopicDetails(node.data)
  }

  const handlePaneContextMenu = (event) => {
    event.preventDefault()
    setIsCreateTopicOpen(true)
  }

  const handleAIGenerate = async () => {
    if (!String(subject?.description || '').trim() || !String(subject?.syllabus || '').trim()) {
      toast.error('Add both a subject description and syllabus before using AI curriculum generation')
      setUpdatedSubject({
        title: subject?.title || '',
        description: subject?.description || '',
        syllabus: subject?.syllabus || ''
      })
      setEditMode('all')
      setIsEditSubjectOpen(true)
      return
    }

    if (!aiConfig.seedText.trim()) {
      toast.error('Please enter a description or context')
      return
    }

    setAiGenerating(true)

    try {
      const response = await fetch('/api/generate-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId,
          seedText: aiConfig.seedText,
          difficulty: aiConfig.difficulty,
          totalMinutes: aiConfig.totalMinutes
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'AI generation failed')
      }

      toast.success(`Created ${result.topicsCreated} topics with ${result.dependenciesCreated} dependencies!`)
      setIsAIGenerateOpen(false)
      setAiConfig({ seedText: '', difficulty: 3, totalMinutes: 300 })
      loadSubjectData()
    } catch (error) {
      console.error('AI generation error:', error)
      toast.error(error.message || 'Failed to generate curriculum')
    } finally {
      setAiGenerating(false)
    }
  }



  const handleLinkTopics = async () => {
    if (!linkConfig.parentTopicId || !linkConfig.childTopicId) {
      toast.error('Please select both topics')
      return
    }

    if (linkConfig.parentTopicId === linkConfig.childTopicId) {
      toast.error('Cannot link a topic to itself')
      return
    }

    const { success, error } = await createDependency(subjectId, linkConfig.childTopicId, linkConfig.parentTopicId)

    if (success) {
      toast.success('Topics linked successfully!')
      setIsLinkTopicsOpen(false)
      setLinkConfig({ parentTopicId: '', childTopicId: '' })
      loadSubjectData() // Reload everything to update graph and statuses
    } else {
      toast.error(error || 'Failed to link topics')
    }
  }

  const handleDeleteDependency = (dependencyId) => {
    setDependencyToDelete(dependencyId)
  }

  const confirmDeleteDependency = async () => {
    if (!dependencyToDelete) return

    const { success, error } = await deleteDependency(subjectId, dependencyToDelete)

    if (success) {
      toast.success('Connection removed')
      loadSubjectData()
      setDependencyToDelete(null)
    } else {
      toast.error(error || 'Failed to remove connection')
    }
  }

  const handleGraphConnect = async (params) => {
    // ReactFlow source = "From" node, target = "To" node.
    // In our dependency logic: Arrow points from Prerequisite -> Next Topic.
    // So Source is Prereq (depends_on_topic_id), Target is Topic (topic_id).
    // createDependency(subjectId, topicId, dependsOnTopicId)
    // -> createDependency(subjectId, params.target, params.source)
    
    // Prevent self-connection (handled by createDependency but being defensive is good)
    if (params.source === params.target) return

    const { success, error } = await createDependency(subjectId, params.target, params.source)

    if (success) {
      toast.success('Topics linked!')
      loadSubjectData()
    } else {
      toast.error(error || 'Failed to link topics')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'locked': return 'text-muted-foreground' 
      case 'available': return 'text-primary' 
      case 'learning': return 'text-sky-500' 
      case 'reviewing': return 'text-orange-500' 
      case 'mastered': return 'text-emerald-500' 
      default: return 'text-muted-foreground'
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'locked': return 'bg-muted/10 text-muted-foreground border-border/50'
      case 'available': return 'bg-primary/10 text-primary border-primary/20'
      case 'learning': return 'bg-sky-500/10 text-sky-500 border-sky-500/20'
      case 'reviewing': return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
      case 'mastered': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
      default: return 'bg-muted/20 text-muted-foreground'
    }
  }

  const handleTabChange = (value) => {
    setCurrentTab(value) // Optimistic update
    localStorage.setItem(`subject_tab_${subjectId}`, value)
    window.history.replaceState(null, '', `/subjects/${subjectId}?tab=${value}`)
  }

  const handleTogglePublic = async (checked) => {
    // Optimistic update
    const previousState = subject.is_public
    setSubject({ ...subject, is_public: checked })

    const { success, error } = await updateSubjectVisibility(subjectId, checked)
    
    if (success) {
      toast.success(checked ? 'Subject is now public' : 'Subject is now private')
    } else {
      setSubject({ ...subject, is_public: previousState }) // Revert
      toast.error(error || 'Failed to update visibility')
    }
  }

  const handleCopyLink = () => {
    // Construct the public link. Assuming protocol and host from window location or env.
    const url = `${window.location.origin}/u/${encodeURIComponent(user?.email?.split('@')[0] || 'user')}/subjects/${subjectId}`
    navigator.clipboard.writeText(url)
    setIsCopied(true)
    toast.success('Public link copied to clipboard!')
    setTimeout(() => setIsCopied(false), 2000)
  }

  if (loading || !subject) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">Loading Subject...</span>
        </div>
      </div>
    )
  }

  // AI Generation Loading Overlay
  if (aiGenerating) {
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
            Our agents are analyzing the topic, structuring dependencies, and generating a personalized learning path.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100dvh-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex flex-col overflow-hidden bg-background selection:bg-primary/20 selection:text-primary">
      {/* Top Bar */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-md z-20 shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="hover:bg-white/5 shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="hover:bg-white/5 shrink-0 hidden sm:flex">
                <Home className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">{subject.title}</h1>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-muted-foreground hover:text-white shrink-0"
                    onClick={() => {
                      setUpdatedSubject({ title: subject.title, description: subject.description || '', syllabus: subject.syllabus || '' })
                      setEditMode('all')
                      setIsEditSubjectOpen(true)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground truncate">{topics.length} topics</p>
              </div>
            </div>
            <div className="flex gap-2 items-center shrink-0 ml-2">
              {/* Desktop Actions */}
              <div className="hidden md:flex items-center gap-2">
                  {/* Public Toggle & Share */}
                  {subject && (
                    <div className="flex items-center gap-2 mr-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/5">
                      {subject.is_public ? (
                          <Globe className="h-4 w-4 text-sky-400" />
                      ) : (
                          <Lock className="h-4 w-4 text-zinc-400" />
                      )}
                      <Label htmlFor="public-mode" className="text-xs font-medium cursor-pointer">
                          {subject.is_public ? 'Public' : 'Private'}
                      </Label>
                      <Switch 
                          id="public-mode"
                          checked={subject.is_public || false}
                          onCheckedChange={handleTogglePublic}
                          className="ml-1 scale-75 data-[state=checked]:bg-sky-500 data-[state=unchecked]:bg-zinc-600 dark:data-[state=unchecked]:bg-zinc-700"
                      />
                    </div>
                  )}
                  
                  {subject?.is_public && (
                    <Button 
                        variant="outline" 
                        size="sm"
                        className="glass border-sky-500/20 text-sky-400 hover:bg-sky-500/10 hover:text-sky-300 mr-2 px-3"
                        onClick={handleCopyLink}
                    >
                        {isCopied ? <Check className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}
                        <span>{isCopied ? 'Copied' : 'Share'}</span>
                    </Button>
                  )}

                  <Button onClick={() => setIsAIGenerateOpen(true)} variant="outline" className="glass border-primary/30 hover:bg-primary/10 hover:border-primary/50 text-primary px-4">
                    <Sparkles className="mr-2 h-5 w-5" />
                    <span>AI Generate</span>
                  </Button>
                  <Button onClick={() => setIsLinkTopicsOpen(true)} variant="outline" className="glass border-white/10 hover:bg-white/5 px-4">
                    <Network className="mr-2 h-5 w-5" />
                    <span>Link</span>
                  </Button>
                  <Button onClick={() => setIsCreateTopicOpen(true)} className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-4">
                    <Plus className="mr-2 h-5 w-5" />
                    <span>Add Topic</span>
                  </Button>
                  <ThemeToggle />
              </div>

              {/* Mobile Sidebar Trigger */}
              <div className="md:hidden flex items-center">
                  <Sheet>
                      <SheetTrigger asChild>
                          <Button variant="ghost" size="icon" className="hover:bg-white/5">
                              <Menu className="h-6 w-6" />
                          </Button>
                      </SheetTrigger>

                      <SheetContent className="flex flex-col gap-6 w-[85vw] sm:w-[350px] bg-background text-foreground border-l border-border/50 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                    <SheetHeader>
                      <SheetTitle className="text-left text-xl font-bold flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" />
                        Actions
                      </SheetTitle>
                    </SheetHeader>
                    <div className="flex flex-col gap-4 mt-2">
                       {/* Visibility Toggle */}
                       {subject && (
                         <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                          <div className="flex items-center gap-3">
                             {subject.is_public ? (
                                 <Globe className="h-4 w-4 text-sky-500" />
                             ) : (
                                 <Lock className="h-4 w-4 text-muted-foreground" />
                             )}
                             <span className="text-sm font-medium">Public Access</span>
                          </div>
                          <Switch 
                              checked={subject.is_public || false}
                              onCheckedChange={handleTogglePublic}
                              className="scale-90 data-[state=checked]:bg-sky-500"
                          />
                         </div>
                       )}

                       {subject?.is_public && (
                          <Button 
                              variant="outline" 
                              onClick={handleCopyLink}
                              className="w-full justify-start h-12 text-sky-500 border-sky-500/20 hover:bg-sky-500/10 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300"
                          >
                              {isCopied ? <Check className="mr-3 h-5 w-5" /> : <Share2 className="mr-3 h-5 w-5" />}
                              {isCopied ? 'Link Copied' : 'Share Public Link'}
                          </Button>
                       )}

                       <div className="h-px bg-border/50 my-1" />

                       <Button onClick={() => setIsAIGenerateOpen(true)} variant="outline" className="w-full justify-start h-12 border-primary/20 hover:bg-primary/5 hover:text-primary hover:border-primary/50">
                          <Sparkles className="mr-3 h-5 w-5 text-primary" />
                          AI Generate
                       </Button>

                       <Button onClick={() => setIsLinkTopicsOpen(true)} variant="outline" className="w-full justify-start h-12 border-border/50 hover:bg-muted/50">
                          <Network className="mr-3 h-5 w-5 text-muted-foreground" />
                          Link Topics
                       </Button>

                         <Button onClick={() => setIsCreateTopicOpen(true)} className="w-full justify-start h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
                          <Plus className="mr-3 h-5 w-5" />
                          Add New Topic
                        </Button>
                    </div>

                    <div className="mt-auto border-t border-border/50 pt-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Theme</span>
                            <ThemeToggle />
                        </div>
                    </div>
                  </SheetContent>
                  </Sheet>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
          <div className="container mx-auto px-6 pt-4 shrink-0">
            <TabsList className="bg-white/5 border border-white/5 p-1 w-full sm:w-auto flex overflow-x-auto overflow-y-hidden no-scrollbar justify-start h-auto">
              <TabsTrigger value="overview" className="data-[state=active]:bg-background/50 shrink-0">Overview</TabsTrigger>
              <TabsTrigger value="graph" className="data-[state=active]:bg-background/50 shrink-0">Knowledge Graph</TabsTrigger>
              <TabsTrigger value="topics" className="data-[state=active]:bg-background/50 shrink-0">All Topics</TabsTrigger>
              <TabsTrigger value="notes" className="data-[state=active]:bg-background/50 flex items-center gap-1.5 shrink-0"><Pencil className="h-3 w-3" />Notes</TabsTrigger>
              <TabsTrigger value="cheatsheet" className="data-[state=active]:bg-background/50 flex items-center gap-1.5 shrink-0"><Sparkles className="h-3 w-3" />Cheat Sheet</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] container mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              {/* Left Column: Metrics & Stats */}
              <div className="lg:col-span-2 space-y-6">
                 {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {/* 1. Total Topics */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Total</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{topics.length}</div>
                    </CardContent>
                  </Card>
                  
                  {/* 2. Available */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Newly Unlocked Topics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">
                        {topics.filter(t => t.status === 'available').length}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 3. Learning */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Learning</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-sky-500">
                        {topics.filter(t => t.status === 'learning').length}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 4. Reviewing */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Reviewing</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-500">
                        {topics.filter(t => t.status === 'reviewing').length}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 5. Mastered */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Mastered</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-emerald-500">
                        {topics.filter(t => t.status === 'mastered').length}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 6. Percentage */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Completion</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-primary">
                        {topics.length > 0 
                          ? ((topics.filter(t => t.status === 'mastered').length / topics.length) * 100).toFixed(2)
                          : '0.00'}%
                      </div>
                    </CardContent>
                  </Card>
                </div>


                {/* Weak Topics Widget - Show conditionally if there are weak topics */}
                {analytics.weakTopics?.length > 0 && (
                  <WeakTopicsWidget topics={analytics.weakTopics} />
                )}

                {/* Weekly Stats */}
                <WeeklyStats 
                    data={analytics.weeklyData || []} 
                    totalMinutes={analytics.totalMinutes || 0} 
                />

                {/* Subject description */}
                {subject.description && (
                  <Card className="glass-card group relative">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl">Subject Description</CardTitle>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setUpdatedSubject({ title: subject.title, description: subject.description || '', syllabus: subject.syllabus || '' })
                            setEditMode('notes')
                            setIsEditSubjectOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{subject.description}</p>
                    </CardContent>
                  </Card>
                )}
                {subject.syllabus && (
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="text-xl">Syllabus</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{subject.syllabus}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right Column: Recommendation Engine */}
              <div className="lg:col-span-1 h-full">
                <RecommendationWidget topics={topics} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="graph" className="flex-1 h-full p-0 data-[state=active]:flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
            <div className="h-full w-full bg-black/20">
              <GraphVisualizer
                topics={topics}
                dependencies={dependencies}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleDeleteDependency}
                onConnect={handleGraphConnect}
                onPaneContextMenu={handlePaneContextMenu}
              />
            </div>
          </TabsContent>

          <TabsContent value="topics" className="flex-1 overflow-y-auto p-6 space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] container mx-auto">
            {topics.length === 0 ? (
              <Card className="glass-card border-dashed border-foreground/10">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 bg-foreground/5 rounded-full flex items-center justify-center mb-6 text-muted-foreground">
                    <BookOpen className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">No Topics Yet</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm text-center">Start building your knowledge base by adding your first topic manually or using AI generation.</p>
                  <Button onClick={() => setIsCreateTopicOpen(true)} variant="secondary">
                    <Plus className="mr-2 h-5 w-5" />
                    Add First Topic
                  </Button>
                </CardContent>
              </Card>
            ) : (
              topics.map((topic) => {
                const isDue = topic.next_review_at && isDueForReview(topic.next_review_at)
                return (
                  <Card key={topic.id} className="glass-card hover:bg-white/5 transition-all group border-white/5 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 relative z-10">
                          <CardTitle className="text-lg md:text-xl font-bold mb-3 flex flex-wrap items-center gap-2">
                            {topic.title}
                             <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${getStatusBadge(topic.status)}`}>
                              {topic.status}
                            </span>
                          </CardTitle>
                          <CardDescription className="line-clamp-2 text-muted-foreground text-sm md:text-base">{topic.description || 'No description'}</CardDescription>
                        </div>
                        <div onClick={(e) => e.stopPropagation()} className="relative z-10">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                      <MoreVertical className="h-4 w-4" />
                                  </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover/95 backdrop-blur-md border-border">
                                  <DropdownMenuItem onClick={() => openTopicDetails(topic)} className="cursor-pointer focus:bg-accent focus:text-accent-foreground">
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeleteTopic(topic)} className="cursor-pointer text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/10 focus:text-red-600 dark:focus:text-red-400">
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete Topic
                                  </DropdownMenuItem>
                              </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="relative z-10 pt-2 md:pt-0">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs md:text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-foreground/50"></span> {topic.estimated_minutes} min</span>
                          <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-foreground/50"></span> Difficulty: {topic.difficulty}/5</span>
                          {topic.next_review_at && (
                            <span className={`flex items-center gap-1.5 ${isDue ? 'text-destructive font-semibold' : ''}`}>
                              <span className="w-1 h-1 rounded-full bg-foreground/50"></span>
                              {isDue ? 'Due now' : `Next: ${new Date(topic.next_review_at).toLocaleDateString('en-GB')}`}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                          {(topic.status === 'available' || topic.status === 'learning') && (
                            <Button 
                              size="sm" 
                              onClick={() => router.push(`/learn/${topic.id}`)}
                              className="w-full md:w-auto bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                            >
                              <Play className="mr-1 h-4 w-4" />
                              Learn
                            </Button>
                          )}
                          {(topic.status === 'reviewing' || topic.status === 'mastered') && (
                            <Button 
                              onClick={() => router.push(`/review/${topic.id}`)}
                              variant={isDue ? "default" : "outline"}
                              className={isDue ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90" : "border-foreground/10 hover:bg-foreground/5"}
                            >
                              <RotateCw className="mr-1 h-4 w-4" />
                              Review
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="flex-1 overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] container mx-auto">
             <div className="flex flex-col gap-6 max-w-4xl mx-auto h-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                   <div>
                     <h2 className="text-2xl font-bold tracking-tight">Compiled Notes</h2>
                     <p className="text-muted-foreground text-sm">All the sticky notes you&apos;ve taken across this subject&apos;s topics.</p>
                   </div>
                   <Button onClick={handleDownloadNotes} variant="outline" className="glass hover:bg-white/5 shrink-0 w-full sm:w-auto">
                     <Download className="mr-2 h-4 w-4" /> Download .md
                   </Button>
                </div>

                <div className="flex-1 space-y-8">
                   {topics.filter(t => t.user_notes && t.user_notes.trim().length > 0).length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border/50 rounded-xl bg-muted/10 h-64">
                         <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <Pencil className="h-8 w-8 text-primary/50" />
                         </div>
                         <h3 className="text-xl font-semibold mb-2">No Notes Yet</h3>
                         <p className="text-muted-foreground max-w-sm">
                            Open a topic and click the sticky note icon to jot down your thoughts. They&apos;ll appear here!
                         </p>
                      </div>
                   ) : (
                     <div className="space-y-6">
                        {topics
                          .filter(t => t.user_notes && t.user_notes.trim().length > 0)
                          .map((topic, index) => {
                            // Assign an alternating visual color theme block based on index
                            const themeColors = [
                               { wrapper: 'border-blue-500/30 bg-blue-500/5', title: 'text-blue-500', marker: 'bg-blue-500' },
                               { wrapper: 'border-emerald-500/30 bg-emerald-500/5', title: 'text-emerald-500', marker: 'bg-emerald-500' },
                               { wrapper: 'border-purple-500/30 bg-purple-500/5', title: 'text-purple-500', marker: 'bg-purple-500' },
                               { wrapper: 'border-amber-500/30 bg-amber-500/5', title: 'text-amber-500', marker: 'bg-amber-500' },
                               { wrapper: 'border-rose-500/30 bg-rose-500/5', title: 'text-rose-500', marker: 'bg-rose-500' }
                            ];
                            const theme = themeColors[index % themeColors.length];

                            return (
                               <div key={topic.id} className={`p-6 rounded-xl border ${theme.wrapper} relative overflow-hidden group`}>
                                  <div className={`absolute top-0 left-0 w-1 h-full ${theme.marker}`} />
                                  
                                  <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                                    <h3 className={`font-bold text-lg flex items-center gap-2 ${theme.title}`}>
                                       {topic.title}
                                    </h3>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-8 text-xs hover:bg-white/10"
                                      onClick={() => router.push(`/learn/${topic.id}`)}
                                    >
                                      Go to Topic <ArrowLeft className="w-3 h-3 ml-2 rotate-180" />
                                    </Button>
                                  </div>

                                   <div className="prose dark:prose-invert prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-headings:text-slate-800 dark:prose-headings:text-slate-100 max-w-none text-sm leading-relaxed" style={{ fontFamily: "'Virgil', cursive" }}>
                                       <ReactMarkdown 
                                            remarkPlugins={[remarkGfm]}
                                            components={noteMarkdownComponents}
                                         >
                                             {topic.user_notes}
                                         </ReactMarkdown>
                                  </div>
                               </div>
                            )
                          })
                        }
                     </div>
                   )}
                </div>
             </div>
          </TabsContent>

          {/* Cheat Sheet Tab */}
          <TabsContent value="cheatsheet" className="flex-1 overflow-y-auto p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] container mx-auto">
            <div className="flex flex-col gap-6 max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                 <div>
                   <h2 className="text-2xl font-bold tracking-tight">AI Cheat Sheet</h2>
                   <p className="text-muted-foreground text-sm">A condensed, high-yield study guide summarizing all topics.</p>
                 </div>
                 {subject?.cheat_sheet && (
                   <div className="flex gap-2 w-full sm:w-auto">
                     <Button onClick={handleDownloadCheatSheetPDF} variant="outline" className="glass hover:bg-white/5 flex-1 sm:flex-initial">
                       <Download className="mr-2 h-4 w-4" />
                       Download PDF
                     </Button>
                     <Button onClick={handleGenerateCheatSheet} disabled={isGeneratingCheatSheet} variant="outline" className="glass hover:bg-white/5 flex-1 sm:flex-initial">
                       {isGeneratingCheatSheet ? <RotateCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                       Regenerate
                     </Button>
                   </div>
                 )}
              </div>

              {!subject?.cheat_sheet ? (
                 <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border/50 rounded-xl bg-muted/10 h-64">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                       <Sparkles className="h-8 w-8 text-primary/50" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No Cheat Sheet Generated</h3>
                    <p className="text-muted-foreground max-w-sm mb-6">
                       Let the AI analyze all topics in this subject and synthesize a dense 2-page master study guide containing core definitions, equations, and diagrams.
                    </p>
                    <Button onClick={handleGenerateCheatSheet} disabled={isGeneratingCheatSheet || topics.length === 0} className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                       {isGeneratingCheatSheet ? (
                         <>
                           <RotateCw className="mr-2 h-5 w-5 animate-spin" /> Synthesizing...
                         </>
                       ) : (
                         <>
                           <Sparkles className="mr-2 h-5 w-5" /> Generate Cheat Sheet
                         </>
                       )}
                    </Button>
                    {topics.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-4">You must add topics before generating a cheat sheet.</p>
                    )}
                 </div>
              ) : (
                <div className="p-8 md:p-10 rounded-xl border border-white/10 bg-card shadow-xl relative group mb-8">
                  <div id="cheat-sheet-content" className="prose dark:prose-invert prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-headings:text-slate-800 dark:prose-headings:text-slate-100 max-w-none text-base md:text-lg leading-relaxed marker:text-primary pb-8">
                      <ReactMarkdown 
                           remarkPlugins={[remarkGfm]}
                           components={MarkdownComponents}
                        >
                            {sanitizeLatex(subject.cheat_sheet)}
                        </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Subject Dialog */}
      <Dialog open={isEditSubjectOpen} onOpenChange={setIsEditSubjectOpen}>
        <DialogContent className="bg-card border-white/10 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Subject Details</DialogTitle>
            <DialogDescription>Update your subject title, AI context, and syllabus.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-subject-title">Subject Title</Label>
              <Input
                id="edit-subject-title"
                value={updatedSubject.title}
                onChange={(e) => setUpdatedSubject({ ...updatedSubject, title: e.target.value })}
                className="bg-background/50 border-white/10 focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subject-description">Subject Description</Label>
              <Textarea
                id="edit-subject-description"
                placeholder="Explain the scope, learner level, goals, and teacher guidance for this subject..."
                value={updatedSubject.description}
                onChange={(e) => setUpdatedSubject({ ...updatedSubject, description: e.target.value })}
                className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subject-syllabus">Syllabus</Label>
              <Textarea
                id="edit-subject-syllabus"
                placeholder="List the chapters, modules, or syllabus points this course should cover..."
                value={updatedSubject.syllabus}
                onChange={(e) => setUpdatedSubject({ ...updatedSubject, syllabus: e.target.value })}
                className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[140px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditSubjectOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateSubject}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Create Topic Dialog */}
      <Dialog open={isCreateTopicOpen} onOpenChange={setIsCreateTopicOpen}>

        <DialogContent className="bg-card border-white/10 w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Topic</DialogTitle>
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
                className="bg-background/50 border-white/10 focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-description">Description</Label>
              <Textarea
                id="topic-description"
                placeholder="Brief overview of what this topic covers..."
                value={newTopic.description}
                onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-content">Content</Label>
              <Textarea
                id="topic-content"
                placeholder="Detailed learning content, notes, or resources..."
                value={newTopic.content}
                onChange={(e) => setNewTopic({ ...newTopic, content: e.target.value })}
                className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[120px]"
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
                  className="bg-background/50 border-white/10 focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select
                  value={newTopic.difficulty.toString()}
                  onValueChange={(value) => setNewTopic({ ...newTopic, difficulty: parseInt(value) })}
                >
                  <SelectTrigger className="bg-background/50 border-white/10 focus:border-primary/50">
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
            <Button variant="ghost" onClick={() => setIsCreateTopicOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTopic}>Create Topic</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Generate Dialog */}
      <Dialog open={isAIGenerateOpen} onOpenChange={setIsAIGenerateOpen}>
        <DialogContent className="bg-card border-white/10 w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              AI Curriculum Generator
            </DialogTitle>
            <DialogDescription>
              Let AI create a complete learning path with topics and dependencies for your subject.
            </DialogDescription>
          </DialogHeader>
          {aiGenerating ? (
            <ThreeDLoadingBar />
          ) : (
            <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="seed-text">Subject Context & Goals</Label>
              <Textarea
                id="seed-text"
                placeholder="e.g., I want to learn Python programming from basics to building web applications. Include data structures, OOP, and Flask framework."
                value={aiConfig.seedText}
                onChange={(e) => setAiConfig({ ...aiConfig, seedText: e.target.value })}
                className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Describe what you want to learn. The more specific, the better!
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-difficulty">Target Difficulty</Label>
                <Select
                  value={aiConfig.difficulty.toString()}
                  onValueChange={(value) => setAiConfig({ ...aiConfig, difficulty: parseInt(value) })}
                >
                  <SelectTrigger className="bg-background/50 border-white/10 focus:border-primary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Beginner</SelectItem>
                    <SelectItem value="2">2 - Easy</SelectItem>
                    <SelectItem value="3">3 - Intermediate</SelectItem>
                    <SelectItem value="4">4 - Advanced</SelectItem>
                    <SelectItem value="5">5 - Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="total-minutes">Total Study Time (minutes)</Label>
                <Input
                  id="total-minutes"
                  type="number"
                  min="60"
                  max="1000"
                  step="30"
                  value={aiConfig.totalMinutes}
                  onChange={(e) => setAiConfig({ ...aiConfig, totalMinutes: parseInt(e.target.value) || 300 })}
                  className="bg-background/50 border-white/10 focus:border-primary/50"
                />
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-primary/80">
                💡 AI will generate a complete, comprehensive study plan. 
                This process involves creating detailed content for every topic, so effective preparation may take a while.
                Please be patient while we set up your personalized resources.
              </p>
            </div>
          </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAIGenerateOpen(false)} disabled={aiGenerating}>
              Cancel
            </Button>
            {!aiGenerating && (
                <Button onClick={handleAIGenerate} className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Curriculum
                </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Link Topics Dialog */}
      <Dialog open={isLinkTopicsOpen} onOpenChange={setIsLinkTopicsOpen}>
        <DialogContent className="bg-card border-white/10 w-[95vw] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Link Topics</DialogTitle>
            <DialogDescription>Create a dependency: user must learn Parent before Child.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="parent-topic">Parent Topic (Prerequisite)</Label>
              <Select
                value={linkConfig.parentTopicId}
                onValueChange={(value) => setLinkConfig({ ...linkConfig, parentTopicId: value })}
              >
                <SelectTrigger className="bg-background/50 border-white/10 focus:border-primary/50">
                  <SelectValue placeholder="Select prerequisite..." />
                </SelectTrigger>
                <SelectContent>
                  {topics.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex justify-center text-muted-foreground">
                <ArrowLeft className="h-4 w-4 rotate-[-90deg]" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="child-topic">Child Topic (Locked)</Label>
              <Select
                value={linkConfig.childTopicId}
                onValueChange={(value) => setLinkConfig({ ...linkConfig, childTopicId: value })}
              >
                <SelectTrigger className="bg-background/50 border-white/10 focus:border-primary/50">
                  <SelectValue placeholder="Select target topic..." />
                </SelectTrigger>
                <SelectContent>
                  {topics.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsLinkTopicsOpen(false)}>Cancel</Button>
            <Button onClick={handleLinkTopics}>Create Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dependency Alert */}
      <AlertDialog open={!!dependencyToDelete} onOpenChange={(open) => !open && setDependencyToDelete(null)}>
        <AlertDialogContent className="bg-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this dependency? The child topic might become available if it has no other prerequisites.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteDependency} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Topic Details & Edit Dialog */}
      <Dialog open={isTopicDetailsOpen} onOpenChange={setIsTopicDetailsOpen}>
        <DialogContent 
          className="bg-card border-border/10 w-[95vw] sm:max-w-[500px] max-h-[85vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Topic Details</DialogTitle>
            <DialogDescription>View and edit topic information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-topic-title">Topic Title</Label>
              <Input
                id="edit-topic-title"
                value={topicEditForm.title}
                onChange={(e) => setTopicEditForm({ ...topicEditForm, title: e.target.value })}
                className="bg-background/50 border-input focus:border-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-topic-description">Description</Label>
              <Textarea
                id="edit-topic-description"
                value={topicEditForm.description}
                onChange={(e) => setTopicEditForm({ ...topicEditForm, description: e.target.value })}
                className="bg-background/50 border-input focus:border-primary/50 min-h-[100px]"
              />
            </div>

            {selectedTopic && (
              <div className="flex items-center justify-between pt-2">
                <div className="text-sm text-muted-foreground">
                  Status: <span className={`uppercase font-bold ${getStatusColor(selectedTopic.status)}`}>{selectedTopic.status}</span>
                </div>
                {selectedTopic.status !== 'locked' && (
                  <Button 
                    size="sm" 
                    onClick={() => router.push(selectedTopic.status === 'available' || selectedTopic.status === 'learning' ? `/learn/${selectedTopic.id}` : `/review/${selectedTopic.id}`)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                  >
                    <Play className="mr-1 h-3 w-3" />
                    {selectedTopic.status === 'available' || selectedTopic.status === 'learning' ? 'Start Learning' : 'Review'}
                  </Button>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between items-center w-full gap-3 sm:gap-0 mt-6">
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => handleDeleteTopic(selectedTopic)}
              className="w-full sm:w-auto bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 border mt-2 sm:mt-0"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Topic
            </Button>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Button variant="ghost" onClick={() => setIsTopicDetailsOpen(false)} className="w-full sm:w-auto order-1 sm:order-none">Cancel</Button>
              <Button onClick={handleUpdateTopic} className="w-full sm:w-auto">Save Changes</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Topic Alert */}
      <AlertDialog open={!!topicToDelete} onOpenChange={(open) => !open && setTopicToDelete(null)}>
        <AlertDialogContent className="bg-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Topic?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete the topic <span className="font-semibold text-foreground">&quot;{topicToDelete?.title}&quot;</span>? 
              This will remove all associated content and dependencies. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTopic} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
