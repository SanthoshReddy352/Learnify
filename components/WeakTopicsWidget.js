'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, TrendingUp, RotateCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function WeakTopicsWidget({ topics, getReviewHref }) {
  const router = useRouter()

  if (!topics || topics.length === 0) {
    return null
  }

  return (
    <Card className="glass-card border-orange-500/20 bg-orange-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-orange-500 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Focus Needed
            </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {topics.map((topic) => (
          <div key={topic.id} className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/10">
            <div className="min-w-0">
                <h4 className="font-medium text-sm truncate">{topic.title}</h4>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1 text-orange-400">
                        Average Score: {topic.averageRating}
                    </span>
                    <span>•</span>
                    <span>{topic.reviewCount} Reviews</span>
                </div>
            </div>
            <Button 
                size="sm" 
                variant="outline"
                className="shrink-0 h-8 border-orange-500/30 text-orange-500 hover:bg-orange-500/20 hover:text-orange-400"
                onClick={() => router.push(getReviewHref ? getReviewHref(topic) : `/review/${topic.id}`)}
            >
                <RotateCw className="mr-2 h-3.5 w-3.5" />
                Review
            </Button>
          </div>
        ))}
        <div className="pt-2 text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span>Reviewing these topics will boost your mastery score.</span>
        </div>
      </CardContent>
    </Card>
  )
}
