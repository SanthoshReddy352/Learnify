'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Flag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// "This looks wrong" (Plan P6.6, human half).
//
// Lessons here are generated. The automated verification pass compares them
// against their sources, but it cannot catch a claim that is confidently wrong
// and unsourced — a reader can. This is that path, and it is placed next to the
// content rather than buried in a support page, because a report is only ever
// filed in the ten seconds after someone notices something.
//
// The tone is deliberate: the learner is reporting a machine's output, not
// accusing a person, and they should not be made to feel like they are
// complaining.

const REASONS = [
  { value: 'inaccurate', label: 'Something here is factually wrong' },
  { value: 'outdated', label: "It's out of date" },
  { value: 'confusing', label: "It's confusing or contradicts itself" },
  { value: 'incomplete', label: 'It skips something important' },
  { value: 'broken_diagram', label: "A diagram is wrong or won't render" },
  { value: 'bad_reference', label: "A link doesn't support what it's cited for" },
  { value: 'other', label: 'Something else' }
]

export default function ReportContentButton({ topicId, className = '' }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('inaccurate')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    try {
      // Whatever the reader had selected when they hit the button is usually the
      // exact passage they are objecting to — worth far more than the note.
      const selection = typeof window !== 'undefined'
        ? String(window.getSelection?.() || '').trim().slice(0, 2000)
        : ''

      const res = await fetch('/api/content-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          reason,
          note: note.trim() || undefined,
          quotedText: selection || undefined
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send that report')

      setDone(true)
      setOpen(false)
      setNote('')
      toast.success('Thanks — that report is attached to this lesson.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!topicId) return null

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={`text-muted-foreground hover:text-foreground ${className}`}
        onClick={() => setOpen(true)}
        aria-label="Report a problem with this lesson"
      >
        <Flag className="mr-2 h-4 w-4" />
        {done ? 'Reported' : 'This looks wrong'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report a problem with this lesson</DialogTitle>
            <DialogDescription>
              This lesson was generated, so mistakes are possible. Telling us what
              looks wrong is the fastest way it gets fixed. If you highlighted a
              passage before opening this, it comes along with the report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>What&apos;s the problem?</Label>
              <RadioGroup value={reason} onValueChange={setReason} className="gap-2">
                {REASONS.map((r) => (
                  <div key={r.value} className="flex items-center gap-2">
                    <RadioGroupItem value={r.value} id={`report-${r.value}`} />
                    <Label htmlFor={`report-${r.value}`} className="font-normal cursor-pointer">
                      {r.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-note">Anything you want to add? (optional)</Label>
              <Textarea
                id="report-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                placeholder="e.g. it says the time complexity is O(n), but it's O(log n)"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
