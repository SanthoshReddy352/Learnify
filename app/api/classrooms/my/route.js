import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, normalizeEmail } from '@/lib/classrooms/auth'
import { claimPendingInvitesForUser, listPendingInvitations, listStudentClassrooms } from '@/lib/classrooms/queries'

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser(supabase)

    await claimPendingInvitesForUser(supabase, user)

    const [classrooms, invitations] = await Promise.all([
      listStudentClassrooms(supabase, user.id),
      listPendingInvitations(supabase, normalizeEmail(user.email))
    ])

    return NextResponse.json({
      classrooms,
      invitations
    })
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}
