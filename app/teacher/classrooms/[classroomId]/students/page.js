'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Mail, Send, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatIst } from '@/lib/classrooms/format'

export default function TeacherClassroomStudentsPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState(null)
  const [emailInput, setEmailInput] = useState('')
  const [generatedLinks, setGeneratedLinks] = useState([])

  const loadDetail = async () => {
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
  }

  useEffect(() => {
    loadDetail()
  }, [params.classroomId, router])

  const summary = useMemo(() => {
    const members = detail?.members || []
    const invites = detail?.invites || []

    return {
      activeStudents: members.filter((member) => member.status === 'active').length,
      invitedStudents: members.filter((member) => member.status === 'invited').length,
      pendingInvites: invites.filter((invite) => invite.status === 'pending').length
    }
  }, [detail])

  const handleInvite = async () => {
    if (!emailInput.trim()) {
      toast.error('Add at least one email')
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
      setEmailInput('')
      toast.success(data.emailResult?.sent ? 'Invites sent' : 'Invites created')
      await loadDetail()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = async (url) => {
    await navigator.clipboard.writeText(url)
    toast.success('Invite link copied')
  }

  if (loading || !detail) {
    return <div className="text-muted-foreground">Loading classroom students...</div>
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-primary/15 via-background to-sky-500/10 px-6 py-7 shadow-[0_24px_80px_-48px_rgba(59,130,246,0.6)] md:px-8 md:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <Button variant="ghost" className="mb-4 -ml-2 w-fit text-muted-foreground" onClick={() => router.push(`/teacher/classrooms/${params.classroomId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Classroom
              </Button>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-primary" />
                Student Access
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">Students and Invites</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Manage enrollment, bulk invite new students, and share fallback invite links when email delivery is unavailable.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Active students</CardDescription>
                <CardTitle className="text-3xl">{summary.activeStudents}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Invited memberships</CardDescription>
                <CardTitle className="text-3xl">{summary.invitedStudents}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Pending invite emails</CardDescription>
                <CardTitle className="text-3xl">{summary.pendingInvites}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_380px]">
        <div className="space-y-6">
          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle>Active students</CardTitle>
              <CardDescription>Students who have accepted classroom access and can currently enter the portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.members.filter((member) => member.status === 'active').map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="font-medium">{member.profile?.full_name || member.profile?.username || 'Student'}</div>
                        <div className="text-xs text-muted-foreground">{member.profile?.education_level || 'Education level not set'}</div>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                          Active
                        </span>
                      </TableCell>
                      <TableCell>{formatIst(member.joined_at)}</TableCell>
                    </TableRow>
                  ))}
                  {detail.members.filter((member) => member.status === 'active').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">No active students yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle>Pending invite emails</CardTitle>
              <CardDescription>Invite records that are still waiting to be accepted.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.invites.filter((invite) => invite.status === 'pending').map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                          Pending
                        </span>
                      </TableCell>
                      <TableCell>{formatIst(invite.expires_at)}</TableCell>
                    </TableRow>
                  ))}
                  {detail.invites.filter((invite) => invite.status === 'pending').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">No pending invites.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle>Bulk invite students</CardTitle>
              <CardDescription>Add one email per line, or separate them with commas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder={'student1@example.com\nstudent2@example.com'}
                className="min-h-[180px] rounded-2xl border-white/10 bg-background/70"
              />
              <Button className="h-11 w-full" onClick={handleInvite} disabled={submitting}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? 'Creating invites...' : 'Invite Students'}
              </Button>
            </CardContent>
          </Card>

          {generatedLinks.length > 0 && (
            <Card className="rounded-[24px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle>Generated invite links</CardTitle>
                <CardDescription>Returned even when email sending is not configured.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {generatedLinks.map((invite) => (
                  <div key={invite.email} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="font-medium">{invite.email}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Expires {formatIst(invite.expiresAt)} IST</div>
                    <Button variant="outline" className="mt-3 w-full border-white/10" onClick={() => copyLink(invite.inviteUrl)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Invite Link
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[24px] border-white/10 bg-black/10">
            <CardHeader>
              <CardTitle>Enrollment workflow</CardTitle>
              <CardDescription>Keep invites reliable and easy to claim.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <UserPlus className="h-4 w-4 text-primary" />
                  1. Invite with school email
                </div>
                <p className="mt-2 leading-6">Use the same email students will sign in with so invite claiming works cleanly.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <Mail className="h-4 w-4 text-primary" />
                  2. Share fallback links if needed
                </div>
                <p className="mt-2 leading-6">If email sending is disabled, copy the generated link and share it directly.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
