'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Timer, Maximize, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

// Hardened exam taking UI (Plan P10.3).
//
// One question at a time, no going back, a per-question timer, and an optional
// fullscreen request. Focus loss / tab hiding / fullscreen exit are recorded and
// sent with the submission as ADVISORY events.
//
// Deliberate honesty about the limits: none of this stops a determined cheater —
// a second device defeats all of it, and the event log can be suppressed. It
// raises the effort for casual copying and gives a teacher context (P10.4). The
// signals that actually carry weight are the per-attempt randomization (P10.1)
// and, for self-paced learners, the oral viva (P10.5). So nothing here blocks
// submission or alters a score.
const SECONDS_PER_QUESTION = 90

const CONFIDENCE_CHOICES = [
  { value: 'guess', label: 'Guess' },
  { value: 'unsure', label: 'Unsure' },
  { value: 'sure', label: 'Sure' }
]

export default function ExamRunner({ attempt, onSubmitted }) {
  const items = attempt?.items || []
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState(null)
  const [confidence, setConfidence] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION)
  const [submitting, setSubmitting] = useState(false)

  // Refs, not state: these accumulate across questions and must not trigger
  // re-renders (a re-render mid-timer would reset the countdown).
  const responsesRef = useRef([])
  const eventsRef = useRef([])
  const questionStartRef = useRef(Date.now())
  const startedAtRef = useRef(Date.now())
  const submittedRef = useRef(false)

  const current = items[index] || null
  const isLast = index >= items.length - 1

  const recordEvent = useCallback((kind) => {
    if (submittedRef.current) return
    eventsRef.current.push({ kind, at: Date.now() - startedAtRef.current })
  }, [])

  const submitExam = useCallback(async (allResponses) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      const res = await fetch('/api/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: attempt.attemptId,
          responses: allResponses,
          integrityEvents: eventsRef.current
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not submit the exam')
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      onSubmitted?.(data)
    } catch (e) {
      submittedRef.current = false
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }, [attempt?.attemptId, onSubmitted])

  // Commit the current question and move on. Unanswered is recorded as a null
  // choice, which the server grades as wrong — stated up front in the UI.
  const commitAndAdvance = useCallback(() => {
    if (!current || submittedRef.current) return

    responsesRef.current.push({
      itemId: current.itemId,
      chosenIndex: chosen,
      confidence: confidence || 'unsure',
      ms: Date.now() - questionStartRef.current
    })

    if (isLast) {
      submitExam(responsesRef.current)
      return
    }

    setIndex((i) => i + 1)
    setChosen(null)
    setConfidence(null)
    setSecondsLeft(SECONDS_PER_QUESTION)
    questionStartRef.current = Date.now()
  }, [chosen, confidence, current, isLast, submitExam])

  // Per-question countdown. Time-out auto-advances — the timer is part of the
  // exam, so it cannot be waited out.
  useEffect(() => {
    if (submitting || !current) return
    if (secondsLeft <= 0) {
      commitAndAdvance()
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft, submitting, current, commitAndAdvance])

  // Session-integrity listeners (advisory).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') recordEvent('hidden')
    }
    const onBlur = () => recordEvent('blur')
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) recordEvent('fullscreen_exit')
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [recordEvent])

  // Warn on navigating away mid-exam. The attempt stays open server-side, so
  // nothing is lost — but it also cannot be restarted, so say so.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (submittedRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {
      toast.message('Fullscreen was blocked by the browser — that is fine, the exam still works.')
    })
  }

  if (!current) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground m-0">Grading your exam…</p>
      </div>
    )
  }

  const lowTime = secondsLeft <= 15

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <span className="text-xs text-muted-foreground">
          Question {index + 1} of {items.length}
        </span>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-xs ${lowTime ? 'text-destructive' : 'text-muted-foreground'}`}
            aria-live={lowTime ? 'polite' : 'off'}
          >
            <Timer className="h-3.5 w-3.5" />
            {secondsLeft}s
          </span>
          <Button onClick={goFullscreen} variant="ghost" size="sm" className="text-muted-foreground">
            <Maximize className="mr-1.5 h-3.5 w-3.5" />
            Fullscreen
          </Button>
        </div>
      </div>

      {/* Progress bar doubles as the "no going back" cue. */}
      <div className="h-1 w-full rounded-full bg-foreground/10 mb-5" role="presentation">
        <div
          className="h-1 rounded-full bg-primary transition-all"
          style={{ width: `${Math.round(((index + 1) / items.length) * 100)}%` }}
        />
      </div>

      <p className="text-sm font-medium text-foreground mb-4">{current.stem}</p>

      <div className="space-y-1.5 mb-4">
        {(current.options || []).map((opt, oi) => {
          const selected = chosen === oi
          return (
            <button
              key={oi}
              type="button"
              onClick={() => setChosen(oi)}
              aria-pressed={selected}
              className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                selected
                  ? 'border-primary/50 bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-foreground/5'
              }`}
            >
              <span>{opt}</span>
            </button>
          )
        })}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">How sure?</span>
        {CONFIDENCE_CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setConfidence(c.value)}
            aria-pressed={confidence === c.value}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              confidence === c.value
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-foreground/5'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground m-0">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          You cannot return to a question once you move on, and unanswered questions are marked wrong.
        </p>
        <Button onClick={commitAndAdvance} disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isLast ? 'Finish and submit' : 'Next question'}
        </Button>
      </div>
    </div>
  )
}
