'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Brain, Sparkles, Network, TrendingUp, Github, Chrome, Play, ArrowRight, BookOpen, Layers } from 'lucide-react'
import { motion, useScroll, useTransform, useSpring, useMotionValue, useMotionTemplate } from 'framer-motion'
import { GoogleLogo } from '@/components/ui/google-logo'
import { ThemeToggle } from '@/components/sub-components/theme-toggle'
import Image from 'next/image'

export default function LandingPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  
  // Mouse interaction hooks
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const mouseXPx = useMotionTemplate`${mouseX}px`
  const mouseYPx = useMotionTemplate`${mouseY}px`

  function handleMouseMove({ clientX, clientY }) {
    mouseX.set(clientX)
    mouseY.set(clientY)
  }

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    checkUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) console.error('Error signing in:', error.message)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
          className="flex items-center gap-2 text-muted-foreground"
        >
          <Brain className="h-6 w-6 text-primary" />
          <span className="text-lg font-medium">Loading Learnify...</span>
        </motion.div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary relative overflow-hidden group"
      onMouseMove={handleMouseMove}
    >
      {/* Interactive Mouse Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Dot Pattern Background */}
        <div className="absolute inset-0 z-0 opacity-100" style={{
            backgroundImage: 'radial-gradient(var(--pattern-fg) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
        }}></div>
        <motion.div 
          className="absolute rounded-full bg-primary/40 blur-[100px] opacity-60 will-change-transform mix-blend-multiply dark:mix-blend-screen"
          style={{
             left: mouseXPx,
             top: mouseYPx,
             height: '400px',
             width: '400px',
             transform: 'translate(-50%, -50%)'
          }}
        />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/30 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen opacity-50 animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen opacity-50 animate-blob animation-delay-2000"></div>
      </div>

      {/* Top Navigation - Floating Glass */}
      <motion.nav 
        initial={{ y: -100, x: "-50%", opacity: 0 }}
        animate={{ y: 0, x: "-50%", opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="fixed top-[calc(1.5rem+env(safe-area-inset-top))] left-1/2 w-[90%] max-w-5xl z-50 rounded-full"
      >
        <div className="glass rounded-full px-6 py-3 flex justify-between items-center shadow-2xl transition-all hover:bg-background/80 relative">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' })
            router.push('/')
          }}>
            <Image src="/icons/icon-192x192.png" alt="Learnify Logo" width={32} height={32} className="h-8 w-8 rounded-full" />
            <span className="text-lg font-bold tracking-tight text-foreground hidden sm:inline">Learnify</span>
          </div>
          <div className="hidden md:flex items-center gap-8 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <a href="#features" className="text-sm font-medium text-zinc-950 dark:text-muted-foreground hover:text-primary transition-all hover:scale-105">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-zinc-950 dark:text-muted-foreground hover:text-primary transition-all hover:scale-105">Methodology</a>
            <Button 
                variant="ghost" 
                onClick={() => router.push('/resource-hub')}
                className="text-sm font-medium text-zinc-950 dark:text-muted-foreground hover:text-primary transition-all hover:scale-105 p-0 h-auto bg-transparent hover:bg-transparent"
            >
                Resource Hub
            </Button>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {user ? (
               <div className="flex items-center gap-4">
                 <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-white/5" />
                 <Button size="sm" onClick={() => router.push('/dashboard')} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 shadow-lg shadow-primary/25 transition-all hover:scale-105">
                   Open Dashboard
                 </Button>
               </div>
            ) : (
              <>
                 <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-white/5" />
                <Button variant="ghost" size="sm" onClick={() => router.push('/login')} className="text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-full">
                  Sign In
                </Button>
                <Button size="sm" onClick={() => router.push('/signup')} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 shadow-lg shadow-primary/25 transition-all hover:scale-105">
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 px-6">


        <div className="container mx-auto max-w-5xl text-center z-10 relative">


            <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.2 }}
               className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider mb-8 hover:bg-primary/20 transition-colors cursor-default"
            >
              <Sparkles className="h-3 w-3" />
              <span>Next Gen Learning</span>
            </motion.div>
            
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-foreground leading-[1.1] mb-8 overflow-hidden">
              <motion.span 
                 initial={{ y: "100%" }}
                 animate={{ y: 0 }}
                 transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                 className="block"
              >
                Master complex topics with
              </motion.span>
               <br className="hidden md:block"/>
              <motion.span 
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-blue-600 to-violet-600 animate-gradient bg-300% text-glow"
              >
                AI & Spaced<br className="sm:hidden" /><span className="hidden sm:inline"> </span>R<Typewriter text="epetition." />
              </motion.span>
            </h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-12"
            >
              Learnify transforms anything into a personalized knowledge graph. 
              Let AI structure your curriculum while valid scientific methods ensure you never forget.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            >
              {user ? (
                <Button size="lg" onClick={() => router.push('/dashboard')} className="h-14 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all shadow-lg w-full sm:w-auto rounded-full font-semibold">
                  <Play className="mr-2 h-5 w-5" />
                  Continue Learning
                </Button>
              ) : (
                <>
                  <Button size="lg" onClick={() => router.push('/signup')} className="h-14 px-8 text-base bg-foreground text-background hover:bg-foreground/90 hover:scale-105 transition-all shadow-lg w-full sm:w-auto rounded-full font-semibold">
                    <GoogleLogo className="mr-2 h-5 w-5" />
                    Start Learning Free
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => router.push('/login')} className="h-14 px-8 text-base glass border-foreground/10 hover:bg-foreground/5 hover:text-foreground hover:border-foreground/20 hover:scale-105 transition-all w-full sm:w-auto rounded-full">
                    <Github className="mr-2 h-5 w-5" />
                    GitHub
                  </Button>
                </>
              )}
            </motion.div>

            {/* Hero Stats/Social Proof (Optional placeholder) */}
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 0.8, duration: 1 }}
               className="mt-20 pt-10 border-t border-foreground/5 flex justify-center gap-12 text-muted-foreground opacity-60 grayscale hover:grayscale-0 transition-all duration-500"
            >
               <div className="flex items-center gap-2"><Layers className="h-5 w-5"/> <span>Dynamic Graphs</span></div>
               <div className="flex items-center gap-2"><Brain className="h-5 w-5"/> <span>AI Powered</span></div>
               <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5"/> <span>Smart Review</span></div>
            </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 relative">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Everything you need to <span className="text-primary">excel</span></h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">We use spaced repetition algorithms to create the ultimate learning engine.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Brain className="h-8 w-8" />}
              title="AI Curriculum Generation"
              description="Drop in a topic, and watch as our AI architects a complete dependency graph and study plan instantly."
              delay={0}
            />
            <FeatureCard
              icon={<Network className="h-8 w-8" />}
              title="Interactive Graphs"
              description="Don't just read—explore. Visualize relationships between concepts to build stronger mental models."
              delay={0.2}
            />
            <FeatureCard
              icon={<TrendingUp className="h-8 w-8" />}
              title="Spaced Repetition"
              description="Our SM-2 based algorithm schedules reviews at the perfect moment to maximize long-term retention."
              delay={0.4}
            />
          </div>
        </div>
      </section>

      {/* How It Works - "Glass Windows" */}
      <section id="how-it-works" className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 -skew-y-3 transform origin-top-left scale-110"></div>
        <div className="container mx-auto max-w-5xl relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-24 tracking-tight">Structured for Success</h2>
          
          <div className="space-y-24">
            <FeatureRow 
                number="01" 
                title="Define Your Goal" 
                desc="Tell Learnify what you want to master. Python, Astrophysics, or maybe Cooking? We handle the rest."
                icon={<BookOpen className="h-6 w-6 text-primary"/>}
                image="/Define_your_goal.png"
                align="left"
            />
            <FeatureRow 
                number="02" 
                title="Generate The Path" 
                desc="Our AI agents break down the subject into atomic concepts, creating a dependency tree that ensures you learn in the right order."
                icon={<Network className="h-6 w-6 text-primary"/>}
                image="/Generate the path.png"
                align="right"
            />
             <FeatureRow 
                number="03" 
                title="Master & Retain" 
                desc="Engage with interactive lessons. Then, our Spaced Repetition System acts as your personal tutor, quizzing you right before you forget."
                icon={<Sparkles className="h-6 w-6 text-primary"/>}
                image="/Master_retain.png"
                align="left"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6">
        <div className="container mx-auto max-w-4xl text-center relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20 blur-3xl opacity-30 rounded-full"></div>
          <motion.div 
             whileHover={{ scale: 1.01 }}
             transition={{ type: "spring", stiffness: 400, damping: 10 }}
             className="relative z-10 bg-card/30 backdrop-blur-xl border border-white/5 p-6 md:p-12 rounded-3xl overflow-hidden shadow-2xl"
          >
             <div className="absolute top-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
             
             <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight text-foreground">Start learning smarter, today.</h2>
             <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto">Join the new era of self-education. No credit card required to start.</p>
             <Button size="lg" onClick={() => router.push('/signup')} className="h-12 md:h-16 px-6 md:px-10 text-base md:text-lg bg-primary hover:bg-primary/90 text-white rounded-full shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                Get Started Free <ArrowRight className="ml-2 h-5 w-5"/>
              </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6 bg-background relative z-10 pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="flex items-center gap-2">
            <Image src="/icons/icon-192x192.png" alt="Learnify Logo" width={24} height={24} className="h-6 w-6 rounded-full grayscale opacity-80" />
            <span className="font-semibold text-muted-foreground">Learnify</span>
           </div>
          <p className="text-sm text-muted-foreground/60">&copy; 2025 Learnify Inc. Built for the future of learning.</p>
        </div>
      </footer>
    </div>
  )
}

