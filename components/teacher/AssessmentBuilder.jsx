'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Sparkles, Trash2, Library, PencilLine, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

/**
 * The three ways a teacher fills a paper.
 *
 * They are presented as tabs rather than three separate screens because they
 * are alternatives for the same task, and in practice a real paper mixes them —
 * a few generated questions, a couple picked from previous units, one written
 * by hand for the thing the teacher actually cares about.
 *
 * All three post to the same endpoint and produce the same row shape, so
 * nothing downstream can tell them apart.
 */
export default function AssessmentBuilder({ assessmentId, questions, onChanged, disabled }) {
  const [tab, setTab] = useState('generate')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Add questions</CardTitle>
        <CardDescription>
          Generate a draft, reuse questions you already have, or write your own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === 'generate'} onClick={() => setTab('generate')} icon={Sparkles}>
            Generate
          </TabButton>
          <TabButton active={tab === 'bank'} onClick={() => setTab('bank')} icon={Library}>
            From question bank
          </TabButton>
          <TabButton active={tab === 'manual'} onClick={() => setTab('manual')} icon={PencilLine}>
            Write my own
          </TabButton>
          <TabButton active={tab === 'blueprint'} onClick={() => setTab('blueprint')} icon={Shuffle}>
            Random draw
          </TabButton>
        </div>

        {disabled && (
          <p className="rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-700 dark:text-orange-400">
            This assessment is published, so its questions are locked. Move it back to draft to edit.
          </p>
        )}

        <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
          {tab === 'generate' && <GenerateTab assessmentId={assessmentId} onChanged={onChanged} />}
          {tab === 'bank' && (
            <BankTab assessmentId={assessmentId} questions={questions} onChanged={onChanged} />
          )}
          {tab === 'manual' && <ManualTab assessmentId={assessmentId} onChanged={onChanged} />}
          {tab === 'blueprint' && <BlueprintTab assessmentId={assessmentId} onChanged={onChanged} />}
        </fieldset>
      </CardContent>
    </Card>
  )
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

// --- Generate ---------------------------------------------------------------

function GenerateTab({ assessmentId, onChanged }) {
  const [count, setCount] = useState(8)
  const [difficulty, setDifficulty] = useState(3)
  const [busy, setBusy] = useState(false)

  const run = async (attach) => {
    setBusy(true)
    try {
      const data = await post(`/api/teacher/assessments/${assessmentId}/generate`, {
        itemCount: Number(count),
        difficulty: Number(difficulty),
        attach
      })
      toast.success(
        attach
          ? `Added ${data.attached} question(s) to the paper`
          : `Generated ${data.created} question(s) into the bank — review them under "From question bank"`
      )
      onChanged()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gen-count">How many</Label>
          <Input
            id="gen-count"
            type="number"
            min={3}
            max={24}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gen-difficulty">Difficulty (1–5)</Label>
          <Input
            id="gen-difficulty"
            type="number"
            min={1}
            max={5}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Questions are written from the lesson content your students actually saw, so they can only
        test material the course taught.
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Review-first is the default: unreviewed AI questions should not end
            up on a graded paper without a teacher having read them. */}
        <Button onClick={() => run(false)} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Generate for review
        </Button>
        <Button variant="outline" onClick={() => run(true)} disabled={busy}>
          Generate and add straight to the paper
        </Button>
      </div>
    </div>
  )
}

// --- Bank picker ------------------------------------------------------------

