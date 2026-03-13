'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RotateCw, Clock, Book } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function GlobalReviewsWidget({ reviews }) {
  const router = useRouter()

  if (!reviews || reviews.length === 0) {
    return null
  }

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
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((topic) => (
          <div 
            key={topic.id} 
            className="flex flex-col justify-between p-3 rounded-lg bg-background/50 border border-white/5 hover:border-orange-500/30 transition-all cursor-pointer group"
            onClick={() => router.push(`/review/${topic.id}?from=dashboard`)}
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
            
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
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
        ))}
      </CardContent>
    </Card>
  )
}
