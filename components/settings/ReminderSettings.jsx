'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import { Bell, BellOff, Save, Send } from 'lucide-react'
import { usePushSubscription } from '@/lib/reminders/usePushSubscription'

// Reminder + weekly-goal preferences (Plan P11).
//
// Design intent: reminders are opt-out-able at every level and the panel says
// plainly what will and will not happen. If the deployment cannot deliver a
// channel (no VAPID keys, no mail sender) the corresponding switch is disabled
// with the reason shown, instead of letting someone turn on a channel that will
// silently never fire.

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  })
}))

export default function ReminderSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [capabilities, setCapabilities] = useState({
    remindersEnabled: false,
    pushAvailable: false,
    emailAvailable: false,
    vapidPublicKey: null
  })
  const [prefs, setPrefs] = useState(null)
  const [initial, setInitial] = useState(null)

  const push = usePushSubscription(capabilities.vapidPublicKey)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/preferences')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load')
      setCapabilities(data.capabilities || {})
      // Trust the browser for the timezone on first load: it is right far more
      // often than a stored default, and a wrong zone means reminders arrive at
      // the wrong hour, which is the one thing this feature must get right.
      const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const loaded = {
        ...data.preferences,
        timezone: data.saved ? data.preferences.timezone : (browserZone || data.preferences.timezone)
      }
      setPrefs(loaded)
      setInitial(loaded)
    } catch (error) {
      console.error('Failed to load reminder preferences:', error)
      toast.error('Could not load reminder settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const dirty = prefs && initial && JSON.stringify(prefs) !== JSON.stringify(initial)

  const update = (patch) => setPrefs((p) => ({ ...p, ...patch }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save')
      setInitial(prefs)
      toast.success('Reminder settings saved')
    } catch (error) {
      toast.error(error.message || 'Could not save reminder settings')
    } finally {
      setSaving(false)
    }
  }

  // Persist one field immediately (rather than staging it for the Save button),
  // for changes that have already taken effect elsewhere — enabling push
  // registers the device server-side the moment the browser grants permission,
  // so leaving the matching preference unsaved would be inconsistent.
  const persist = async (patch) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      if (response.ok) setInitial((i) => ({ ...i, ...patch }))
    } catch {
      // Best-effort: the device is registered either way, and Save will retry.
    }
  }

  // The device switch governs THIS browser only. Turning it off here must not
  // silence a learner's other devices, so it unsubscribes locally without
  // touching the account-wide channel flag; turning it on re-allows the channel
  // in case it had been switched off before.
  const handleTogglePush = async (enabled) => {
    if (enabled) {
      const result = await push.enable()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      await persist({ pushEnabled: true })
      toast.success('This device will receive reminders')
    } else {
      await push.disable()
      toast.success('This device will no longer receive reminders')
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const response = await fetch('/api/notifications/test-push', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Test failed')
      toast.success('Test notification sent')
    } catch (error) {
      toast.error(error.message || 'Test notification failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading || !prefs) {
    return (
      <Card className="border-border bg-foreground/5 backdrop-blur-sm">
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading reminder settings...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border bg-foreground/5 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <CardTitle>Review reminders</CardTitle>
        </div>
        <CardDescription>
          Spaced repetition only works if you come back on the day a review comes due. Learnify can
          send you one reminder a day — at a time you choose, in your own timezone — and never more
          than that. If nothing is due, nothing is sent.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!capabilities.remindersEnabled && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Reminders are not switched on for this deployment yet. You can set your preferences now —
            they will apply as soon as it is enabled.
          </p>
        )}

        {/* Master switch */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="review-reminders" className="text-sm font-medium">
              Remind me about due reviews
            </Label>
            <p className="text-xs text-muted-foreground">
              Turn this off to stop all review reminders, on every device.
            </p>
          </div>
          <Switch
            id="review-reminders"
            checked={prefs.reviewReminders}
            onCheckedChange={(v) => update({ reviewReminders: v })}
          />
        </div>

        {/* Time of day */}
        <div className="space-y-2">
          <Label htmlFor="reminder-hour" className="text-sm font-medium">
            Time of day
          </Label>
          <Select
            value={String(prefs.reminderHour)}
            onValueChange={(v) => update({ reminderHour: Number(v) })}
            disabled={!prefs.reviewReminders}
          >
            <SelectTrigger id="reminder-hour" className="bg-foreground/5 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Your timezone: <span className="font-mono">{prefs.timezone}</span>
          </p>
        </div>

        {/* Push channel */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="push-enabled" className="text-sm font-medium">
                Notifications on this device
              </Label>
              <p className="text-xs text-muted-foreground">
                {!push.supported
                  ? 'This browser cannot receive push notifications. Reminders will still show on the dashboard.'
                  : !capabilities.pushAvailable
                    ? 'Push is not configured on this server yet.'
                    : push.subscribed
                      ? 'This device is registered. Turning this off affects only this browser.'
                      : 'Your browser will ask for permission.'}
              </p>
            </div>
            <Switch
              id="push-enabled"
              checked={push.subscribed}
              disabled={!push.supported || !capabilities.pushAvailable || push.busy || !push.ready}
              onCheckedChange={handleTogglePush}
            />
          </div>

          {push.permission === 'denied' && (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Notifications are blocked for this site in your browser. You will need to re-allow them
              in the browser&apos;s site settings before this switch can be turned on.
            </p>
          )}

          {push.subscribed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="mt-1"
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              {testing ? 'Sending...' : 'Send a test notification'}
            </Button>
          )}
        </div>

        {/* Email channel */}
        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
          <div className="space-y-1">
            <Label htmlFor="email-enabled" className="text-sm font-medium">
              Email digest
            </Label>
            <p className="text-xs text-muted-foreground">
              {capabilities.emailAvailable
                ? 'A plain-text list of what is due, to your account email.'
                : 'Email reminders are not available on this deployment.'}
            </p>
          </div>
          <Switch
            id="email-enabled"
            checked={prefs.emailEnabled}
            disabled={!capabilities.emailAvailable}
            onCheckedChange={(v) => update({ emailEnabled: v })}
          />
        </div>

        {/* Weekly goal (P11.2) */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="weekly-goal" className="text-sm font-medium">
              Weekly review goal
            </Label>
            <span className="text-sm font-semibold text-foreground">
              {prefs.weeklyReviewGoal} reviews
            </span>
          </div>
          <Slider
            id="weekly-goal"
            min={1}
            max={60}
            step={1}
            value={[prefs.weeklyReviewGoal]}
            onValueChange={([v]) => update({ weeklyReviewGoal: v })}
          />
          <p className="text-xs text-muted-foreground">
            Shown on your dashboard as a target for the week. Nothing is withheld if you miss it.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving || !dirty} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save reminder settings'}
        </Button>
      </CardContent>
    </Card>
  )
}
