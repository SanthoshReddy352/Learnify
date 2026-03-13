'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Check, Clock, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import Flashcard from '@/components/sub-components/Flashcard'
import DoubtChat from '@/components/sub-components/DoubtChat'
import StickyNoteWidget from '@/components/sub-components/StickyNoteWidget'
import SelectionHighlighter from '@/components/sub-components/SelectionHighlighter'
import MarkdownComponents from '@/components/sub-components/MarkdownComponents'

export default function ClassroomLearnPage() {
  const router = useRouter()
  const params = useParams()
  const [topic, setTopic] = useState(null)
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [showFlashcards, setShowFlashcards] = useState(false)
  const [currentCard, setCurrentCard] = useState(0)
  const [flashcards, setFlashcards] = useState([])
  const [isFlipped, setIsFlipped] = useState(false)
  const [generating, setGenerating] = useState(false)

  const startTimeRef = useRef(Date.now())
  const sessionLoggedRef = useRef(false)
  const topicIdRef = useRef(params.topicId)

  const courseHref = `/classrooms/${params.classroomId}/courses/${params.classroomCourseId}`

  useEffect(() => {
    topicIdRef.current = params.topicId
    startTimeRef.current = Date.now()
    sessionLoggedRef.current = false
  }, [params.topicId])

  useEffect(() => {
    loadTopicData()
  }, [params.topicId])

  useEffect(() => {
    return () => {
      if (!sessionLoggedRef.current && startTimeRef.current) {
        const duration = (Date.now() - startTimeRef.current) / 60000
        if (duration > 0.05) {
          fetch(`/api/classrooms/${params.classroomId}/courses/${params.classroomCourseId}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'log',
              topicId: topicIdRef.current,
              durationMinutes: duration
            })
          }).catch(() => {})
        }
      }
    }
  }, [params.classroomId, params.classroomCourseId])

  useEffect(() => {
    if (!topic) {
      return
    }

    const durationMinutes = topic.estimated_minutes || 5
    const totalSeconds = durationMinutes * 60
    const incrementPerSecond = 100 / totalSeconds

    const timer = setInterval(() => {
      setProgress((previous) => Math.min(previous + incrementPerSecond, 100))
    }, 1000)

    return () => clearInterval(timer)
  }, [topic])

  const totalMinutes = topic ? (topic.estimated_minutes || 5) : 5
  const totalSeconds = totalMinutes * 60
  const elapsedSeconds = (progress / 100) * totalSeconds
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds)

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const loadTopicData = async () => {
    try {
      const response = await fetch(`/api/classrooms/${params.classroomId}/courses/${params.classroomCourseId}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load classroom topic')
      }

      const selectedTopic = payload.topics?.find((entry) => entry.id === params.topicId)

      if (!selectedTopic) {
        throw new Error('Topic not found in this classroom course')
      }

      if (selectedTopic.progress?.status === 'locked') {
        throw new Error('Topic is locked')
      }

      if (selectedTopic.progress?.status === 'reviewing' || selectedTopic.progress?.status === 'mastered') {
        router.replace(`${courseHref}/review/${params.topicId}`)
        return
      }

      setTopic(selectedTopic)
      setCourse(payload.classroomCourse)
      setLoading(false)

      if (selectedTopic.progress?.status === 'available') {
        await fetch(`/api/classrooms/${params.classroomId}/courses/${params.classroomCourseId}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            topicId: params.topicId
          })
        })
      }
    } catch (error) {
      toast.error(error.message)
      router.push(courseHref)
    }
  }

  const handleCompleteLearning = async () => {
    const durationMinutes = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 60000) : 0
    sessionLoggedRef.current = true

    const response = await fetch(`/api/classrooms/${params.classroomId}/courses/${params.classroomCourseId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete',
        topicId: params.topicId,
        durationMinutes
      })
    })
    const result = await response.json()

    if (response.ok) {
      toast.success('Topic completed. It is now scheduled for review.')
      router.push(courseHref)
      return
    }

    toast.error(result.error || 'Failed to complete topic')
  }

  const handleRegenerateContent = async () => {
    setGenerating(true)

    try {
      const response = await fetch('/api/generate-topic-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: topic.id,
          subjectTitle: course.subjects?.title,
          topicTitle: topic.title,
          topicDescription: topic.description,
          difficulty: topic.difficulty,
          classroomId: params.classroomId,
          classroomCourseId: params.classroomCourseId
        })
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Generation failed')
      }

      toast.success('Content generated successfully')
      setTopic((current) => ({
        ...current,
        content: result.content,
        hasContent: Boolean(result.content)
      }))
    } catch (error) {
      toast.error('Failed to generate content: ' + error.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleShowFlashcards = async () => {
    setShowFlashcards(true)

    if (flashcards.length > 0) {
      return
    }

    setGenerating(true)
    try {
      const response = await fetch('/api/generate-topic-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: topic.id,
          topicTitle: topic.title,
          topicDescription: topic.description,
          content: topic.content,
          classroomId: params.classroomId,
          classroomCourseId: params.classroomCourseId
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate flashcards')
      }

      if (result.flashcards?.length > 0) {
        setFlashcards(result.flashcards)
        setCurrentCard(0)
        setIsFlipped(false)
      } else {
        throw new Error('No flashcards returned')
      }
    } catch (error) {
      toast.error('Could not generate AI flashcards. Falling back to defaults.')
      setFlashcards([
        { front: 'What is the main concept?', back: topic.description || 'Review the topic summary.' },
        { front: 'Key takeaway', back: 'Summarize the most important idea from this topic.' },
        { front: 'Self-check', back: 'Explain this concept in your own words.' }
      ])
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (!showFlashcards) {
      return
    }

    const handleKeyDown = (event) => {
      if (event.code === 'Space') {
        event.preventDefault()
        setIsFlipped((previous) => !previous)
      } else if (event.code === 'ArrowRight') {
        event.preventDefault()
        handleNextCard()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        handlePrevCard()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFlashcards, currentCard, flashcards.length])

  const handleNextCard = () => {
    setIsFlipped(false)
    setTimeout(() => {
      setCurrentCard((previous) => (previous + 1) % flashcards.length)
    }, 150)
  }

  const handlePrevCard = () => {
    setIsFlipped(false)
    setTimeout(() => {
      setCurrentCard((previous) => (previous - 1 + flashcards.length) % flashcards.length)
    }, 150)
  }

  const handleSaveNotes = async (_topicId, notes) => {
    const response = await fetch(`/api/classrooms/${params.classroomId}/courses/${params.classroomCourseId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-notes',
        topicId: params.topicId,
        notes
      })
    })

    const result = await response.json()
    if (response.ok) {
      return result
    }

    return {
      success: false,
      error: result.error || 'Failed to save notes'
    }
  }

  if (loading || !topic || !course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
          <Clock className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">Loading topic...</span>
        </div>
      </div>
    )
  }

  if (showFlashcards) {
    if (generating) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 overflow-hidden relative">
          <div className="fixed inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl animate-pulse delay-1000" />
          </div>
          <div className="z-10 flex flex-col items-center animate-in fade-in zoom-in duration-500">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
              <Sparkles className="h-16 w-16 text-primary animate-spin-slow relative z-10" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Synthesizing Flashcards...</h2>
            <p className="text-muted-foreground animate-pulse">Preparing classroom revision cards</p>
          </div>
        </div>
      )
    }

    if (flashcards.length > 0) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 overflow-hidden">
          <div className="fixed inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl animate-pulse delay-1000" />
          </div>

          <div className="max-w-2xl w-full relative z-10">
            <div className="mb-8 flex justify-between items-end">
              <div>
                <Button variant="ghost" onClick={() => setShowFlashcards(false)} className="-ml-4 mb-2 md:mb-0">
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

            <div className="w-full bg-white/5 h-1.5 rounded-full mb-8 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-sky-500 transition-all duration-500 ease-out"
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
              <Button variant="outline" size="lg" onClick={handlePrevCard} className="w-full md:w-auto min-w-[120px]">
                Previous
              </Button>

              {currentCard === flashcards.length - 1 ? (
                <Button size="lg" onClick={handleCompleteLearning} className="w-full md:w-auto min-w-[120px]">
                  <Check className="mr-2 h-5 w-5" />
                  Finish
                </Button>
              ) : (
                <Button variant="outline" size="lg" onClick={handleNextCard} className="w-full md:w-auto min-w-[120px]">
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-white/10">
        <div className="container mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => router.push(courseHref)} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted-foreground truncate">{course.subjects?.title}</div>
                <h1 className="text-base md:text-2xl font-bold tracking-tight truncate">{topic.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 bg-white/5 px-3 py-2 rounded-full border border-white/5 shrink-0">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{formatTime(remainingSeconds)} remaining</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 bg-white/5">
          <div className="container mx-auto px-6 py-3">
            <Progress value={progress} className="h-1.5 bg-white/10" />
            <div className="text-xs text-muted-foreground mt-2 font-medium uppercase tracking-wider">
              Reading progress: {Math.round(progress)}%
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 pt-[160px] pb-16 max-w-4xl">
        <Card className="glass-card mb-8">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">{topic.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground mt-4">
              <span>Difficulty: {topic.difficulty}/5</span>
              <span>Estimated: {topic.estimated_minutes || 0} minutes</span>
            </div>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none">
            {topic.description && (
              <div className="mb-6 md:mb-8 p-4 md:p-6 bg-white/5 rounded-xl border border-white/5">
                <h3 className="text-lg md:text-xl font-semibold mb-3 text-foreground mt-0">Overview</h3>
                <p className="text-base md:text-lg leading-relaxed m-0">{topic.description}</p>
              </div>
            )}

            {topic.content ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h3 className="text-lg md:text-xl font-semibold mb-6 text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Comprehensive Guide
                </h3>
                <div className="markdown-content prose dark:prose-invert max-w-none break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={MarkdownComponents}
                  >
                    {topic.content}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-white/5 rounded-xl border border-white/5 border-dashed mt-8">
                {generating ? (
                  <div className="flex flex-col items-center animate-pulse">
                    <Sparkles className="h-10 w-10 mb-4 text-primary animate-spin-slow" />
                    <p>Generating comprehensive guide...</p>
                  </div>
                ) : (
                  <>
                    <Clock className="h-10 w-10 mb-4 opacity-50" />
                    <p className="mb-4">Content is missing for this classroom topic.</p>
                    <Button onClick={handleRegenerateContent} variant="outline">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Detailed Content
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col md:flex-row items-center gap-4 justify-center">
          <Button variant="outline" size="lg" onClick={handleShowFlashcards} className="w-full md:w-auto">
            Practice with Flashcards
          </Button>
          <Button size="lg" onClick={handleCompleteLearning} className="w-full md:w-auto">
            <Check className="mr-2 h-5 w-5" />
            Mark as Learned
          </Button>
        </div>
      </div>

      <DoubtChat
        topicId={params.topicId}
        topicTitle={topic.title}
        subjectTitle={course.subjects?.title}
        contentStatus={Boolean(topic.content && topic.content.length > 50)}
        classroomId={params.classroomId}
        classroomCourseId={params.classroomCourseId}
      />

      <StickyNoteWidget
        topicId={params.topicId}
        topicTitle={topic.title}
        initialNotes={topic.progress?.notes || ''}
        onSaveNotes={handleSaveNotes}
      />

      <SelectionHighlighter />
    </div>
  )
}