const Typewriter = ({ text, delay }) => {
  const [currentText, setCurrentText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isDeleting && currentIndex < text.length) {
        setCurrentText(prev => prev + text[currentIndex])
        setCurrentIndex(prev => prev + 1)
      } else if (isDeleting && currentIndex > 0) {
        setCurrentText(prev => prev.slice(0, -1))
        setCurrentIndex(prev => prev - 1)
      } else if (!isDeleting && currentIndex === text.length) {
        setTimeout(() => setIsDeleting(true), 2000) // Wait before deleting
      } else if (isDeleting && currentIndex === 0) {
        setIsDeleting(false)
      }
    }, 200)
    
    return () => clearTimeout(timeout)
  }, [currentIndex, isDeleting, text])
  
  return (
    <span className="inline-grid text-left">
      <span className="invisible col-start-1 row-start-1">{text}</span>
      <span className="col-start-1 row-start-1">
        {currentText}
        <span className="animate-pulse ml-1 inline-block bg-primary w-1 h-[1em] align-middle" />
      </span>
    </span>
  )
}

function FeatureCard({ icon, title, description, delay }) {
  return (
    <motion.div 
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay }}
        whileHover={{ y: -5, transition: { duration: 0.2 } }}
        className="glass-card p-8 rounded-2xl group cursor-default"
    >
      <div className="mb-6 p-3 bg-primary/10 w-fit rounded-xl text-primary group-hover:text-primary-foreground group-hover:bg-primary transition-colors duration-300 ring-1 ring-primary/20">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-foreground group-hover:text-glow transition-all">{title}</h3>
      <p className="text-muted-foreground leading-relaxed group-hover:text-muted-foreground/80">{description}</p>
    </motion.div>
  )
}

