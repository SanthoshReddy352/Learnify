import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revokeClassroomInvite } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function DELETE(_request, { params }) {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const result = await revokeClassroomInvite(supabase, {
      classroomId: params.classroomId,
      teacherUserId: user.id,
      inviteId: params.inviteId
    })

    return NextResponse.json(result)
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized'
      ? 403
      : error.message === 'Invite not found'
        ? 404
        : 400

    return NextResponse.json({ error: error.message }, { status })
  }
}
