import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { updateUnlockedTopics } from '@/lib/actions'

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

    // Call OpenRouter API for curriculum generation
    const systemPrompt = `You are a curriculum designer. Generate a learning path as a directed acyclic graph (DAG).

CRITICAL RULES:
1. Output ONLY valid JSON, no markdown, no explanations
2. Create 5-10 topics with dependencies
3. Each topic needs: slug (unique_id), title, description, estimatedMinutes
4. Dependencies use slugs, not array indices
5. Ensure NO CYCLES in the dependency graph
6. First topic should have no dependencies (entry point)
7. Difficulty level: ${difficulty}/5
8. Total study time: approximately ${totalMinutes} minutes

JSON FORMAT:
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
Context: ${seedText}`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL,
        'X-Title': 'Learnify'
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5-8b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate curriculum for: ${seedText}` }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenRouter API error:', errorText)
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
    }

    const aiResponse = await response.json()
    const content = aiResponse.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    // Parse JSON from AI response
    let curriculum
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      curriculum = JSON.parse(cleanContent)
    } catch (parseError) {
      console.error('Failed to parse AI response:', content)
      return NextResponse.json({ 
        error: 'AI returned invalid JSON',
        rawResponse: content 
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

    // Insert topics into database
    const slugToIdMap = {}
    const insertedTopics = []

    for (const topic of curriculum.topics) {
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
