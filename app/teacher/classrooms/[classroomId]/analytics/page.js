'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Clock3,
  RotateCcw,
  Target,
  TrendingUp,
  Users
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatIst } from '@/lib/classrooms/format'

export default function TeacherClassroomAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState(null)

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const response = await fetch(`/api/teacher/classrooms/${params.classroomId}/analytics`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load analytics')
        }

        setAnalytics(data)
      } catch (error) {
        toast.error(error.message)
        router.push(`/teacher/classrooms/${params.classroomId}`)
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()
  }, [params.classroomId, router])

  const highlightedStudent = useMemo(() => (
    analytics?.students
      ?.slice()
      ?.sort((a, b) => (b.overall?.completionPercentage || 0) - (a.overall?.completionPercentage || 0))?.[0] || null
  ), [analytics])

  if (loading || !analytics) {
    return <div className="text-muted-foreground">Loading analytics...</div>
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-primary/15 via-background to-orange-500/10 px-6 py-7 shadow-[0_24px_80px_-48px_rgba(249,115,22,0.55)] md:px-8 md:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <Button variant="ghost" className="mb-4 -ml-2 w-fit text-muted-foreground" onClick={() => router.push(`/teacher/classrooms/${params.classroomId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Classroom
              </Button>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                Classroom Analytics
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{analytics.classroom.name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                See how the class is progressing, which topics are weak, and where intervention is needed. All timestamps are shown in IST.
              </p>
            </div>

            {highlightedStudent && (
              <Card className="w-full max-w-sm border-white/10 bg-black/20 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardDescription>Top progressing student</CardDescription>
                  <CardTitle className="text-xl">{highlightedStudent.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Completion</span>
                    <span className="font-medium text-foreground">{highlightedStudent.overall.completionPercentage}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${highlightedStudent.overall.completionPercentage}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Reviews</span>
                    <span className="font-medium text-foreground">{highlightedStudent.reviewCount}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Roster</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl"><Users className="h-6 w-6 text-primary" />{analytics.summary.rosterSize}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Courses</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl"><BookOpen className="h-6 w-6 text-primary" />{analytics.summary.totalCourses}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Average completion</CardDescription>
                <CardTitle className="text-3xl">{analytics.summary.averageCompletion}%</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Due reviews</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl"><RotateCcw className="h-6 w-6 text-primary" />{analytics.summary.dueReviews}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Study minutes</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl"><Clock3 className="h-6 w-6 text-primary" />{analytics.summary.totalStudyMinutes}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Review count</CardDescription>
                <CardTitle className="flex items-center gap-2 text-3xl"><Activity className="h-6 w-6 text-primary" />{analytics.summary.reviewCount}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-[24px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle>Course overview</CardTitle>
                <CardDescription>Quick access to the overall health of each attached course.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead>Completion</TableHead>
                      <TableHead>Minutes</TableHead>
                      <TableHead>Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.courses.map((course) => (
                      <TableRow key={course.classroomCourseId}>
                        <TableCell>{course.subjectTitle}</TableCell>
                        <TableCell>{course.activeStudents}</TableCell>
                        <TableCell>{course.averageCompletion}%</TableCell>
                        <TableCell>{course.totalMinutes}</TableCell>
                        <TableCell>{course.dueReviews}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle>Topic hotspots</CardTitle>
                <CardDescription>Review-heavy or low-quality topics to revisit as a teacher.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Topic</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Reviews</TableHead>
                      <TableHead>Avg Quality</TableHead>
                      <TableHead>Last Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.topics.slice(0, 8).map((topic) => (
                      <TableRow key={topic.topicId}>
                        <TableCell>{topic.topicTitle}</TableCell>
                        <TableCell>{topic.completionCount}</TableCell>
                        <TableCell>{topic.reviewCount}</TableCell>
                        <TableCell>{topic.averageQuality ?? 'N/A'}</TableCell>
                        <TableCell>{formatIst(topic.lastActivity)}</TableCell>
                      </TableRow>
                    ))}
                    {analytics.topics.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">No topic activity yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle>Student progress</CardTitle>
              <CardDescription>Class-wide progress table for quick scanning.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead>Mastered</TableHead>
                    <TableHead>Reviews</TableHead>
                    <TableHead>Minutes</TableHead>
                    <TableHead>Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.students.map((student) => (
                    <TableRow key={student.studentUserId}>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>{student.overall.completionPercentage}%</TableCell>
                      <TableCell>{student.overall.masteredTopics}/{student.overall.totalTopics}</TableCell>
                      <TableCell>{student.reviewCount}</TableCell>
                      <TableCell>{student.totalMinutes}</TableCell>
                      <TableCell>{formatIst(student.lastActivity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle>Teacher reading</CardTitle>
              <CardDescription>What to prioritize when you scan this dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <RotateCcw className="h-4 w-4 text-primary" />
                  Due reviews
                </div>
                <p className="mt-2 leading-6">A rising due-review count usually means students are falling behind in retention, even if completion looks healthy.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <Target className="h-4 w-4 text-primary" />
                  Topic hotspots
                </div>
                <p className="mt-2 leading-6">Low average quality with high review volume points to weak explanations or concepts that need reteaching.</p>
              </div>
            </CardContent>
          </Card>

          {analytics.students.slice(0, 3).map((student) => (
            <Card key={student.studentUserId} className="rounded-[24px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle>{student.name}</CardTitle>
                <CardDescription>{student.educationLevel || 'Education level not set'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  {student.courses.map((course) => (
                    <div key={course.classroomCourseId} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{course.subjectTitle}</span>
                        <span className="text-sm text-primary">{course.completionPercentage}%</span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-white/10">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${course.completionPercentage}%` }} />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Mastered {course.masteredTopics}/{course.totalTopics} • Due reviews {course.dueReviews}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Target className="h-4 w-4 text-primary" />
                    Topic review activity
                  </div>
                  <div className="space-y-2">
                    {student.topics.slice(0, 4).map((topic) => (
                      <div key={topic.topicId} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm">
                        <div className="font-medium">{topic.topicTitle}</div>
                        <div className="text-muted-foreground">
                          {topic.reviewCount} reviews • Last {formatIst(topic.lastReviewedAt)}
                        </div>
                      </div>
                    ))}
                    {student.topics.length === 0 && (
                      <div className="text-sm text-muted-foreground">No review activity yet.</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
