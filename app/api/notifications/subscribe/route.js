import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { pushSubscriptionRequestSchema, parseOr400 } from '@/lib/validation/schemas'

// Register / revoke a Web Push endpoint (Plan P11.1).
//
// Two-client pattern, same as the P9 grading routes: authorize with the user's
// RLS client, then write with the admin client. The admin write is not laziness —
// `push_subscriptions.endpoint` is globally unique because one browser has one
// endpoint, so when a second account signs in on a shared browser the existing
// row has to be REASSIGNED, and that row does not belong to the new user yet.
// INSERT/UPDATE are therefore service-role only in the migration.

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = parseOr400(pushSubscriptionRequestSchema, await request.json())
    if (parsed.error) {
      return NextResponse.json({ error: 'Invalid subscription', details: parsed.error }, { status: 400 })
    }
    const { endpoint, keys, platform } = parsed.data

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { error: 'Push notifications are not configured on this server' },
        { status: 500 }
      )
    }

    const { error } = await admin
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          platform,
          // Useful when a learner has several devices registered and wants to
          // tell them apart before revoking one.
          user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
          failure_count: 0
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      console.warn(`[Reminders] subscribe failed: ${error.message}`)
      return NextResponse.json(
        { error: 'Reminders are not available yet', details: error.message },
        { status: 503 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null

    // Deleted through the USER's client: the owner-delete policy is the check
    // that this endpoint is theirs to revoke. Without an endpoint, revoke all of
    // their devices ("turn push off everywhere").
    let query = supabase.from('push_subscriptions').delete().eq('user_id', user.id)
    if (endpoint) query = query.eq('endpoint', endpoint)

    const { error } = await query
    if (error) {
      console.warn(`[Reminders] unsubscribe failed: ${error.message}`)
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 503 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
