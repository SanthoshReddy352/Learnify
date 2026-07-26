'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Copy,
  Link2,
  Mail,
  Send,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { PageHeader, PageLoading, Panel, StatCard, StatGrid } from '@/components/shared/page'
import { formatIst } from '@/lib/classrooms/format'

/** Dashed in-card placeholder for an empty roster or invite list. */
function ListEmpty({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export default function TeacherClassroomStudentsPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState(null)
  const [emailInput, setEmailInput] = useState('')
  const [generatedLinks, setGeneratedLinks] = useState([])
  const [skippedInvites, setSkippedInvites] = useState([])
  const [removingMember, setRemovingMember] = useState(null)
  const [revokingInviteId, setRevokingInviteId] = useState(null)

  const loadDetail = useCallback(async () => {
    try {
      const response = await fetch(`/api/teacher/classrooms/${params.classroomId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load classroom')
      }

      setDetail(data)
    } catch (error) {
      toast.error(error.message)
      router.push('/teacher/classrooms')
    } finally {
      setLoading(false)
    }
  }, [params.classroomId, router])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const activeMembers = useMemo(
    () => detail?.members?.filter((member) => member.status === 'active') || [],
    [detail]
  )
  const invitedMembers = useMemo(
    () => detail?.members?.filter((member) => member.status === 'invited') || [],
    [detail]
  )
  const pendingInvites = useMemo(
    () => detail?.invites?.filter((invite) => invite.status === 'pending') || [],
    [detail]
  )

  const handleInvite = async () => {
    if (!emailInput.trim()) {
      toast.error('Add at least one student email')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch(`/api/teacher/classrooms/${params.classroomId}/invites/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emails: emailInput })
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invites')
      }

      setGeneratedLinks(data.invites || [])
      setSkippedInvites(data.skipped || [])
      setEmailInput('')

      const createdCount = data.invites?.length || 0
      const skippedCount = data.skipped?.length || 0

      if (createdCount > 0 && skippedCount > 0) {
        toast.success(`${createdCount} invite(s) ready, ${skippedCount} skipped`)
      } else if (data.emailResult?.sent) {
        toast.success('Invites sent')
      } else {
        toast.success('Invite links created')
      }

      await loadDetail()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = async (url, label = 'Link copied') => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(label)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const handleRevokeInvite = async (inviteId) => {
    setRevokingInviteId(inviteId)

    try {
      const response = await fetch(`/api/teacher/classrooms/${params.classroomId}/invites/${inviteId}`, {
        method: 'DELETE'
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to revoke invite')
      }

      toast.success('Invite revoked')
      await loadDetail()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setRevokingInviteId(null)
    }
  }

  const handleRemoveStudent = async () => {
    if (!removingMember) {
      return
    }

    try {
      const response = await fetch(`/api/teacher/classrooms/${params.classroomId}/students/${removingMember.id}`, {
        method: 'DELETE'
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove student')
      }

      toast.success('Student removed from classroom')
      setRemovingMember(null)
      await loadDetail()
    } catch (error) {
      toast.error(error.message)
    }
  }

  if (loading || !detail) {
    return <PageLoading stats={3} rows={2} />
  }

  return (
    <>
      <PageHeader
        eyebrow="Student access"
        eyebrowIcon={Users}
        title="Roster and invites"
        description="Add students by email, share the class link, and keep pending invites clean. Students must finish their profile before they can enter."
        onBack={() => router.push(`/teacher/classrooms/${params.classroomId}`)}
        backLabel="Back to classroom"
      />

      <StatGrid className="xl:grid-cols-3">
        <StatCard label="Active students" value={activeMembers.length} icon={Users} />
        <StatCard
          label="Pending invites"
          value={pendingInvites.length}
          icon={Mail}
          hint="Emailed, not yet accepted"
        />
        <StatCard
          label="Claimed invites"
          value={invitedMembers.length}
          icon={UserPlus}
          hint="Accounts matched, profile pending"
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">Class link</CardTitle>
              <CardDescription>One reusable link — anyone with it can request to join this classroom.</CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Live
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input value={detail.shareLink || ''} readOnly className="font-mono text-xs sm:flex-1" />
          <div className="flex gap-2">
            <Button className="flex-1 sm:flex-none" onClick={() => copyLink(detail.shareLink, 'Class link copied')}>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => router.push(detail.shareLink.replace(window.location.origin, ''))}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Preview
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,380px)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="text-lg">Active students</CardTitle>
                  <CardDescription>Students who can currently access this classroom.</CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0">{activeMembers.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeMembers.length === 0 ? (
                <ListEmpty>
                  No active students yet. Invite students by email or share the class link above.
                </ListEmpty>
              ) : (
                activeMembers.map((member) => (
                  <Panel key={member.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="truncate font-medium">
                        {member.profile?.full_name || member.profile?.username || 'Student'}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {member.email || 'Email unavailable'}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{member.profile?.education_level || 'Education level not set'}</span>
                        <span>Joined {formatIst(member.joined_at)}</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRemovingMember(member)}
                    >
                      <UserMinus className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </Panel>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="text-lg">Pending invite emails</CardTitle>
                  <CardDescription>Only the newest active invite per email is kept.</CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0">{pendingInvites.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingInvites.length === 0 ? (
                <ListEmpty>
                  No pending invite emails. Students who join from the class link skip this list and land in the roster directly.
                </ListEmpty>
              ) : (
                pendingInvites.map((invite) => (
                  <Panel key={invite.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{invite.email}</span>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          Pending
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Sent {formatIst(invite.created_at)}</span>
                        <span>Expires {formatIst(invite.expires_at)}</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleRevokeInvite(invite.id)}
                      disabled={revokingInviteId === invite.id}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {revokingInviteId === invite.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  </Panel>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Invite by email</CardTitle>
              <CardDescription>One email per line, or separated by commas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder={'student1@example.com\nstudent2@example.com'}
                className="min-h-[160px] font-mono text-sm"
              />
              <Button className="w-full" onClick={handleInvite} disabled={submitting}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? 'Creating invites…' : 'Create invites'}
              </Button>
            </CardContent>
          </Card>

          {(generatedLinks.length > 0 || skippedInvites.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Latest invite results</CardTitle>
                <CardDescription>Copy a link directly if you need to share it outside email.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {generatedLinks.map((invite) => (
                  <Panel key={invite.email} className="space-y-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{invite.email}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Expires {formatIst(invite.expiresAt)} IST
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => copyLink(invite.inviteUrl, 'Invite link copied')}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy invite link
                    </Button>
                  </Panel>
                ))}

                {skippedInvites.map((invite) => (
                  <Panel
                    key={`${invite.email}-${invite.reason}`}
                    className="border-amber-500/30 bg-amber-500/10"
                  >
                    <div className="truncate text-sm font-medium text-amber-700 dark:text-amber-400">
                      {invite.email}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-amber-700/80 dark:text-amber-400/80">
                      {invite.reason === 'already_active'
                        ? 'Skipped — already an active student in this classroom.'
                        : 'Skipped — already accepted an invite for this classroom.'}
                    </p>
                  </Panel>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How joining works</CardTitle>
              <CardDescription>These rules apply on both the teacher and student side.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  icon: ShieldCheck,
                  title: 'Profile completion is required',
                  body: 'Students must complete their profile before joining from an invite email or the class link.'
                },
                {
                  icon: Mail,
                  title: 'Duplicate invites are replaced',
                  body: 'Re-inviting the same email revokes older pending records, so students only ever see one invite.'
                },
                {
                  icon: UserPlus,
                  title: 'Link and email invites work together',
                  body: 'If a student joins via the class link, any matching pending email invite is cleared automatically.'
                }
              ].map((rule) => (
                <Panel key={rule.title}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <rule.icon className="h-4 w-4 shrink-0 text-primary" />
                    {rule.title}
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{rule.body}</p>
                </Panel>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <AlertDialog open={Boolean(removingMember)} onOpenChange={(open) => !open && setRemovingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove student from classroom?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingMember
                ? `This removes ${removingMember.profile?.full_name || removingMember.profile?.username || removingMember.email || 'this student'} from the roster. They will need a new invite to rejoin.`
                : 'This student will be removed from the classroom.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveStudent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove student
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
