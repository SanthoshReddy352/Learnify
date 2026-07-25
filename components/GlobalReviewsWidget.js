'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { RotateCw, Clock, Book, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'

const VISIBLE_COUNT = 6

function ReviewCard({ topic, onOpen }) {
  return (
    <div
      className="flex flex-col justify-between p-3 rounded-lg bg-background/50 border border-border/60 hover:border-orange-500/30 transition-all cursor-pointer group"
      onClick={onOpen}
    >
      <div>
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <Book className="h-3 w-3" />
          <span className="truncate max-w-[150px]">{topic.subjectTitle}</span>
        </div>
        <h4 className="font-medium text-sm line-clamp-2 mb-2 group-hover:text-orange-500 transition-colors">
          {topic.title}
        </h4>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
        <div className="flex items-center gap-1 text-xs text-orange-400">
          <Clock className="h-3 w-3" />
          <span>Due Now</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs hover:text-orange-500 hover:bg-orange-500/10"
        >
          Start Review →
        </Button>
      </div>
    </div>
  )
}

export default function GlobalReviewsWidget({ reviews }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)

  if (!reviews || reviews.length === 0) {
    return null
  }

  // Reviews arrive sorted most-overdue first (lib/analytics.js)
  const visible = reviews.slice(0, VISIBLE_COUNT)
  const overflow = reviews.slice(VISIBLE_COUNT)
  const openReview = (topicId) => router.push(`/review/${topicId}?from=dashboard`)

  return (
    <Card className="glass-card border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-background mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-orange-500 uppercase tracking-widest flex items-center gap-2">
            <RotateCw className="h-4 w-4" />
            Due for Review ({reviews.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((topic) => (
              <ReviewCard key={topic.id} topic={topic} onOpen={() => openReview(topic.id)} />
            ))}
          </div>

          {overflow.length > 0 && (
            <>
              <CollapsibleContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
                  {overflow.map((topic) => (
                    <ReviewCard key={topic.id} topic={topic} onOpen={() => openReview(topic.id)} />
                  ))}
                </div>
              </CollapsibleContent>

              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-3 text-xs text-muted-foreground hover:text-orange-500 hover:bg-orange-500/5"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 mr-1.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                  {expanded ? 'Show less' : `Show all ${reviews.length} reviews`}
                </Button>
              </CollapsibleTrigger>
            </>
          )}
        </Collapsible>
      </CardContent>
    </Card>
  )
}
