'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'

// Oral viva for a passed self-paced exam (Plan P10.5).
//
// Framed to the learner as what it is: a chance to show they understand what they
// answered, not an accusation. It is the integrity gate for self-paced subjects
// precisely because it is also good pedagogy — explaining out loud is one of the
// strongest ways to consolidate understanding.
export default function VivaPanel({ attemptId, className = '', onPassed }) {
  const [questions, setQuestions] = useState(null)
  const [explanations, setExplanations] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const start = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/viva/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start the viva')
      setQuestions(data.questions)
      setExplanations({})
      setResult(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    const answers = (questions || []).map((q, i) => ({
      concept: q.concept,
      question: q.question,
      expectedPoints: q.expected_points || [],
      explanation: (explanations[i] || '').trim()
    }))

    if (answers.some((a) => a.explanation.length < 10)) {
      toast.error('Give each question a real answer in your own words first.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/viva/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, answers })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not submit the viva')
      setResult(data)
      // Passing the viva is what unlocks a self-paced certificate (P9.5).
      if (data.passed) onPassed?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!questions) {
    return (
      <div className={`rounded-xl border border-primary/30 bg-primary/5 p-6 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <Mic className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground m-0">One more step</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          You passed the written exam. Now explain a few of your answers in your own
          words — that is what makes the result mean something without a human
          invigilator, and explaining it out loud is how it sticks.
        </p>
        <Button onClick={start} disabled={loading} variant="outline" className="border-primary/30 hover:bg-primary/10 text-primary">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
          {loading ? 'Preparing questions…' : 'Start the viva'}
        </Button>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <Mic className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground m-0">Explain your answers</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Three or four sentences each is plenty. You are marked on understanding, not
        on wording or spelling.
      </p>

      {result && (
        <div className={`mb-5 rounded-lg border p-4 ${result.passed ? 'border-primary/40 bg-primary/10' : 'border-destructive/40 bg-destructive/10'}`}>
          <p className="text-sm font-medium text-foreground m-0">
            {result.passed ? 'Viva passed' : 'Viva not passed'} — {result.reason}.
          </p>
          {!result.passed && (
            <p className="mt-2 mb-0 text-sm text-muted-foreground">
              Revisit the concepts below, then take the exam again when you are ready.
            </p>
          )}
        </div>
      )}

      <ol className="space-y-5">
        {questions.map((q, i) => {
          const answerResult = result?.answers?.[i]
          return (
            <li key={i}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 m-0">{q.concept}</p>
              <p className="text-sm font-medium text-foreground mb-2">{q.question}</p>
              <textarea
                value={explanations[i] || ''}
                onChange={(e) => setExplanations((prev) => ({ ...prev, [i]: e.target.value }))}
                disabled={!!result}
                rows={4}
                aria-label={`Your explanation for ${q.concept}`}
                placeholder="In your own words…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none disabled:opacity-70"
              />
              {answerResult && (
                <div className="mt-2 rounded-lg border border-border bg-foreground/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium m-0">
                    {answerResult.score >= 0.6
                      ? <Check className="h-4 w-4 text-primary" />
                      : <X className="h-4 w-4 text-destructive" />}
                    Understanding shown: {Math.round(answerResult.score * 100)}%
                  </p>
                  {answerResult.feedback && (
                    <p className="mt-1.5 mb-0 text-sm text-muted-foreground">{answerResult.feedback}</p>
                  )}
                  {answerResult.missing?.length > 0 && (
                    <p className="mt-1.5 mb-0 text-sm text-muted-foreground">
                      Not covered: {answerResult.missing.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {!result && (
        <Button onClick={submit} disabled={submitting} className="mt-5">
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {submitting ? 'Reading your explanations…' : 'Submit explanations'}
        </Button>
      )}
    </div>
  )
}
