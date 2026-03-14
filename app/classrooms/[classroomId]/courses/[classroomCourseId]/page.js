'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import {
  ArrowLeft,
  Clock3,
  Lock,
  Network,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import GraphVisualizer from '@/components/GraphVisualizer'
import RecommendationWidget from '@/components/RecommendationWidget'
import WeakTopicsWidget from '@/components/WeakTopicsWidget'
import WeeklyStats from '@/components/WeeklyStats'
import { StatusBadge } from '@/components/classrooms/status-badge'
import { formatIst } from '@/lib/classrooms/format'
import MarkdownComponents from '@/components/sub-components/MarkdownComponents'

function isReviewDue(timestamp) {
  return Boolean(timestamp) && new Date(timestamp) <= new Date()
}

function getTopicMode(topic) {
  return topic.progress?.status === 'reviewing' || topic.progress?.status === 'mastered' ? 'review' : 'learn'
}

function pickSuggestedTopic(topics) {
  if (!topics || topics.length === 0) {
    return null
  }

  return (
    topics.find((topic) => topic.progress?.status === 'learning') ||
    topics.find((topic) => isReviewDue(topic.progress?.next_review_at)) ||
    topics.find((topic) => topic.progress?.status === 'available') ||
    topics.find((topic) => topic.progress?.status === 'reviewing') ||
    topics.find((topic) => topic.progress?.status === 'mastered') ||
    topics[0]
  )
}

