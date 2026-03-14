'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Link2, LogIn, School, ShieldCheck, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function ClassroomJoinContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const classroomId = searchParams.get('classroom')
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [classroom, setClassroom] = useState(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  const nextPath = useMemo(() => {
    const current = classroomId ? `/classrooms/join?classroom=${encodeURIComponent(classroomId)}` : '/classrooms/join'
    return encodeURIComponent(current)
  }, [classroomId])

  const profileNextPath = classroomId ? `/classrooms/join?classroom=${encodeURIComponent(classroomId)}` : '/classrooms/join'

  useEffect(() => {
    const bootstrap = async () => {
      if (!classroomId) {
        setError('Missing classroom link')
        setLoading(false)
        return
      }

      try {
        const supabase = createClient()
        const [userResult, classroomResponse] = await Promise.all([
          supabase.auth.getUser(),
          fetch(`/api/classrooms/join/${classroomId}`)
        ])
        const classroomData = await classroomResponse.json()

        setUser(userResult.data.user || null)

        if (!classroomResponse.ok) {
          throw new Error(classroomData.error || 'Failed to load classroom')
        }

        setClassroom(classroomData.classroom || null)
      } catch (bootstrapError) {
        setError(bootstrapError.message)
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [classroomId])

  const handleJoin = async () => {
    if (!classroomId) {
      return
    }

    setJoining(true)

    try {
      const response = await fetch(`/api/classrooms/join/${classroomId}`, {
        method: 'POST'
      })
      const data = await response.json()

      if (!response.ok) {
        if (data.code === 'PROFILE_INCOMPLETE') {
          toast.error('Complete your profile before joining this classroom')
          router.push(`/dashboard/profile?next=${encodeURIComponent(profileNextPath)}`)
          setJoining(false)
          return
        }

        throw new Error(data.error || 'Failed to join classroom')
      }

      toast.success(data.alreadyJoined ? 'You are already in this classroom' : 'Classroom joined')
      router.push(`/classrooms/${data.classroomId}`)
    } catch (joinError) {
      toast.error(joinError.message)
      setJoining(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading classroom link...</div>
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(15,23,42,0.92)_52%,rgba(14,165,233,0.14))] px-5 py-6 shadow-[0_24px_80px_-52px_rgba(16,185,129,0.72)] sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.18),transparent_30%)]" />
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/80">
            <Link2 className="h-3.5 w-3.5" />
            Classroom Join Link
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Join a classroom from the shared link</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
            Use the teacher&apos;s class link, sign in with your Learnify account, and complete your profile before you enter the classroom.
          </p>
        </div>
      </section>

      <Card className="rounded-[28px] border-white/10 bg-black/10">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{classroom?.name || 'Classroom link'}</CardTitle>
            {classroom && (
              <Badge variant="outline" className="border-emerald-400/20 bg-emerald-400/10 text-emerald-100">
                Open join
              </Badge>
            )}
          </div>
          <CardDescription>
            {classroom?.description || error || 'This classroom link is not available right now.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {classroom && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Before you join
              </div>
              <p className="mt-2 leading-6">
                Learnify checks your profile first. If required fields are missing, you will be redirected to complete them and then come back here.
              </p>
            </div>
          )}

          {user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <School className="h-4 w-4 text-primary" />
                Signed in as {user.email}
              </div>
              <Button onClick={handleJoin} disabled={!classroom || joining}>
                <ArrowRight className="mr-2 h-4 w-4" />
                {joining ? 'Joining...' : 'Join Classroom'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href={`/login?next=${nextPath}`}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/signup?next=${nextPath}`}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Account
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ClassroomJoinPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading classroom link...</div>}>
      <ClassroomJoinContent />
    </Suspense>
  )
}
