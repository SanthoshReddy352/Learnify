import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentRole } from '@/lib/classrooms/auth'
import { listPendingInvitations } from '@/lib/classrooms/queries'

export async function GET() {
  try {
    const supabase = await createClient()
    const roleInfo = await resolveCurrentRole(supabase)
    const invitations = await listPendingInvitations(supabase, roleInfo.email)

    return NextResponse.json({
      role: roleInfo.role,
      isTeacher: roleInfo.isTeacher,
      inviteCount: invitations.length
    })
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}
