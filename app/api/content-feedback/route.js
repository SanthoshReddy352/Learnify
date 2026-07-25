import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { contentFeedbackRequestSchema, parseOr400 } from '@/lib/validation/schemas'
import { reportError } from '@/lib/observability/report'

// "This looks wrong" — the human half of P6.6 verification.
//
// The automated pass checks generated content against the sources it was given.
// This is the channel for everything that pass cannot see: a confident claim
// that is simply false, a diagram that renders but says the wrong thing, a
// citation that does not support what it is cited for.
//
// Writes go through the LEARNER'S client, so RLS decides whether they may file
// against this topic — no service role here. There is nothing to shield: a
// report contains only what the reporter already typed.

const MAX_OPEN_PER_TOPIC = 5

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parseOr400(
      contentFeedbackRequestSchema,
      await request.json().catch(() => ({}))
    )
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { topicId, reason, quotedText, note } = parsed.data

    // Confirm the topic is one this user can actually see before recording a
    // report against it — otherwise the endpoint would confirm the existence of
    // arbitrary topic ids to anyone who guessed one.
    const { data: topic } = await supabase
      .from('topics')
      .select('id')
      .eq('id', topicId)
      .maybeSingle()
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

    // One learner spamming reports on one topic adds no information. Cap the
    // open ones rather than rate-limiting by time: a second genuine report after
    // the first is fixed is welcome.
    const { count } = await supabase
      .from('content_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('topic_id', topicId)
      .eq('user_id', user.id)
      .eq('status', 'open')
    if ((count || 0) >= MAX_OPEN_PER_TOPIC) {
      return NextResponse.json({
        error: 'You already have several open reports on this lesson. Thanks — those are enough to act on.'
      }, { status: 429 })
    }

    const { error } = await supabase.from('content_feedback').insert({
      topic_id: topicId,
      user_id: user.id,
      reason,
      quoted_text: quotedText || null,
      note: note || null
    })

    // The table lands in P14. Until then, say so plainly rather than thanking
    // the learner for a report that went nowhere.
    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          error: 'Reporting is not enabled on this deployment yet.'
        }, { status: 503 })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    reportError(error, { route: 'content-feedback' })
    return NextResponse.json({ error: 'Could not record that report' }, { status: 500 })
  }
}

// The reports filed against a topic, for whoever owns the subject. RLS does the
// filtering — a learner who does not own the subject sees only their own rows.
export async function GET(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const topicId = new URL(request.url).searchParams.get('topicId')
    if (!topicId) return NextResponse.json({ error: 'topicId is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('content_feedback')
      .select('id, reason, quoted_text, note, status, created_at')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ reports: [] })
      throw error
    }
    return NextResponse.json({ reports: data || [] })
  } catch (error) {
    reportError(error, { route: 'content-feedback:get' })
    return NextResponse.json({ error: 'Could not load reports' }, { status: 500 })
  }
}
