'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Flag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const STATUS_LABELS = {
  not_started: { label: 'Not started', className: 'text-muted-foreground' },
  in_progress: { label: 'In progress', className: 'text-blue-600 dark:text-blue-400' },
  graded: { label: 'Submitted', className: 'text-foreground' },
  submitted: { label: 'Submitted', className: 'text-foreground' }
}

/**
 * The class roster for one paper.
 *
 * Lists EVERY active student, not just those who submitted — "who still hasn't
 * sat this" is the question this screen exists to answer, and a list of
 * completed attempts cannot answer it.
 */
export default function AssessmentResults({ assessmentId }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/teacher/assessments/${assessmentId}/results`)
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Could not load results')
        if (!cancelled) setData(body)
      } catch (error) {
        if (!cancelled) toast.error(error.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [assessmentId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading results…
      </div>
    )
  }

  if (!data || data.rows.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No students in this classroom yet.</p>
  }

  const { rows, stats } = data

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Submitted" value={`${stats.submitted}/${stats.total}`} />
        <Stat label="Passed" value={stats.passed} />
        <Stat label="Average" value={stats.averageScore === null ? '—' : `${stats.averageScore}%`} />
        <Stat label="Median" value={stats.medianScore === null ? '—' : `${stats.medianScore}%`} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 font-medium">Student</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Score</th>
              <th className="px-2 py-2 font-medium">Submitted</th>
              <th className="px-2 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = STATUS_LABELS[row.status] || STATUS_LABELS.not_started
              return (
                <tr key={row.memberId} className="border-b border-border/50">
                  <td className="px-2 py-2.5">{row.name}</td>
                  <td className={`px-2 py-2.5 ${status.className}`}>{status.label}</td>
                  <td className="px-2 py-2.5">
                    {row.score === null ? (
                      '—'
                    ) : (
                      <span className={row.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}>
                        {Math.round(row.score)}%
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-muted-foreground">
                    {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-2 py-2.5">
                    {/* Advisory only. These are described, never scored, and
                        never auto-penalize — a human decides what they mean. */}
                    {row.flags?.kinds?.length ? (
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <Flag className="h-3 w-3" />
                        {row.flags.kinds.length} to review
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
    </div>
  )
}
