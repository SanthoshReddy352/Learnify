import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sendWebPush, webPushConfigured } from '@/lib/reminders/deliver'
import { fetchSubscriptionsFor, deleteSubscriptions } from '@/lib/reminders/store'

// Send a test notification to the caller's own devices (Plan P11.1).
//
// Push has a long silent-failure chain — permission granted but service worker
// unregistered, VAPID keys mismatched, endpoint expired — and every link fails
// invisibly. This route makes the whole chain verifiable in one click from
// Settings, and it is also how P14.4 checks the feature end to end.
//
// It can only ever target the authenticated caller's own subscriptions, so it is
// not a way to notify anyone else.
//
// Named `test-push` rather than `test`: `npm test` runs `node --test`, which
// treats any file under a directory called `test` as a test file and reports the
// route as a failing suite.

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!webPushConfigured()) {
      return NextResponse.json(
        { error: 'Push is not configured on this server (VAPID keys missing)' },
        { status: 503 }
      )
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { error: 'Push notifications are not configured on this server' },
        { status: 500 }
      )
    }

    const subscriptions = (await fetchSubscriptionsFor(admin, [user.id])).get(user.id) || []
    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: 'No devices registered for push on this account' },
        { status: 404 }
      )
    }

    const digest = {
      title: 'Learnify reminders are working',
      body: 'This is what a due-review reminder will look like.',
      url: '/dashboard',
      tag: 'learnify-test'
    }

    const gone = []
    let delivered = 0
    const errors = []
    for (const subscription of subscriptions) {
      const result = await sendWebPush(subscription, digest)
      if (result.ok) delivered += 1
      else if (result.gone) gone.push(subscription.id)
      else errors.push(result.error)
    }

    // A subscription the push service has permanently dropped is pruned here
    // too, so a stale device does not keep reporting failure forever.
    await deleteSubscriptions(admin, gone)

    if (delivered === 0) {
      return NextResponse.json(
        {
          error: gone.length > 0
            ? 'Your registered device is no longer reachable — re-enable push to register it again.'
            : 'Push delivery failed',
          details: errors[0] || null
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, delivered, pruned: gone.length })
  } catch (error) {
    console.error('Push test error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
