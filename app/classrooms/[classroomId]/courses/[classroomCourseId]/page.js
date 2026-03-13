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
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-primary/15 via-background to-sky-500/10 px-6 py-7 shadow-[0_24px_80px_-48px_rgba(59,130,246,0.6)] md:px-8 md:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <Button variant="ghost" className="mb-4 -ml-2 w-fit text-muted-foreground" onClick={() => router.push(`/classrooms/${params.classroomId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Classroom
              </Button>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <Network className="h-3.5 w-3.5 text-primary" />
                Course Dashboard
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{data.classroomCourse.subjects?.title || 'Classroom course'}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {data.classroomCourse.subjects?.description || 'Track progress through the graph, follow recommendations, and open dedicated learn or review sessions.'}
              </p>
            </div>

            {suggestedTopic && (
              <Card className="w-full max-w-sm border-white/10 bg-black/20 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardDescription>Suggested next step</CardDescription>
                  <CardTitle className="text-xl">{suggestedTopic.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{getTopicMode(suggestedTopic) === 'review' ? 'Review session' : 'Learning session'}</span>
                    <StatusBadge status={suggestedTopic.progress?.status} />
                  </div>
                  <Button className="w-full" onClick={() => router.push(buildTopicHref(suggestedTopic))}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Open Next Session
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Completion</CardDescription>
                <CardTitle className="text-3xl">{courseStats.percentage}%</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Topics completed</CardDescription>
                <CardTitle className="text-3xl">{courseStats.completedTopics}/{courseStats.totalTopics}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Ready now</CardDescription>
                <CardTitle className="text-3xl">{courseStats.availableTopics}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Due reviews</CardDescription>
                <CardTitle className="text-3xl">{courseStats.dueReviews}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Study minutes</CardDescription>
                <CardTitle className="text-3xl">{data.analytics?.totalMinutes || 0}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="space-y-6">
          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                Knowledge graph
              </CardTitle>
              <CardDescription>Follow the graph and open dedicated study pages only from unlocked nodes.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="graph" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="graph">Graph</TabsTrigger>
                  <TabsTrigger value="topics">Path</TabsTrigger>
                </TabsList>

                <TabsContent value="graph" className="space-y-4">
                  <div className="h-[520px] overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                    <GraphVisualizer
                      topics={graphTopics}
                      dependencies={data.dependencies || []}
                      onNodeClick={(node) => setSelectedTopicId(node.id)}
                      readOnly
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-white/10 px-3 py-1">Click a node to inspect it</span>
                    <span className="rounded-full border border-white/10 px-3 py-1">Locked nodes stay visible but unreadable</span>
                    <span className="rounded-full border border-white/10 px-3 py-1">Learn and review run on separate pages</span>
                  </div>
                </TabsContent>

                <TabsContent value="topics" className="space-y-3">
                  {(data.topics || []).map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                        topic.id === selectedTopic?.id
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-white/10 hover:border-primary/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium">{topic.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {topic.prerequisites?.length
                              ? `${topic.prerequisites.length} prerequisite${topic.prerequisites.length === 1 ? '' : 's'}`
                              : 'Foundation topic'}
                          </div>
                        </div>
                        <StatusBadge status={topic.progress?.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{topic.estimated_minutes || 0} min</span>
                        {topic.progress?.next_review_at && (
                          <span>{isReviewDue(topic.progress.next_review_at) ? 'Review due now' : `Next review ${formatIst(topic.progress.next_review_at)}`}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
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
            <Card className="rounded-[24px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle>Teacher cheat sheet</CardTitle>
                <CardDescription>Quick revision notes shared for this classroom course.</CardDescription>
              </CardHeader>
              <CardContent className="prose prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={MarkdownComponents}
                >
                  {data.classroomCourse.subjects.cheat_sheet}
                </ReactMarkdown>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <RecommendationWidget
            topics={graphTopics}
            getTopicHref={(topic, type) => buildTopicHref(topic, type === 'review' ? 'review' : 'learn')}
          />

          {selectedTopic && (
            <Card className="rounded-[24px] border-white/10 bg-black/10">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardDescription>Selected node</CardDescription>
                    <CardTitle>{selectedTopic.title}</CardTitle>
                    <CardDescription className="mt-2">
                      {selectedTopic.progress?.status === 'locked'
                        ? 'This topic is still blocked by prerequisites.'
                        : selectedTopic.description || 'Ready to study on a dedicated page.'}
                    </CardDescription>
                  </div>
                  <StatusBadge status={selectedTopic.progress?.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock3 className="h-4 w-4 text-primary" />
                      Estimated time
                    </div>
                    <div className="mt-2 text-lg font-semibold">{selectedTopic.estimated_minutes || 0} min</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <RotateCcw className="h-4 w-4 text-primary" />
                      Next review
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {selectedTopic.progress?.next_review_at ? formatIst(selectedTopic.progress.next_review_at) : 'Not scheduled'}
                    </div>
                  </div>
                </div>

                {selectedTopic.prerequisites?.length > 0 && (
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Target className="h-4 w-4 text-primary" />
                      Unlock path
                    </div>
                    <div className="space-y-2">
                      {selectedTopic.prerequisites.map((prerequisite) => (
                        <div key={prerequisite.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm">
                          <span>{prerequisite.title}</span>
                          <StatusBadge status={prerequisite.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTopic.progress?.status === 'locked' ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                    <div className="flex items-center gap-2 font-medium">
                      <Lock className="h-4 w-4" />
                      Topic locked
                    </div>
                    <p className="mt-2 text-amber-50/90">
                      Complete and review the required prerequisites before opening this topic.
                    </p>
                  </div>
                ) : (
                  <Button onClick={() => router.push(buildTopicHref(selectedTopic))} className="w-full h-11">
                    <Sparkles className="mr-2 h-4 w-4" />
                    {getTopicMode(selectedTopic) === 'review' ? 'Open Review Session' : 'Open Learning Session'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle>Course insights</CardTitle>
              <CardDescription>Use the dashboard before opening a focused session.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Weekly activity
                </div>
                <p className="mt-2 leading-6">Track how much time you spent learning versus reviewing inside this classroom course.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <Target className="h-4 w-4 text-primary" />
                  Weak topics
                </div>
                <p className="mt-2 leading-6">Review low-scoring topics again to strengthen retention before they become a bottleneck.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
