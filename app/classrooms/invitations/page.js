'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, LogIn, Mail, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatIst } from '@/lib/classrooms/format'

function ClassroomInvitationsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [invitations, setInvitations] = useState([])
  const [acceptingToken, setAcceptingToken] = useState(null)

  const nextPath = useMemo(() => {
    const current = token ? `/classrooms/invitations?token=${encodeURIComponent(token)}` : '/classrooms/invitations'
    return encodeURIComponent(current)
  }, [token])

  const loadInvitations = async () => {
    const response = await fetch('/api/classrooms/invitations')
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load invitations')
    }

    setInvitations(data.invitations || [])
  }

  useEffect(() => {
    const bootstrap = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      setUser(currentUser || null)

      if (!currentUser) {
        setLoading(false)
        return
      }

      try {
        await loadInvitations()
      } catch (error) {
        toast.error(error.message)
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  useEffect(() => {
    if (!user || !token) return

    const match = invitations.find((invite) => invite.id === token)
    if (match) return

    const autoAccept = async () => {
      setAcceptingToken(token)
      try {
        const response = await fetch(`/api/classrooms/invitations/${token}/accept`, {
          method: 'POST'
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to accept invite')
        }

        toast.success('Classroom joined')
        router.push(`/classrooms/${data.classroomId}`)
      } catch (error) {
        setAcceptingToken(null)
      }
    }

    autoAccept()
  }, [user, token, invitations])

  const acceptInvite = async (inviteToken) => {
    setAcceptingToken(inviteToken)
    try {
      const response = await fetch(`/api/classrooms/invitations/${inviteToken}/accept`, {
        method: 'POST'
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invite')
      }

      toast.success('Classroom joined')
      router.push(`/classrooms/${data.classroomId}`)
    } catch (error) {
      toast.error(error.message)
      setAcceptingToken(null)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading invitations...</div>
  }

  if (!user) {
    return (
      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle>Sign in to review invitations</CardTitle>
          <CardDescription>Use the invited email address so the classroom invite can be claimed correctly.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
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
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Classroom Invitations</h1>
        <p className="text-muted-foreground">Accept an invitation to join a teacher-managed classroom.</p>
      </div>

      {invitations.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>No pending invitations</CardTitle>
            <CardDescription>You will see new classroom invitations here.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {invitations.map((invite) => (
            <Card key={invite.id} className="glass-card border-white/10">
              <CardHeader>
                <CardTitle>{invite.classrooms?.name || 'Classroom invite'}</CardTitle>
                <CardDescription>{invite.classrooms?.description || 'No description provided.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Expires {formatIst(invite.expires_at)} IST
                </div>
                <Button onClick={() => acceptInvite(token || invite.id)} disabled={acceptingToken === (token || invite.id)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {acceptingToken === (token || invite.id) ? 'Joining...' : 'Join Classroom'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
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
