import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notificationPreferencesRequestSchema, parseOr400 } from '@/lib/validation/schemas'
import { fetchPreferences, savePreferences, remindersEnabled } from '@/lib/reminders/store'
import { webPushConfigured, emailConfigured } from '@/lib/reminders/deliver'

// Reminder + goal preferences (Plan P11).
//
// Reads degrade to defaults when the P14 table is missing, so the settings panel
// renders sensible values before reminders are provisioned. The response also
// reports what the SERVER can actually deliver, so the UI can tell the learner
// "email reminders are not available on this deployment" instead of letting them
// enable a channel that will never fire.

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prefs = await fetchPreferences(supabase, user.id)

    return NextResponse.json({
      preferences: {
        reviewReminders: prefs.review_reminders,
        pushEnabled: prefs.push_enabled,
        emailEnabled: prefs.email_enabled,
        reminderHour: prefs.reminder_hour,
        timezone: prefs.timezone,
        weeklyReviewGoal: prefs.weekly_review_goal
      },
      capabilities: {
        remindersEnabled: remindersEnabled(),
        pushAvailable: webPushConfigured(),
        emailAvailable: emailConfigured(),
        vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null
      },
      saved: prefs.exists
    })
  } catch (error) {
    console.error('Notification preferences GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = parseOr400(notificationPreferencesRequestSchema, await request.json())
    if (parsed.error) {
      return NextResponse.json({ error: 'Invalid preferences', details: parsed.error }, { status: 400 })
    }
    const body = parsed.data

    const patch = {}
    const map = {
      reviewReminders: 'review_reminders',
      pushEnabled: 'push_enabled',
      emailEnabled: 'email_enabled',
      reminderHour: 'reminder_hour',
      timezone: 'timezone',
      weeklyReviewGoal: 'weekly_review_goal'
    }
    for (const [key, column] of Object.entries(map)) {
      if (body[key] !== undefined) patch[column] = body[key]
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const result = await savePreferences(supabase, user.id, patch)
    if (!result.ok) {
      // The table does not exist until P14; say so plainly rather than
      // reporting success on a write that went nowhere.
      return NextResponse.json(
        { error: 'Reminder preferences are not available yet', details: result.error },
        { status: 503 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notification preferences POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
