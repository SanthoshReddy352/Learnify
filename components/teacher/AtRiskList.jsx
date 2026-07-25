'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

// "Who needs a look this week" (Plan P12.2).
//
// This is the insight teachers act on, so it sits at the top of the page and
// leads with ONE sentence per student — the rest of the numbers stay available in
// the detail view. Students who are fine are still listed (collapsed), because a
// list that hides them would leave a teacher unsure whether the class was
// checked or the feature was broken.
//
// Copy is observational, not judgemental — see describeStudentConcern in
// lib/teacher/insights.js, where a unit test enforces it.

// Status palette from the dataviz skill — fixed, mode-invariant, and deliberately
// distinct from the series/heatmap colors so a status can never impersonate data.
// Each ships with an icon AND a text label, so the color is never load-bearing:
// on the light surface `warning` and `serious` are sub-3:1 by design.
const LEVELS = {
  high: { color: '#d03b3b', icon: AlertCircle, tint: 'rgba(208,59,59,0.10)' },
  medium: { color: '#ec835a', icon: AlertTriangle, tint: 'rgba(236,131,90,0.12)' },
  low: { color: '#fab219', icon: Info, tint: 'rgba(250,178,25,0.14)' },
  'on-track': { color: '#0ca30c', icon: CheckCircle2, tint: 'rgba(12,163,12,0.10)' }
}

function StudentRow({ student, onOpen }) {
  const level = LEVELS[student.attention?.level] || LEVELS['on-track']
  const Icon = level.icon

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: level.tint }}
        >
          <Icon className="h-4 w-4" style={{ color: level.color }} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="truncate font-medium text-foreground">{student.name}</p>
            {/* The label is the accessible carrier of the status, not the color. */}
            <span className="text-xs text-muted-foreground">{student.attention?.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{student.attention?.headline}</p>
          {student.attention?.level !== 'on-track' && (
            <p className="mt-1 text-xs text-muted-foreground">{student.attention?.action}</p>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-start sm:self-center"
        onClick={() => onOpen(student.studentUserId)}
      >
        Open
      </Button>
    </li>
  )
}

export default function AtRiskList({ students = [], onSelectStudent }) {
  const [showOnTrack, setShowOnTrack] = useState(false)

  const { flagged, onTrack } = useMemo(() => ({
    flagged: students.filter((s) => s.attention?.level && s.attention.level !== 'on-track'),
    onTrack: students.filter((s) => !s.attention?.level || s.attention.level === 'on-track')
  }), [students])

  if (students.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No active students in this classroom yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {flagged.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: LEVELS['on-track'].color }} aria-hidden="true" />
          Everyone is keeping pace — nothing needs a follow-up this week.
        </p>
      ) : (
        <ul className="space-y-2">
          {flagged.map((student) => (
            <StudentRow key={student.studentUserId} student={student} onOpen={onSelectStudent} />
          ))}
        </ul>
      )}

      {onTrack.length > 0 && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowOnTrack((v) => !v)} className="text-xs">
            {showOnTrack
              ? 'Hide students who are on track'
              : `Show ${onTrack.length} student${onTrack.length === 1 ? '' : 's'} on track`}
          </Button>
          {showOnTrack && (
            <ul className="space-y-2">
              {onTrack.map((student) => (
                <StudentRow key={student.studentUserId} student={student} onOpen={onSelectStudent} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