function BankTab({ assessmentId, questions, onChanged }) {
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)

  const alreadyOnPaper = new Set(questions.filter((q) => q.item_id).map((q) => q.item_id))

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/teacher/assessments/${assessmentId}/questions`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load the question bank')
      setItems(data.items || [])
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const add = async () => {
    setSaving(true)
    try {
      await post(`/api/teacher/assessments/${assessmentId}/questions`, {
        questions: [...selected].map((itemId) => ({ source: 'item', itemId, points: 1 }))
      })
      toast.success(`Added ${selected.size} question(s)`)
      setSelected(new Set())
      onChanged()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (items === null) {
    return (
      <Button variant="outline" onClick={load} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Library className="mr-2 h-4 w-4" />}
        Browse the question bank
      </Button>
    )
  }

  const available = items.filter((item) => item.kind === 'mcq' || item.kind === 'worked_example')

  return (
    <div className="space-y-4">
      {available.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The bank is empty for this course. Generate some questions first.
        </p>
      ) : (
        <>
          <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border border-border p-2">
            {available.map((item) => {
              const onPaper = alreadyOnPaper.has(item.id)
              return (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm transition-colors hover:bg-muted/50 ${
                    onPaper ? 'opacity-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={onPaper}
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block">{item.stem}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-normal">
                        {item.concept}
                      </Badge>
                      <span>Difficulty {item.difficulty}</span>
                      {onPaper && <span className="text-primary">Already on this paper</span>}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>

          <Button onClick={add} disabled={selected.size === 0 || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add {selected.size || ''} selected
          </Button>
        </>
      )}
    </div>
  )
}

// --- Manual -----------------------------------------------------------------

function ManualTab({ assessmentId, onChanged }) {
  const empty = { concept: '', stem: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', difficulty: 3 }
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  const setOption = (index, value) => {
    setForm((prev) => {
      const options = [...prev.options]
      options[index] = value
      return { ...prev, options }
    })
  }

  const save = async () => {
    const options = form.options.map((o) => o.trim()).filter(Boolean)
    if (!form.concept.trim()) return toast.error('Which concept does this test?')
    if (!form.stem.trim()) return toast.error('Write the question')
    if (options.length < 2) return toast.error('Give at least two answer options')
    if (form.correctIndex >= options.length) return toast.error('Mark which option is correct')

    setSaving(true)
    try {
      await post(`/api/teacher/assessments/${assessmentId}/questions`, {
        manual: {
          concept: form.concept.trim(),
          stem: form.stem.trim(),
          options,
          correctIndex: Number(form.correctIndex),
          explanation: form.explanation.trim(),
          difficulty: Number(form.difficulty)
        }
      })
      toast.success('Question added')
      setForm(empty)
      onChanged()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <Label htmlFor="m-concept">Concept</Label>
          <Input
            id="m-concept"
            value={form.concept}
            onChange={(e) => setForm({ ...form, concept: e.target.value })}
            placeholder="TCP three-way handshake"
          />
          <p className="text-xs text-muted-foreground">
            Groups this question with the rest of that concept in your class analytics.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-difficulty">Difficulty (1–5)</Label>
          <Input
            id="m-difficulty"
            type="number"
            min={1}
            max={5}
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="m-stem">Question</Label>
        <textarea
          id="m-stem"
          rows={3}
          value={form.stem}
          onChange={(e) => setForm({ ...form, stem: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Which flag is set on the second packet of a TCP handshake?"
        />
      </div>

      <div className="space-y-2">
        <Label>Options — select the correct one</Label>
        {form.options.map((option, index) => (
          <div key={index} className="flex items-center gap-3">
            <input
              type="radio"
              name="correct"
              checked={Number(form.correctIndex) === index}
              onChange={() => setForm({ ...form, correctIndex: index })}
              aria-label={`Mark option ${index + 1} correct`}
            />
            <Input
              value={option}
              onChange={(e) => setOption(index, e.target.value)}
              placeholder={`Option ${index + 1}`}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="m-explanation">Explanation (shown after answering)</Label>
        <textarea
          id="m-explanation"
          rows={2}
          value={form.explanation}
          onChange={(e) => setForm({ ...form, explanation: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Add question
      </Button>
    </div>
  )
}

// --- Blueprint --------------------------------------------------------------

function BlueprintTab({ assessmentId, onChanged }) {
  const [form, setForm] = useState({ conceptKey: '', drawCount: 3, difficultyMin: 2, difficultyMax: 4 })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.conceptKey.trim()) return toast.error('Which concept should it draw from?')

    setSaving(true)
    try {
      await post(`/api/teacher/assessments/${assessmentId}/questions`, {
        questions: [{
          source: 'blueprint',
          conceptKey: form.conceptKey.trim().toLowerCase().replace(/\s+/g, '-'),
          drawCount: Number(form.drawCount),
          difficultyMin: Number(form.difficultyMin),
          difficultyMax: Number(form.difficultyMax),
          points: 1
        }]
      })
      toast.success('Draw rule added')
      onChanged()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A draw rule picks questions per student when they start, instead of fixing them now. Every
        student gets a different paper on the same concepts — which makes answers much harder to
        share, and lets a re-sit be a genuinely new test.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="b-concept">Concept</Label>
          <Input
            id="b-concept"
            value={form.conceptKey}
            onChange={(e) => setForm({ ...form, conceptKey: e.target.value })}
            placeholder="tcp-handshake"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-count">How many questions</Label>
          <Input
            id="b-count"
            type="number"
            min={1}
            max={20}
            value={form.drawCount}
            onChange={(e) => setForm({ ...form, drawCount: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-min">Easiest allowed</Label>
          <Input
            id="b-min"
            type="number"
            min={1}
            max={5}
            value={form.difficultyMin}
            onChange={(e) => setForm({ ...form, difficultyMin: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-max">Hardest allowed</Label>
          <Input
            id="b-max"
            type="number"
            min={1}
            max={5}
            value={form.difficultyMax}
            onChange={(e) => setForm({ ...form, difficultyMax: e.target.value })}
          />
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Add draw rule
      </Button>
    </div>
  )
}

/** The paper as it stands, in the order students will see it. */
export function QuestionList({ assessmentId, questions, onChanged, disabled }) {
  const [removing, setRemoving] = useState(null)

  const remove = async (questionId) => {
    setRemoving(questionId)
    try {
      const response = await fetch(
        `/api/teacher/assessments/${assessmentId}/questions?questionId=${questionId}`,
        { method: 'DELETE' }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not remove that question')
      onChanged()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setRemoving(null)
    }
  }

  if (questions.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No questions yet.
      </p>
    )
  }

  return (
    <ol className="space-y-2">
      {questions.map((question, index) => (
        <li
          key={question.id}
          className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5 text-sm"
        >
          <span className="mt-0.5 w-6 shrink-0 text-muted-foreground">{index + 1}.</span>
          <div className="min-w-0 flex-1">
            {question.source === 'item' ? (
              <>
                <p className="break-words">{question.item?.stem || 'Question removed from the bank'}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="font-normal">
                    {question.item?.concept || 'unknown'}
                  </Badge>
                  <span>Difficulty {question.item?.difficulty ?? '—'}</span>
                  <span>{question.points} pt</span>
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2">
                  <Shuffle className="h-3.5 w-3.5 text-primary" />
                  <span>
                    {question.draw_count} random question(s) on{' '}
                    <span className="font-medium">{question.concept_key}</span>
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Difficulty {question.difficulty_min}–{question.difficulty_max} · {question.points} pt each ·
                  drawn per student
                </p>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || removing === question.id}
            onClick={() => remove(question.id)}
            aria-label="Remove question"
          >
            {removing === question.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </li>
      ))}
    </ol>
  )
}
