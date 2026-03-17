import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { attachCourseToClassroom } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function POST(request, { params }) {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const body = await request.json()
    const course = await attachCourseToClassroom(supabase, params.classroomId, user.id, body)

    return NextResponse.json({ course })
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized' ? 403 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
}
