import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { updateUnlockedTopics } from '@/lib/actions'
import { generateObjectWithFallback } from '@/lib/ai/generate'
import { generateGraphRequestSchema, aiCurriculumSchema, parseOr400 } from '@/lib/validation/schemas'

function normalizeOptionalText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .trim()
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = parseOr400(generateGraphRequestSchema, await request.json())
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { subjectId, seedText, difficulty, totalMinutes } = parsed.data

    // Verify subject belongs to user
    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .eq('user_id', user.id)
      .single()

    if (subjectError || !subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }

    const normalizedEmail = String(user.email || '').trim().toLowerCase()
    const { data: roleData, error: roleError } = await supabase
      .from('teacher_role_allowlist')
      .select('role')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (roleError) {
      console.error('Error resolving role for curriculum generation:', roleError)
      return NextResponse.json({ error: 'Failed to verify user role' }, { status: 500 })
    }

    const isTeacher = roleData?.role === 'teacher'
    const subjectDescription = normalizeOptionalText(subject.description)
    const subjectSyllabus = normalizeOptionalText(subject.syllabus)
    const teacherInstructions = normalizeOptionalText(seedText)

    if (isTeacher && (!subjectDescription || !subjectSyllabus)) {
      return NextResponse.json({
        error: 'Teachers must provide both a subject description and syllabus before generating a roadmap'
      }, { status: 400 })
    }

    // === FETCH USER'S API KEY ===
    const { data: userSecrets, error: userError } = await supabase
      .from('user_secrets')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (userError) {
      console.error('Error fetching user data:', userError)
      // Don't fail hard, just log and continue without user key
    }

    // Don't block if no user key - the provider registry falls back to system keys
    // if (!userApiKey) { ... } -> Removed

    // === FETCH EXISTING TOPICS FIRST (for AI-aware deduplication) ===
    console.log('Fetching existing topics to inform AI...')
    const { data: existingTopics, error: fetchError } = await supabase
      .from('topics')
      .select('id, title, description')
      .eq('subject_id', subjectId)

    if (fetchError) {
      console.error('Error fetching existing topics:', fetchError)
    }

    const existingTopicsList = existingTopics && existingTopics.length > 0
      ? existingTopics.map(t => `- ${t.title}`).join('\n')
      : 'None'

    console.log(`Found ${existingTopics?.length || 0} existing topics`)

    // === FETCH USER PROFILE FOR PERSONALIZATION ===
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('education_level, learning_goals, preferred_learning_style, occupation')
      .eq('id', user.id)
      .single()

    let personalizationContext = ''
    if (!profileError && userProfile) {
      personalizationContext = `
USER PROFILE (PERSONALIZE THE CURRICULUM FOR THIS USER):
- Education Level: ${userProfile.education_level || 'Not specified'}
- Occupation: ${userProfile.occupation || 'Not specified'}
- Learning Goals: ${userProfile.learning_goals || 'Not specified'}
- Preferred Learning Style: ${userProfile.preferred_learning_style || 'Not specified'}

INSTRUCTION: Use the user's profile to tailor the difficulty, examples, and progression of the topics. For example, if they are a visual learner, suggest topics that might lend themselves to diagrams (even though you are generating text titles). If they are a beginner, start with very fundamental concepts.
`
    }

    // Call Gemini API for curriculum generation
    const contextSections = [
      subjectDescription
        ? `Subject Description:\n${subjectDescription}`
        : null,
      subjectSyllabus
        ? `Official Syllabus / Scope To Cover:\n${subjectSyllabus}`
        : null,
      teacherInstructions
        ? `Additional Teacher Instructions:\n${teacherInstructions}`
        : null
    ].filter(Boolean)

    const subjectContext = contextSections.length > 0
      ? contextSections.join('\n\n')
      : 'No subject description, syllabus, or extra instructions were provided. Infer a solid general-purpose learning roadmap from the subject title and user profile alone.'

    const systemPrompt = `You are a curriculum designer. Generate a learning path as a directed acyclic graph (DAG).
${personalizationContext}

CRITICAL RULES:
1. Output ONLY valid JSON, absolutely NO markdown code blocks, no explanations
2. Create all the topics to provide COMPREHENSIVE coverage of the subject(All the concepts in the subject must be covered), minimum 17-18 topics must  be present , There is no maximum limit for the number of topics. All the topics regarding the subject must be covered without missing any dependencies. Ensure that all the topics are coverd strictly.
3. Prioritize breadth of topics. Cover all key areas, from basics to advanced.
4. Each topic needs: slug (unique_id), title, brief description, estimatedMinutes
5. Dependencies use slugs, not array indices
6. Ensure NO CYCLES in the dependency graph
6. First topic should have no dependencies (entry point)
7. Difficulty level: ${difficulty}/5
8. Total study time: approximately ${totalMinutes} minutes

EXISTING TOPICS (DO NOT DUPLICATE):
${existingTopicsList}

IMPORTANT: If any of the above existing topics already cover a concept you want to include, DO NOT create a similar/duplicate topic. Only create NEW topics that add unique value and are not already covered.

JSON FORMAT (NO CODE BLOCKS):
{
  "topics": [
    {
      "slug": "intro-basics",
      "title": "Introduction to Basics",
      "description": "Foundational concepts",
      "estimatedMinutes": 30,
      "difficulty": 2,
      "dependencies": []
    },
    {
      "slug": "advanced-concepts",
      "title": "Advanced Concepts",
      "description": "Building on basics",
      "estimatedMinutes": 45,
      "difficulty": 4,
      "dependencies": ["intro-basics"]
    }
  ]
}

Subject: ${subject.title}
Course Context:
${subjectContext}`


    console.log('Generating curriculum (structured output)...')

    // Schema-enforced structured output: the SDK validates the DAG against
    // aiCurriculumSchema, so there is no JSON-out-of-markdown parsing.
    let curriculum
    try {
      curriculum = await generateObjectWithFallback({
        schema: aiCurriculumSchema,
        system: systemPrompt,
        prompt: `Generate curriculum for subject "${subject.title}". Use any provided description, syllabus, and instructions when present. If the context is sparse, infer a strong general-purpose roadmap from the title alone without asking follow-up questions.`,
        maxOutputTokens: 16000,
        userSecrets
      })
    } catch (aiError) {
      console.error('Curriculum generation failed:', aiError)
      return NextResponse.json({
        error: 'AI failed to generate a valid curriculum',
        details: String(aiError?.message || aiError).slice(0, 300)
      }, { status: 502 })
    }

    // Validate no cycles in DAG
    const hasCycle = detectCycle(curriculum.topics)
    if (hasCycle) {
      return NextResponse.json({ error: 'Curriculum has circular dependencies' }, { status: 500 })
    }

    // === Use existing topics for deduplication map ===
    const existingTopicMap = new Map()
    if (existingTopics) {
      existingTopics.forEach(topic => {
        const normalizedTitle = topic.title.toLowerCase().trim()
        existingTopicMap.set(normalizedTitle, topic.id)
      })
    }

    // Insert or reuse topics — IDs are generated here so all new topics and
    // dependencies land in two bulk inserts instead of one request per row.
    const slugToIdMap = {}
    const insertedTopics = []
    const newTopicRows = []

    for (const topic of curriculum.topics) {
      const normalizedTitle = topic.title.toLowerCase().trim()

      // Check if topic already exists
      if (existingTopicMap.has(normalizedTitle)) {
        const existingId = existingTopicMap.get(normalizedTitle)
        console.log(`Reusing existing topic: "${topic.title}" (ID: ${existingId})`)
        slugToIdMap[topic.slug] = existingId
        insertedTopics.push({ id: existingId, title: topic.title, isExisting: true })
        continue
      }

      const newId = randomUUID()
      slugToIdMap[topic.slug] = newId
      newTopicRows.push({
        id: newId,
        subject_id: subjectId,
        title: topic.title,
        description: topic.description || '',
        content: topic.description || '',
        estimated_minutes: topic.estimatedMinutes || 30,
        difficulty: topic.difficulty || difficulty,
        status: 'locked' // Will be unlocked by unlock engine
      })
    }

    if (newTopicRows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('topics')
        .insert(newTopicRows)
        .select('id, title')

      if (insertError) {
        console.error('Error inserting topics:', insertError)
        return NextResponse.json({ error: 'Failed to save generated topics' }, { status: 500 })
      }
      insertedTopics.push(...(inserted || []))
    }

    // Insert dependencies in one bulk request (duplicates against existing
    // links are skipped by the unique constraint via upsert-ignore)
    const dependencyRows = []
    for (const topic of curriculum.topics) {
      const topicId = slugToIdMap[topic.slug]
      for (const depSlug of topic.dependencies || []) {
        const dependsOnId = slugToIdMap[depSlug]
        if (topicId && dependsOnId && topicId !== dependsOnId) {
          dependencyRows.push({
            subject_id: subjectId,
            topic_id: topicId,
            depends_on_topic_id: dependsOnId
          })
        }
      }
    }

    let insertedDependencies = []
    if (dependencyRows.length > 0) {
      const { data: deps, error: depsInsertError } = await supabase
        .from('topic_dependencies')
        .upsert(dependencyRows, {
          onConflict: 'topic_id,depends_on_topic_id',
          ignoreDuplicates: true
        })
        .select()

      if (depsInsertError) {
        console.error('Error inserting dependencies:', depsInsertError)
      } else {
        insertedDependencies = deps || []
      }
    }

    // Run unlock engine to unlock topics without dependencies
    await updateUnlockedTopics(subjectId)

    return NextResponse.json({
      success: true,
      topicsCreated: insertedTopics.length,
      dependenciesCreated: insertedDependencies.length,
      curriculum
    })

  } catch (error) {
    console.error('Error generating curriculum:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}

// Detect cycles in dependency graph using DFS
function detectCycle(topics) {
  const graph = {}
  const slugs = new Set()

  // Build adjacency list
  topics.forEach(topic => {
    slugs.add(topic.slug)
    graph[topic.slug] = topic.dependencies || []
  })

  const visited = new Set()
  const recStack = new Set()

  function hasCycleDFS(slug) {
    if (recStack.has(slug)) return true
    if (visited.has(slug)) return false

    visited.add(slug)
    recStack.add(slug)

    const neighbors = graph[slug] || []
    for (const neighbor of neighbors) {
      if (hasCycleDFS(neighbor)) return true
    }

    recStack.delete(slug)
    return false
  }

  for (const slug of slugs) {
    if (hasCycleDFS(slug)) return true
  }

  return false
}
