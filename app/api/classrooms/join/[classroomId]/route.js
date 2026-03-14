import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/classrooms/auth'
import { getClassroomJoinPreview, joinClassroomByLink } from '@/lib/classrooms/queries'

export async function GET(_request, { params }) {
  try {
    const supabase = await createClient()
    const classroom = await getClassroomJoinPreview(supabase, params.classroomId)

    return NextResponse.json({ classroom })
  } catch (error) {
    const status = error.message === 'Classroom not found' ? 404 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
}

export async function POST(_request, { params }) {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser(supabase)
    const result = await joinClassroomByLink(supabase, params.classroomId, user)

    return NextResponse.json(result)
  } catch (error) {
    const status = error.message === 'Unauthorized'
      ? 401
      : error.code === 'PROFILE_INCOMPLETE'
        ? 409
        : error.code === 'REMOVED_FROM_CLASSROOM'
          ? 403
          : error.message === 'Classroom not found'
            ? 404
            : 400

    return NextResponse.json({
      error: error.message,
      code: error.code,
      missingFields: error.missingFields || []
    }, { status })
  }
}
