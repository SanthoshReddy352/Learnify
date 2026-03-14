'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2,
  ClipboardList,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatIst } from '@/lib/classrooms/format'

function ClassroomInvitationsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [invitations, setInvitations] = useState([])
  const [tokenInvitation, setTokenInvitation] = useState(null)
  const [tokenError, setTokenError] = useState('')
  const [acceptingKey, setAcceptingKey] = useState(null)

  const nextPath = useMemo(() => {
    const current = token ? `/classrooms/invitations?token=${encodeURIComponent(token)}` : '/classrooms/invitations'
    return encodeURIComponent(current)
  }, [token])

  const profileNextPath = token ? `/classrooms/invitations?token=${encodeURIComponent(token)}` : '/classrooms/invitations'

  const loadInvitations = async () => {
    const response = await fetch('/api/classrooms/invitations')
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load invitations')
    }

    setInvitations(data.invitations || [])
  }

  const loadTokenInvitation = async (inviteToken) => {
    if (!inviteToken) {
      setTokenInvitation(null)
      setTokenError('')
      return
    }

    try {
      const response = await fetch(`/api/classrooms/invitations/${inviteToken}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load invite')
      }

      setTokenInvitation(data.invitation || null)
      setTokenError('')
    } catch (error) {
      setTokenInvitation(null)
      setTokenError(error.message)
    }
  }

  const redirectToProfile = () => {
    router.push(`/dashboard/profile?next=${encodeURIComponent(profileNextPath)}`)
  }

  const acceptInvite = async (inviteToken) => {
    setAcceptingKey(inviteToken)

    try {
      const response = await fetch(`/api/classrooms/invitations/${inviteToken}/accept`, {
        method: 'POST'
      })
      const data = await response.json()

      if (!response.ok) {
        if (data.code === 'PROFILE_INCOMPLETE') {
          toast.error('Complete your profile before joining this classroom')
          setAcceptingKey(null)
          redirectToProfile()
          return
        }

        throw new Error(data.error || 'Failed to accept invite')
      }

      toast.success(data.alreadyJoined ? 'You are already in this classroom' : 'Classroom joined')
      router.push(`/classrooms/${data.classroomId}`)
    } catch (error) {
      toast.error(error.message)
      setAcceptingKey(null)
    }
  }

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const supabase = createClient()
        const { data: { user: currentUser } } = await supabase.auth.getUser()

        setUser(currentUser || null)

        if (currentUser) {
          await loadInvitations()
        }
      } catch (error) {
        toast.error(error.message)
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  useEffect(() => {
    loadTokenInvitation(token)
  }, [token])

  const visibleInvitations = useMemo(() => {
    if (!tokenInvitation) {
      return invitations
    }

    return invitations.filter((invite) => invite.classroom_id !== tokenInvitation.classroom_id)
  }, [invitations, tokenInvitation])

  if (loading) {
    return <div className="text-muted-foreground">Loading invitations...</div>
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(15,23,42,0.92)_55%,rgba(244,114,182,0.12))] px-5 py-6 shadow-[0_24px_80px_-52px_rgba(59,130,246,0.7)] sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(244,114,182,0.18),transparent_32%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/80">
              <ClipboardList className="h-3.5 w-3.5" />
              Classroom Invitations
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Join your classroom the clean way</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
              Review pending invitations, sign in with the invited email, and complete your profile before joining.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/15 bg-white/10 shadow-none">
              <CardHeader className="pb-2">
                <CardDescription className="text-white/65">Pending invites</CardDescription>
                <CardTitle className="text-3xl text-white">{invitations.length + (tokenInvitation ? 1 : 0)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/15 bg-white/10 shadow-none">
              <CardHeader className="pb-2">
                <CardDescription className="text-white/65">Invite email required</CardDescription>
                <CardTitle className="text-lg text-white">Use the matching account</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/15 bg-white/10 shadow-none">
              <CardHeader className="pb-2">
                <CardDescription className="text-white/65">Profile gate</CardDescription>
                <CardTitle className="text-lg text-white">Complete before join</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/15 bg-white/10 shadow-none">
              <CardHeader className="pb-2">
                <CardDescription className="text-white/65">Student flow</CardDescription>
                <CardTitle className="text-lg text-white">Email invite or class link</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {!user && (
        <Card className="rounded-[28px] border-white/10 bg-black/10">
          <CardHeader>
            <CardTitle>Sign in to review invitations</CardTitle>
            <CardDescription>
              {tokenInvitation?.emailHint
                ? `Use the invited email address (${tokenInvitation.emailHint}) so the classroom invite can be claimed correctly.`
                : 'Use the invited email address so the classroom invite can be claimed correctly.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
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
          </CardContent>
        </Card>
      )}

      {token && (
        <Card className="rounded-[28px] border-sky-400/20 bg-sky-500/5">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{tokenInvitation?.classrooms?.name || 'Invite from email link'}</CardTitle>
              <Badge variant="outline" className="border-sky-400/20 bg-sky-400/10 text-sky-100">
                Email link
              </Badge>
            </div>
            <CardDescription>
              {tokenInvitation
                ? tokenInvitation.classrooms?.description || 'Open this invite to join the classroom.'
                : tokenError || 'Checking your invite link.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokenInvitation ? (
              <>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>Expires {formatIst(tokenInvitation.expires_at)} IST</span>
                  {tokenInvitation.emailHint && <span>Invited email: {tokenInvitation.emailHint}</span>}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 text-foreground">
                    <Sparkles className="h-4 w-4 text-sky-300" />
                    Before joining
                  </div>
                  <p className="mt-2 leading-6">
                    Sign in with the invited email. If your profile is incomplete, you will be redirected to finish it first.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={() => acceptInvite(token)}
                    disabled={!user || acceptingKey === token}
                    className="sm:flex-1"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {acceptingKey === token ? 'Joining...' : 'Join from Email Invite'}
                  </Button>
                  <Button variant="outline" className="sm:flex-1" onClick={redirectToProfile}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Complete Profile
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground">
                {tokenError || 'Invite preview unavailable.'}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {user && visibleInvitations.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleInvitations.map((invite) => (
            <Card key={invite.id} className="rounded-[28px] border-white/10 bg-black/10">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{invite.classrooms?.name || 'Classroom invite'}</CardTitle>
                  <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                    Pending
                  </Badge>
                </div>
                <CardDescription>{invite.classrooms?.description || 'No description provided.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>Expires {formatIst(invite.expires_at)} IST</span>
                  <span>Received {formatIst(invite.created_at)}</span>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-muted-foreground">
                  Use your invited account. If your profile is incomplete, Learnify will send you to the profile form before finishing the join.
                </div>

                <Button onClick={() => acceptInvite(invite.id)} disabled={acceptingKey === invite.id}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {acceptingKey === invite.id ? 'Joining...' : 'Join Classroom'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {user && !tokenInvitation && visibleInvitations.length === 0 && (
        <Card className="rounded-[28px] border-white/10 bg-black/10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>No pending invitations</CardTitle>
            <CardDescription>You will see new classroom invitations here when a teacher sends them.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}

export default function ClassroomInvitationsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading invitations...</div>}>
      <ClassroomInvitationsContent />
    </Suspense>
  )
}
