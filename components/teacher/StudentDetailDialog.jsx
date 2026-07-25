'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { formatIst } from '@/lib/classrooms/format'
import { CELL_STATES, CELL_LABELS } from '@/lib/teacher/insights'

// Per-student progress view (Plan P12.3).
//
// Ordered as a teacher reads it: what to do about this student, then the four
// numbers that justify it, then where they are actually stuck, then effort over
// time, then the raw session log. The old version led with sixteen metric tiles
// and buried the recommendation.

function formatMinutes(minutes = 0) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

function formatQuality(value) {
  return value === null || value === undefined ? '—' : `${value}/5`
}

function formatIdle(idleDays) {
  if (idleDays === null) return 'No sessions yet'
  if (idleDays <= 0) return 'Studied today'
  if (idleDays === 1) return 'Studied yesterday'
  return `${idleDays} days since last session`
}

const STATUS_ORDER = ['mastered', 'reviewing', 'learning', 'available', 'locked']
const STATUS_LABELS = {
  mastered: 'Mastered',
  reviewing: 'In review',
  learning: 'Learning',
  available: 'Unlocked',
  locked: 'Locked'
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

export default function StudentDetailDialog({ student, heatmap, open, onOpenChange }) {
  // The concepts/topics THIS student is weakest on, read out of the class grid so
  // the drill-down and the heatmap can never disagree.
  const trouble = useMemo(() => {
    if (!student || !heatmap?.rows) return []
    const concerning = new Set([CELL_STATES.STRUGGLING, CELL_STATES.WATCH])
    return heatmap.rows
      .map((row) => {
        const cell = row.cells.find((c) => c.studentUserId === student.studentUserId)
        return cell && concerning.has(cell.state) ? { label: row.label, ...cell } : null
      })
      .filter(Boolean)
      .sort((a, b) => (a.state === b.state ? 0 : a.state === CELL_STATES.STRUGGLING ? -1 : 1))
      .slice(0, 8)
  }, [student, heatmap])

  if (!student) return null

  const breakdown = student.statusBreakdown || {}
  const breakdownTotal = STATUS_ORDER.reduce((sum, key) => sum + (breakdown[key] || 0), 0)
  const hasEffort = (student.weeklyTrend || []).some((week) => week.minutes > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-3xl overflow-y-auto border-border bg-card">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl">{student.name}</DialogTitle>
          <DialogDescription>
            {student.attention?.action}
            {student.educationLevel ? ` · ${student.educationLevel}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Why they are flagged, in words, before any numbers. */}
          {student.attention?.reasons?.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {student.attention.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Topics completed" value={`${student.overall.completionPercentage}%`} />
            <Stat label="Reviews due" value={student.dueReviews} />
            <Stat label="This week" value={formatMinutes(student.currentWeekMinutes)} />
            <Stat label="Recall rating" value={formatQuality(student.averageQuality)} />
          </div>

          {/* Where they stand across the course, as one bar rather than five tiles. */}
          {breakdownTotal > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Course coverage</p>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                {STATUS_ORDER.map((key) => {
                  const count = breakdown[key] || 0
                  if (count === 0) return null
                  return (
                    <div
                      key={key}
                      title={`${STATUS_LABELS[key]}: ${count}`}
                      aria-label={`${STATUS_LABELS[key]}: ${count}`}
                      style={{
                        width: `${(count / breakdownTotal) * 100}%`,
                        // Sequential: the further along the status, the stronger
                        // the fill — one hue, so no CVD risk.
                        background: `hsl(var(--primary) / ${1 - STATUS_ORDER.indexOf(key) * 0.18})`
                      }}
                    />
                  )
                })}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {STATUS_ORDER.filter((key) => (breakdown[key] || 0) > 0).map((key) => (
                  <li key={key}>
                    {STATUS_LABELS[key]} {breakdown[key]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What to reteach. */}
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">
              Where {student.name.split(' ')[0]} is stuck
            </p>
            {trouble.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nothing is showing a weak result — recall ratings are holding up.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {trouble.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="truncate text-foreground">{item.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {CELL_LABELS[item.state]}
                      {item.reviewCount > 0 ? ` · ${item.averageQuality}/5` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Effort over time — one measure, one axis. */}
          <div>
            <p className="mb-1 text-sm font-semibold text-foreground">Study time by week</p>
            <p className="mb-3 text-xs text-muted-foreground">{formatIdle(student.idleDays)}</p>
            <div className="h-[150px] w-full">
              {hasEffort ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={student.weeklyTrend} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={44} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--foreground)/0.04)' }}
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem'
                      }}
                      formatter={(value) => [`${value} min`, 'Studied']}
                      labelFormatter={(label) => `Week of ${label}`}
                    />
                    <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No study time logged in the last six weeks
                </div>
              )}
            </div>
          </div>

          {/* Per-course progress. */}
          {student.courses?.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Courses</p>
              <ul className="space-y-2">
                {student.courses.map((course) => (
                  <li key={course.classroomCourseId} className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm text-foreground">{course.subjectTitle}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {course.masteredTopics}/{course.totalTopics} mastered
                        {course.dueReviews > 0 ? ` · ${course.dueReviews} due` : ''}
                      </span>
                    </div>
                    <Progress value={course.completionPercentage} className="h-1.5" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Raw log last — available, not prominent. */}
          {student.recentActivity?.length > 0 && (
            <details className="rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Recent sessions ({student.recentActivity.length})
              </summary>
              <ul className="mt-3 space-y-2 text-sm">
                {student.recentActivity.map((activity, index) => (
                  <li
                    key={`${activity.topicId || index}-${activity.createdAt}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <span className="truncate text-foreground">{activity.topicTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      {activity.sessionType === 'review' ? 'Review' : 'Learning'} ·{' '}
                      {formatMinutes(activity.durationMinutes)}
                      {activity.qualityRating === null || activity.qualityRating === undefined
                        ? ''
                        : ` · ${activity.qualityRating}/5`}{' '}
                      · {formatIst(activity.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
