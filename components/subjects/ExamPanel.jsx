'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { GraduationCap, Loader2, AlertTriangle, Sparkles, Info } from 'lucide-react'
import { toast } from 'sonner'
import ExamRunner from '@/components/subjects/ExamRunner'
import VivaPanel from '@/components/subjects/VivaPanel'
import CertificatePanel from '@/components/subjects/CertificatePanel'

// Summative exam shell (Plan P9.4 + P10.3/P10.5).
//
// Three phases: idle → running (ExamRunner: one question at a time, hardened) →
// result. A passed SELF-PACED attempt then has to clear the oral viva
// (VivaPanel); a classroom attempt goes to the teacher instead. This component
// never sees an answer key and never computes a score — both come from the
// server.
export default function ExamPanel({ subjectId, className = '' }) {
  const [attempt, setAttempt] = useState(null)
  const [starting, setStarting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)
  const [vivaPassed, setVivaPassed] = useState(false)

  const start = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, itemCount: 12 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start the exam')
      setResult(null)
      setVivaPassed(false)
      setAttempt(data)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setStarting(false)
    }
  }

  const stockBank = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/generate-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, itemCount: 16 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not build the item bank')
      if (!data.stored) {
        toast.message('Questions were generated but not saved — assessment storage is not enabled yet.')
        return
      }
      toast.success(`Added ${data.stored} questions to the bank.`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setGenerating(false)
    }
  }

  // Phase 2: taking the exam.
  if (attempt && !result) {
    return (
      <div className={className}>
        <ExamRunner attempt={attempt} onSubmitted={setResult} />
      </div>
    )
  }

  // Phase 3: result (+ viva when the mode requires it).
  if (result) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className={`rounded-xl border p-5 ${result.passed ? 'border-primary/40 bg-primary/10' : 'border-destructive/40 bg-destructive/10'}`}>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground m-0">
              {result.passed ? 'Passed' : 'Not passed'} — {result.score}%
            </h3>
          </div>
          <p className="text-sm text-muted-foreground m-0">
            {result.correctCount} of {result.total} correct · pass mark {result.passScore}%
          </p>

          {result.overconfidentConcepts?.length > 0 && (
            <p className="mt-3 mb-0 flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              You were confident but wrong on <strong>{result.overconfidentConcepts.join(', ')}</strong> — those
              come back first.
            </p>
          )}
          {result.weakConcepts?.length > 0 && (
            <p className="mt-2 mb-0 text-sm text-muted-foreground">
              Concepts to revisit: {result.weakConcepts.join(', ')}
            </p>
          )}

          {/* The learner sees their own advisory notes. Being flagged silently
              would be indefensible; the wording stays descriptive, not accusing. */}
          {result.integrityNotes?.length > 0 && (
            <p className="mt-3 mb-0 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Noted about this session: {result.integrityNotes.join(', ').replace(/_/g, ' ')}.
              {result.mode === 'classroom'
                ? ' Your teacher sees this alongside your result.'
                : ' This is recorded for context only.'}
            </p>
          )}
        </div>

        {result.vivaRequired && (
          <VivaPanel attemptId={attempt.attemptId} onPassed={() => setVivaPassed(true)} />
        )}

        {/* A certificate is offered only once the gate for this mode is actually
            cleared: the teacher-reviewed classroom pass, or the viva for a
            self-paced attempt nobody invigilated. */}
        {result.passed && (!result.vivaRequired || vivaPassed) && (
          <CertificatePanel attemptId={attempt.attemptId} />
        )}

        <Button onClick={start} variant="outline">Take another exam</Button>
      </div>
    )
  }

  // Phase 1: idle.
  return (
    <div className={`rounded-xl border border-border border-dashed bg-foreground/5 p-8 flex flex-col items-center text-center ${className}`}>
      <GraduationCap className="h-9 w-9 mb-3 text-primary/70" />
      <p className="text-sm text-muted-foreground mb-2 max-w-md">
        Sit a graded exam across this subject. Questions are drawn from what your
        lessons actually taught, and it is scored on the server.
      </p>
      <p className="text-xs text-muted-foreground mb-4 max-w-md">
        One question at a time, 90 seconds each, no going back. If you pass a
        self-paced subject you will be asked to explain a few answers afterwards.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <Button onClick={start} disabled={starting} variant="outline" className="border-primary/30 hover:bg-primary/10 text-primary">
          {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
          {starting ? 'Preparing your exam…' : 'Start an exam'}
        </Button>
        <Button onClick={stockBank} disabled={generating} variant="ghost" size="sm" className="text-muted-foreground">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {generating ? 'Writing questions…' : 'Add questions to the bank'}
        </Button>
      </div>
    </div>
  )
}
