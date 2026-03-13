import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateWithGemini } from '@/lib/gemini'

export async function POST(request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { topicId, message, history = [] } = body

        if (!topicId || !message) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // 1. Fetch Topic Context (including content)
        const { data: topic, error: topicError } = await supabase
            .from('topics')
            .select('*, subjects!inner(*)')
            .eq('id', topicId)
            .single()

        if (topicError || !topic) {
            return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
        }

        // 2. Fetch User Profile for Personalization
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('education_level, learning_goals, preferred_learning_style')
            .eq('id', user.id)
            .single()

        const learningStyle = profile?.preferred_learning_style || 'General'
        const educationLevel = profile?.education_level || 'General Audience'

        // 3. Construct System Prompt
        const systemPrompt = `You are an expert AI Tutor specialized in "${topic.subjects.title}".
        
        CURRENT CONTEXT:
        - Subject: ${topic.subjects.title}
        - Topic: ${topic.title}
        - Topic Description: ${topic.description}
        - Student Level: ${educationLevel}
        - Learning Style: ${learningStyle}
        
        INSTRUCTIONS:
        1. Answer the student's question specifically related to the provided topic content.
        2. If the question is strictly about the topic/subject, answer it helpfuly and concisely.
        3. If the question is UNRELATED to the subject (e.g., "Who won the World Cup?", "Write code for a game unrelated to this"), politely refuse and ask to stay on topic.
        4. Use Markdown for formatting (bold, italic, code blocks).
        5. Keep answers concise but clear. Avoid long lectures unless asked.
        6. Reference the provided content context if applicable.
        
        TOPIC CONTENT CONTEXT:
        ${topic.content ? topic.content.slice(0, 15000) : "No specific content generated yet."}
        `

        // 4. Construct Message History
        // History from client is [{role, content}, ...]. 
        // We need to map it to Gemini format if generateWithGemini doesn't handle it, 
        // but looking at lib/gemini.js, it expects { role: 'user'|'assistant', content: string }
        
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message }
        ]

        // 5. Generate Response
        const responseData = await generateWithGemini(messages, {
            apiKey: profile?.gemini_api_key // Use user's key if available, else system fallback
        })

        const content = responseData.choices[0].message.content

        return NextResponse.json({ content })

    } catch (error) {
        console.error('Doubt Chat Error:', error)
        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status: 500 })
    }
}
