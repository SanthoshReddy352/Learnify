'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { ArrowLeft, Send } from 'lucide-react'
import { toast } from 'sonner'
import { submitReview } from '@/lib/actions'
import { format, addDays } from 'date-fns'

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

  if (loading || !topic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-xl text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const currentQuality = qualityLabels[quality[0]]

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
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'Montserrat' }}>Review Session</h1>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Last interval: {topic.interval_days} days
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <Card className="bg-card border-border mb-8">
          <CardHeader>
            <CardTitle className="text-3xl text-center mb-4" style={{ fontFamily: 'Montserrat' }}>
              {topic.title}
            </CardTitle>
            <p className="text-center text-muted-foreground">
              Try to recall what you learned about this topic
            </p>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-8">
              {!showContent ? (
                <Button variant="outline" onClick={() => setShowContent(true)} className="mt-4">
                  Show Content to Verify
                </Button>
              ) : (
                <div className="bg-background/50 p-6 rounded-lg border border-border mt-4">
                  <p className="text-lg mb-4">{topic.description}</p>
                  {topic.content && (
                    <div className="text-muted-foreground whitespace-pre-wrap text-left">
                      {topic.content}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quality Rating */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-2xl" style={{ fontFamily: 'Montserrat' }}>How well did you recall?</CardTitle>
            <p className="text-muted-foreground">Rate your recall quality (0-5)</p>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Quality Slider */}
            <div className="px-6">
              <Slider
                value={quality}
                onValueChange={setQuality}
                max={5}
                min={0}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>0</span>
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </div>

            {/* Current Selection */}
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 text-center">
              <div className="text-4xl font-bold text-primary mb-2" style={{ fontFamily: 'Montserrat' }}>
                {currentQuality.value}
              </div>
              <div className="text-xl font-semibold mb-2" style={{ fontFamily: 'Montserrat' }}>
                {currentQuality.label}
              </div>
              <div className="text-muted-foreground">
                {currentQuality.description}
              </div>
            </div>

            {/* Submit Button */}
            <Button 
              size="lg" 
              onClick={handleSubmitReview} 
              disabled={submitting}
              className="w-full neon-glow"
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
