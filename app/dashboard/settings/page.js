'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Key, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [fetching, setFetching] = useState(true)
  const [loading, setLoading] = useState(false)
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [maskedKey, setMaskedKey] = useState('')


  useEffect(() => {
    fetchCurrentSettings()
  }, [])

  const fetchCurrentSettings = async () => {
    try {
      const response = await fetch('/api/user/settings')
      const data = await response.json()

      if (response.ok) {
        setHasExistingKey(data.hasGeminiKey)
        setMaskedKey(data.maskedGeminiKey || '')

      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setFetching(false)
    }
  }

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key')
      return
    }

    setLoading(true)
    try {
      const payload = {}
      if (apiKey.trim()) payload.geminiApiKey = apiKey

      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Settings saved successfully!')
        setApiKey('')
        await fetchCurrentSettings()
      } else {
        toast.error(data.error || 'Failed to save settings')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save API key')
    } finally {
      setLoading(false)
    }
  }

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

        {/* API Key Card */}
        <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>Gemini API Key</CardTitle>
            </div>
            <CardDescription>
              Enter your personal Gemini API key to use AI features. Get your key from{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google AI Studio
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fetching ? (
              <div className="text-center text-muted-foreground py-4">Loading...</div>
            ) : (
              <>
                {/* Gemini API Key */}
                <div className="space-y-4 pt-4">
                  <h3 className="text-lg font-semibold border-b border-white/10 pb-2">Gemini API Key</h3>
                  {hasExistingKey && (
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                      <p className="text-sm text-muted-foreground">Current Gemini Key (masked)</p>
                      <p className="font-mono text-sm mt-1">{maskedKey}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {hasExistingKey ? 'Update Gemini Key' : 'Enter Gemini Key'}
                    </label>
                    <Input
                      type="password"
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="font-mono bg-white/5 border-white/10"
                    />
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Required for generating curriculum and text content.
                  </div>
                </div>



                <Button
                  onClick={handleSave}
                  disabled={loading || !apiKey.trim()}
                  className="w-full mt-8"
                >
                  {loading ? (
                    <>Saving...</>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save API Keys
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground mt-4">
                  ⚠️ Your API keys are stored securely and used only for AI generation features.
                  You are responsible for any costs associated with your API usage.
                </p>

                {/* Guide Section */}
                <div className="mt-8 pt-6 border-t border-white/10">
                  
                  {/* Google AI Studio Guide */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-primary"></span>
                         Google AI Studio
                    </h3>
                    <div className="space-y-4 text-sm text-muted-foreground">
                        <div className="relative z-10 aspect-video w-full rounded-lg overflow-hidden border border-white/10 bg-black/50">
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
                        <p>Click <span className="text-foreground font-medium">"Create API key"</span>.</p>
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
