import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateProjectTrack } from '@/lib/ai/pipelines/project-track'

// Generate a project-based learning track for a subject (Plan P7.4).
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const subjectId = body?.subjectId
    if (!subjectId) return NextResponse.json({ error: 'subjectId is required' }, { status: 400 })

    const { data: subject, error } = await supabase
      .from('subjects')
      .select('id, title, description, user_id')
      .eq('id', subjectId)
      .eq('user_id', user.id)
      .single()
    if (error || !subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

    const { data: userSecrets } = await supabase
      .from('user_secrets').select('*').eq('id', user.id).maybeSingle()

    const project = await generateProjectTrack({
      subjectTitle: subject.title,
      subjectDescription: subject.description || '',
      difficulty: Number(body?.difficulty) || 3,
      userSecrets
    })

    // Storage deferred to P14 (subjects.project_track); write only when enabled.
    if (process.env.CONTENT_PROJECT === 'true') {
      const { error: storeError } = await supabase
        .from('subjects').update({ project_track: project }).eq('id', subjectId)
      if (storeError) console.error('Failed to store project track:', storeError)
    }

    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error('Error generating project track:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
