import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import {
  certificateEligibility,
  formatSerial,
  buildCertificateSnapshot,
  conceptsFromAttempt
} from '@/lib/assessment/certificate'
import { reportError } from '@/lib/observability/report'

// Certificates (Plan P9.5). GET = the learner's own; POST = issue one.
//
// Issuing is a service-role write, the same trust boundary as the attempt it is
// derived from: end users have SELECT on `certificates` and nothing else. The
// user's own client still authorizes first, so RLS decides whether they may see
// the attempt at all.

const ASSESSMENTS_ON = process.env.ASSESSMENTS === 'true'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('certificates')
      .select('id, serial, subject_id, mode, score, snapshot, issued_at, revoked_at')
      .order('issued_at', { ascending: false })
      .limit(100)

    // Pre-P14 the table does not exist; an empty list is the honest answer.
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ certificates: [] })
      throw error
    }
    return NextResponse.json({ certificates: data || [] })
  } catch (error) {
    reportError(error, { route: 'certificates:get' })
    return NextResponse.json({ error: 'Could not load certificates' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    if (!ASSESSMENTS_ON) {
      return NextResponse.json({ error: 'Certificates are not enabled yet.' }, { status: 503 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { attemptId } = await request.json().catch(() => ({}))
    if (!attemptId) return NextResponse.json({ error: 'attemptId is required' }, { status: 400 })

    // 1. Authorize through the learner's own client.
    const { data: attempt, error: attemptError } = await supabase
      .from('assessment_attempts')
      .select('id, user_id, subject_id, kind, status, score, passed, mode, viva_passed, items')
      .eq('id', attemptId)
      .maybeSingle()
    if (attemptError || !attempt) {
      return NextResponse.json({ error: 'That attempt could not be found.' }, { status: 404 })
    }
    if (attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'That is not your attempt.' }, { status: 403 })
    }

    // 2. A teacher's review can override a classroom pass (P10.4).
    const { data: review } = await supabase
      .from('attempt_reviews')
      .select('decision')
      .eq('attempt_id', attemptId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const verdict = certificateEligibility(attempt, { review })
    if (!verdict.eligible) {
      return NextResponse.json({ error: verdict.reason }, { status: 409 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({
        error: 'Issuing certificates requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }

    // 3. Already issued? Hand back the same one — the unique constraint on
    //    attempt_id means one exam can never carry two certificates.
    const { data: existing } = await admin
      .from('certificates')
      .select('id, serial, mode, score, snapshot, issued_at, revoked_at')
      .eq('attempt_id', attemptId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ success: true, certificate: existing, alreadyIssued: true })
    }

    const [{ data: profile }, { data: subject }] = await Promise.all([
      admin.from('profiles').select('display_name, full_name, username').eq('id', user.id).maybeSingle(),
      admin.from('subjects').select('title').eq('id', attempt.subject_id).maybeSingle()
    ])

    const snapshot = buildCertificateSnapshot({
      learnerName: profile?.display_name || profile?.full_name || profile?.username || 'Learner',
      subjectTitle: subject?.title || 'Subject',
      score: attempt.score,
      mode: verdict.mode,
      concepts: conceptsFromAttempt(attempt),
      vivaPassed: attempt.viva_passed === true
    })

    // Retry on the astronomically unlikely serial collision rather than handing
    // the learner an error they cannot act on.
    let inserted = null
    let lastError = null
    for (let i = 0; i < 5 && !inserted; i += 1) {
      const serial = formatSerial(randomBytes(16))
      const { data, error } = await admin
        .from('certificates')
        .insert({
          serial,
          user_id: user.id,
          subject_id: attempt.subject_id,
          attempt_id: attempt.id,
          mode: verdict.mode,
          score: attempt.score,
          snapshot
        })
        .select('id, serial, mode, score, snapshot, issued_at, revoked_at')
        .single()
      if (!error) { inserted = data; break }
      lastError = error
      // A duplicate on attempt_id means a concurrent request won the race.
      if (error.code === '23505' && !String(error.message).includes('serial')) {
        const { data: raced } = await admin
          .from('certificates')
          .select('id, serial, mode, score, snapshot, issued_at, revoked_at')
          .eq('attempt_id', attemptId)
          .maybeSingle()
        if (raced) return NextResponse.json({ success: true, certificate: raced, alreadyIssued: true })
      }
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Certificates are not enabled on this deployment yet.' }, { status: 503 })
      }
    }
    if (!inserted) throw lastError || new Error('Could not issue a certificate')

    return NextResponse.json({ success: true, certificate: inserted })
  } catch (error) {
    reportError(error, { route: 'certificates:issue' })
    return NextResponse.json({ error: 'Could not issue a certificate' }, { status: 500 })
  }
}
