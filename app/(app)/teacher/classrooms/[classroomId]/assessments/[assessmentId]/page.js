'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Send, Undo2, Lock, AlertTriangle, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import AssessmentBuilder, { QuestionList } from '@/components/teacher/AssessmentBuilder'
import AssessmentResults from '@/components/teacher/AssessmentResults'

// datetime-local wants 'YYYY-MM-DDTHH:mm' in LOCAL time; the API speaks UTC ISO.
const toLocalInput = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

export default function AssessmentEditorPage() {
  const params = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/teacher/assessments/${params.assessmentId}`)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not load the assessment')

      setData(body)
      setSettings({
        title: body.assessment.title,
        instructions: body.assessment.instructions || '',
        opensAt: toLocalInput(body.assessment.opens_at),
        closesAt: toLocalInput(body.assessment.closes_at),
        durationMinutes: body.assessment.duration_minutes || '',
        passScore: body.assessment.pass_score,
        maxAttempts: body.assessment.max_attempts,
        shuffleQuestions: body.assessment.shuffle_questions,
        shuffleOptions: body.assessment.shuffle_options,
        requireFullscreen: body.assessment.require_fullscreen
      })
    } catch (error) {
      toast.error(error.message)
      router.push(`/teacher/classrooms/${params.classroomId}/assessments`)
    } finally {
      setLoading(false)
    }
  }, [params.assessmentId, params.classroomId, router])

  useEffect(() => {
    load()
  }, [load])

  const saveSettings = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/teacher/assessments/${params.assessmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: settings.title,
          instructions: settings.instructions || null,
          opensAt: fromLocalInput(settings.opensAt),
          closesAt: fromLocalInput(settings.closesAt),
          durationMinutes: settings.durationMinutes ? Number(settings.durationMinutes) : null,
          passScore: Number(settings.passScore),
          maxAttempts: Number(settings.maxAttempts),
          shuffleQuestions: settings.shuffleQuestions,
          shuffleOptions: settings.shuffleOptions,
          requireFullscreen: settings.requireFullscreen
        })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not save')

      toast.success('Saved')
      await load()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const runPublishAction = async (action) => {
    setPublishing(true)
    try {
      const response = await fetch(`/api/teacher/assessments/${params.assessmentId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const body = await response.json()

      if (!response.ok) {
        // A failed publish must say exactly WHAT is wrong — every one of these
        // is a condition that would otherwise surface during the test itself.
        if (body.validation?.errors?.length) {
          body.validation.errors.forEach((message) => toast.error(message))
        } else {
          toast.error(body.error || 'Could not publish')
        }
        return
      }

      ;(body.warnings || []).forEach((message) => toast.warning(message))
      toast.success(
        action === 'publish' ? 'Published — students can see it now' :
        action === 'close' ? 'Closed' : 'Moved back to draft'
      )
      await load()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setPublishing(false)
    }
  }

  if (loading || !data || !settings) {
    return <div className="text-muted-foreground">Loading assessment…</div>
  }

  const { assessment, questions, summary, validation } = data
  const isDraft = assessment.status === 'draft'

  return (
    <div className="space-y-8">
      <div>
        <Button
          variant="ghost"
          className="mb-4 -ml-2 w-fit text-muted-foreground"
          onClick={() => router.push(`/teacher/classrooms/${params.classroomId}/assessments`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          All assessments
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">{assessment.title}</h1>
              <Badge variant="secondary" className={isDraft ? '' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}>
                {assessment.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {summary.questionCount} question{summary.questionCount === 1 ? '' : 's'} ·{' '}
              {summary.totalPoints} point{summary.totalPoints === 1 ? '' : 's'} · pass at {assessment.pass_score}%
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <Button onClick={() => runPublishAction('publish')} disabled={publishing || !validation.ok}>
                {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Publish
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => runPublishAction('unpublish')} disabled={publishing}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  Back to draft
                </Button>
                {assessment.status === 'published' && (
                  <Button variant="outline" onClick={() => runPublishAction('close')} disabled={publishing}>
                    <Lock className="mr-2 h-4 w-4" />
                    Close
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Shown continuously, not just after a failed publish: a teacher should
          be able to see what is missing while they build, not discover it at
          the moment they try to hand the test out. */}
      {isDraft && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              {validation.ok ? 'Ready to publish, with warnings' : 'Not ready to publish yet'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {validation.errors.map((message) => (
              <p key={message} className="text-orange-700 dark:text-orange-400">• {message}</p>
            ))}
            {validation.warnings.map((message) => (
              <p key={message} className="text-muted-foreground">• {message}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">The paper</CardTitle>
              <CardDescription>In the order students will see it.</CardDescription>
            </CardHeader>
            <CardContent>
              <QuestionList
                assessmentId={params.assessmentId}
                questions={questions}
                onChanged={load}
                disabled={!isDraft}
              />
            </CardContent>
          </Card>

          <AssessmentBuilder
            assessmentId={params.assessmentId}
            questions={questions}
            onChanged={load}
            disabled={!isDraft}
          />

          {!isDraft && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-4 w-4" />
                  Results
                </CardTitle>
                <CardDescription>Everyone in the class, including who has not started.</CardDescription>
              </CardHeader>
              <CardContent>
                <AssessmentResults assessmentId={params.assessmentId} />
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Settings</CardTitle>
            <CardDescription>
              These stay editable after publishing — extending a deadline mid-test is normal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-title">Title</Label>
              <Input
                id="s-title"
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="s-instructions">Instructions for students</Label>
              <textarea
                id="s-instructions"
                rows={3}
                value={settings.instructions}
                onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="s-opens">Opens</Label>
              <Input
                id="s-opens"
                type="datetime-local"
                value={settings.opensAt}
                onChange={(e) => setSettings({ ...settings, opensAt: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="s-closes">Closes</Label>
              <Input
                id="s-closes"
                type="datetime-local"
                value={settings.closesAt}
                onChange={(e) => setSettings({ ...settings, closesAt: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-duration">Time limit (min)</Label>
                <Input
                  id="s-duration"
                  type="number"
                  min={1}
                  max={600}
                  value={settings.durationMinutes}
                  onChange={(e) => setSettings({ ...settings, durationMinutes: e.target.value })}
                  placeholder="None"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-pass">Pass mark (%)</Label>
                <Input
                  id="s-pass"
                  type="number"
                  min={0}
                  max={100}
                  value={settings.passScore}
                  onChange={(e) => setSettings({ ...settings, passScore: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="s-attempts">Attempts allowed</Label>
              <Input
                id="s-attempts"
                type="number"
                min={1}
                max={10}
                value={settings.maxAttempts}
                onChange={(e) => setSettings({ ...settings, maxAttempts: e.target.value })}
              />
            </div>

            <div className="space-y-3 rounded-md border border-border p-3">
              <Toggle
                id="s-shuffle-q"
                label="Shuffle question order"
                checked={settings.shuffleQuestions}
                onChange={(v) => setSettings({ ...settings, shuffleQuestions: v })}
              />
              <Toggle
                id="s-shuffle-o"
                label="Shuffle answer options"
                hint="Also what makes copied-answer detection work — leaving it on is recommended."
                checked={settings.shuffleOptions}
                onChange={(v) => setSettings({ ...settings, shuffleOptions: v })}
              />
              <Toggle
                id="s-fullscreen"
                label="Ask students to go fullscreen"
                checked={settings.requireFullscreen}
                onChange={(v) => setSettings({ ...settings, requireFullscreen: v })}
              />
            </div>

            <Button onClick={saveSettings} disabled={saving} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Toggle({ id, label, hint, checked, onChange }) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Label htmlFor={id} className="font-normal leading-snug">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </Label>
    </div>
  )
}
