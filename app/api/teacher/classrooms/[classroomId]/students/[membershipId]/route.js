import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { removeClassroomStudent } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function DELETE(_request, { params }) {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const result = await removeClassroomStudent(supabase, {
      classroomId: params.classroomId,
      teacherUserId: user.id,
      membershipId: params.membershipId
    })

    return NextResponse.json(result)
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized'
      ? 403
      : error.message === 'Student membership not found'
        ? 404
        : 400

    return NextResponse.json({ error: error.message }, { status })
  }
}
