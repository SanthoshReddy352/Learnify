import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/classrooms/auth'
import { getStudentClassroomCourse } from '@/lib/classrooms/queries'

export async function GET(_request, { params }) {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser(supabase)
    const course = await getStudentClassroomCourse(supabase, params.classroomId, params.classroomCourseId, user.id)

    return NextResponse.json(course)
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 404
    return NextResponse.json({ error: error.message }, { status })
  }
}
