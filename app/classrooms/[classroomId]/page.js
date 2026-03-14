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
  School,
  Target
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
    <div className="space-y-6 md:space-y-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <section className="relative overflow-hidden rounded-[24px] md:rounded-[32px] border border-white/10 bg-gradient-to-br from-primary/10 via-background to-sky-500/10 px-5 py-6 md:px-8 md:py-10 shadow-[0_20px_60px_-40px_rgba(59,130,246,0.4)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_40%)] pointer-events-none" />
        <div className="relative flex flex-col gap-8 md:gap-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl flex-1">
              <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground hover:bg-white/5 hover:text-foreground" onClick={() => router.push('/classrooms')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Classrooms
              </Button>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">
                <School className="h-3 w-3 md:h-3.5 md:w-3.5" />
                Student Classroom
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight lg:leading-[1.1]">{detail.classroom.name}</h1>
              <p className="mt-3 md:mt-4 max-w-2xl text-sm md:text-base leading-relaxed text-muted-foreground">
                {detail.classroom.description || 'A structured classroom space for progressing through teacher-assigned courses and review sessions.'}
              </p>
            </div>

            {highlightedCourse && (
              <Card className="w-full lg:max-w-[340px] xl:max-w-sm rounded-[20px] border-white/10 bg-black/20 backdrop-blur-md shadow-xl shrink-0 overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <CardHeader className="p-4 md:p-5 pb-2 md:pb-3 relative z-10">
                  <CardDescription className="uppercase tracking-wider text-[10px] font-semibold text-primary/80">Continue Learning</CardDescription>
                  <CardTitle className="text-lg md:text-xl line-clamp-1 mt-1 leading-tight">{highlightedCourse.subjects?.title || 'Untitled course'}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-5 space-y-4 relative z-10">
                  <div className="space-y-1.5 border border-white/5 bg-white/[0.02] p-3 rounded-xl">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span>{highlightedCourse.summary?.completionPercentage || 0}% Complete</span>
                      <span className="text-orange-400">{highlightedCourse.summary?.dueReviews || 0} Reviews</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary relative"
                        style={{ width: `${highlightedCourse.summary?.completionPercentage || 0}%` }}
                      >
                         <div className="absolute top-0 right-0 bottom-0 w-4 bg-white/20 blur-[2px] rounded-full animate-[shimmer_2s_infinite]"></div>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95 h-10 rounded-xl"
                    onClick={() => router.push(`/classrooms/${params.classroomId}/courses/${highlightedCourse.id}`)}
                  >
                    Open Course
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Card className="rounded-[16px] md:rounded-[20px] border-white/5 bg-white/[0.03] shadow-none hover:bg-white/[0.05] transition-colors">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium">Total Courses</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1 flex items-center gap-2"><BookOpen className="h-5 w-5 md:h-6 md:w-6 text-primary" />{overview.totalCourses}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-[16px] md:rounded-[20px] border-white/5 bg-white/[0.03] shadow-none hover:bg-white/[0.05] transition-colors">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium">Completion</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1 text-primary">{overview.avgCompletion}%</CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-[16px] md:rounded-[20px] border-white/5 bg-white/[0.03] shadow-none hover:bg-white/[0.05] transition-colors">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium">Due Reviews</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1 flex items-center gap-2 text-orange-400"><RotateCcw className="h-5 w-5 md:h-6 md:w-6" />{overview.totalDueReviews}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-[16px] md:rounded-[20px] border-white/5 bg-white/[0.03] shadow-none hover:bg-white/[0.05] transition-colors">
              <CardHeader className="p-4 md:p-5">
                <CardDescription className="text-xs md:text-sm font-medium">Mastered</CardDescription>
                <CardTitle className="text-2xl md:text-3xl p-0 mt-1 flex items-center gap-2 text-emerald-400"><Layers3 className="h-5 w-5 md:h-6 md:w-6" />{overview.totalMastered}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {detail.courses.length === 0 ? (
        <Card className="rounded-[24px] border-dashed border-white/10 bg-black/10">
          <CardHeader className="items-center text-center p-8 md:p-12">
            <div className="mb-4 md:mb-6 flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
              <GraduationCap className="h-8 w-8 md:h-10 md:w-10 text-primary" />
            </div>
            <CardTitle className="text-xl md:text-2xl font-bold">No Courses Assigned</CardTitle>
            <CardDescription className="mt-2 text-sm md:text-base max-w-sm">Your teacher has not attached any courses to this classroom yet. Check back later!</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="grid gap-6 lg:gap-8 lg:grid-cols-[1fr_300px] xl:grid-cols-[minmax(0,1.6fr)_340px]">
          <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 px-2 md:px-0">
              <div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">Assigned Courses</h2>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">Navigate your active assignments and study progress.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {detail.courses.map((course) => {
                const state = getCourseState(course)

                return (
                  <Card
                    key={course.id}
                    className="group flex h-full cursor-pointer flex-col rounded-[20px] md:rounded-[24px] border border-white/5 bg-gradient-to-b from-card/80 to-card/20 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 relative overflow-hidden"
                    onClick={() => router.push(`/classrooms/${params.classroomId}/courses/${course.id}`)}
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 group-hover:via-primary/30 to-transparent"></div>
                    
                    <CardHeader className="p-4 md:p-5 space-y-3">
                      <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 sm:gap-4 relative z-10">
                        <div className="min-w-0 flex-1 space-y-1">
                          <CardTitle className="text-lg md:text-xl font-semibold leading-tight line-clamp-2 md:group-hover:text-primary transition-colors">{course.subjects?.title || 'Untitled course'}</CardTitle>
                          <CardDescription className="text-xs md:text-sm leading-relaxed line-clamp-2">
                            {course.subjects?.description || 'No description provided.'}
                          </CardDescription>
                        </div>
                        <div className="self-start sm:self-center shrink-0">
                           <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 md:px-3 md:py-1 text-[10px] md:text-xs font-bold uppercase tracking-wider whitespace-nowrap ${state.className}`}>
                             {state.label}
                           </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="mt-auto p-4 md:p-5 pt-0 md:pt-0 space-y-4 md:space-y-5 relative z-10 w-full min-w-0">
                      <div className="space-y-2 border border-white/5 bg-black/20 rounded-xl p-3 md:p-3.5">
                        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                          <span className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Progress</span>
                          <span className={`${(course.summary?.completionPercentage || 0) > 0 ? 'text-primary' : ''}`}>{course.summary?.completionPercentage || 0}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 w-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500 ease-out relative"
                            style={{ width: `${course.summary?.completionPercentage || 0}%` }}
                          >
                             <div className="absolute inset-0 bg-white/20 blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 md:gap-3 text-sm">
                        <div className="rounded-xl flex items-center justify-between border border-white/5 bg-white/[0.02] px-3 py-2 md:px-4 md:py-3 group-hover:border-white/10 transition-colors">
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs md:text-sm">
                            <Layers3 className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-400" />
                            <span>Topics</span>
                          </div>
                          <div className="font-semibold text-emerald-400">{course.summary?.totalTopics || 0}</div>
                        </div>
                        <div className="rounded-xl flex items-center justify-between border border-white/5 bg-white/[0.02] px-3 py-2 md:px-4 md:py-3 group-hover:border-white/10 transition-colors">
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs md:text-sm">
                            <RotateCcw className="h-3.5 w-3.5 md:h-4 md:w-4 text-orange-400" />
                            <span>Due</span>
                          </div>
                          <div className="font-semibold text-orange-400">{course.summary?.dueReviews || 0}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs md:text-sm text-muted-foreground">
                        <span className="font-medium">Mastered {course.summary?.masteredTopics || 0} of {course.summary?.totalTopics || 0}</span>
                        <div className="flex items-center font-semibold group-hover:text-primary transition-colors">
                          <span className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">Open Course</span>
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5 md:h-4 md:w-4 -translate-x-1 group-hover:translate-x-0 transition-transform duration-300" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          <div className="space-y-4 md:space-y-6">
            <Card className="rounded-[20px] md:rounded-[24px] border-white/10 bg-card/50 backdrop-blur-sm shadow-lg overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
              <CardHeader className="p-5 md:p-6 pb-2 md:pb-4 relative z-10">
                <CardTitle className="text-lg md:text-xl font-bold tracking-tight">Quick Guide</CardTitle>
                <CardDescription className="text-xs md:text-sm leading-relaxed">How to get the most out of your classroom.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 md:p-6 pt-2 md:pt-4 space-y-3 shrink-0 relative z-10 min-w-0">
                <div className="rounded-xl md:rounded-[18px] border border-white/5 bg-white/[0.02] p-3 md:p-4 hover:bg-white/[0.04] transition-colors overflow-hidden">
                  <div className="flex items-center gap-2.5 text-foreground font-semibold text-xs md:text-sm">
                    <span className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0 min-w-max"><BookOpen className="h-4 w-4" /></span>
                    <span className="truncate">Active Learning</span>
                  </div>
                  <p className="mt-2 md:mt-2.5 max-w-[280px] text-[11px] md:text-sm leading-relaxed text-muted-foreground">Follow the suggested paths in your assigned courses. Learn topics, then review them when prompted.</p>
                </div>
                <div className="rounded-xl md:rounded-[18px] border border-white/5 bg-white/[0.02] p-3 md:p-4 hover:bg-white/[0.04] transition-colors overflow-hidden">
                  <div className="flex items-center gap-2.5 text-foreground font-semibold text-xs md:text-sm">
                    <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 shrink-0 min-w-max"><Clock3 className="h-4 w-4" /></span>
                    <span className="truncate">Spaced Repetition</span>
                  </div>
                  <p className="mt-2 md:mt-2.5 max-w-[280px] text-[11px] md:text-sm leading-relaxed text-muted-foreground">Keep your &quot;Due&quot; reviews low. They are scheduled to optimize memory retention over time.</p>
                </div>
              </CardContent>
            </Card>

            {highlightedCourse && (
              <Card className="rounded-[20px] md:rounded-[24px] border-white/10 bg-card/50 backdrop-blur-sm shadow-lg">
                <CardHeader className="p-5 md:p-6 pb-2 md:pb-4">
                  <CardDescription className="uppercase tracking-wider text-[10px] font-semibold text-primary/80">Current Priority</CardDescription>
                  <CardTitle className="text-base md:text-lg line-clamp-2 mt-1 leading-tight">{highlightedCourse.subjects?.title || 'Untitled course'}</CardTitle>
                </CardHeader>
                <CardContent className="p-5 md:p-6 pt-2 md:pt-4 space-y-2 md:space-y-2.5 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 md:px-4 md:py-3 hover:bg-white/[0.04] transition-colors">
                    <span className="text-muted-foreground text-xs md:text-sm">Completion</span>
                    <span className="font-bold text-primary text-xs md:text-sm">{highlightedCourse.summary?.completionPercentage || 0}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 md:px-4 md:py-3 hover:bg-white/[0.04] transition-colors">
                    <span className="text-muted-foreground text-xs md:text-sm">Due reviews</span>
                    <span className="font-bold text-orange-400 text-xs md:text-sm">{highlightedCourse.summary?.dueReviews || 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 md:px-4 md:py-3 hover:bg-white/[0.04] transition-colors">
                    <span className="text-muted-foreground text-xs md:text-sm">Mastered</span>
                    <span className="font-bold text-emerald-400 text-xs md:text-sm">{highlightedCourse.summary?.masteredTopics || 0}</span>
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
