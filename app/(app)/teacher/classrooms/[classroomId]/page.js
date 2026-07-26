'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight,
  BookOpen,
  ChartColumn,
  ClipboardList,
  Layers3,
  Plus,
  School,
  Sparkles,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { EmptyState, PageHeader, PageLoading, Panel, SectionHeading, StatCard, StatGrid } from '@/components/shared/page'

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
    return <PageLoading />
  }

  return (
    <>
      <PageHeader
        eyebrow="Teacher classroom"
        eyebrowIcon={School}
        title={detail.classroom.name}
        description={detail.classroom.description || 'Manage published courses, student access, and classroom performance from one place.'}
        onBack={() => router.push('/teacher/classrooms')}
        backLabel="Teacher portal"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/students`)}
            >
              <Users className="mr-2 h-4 w-4" />
              Students
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/assessments`)}
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              Assessments
            </Button>
            <Button onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/analytics`)}>
              <ChartColumn className="mr-2 h-4 w-4" />
              Analytics
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard label="Published courses" value={summary.publishedCourses} icon={BookOpen} />
        <StatCard label="Active students" value={summary.activeStudents} icon={Users} />
        <StatCard label="Pending invites" value={summary.pendingInvites} icon={ClipboardList} />
        <StatCard
          label="Available to attach"
          value={unassignedSubjects.length}
          icon={Layers3}
          hint="Subjects not yet published here"
        />
      </StatGrid>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,360px)]">
        <div className="space-y-4">
          <SectionHeading
            title="Published courses"
            description="Subjects currently visible to students inside this classroom."
          />

          {detail.courses.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No courses attached yet"
              description="Attach one of your existing subjects to publish it into this classroom. Students only see subjects you attach here."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {detail.courses.map((course, index) => (
                <Card key={course.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Course {index + 1}
                        </p>
                        <CardTitle className="line-clamp-2 text-lg">
                          {course.subjects?.title || 'Untitled course'}
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Published
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2 leading-6">
                      {course.subjects?.description || 'No description provided.'}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="mt-auto space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Layers3 className="h-3.5 w-3.5 text-primary" />
                          Order
                        </div>
                        <div className="text-xl font-semibold tabular-nums">{(course.order_index || 0) + 1}</div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          Cheat sheet
                        </div>
                        <div className="text-xl font-semibold">
                          {course.subjects?.cheat_sheet ? 'Ready' : 'Pending'}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/analytics`)}
                      >
                        View analytics
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Attach a course</CardTitle>
              <CardDescription>Publish one of your existing subjects into this classroom.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {unassignedSubjects.length === 0 ? (
                <Panel className="text-sm text-muted-foreground">
                  Every subject you own is already attached to this classroom.
                </Panel>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="subject-select">Available subjects</Label>
                    <select
                      id="subject-select"
                      value={subjectId}
                      onChange={(event) => setSubjectId(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select a subject</option>
                      {unassignedSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>{subject.title}</option>
                      ))}
                    </select>
                  </div>

                  <Button className="w-full" onClick={handleAttachCourse} disabled={attaching}>
                    <Plus className="mr-2 h-4 w-4" />
                    {attaching ? 'Attaching…' : 'Attach course'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Roster snapshot</CardTitle>
              <CardDescription>
                {summary.activeStudents === 0
                  ? 'No students have joined yet.'
                  : `${summary.activeStudents} active ${summary.activeStudents === 1 ? 'student' : 'students'}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentMembers.length === 0 ? (
                <Panel className="text-sm text-muted-foreground">
                  Invite learners by email or share the class link from the students page.
                </Panel>
              ) : (
                recentMembers.map((member) => (
                  <Panel key={member.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {member.profile?.full_name || member.profile?.username || 'Student'}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {member.profile?.education_level || 'Education level not set'}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Active
                    </Badge>
                  </Panel>
                ))
              )}

              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/students`)}
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Open full roster
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  )
}
