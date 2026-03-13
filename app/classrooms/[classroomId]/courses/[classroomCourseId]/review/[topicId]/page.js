'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { ArrowLeft, Brain, Check, Send, Sparkles } from 'lucide-react'
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
import MarkdownComponents from '@/components/sub-components/MarkdownComponents'

const qualityLabels = [
  { value: 0, label: 'Complete Blackout', description: "I don't remember anything" },
  { value: 1, label: 'Familiar', description: 'I recognize it but incorrect answer' },
  { value: 2, label: 'Remembered', description: 'Incorrect but I remembered something' },
  { value: 3, label: 'Difficult', description: 'Correct with serious difficulty' },
  { value: 4, label: 'Hesitation', description: 'Correct after some hesitation' },
  { value: 5, label: 'Perfect', description: 'Perfect recall, no hesitation' }
]

export default function ClassroomReviewPage() {
  const router = useRouter()
  const params = useParams()
  const [topic, setTopic] = useState(null)
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quality, setQuality] = useState([3])
  const [startTime, setStartTime] = useState(null)
  const [showContent, setShowContent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showFlashcards, setShowFlashcards] = useState(false)
  const [currentCard, setCurrentCard] = useState(0)
  const [flashcards, setFlashcards] = useState([])
  const [isFlipped, setIsFlipped] = useState(false)
  const [generating, setGenerating] = useState(false)

  const courseHref = `/classrooms/${params.classroomId}/courses/${params.classroomCourseId}`

  useEffect(() => {
    loadTopicData()
    setStartTime(Date.now())
  }, [params.topicId])

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

      if (selectedTopic.progress?.status === 'available' || selectedTopic.progress?.status === 'learning') {
        router.replace(`${courseHref}/learn/${params.topicId}`)
        return
      }

      setTopic(selectedTopic)
      setCourse(payload.classroomCourse)
      setLoading(false)
    } catch (error) {
      toast.error(error.message)
      router.push(courseHref)
    }
  }

  const handleSubmitReview = async () => {
    setSubmitting(true)
    const durationMinutes = startTime ? Math.round((Date.now() - startTime) / 60000) : 0

    const response = await fetch(`/api/classrooms/${params.classroomId}/courses/${params.classroomCourseId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'review',
        topicId: params.topicId,
        quality: quality[0],
        durationMinutes
      })
    })
    const result = await response.json()

    if (response.ok) {
      toast.success('Review submitted')
      router.push(courseHref)
      return
    }

    toast.error(result.error || 'Failed to submit review')
    setSubmitting(false)
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
        { front: 'What is the main concept?', back: topic.description || 'Review the summary.' },
        { front: 'Key takeaway', back: 'Recall the strongest idea from this topic.' }
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
          <Brain className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">Loading review...</span>
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
            <p className="text-muted-foreground animate-pulse">Preparing classroom review cards</p>
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
                  Back to Review
                </Button>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-bold tracking-tight">Flashcards</h2>
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-mono border border-primary/20">
                    {topic.title}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold font-mono text-primary">
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
                <Button size="lg" onClick={() => setShowFlashcards(false)} className="w-full md:w-auto min-w-[120px]">
                  <Check className="mr-2 h-5 w-5" />
                  Done
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

  const currentQuality = qualityLabels[quality[0]]

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push(courseHref)} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground truncate">{course.subjects?.title}</div>
                <h1 className="text-lg md:text-2xl font-bold tracking-tight truncate">Review Session</h1>
              </div>
            </div>
            <div className="hidden md:block text-sm px-3 py-1 bg-white/5 rounded-full border border-white/5 text-muted-foreground">
              Last interval: {topic.progress?.interval_days || 0} days
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-6 md:py-12 pb-16">
        <Card className="glass-card mb-6 md:mb-8">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-2xl md:text-3xl text-center mb-2 md:mb-4 tracking-tight">
              {topic.title}
            </CardTitle>
            <p className="text-center text-muted-foreground text-sm md:text-base">
              Try to recall what you learned about this topic
            </p>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            <div className="text-center mb-4 md:mb-8">
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center mt-2 md:mt-4">
                <Button variant="outline" onClick={() => setShowContent(!showContent)} className="w-full sm:w-auto">
                  {showContent ? 'Hide Content' : 'Show Content to Verify'}
                </Button>
                <Button variant="outline" onClick={handleShowFlashcards} className="w-full sm:w-auto">
                  <Sparkles className="mr-2 h-4 w-4 text-primary" />
                  Revise with Flashcards
                </Button>
              </div>

              {showContent && (
                <div className="bg-white/5 p-4 md:p-8 rounded-xl border border-white/5 mt-6 text-left">
                  <div className="mb-6 md:mb-8 p-4 md:p-6 bg-white/5 rounded-xl border border-white/5">
                    <h3 className="text-lg md:text-xl font-semibold mb-3 text-foreground mt-0">Overview</h3>
                    <p className="text-base md:text-lg leading-relaxed m-0 text-muted-foreground">{topic.description}</p>
                  </div>

                  {topic.content && (
                    <div className="markdown-content prose dark:prose-invert max-w-none break-words">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={MarkdownComponents}
                      >
                        {topic.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-xl md:text-2xl">How well did you recall?</CardTitle>
            <p className="text-muted-foreground text-sm">Rate your recall quality (0-5)</p>
          </CardHeader>
          <CardContent className="space-y-6 md:space-y-8 p-4 md:p-6">
            <div className="px-2 md:px-6">
              <Slider
                value={quality}
                onValueChange={setQuality}
                max={5}
                min={0}
                step={1}
                className="w-full cursor-pointer h-10"
              />
              <div className="flex justify-between mt-4 text-[10px] md:text-xs font-mono text-muted-foreground px-1">
                <span>0</span>
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 md:p-6 text-center transition-all">
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2 md:mb-3">
                {currentQuality.value}
              </div>
              <div className="text-lg md:text-xl font-semibold mb-1 md:mb-2 text-foreground">
                {currentQuality.label}
              </div>
              <div className="text-sm md:text-base text-muted-foreground max-w-sm mx-auto">
                {currentQuality.description}
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleSubmitReview}
              disabled={submitting}
              className="w-full h-12 text-base font-medium"
            >
              {submitting ? 'Submitting...' : (
                <>
                  <Send className="mr-2 h-5 w-5" />
                  Submit Review
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {showContent && (
        <DoubtChat
          topicId={params.topicId}
          topicTitle={topic.title}
          subjectTitle={course.subjects?.title}
          contentStatus={Boolean(topic.content && topic.content.length > 50)}
          classroomId={params.classroomId}
          classroomCourseId={params.classroomCourseId}
        />
      )}

      <StickyNoteWidget
        topicId={params.topicId}
        topicTitle={topic.title}
        initialNotes={topic.progress?.notes || ''}
        onSaveNotes={handleSaveNotes}
      />
    </div>
  )
}
