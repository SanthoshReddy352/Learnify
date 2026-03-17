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

    const { subjectId } = await request.json()

    if (!subjectId) {
      return NextResponse.json({ error: 'Missing subjectId' }, { status: 400 })
    }

    // Verify ownership and get subject details
    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .eq('user_id', user.id)
      .single()

    if (subjectError || !subject) {
      return NextResponse.json({ error: 'Subject not found or access denied' }, { status: 404 })
    }

    // Fetch all topics for this subject
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('title, content')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: true })

    if (topicsError || !topics || topics.length === 0) {
      return NextResponse.json({ error: 'No topics found for this subject. Create topics first.' }, { status: 400 })
    }

    // Aggregate content
    let aggregatedContent = ''
    topics.forEach((t) => {
      if (t.content) {
         aggregatedContent += `\n\n--- TOPIC: ${t.title} ---\n${t.content}`
      }
    })

    if (!aggregatedContent.trim()) {
        return NextResponse.json({ error: 'Topics contain no content to summarize.' }, { status: 400 })
    }

    // Fetch user's API Key
    const { data: userData } = await supabase
      .from('profiles')
      .select('gemini_api_key')
      .eq('id', user.id)
      .maybeSingle()

    const userApiKey = userData?.gemini_api_key

    const prompt = `You are a master summarizer and tutor. The following is a collection of educational topics for the subject: "${subject.title}".
    
    Your task is to synthesize this material into a dense, high-yield, 2-page master "Cheat Sheet" or "Study Guide".
    
    REQUIREMENTS:
    1. Organize logically (not just chronologically). Group related concepts together.
    2. Extract and highlight the most critical definitions, equations, and formulas.
    3. Include Mermaid diagrams (flowcharts, sequence charts) that summarize complex flows. Extract or create them based on the text.
    4. Keep it concise. Use bullet points, bolding, and tables where appropriate.
    5. Format strictly in Markdown. Use markdown tables and code blocks where needed.
    6. Ensure the cheat sheet is highly visual and easy to scan.
    7. CRITICAL - MATH FORMATTING: NEVER use LaTeX dollar signs ($, $$). Write ALL math using clean Unicode:
       - Superscripts: ², ³, ⁴, ⁿ (e.g., E = mc², x²)
       - Subscripts: ₀, ₁, ₂, ₃, ₙ (e.g., H₂O, CO₂)
       - Greek: α, β, γ, δ, θ, π, σ, Σ, Δ, λ, μ, Ω
       - Operators: ×, ÷, ±, ≠, ≤, ≥, ≈, √, ∞, →, ⇒, ∈, ∪, ∩
       - Fractions: write as a/b, NOT LaTeX \\frac
       - Make key equations **bold**.

    CONTENT TO SUMMARIZE:
    ${aggregatedContent}
    `

    console.log(`[CheatSheet] Generating for subject ${subjectId}...`)

    const contentResponseData = await generateWithGemini([
        { role: 'system', content: 'You are an expert tutor that creates dense, high-yield cheat sheets.' },
        { role: 'user', content: prompt }
    ], {
      apiKey: userApiKey,
      maxOutputTokens: 5000
    })

    let finalContent = contentResponseData.choices?.[0]?.message?.content
    
    if (!finalContent) {
        throw new Error('AI returned empty content for Cheat Sheet')
    }

    // Cleanup Markdown blocks
    finalContent = finalContent.replace(/^```markdown\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()

    // Save to database
    const { error: updateError } = await supabase
      .from('subjects')
      .update({ cheat_sheet: finalContent })
      .eq('id', subjectId)

    if (updateError) {
      console.error('[CheatSheet] Error saving to database:', updateError)
      throw new Error(`Database Error: ${updateError.message || 'Failed to save Cheat Sheet'}`)
    }

    return NextResponse.json({
      success: true,
      cheat_sheet: finalContent
    })

  } catch (error) {
    console.error('Error generating cheat sheet:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
