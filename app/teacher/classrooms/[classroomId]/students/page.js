'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
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
import { formatIst } from '@/lib/classrooms/format'

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
    return <div className="text-muted-foreground">Loading classroom students...</div>
  }

  return (
    <>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,165,233,0.14),rgba(15,23,42,0.9)_52%,rgba(34,197,94,0.14))] px-5 py-6 shadow-[0_24px_90px_-52px_rgba(14,165,233,0.75)] sm:px-7 sm:py-7 lg:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.18),transparent_28%)]" />
          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <Button
                  variant="ghost"
                  className="mb-4 -ml-3 w-fit text-white/75 hover:bg-white/10 hover:text-white"
                  onClick={() => router.push(`/teacher/classrooms/${params.classroomId}`)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Classroom
                </Button>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-white/80">
                  <Users className="h-3.5 w-3.5" />
                  Student Access
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Roster, invites, and join link</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                  Add students by email, share the classroom join link, and keep pending invites clean. Students must finish their profile before they can enter.
                </p>
              </div>

              <Card className="w-full border-white/15 bg-white/10 shadow-none lg:max-w-sm">
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg text-white">Share class link</CardTitle>
                      <CardDescription className="text-white/65">One reusable link for this classroom.</CardDescription>
                    </div>
                    <Badge variant="outline" className="border-emerald-300/30 bg-emerald-400/10 text-emerald-100">
                      Live
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    value={detail.shareLink || ''}
                    readOnly
                    className="border-white/15 bg-slate-950/50 text-white placeholder:text-white/40"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="flex-1" onClick={() => copyLink(detail.shareLink, 'Class link copied')}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Link
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => router.push(detail.shareLink.replace(window.location.origin, ''))}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-white/15 bg-white/10 shadow-none">
                <CardHeader className="pb-2">
                  <CardDescription className="text-white/65">Active students</CardDescription>
                  <CardTitle className="text-3xl text-white">{activeMembers.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-white/15 bg-white/10 shadow-none">
                <CardHeader className="pb-2">
                  <CardDescription className="text-white/65">Pending invite emails</CardDescription>
                  <CardTitle className="text-3xl text-white">{pendingInvites.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-white/15 bg-white/10 shadow-none">
                <CardHeader className="pb-2">
                  <CardDescription className="text-white/65">Claimed invite accounts</CardDescription>
                  <CardTitle className="text-3xl text-white">{invitedMembers.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-white/15 bg-white/10 shadow-none">
                <CardHeader className="pb-2">
                  <CardDescription className="text-white/65">Profile requirement</CardDescription>
                  <CardTitle className="text-lg text-white">Required before join</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,420px)]">
          <div className="space-y-6">
            <Card className="rounded-[28px] border-white/10 bg-black/10">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Active students</CardTitle>
                  <CardDescription>Students who can currently access this classroom.</CardDescription>
                </div>
                <Badge variant="outline" className="w-fit border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                  {activeMembers.length} active
                </Badge>
              </CardHeader>
              <CardContent>
                {activeMembers.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-muted-foreground">
                    No active students yet. Invite students by email or share the class link.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {activeMembers.map((member) => (
                      <div key={member.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-base font-semibold">
                                {member.profile?.full_name || member.profile?.username || 'Student'}
                              </div>
                              <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                                Active
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {member.email || 'Email unavailable'}
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span>{member.profile?.education_level || 'Education level not set'}</span>
                              <span>Joined {formatIst(member.joined_at)}</span>
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            className="border-red-500/20 bg-red-500/5 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                            onClick={() => setRemovingMember(member)}
                          >
                            <UserMinus className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/10 bg-black/10">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Pending invite emails</CardTitle>
                  <CardDescription>Only the newest active invite per email is kept visible.</CardDescription>
                </div>
                <Badge variant="outline" className="w-fit border-sky-400/20 bg-sky-400/10 text-sky-100">
                  {pendingInvites.length} waiting
                </Badge>
              </CardHeader>
              <CardContent>
                {pendingInvites.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-muted-foreground">
                    No pending invite emails. Students who join from the class link will bypass this list and appear in the roster directly.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {pendingInvites.map((invite) => (
                      <div key={invite.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-base font-semibold">{invite.email}</div>
                              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                                Pending
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span>Sent {formatIst(invite.created_at)}</span>
                              <span>Expires {formatIst(invite.expires_at)}</span>
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            className="border-red-500/20 bg-red-500/5 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                            onClick={() => handleRevokeInvite(invite.id)}
                            disabled={revokingInviteId === invite.id}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {revokingInviteId === invite.id ? 'Revoking...' : 'Revoke'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[28px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle>Invite students by email</CardTitle>
                <CardDescription>Add one email per line or separate emails with commas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  placeholder={'student1@example.com\nstudent2@example.com'}
                  className="min-h-[180px] rounded-3xl border-white/10 bg-background/70"
                />
                <Button className="h-11 w-full" onClick={handleInvite} disabled={submitting}>
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? 'Creating invites...' : 'Create Invite Emails'}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle>Join flow rules</CardTitle>
                <CardDescription>These rules now apply on both teacher and student sides.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    Profile completion is required
                  </div>
                  <p className="mt-2 leading-6">Students must complete their profile before joining from an invite email or the class link.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <Mail className="h-4 w-4 text-sky-300" />
                    Duplicate pending invites are replaced
                  </div>
                  <p className="mt-2 leading-6">Sending a new invite to the same email revokes older pending records so students see one clean invite.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <UserPlus className="h-4 w-4 text-primary" />
                    Share link and email invites work together
                  </div>
                  <p className="mt-2 leading-6">If a student joins using the class link, any matching pending email invite is automatically cleared.</p>
                </div>
              </CardContent>
            </Card>

            {(generatedLinks.length > 0 || skippedInvites.length > 0) && (
              <Card className="rounded-[28px] border-white/10 bg-black/10">
                <CardHeader>
                  <CardTitle>Latest invite results</CardTitle>
                  <CardDescription>Copy links directly if you need to share them outside email.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {generatedLinks.map((invite) => (
                    <div key={invite.email} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium">{invite.email}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Expires {formatIst(invite.expiresAt)} IST</div>
                        </div>
                        <Button
                          variant="outline"
                          className="border-white/10"
                          onClick={() => copyLink(invite.inviteUrl, 'Invite link copied')}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Invite Link
                        </Button>
                      </div>
                    </div>
                  ))}

                  {skippedInvites.map((invite) => (
                    <div key={`${invite.email}-${invite.reason}`} className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-4">
                      <div className="font-medium text-amber-100">{invite.email}</div>
                      <div className="mt-1 text-xs text-amber-100/70">
                        {invite.reason === 'already_active'
                          ? 'Skipped because this student is already active in the classroom.'
                          : 'Skipped because this student already accepted an invite for this classroom.'}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </div>

      <AlertDialog open={Boolean(removingMember)} onOpenChange={(open) => !open && setRemovingMember(null)}>
        <AlertDialogContent className="border-white/10 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove student from classroom?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingMember
                ? `This removes ${removingMember.profile?.full_name || removingMember.profile?.username || removingMember.email || 'this student'} from the roster. They will need a new invite to rejoin.`
                : 'This student will be removed from the classroom.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 hover:bg-white/5">Cancel</AlertDialogCancel>
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
