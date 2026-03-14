import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInvitePreview } from '@/lib/classrooms/queries'

export async function GET(_request, { params }) {
  try {
    const supabase = await createClient()
    const invitation = await getInvitePreview(supabase, params.token)

    return NextResponse.json({ invitation })
  } catch (error) {
    const status = error.message === 'Invite not found' ? 404 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
}
