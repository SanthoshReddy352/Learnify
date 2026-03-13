'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Check, Clock, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { startLearningSession, completeLearning, logStudyActivity } from '@/lib/actions'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { ThemeToggle } from '@/components/sub-components/theme-toggle'


import CodeBlock, { cleanCodeContent } from '@/components/sub-components/CodeBlock'
import Flashcard from '@/components/sub-components/Flashcard'
import DoubtChat from '@/components/sub-components/DoubtChat'
import StickyNoteWidget from '@/components/sub-components/StickyNoteWidget'
import SelectionHighlighter from '@/components/sub-components/SelectionHighlighter'


import MarkdownComponents from '@/components/sub-components/MarkdownComponents'

export default function LearnPage() {
  const router = useRouter()
  const params = useParams()
  const topicId = params.topicId
  const [topic, setTopic] = useState(null)
  const [subject, setSubject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [startTime, setStartTime] = useState(null)
  const [progress, setProgress] = useState(0)
  const [showFlashcards, setShowFlashcards] = useState(false)
  const [currentCard, setCurrentCard] = useState(0)
  const [flashcards, setFlashcards] = useState([])
  const [isFlipped, setIsFlipped] = useState(false)
  const [generating, setGenerating] = useState(false)
  
  // Refs for reliable access in cleanup
  const startTimeRef = useRef(Date.now())
  const sessionLoggedRef = useRef(false)
  const topicIdRef = useRef(topicId)

  // Update refs when state changes
  useEffect(() => {
      topicIdRef.current = topicId
      startTimeRef.current = Date.now()
      sessionLoggedRef.current = false
  }, [topicId])

  useEffect(() => {
    loadTopicData()
  }, [topicId])

  const supabase = createClient()

  useEffect(() => {
    // Logging on unmount
    return () => {
        if (!sessionLoggedRef.current && startTimeRef.current) {
            const duration = (Date.now() - startTimeRef.current) / 60000
            if (duration > 0.05) { // Log if > 3 seconds
                logStudyActivity(topicIdRef.current, duration)
            }
        }
    }
  }, []) // Run once on mount/unmount


  useEffect(() => {
    if (!topic) return

    const durationMinutes = topic.estimated_minutes || 5
    const totalSeconds = durationMinutes * 60
    const incrementPerSecond = 100 / totalSeconds

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          return 100
        }
        return Math.min(prev + incrementPerSecond, 100)
      })
      // Force re-render for timer update if needed, though progress update triggers it.
      // We can calculate elapsed time in render based on Date.now() - startTime but let's just use progress to derive it or a separate state if precise.
      // Actually simpler: let's just use a separate state for elapsed time or derive it.
      // But for "spin" let's just update a counter.
    }, 1000)

    return () => clearInterval(timer)
  }, [topic])

  // Derive elapsed time and format for display
  const totalMinutes = topic ? (topic.estimated_minutes || 5) : 5
  const totalSeconds = totalMinutes * 60
  const elapsedSeconds = (progress / 100) * totalSeconds
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds)
  
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const loadTopicData = async () => {
    if (!topicId) return
    try {
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*, subjects(*)')
        .eq('id', topicId)
        .single()

      if (topicError) {
        console.error('Error loading topic:', topicError)
        toast.error('Failed to load topic')
        router.push('/dashboard')
        return
      }

      setTopic(topicData)
      setSubject(topicData.subjects)
      setLoading(false)

      // Mark as learning if available
      if (topicData.status === 'available') {
        // Run as side effect, don't block
        startLearningSession(topicId).catch(err => console.error("Start session error:", err))
      }
    } catch (err) {
      console.error("Unexpected error in loadTopicData:", err)
      setLoading(false)
      toast.error("Could not load topic data: " + (err.message || String(err)))
    }
  }

  const handleCompleteLearning = async () => {
    const durationMinutes = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 60000) : 0
    
    // Mark as logged so unmount doesn't double-log
    sessionLoggedRef.current = true
    
    const result = await completeLearning(topicId, durationMinutes)
    
    if (result.success) {
      toast.success('Topic completed! You can review it tomorrow.')
      router.push(`/subjects/${subject.id}`)
    } else {
      toast.error('Failed to complete topic')
    }
  }

  const handleRegenerateContent = async () => {
    setGenerating(true)
    try {
        const response = await fetch('/api/generate-topic-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topicId: topic.id,
                subjectTitle: subject.title,
                topicTitle: topic.title,
                topicDescription: topic.description,
                difficulty: topic.difficulty
            })
        })
        
        const result = await response.json()
        
        if (!response.ok) {
            throw new Error(result.error || 'Generation failed')
        }

        toast.success('Content generated successfully!')
        // Update local state
        setTopic({ ...topic, content: result.content })
    } catch (error) {
        console.error('Regeneration error:', error)
        toast.error('Failed to generate content: ' + error.message)
    } finally {
        setGenerating(false)
    }
  }

  const handleShowFlashcards = async () => {
     setShowFlashcards(true)
     
     // If we already have flashcards, don't regenerate to save tokens/time
     if (flashcards.length > 0) return

     setGenerating(true)
     try {
         const response = await fetch('/api/generate-topic-flashcards', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 topicId: topic.id,
                 topicTitle: topic.title,
                 topicDescription: topic.description,
                 content: topic.content
             })
         })

         const result = await response.json()

         if (!response.ok) {
             throw new Error(result.error || 'Failed to generate flashcards')
         }

         if (result.flashcards && result.flashcards.length > 0) {
             setFlashcards(result.flashcards)
             setCurrentCard(0)
             setIsFlipped(false)
         } else {
             throw new Error('No flashcards returned')
         }

     } catch (error) {
         console.error('Flashcard generation error:', error)
         toast.error('Could not generate AI flashcards. Falling back to default.')
         
         // Fallback to default cards
         const fallbackCards = [
            { front: 'What is the main concept?', back: topic.description || 'Review the topic description.' },
            { front: 'Key Takeaway', back: 'Reflect on the most important thing you learned from this section.' },
            { front: 'Self Assessment', back: 'How confident do you feel about this material? (1-5)' }
         ]
         setFlashcards(fallbackCards)
     } finally {
         setGenerating(false)
     }
  }

  // Handle Keyboard Navigation for Flashcards
  useEffect(() => {
    if (!showFlashcards) return

    const handleKeyDown = (e) => {
        if (e.code === 'Space') {
            e.preventDefault()
            setIsFlipped(prev => !prev)
        } else if (e.code === 'ArrowRight') {
            e.preventDefault()
            handleNextCard()
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault()
            handlePrevCard()
        }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFlashcards, currentCard, flashcards.length]) // Dependencies needed

  const handleNextCard = () => {
      setIsFlipped(false)
      setTimeout(() => {
          setCurrentCard(prev => (prev + 1) % flashcards.length)
      }, 150)
  }

  const handlePrevCard = () => {
      setIsFlipped(false)
      setTimeout(() => {
        setCurrentCard(prev => (prev - 1 + flashcards.length) % flashcards.length)
      }, 150)
  }

  if (loading || !topic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
          <Clock className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">Loading Topic...</span>
        </div>
      </div>
    )
  }

  if (showFlashcards) {
    if (generating) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 selection:bg-primary/20 selection:text-primary overflow-hidden relative">
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
                    <h2 className="text-2xl font-bold tracking-tight mb-2">Synthesizing Flashcards...</h2>
                    <p className="text-muted-foreground animate-pulse">Consulting the AI for key concepts</p>
                </div>
            </div>
        )
    }

    if (flashcards.length > 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 selection:bg-primary/20 selection:text-primary overflow-hidden">
        {/* Background Ambient Glow */}
        <div className="fixed inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        <div className="max-w-2xl w-full relative z-10 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="mb-8 flex justify-between items-end">
             <div>
                <Button variant="ghost" onClick={() => setShowFlashcards(false)} className="hover:bg-white/5 -ml-4 mb-2 md:mb-0">
                    <ArrowLeft className="mr-2 h-5 w-5" />
                    Back to Content
                </Button>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <h2 className="text-xl md:text-2xl font-bold tracking-tight">Flashcards</h2>
                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-mono border border-primary/20">
                        {topic.title}
                    </span>
                </div>
             </div>
             <div className="text-right">
                 <div className="text-2xl md:text-3xl font-bold font-mono text-primary">
                    {String(currentCard + 1).padStart(2, '0')}
                    <span className="text-muted-foreground text-lg">/{String(flashcards.length).padStart(2, '0')}</span>
                </div>
             </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-white/5 h-1.5 rounded-full mb-8 overflow-hidden">
             <div 
                className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-500 ease-out" 
                style={{ width: `${((currentCard + 1) / flashcards.length) * 100}%` }}
             />
          </div>

          <Flashcard 
            front={flashcards[currentCard].front}
            back={flashcards[currentCard].back}
            isFlipped={isFlipped}
            onFlip={() => setIsFlipped(!isFlipped)}
          />

          <div className="mt-8 md:mt-12 flex flex-col-reverse md:flex-row justify-between items-center gap-4">
            <Button 
                variant="outline" 
                size="lg"
                onClick={handlePrevCard} 
                className="w-full md:w-auto glass border-white/10 hover:bg-white/5 min-w-[120px]"
            >
              Previous
              <span className="ml-2 text-xs text-muted-foreground hidden md:inline-block border border-white/10 px-1.5 rounded bg-black/20">←</span>
            </Button>

            <div className="flex flex-col items-center gap-2 order-first md:order-none mb-4 md:mb-0">
                 <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium opacity-50">
                    Tap to Flip
                 </span>
            </div>

            {currentCard === flashcards.length - 1 ? (
                 <Button 
                    size="lg"
                    onClick={handleCompleteLearning} 
                    className="w-full md:w-auto bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20 min-w-[120px]"
                 >
                    <Check className="mr-2 h-5 w-5" />
                    Finish
                 </Button>
            ) : (
                <Button 
                    variant="outline"
                    size="lg"
                    onClick={handleNextCard} 
                    className="w-full md:w-auto glass border-white/10 hover:bg-white/5 min-w-[120px]"
                >
                    Next
                    <span className="ml-2 text-xs text-muted-foreground hidden md:inline-block border border-white/10 px-1.5 rounded bg-black/20">→</span>
                </Button>
            )}
          </div>
        </div>
      </div>
    )
    }
  }

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      {/* Fixed Header Container */}
      <div className="fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] bg-background/95 backdrop-blur-md border-b border-white/10 supports-[backdrop-filter]:bg-background/60">
          {/* Main Header */}
          <div className="container mx-auto px-4 md:px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 md:gap-4 min-w-0">
                <Button variant="ghost" size="icon" onClick={() => router.push(`/subjects/${subject.id}`)} className="hover:bg-white/5 shrink-0">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted-foreground truncate">{subject.title}</div>
                  <h1 className="text-base md:text-2xl font-bold tracking-tight truncate">{topic.title}</h1>
                </div>
              </div>
              <div className="flex items-center gap-3 md:gap-4">
                <div className="flex items-center gap-3 bg-white/5 px-3 py-2 rounded-full border border-white/5 shrink-0">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium hidden md:inline">{formatTime(remainingSeconds)} remaining</span>
                  <span className="text-sm font-medium md:hidden">{formatTime(remainingSeconds)}</span>
                </div>
                <ThemeToggle className="hidden md:flex" />
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="border-t border-white/5 bg-white/5">
            <div className="container mx-auto px-6 py-3">
              <Progress value={progress} className="h-1.5 bg-white/10" />
              <div className="text-xs text-muted-foreground mt-2 font-medium uppercase tracking-wider">
                Reading progress: {Math.round(progress)}%
              </div>
            </div>
          </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6 pt-[calc(140px+env(safe-area-inset-top))] md:pt-[calc(160px+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))] max-w-4xl">
        <Card className="glass-card mb-8">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">{topic.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground mt-4">
              <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary"></span> Difficulty: {topic.difficulty}/5</span>
              <span className="hidden sm:inline">•</span>
              <span>Estimated: {topic.estimated_minutes} minutes</span>
            </div>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-p:text-muted-foreground prose-p:leading-relaxed">
            {topic.description && (
              <div className="mb-6 md:mb-8 p-4 md:p-6 bg-white/5 rounded-xl border border-white/5">
                <h3 className="text-lg md:text-xl font-semibold mb-3 text-foreground mt-0">Overview</h3>
                <p className="text-base md:text-lg leading-relaxed m-0">{topic.description}</p>
              </div>
            )}
            
            {topic.content && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h3 className="text-lg md:text-xl font-semibold mb-6 text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Comprehensive Guide
                </h3>
                <div className="markdown-content prose dark:prose-invert prose-p:text-muted-foreground prose-headings:text-foreground prose-strong:text-primary prose-code:text-primary max-w-none break-words">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={MarkdownComponents}
                  >
                    {topic.content}
                  </ReactMarkdown>
                </div>
              </div>
            )}



            {/* Content Logic: Show Generate Button if content is missing OR if it's just the description (placeholder) */}
            {(!topic.content || topic.content === topic.description || topic.content.length < 50) && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-white/5 rounded-xl border border-white/5 border-dashed mt-8">
                {generating ? (
                    <div className="flex flex-col items-center animate-pulse">
                        <Sparkles className="h-10 w-10 mb-4 text-primary animate-spin-slow" />
                        <p>Generating comprehensive guide...</p>
                    </div>
                ) : (
                    <>
                        <Clock className="h-10 w-10 mb-4 opacity-50" />
                        <p className="mb-4">Content seems brief or missing.</p>
                        <Button onClick={handleRegenerateContent} variant="outline" className="border-primary/30 hover:bg-primary/10 text-primary">
                            <Sparkles className="mr-2 h-4 w-4" />
                            Generate Detailed Content
                        </Button>
                    </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col md:flex-row items-center gap-4 justify-center">
          <Button variant="outline" size="lg" onClick={handleShowFlashcards} className="w-full md:w-auto glass border-white/10 hover:bg-white/5">
            Practice with Flashcards
          </Button>
          <Button size="lg" onClick={handleCompleteLearning} className="w-full md:w-auto bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 h-12 md:h-11">
            <Check className="mr-2 h-5 w-5" />
            Mark as Learned
          </Button>
        </div>
        </div>

        {/* Doubt Chat Bot - Only visible if content is generated */}
        <DoubtChat 
          topicId={topicId}
          topicTitle={topic.title}
          subjectTitle={subject.title}
          contentStatus={!!(topic.content && topic.content !== topic.description && topic.content.length > 50)}
        />

        {/* Sticky Note Widget */}
        <StickyNoteWidget 
          topicId={topicId} 
          topicTitle={topic.title}
          initialNotes={topic.user_notes} 
        />

        {/* Text Selection Highlighter */}
        <SelectionHighlighter />
      </div>
  )
}
