import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { userSettingsRequestSchema, parseOr400 } from '@/lib/validation/schemas'

function mask(key) {
  if (!key) return null
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}

export async function GET(request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: secrets, error: fetchError } = await supabase
      .from('user_secrets')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (fetchError) {
      console.error('Error fetching user settings:', fetchError)
    }

    return NextResponse.json({
      hasGeminiKey: !!secrets?.gemini_api_key,
      maskedGeminiKey: mask(secrets?.gemini_api_key),
      hasAnthropicKey: !!secrets?.anthropic_api_key,
      maskedAnthropicKey: mask(secrets?.anthropic_api_key),
      // Endpoint URL and model list are configuration, not secrets.
      openaiCompatBaseUrl: secrets?.openai_compat_base_url || '',
      openaiCompatModels: secrets?.openai_compat_models || '',
      hasOpenaiCompatKey: !!secrets?.openai_compat_api_key
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

    const parsed = parseOr400(userSettingsRequestSchema, await request.json())
    if (parsed.error) {
      return NextResponse.json({ error: 'Invalid settings', details: parsed.error }, { status: 400 })
    }
    const body = parsed.data

    // Semantics: field omitted = unchanged; empty string = clear.
    const updates = {
      id: user.id,
      updated_at: new Date().toISOString()
    }
    const applyField = (bodyKey, column) => {
      if (body[bodyKey] !== undefined) {
        updates[column] = body[bodyKey] ? String(body[bodyKey]).trim() : null
      }
    }

    applyField('geminiApiKey', 'gemini_api_key')
    applyField('anthropicApiKey', 'anthropic_api_key')
    applyField('openaiCompatBaseUrl', 'openai_compat_base_url')
    applyField('openaiCompatApiKey', 'openai_compat_api_key')
    applyField('openaiCompatModels', 'openai_compat_models')

    const { error: updateError } = await supabase
      .from('user_secrets')
      .upsert(updates, { onConflict: 'id' })

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
