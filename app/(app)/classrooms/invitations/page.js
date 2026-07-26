'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  CalendarClock,
  CheckCircle2,
  Link2,
  LogIn,
  Mail,
  ShieldCheck,
  UserPlus
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader, PageLoading, Panel } from '@/components/shared/page'
import { formatIst } from '@/lib/classrooms/format'

/** One invite card, shared by the email-link invite and the pending list. */
function InviteCard({
  name,
  description,
  badge,
  badgeClassName,
  meta,
  note,
  primaryAction,
  secondaryAction
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-lg">{name}</CardTitle>
          <Badge variant="outline" className={badgeClassName}>
            {badge}
          </Badge>
        </div>
        <CardDescription className="leading-6">{description}</CardDescription>
      </CardHeader>

      <CardContent className="mt-auto space-y-4">
        {meta.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {meta.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5">
                {item.icon && <item.icon className="h-3.5 w-3.5" />}
                {item.label}
              </span>
            ))}
          </div>
        )}

        {note && (
          <Panel className="flex gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="leading-6">{note}</p>
          </Panel>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {primaryAction}
          {secondaryAction}
        </div>
      </CardContent>
    </Card>
  )
}

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
    return <PageLoading showStats={false} rows={2} />
  }

  const pendingCount = visibleInvitations.length + (tokenInvitation ? 1 : 0)

  return (
    <>
      <PageHeader
        eyebrow="Invitations"
        eyebrowIcon={Mail}
        title="Classroom invitations"
        description="Accept an invite to join a classroom. Sign in with the email your teacher invited, and finish your profile first — both are required before you can enter."
        actions={
          <Button variant="outline" onClick={() => router.push('/classrooms')}>
            My classrooms
          </Button>
        }
      />

      {!user && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Sign in to review invitations</CardTitle>
            <CardDescription>
              {tokenInvitation?.emailHint
                ? `Use the invited email address (${tokenInvitation.emailHint}) so this invite can be claimed correctly.`
                : 'Use the invited email address so your invite can be claimed correctly.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href={`/login?next=${nextPath}`}>
                <LogIn className="mr-2 h-4 w-4" />
                Sign in
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/signup?next=${nextPath}`}>
                <UserPlus className="mr-2 h-4 w-4" />
                Create account
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {(token || pendingCount > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {token && (
            tokenInvitation ? (
              <InviteCard
                name={tokenInvitation.classrooms?.name || 'Classroom invite'}
                description={tokenInvitation.classrooms?.description || 'Open this invite to join the classroom.'}
                badge="Email link"
                badgeClassName="border-primary/30 bg-primary/10 text-primary"
                meta={[
                  { icon: CalendarClock, label: `Expires ${formatIst(tokenInvitation.expires_at)} IST` },
                  ...(tokenInvitation.emailHint
                    ? [{ icon: Mail, label: `Invited: ${tokenInvitation.emailHint}` }]
                    : [])
                ]}
                note="Sign in with the invited email. If your profile is incomplete you'll be sent to finish it first."
                primaryAction={
                  <Button
                    className="sm:flex-1"
                    onClick={() => acceptInvite(token)}
                    disabled={!user || acceptingKey === token}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {acceptingKey === token ? 'Joining…' : 'Join classroom'}
                  </Button>
                }
                secondaryAction={
                  <Button variant="outline" className="sm:flex-1" onClick={redirectToProfile}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Complete profile
                  </Button>
                }
              />
            ) : (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <CardTitle className="text-lg">Invite link unavailable</CardTitle>
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                      <Link2 className="mr-1.5 h-3 w-3" />
                      Email link
                    </Badge>
                  </div>
                  <CardDescription>{tokenError || 'Checking your invite link…'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Ask your teacher to send a fresh invite, or join from the class link instead.
                  </p>
                </CardContent>
              </Card>
            )
          )}

          {user && visibleInvitations.map((invite) => (
            <InviteCard
              key={invite.id}
              name={invite.classrooms?.name || 'Classroom invite'}
              description={invite.classrooms?.description || 'No description provided.'}
              badge="Pending"
              badgeClassName="border-primary/30 bg-primary/10 text-primary"
              meta={[
                { icon: CalendarClock, label: `Expires ${formatIst(invite.expires_at)} IST` },
                { icon: Mail, label: `Received ${formatIst(invite.created_at)}` }
              ]}
              note="Use your invited account. If your profile is incomplete, you'll finish it before the join completes."
              primaryAction={
                <Button
                  className="sm:flex-1"
                  onClick={() => acceptInvite(invite.id)}
                  disabled={acceptingKey === invite.id}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {acceptingKey === invite.id ? 'Joining…' : 'Join classroom'}
                </Button>
              }
            />
          ))}
        </div>
      )}

      {user && !tokenInvitation && visibleInvitations.length === 0 && (
        <EmptyState
          icon={Mail}
          title="No pending invitations"
          description="New classroom invitations show up here as soon as a teacher sends one. You can also join directly from a class link."
          action={
            <Button variant="outline" onClick={() => router.push('/classrooms')}>
              Back to my classrooms
            </Button>
          }
        />
      )}
    </>
  )
}

export default function ClassroomInvitationsPage() {
  return (
    <Suspense fallback={<PageLoading showStats={false} rows={2} />}>
      <ClassroomInvitationsContent />
    </Suspense>
  )
}
