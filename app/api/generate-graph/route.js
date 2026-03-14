import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { updateUnlockedTopics } from '@/lib/actions'
import { generateWithGemini } from '@/lib/gemini'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subjectId, seedText, difficulty = 3, totalMinutes = 300 } = body

    if (!subjectId || !seedText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

    const subjectDescription = String(subject.description || '').trim()
    const subjectSyllabus = String(subject.syllabus || '').trim()

    if (!subjectDescription || !subjectSyllabus) {
      return NextResponse.json({
        error: 'AI curriculum generation requires both a subject description and syllabus'
      }, { status: 400 })
    }

    // === FETCH USER'S API KEY ===
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('gemini_api_key')
      .eq('id', user.id)
      .maybeSingle()

    if (userError) {
      console.error('Error fetching user data:', userError)
      // Don't fail hard, just log and continue without user key
    }

    const userApiKey = userData?.gemini_api_key
    
    // Don't block if no user key - let generateWithGemini use fallback keys
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
Subject Description: ${subjectDescription}
Official Syllabus / Scope To Cover:
${subjectSyllabus}

Additional Teacher Instructions:
${seedText || 'None'}`


    console.log('Generating curriculum with Gemini...')
    
    const responseData = await generateWithGemini([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate curriculum for subject "${subject.title}" using the description and syllabus above. Cover the syllabus completely without drifting outside scope.` }
    ], {
      maxOutputTokens: 8000,
      apiKey: userApiKey
    })

    const content = responseData.choices[0].message.content

    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    // Parse JSON from AI response
    let curriculum
    try {
      // Remove markdown code blocks if present (Gemini sometimes wraps in ```)
      const cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim()
      curriculum = JSON.parse(cleanContent)
    } catch (parseError) {
      console.error('Failed to parse AI response:', content.slice(0, 500))
      return NextResponse.json({ 
        error: 'AI returned invalid JSON',
        rawResponse: content.slice(0, 200) 
      }, { status: 500 })
    }

    // Validate curriculum structure
    if (!curriculum.topics || !Array.isArray(curriculum.topics)) {
      return NextResponse.json({ error: 'Invalid curriculum format' }, { status: 500 })
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

    // Insert or reuse topics
    const slugToIdMap = {}
    const insertedTopics = []

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

      // Topic is new, insert it
      const { data: insertedTopic, error: insertError } = await supabase
        .from('topics')
        .insert([{
          subject_id: subjectId,
          title: topic.title,
          description: topic.description || '',
          content: topic.description || '',
          estimated_minutes: topic.estimatedMinutes || 30,
          difficulty: topic.difficulty || difficulty,
          status: 'locked' // Will be unlocked by unlock engine
        }])
        .select()
        .single()

      if (insertError) {
        console.error('Error inserting topic:', insertError)
        continue
      }

      slugToIdMap[topic.slug] = insertedTopic.id
      insertedTopics.push(insertedTopic)
    }

    // Insert dependencies
    const insertedDependencies = []
    for (const topic of curriculum.topics) {
      if (topic.dependencies && topic.dependencies.length > 0) {
        const topicId = slugToIdMap[topic.slug]
        
        for (const depSlug of topic.dependencies) {
          const dependsOnId = slugToIdMap[depSlug]
          
          if (topicId && dependsOnId) {
            const { data: dep, error: depError } = await supabase
              .from('topic_dependencies')
              .insert([{
                subject_id: subjectId,
                topic_id: topicId,
                depends_on_topic_id: dependsOnId
              }])
              .select()
              .single()

            if (!depError && dep) {
              insertedDependencies.push(dep)
            }
          }
        }
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
