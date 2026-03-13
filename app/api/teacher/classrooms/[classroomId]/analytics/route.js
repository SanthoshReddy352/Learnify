import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeacherClassroomAnalytics } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function GET(_request, { params }) {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const analytics = await getTeacherClassroomAnalytics(supabase, params.classroomId, user.id)

    return NextResponse.json(analytics)
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized' ? 403 : 404
    return NextResponse.json({ error: error.message }, { status })
  }
}
