import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, normalizeEmail } from '@/lib/classrooms/auth'
import { claimPendingInvitesForUser, listPendingInvitations } from '@/lib/classrooms/queries'

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser(supabase)

    await claimPendingInvitesForUser(supabase, user)
    const invitations = await listPendingInvitations(supabase, normalizeEmail(user.email))

    return NextResponse.json({ invitations })
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}
