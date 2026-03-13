import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/classrooms/auth'
import { getStudentClassroomDetail } from '@/lib/classrooms/queries'

export async function GET(_request, { params }) {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser(supabase)
    const detail = await getStudentClassroomDetail(supabase, params.classroomId, user.id)

    return NextResponse.json(detail)
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 404
    return NextResponse.json({ error: error.message }, { status })
  }
}
