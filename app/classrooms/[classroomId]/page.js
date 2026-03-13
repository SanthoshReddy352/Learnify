'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock3,
  GraduationCap,
  Layers3,
  RotateCcw,
  School
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function getCourseState(course) {
  if (course.summary?.dueReviews > 0) {
    return {
      label: 'Review due',
      className: 'border-orange-500/20 bg-orange-500/10 text-orange-200'
    }
  }

  if ((course.summary?.completionPercentage || 0) > 0 && (course.summary?.completionPercentage || 0) < 100) {
    return {
      label: 'In progress',
      className: 'border-sky-500/20 bg-sky-500/10 text-sky-200'
    }
  }

  if ((course.summary?.completionPercentage || 0) >= 100) {
    return {
      label: 'Completed',
      className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
    }
  }

  return {
    label: 'Ready to start',
    className: 'border-primary/20 bg-primary/10 text-primary'
  }
}

export default function ClassroomDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    const loadDetail = async () => {
      try {
        const response = await fetch(`/api/classrooms/${params.classroomId}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load classroom')
        }

        setDetail(data)
      } catch (error) {
        toast.error(error.message)
        router.push('/classrooms')
      } finally {
        setLoading(false)
      }
    }

    loadDetail()
  }, [params.classroomId, router])

  const overview = useMemo(() => {
    const courses = detail?.courses || []
    const totalCourses = courses.length
    const totalDueReviews = courses.reduce((sum, course) => sum + (course.summary?.dueReviews || 0), 0)
    const avgCompletion = totalCourses > 0
      ? Math.round(courses.reduce((sum, course) => sum + (course.summary?.completionPercentage || 0), 0) / totalCourses)
      : 0
    const totalMastered = courses.reduce((sum, course) => sum + (course.summary?.masteredTopics || 0), 0)

    return {
      totalCourses,
      totalDueReviews,
      avgCompletion,
      totalMastered
    }
  }, [detail])

  const highlightedCourse = useMemo(() => {
    const courses = detail?.courses || []
    return (
      courses.find((course) => (course.summary?.dueReviews || 0) > 0) ||
      courses.find((course) => (course.summary?.completionPercentage || 0) > 0 && (course.summary?.completionPercentage || 0) < 100) ||
      courses[0] ||
      null
    )
  }, [detail])

  if (loading || !detail) {
    return <div className="text-muted-foreground">Loading classroom...</div>
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-primary/15 via-background to-sky-500/10 px-6 py-7 shadow-[0_24px_80px_-48px_rgba(59,130,246,0.6)] md:px-8 md:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <Button variant="ghost" className="mb-4 -ml-2 w-fit text-muted-foreground" onClick={() => router.push('/classrooms')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Classrooms
              </Button>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <School className="h-3.5 w-3.5 text-primary" />
                Student Classroom
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{detail.classroom.name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {detail.classroom.description || 'A structured classroom space for progressing through teacher-assigned courses and review sessions.'}
              </p>
            </div>

            {highlightedCourse && (
              <Card className="w-full max-w-sm border-white/10 bg-black/20 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardDescription>Pick up where you left off</CardDescription>
                  <CardTitle className="text-xl">{highlightedCourse.subjects?.title || 'Untitled course'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{highlightedCourse.summary?.completionPercentage || 0}% complete</span>
                    <span>{highlightedCourse.summary?.dueReviews || 0} due reviews</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${highlightedCourse.summary?.completionPercentage || 0}%` }}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => router.push(`/classrooms/${params.classroomId}/courses/${highlightedCourse.id}`)}
                  >
                    Open Course
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Total courses</CardDescription>
                <CardTitle className="text-3xl">{overview.totalCourses}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Average completion</CardDescription>
                <CardTitle className="text-3xl">{overview.avgCompletion}%</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Due reviews</CardDescription>
                <CardTitle className="text-3xl">{overview.totalDueReviews}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Mastered topics</CardDescription>
                <CardTitle className="text-3xl">{overview.totalMastered}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {detail.courses.length === 0 ? (
        <Card className="rounded-[24px] border-dashed border-white/10 bg-black/10">
          <CardHeader className="items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>No published courses yet</CardTitle>
            <CardDescription>Your teacher has not attached any classroom courses yet.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_340px]">
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Course Library</h2>
                <p className="text-sm text-muted-foreground">Everything assigned in this classroom, organized for easy continuation.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {detail.courses.map((course) => {
                const state = getCourseState(course)

                return (
                  <Card
                    key={course.id}
                    className="group flex h-full cursor-pointer flex-col rounded-[24px] border-white/10 bg-gradient-to-br from-black/20 to-white/[0.03] transition-all hover:-translate-y-0.5 hover:border-primary/30"
                    onClick={() => router.push(`/classrooms/${params.classroomId}/courses/${course.id}`)}
                  >
                    <CardHeader className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="line-clamp-2 text-xl">{course.subjects?.title || 'Untitled course'}</CardTitle>
                          <CardDescription className="mt-2 line-clamp-3 leading-6">
                            {course.subjects?.description || 'No description provided.'}
                          </CardDescription>
                        </div>
                        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${state.className}`}>
                          {state.label}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="mt-auto space-y-5">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Progress</span>
                          <span>{course.summary?.completionPercentage || 0}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${course.summary?.completionPercentage || 0}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Layers3 className="h-4 w-4 text-primary" />
                            Topics
                          </div>
                          <div className="mt-2 text-lg font-semibold">{course.summary?.totalTopics || 0}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <RotateCcw className="h-4 w-4 text-primary" />
                            Due
                          </div>
                          <div className="mt-2 text-lg font-semibold">{course.summary?.dueReviews || 0}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-4 text-sm text-muted-foreground">
                        <span>Mastered {course.summary?.masteredTopics || 0} of {course.summary?.totalTopics || 0}</span>
                        <Button variant="ghost" size="sm" className="group-hover:text-primary">
                          Open
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          <div className="space-y-4">
            <Card className="rounded-[24px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle className="text-xl">Study Guidance</CardTitle>
                <CardDescription>Use this view as your classroom home before jumping into a course.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Open a course dashboard
                  </div>
                  <p className="mt-2 leading-6">Each course dashboard shows the graph, recommendations, due reviews, and classroom-specific progress.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <Clock3 className="h-4 w-4 text-primary" />
                    Learn and review separately
                  </div>
                  <p className="mt-2 leading-6">Lesson content is available inside dedicated learn and review sessions so the classroom dashboard stays clean.</p>
                </div>
              </CardContent>
            </Card>

            {highlightedCourse && (
              <Card className="rounded-[24px] border-white/10 bg-black/10">
                <CardHeader>
                  <CardDescription>Current focus</CardDescription>
                  <CardTitle className="text-xl">{highlightedCourse.subjects?.title || 'Untitled course'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span>Completion</span>
                    <span className="font-medium text-foreground">{highlightedCourse.summary?.completionPercentage || 0}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span>Due reviews</span>
                    <span className="font-medium text-foreground">{highlightedCourse.summary?.dueReviews || 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span>Mastered topics</span>
                    <span className="font-medium text-foreground">{highlightedCourse.summary?.masteredTopics || 0}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
