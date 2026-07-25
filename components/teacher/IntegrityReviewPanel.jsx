'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldQuestion, Loader2, Check, Flag, Ban } from 'lucide-react'
import { toast } from 'sonner'

// Classroom exam-integrity review (Plan P10.4).
//
// The framing is the feature: these are SIGNALS, not accusations. Every one has
// an innocent explanation, so the panel describes what was observed, shows the
// result beside it, and asks the teacher to decide. Nothing here penalizes a
// student automatically, and the decision is recorded so it is auditable.
const DECISIONS = [
  { value: 'cleared', label: 'No concern', icon: Check },
  { value: 'flagged', label: 'Follow up', icon: Flag },
  { value: 'invalidated', label: 'Invalidate', icon: Ban }
]

const LEVEL_TONE = {
  review: 'border-destructive/40 bg-destructive/5',
  watch: 'border-amber-500/40 bg-amber-500/5',
  none: 'border-border/60'
}

export default function IntegrityReviewPanel({ classroomId, className = '' }) {
  const [attempts, setAttempts] = useState([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/teacher/classrooms/${classroomId}/integrity`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load exam results')
      setAttempts(data.attempts || [])
      setAvailable(data.available !== false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [classroomId])

  useEffect(() => { load() }, [load])

  const decide = async (attemptId, decision) => {
    setSaving(attemptId)
    try {
      const res = await fetch(`/api/teacher/classrooms/${classroomId}/integrity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, decision })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not record your decision')
      setAttempts((prev) =>
        prev.map((a) => (a.attemptId === attemptId ? { ...a, review: { decision } } : a))
      )
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(null)
    }
  }

  const flagged = attempts.filter((a) => a.severity > 0)

  return (
    <Card className={`rounded-[24px] border-border/60 bg-card/80 backdrop-blur-sm ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldQuestion className="h-5 w-5 text-primary" />
          Exam sessions
        </CardTitle>
        <CardDescription>
          {available
            ? 'Signals worth a look, not verdicts — each has an innocent explanation. You decide what it means.'
            : 'Exam results will appear here once assessments are enabled for this classroom.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading exam sessions…
          </div>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">
            No graded exams yet.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {flagged.length === 0
                ? `${attempts.length} graded exam${attempts.length === 1 ? '' : 's'}, nothing unusual noted.`
                : `${flagged.length} of ${attempts.length} exam${attempts.length === 1 ? '' : 's'} had something worth reading.`}
            </p>

            <ul className="space-y-3">
              {attempts.map((a) => (
                <li key={a.attemptId} className={`rounded-2xl border p-4 ${LEVEL_TONE[a.level] || LEVEL_TONE.none}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground m-0">{a.studentName}</p>
                      <p className="text-xs text-muted-foreground m-0">
                        {a.subjectTitle} · {a.score}% · {a.passed ? 'passed' : 'not passed'}
                      </p>
                    </div>
                    {a.submittedAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.submittedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {a.flags.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {a.flags.map((f, i) => (
                        <li key={i} className="text-sm text-muted-foreground">• {f}</li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {a.review ? (
                      <span className="text-xs text-muted-foreground">
                        Your decision: <strong>{DECISIONS.find((d) => d.value === a.review.decision)?.label || a.review.decision}</strong>
                        {' · '}
                        <button type="button" onClick={() => setAttempts((prev) => prev.map((x) => x.attemptId === a.attemptId ? { ...x, review: null } : x))} className="underline hover:text-foreground">
                          change
                        </button>
                      </span>
                    ) : (
                      DECISIONS.map(({ value, label, icon: Icon }) => (
                        <Button
                          key={value}
                          onClick={() => decide(a.attemptId, value)}
                          disabled={saving === a.attemptId}
                          variant="outline"
                          size="sm"
                          className="text-muted-foreground"
                        >
                          {saving === a.attemptId
                            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            : <Icon className="mr-1.5 h-3.5 w-3.5" />}
                          {label}
                        </Button>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
