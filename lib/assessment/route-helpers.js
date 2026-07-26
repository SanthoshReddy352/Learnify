import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTeacher } from '@/lib/classrooms/auth'
import { assertTeacherOwnsAssessment } from './authoring-store.js'

// Shared entry sequence for every teacher assessment-authoring route.
//
// The ORDER here is the security property, and it is easy to get wrong:
//
//   1. authenticate, and check the account is a teacher at all
//   2. read the assessment through the CALLER'S client, so RLS decides whether
//      they teach this particular classroom
//   3. only then hand back the service-role client
//
// The service role bypasses RLS completely. If it were created first and the
// ownership check expressed as a filter inside a privileged query, any mistake
// in that filter would expose every classroom's papers and answer keys. Doing
// the check on the user's own client first makes the database enforce it.
export async function requireAssessmentTeacher(assessmentId) {
  const supabase = await createClient()
  const { user } = await requireTeacher(supabase)

  // RLS gate — throws 'Assessment not found' if they do not teach it.
  const assessment = await assertTeacherOwnsAssessment(supabase, assessmentId)

  const admin = createAdminClient()
  if (!admin) {
    throw new ServiceRoleMissingError()
  }

  return { supabase, admin, user, assessment }
}

// Authoring needs the answer columns, which only the service role can read.
// Without the key the feature genuinely cannot work, and saying so beats a
// confusing empty question list.
export class ServiceRoleMissingError extends Error {
  constructor() {
    super('Assessment authoring requires SUPABASE_SERVICE_ROLE_KEY on the server')
    this.name = 'ServiceRoleMissingError'
  }
}

export function assessmentErrorResponse(error) {
  const message = error?.message || 'Request failed'

  if (message === 'Teacher access required' || message === 'Unauthorized') {
    return NextResponse.json({ error: message }, { status: 403 })
  }
  if (message === 'Assessment not found') {
    return NextResponse.json({ error: message }, { status: 404 })
  }
  if (error?.name === 'ServiceRoleMissingError') {
    return NextResponse.json({ error: message }, { status: 500 })
  }
  if (error?.name === 'PaperLockedError') {
    return NextResponse.json({ error: message }, { status: 409 })
  }

  console.error('Assessment authoring error:', error)
  return NextResponse.json({ error: message }, { status: 400 })
}

// A published paper is one students may already be sitting, so its questions
// are frozen. Changing them underneath a live attempt would mean different
// students sat different tests with no record of which.
export class PaperLockedError extends Error {
  constructor(message = 'This assessment is published. Move it back to draft to edit its questions.') {
    super(message)
    this.name = 'PaperLockedError'
  }
}

export function assertEditable(assessment) {
  if (assessment.status !== 'draft') throw new PaperLockedError()
}
