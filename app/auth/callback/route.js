import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { claimPendingInvitesForUser } from '@/lib/classrooms/queries'

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('OAuth Code Exchange Error:', error)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await claimPendingInvitesForUser(supabase, user)
      }
    }
  }

  let origin = requestUrl.origin
  if (origin.includes('0.0.0.0')) {
    origin = origin.replace('0.0.0.0', 'localhost')
  }

  if (next) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
