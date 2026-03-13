'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { ArrowLeft, Github, Loader2, Mail, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { ThemeToggle } from '@/components/sub-components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { GoogleIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

function SignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const supabase = createClient()
  const nextPath = searchParams.get('next') || '/dashboard'

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session) {
        router.push(nextPath)
      }
    }

    checkUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || session) {
        router.push(nextPath)
      }
    })

    const appListener = App.addListener('appUrlOpen', async (data) => {
      if (!data.url.includes('auth-callback')) {
        return
      }

      await Browser.close()

      const url = new URL(data.url)
      const code = url.searchParams.get('code')

      if (!code) {
        return
      }

      toast.info('Authenticating...')
      const { error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        toast.error(`Failed to exchange code: ${error.message}`)
        return
      }

      toast.success('Successfully logged in!')
    })

    return () => {
      subscription.unsubscribe()
      appListener.then((handle) => handle.remove())
    }
  }, [nextPath, router, supabase.auth])

  const handleEmailSignup = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      let emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
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
      router.push(`/login?next=${encodeURIComponent(nextPath)}`)
    } catch (error) {
      toast.error(error.message || 'Failed to sign up')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = async (provider) => {
    let redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`

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

    if (!data?.url) {
      return
    }

    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url: data.url })
      } catch (browserError) {
        console.error('Browser open failed', browserError)
        window.location.href = data.url
      }
      return
    }

    window.location.href = data.url
  }

  return (
    <>
      <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="min-h-screen bg-background relative flex items-center justify-center overflow-hidden p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] selection:bg-primary/20 selection:text-primary">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute top-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-primary/10 opacity-50 blur-[120px] mix-blend-screen" />
          <div className="absolute bottom-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-accent/10 opacity-50 blur-[120px] mix-blend-screen" />
        </div>

        <div className="relative z-10 w-full max-w-md">
          <Button
            variant="ghost"
            onClick={() => router.push('/')}
            className="mb-8 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>

          <Card className="glass-card relative overflow-hidden border-white/5 shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

            <CardHeader className="space-y-1 pb-8 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
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
                  className="glass border-white/10 hover:border-white/20 hover:bg-white/5"
                >
                  <GoogleIcon className="mr-2 h-4 w-4" />
                  Google
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleOAuthLogin('github')}
                  className="glass border-white/10 hover:border-white/20 hover:bg-white/5"
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
                  <span className="bg-background/50 px-2 text-muted-foreground backdrop-blur-xl">
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
                    className="border-white/10 bg-white/5 text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50"
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
                    className="border-white/10 bg-white/5 text-foreground focus:border-primary/50"
                  />
                  <p className="text-xs text-muted-foreground">Must be at least 6 characters</p>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
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
                <Link
                  href={`/login?next=${encodeURIComponent(nextPath)}`}
                  className="font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                >
                  Sign in
                </Link>
              </div>
              <div className="text-xs text-muted-foreground/60">
                By clicking continue, you agree to our{' '}
                <a href="#" className="underline underline-offset-2 hover:text-foreground">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="underline underline-offset-2 hover:text-foreground">
                  Privacy Policy
                </a>
                .
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SignupContent />
    </Suspense>
  )
}
