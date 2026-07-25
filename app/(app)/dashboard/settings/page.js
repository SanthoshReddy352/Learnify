'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Key, Save, Server } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ReminderSettings from '@/components/settings/ReminderSettings'

export default function SettingsPage() {
  const router = useRouter()
  const [fetching, setFetching] = useState(true)
  const [loading, setLoading] = useState(false)

  // Existing (masked) state from the server
  const [current, setCurrent] = useState({
    hasGeminiKey: false,
    maskedGeminiKey: '',
    hasAnthropicKey: false,
    maskedAnthropicKey: '',
    openaiCompatBaseUrl: '',
    openaiCompatModels: '',
    hasOpenaiCompatKey: false
  })

  // Pending edits (empty = unchanged)
  const [geminiKey, setGeminiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [compatBaseUrl, setCompatBaseUrl] = useState('')
  const [compatApiKey, setCompatApiKey] = useState('')
  const [compatModels, setCompatModels] = useState('')

  useEffect(() => {
    fetchCurrentSettings()
  }, [])

  const fetchCurrentSettings = async () => {
    try {
      const response = await fetch('/api/user/settings')
      const data = await response.json()

      if (response.ok) {
        setCurrent(data)
        setCompatBaseUrl(data.openaiCompatBaseUrl || '')
        setCompatModels(data.openaiCompatModels || '')
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setFetching(false)
    }
  }

  const hasChanges =
    geminiKey.trim() ||
    anthropicKey.trim() ||
    compatApiKey.trim() ||
    compatBaseUrl.trim() !== (current.openaiCompatBaseUrl || '') ||
    compatModels.trim() !== (current.openaiCompatModels || '')

  const handleSave = async () => {
    if (!hasChanges) {
      toast.error('Nothing to save yet')
      return
    }

    setLoading(true)
    try {
      // Only send fields the user actually changed; empty string clears.
      const payload = {}
      if (geminiKey.trim()) payload.geminiApiKey = geminiKey.trim()
      if (anthropicKey.trim()) payload.anthropicApiKey = anthropicKey.trim()
      if (compatApiKey.trim()) payload.openaiCompatApiKey = compatApiKey.trim()
      if (compatBaseUrl.trim() !== (current.openaiCompatBaseUrl || '')) {
        payload.openaiCompatBaseUrl = compatBaseUrl.trim()
      }
      if (compatModels.trim() !== (current.openaiCompatModels || '')) {
        payload.openaiCompatModels = compatModels.trim()
      }

      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Settings saved successfully!')
        setGeminiKey('')
        setAnthropicKey('')
        setCompatApiKey('')
        await fetchCurrentSettings()
      } else {
        toast.error(data.details || data.error || 'Failed to save settings')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  const MaskedKeyBanner = ({ label, masked }) => (
    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-mono text-sm mt-1">{masked}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard')}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Settings
            </h1>
            <p className="text-muted-foreground">Manage your account preferences</p>
          </div>
        </div>

        {/* Reminders + weekly goal (Plan P11) */}
        <div className="mb-6">
          <ReminderSettings />
        </div>

        {/* AI Providers Card */}
        <Card className="border-border bg-foreground/5 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>AI Providers</CardTitle>
            </div>
            <CardDescription>
              Bring your own keys. Your configured providers are used before the platform&apos;s
              built-in defaults, and Learnify automatically falls back to the next available
              provider if one fails. Keys are stored in a private, owner-only table and never
              shown to anyone else.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fetching ? (
              <div className="text-center text-muted-foreground py-4">Loading...</div>
            ) : (
              <>
                {/* Gemini */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-lg font-semibold border-b border-border pb-2">Google Gemini</h3>
                  {current.hasGeminiKey && (
                    <MaskedKeyBanner label="Current Gemini key (masked)" masked={current.maskedGeminiKey} />
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="gemini-key">
                      {current.hasGeminiKey ? 'Update Gemini key' : 'Gemini API key'}
                    </label>
                    <Input
                      id="gemini-key"
                      type="password"
                      placeholder="AIzaSy..."
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="font-mono bg-foreground/5 border-border"
                    />
                    <p className="text-xs text-muted-foreground">
                      Get one from{' '}
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Google AI Studio
                      </a>. Used for curriculum, content, flashcards, and doubt chat.
                    </p>
                  </div>
                </div>

                {/* Anthropic */}
                <div className="space-y-4 pt-4">
                  <h3 className="text-lg font-semibold border-b border-border pb-2">Anthropic (Claude)</h3>
                  {current.hasAnthropicKey && (
                    <MaskedKeyBanner label="Current Anthropic key (masked)" masked={current.maskedAnthropicKey} />
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="anthropic-key">
                      {current.hasAnthropicKey ? 'Update Anthropic key' : 'Anthropic API key (optional)'}
                    </label>
                    <Input
                      id="anthropic-key"
                      type="password"
                      placeholder="sk-ant-..."
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      className="font-mono bg-foreground/5 border-border"
                    />
                  </div>
                </div>

                {/* OpenAI-compatible endpoint */}
                <div className="space-y-4 pt-4">
                  <h3 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    Custom OpenAI-compatible endpoint
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Point Learnify at any OpenAI-compatible server: Ollama, LM Studio, OpenRouter,
                    Groq, vLLM, and similar. Both the base URL and at least one model id are required
                    for the endpoint to be used.
                  </p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="compat-url">Base URL</label>
                    <Input
                      id="compat-url"
                      type="url"
                      placeholder="https://openrouter.ai/api/v1 or http://localhost:11434/v1"
                      value={compatBaseUrl}
                      onChange={(e) => setCompatBaseUrl(e.target.value)}
                      className="font-mono bg-foreground/5 border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="compat-models">Model ids (comma-separated, tried in order)</label>
                    <Input
                      id="compat-models"
                      type="text"
                      placeholder="deepseek/deepseek-chat, llama3.3"
                      value={compatModels}
                      onChange={(e) => setCompatModels(e.target.value)}
                      className="font-mono bg-foreground/5 border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="compat-key">
                      {current.hasOpenaiCompatKey ? 'Update endpoint API key (already set)' : 'Endpoint API key (optional for local servers)'}
                    </label>
                    <Input
                      id="compat-key"
                      type="password"
                      placeholder="sk-..."
                      value={compatApiKey}
                      onChange={(e) => setCompatApiKey(e.target.value)}
                      className="font-mono bg-foreground/5 border-border"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={loading || !hasChanges}
                  className="w-full mt-8"
                >
                  {loading ? (
                    <>Saving...</>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save AI Provider Settings
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground mt-4">
                  ⚠️ Your API keys are stored in a private table only you can read, and are used
                  only for AI generation features. You are responsible for any costs associated
                  with your API usage. Leave a field blank to keep its current value.
                </p>

                {/* Guide Section */}
                <div className="mt-8 pt-6 border-t border-border">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                      Google AI Studio
                    </h3>
                    <div className="space-y-4 text-sm text-muted-foreground">
                      <div className="relative z-10 aspect-video w-full rounded-lg overflow-hidden border border-border bg-black/50">
                        <iframe
                          width="100%"
                          height="100%"
                          src="https://www.youtube-nocookie.com/embed/OyHQH1Htz8I"
                          title="How to create Google API Key"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-mono text-xs font-bold">1</div>
                        <p>
                          Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Google AI Studio</a>.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-mono text-xs font-bold">2</div>
                        <p>Click <span className="text-foreground font-medium">&quot;Create API key&quot;</span>.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
