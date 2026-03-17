import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/classrooms/auth'
import { acceptInviteByToken } from '@/lib/classrooms/queries'

export async function POST(_request, { params }) {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser(supabase)
    const result = await acceptInviteByToken(supabase, params.token, user)

    return NextResponse.json(result)
  } catch (error) {
    const status = error.message === 'Unauthorized'
      ? 401
      : error.code === 'PROFILE_INCOMPLETE'
        ? 409
        : 400
    return NextResponse.json({
      error: error.message,
      code: error.code,
      missingFields: error.missingFields || []
    }, { status })
  }
}
