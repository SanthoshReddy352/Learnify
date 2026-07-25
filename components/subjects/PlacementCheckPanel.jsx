'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, ClipboardCheck, Check, X, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { gradeDiagnostic, suggestSkippableTopics } from '@/lib/ai/pipelines/diagnostic-prompt'

// Diagnostic placement check (Plan P8.4): a short pre-test so a learner can skip
// what they already know and so their concept memory (P8.1) is seeded on day one
// instead of after weeks of reviews.
//
// Grading happens here, in the browser, and the result is posted to
// /api/diagnostic/seed. That is deliberate: the check gates nothing, so a learner
// who cheats it only misleads their own lesson depth. Graded assessments (P9)
// will be server-graded instead.
export default function PlacementCheckPanel({ subjectId, className = '' }) {
  const [questions, setQuestions] = useState(null)
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/generate-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to build a placement check')
      setQuestions(data.questions)
      setAnswers(new Array(data.questions.length).fill(null))
      setResult(null)
    } catch (e) {
      toast.error('Could not build a placement check: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const choose = (qi, oi) =>
    setAnswers((prev) => {
      const next = prev.slice()
      next[qi] = oi
      return next
    })

  const submit = async () => {
    const graded = gradeDiagnostic(questions, answers)
    if (graded.answeredCount === 0) {
      toast.error('Answer at least one question first.')
      return
    }
    setResult({ ...graded, skippable: suggestSkippableTopics(graded.graded) })

    try {
      const res = await fetch('/api/diagnostic/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId,
          answers: graded.graded.map((g) => ({ concept: g.concept, correct: g.correct }))
        })
      })
      const data = await res.json()
      if (res.ok && data.persisted) {
        toast.success('Saved — your lessons and review order will adapt to this.')
      }
    } catch {
      // The learner still sees their result; remembering it is best-effort.
    }
  }

  const reset = () => {
    setQuestions(null)
    setAnswers([])
    setResult(null)
  }

  if (!questions) {
    return (
      <div className={`rounded-xl border border-border border-dashed bg-foreground/5 p-8 flex flex-col items-center text-center ${className}`}>
        <ClipboardCheck className="h-9 w-9 mb-3 text-primary/70" />
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          Already know some of this? Take a short placement check so lessons skip
          what you have and slow down where you are shaky.
        </p>
        <Button onClick={generate} disabled={loading} variant="outline" className="border-primary/30 hover:bg-primary/10 text-primary">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? 'Building your check…' : 'Take a placement check'}
        </Button>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground m-0">Placement check</h3>
        </div>
        <Button onClick={reset} variant="ghost" size="sm" className="text-muted-foreground">
          <RotateCcw className="mr-2 h-4 w-4" />
          Start over
        </Button>
      </div>

      <ol className="space-y-5">
        {questions.map((q, qi) => (
          <li key={qi}>
            <p className="text-sm font-medium text-foreground mb-2">{qi + 1}. {q.question}</p>
            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                const selected = answers[qi] === oi
                const revealed = !!result
                const isCorrect = oi === q.correct_index
                const tone = revealed && isCorrect
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : revealed && selected
                    ? 'border-destructive/50 bg-destructive/10 text-foreground'
                    : selected
                      ? 'border-primary/50 bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-foreground/5'
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={revealed}
                    onClick={() => choose(qi, oi)}
                    aria-pressed={selected}
                    className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${tone}`}
                  >
                    {revealed && isCorrect && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
                    {revealed && selected && !isCorrect && <X className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />}
                    <span>{opt}</span>
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ol>

      {!result ? (
        <Button onClick={submit} className="mt-5 w-full sm:w-auto">
          See where you stand
        </Button>
      ) : (
        <div className="mt-5 rounded-lg border border-border bg-foreground/5 p-4">
          <p className="text-sm text-foreground m-0">
            You got <strong>{result.correctCount}</strong> of <strong>{result.answeredCount}</strong> right ({result.score}%).
          </p>
          {result.skippable.length > 0 ? (
            <p className="text-sm text-muted-foreground mt-2 mb-0">
              You look solid on <strong>{result.skippable.map((s) => s.topicTitle).join(', ')}</strong> — you can
              likely move through {result.skippable.length === 1 ? 'it' : 'those'} quickly. Nothing was marked
              complete for you; a few questions is a hint, not proof.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-2 mb-0">
              Start from the beginning of the graph — your lessons will go deeper on the concepts you missed.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
