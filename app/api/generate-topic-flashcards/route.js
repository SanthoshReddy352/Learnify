import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateWithGemini } from '@/lib/gemini'
import { resolveTopicAccess } from '@/lib/classrooms/access'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { topicId, topicTitle, topicDescription, content, classroomId, classroomCourseId } = body

    if (!topicId || !topicTitle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const topicAccess = await resolveTopicAccess(supabase, {
      userId: user.id,
      topicId,
      classroomId,
      classroomCourseId
    })
    if (topicAccess.mode === 'classroom' && !topicAccess.adminClient) {
      return NextResponse.json({
        error: 'Classroom flashcard generation requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }
    const existingTopic = topicAccess.topic
    const effectiveSubject = topicAccess.subject

    if (existingTopic?.flashcards && Array.isArray(existingTopic.flashcards) && existingTopic.flashcards.length > 0) {
        console.log(`returning cached flashcards for topic: ${topicTitle || existingTopic.title}`)
        return NextResponse.json({
            success: true,
            flashcards: existingTopic.flashcards
        })
    }

    // === FETCH USER'S API KEY ===
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('gemini_api_key')
      .eq('id', user.id)
      .maybeSingle()

    const userApiKey = userData?.gemini_api_key

    const effectiveTitle = topicTitle || existingTopic?.title || 'Untitled Topic'
    const effectiveDescription = topicDescription || existingTopic?.description || effectiveTitle
    const effectiveContent = content || existingTopic?.content || ''
    const subjectDescription = String(effectiveSubject?.description || '').trim()
    const subjectSyllabus = String(effectiveSubject?.syllabus || '').trim()
    const subjectContext = [
      subjectDescription ? `Teacher subject description: ${subjectDescription}` : '',
      subjectSyllabus ? `Teacher syllabus: ${subjectSyllabus}` : ''
    ].filter(Boolean).join('\n')

    const flashcardPrompt = `You are an expert tutor. Create 7 to 9 concise flashcards for the topic: "${effectiveTitle}".
    
    Context Description: ${effectiveDescription}
    Detailed Content (Reference): ${effectiveContent ? effectiveContent.slice(0, 3000) : 'Not provided'}
    ${subjectContext ? `${subjectContext}\n` : ''}

    goals:
    1. Summarize key concepts into short Questions (Front) and Answers (Back).
    2. Answers MUST be brief (1-3 sentences max).
    3. Focus on high-level understanding and key facts.
    4. Output strictly as a JSON Array of objects with keys: "front", "back".
    
    Example Output:
    [
        { "front": "What is Photosynthesis?", "back": "The process by which plants convert light energy into chemical energy." },
        { "front": "Key inputs?", "back": "Sunlight, Water, and Carbon Dioxide." }
    ]
    
    Return ONLY the JSON array.`

    console.log(`Generating flashcards for topic: ${effectiveTitle}`)

    const response = await generateWithGemini([
          { role: 'system', content: 'You are a helpful AI that generates JSON flashcards.' },
          { role: 'user', content: flashcardPrompt }
    ], {
      apiKey: userApiKey,
      temperature: 0.5 
    })

    let rawContent = response.choices?.[0]?.message?.content

    if (!rawContent) {
        throw new Error('AI returned empty content')
    }

    // Cleanup: Remove markdown wrapping
    rawContent = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
    
    let flashcards = []
    try {
        flashcards = JSON.parse(rawContent)
    } catch (e) {
        console.error('Failed to parse flashcards JSON:', rawContent)
        throw new Error('AI returned invalid JSON format')
    }

    if (!Array.isArray(flashcards)) {
         throw new Error('AI returned invalid structure (not an array)')
    }

    // === SAVE TO DATABASE ===
    const writer = topicAccess.adminClient || supabase
    const { error: updateError } = await writer
        .from('topics')
        .update({ flashcards: flashcards })
        .eq('id', topicId)

    if (updateError) {
        console.error('Failed to save flashcards to DB:', updateError)
        // We continue even if save fails, returning the generated cards to user
    }

    return NextResponse.json({
      success: true,
      flashcards: flashcards
    })

  } catch (error) {
    console.error('Error generating flashcards:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
