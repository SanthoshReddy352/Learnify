import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBulkClassroomInvites, getTeacherClassroomDetail } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function POST(request, { params }) {
  try {
    const supabase = await createClient()
    const { user, email } = await requireTeacher(supabase)
    const body = await request.json()
    const emails = Array.isArray(body.emails)
      ? body.emails
      : String(body.emails || '')
          .split(/[\n,;]/)
          .map((entry) => entry.trim())
          .filter(Boolean)

    const detail = await getTeacherClassroomDetail(supabase, params.classroomId, user.id)
    const origin = new URL(request.url).origin
    const result = await createBulkClassroomInvites(supabase, {
      classroomId: params.classroomId,
      teacherUserId: user.id,
      teacherEmail: email,
      classroomName: detail.classroom.name,
      emails,
      origin,
      existingActiveEmails: detail.members
        .filter((member) => member.status === 'active' && member.email)
        .map((member) => member.email)
    })

    return NextResponse.json(result)
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized' ? 403 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
}
