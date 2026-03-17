import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeacherClassroomDetail } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function GET(request, { params }) {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const detail = await getTeacherClassroomDetail(supabase, params.classroomId, user.id)
    const origin = new URL(request.url).origin

    return NextResponse.json({
      ...detail,
      shareLink: `${origin}/classrooms/join?classroom=${encodeURIComponent(params.classroomId)}`
    })
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized' ? 403 : 404
    return NextResponse.json({ error: error.message }, { status })
  }
}
