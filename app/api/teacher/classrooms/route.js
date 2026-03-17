import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClassroom, listTeacherClassrooms } from '@/lib/classrooms/queries'
import { requireTeacher } from '@/lib/classrooms/auth'

export async function GET() {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const classrooms = await listTeacherClassrooms(supabase, user.id)

    return NextResponse.json({ classrooms })
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized' ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { user } = await requireTeacher(supabase)
    const body = await request.json()
    const classroom = await createClassroom(supabase, user.id, body)

    return NextResponse.json({ classroom })
  } catch (error) {
    const status = error.message === 'Teacher access required' || error.message === 'Unauthorized' ? 403 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
}
