'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Play, RotateCw, Clock, Brain, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { isDueForReview } from '@/lib/sm2'

export default function RecommendationWidget({ topics, getTopicHref }) {
  const router = useRouter()

  // 1. Filter Topics by State
  const learningTopics = topics.filter(t => t.status === 'learning')
  
  const dueReviews = topics.filter(t => 
    (t.status === 'reviewing' || t.status === 'mastered') && 
    t.next_review_at && 
    isDueForReview(t.next_review_at)
  )

  const availableTopics = topics
    .filter(t => t.status === 'available')
    .sort((a, b) => (a.estimated_minutes || 30) - (b.estimated_minutes || 30))

  // 2. Combine into a prioritized list
  // Strategy: 
  // - Top priority: Active learning (finish what you started)
  // - Second: Due reviews (maintain knowledge)
  // - Third: New content (explore)
  // We want to show a mix, but prioritized. Let's filter to top 5 total.
  
  const recommendations = [
    ...dueReviews.map(t => ({ ...t, type: 'review' })),
    ...learningTopics.map(t => ({ ...t, type: 'learning' })),
    ...availableTopics.map(t => ({ ...t, type: 'new' }))
  ].slice(0, 5)

  const handleStart = (topic, type) => {
    const href = getTopicHref
      ? getTopicHref(topic, type)
      : (type === 'review' ? `/review/${topic.id}` : `/learn/${topic.id}`)

    router.push(href)
  }

  const getTypeConfig = (type) => {
    switch (type) {
      case 'learning':
        return {
          label: 'Continue Learning',
          icon: Play,
          colorClass: 'text-sky-500',
          bgClass: 'bg-sky-500/10',
          badgeClass: 'bg-sky-500/20 text-sky-500',
          buttonVariant: 'default', // Primary
          buttonClass: 'bg-sky-500 hover:bg-sky-600'
        }
      case 'review':
        return {
          label: 'Review Due',
          icon: RotateCw,
          colorClass: 'text-orange-500',
          bgClass: 'bg-orange-500/10',
          badgeClass: 'bg-orange-500/20 text-orange-500',
          buttonVariant: 'default',
          buttonClass: 'bg-orange-500 hover:bg-orange-600'
        }
      case 'new':
        return {
          label: 'Newly Unlocked Topic',
          icon: Sparkles,
          colorClass: 'text-emerald-500',
          bgClass: 'bg-emerald-500/10',
          badgeClass: 'bg-emerald-500/20 text-emerald-500',
          buttonVariant: 'secondary',
          buttonClass: 'hover:bg-emerald-500/20'
        }
      default:
        return {
          label: 'Topic',
          icon: Brain,
          colorClass: 'text-zinc-500',
          bgClass: 'bg-zinc-500/10',
          badgeClass: 'bg-zinc-500/20 text-zinc-500',
          buttonVariant: 'ghost',
          buttonClass: ''
        }
    }
  }

  if (recommendations.length === 0) {
    return (
      <Card className="shadow-sm border-dashed bg-muted/30">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Brain className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
          <p className="text-muted-foreground max-w-sm">
            No active tasks. Add more topics or wait for your next review session.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card relative overflow-hidden h-full">
      <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
        <Sparkles className="h-24 w-24 text-primary" />
      </div>
      
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Brain className="h-5 w-5 text-primary" />
          <span className="text-primary">Up Next</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {recommendations.map((topic) => {
          const config = getTypeConfig(topic.type)
          const Icon = config.icon

          return (
            <div 
              key={topic.id} 
              className="group flex items-center justify-between p-3 rounded-xl bg-card border hover:border-primary/50 shadow-sm transition-all cursor-pointer hover:shadow-md"
              onClick={() => handleStart(topic, topic.type)}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full ${config.bgClass} ${config.colorClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm ${config.badgeClass}`}>
                      {config.label}
                    </span>
                  </div>
                  <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                    {topic.title}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {topic.estimated_minutes} min
                    </span>
                  </div>
                </div>
              </div>
              
              <Button 
                size="sm" 
                variant={config.buttonVariant} 
                className={`ml-2 shrink-0 h-8 w-8 p-0 rounded-full ${config.buttonClass} text-white shadow-sm`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleStart(topic, topic.type)
                }}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
