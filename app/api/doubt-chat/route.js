import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateTextWithFallback } from '@/lib/ai/generate'
import { resolveTopicAccess } from '@/lib/classrooms/access'
import { doubtChatRequestSchema, parseOr400 } from '@/lib/validation/schemas'
import { buildTutorSystemPrompt } from '@/lib/ai/pipelines/doubt-chat-prompt'
import {
  fetchConceptState,
  fetchTopicConcepts,
  recordConceptSignal,
  buildLearnerMemoryContext,
  buildProactiveNudge,
  doubtSignal
} from '@/lib/memory/concept-state'

export async function POST(request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const parsed = parseOr400(doubtChatRequestSchema, await request.json())
        if (parsed.error) {
            return NextResponse.json({ error: parsed.error }, { status: 400 })
        }
        const { topicId, message, history, classroomId = null, classroomCourseId = null } = parsed.data

        // 1. Fetch Topic Context (including content)
        const topicAccess = await resolveTopicAccess(supabase, {
            userId: user.id,
            topicId,
            classroomId,
            classroomCourseId
        })
        const topic = {
            ...topicAccess.topic,
            subjects: topicAccess.subject
        }

        // 2. Fetch User Profile for Personalization + user's own API key
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('education_level, learning_goals, preferred_learning_style')
            .eq('id', user.id)
            .single()

        const { data: userSecrets } = await supabase
            .from('user_secrets')
            .select('*')
            .eq('id', user.id)
            .maybeSingle()

        const learningStyle = profile?.preferred_learning_style || 'General'
        const educationLevel = profile?.education_level || 'General Audience'

        // 3. Learner memory (Plan P8.3): what this student has mastered vs.
        // keeps tripping on, so the tutor can target the real gap. Best-effort —
        // read through the user's own client (owner-only RLS on the memory).
        const subjectId = topic.subject_id || topicAccess.subject?.id
        let learnerContext = ''
        let proactiveNudge = ''
        try {
            const conceptRows = await fetchConceptState(supabase, { userId: user.id, subjectId })
            learnerContext = buildLearnerMemoryContext(conceptRows)
            proactiveNudge = buildProactiveNudge(conceptRows)
        } catch (memoryError) {
            console.error('Failed to build learner memory context (doubt-chat):', memoryError)
        }

        // 4. Construct System Prompt (Socratic by default; SOCRATIC_CHAT=false
        // reverts to the plain answer-first tutor).
        const systemPrompt = buildTutorSystemPrompt({
            subjectTitle: topic.subjects.title,
            topicTitle: topic.title,
            topicDescription: topic.description,
            educationLevel,
            learningStyle,
            topicContent: topic.content,
            learnerContext,
            proactiveNudge,
            socratic: process.env.SOCRATIC_CHAT !== 'false'
        })

        // 5. Generate response (provider-agnostic, user's key preferred)
        const content = await generateTextWithFallback({
            system: systemPrompt,
            messages: [
                ...history,
                { role: 'user', content: message }
            ],
            userSecrets
        })

        // 6. Remember that they asked (P8.2/P8.3). Asking is exposure plus a
        // struggle tally — one question means nothing, a pattern of them is the
        // signal that later surfaces as a proactive nudge. Never blocks the reply.
        try {
            const concepts = await fetchTopicConcepts(supabase, {
                topicId,
                fallbackTitle: topic.title
            })
            await recordConceptSignal(supabase, {
                userId: user.id,
                subjectId,
                concepts,
                signal: doubtSignal()
            })
        } catch (memoryError) {
            console.warn('Concept-memory update skipped (doubt-chat):', memoryError.message)
        }

        return NextResponse.json({ content })

    } catch (error) {
        console.error('Doubt Chat Error:', error)
        const status = error.message === 'Unauthorized'
            ? 401
            : error.message === 'Topic is locked'
                ? 403
                : error.message.includes('not found')
                    ? 404
                    : 500

        return NextResponse.json({ error: 'Failed to process request', details: error.message }, { status })
    }
}
