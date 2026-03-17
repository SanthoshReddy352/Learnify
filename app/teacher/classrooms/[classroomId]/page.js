'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChartColumn,
  Layers3,
  Mail,
  Plus,
  School,
  Sparkles,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

export default function TeacherClassroomDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [attaching, setAttaching] = useState(false)
  const [detail, setDetail] = useState(null)
  const [subjectId, setSubjectId] = useState('')

  const loadDetail = async () => {
    try {
      const response = await fetch(`/api/teacher/classrooms/${params.classroomId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load classroom')
      }

      setDetail(data)
      if (!subjectId && data.availableSubjects?.[0]?.id) {
        setSubjectId(data.availableSubjects[0].id)
      }
    } catch (error) {
      toast.error(error.message)
      router.push('/teacher/classrooms')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [params.classroomId, router])

  const unassignedSubjects = useMemo(() => {
    if (!detail) return []
    const attachedIds = new Set(detail.courses.map((course) => course.subject_id))
    return detail.availableSubjects.filter((subject) => !attachedIds.has(subject.id))
  }, [detail])

  const summary = useMemo(() => {
    if (!detail) {
      return {
        activeStudents: 0,
        pendingInvites: 0,
        publishedCourses: 0
      }
    }

    return {
      activeStudents: detail.members.filter((member) => member.status === 'active').length,
      pendingInvites: detail.invites.filter((invite) => invite.status === 'pending').length,
      publishedCourses: detail.courses.length
    }
  }, [detail])

  const recentMembers = useMemo(() => (
    (detail?.members || [])
      .filter((member) => member.status === 'active')
      .slice(0, 4)
  ), [detail])

  useEffect(() => {
    if (!subjectId && unassignedSubjects[0]?.id) {
      setSubjectId(unassignedSubjects[0].id)
    }
  }, [subjectId, unassignedSubjects])

  const handleAttachCourse = async () => {
    if (!subjectId) {
      toast.error('Choose a course to attach')
      return
    }

    setAttaching(true)

    try {
      const response = await fetch(`/api/teacher/classrooms/${params.classroomId}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subjectId })
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to attach course')
      }

      toast.success('Course attached')
      await loadDetail()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setAttaching(false)
    }
  }

  if (loading || !detail) {
    return <div className="text-muted-foreground">Loading classroom...</div>
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-primary/15 via-background to-emerald-500/10 px-6 py-7 shadow-[0_24px_80px_-48px_rgba(34,197,94,0.55)] md:px-8 md:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <Button variant="ghost" className="mb-4 -ml-2 w-fit text-muted-foreground" onClick={() => router.push('/teacher/classrooms')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Teacher Portal
              </Button>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <School className="h-3.5 w-3.5 text-primary" />
                Teacher Classroom
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{detail.classroom.name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {detail.classroom.description || 'Manage published courses, student access, and classroom performance from one place.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-11 border-white/10 bg-white/5"
                onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/students`)}
              >
                <Users className="mr-2 h-4 w-4" />
                Manage Students
              </Button>
              <Button
                className="h-11"
                onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/analytics`)}
              >
                <ChartColumn className="mr-2 h-4 w-4" />
                Open Analytics
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Published courses</CardDescription>
                <CardTitle className="text-3xl">{summary.publishedCourses}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Active students</CardDescription>
                <CardTitle className="text-3xl">{summary.activeStudents}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Pending invites</CardDescription>
                <CardTitle className="text-3xl">{summary.pendingInvites}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Available to attach</CardDescription>
                <CardTitle className="text-3xl">{unassignedSubjects.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Published Courses</h2>
              <p className="text-sm text-muted-foreground">Subjects currently exposed to students inside this classroom.</p>
            </div>
          </div>

          {detail.courses.length === 0 ? (
            <Card className="rounded-[24px] border-dashed border-white/10 bg-black/10">
              <CardHeader className="items-center text-center">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <CardTitle>No courses attached yet</CardTitle>
                <CardDescription>Attach one of your existing subjects to publish it into this classroom.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {detail.courses.map((course, index) => (
                <Card key={course.id} className="group flex h-full flex-col rounded-[24px] border-white/10 bg-gradient-to-br from-black/20 to-white/[0.03] hover:border-primary/30">
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Course {index + 1}</div>
                        <CardTitle className="mt-2 line-clamp-2 text-xl">{course.subjects?.title || 'Untitled course'}</CardTitle>
                        <CardDescription className="mt-2 line-clamp-3 leading-6">
                          {course.subjects?.description || 'No description provided.'}
                        </CardDescription>
                      </div>
                      <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        Published
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="mt-auto space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Layers3 className="h-4 w-4 text-primary" />
                          Order
                        </div>
                        <div className="mt-2 text-lg font-semibold">{(course.order_index || 0) + 1}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Sparkles className="h-4 w-4 text-primary" />
                          Cheat sheet
                        </div>
                        <div className="mt-2 text-lg font-semibold">{course.subjects?.cheat_sheet ? 'Ready' : 'Pending'}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <BookOpen className="h-4 w-4 text-primary" />
                        Live in classroom
                      </div>
                      <Button variant="ghost" onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/analytics`)}>
                        View Analytics
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle className="text-xl">Attach a Course</CardTitle>
              <CardDescription>Publish an existing Learnify subject inside this classroom.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject-select">Available subjects</Label>
                <select
                  id="subject-select"
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  className="flex h-11 w-full rounded-xl border border-white/10 bg-background/80 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/40"
                >
                  <option value="">Select a subject</option>
                  {unassignedSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.title}</option>
                  ))}
                </select>
              </div>

              {unassignedSubjects.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-muted-foreground">
                  All available subjects are already attached to this classroom.
                </div>
              ) : (
                <Button className="w-full h-11" onClick={handleAttachCourse} disabled={attaching}>
                  <Plus className="mr-2 h-4 w-4" />
                  {attaching ? 'Attaching...' : 'Attach Course'}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle className="text-xl">Classroom Access</CardTitle>
              <CardDescription>Jump to the most common management tasks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="h-11 w-full justify-between border-white/10 bg-white/[0.04]"
                onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/students`)}
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Students and Invites
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full justify-between border-white/10 bg-white/[0.04]"
                onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/analytics`)}
              >
                <span className="flex items-center gap-2">
                  <ChartColumn className="h-4 w-4 text-primary" />
                  Performance Analytics
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle className="text-xl">Roster Snapshot</CardTitle>
              <CardDescription>Quick view of active learners in this classroom.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentMembers.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-muted-foreground">
                  No active students yet. Invite learners from the students page.
                </div>
              ) : (
                recentMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {member.profile?.full_name || member.profile?.username || 'Student'}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {member.profile?.education_level || 'Education level not set'}
                      </div>
                    </div>
                    <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                      Active
                    </div>
                  </div>
                ))
              )}

              <Button
                variant="ghost"
                className="w-full justify-between"
                onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/students`)}
              >
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Open full roster
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
