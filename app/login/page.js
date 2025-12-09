'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Brain, Github, ArrowLeft, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { GoogleIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/sub-components/theme-toggle'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const supabase = createClient()

  useEffect(() => {
    // Listen for the app being opened by a deep link (Custom Scheme)
    App.addListener('appUrlOpen', async (data) => {
      // data.url will contain "com.learnify.app://auth-callback?code=..."
      if (data.url.includes('auth-callback')) {
        // Close the browser if open
        await Browser.close()

        const url = new URL(data.url)
        const code = url.searchParams.get('code')
        
        if (code) {
           toast.info('Authenticating...')
           const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
           
           if (!error) {
             toast.success('Successfully logged in!')
             router.push('/dashboard')
           } else {
             toast.error('Failed to exchange code: ' + error.message)
           }
        }
      }
    })
  }, [])

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      toast.success('Welcome back!')
      router.push('/dashboard')
    } catch (error) {
      toast.error(error.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = async (provider) => {
    // Determine Redirect URL based on Platform
    let redirectUrl = `${window.location.origin}/auth/callback`
    
    if (Capacitor.isNativePlatform()) {
      redirectUrl = 'com.learnify.app://auth-callback'
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    })

    if (error) {
      toast.error(error.message)
      return
    }

    if (data?.url) {
      if (Capacitor.isNativePlatform()) {
        try {
          await Browser.open({ url: data.url })
        } catch (e) {
          console.error("Browser open failed", e)
          // Fallback if browser plugin fails for some reason (though it shouldn't if installed)
           window.location.href = data.url
        }
      } else {
        window.location.href = data.url
      }
    }
  }

  return (
    <>
      <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="min-h-screen bg-background flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] selection:bg-primary/20 selection:text-primary relative overflow-hidden">
        {/* Decorative Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/')} 
          className="mb-8 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <Card className="glass-card border-white/5 shadow-2xl">
          <CardHeader className="space-y-1 text-center pb-8">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Brain className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                onClick={() => handleOAuthLogin('google')}
                className="glass border-white/10 hover:bg-white/5 hover:border-white/20"
              >
                <GoogleIcon className="mr-2 h-4 w-4" />
                Google
              </Button>
              <Button 
                variant="outline" 
                onClick={() => handleOAuthLogin('github')}
                className="glass border-white/10 hover:bg-white/5 hover:border-white/20"
              >
                <Github className="mr-2 h-4 w-4" />
                GitHub
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background/50 backdrop-blur-xl px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@example.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-white/5 border-white/10 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link 
                    href="/forgot-password" 
                    className="text-xs text-primary hover:text-primary/80 hover:underline underline-offset-4"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-white/5 border-white/10 focus:border-primary/50 text-foreground"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Sign In with Email
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 text-center text-sm text-muted-foreground">
            <div>
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-primary hover:text-primary/80 font-medium hover:underline underline-offset-4 transition-colors">
                Sign up
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
    </>
  )
}
