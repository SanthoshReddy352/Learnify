import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { resolveTopicAccess } from '@/lib/classrooms/access'
import { generateArtifact } from '@/lib/ai/pipelines/artifact'

// Generate an interactive artifact for a topic (Plan P7.3). The returned `html`
// is UNTRUSTED — clients must render it only via the sandboxed ArtifactFrame.
export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const topicId = body?.topicId
    if (!topicId) return NextResponse.json({ error: 'topicId is required' }, { status: 400 })

    const topicAccess = await resolveTopicAccess(supabase, {
      userId: user.id,
      topicId,
      classroomId: body?.classroomId,
      classroomCourseId: body?.classroomCourseId
    })
    if (topicAccess.mode === 'classroom' && !topicAccess.adminClient) {
      return NextResponse.json({
        error: 'Classroom artifact generation requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }
    const topic = topicAccess.topic

    const { data: userSecrets } = await supabase
      .from('user_secrets').select('*').eq('id', user.id).maybeSingle()

    const artifact = await generateArtifact({
      topicTitle: topic?.title || body?.topicTitle || 'Topic',
      difficulty: topic?.difficulty || 3,
      userSecrets
    })

    // Storage deferred to P14 (topics.artifact); write only when enabled.
    if (process.env.CONTENT_ARTIFACT === 'true') {
      const writer = topicAccess.adminClient || supabase
      const { error: storeError } = await writer
        .from('topics').update({ artifact }).eq('id', topicId)
      if (storeError) console.error('Failed to store artifact:', storeError)
    }

    return NextResponse.json({ success: true, artifact })
  } catch (error) {
    console.error('Error generating artifact:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}
