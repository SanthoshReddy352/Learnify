'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Brain, Loader2, Check, X, AlertTriangle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

// In-lesson retrieval practice with confidence calibration (Plan P9.2).
//
// Retrieval beats re-reading, so this sits inside the lesson rather than being a
// separate quiz page. The confidence question comes BEFORE the reveal on purpose:
// "sure and wrong" is the highest-value resurfacing signal there is, and it can
// only be captured before the learner sees the answer.
const CONFIDENCE_CHOICES = [
  { value: 'guess', label: 'Guessing' },
  { value: 'unsure', label: 'Not sure' },
  { value: 'sure', label: 'Confident' }
]

export default function RetrievalPractice({ topicId, subjectId, className = '' }) {
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState(null)
  const [confidence, setConfidence] = useState(null)
  const [outcome, setOutcome] = useState(null)

  const current = items?.[index] || null

  const loadItems = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/practice/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId, limit: 3 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load practice questions')
      setItems(data.items || [])
      setIndex(0)
      resetQuestion()
      return data.items || []
    } catch (e) {
      toast.error(e.message)
      return []
    } finally {
      setLoading(false)
    }
  }

  const buildItems = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/generate-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, topicId, itemCount: 5 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not build practice questions')
      if (!data.stored) {
        toast.message('Questions were generated but not saved yet — practice storage is not enabled.')
        return
      }
      await loadItems()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const resetQuestion = () => {
    setChosen(null)
    setConfidence(null)
    setOutcome(null)
  }

  const submit = async () => {
    if (!current) return
    if (current.kind !== 'why' && chosen === null) {
      toast.error('Pick an answer first.')
      return
    }
    if (!confidence) {
      toast.error('How sure are you? That part matters as much as the answer.')
      return
    }

    try {
      const res = await fetch('/api/practice/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: current.itemId, chosenIndex: chosen, confidence })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not check that answer')
      setOutcome(data)
    } catch (e) {
      toast.error(e.message)
    }
  }

  const next = () => {
    resetQuestion()
    setIndex((i) => i + 1)
  }

  // Nothing loaded yet.
  if (!items) {
    return (
      <div className={`rounded-xl border border-border border-dashed bg-foreground/5 p-8 flex flex-col items-center text-center ${className}`}>
        <Brain className="h-9 w-9 mb-3 text-primary/70" />
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          Testing yourself beats re-reading. Try a couple of questions on what you just read.
        </p>
        <Button onClick={loadItems} disabled={loading} variant="outline" className="border-primary/30 hover:bg-primary/10 text-primary">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
          {loading ? 'Loading questions…' : 'Quiz me on this'}
        </Button>
      </div>
    )
  }

  // Loaded, but the bank has nothing for this topic yet.
  if (items.length === 0) {
    return (
      <div className={`rounded-xl border border-border border-dashed bg-foreground/5 p-8 flex flex-col items-center text-center ${className}`}>
        <Brain className="h-9 w-9 mb-3 text-primary/70" />
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          No practice questions for this topic yet — they are written from the concepts this lesson taught.
        </p>
        <Button onClick={buildItems} disabled={generating} variant="outline" className="border-primary/30 hover:bg-primary/10 text-primary">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {generating ? 'Writing questions…' : 'Create practice questions'}
        </Button>
      </div>
    )
  }

  // Finished the set.
  if (!current) {
    return (
      <div className={`rounded-xl border border-border bg-card p-6 text-center ${className}`}>
        <Check className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-sm text-muted-foreground mb-4 m-0">
          That is the set. Anything you missed will come back in your reviews.
        </p>
        <Button onClick={loadItems} variant="outline" size="sm">Practice again</Button>
      </div>
    )
  }

  const isOpen = current.kind === 'why'

  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground m-0">Check yourself</h3>
        </div>
        <span className="text-xs text-muted-foreground">{index + 1} of {items.length}</span>
      </div>

      <p className="text-sm font-medium text-foreground mb-4">{current.stem}</p>

      {isOpen ? (
        <p className="text-xs text-muted-foreground mb-4">
          Answer this one in your head (or out loud — explaining it is the point), then reveal the model answer.
        </p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {(current.options || []).map((opt, oi) => {
            const selected = chosen === oi
            const revealed = !!outcome
            const isCorrect = revealed && oi === outcome.correctIndex
            const tone = isCorrect
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
                onClick={() => setChosen(oi)}
                aria-pressed={selected}
                className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${tone}`}
              >
                {isCorrect && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
                {revealed && selected && !isCorrect && <X className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />}
                <span>{opt}</span>
              </button>
            )
          })}
        </div>
      )}

      {!outcome && (
        <>
          <p className="text-xs text-muted-foreground mb-2">How sure are you?</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {CONFIDENCE_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setConfidence(c.value)}
                aria-pressed={confidence === c.value}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  confidence === c.value
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-foreground/5'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <Button onClick={submit} size="sm">{isOpen ? 'Reveal the model answer' : 'Check my answer'}</Button>
        </>
      )}

      {outcome && (
        <div className="rounded-lg border border-border bg-foreground/5 p-4">
          {outcome.graded && (
            <p className={`text-sm font-medium m-0 ${outcome.correct ? 'text-primary' : 'text-destructive'}`}>
              {outcome.correct ? 'Correct.' : 'Not quite.'}
            </p>
          )}
          {outcome.calibration === 'overconfident' && (
            <p className="mt-2 mb-0 flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              You were confident on this one — that gap is worth a closer look, so it will come back sooner.
            </p>
          )}
          {outcome.calibration === 'lucky' && (
            <p className="mt-2 mb-0 text-sm text-muted-foreground">
              Right, but you were guessing — this one will come back rather than counting as known.
            </p>
          )}
          {outcome.modelAnswer && (
            <p className="mt-2 mb-0 text-sm text-muted-foreground"><strong>Model answer:</strong> {outcome.modelAnswer}</p>
          )}
          {outcome.explanation && (
            <p className="mt-2 mb-0 text-sm text-muted-foreground">{outcome.explanation}</p>
          )}
          <Button onClick={next} size="sm" variant="outline" className="mt-4">
            {index + 1 < items.length ? 'Next question' : 'Finish'}
          </Button>
        </div>
      )}
    </div>
  )
}
