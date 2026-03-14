import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeacherClassroomAnalytics } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function GET(_request, context) {
  try {
    const { classroomId } = await context.params
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const analytics = await getTeacherClassroomAnalytics(supabase, classroomId, user.id)

    return NextResponse.json({
      ...analytics,
      meta: {
        classroomId,
        generatedAt: new Date().toISOString(),
        version: 'teacher-analytics-v2'
      }
    })
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized'
      ? 403
      : error.message === 'Classroom not found'
        ? 404
        : 500

    return NextResponse.json({ error: error.message }, { status })
  }
}
