import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateWithGemini } from '@/lib/gemini'
import { resolveTopicAccess } from '@/lib/classrooms/access'

// Wikimedia Commons API search for educational images
async function searchWikimediaImage(query) {
  try {
    const searchUrl = new URL('https://commons.wikimedia.org/w/api.php')
    searchUrl.searchParams.set('action', 'query')
    searchUrl.searchParams.set('generator', 'search')
    searchUrl.searchParams.set('gsrsearch', `${query} filetype:bitmap`)
    searchUrl.searchParams.set('gsrnamespace', '6') // File namespace
    searchUrl.searchParams.set('gsrlimit', '5')
    searchUrl.searchParams.set('prop', 'imageinfo')
    searchUrl.searchParams.set('iiprop', 'url|extmetadata')
    searchUrl.searchParams.set('iiurlwidth', '800') // Get resized URL
    searchUrl.searchParams.set('format', 'json')
    searchUrl.searchParams.set('origin', '*')

    const response = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'Learnify/1.0 (Educational Platform)' }
    })

    if (!response.ok) {
      console.warn(`[Wikimedia] Search failed for "${query}": ${response.status}`)
      return null
    }

    const data = await response.json()
    const pages = data.query?.pages

    if (!pages) {
      console.log(`[Wikimedia] No results for "${query}"`)
      return null
    }

    // Find best image (prefer those with descriptions, skip SVGs for better compatibility)
    const pageArray = Object.values(pages).filter(page => {
      const url = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url
      return url && !url.endsWith('.svg')
    })

    if (pageArray.length === 0) {
      console.log(`[Wikimedia] No suitable images for "${query}"`)
      return null
    }

    // Return the first good result
    const bestPage = pageArray[0]
    const imageInfo = bestPage.imageinfo?.[0]
    const thumbUrl = imageInfo?.thumburl || imageInfo?.url

    console.log(`[Wikimedia] Found image for "${query}": ${thumbUrl}`)
    return thumbUrl
  } catch (error) {
    console.error(`[Wikimedia] Error searching for "${query}":`, error.message)
    return null
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      topicId,
      subjectTitle,
      topicTitle,
      topicDescription,
      difficulty = 5,
      classroomId,
      classroomCourseId
    } = body

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
        error: 'Classroom content generation requires SUPABASE_SERVICE_ROLE_KEY on the server'
      }, { status: 500 })
    }
    const effectiveTopic = topicAccess.topic
    const effectiveSubject = topicAccess.subject

    // === FETCH USER'S API KEY ===
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('gemini_api_key, huggingface_api_key')
      .eq('id', user.id)
      .maybeSingle()

    if (userError) {
      console.error('Error fetching user data:', userError)
      // Don't fail hard
    }

    const userApiKey = userData?.gemini_api_key
    // Fallback to system keys if user key is missing


    // === FETCH USER PROFILE FOR PERSONALIZATION ===
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('education_level, learning_goals, preferred_learning_style, occupation')
      .eq('id', user.id)
      .single()

    let personalizationContext = ''
    if (!profileError && userProfile) {
        personalizationContext = `
    PERSONALIZATION CONTEXT:
    - The student's education level is: ${userProfile.education_level || 'General Audience'}.
    - Their occupation is: ${userProfile.occupation || 'Not specified'}.
    - Their learning style is: ${userProfile.preferred_learning_style || 'General'}.
    - Their goal is: ${userProfile.learning_goals || 'To learn'}.
    
    INSTRUCTION: Adapt the explanation depth, vocabulary, and examples to match this profile. 
    - If "Visual", describe concepts using vivid imagery that asks the user to visualize diagrams (e.g., "Imagine a flow where..."). 
    - If "Kinesthetic", suggest small mental exercises or hands-on analogies.
    - If "Beginner/High School", use simple analogies. 
    - If "PhD/Advanced", use rigorous academic definitions.
    `
    }

    // === SUBJECT-BASED VISUAL REASONING ===
    const effectiveSubjectTitle = subjectTitle || effectiveSubject?.title || 'Untitled Subject'
    const effectiveTopicTitle = topicTitle || effectiveTopic?.title || 'Untitled Topic'
    const effectiveTopicDescription = topicDescription || effectiveTopic?.description || effectiveTopicTitle
    const effectiveDifficulty = difficulty || effectiveTopic?.difficulty || 5

    const standardSubjects = ['physics', 'maths', 'mathematics', 'chemistry', 'biology', 'science']
    const lowerSubject = effectiveSubjectTitle.toLowerCase()
    const isStandardSubject = standardSubjects.some(s => lowerSubject.includes(s))

    const visualInstructions = isStandardSubject ? `
       B. For REAL IMAGES (photos, scientific diagrams, anatomical structures):
          - Use placeholder syntax: <<IMAGE: very specific search query>>
          - Be VERY SPECIFIC with field-appropriate terms
          
          FIELD-SPECIFIC SEARCH EXAMPLES:
          * Biology: "mitochondria labeled diagram", "DNA double helix structure", "cell membrane phospholipid bilayer"
          * Chemistry: "periodic table elements", "covalent bond molecular structure", "benzene ring structure"
          * Physics: "electromagnetic spectrum wavelength diagram", "newton laws motion illustration"
          * Math: "unit circle trigonometry", "derivative graph slope tangent"
          
       C. HYBRID APPROACH FOR SCIENCE SUBJECTS (IMPORTANT):
          - Use BOTH Mermaid diagrams AND Wikimedia images together
          - Mermaid: For PROCESSES, FLOWS, RELATIONSHIPS (e.g., metabolic pathways, circuit diagrams, reaction sequences)
          - Wikimedia: For STRUCTURES, ANATOMY, PHOTOGRAPHS (e.g., cell diagrams, molecular structures, equipment photos)
          
       D. Do NOT provide any URLs - they will be replaced automatically with Wikimedia images.` : `
       B. RESTRICTION: NO REAL IMAGES OR EXTERNAL MEDIA
          - STRICTLY DO NOT generate any <<IMAGE: ...>> placeholders.
          - STRICTLY DO NOT provide any image URLs.
          - Use Mermaid diagrams ONLY for all visualizations.
          
       C. MERMAID DIAGRAMS ONLY:
          - Rely entirely on Mermaid diagrams to visualize concepts, processes, and structures.
          - Ensure text in diagrams is descriptive enough to substitute for real images.`

    const contentPrompt = `You are a specialized tutor. Write a STRICTLY DETAILED educational guide for the topic: "${effectiveTopicTitle}".
          
    Context: Part of a course on "${effectiveSubjectTitle}".
    Difficulty: ${effectiveDifficulty}/5.
    Target Audience: Student.
    ${personalizationContext}

    REQUIREMENTS:
    1. Detailed Explanation: Cover EVERY SINGLE aspect of the topic thoroughly. Do not skip small points.
    
    2. MARKDOWN FORMATTING (CRITICAL - MUST FOLLOW EXACTLY):
       - Use ## for main sections (MUST have a space after ##)
       - Use ### for subsections (MUST have a space after ###)
       - EVERY heading MUST be on its OWN LINE
       - ALWAYS put TWO blank lines before EVERY heading
       - ALWAYS put ONE blank line after EVERY heading
       - NEVER place a heading immediately after other text on the same line
       - NEVER place a heading at the end of a paragraph
       - DO NOT use HTML tags like <br>, <p>, <div>. Use Markdown for ALL formatting.
       - Use STANDARD NEWLINES (\n) for line breaks. Do NOT use <br>.
       
       WRONG EXAMPLES:
       - "Some text ## Heading" (heading on same line as text)
       - "Some equation $x=1$ ## Heading" (heading after equation)
       - "##Heading" (no space after ##)
       
       CORRECT FORMAT (follow exactly):
       
       Previous paragraph or content ends here.
       
       
       ## Main Section Title
       
       Content paragraph here with full explanation...
       
       
       ### Subsection Title
       
       More detailed content...
       
       - Use bullet points with proper spacing
       
    3. Real Life Example: Provide a concrete, detailed, and relatable real-world analogy or example.
    4. Code/Math/Chemistry:
       - Use Markdown code blocks (\`\`\`) for computer code ONLY (Python, JavaScript, etc.).
       - NEVER use LaTeX dollar signs ($, $$) for math or chemistry. They are BANNED.
       - Write ALL math using clean Unicode characters instead:
         * Superscripts: use ², ³, ⁴, ⁿ, ˣ (e.g., E = mc², x², aⁿ)
         * Subscripts: use ₀, ₁, ₂, ₃, ₙ (e.g., H₂O, CO₂, xₙ)
         * Greek: use α, β, γ, δ, θ, π, σ, Σ, Δ, λ, μ, Ω, φ, ψ
         * Operators: use ×, ÷, ±, ≠, ≤, ≥, ≈, √, ∞, ∫, ∑, ∏, ∂, ∇, →, ⟶, ⇒, ∈, ∉, ⊂, ∪, ∩
         * Fractions: write as a/b or (a + b) / c, NOT as LaTeX \\frac{}{}
         * Examples: "The quadratic formula is x = (-b ± √(b² - 4ac)) / 2a"
         * Examples: "F = G × (m₁ × m₂) / r²"
         * Examples: "∑ᵢ₌₁ⁿ aᵢ" or "Σ(i=1 to n) aᵢ"
       - For chemical equations: H₂O, NaCl, CO₂, CH₃COOH, Fe₂O₃
       - Make equations **bold** for emphasis when they are standalone.
    5. Visuals - CONTEXTUAL INTEGRATION IS CRITICAL:
       - Every visual MUST be directly relevant to the immediately surrounding text
       - ALWAYS introduce the visual with a sentence like "The following diagram illustrates..." or "As shown in the image below..."
       - Place visuals IMMEDIATELY after the concept they explain, not at random locations
       - After the visual, add a brief explanation of what the student should observe
       
       A. For DIAGRAMS - Use Mermaid.js ONLY with these SUPPORTED types:
          - Use code block with language "mermaid"
          - Line 1: ALWAYS add title: %%title: Your Descriptive Title Here
          - Line 2: ALWAYS add description: %%desc: Brief explanation of what this diagram shows
          - Do NOT add any other comments
          - Keep labels short and clear
          
          SYNTAX RULES (CRITICAL - avoid parse errors):
          - For subgraph labels with spaces or special characters: subgraph id["Label Text"]
          - For node labels with special characters: A["Label (with parens)"]
          - Do NOT use parentheses () directly in labels without quotes
          - WRONG: subgraph Phase One (Setup)
          - RIGHT: subgraph phase1["Phase One (Setup)"]
          
          Example format:
          \`\`\`mermaid
          %%title: User Authentication Flow
          %%desc: This flowchart illustrates how user credentials are validated and sessions are created.
          flowchart TD
            A[Login] --> B{Valid?}
            subgraph auth["Authentication Layer"]
              B --> C[Token]
            end
          \`\`\`
          
          SUPPORTED DIAGRAM TYPES (USE ONLY THESE):
          * flowchart TD/LR - for processes, algorithms, workflows, decision trees, activities
          * pie - for market share, budget breakdown, survey results
          * sequenceDiagram - for communication flows, API calls, protocols
          * classDiagram - for OOP concepts, class relationships (use simple syntax)
          * erDiagram - for database schemas, data models
          * gantt - for project timelines, schedules, planning
          * mindmap - for concept maps, brainstorming, topic overviews
          * stateDiagram-v2 - for state machines, lifecycles
          
          ⚠️ DO NOT USE THESE (NOT SUPPORTED):
          * componentDiagram (use flowchart instead)
          * deploymentDiagram (use flowchart instead)
          * usecaseDiagram (use flowchart instead)
          * activityDiagram (use flowchart instead)
          * timeline (use gantt instead)
          * quadrantChart (use pie or table instead)
          
          NODE LABEL RULES (CRITICAL):
          - ALWAYS quote labels with parentheses: A["Label (text)"]
          - WRONG: NH2[Amino Group (-NH2)]
          - RIGHT: NH2["Amino Group (-NH2)"]
          - Keep labels simple, avoid special characters
          
          CLASS DIAGRAM RULES:
          - Do NOT use enum keyword
          - Use simple class attributes without complex types
          - Example: class User { +name: string }
          
          FIELD-SPECIFIC VISUAL GUIDANCE:
          * Business: Use pie for market share, flowchart for processes
          * Computer Science: Use flowchart for algorithms, classDiagram for OOP, sequenceDiagram for protocols
          * Project Management: Use gantt for schedules, flowchart for workflows
          
${visualInstructions}
    6. Completeness: Do not refer to external sources. Explain it ALL here.
    7. Format: Return ONLY the content in Markdown format. Do not wrap in JSON.
    
    Topic Description: ${effectiveTopicDescription}`

    console.log(`Generating content for topic: ${effectiveTopicTitle} with Gemini`)

    const contentResponseData = await generateWithGemini([
          { role: 'system', content: 'You are an expert tutor. Provide comprehensive and exhaustive educational content.' },
          { role: 'user', content: contentPrompt }
    ], {
      apiKey: userApiKey
    })

    const contentJson = contentResponseData
    let rawContent = contentJson.choices?.[0]?.message?.content

    if (!rawContent) {
        throw new Error('AI returned empty content')
    }

    // Cleanup: Remove ```markdown wrapping if present
    rawContent = rawContent.replace(/^```markdown\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
    
    // Cleanup: Replace <br> tags with newlines
    rawContent = rawContent.replace(/<br\s*\/?>/gi, '\n')

    let finalContent = rawContent.trim()

    if (!finalContent) {
        throw new Error('AI returned empty content')
    }

    // === REPLACE IMAGE PLACEHOLDERS WITH WIKIMEDIA IMAGES ===
    // Find all <<IMAGE: query>> placeholders and replace with real Wikimedia URLs
    const imagePlaceholderRegex = /<<IMAGE:\s*([^>]+)>>/g;
    const placeholderMatches = [...finalContent.matchAll(imagePlaceholderRegex)];

    if (placeholderMatches.length > 0) {
        console.log(`[Content] Processing ${placeholderMatches.length} image placeholders for topic ${topicId}`);
        
        for (const match of placeholderMatches) {
            const fullPlaceholder = match[0];
            const searchQuery = match[1].trim();
            
            console.log(`[Content] Searching Wikimedia for: "${searchQuery}"`);
            const imageUrl = await searchWikimediaImage(searchQuery);
            
            if (imageUrl) {
                // Replace placeholder with actual markdown image
                const markdownImage = `![${searchQuery}](${imageUrl})`;
                finalContent = finalContent.replace(fullPlaceholder, markdownImage);
                console.log(`[Content] Replaced placeholder with Wikimedia image`);
            } else {
                // Remove placeholder if no image found (graceful fallback)
                finalContent = finalContent.replace(fullPlaceholder, '');
                console.log(`[Content] No image found, removed placeholder`);
            }
        }
    }
    
    // Also validate any existing markdown images (in case AI still provides URLs)
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const existingImages = [...finalContent.matchAll(imgRegex)];
    
    for (const match of existingImages) {
        const fullTag = match[0];
        const url = match[2];
        
        // Skip Wikimedia URLs (they're reliable) and data URLs
        if (url.includes('wikimedia.org') || url.startsWith('data:')) {
            continue;
        }
        
        // Validate other URLs
        const isValid = await validateImageUrl(url);
        if (!isValid) {
            console.warn(`[Content] Removing broken image: ${url.slice(0, 50)}...`);
            finalContent = finalContent.replace(fullTag, '');
        }
    }

    // Update the topic with the new content
    const writer = topicAccess.adminClient || supabase
    const { error: updateError } = await writer
        .from('topics')
        .update({ content: finalContent })
        .eq('id', topicId)

    if (updateError) {
        console.error('Error updating topic content:', updateError)
        throw new Error('Failed to save generated content')
    }

    return NextResponse.json({
      success: true,
      content: finalContent
    })

  } catch (error) {
    console.error('Error generating topic content:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}

// Helper to validate if an image URL is accessible
async function validateImageUrl(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(url, { 
            method: 'HEAD', 
            signal: controller.signal,
            headers: { 'User-Agent': 'Learnify/1.0' }
        });
        
        clearTimeout(timeoutId);
        
        // Check if content-type is an image (optional but good) or just status ok
        return response.ok; 
    } catch (error) {
        console.log(`[Content] Validation failed for ${url}: ${error.message}`);
        return false;
    }
}