function FeatureRow({ number, title, desc, icon, image, align }) {
    return (
        <motion.div 
           initial={{ opacity: 0, x: align === 'left' ? -50 : 50 }}
           whileInView={{ opacity: 1, x: 0 }}
           viewport={{ once: true, margin: "-100px" }}
           transition={{ duration: 0.8, ease: "easeOut" }}
           className={`flex flex-col md:flex-row items-center gap-12 ${align === 'right' ? 'md:flex-row-reverse' : ''}`}
        >
            <div className="flex-1 space-y-6">
                <div className="flex items-center gap-4 mb-2">
                     <span className="text-6xl font-black text-foreground/20 select-none">{number}</span>
                     <div className="h-px bg-foreground/20 flex-1"></div>
                </div>
                <h3 className="text-3xl font-bold flex items-center gap-3">
                   {title}
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                    {desc}
                </p>
            </div>
            <div className="flex-1 w-full md:w-auto flex justify-center">
                 <motion.div 
                    whileHover={{ scale: 1.05, rotate: 1 }}
                    className="w-full max-w-sm aspect-square bg-gradient-to-br from-white/5 to-transparent rounded-3xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all shadow-2xl"
                 >
                    <div className="absolute inset-0 bg-primary/20 blur-[80px] group-hover:bg-primary/30 transition-all duration-700"></div>
                     
                     {icon && !image && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-background/80 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-xl group-hover:scale-110 transition-transform duration-500">
                                {icon}
                            </div>
                        </div>
                     )}

                     {image && (
                       <Image 
                         src={image} 
                         alt={title} 
                         fill
                         className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105"
                       />
                     )}
                 </motion.div>
            </div>
        </motion.div>
    )
}
