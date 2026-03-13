'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Brain, Github, ArrowLeft, Loader2, Mail, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { GoogleIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/sub-components/theme-toggle'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

export default function SignupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const supabase = createClient()

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      }
    }
    checkUser()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || session) {
        router.push('/dashboard')
      }
    })

    // Listen for the app being opened by a deep link (Custom Scheme)
    const appListener = App.addListener('appUrlOpen', async (data) => {
      // data.url will contain "com.learnify.app://auth-callback?code=..."
      if (data.url.includes('auth-callback')) {
        // Close the browser if open
        await Browser.close()

        const url = new URL(data.url)
        const code = url.searchParams.get('code')
        
        if (code) {
           toast.info('Authenticating...')
           const { error } = await supabase.auth.exchangeCodeForSession(code)
           
           if (!error) {
             toast.success('Successfully logged in!')
             // The onAuthStateChange listener will handle the redirect
           } else {
             toast.error('Failed to exchange code: ' + error.message)
           }
        }
      }
    })

    return () => {
      subscription.unsubscribe()
      appListener.then(handle => handle.remove())
    }
  }, [])

  const handleEmailSignup = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      let emailRedirectTo = `${window.location.origin}/auth/callback`
      if (Capacitor.isNativePlatform()) {
         emailRedirectTo = 'com.learnify.app://auth-callback'
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
        },
      })

      if (error) {
        throw error
      }

      toast.success('Check your email to confirm your account!')
      // Optionally redirect to a confirmation page or login
      router.push('/login')
    } catch (error) {
      toast.error(error.message || 'Failed to sign up')
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4 selection:bg-primary/20 selection:text-primary relative overflow-hidden">
        {/* Decorative Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        </div>

        <div className="w-full max-w-md relative z-10">
          <div className="pt-20"></div>

          <Card className="glass-card border-white/5 shadow-2xl relative overflow-hidden">
            {/* Subtle gradient overlay */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            
            <CardHeader className="space-y-1 text-center pb-8">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Create an account</CardTitle>
              <CardDescription className="text-muted-foreground">
                Start your journey to master any subject
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

              <form onSubmit={handleEmailSignup} className="space-y-4">
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
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-white/5 border-white/10 focus:border-primary/50 text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">Must be at least 6 characters</p>
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Sign Up with Email
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 text-center text-sm text-muted-foreground">
              <div>
                Already have an account?{' '}
                <Link href="/login" className="text-primary hover:text-primary/80 font-medium hover:underline underline-offset-4 transition-colors">
                  Sign in
                </Link>
              </div>
              <div className="text-xs text-muted-foreground/60">
                By clicking continue, you agree to our{' '}
                <a href="#" className="hover:text-foreground underline underline-offset-2">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="hover:text-foreground underline underline-offset-2">Privacy Policy</a>.
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    )
}
