'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ClipboardList, Plus, Users, Clock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { windowState } from '@/lib/assessment/authoring'

const STATE_STYLES = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  open: { label: 'Open now', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  closed: { label: 'Closed', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' }
}

export default function ClassroomAssessmentsPage() {
  const params = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [assessments, setAssessments] = useState([])
  const [courses, setCourses] = useState([])
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')

  const load = async () => {
    try {
      const [assessmentsRes, classroomRes] = await Promise.all([
        fetch(`/api/teacher/assessments?classroomId=${params.classroomId}`),
        fetch(`/api/teacher/classrooms/${params.classroomId}`)
      ])

      const assessmentsData = await assessmentsRes.json()
      if (!assessmentsRes.ok) throw new Error(assessmentsData.error || 'Failed to load assessments')

      const classroomData = await classroomRes.json()
      if (!classroomRes.ok) throw new Error(classroomData.error || 'Failed to load classroom')

      setAssessments(assessmentsData.assessments || [])
      setCourses(classroomData.courses || [])
      if (!subjectId && classroomData.courses?.[0]?.subject_id) {
        setSubjectId(classroomData.courses[0].subject_id)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [params.classroomId])

  const handleCreate = async () => {
    if (!title.trim()) return toast.error('Give the assessment a title')
    if (!subjectId) return toast.error('Choose which course it covers')

    setCreating(true)
    try {
      const response = await fetch('/api/teacher/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId: params.classroomId, subjectId, title: title.trim() })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not create the assessment')

      toast.success('Draft created')
      router.push(`/teacher/classrooms/${params.classroomId}/assessments/${data.assessment.id}`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  // Derived from timestamps rather than stored, so a paper opens and closes on
  // time without anything having to run on a schedule.
  const rows = useMemo(
    () => assessments.map((a) => ({ ...a, state: windowState(a) })),
    [assessments]
  )

  if (loading) return <div className="text-muted-foreground">Loading assessments…</div>

  return (
    <div className="space-y-8">
      <div>
        <Button
          variant="ghost"
          className="mb-4 -ml-2 w-fit text-muted-foreground"
          onClick={() => router.push(`/teacher/classrooms/${params.classroomId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to classroom
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">Assessments</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Draft a test, schedule when it opens, and see how the class did.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New assessment</CardTitle>
          <CardDescription>Starts as a draft — students see nothing until you publish it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="assessment-title">Title</Label>
            <Input
              id="assessment-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Unit 2 — Networking Fundamentals"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assessment-course">Course</Label>
            <select
              id="assessment-course"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {courses.length === 0 && <option value="">Attach a course first</option>}
              {/* `subjects`, not `subject`: getTeacherClassroomDetail selects the
                  relation as `subjects (...)`, so that is the key on the row. */}
              {courses.map((course) => (
                <option key={course.id} value={course.subject_id}>
                  {course.subjects?.title || 'Course'}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleCreate} disabled={creating || courses.length === 0} className="h-10">
            <Plus className="mr-2 h-4 w-4" />
            {creating ? 'Creating…' : 'Create draft'}
          </Button>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No assessments yet. Create a draft above to set your first test.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map((assessment) => {
            const style = STATE_STYLES[assessment.state] || STATE_STYLES.draft
            return (
              <Card
                key={assessment.id}
                className="cursor-pointer transition-colors hover:border-primary/40"
                onClick={() =>
                  router.push(`/teacher/classrooms/${params.classroomId}/assessments/${assessment.id}`)
                }
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-lg">{assessment.title}</CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {assessment.duration_minutes && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {assessment.duration_minutes} min
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Pass at {assessment.pass_score}%
                      </span>
                      {assessment.max_attempts > 1 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {assessment.max_attempts} attempts
                        </span>
                      )}
                      {assessment.opens_at && (
                        <span>Opens {new Date(assessment.opens_at).toLocaleString()}</span>
                      )}
                    </CardDescription>
                  </div>
                  <Badge className={style.className} variant="secondary">
                    {style.label}
                  </Badge>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
