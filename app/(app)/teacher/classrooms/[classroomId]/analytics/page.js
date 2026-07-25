'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Search, Target, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatIst } from '@/lib/classrooms/format'
import IntegrityReviewPanel from '@/components/teacher/IntegrityReviewPanel'
import AtRiskList from '@/components/teacher/AtRiskList'
import ConceptHeatmap from '@/components/teacher/ConceptHeatmap'
import ClassTrend from '@/components/teacher/ClassTrend'
import StudentDetailDialog from '@/components/teacher/StudentDetailDialog'

// Teacher analytics (Plan P12.4 — UI-first rewrite).
//
// The owner's note was that the UI was the biggest flaw here: the previous
// version had six KPI cards, four metric tiles per student, two tables and a
// sixteen-tile modal — every number, no answer. The rewrite is ordered by what a
// teacher does with it:
//
//   1. A plain-language read of the class, in sentences.
//   2. WHO needs a look this week, with one reason and one action each.
//   3. WHAT to reteach — the concept heatmap, worst rows first.
//   4. Whether effort is holding up — two single-measure charts.
//   5. Everything else (courses, exam integrity) below, secondary.
//
// Three KPIs, not six: the rest were available in the sections that explain them.

function formatQuality(value) {
  return value === null || value === undefined ? '—' : `${value}/5`
}

function Kpi({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <p className="text-xs">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Section({ title, description, children, action }) {
  return (
    <Card className="border-border bg-card/80">
      <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function TeacherClassroomAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState(null)
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/teacher/classrooms/${params.classroomId}/analytics`)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load analytics')
        setAnalytics(payload)
      } catch (error) {
        toast.error(error.message)
        router.push(`/teacher/classrooms/${params.classroomId}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [params.classroomId, router])

  const students = useMemo(() => {
    const search = query.trim().toLowerCase()
    const all = analytics?.students || []
    if (!search) return all
    return all.filter((student) =>
      [student.name, student.educationLevel, student.attention?.label, student.attention?.headline]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    )
  }, [analytics, query])

  const selectedStudent = useMemo(
    () => analytics?.students?.find((s) => s.studentUserId === selectedStudentId) || null,
    [analytics, selectedStudentId]
  )

  if (loading || !analytics) {
    return <div className="text-muted-foreground">Loading analytics...</div>
  }

  const { summary, headline = [] } = analytics

  return (
    <>
      <div className="space-y-6">
        {/* 1 — The read, in sentences. */}
        <header>
          <Button
            variant="ghost"
            className="-ml-2 mb-3 w-fit text-muted-foreground"
            onClick={() => router.push(`/teacher/classrooms/${params.classroomId}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to classroom
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{analytics.classroom.name}</h1>
          <div className="mt-3 max-w-2xl space-y-1">
            {headline.map((line) => (
              <p key={line} className="text-base leading-relaxed text-foreground">
                {line}
              </p>
            ))}
          </div>
          {analytics.meta?.generatedAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              Updated {formatIst(analytics.meta.generatedAt)} IST
            </p>
          )}
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi
            icon={AlertTriangle}
            label="Need a look"
            value={summary.studentsNeedingAttention}
            hint={`of ${summary.rosterSize} student${summary.rosterSize === 1 ? '' : 's'}`}
          />
          <Kpi
            icon={Users}
            label="Studied this week"
            value={summary.activeStudentsThisWeek}
            hint={`${summary.reviewCount} reviews completed in total`}
          />
          <Kpi
            icon={Target}
            label="Average completion"
            value={`${summary.averageCompletion}%`}
            hint={`recall ${formatQuality(summary.averageReviewQuality)}`}
          />
        </div>

        {/* 2 — Who. */}
        <Section
          title="Needs a look this week"
          description="Ranked by how much the data suggests following up. Every line describes what was observed, not a judgement of the student."
          action={
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a student"
                className="pl-9"
                aria-label="Find a student"
              />
            </div>
          }
        >
          <AtRiskList students={students} onSelectStudent={setSelectedStudentId} />
        </Section>

        {/* 3 — What to reteach. */}
        <Section
          title={analytics.heatmap?.source === 'concepts' ? 'Concepts the class is finding hard' : 'Topics the class is finding hard'}
          description="Each square is one student. Darker means more concern, and the weakest rows are at the top."
        >
          <ConceptHeatmap heatmap={analytics.heatmap} onSelectStudent={setSelectedStudentId} />
        </Section>

        {/* 4 — Is effort holding up. */}
        <Section title="Class trend" description="The last six weeks.">
          <ClassTrend trend={analytics.trend || []} />
        </Section>

        {/* 5 — Secondary detail. */}
        <Section title="Courses" description="Where the pressure sits across the classroom.">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Need a look</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Recall</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.courses.map((course) => (
                  <TableRow key={course.classroomCourseId}>
                    <TableCell className="font-medium">{course.subjectTitle}</TableCell>
                    <TableCell className="text-right tabular-nums">{course.activeStudents}</TableCell>
                    <TableCell className="text-right tabular-nums">{course.studentsNeedingAttention}</TableCell>
                    <TableCell className="text-right tabular-nums">{course.averageCompletion}%</TableCell>
                    <TableCell className="text-right tabular-nums">{course.dueReviews}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQuality(course.averageQuality)}</TableCell>
                  </TableRow>
                ))}
                {analytics.courses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No courses attached to this classroom yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Section>

        {/* Exam sessions + advisory integrity signals (P10.4) */}
        <IntegrityReviewPanel classroomId={params.classroomId} />
      </div>

      <StudentDetailDialog
        student={selectedStudent}
        heatmap={analytics.heatmap}
        open={Boolean(selectedStudent)}
        onOpenChange={(open) => !open && setSelectedStudentId(null)}
      />
    </>
  )
}