export default function ClassroomCoursePage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [selectedTopicId, setSelectedTopicId] = useState(null)

  const buildTopicHref = useCallback((topic, mode = getTopicMode(topic)) => (
    `/classrooms/${params.classroomId}/courses/${params.classroomCourseId}/${mode}/${topic.id}`
  ), [params.classroomId, params.classroomCourseId])

  const loadCourse = useCallback(async (preserveSelection = true) => {
    try {
      const response = await fetch(`/api/classrooms/${params.classroomId}/courses/${params.classroomCourseId}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load course')
      }

      setData(payload)
      setSelectedTopicId((currentTopicId) => {
        if (
          preserveSelection &&
          currentTopicId &&
          payload.topics?.some((topic) => topic.id === currentTopicId)
        ) {
          return currentTopicId
        }

        return pickSuggestedTopic(payload.topics)?.id || payload.topics?.[0]?.id || null
      })
    } catch (error) {
      toast.error(error.message)
      router.push(`/classrooms/${params.classroomId}`)
    } finally {
      setLoading(false)
    }
  }, [params.classroomId, params.classroomCourseId, router])

  useEffect(() => {
    setLoading(true)
    loadCourse(false)
  }, [loadCourse])

  const selectedTopic = useMemo(() => {
    if (!data?.topics?.length) {
      return null
    }

    return (
      data.topics.find((topic) => topic.id === selectedTopicId) ||
      pickSuggestedTopic(data.topics) ||
      data.topics[0]
    )
  }, [data, selectedTopicId])

  const graphTopics = useMemo(() => (
    (data?.topics || []).map((topic) => ({
      ...topic,
      status: topic.progress?.status || 'locked'
    }))
  ), [data])

  const courseStats = useMemo(() => {
    const topics = data?.topics || []
    const totalTopics = topics.length
    const completedTopics = topics.filter((topic) => {
      const status = topic.progress?.status
      return status === 'reviewing' || status === 'mastered'
    }).length
    const dueReviews = topics.filter((topic) => isReviewDue(topic.progress?.next_review_at)).length
    const availableTopics = topics.filter((topic) => {
      const status = topic.progress?.status
      return status === 'available' || status === 'learning'
    }).length

    return {
      totalTopics,
      completedTopics,
      dueReviews,
      availableTopics,
      percentage: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0
    }
  }, [data])

  const suggestedTopic = useMemo(() => pickSuggestedTopic(data?.topics || []), [data])

  if (loading || !data) {
    return <div className="text-muted-foreground">Loading classroom course...</div>
  }

  return (
    <div className="space-y-6 md:space-y-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      {/* Course Header Section */}
      <section className="relative overflow-hidden rounded-[24px] md:rounded-[32px] border bg-gradient-to-br from-primary/5 via-card to-sky-500/5 px-5 py-6 md:px-8 md:py-10 shadow-sm">
        <div className="relative flex flex-col gap-8 md:gap-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl flex-1">
              <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground hover:bg-muted" onClick={() => router.push(`/classrooms/${params.classroomId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Classroom
              </Button>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">
                <Network className="h-3 w-3 md:h-3.5 md:w-3.5" />
                Course Dashboard
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight lg:leading-[1.1]">{data.classroomCourse.subjects?.title || 'Classroom course'}</h1>
              <p className="mt-3 md:mt-4 max-w-2xl text-sm md:text-base leading-relaxed text-muted-foreground">
                {data.classroomCourse.subjects?.description || 'Track progress through the graph, follow recommendations, and open dedicated learn or review sessions.'}
              </p>
            </div>

            {suggestedTopic && (
              <Card className="w-full lg:max-w-[340px] xl:max-w-sm rounded-[20px] bg-card shadow-sm shrink-0 overflow-hidden">
                <CardHeader className="p-4 md:p-5 pb-2 md:pb-3">
                  <CardDescription className="uppercase tracking-wider text-[10px] font-semibold text-primary/80">Suggested next step</CardDescription>
                  <CardTitle className="text-lg md:text-xl line-clamp-1 mt-1 leading-tight">{suggestedTopic.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-5 pt-2 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground bg-muted/50 border rounded-xl p-3">
                    <span className="font-medium text-foreground">{getTopicMode(suggestedTopic) === 'review' ? 'Review session' : 'Learning session'}</span>
                    <StatusBadge status={suggestedTopic.progress?.status} />
                  </div>
                  <Button 
                    size="sm"
                    className="w-full h-10 rounded-xl"
                    onClick={() => router.push(buildTopicHref(suggestedTopic))}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Open Next Session
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
            <Card className="rounded-[16px] md:rounded-[20px] shadow-sm bg-card hover:bg-accent/50 transition-colors">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium">Completion</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1 text-primary">{courseStats.percentage}%</CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-[16px] md:rounded-[20px] shadow-sm bg-card hover:bg-accent/50 transition-colors">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">Topics completed</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1">{courseStats.completedTopics}/{courseStats.totalTopics}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-[16px] md:rounded-[20px] shadow-sm bg-card hover:bg-accent/50 transition-colors">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium">Ready now</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1">{courseStats.availableTopics}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-[16px] md:rounded-[20px] shadow-sm bg-card hover:bg-accent/50 transition-colors">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium">Due reviews</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1 text-orange-500 flex items-center gap-2"><RotateCcw className="h-5 w-5 md:h-6 md:w-6" />{courseStats.dueReviews}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-[16px] md:rounded-[20px] shadow-sm bg-card hover:bg-accent/50 transition-colors col-span-2 md:col-span-1 xl:col-span-1">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium">Study minutes</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1 flex items-center gap-2 text-emerald-500"><Clock3 className="h-5 w-5 md:h-6 md:w-6" />{data.analytics?.totalMinutes || 0}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="grid gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.55fr)_360px] items-start">
        {/* Left Column */}
        <div className="space-y-6 md:space-y-8 min-w-0">
          <Card className="rounded-[20px] md:rounded-[24px] shadow-sm overflow-hidden">
            <CardHeader className="p-5 md:p-6 border-b">
              <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
                <Network className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                Knowledge graph
              </CardTitle>
              <CardDescription className="text-xs md:text-sm mt-1">Follow the graph and open dedicated study pages only from unlocked nodes.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="graph" className="w-full flex-1 flex flex-col">
                <div className="px-5 md:px-6 pt-4 shrink-0">
                  <TabsList className="bg-muted p-1 w-full sm:w-auto flex overflow-x-auto no-scrollbar justify-start">
                    <TabsTrigger value="graph" className="shrink-0">Graph View</TabsTrigger>
                    <TabsTrigger value="topics" className="shrink-0">List View</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 p-5 md:p-6 min-w-0">
                  <TabsContent value="graph" className="m-0 space-y-4">
                    <div className="h-[400px] md:h-[520px] w-full overflow-hidden rounded-2xl border bg-card focus-within:ring-2 focus-within:ring-primary/50 transition-shadow">
                      <GraphVisualizer
                        topics={graphTopics}
                        dependencies={data.dependencies || []}
                        onNodeClick={(node) => setSelectedTopicId(node.id)}
                        readOnly
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] md:text-xs text-muted-foreground">
                      <span className="rounded-full border px-2.5 py-1 bg-muted/30">Click a node to inspect it</span>
                      <span className="rounded-full border px-2.5 py-1 bg-muted/30">Locked nodes stay visible but unreadable</span>
                      <span className="rounded-full border px-2.5 py-1 bg-muted/30">Learn and review run on separate pages</span>
                    </div>
                  </TabsContent>

                  <TabsContent value="topics" className="m-0 space-y-3">
                    <div className="max-h-[520px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                      {(data.topics || []).map((topic) => (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => setSelectedTopicId(topic.id)}
                          className={`w-full rounded-2xl border p-4 md:p-5 text-left transition-all duration-300 ${
                            topic.id === selectedTopic?.id
                              ? 'border-primary/40 bg-primary/5 shadow-sm scale-[1.01]'
                              : 'bg-card hover:border-border/80 hover:bg-accent/50'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="font-semibold text-sm md:text-base leading-tight break-words">{topic.title}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Network className="w-3.5 h-3.5" />
                                {topic.prerequisites?.length
                                  ? `${topic.prerequisites.length} prerequisite${topic.prerequisites.length === 1 ? '' : 's'}`
                                  : 'Foundation topic'}
                              </div>
                            </div>
                            <div className="shrink-0 self-start">
                              <StatusBadge status={topic.progress?.status} />
                            </div>
                          </div>
                          <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] md:text-xs text-muted-foreground font-medium">
                            <span className="flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5" /> {topic.estimated_minutes || 0} min</span>
                            {topic.progress?.next_review_at && (
                              <span className={`flex items-center gap-1.5 ${isReviewDue(topic.progress.next_review_at) ? 'text-orange-500' : ''}`}>
                                <RotateCcw className="w-3.5 h-3.5" />
                                {isReviewDue(topic.progress.next_review_at) ? 'Review due now' : `Next review ${formatIst(topic.progress.next_review_at)}`}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <WeakTopicsWidget
              topics={data.analytics?.weakTopics || []}
              getReviewHref={(topic) => buildTopicHref(topic, 'review')}
            />
            <WeeklyStats
              data={data.analytics?.weekData || []}
              totalMinutes={data.analytics?.totalMinutes || 0}
            />
          </div>

          {data.classroomCourse.subjects?.cheat_sheet && (
            <Card className="rounded-[20px] md:rounded-[24px] shadow-sm overflow-hidden relative">
              <CardHeader className="p-5 md:p-6 pb-2 border-b relative z-10">
                <CardTitle className="text-lg md:text-xl flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Teacher cheat sheet
                </CardTitle>
                <CardDescription className="text-xs md:text-sm mt-1">Quick revision notes shared for this classroom course.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 md:p-6 md:pt-6 prose prose-sm md:prose-base max-w-none relative z-10 dark:prose-invert">
                <div className="bg-muted/30 rounded-2xl p-4 md:p-6 border">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={MarkdownComponents}
                  >
                    {data.classroomCourse.subjects.cheat_sheet}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-4 md:space-y-6 lg:sticky lg:top-8 pb-8">
          <RecommendationWidget
            topics={graphTopics}
            getTopicHref={(topic, type) => buildTopicHref(topic, type === 'review' ? 'review' : 'learn')}
          />

          {selectedTopic && (
            <Card className="rounded-[20px] md:rounded-[24px] shadow-md border-primary/20">
              <CardHeader className="p-5 md:p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <CardDescription className="uppercase tracking-wider text-[10px] font-semibold text-primary">Selected node</CardDescription>
                    <StatusBadge status={selectedTopic.progress?.status} />
                  </div>
                  <div>
                    <CardTitle className="text-xl md:text-2xl leading-tight">{selectedTopic.title}</CardTitle>
                    <CardDescription className="mt-2.5 text-xs md:text-sm leading-relaxed max-h-[100px] overflow-y-auto custom-scrollbar pr-2">
                      {selectedTopic.progress?.status === 'locked'
                        ? 'This topic is still blocked by prerequisites. You must complete them first.'
                        : selectedTopic.description || 'Ready to study on a dedicated page.'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-5 md:p-6 pt-0 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[16px] border bg-card p-3 text-sm flex flex-col items-start gap-1 shadow-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] md:text-xs uppercase font-semibold tracking-wider">
                      <Clock3 className="h-3.5 w-3.5 text-primary" />
                      Est. time
                    </div>
                    <div className="text-base md:text-lg font-bold text-foreground">{selectedTopic.estimated_minutes || 0} <span className="text-xs font-medium text-muted-foreground ml-0.5">min</span></div>
                  </div>
                  <div className="rounded-[16px] border bg-card p-3 text-sm flex flex-col items-start gap-1 shadow-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] md:text-xs uppercase font-semibold tracking-wider">
                      <RotateCcw className="h-3.5 w-3.5 text-primary" />
                      Next review
                    </div>
                    <div className="text-sm md:text-base font-bold text-foreground whitespace-nowrap overflow-hidden text-ellipsis w-full">
                      {selectedTopic.progress?.next_review_at ? formatIst(selectedTopic.progress.next_review_at) : 'Not scheduled'}
                    </div>
                  </div>
                </div>

                {selectedTopic.prerequisites?.length > 0 && (
                  <div className="space-y-3 rounded-[18px] border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-[11px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <Target className="h-3.5 w-3.5 text-primary" />
                      Unlock path
                    </div>
                    <div className="space-y-2.5 max-h-[160px] overflow-y-auto custom-scrollbar pr-2">
                      {selectedTopic.prerequisites.map((prerequisite) => (
                        <div key={prerequisite.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border bg-card p-3 text-xs md:text-sm shadow-sm">
                          <span className="font-medium truncate pr-2 text-foreground">{prerequisite.title}</span>
                          <StatusBadge status={prerequisite.status} className="w-fit scale-90 origin-left sm:origin-right" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTopic.progress?.status === 'locked' ? (
                  <div className="rounded-[16px] border border-orange-500/20 bg-orange-500/10 p-4 text-sm text-orange-600 dark:text-orange-200 shadow-inner">
                    <div className="flex items-center gap-2 font-bold mb-1">
                      <Lock className="h-4 w-4" />
                      Topic locked
                    </div>
                    <p className="text-[11px] md:text-xs opacity-90 leading-relaxed">
                      Complete and review the required prerequisites before opening this topic.
                    </p>
                  </div>
                ) : (
                  <Button 
                    onClick={() => router.push(buildTopicHref(selectedTopic))} 
                    className="w-full h-12 rounded-xl text-primary-foreground shadow-sm transition-all active:scale-[0.98]"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {getTopicMode(selectedTopic) === 'review' ? 'Open Review Session' : 'Open Learning Session'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[20px] md:rounded-[24px] shadow-sm">
             <CardHeader className="p-5 md:p-6 pb-2">
              <CardDescription className="uppercase tracking-wider text-[10px] font-semibold text-primary">Tips</CardDescription>
              <CardTitle className="text-base md:text-lg">Course insights</CardTitle>
            </CardHeader>
            <CardContent className="p-5 md:p-6 pt-3 space-y-3 shrink-0 relative z-10 min-w-0">
                <div className="rounded-xl md:rounded-[18px] border bg-muted/30 p-3 md:p-4 hover:bg-muted/50 transition-colors overflow-hidden">
                  <div className="flex items-center gap-2.5 text-foreground font-semibold text-xs md:text-sm">
                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 shrink-0 min-w-max"><TrendingUp className="h-4 w-4" /></span>
                    <span className="truncate">Weekly activity</span>
                  </div>
                  <p className="mt-2 md:mt-2.5 max-w-[280px] text-[11px] md:text-sm leading-relaxed text-muted-foreground">Track how much time you spent learning versus reviewing inside this classroom course.</p>
                </div>
                <div className="rounded-xl md:rounded-[18px] border bg-muted/30 p-3 md:p-4 hover:bg-muted/50 transition-colors overflow-hidden">
                  <div className="flex items-center gap-2.5 text-foreground font-semibold text-xs md:text-sm">
                    <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 dark:text-orange-400 shrink-0 min-w-max"><Target className="h-4 w-4" /></span>
                    <span className="truncate">Weak topics</span>
                  </div>
                  <p className="mt-2 md:mt-2.5 max-w-[280px] text-[11px] md:text-sm leading-relaxed text-muted-foreground">Review low-scoring topics again to strengthen retention before they become a bottleneck.</p>
                </div>
              </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
