import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user's API keys
    const { data: userData, error: fetchError } = await supabase
      .from('profiles')
      .select('gemini_api_key')
      .eq('id', user.id)
      .maybeSingle()

    if (fetchError) {
       console.error('Error fetching user settings:', fetchError)
       // Don't fail, just convert to null
    }

    // Return masked versions for security
    const geminiKey = userData?.gemini_api_key
    const maskedGeminiKey = geminiKey ? `${geminiKey.slice(0, 8)}...${geminiKey.slice(-4)}` : null

    return NextResponse.json({
      hasGeminiKey: !!geminiKey,
      maskedGeminiKey
    })

  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { geminiApiKey } = await request.json()
    
    const updates = {
        id: user.id,
        updated_at: new Date().toISOString()
    }

    // Validate and add Gemini Key if provided
    if (geminiApiKey !== undefined) {
        if (geminiApiKey && (typeof geminiApiKey !== 'string' || geminiApiKey.trim().length < 10)) {
            return NextResponse.json({ error: 'Invalid Gemini API key format' }, { status: 400 })
        }
        updates.gemini_api_key = geminiApiKey ? geminiApiKey.trim() : null
    }

    // Save API keys to database (upsert)
    const { error: updateError } = await supabase
      .from('profiles')
      .upsert(updates, {
        onConflict: 'id'
      })

    if (updateError) {
      console.error('Error saving API keys:', updateError)
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Settings saved successfully'
    })

  } catch (error) {
    console.error('Settings POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
