import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeacherClassroomDetail } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function GET(_request, { params }) {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const detail = await getTeacherClassroomDetail(supabase, params.classroomId, user.id)

    return NextResponse.json(detail)
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized' ? 403 : 404
    return NextResponse.json({ error: error.message }, { status })
  }
}
