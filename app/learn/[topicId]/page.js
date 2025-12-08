'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Check, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { startLearningSession, completeLearning } from '@/lib/actions'

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
  const supabase = createClient()

  useEffect(() => {
    loadTopicData()
    setStartTime(Date.now())
  }, [topicId])

  useEffect(() => {
    // Simulate progress based on time
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev < 100) {
          return Math.min(prev + 2, 100)
        }
        return prev
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

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

    // Mark as learning if available
    if (topicData.status === 'available') {
      await startLearningSession(topicId)
    }
  }

  const handleCompleteLearning = async () => {
    const durationMinutes = startTime ? Math.round((Date.now() - startTime) / 60000) : 0
    
    const result = await completeLearning(topicId, durationMinutes)
    
    if (result.success) {
      toast.success('Topic completed! You can review it tomorrow.')
      router.push(`/subjects/${subject.id}`)
    } else {
      toast.error('Failed to complete topic')
    }
  }

  const handleShowFlashcards = () => {
    setShowFlashcards(true)
  }

  if (loading || !topic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-xl text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (showFlashcards) {
    // Simple flashcard view
    const flashcards = [
      { front: 'Key Concept 1', back: topic.description },
      { front: 'What did you learn?', back: topic.content },
      { front: 'Quick Review', back: `${topic.title} - ${topic.estimated_minutes} minutes` }
    ]

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <div className="mb-6 flex justify-between items-center">
            <Button variant="ghost" onClick={() => setShowFlashcards(false)}>
              <ArrowLeft className="mr-2 h-5 w-5" />
              Back to Content
            </Button>
            <span className="text-muted-foreground">
              Card {currentCard + 1} / {flashcards.length}
            </span>
          </div>
          
          <Card className="bg-card border-border h-96 flex items-center justify-center cursor-pointer hover:neon-glow transition-all"
            onClick={() => setCurrentCard((currentCard + 1) % flashcards.length)}>
            <CardContent className="text-center p-12">
              <h2 className="text-3xl font-bold mb-6" style={{ fontFamily: 'Montserrat' }}>
                {flashcards[currentCard].front}
              </h2>
              <p className="text-xl text-muted-foreground">
                {flashcards[currentCard].back}
              </p>
            </CardContent>
          </Card>

          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setCurrentCard(Math.max(0, currentCard - 1))}>
              Previous
            </Button>
            <Button onClick={handleCompleteLearning} className="neon-glow">
              <Check className="mr-2 h-5 w-5" />
              Complete Learning
            </Button>
            <Button variant="outline" onClick={() => setCurrentCard((currentCard + 1) % flashcards.length)}>
              Next
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/30 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push(`/subjects/${subject.id}`)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="text-sm text-muted-foreground">{subject.title}</div>
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'Montserrat' }}>{topic.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">{topic.estimated_minutes} min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="border-b border-border bg-card/20">
        <div className="container mx-auto px-6 py-3">
          <Progress value={progress} className="h-2" />
          <div className="text-sm text-muted-foreground mt-2">
            Reading progress: {progress}%
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <Card className="bg-card border-border mb-8">
          <CardHeader>
            <CardTitle className="text-3xl" style={{ fontFamily: 'Montserrat' }}>{topic.title}</CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-4">
              <span>Difficulty: {topic.difficulty}/5</span>
              <span>•</span>
              <span>Estimated: {topic.estimated_minutes} minutes</span>
            </div>
          </CardHeader>
          <CardContent className="prose prose-invert max-w-none">
            {topic.description && (
              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-3" style={{ fontFamily: 'Montserrat' }}>Overview</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">{topic.description}</p>
              </div>
            )}
            
            {topic.content && (
              <div>
                <h3 className="text-xl font-semibold mb-3" style={{ fontFamily: 'Montserrat' }}>Content</h3>
                <div className="text-base text-foreground leading-relaxed whitespace-pre-wrap">
                  {topic.content}
                </div>
              </div>
            )}

            {!topic.content && !topic.description && (
              <p className="text-muted-foreground">No content available yet. Add content in the topic editor.</p>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <Button variant="outline" size="lg" onClick={handleShowFlashcards}>
            Practice with Flashcards
          </Button>
          <Button size="lg" onClick={handleCompleteLearning} className="neon-glow">
            <Check className="mr-2 h-5 w-5" />
            Mark as Learned
          </Button>
        </div>
      </div>
    </div>
  )
}
