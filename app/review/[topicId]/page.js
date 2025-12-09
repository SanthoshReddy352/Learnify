'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { ArrowLeft, Send, Brain, Check, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { submitReview } from '@/lib/actions'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import CodeBlock, { cleanCodeContent } from '@/components/sub-components/CodeBlock'
import Flashcard from '@/components/sub-components/Flashcard'
import MarkdownComponents from '@/components/sub-components/MarkdownComponents'



const qualityLabels = [
  { value: 0, label: 'Complete Blackout', description: "I don't remember anything" },
  { value: 1, label: 'Familiar', description: 'I recognize it but incorrect answer' },
  { value: 2, label: 'Remembered', description: 'Incorrect but I remembered something' },
  { value: 3, label: 'Difficult', description: 'Correct with serious difficulty' },
  { value: 4, label: 'Hesitation', description: 'Correct after some hesitation' },
  { value: 5, label: 'Perfect', description: 'Perfect recall, no hesitation' },
]

export default function ReviewPage() {
  const router = useRouter()
  const params = useParams()
  const topicId = params.topicId
  const [topic, setTopic] = useState(null)
  const [subject, setSubject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quality, setQuality] = useState([3])
  const [startTime, setStartTime] = useState(null)
  const [showContent, setShowContent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Flashcard State
  const [showFlashcards, setShowFlashcards] = useState(false)
  const [currentCard, setCurrentCard] = useState(0)
  const [flashcards, setFlashcards] = useState([])
  const [isFlipped, setIsFlipped] = useState(false)
  const [generating, setGenerating] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadTopicData()
    setStartTime(Date.now())
  }, [topicId])

  const loadTopicData = async () => {
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
  }

  const handleSubmitReview = async () => {
    setSubmitting(true)
    const durationMinutes = startTime ? Math.round((Date.now() - startTime) / 60000) : 0
    
    const result = await submitReview(topicId, quality[0], durationMinutes)
    
    if (result.success) {
      const nextReview = format(new Date(result.nextReviewDate), 'MMM d, yyyy')
      toast.success(`Review complete! Next review: ${nextReview}`, { duration: 5000 })
      router.push(`/subjects/${subject.id}`)
    } else {
      toast.error('Failed to submit review')
      setSubmitting(false)
    }
  }

  const handleShowFlashcards = async () => {
     setShowFlashcards(true)
     
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
         
         const fallbackCards = [
            { front: 'What is the main concept?', back: topic.description || 'Review the topic description.' },
            { front: 'Key Takeaway', back: 'Reflect on the most important thing you learned from this section.' },
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
  }, [showFlashcards, currentCard, flashcards.length])

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
          <Brain className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">Loading Review...</span>
        </div>
      </div>
    )
  }

  // Flashcard View Overlay
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
                    <span className="inline md:hidden">Back</span>
                    <span className="hidden md:inline">Back to Review</span>
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
                    onClick={() => setShowFlashcards(false)} 
                    className="w-full md:w-auto bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 min-w-[120px]"
                 >
                    <Check className="mr-2 h-5 w-5" />
                    Done
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


  const currentQuality = qualityLabels[quality[0]]

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      {/* Header */}
      <div className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push(`/subjects/${subject.id}`)} className="hover:bg-white/5 shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground truncate">{subject.title}</div>
                <h1 className="text-lg md:text-2xl font-bold tracking-tight truncate">Review Session</h1>
              </div>
            </div>
            <div className="hidden md:block text-sm px-3 py-1 bg-white/5 rounded-full border border-white/5 text-muted-foreground">
              Last interval: {topic.interval_days} days
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-12 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-[calc(3rem+env(safe-area-inset-bottom))]">
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
                    <Button variant="outline" onClick={() => setShowContent(!showContent)} className="glass border-white/10 hover:bg-white/5 w-full sm:w-auto h-12 sm:h-auto">
                        {showContent ? 'Hide Content' : 'Show Content to Verify'}
                    </Button>
                    <Button variant="outline" onClick={handleShowFlashcards} className="glass border-white/10 hover:bg-white/5 w-full sm:w-auto h-12 sm:h-auto">
                        <Sparkles className="mr-2 h-4 w-4 text-purple-400" />
                        Revise with Flashcards
                    </Button>
                </div>

              {showContent && (
                <div className="bg-white/5 p-4 md:p-8 rounded-xl border border-white/5 mt-6 text-left animate-in fade-in slide-in-from-bottom-2">
                    <div className="mb-6 md:mb-8 p-4 md:p-6 bg-white/5 rounded-xl border border-white/5">
                        <h3 className="text-lg md:text-xl font-semibold mb-3 text-foreground mt-0">Overview</h3>
                        <p className="text-base md:text-lg leading-relaxed m-0 text-muted-foreground">{topic.description}</p>
                    </div>

                  {topic.content && (
                    <div className="markdown-content prose dark:prose-invert prose-p:text-muted-foreground prose-headings:text-foreground prose-strong:text-primary prose-code:text-primary max-w-none">
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

        {/* Quality Rating */}
        <Card className="glass-card border-border">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-xl md:text-2xl" >How well did you recall?</CardTitle>
            <p className="text-muted-foreground text-sm">Rate your recall quality (0-5)</p>
          </CardHeader>
          <CardContent className="space-y-6 md:space-y-8 p-4 md:p-6">
            {/* Quality Slider */}
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

            {/* Current Selection */}
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

            {/* Submit Button */}
            <Button 
              size="lg" 
              onClick={handleSubmitReview} 
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 h-12 md:h-12 text-base font-medium"
            >
              {submitting ? (
                'Submitting...'
              ) : (
                <>
                  <Send className="mr-2 h-5 w-5" />
                  Submit Review
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
