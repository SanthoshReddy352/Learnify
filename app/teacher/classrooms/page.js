'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Mail,
  Plus,
  School,
  Sparkles,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function TeacherClassroomsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [classrooms, setClassrooms] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    timezone: 'Asia/Kolkata'
  })

  const loadClassrooms = async () => {
    try {
      const response = await fetch('/api/teacher/classrooms')
      if (!response.ok) {
        throw new Error('Teacher access is required')
      }

      const data = await response.json()
      setClassrooms(data.classrooms || [])
    } catch (error) {
      toast.error(error.message)
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClassrooms()
  }, [])

  const summary = useMemo(() => ({
    totalClassrooms: classrooms.length,
    totalCourses: classrooms.reduce((sum, classroom) => sum + (classroom.courseCount || 0), 0),
    totalStudents: classrooms.reduce((sum, classroom) => sum + (classroom.memberCount || 0), 0),
    totalInvites: classrooms.reduce((sum, classroom) => sum + (classroom.inviteCount || 0), 0)
  }), [classrooms])

  const highlightedClassroom = useMemo(() => (
    classrooms
      .slice()
      .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))[0] || null
  ), [classrooms])

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Classroom name is required')
      return
    }

    setCreating(true)

    try {
      const response = await fetch('/api/teacher/classrooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create classroom')
      }

      toast.success('Classroom created')
      setIsOpen(false)
      setForm({
        name: '',
        description: '',
        timezone: 'Asia/Kolkata'
      })
      await loadClassrooms()
      router.push(`/teacher/classrooms/${data.classroom.id}`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading teacher portal...</div>
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-primary/15 via-background to-emerald-500/10 px-6 py-7 shadow-[0_24px_80px_-48px_rgba(59,130,246,0.6)] md:px-8 md:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <School className="h-3.5 w-3.5 text-primary" />
                Teacher Portal
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">Teacher Classrooms</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Build classroom spaces, attach your subjects, invite students, and monitor how the cohort is progressing.
              </p>
            </div>

            <div className="w-full max-w-sm">
              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button className="h-11 w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Classroom
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-white/10 bg-card">
                  <DialogHeader>
                    <DialogTitle>Create classroom</DialogTitle>
                    <DialogDescription>Set up a new teacher-managed classroom space.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="classroom-name">Name</Label>
                      <Input
                        id="classroom-name"
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="classroom-description">Description</Label>
                      <Textarea
                        id="classroom-description"
                        value={form.description}
                        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="classroom-timezone">Timezone</Label>
                      <Input
                        id="classroom-timezone"
                        value={form.timezone}
                        onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={creating}>
                      {creating ? 'Creating...' : 'Create Classroom'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Total classrooms</CardDescription>
                <CardTitle className="text-3xl">{summary.totalClassrooms}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Published courses</CardDescription>
                <CardTitle className="text-3xl">{summary.totalCourses}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Students</CardDescription>
                <CardTitle className="text-3xl">{summary.totalStudents}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] shadow-none">
              <CardHeader className="pb-2">
                <CardDescription>Pending invites</CardDescription>
                <CardTitle className="text-3xl">{summary.totalInvites}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {classrooms.length === 0 ? (
        <Card className="mt-8 rounded-[24px] border-dashed border-white/10 bg-black/10">
          <CardHeader className="items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>No classrooms yet</CardTitle>
            <CardDescription>Create your first classroom to invite students and publish courses.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_340px]">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Active Classrooms</h2>
              <p className="text-sm text-muted-foreground">Each card gives quick access to roster, invites, courses, and analytics.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {classrooms.map((classroom) => (
                <Card
                  key={classroom.id}
                  className="group flex h-full cursor-pointer flex-col rounded-[24px] border-white/10 bg-gradient-to-br from-black/20 to-white/[0.03] transition-all hover:-translate-y-0.5 hover:border-primary/30"
                  onClick={() => router.push(`/teacher/classrooms/${classroom.id}`)}
                >
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="line-clamp-2 text-xl">{classroom.name}</CardTitle>
                        <CardDescription className="mt-2 line-clamp-3 leading-6">
                          {classroom.description || 'No description provided.'}
                        </CardDescription>
                      </div>
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        Live
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="mt-auto space-y-4">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <BookOpen className="h-4 w-4 text-primary" />
                          Courses
                        </div>
                        <div className="mt-2 text-lg font-semibold">{classroom.courseCount || 0}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4 text-primary" />
                          Students
                        </div>
                        <div className="mt-2 text-lg font-semibold">{classroom.memberCount || 0}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-4 w-4 text-primary" />
                          Invites
                        </div>
                        <div className="mt-2 text-lg font-semibold">{classroom.inviteCount || 0}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-4 text-sm text-muted-foreground">
                      <span>Open management workspace</span>
                      <Button variant="ghost" size="sm" className="group-hover:text-primary">
                        Open
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {highlightedClassroom && (
              <Card className="rounded-[24px] border-white/10 bg-black/10">
                <CardHeader>
                  <CardDescription>Most active classroom</CardDescription>
                  <CardTitle className="text-xl">{highlightedClassroom.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="flex items-center gap-2 text-foreground">
                      <Users className="h-4 w-4 text-primary" />
                      Largest roster
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-foreground">{highlightedClassroom.memberCount || 0}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="flex items-center gap-2 text-foreground">
                      <BookOpen className="h-4 w-4 text-primary" />
                      Attached courses
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-foreground">{highlightedClassroom.courseCount || 0}</div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-[24px] border-white/10 bg-black/10">
              <CardHeader>
                <CardTitle className="text-xl">Teacher Workflow</CardTitle>
                <CardDescription>Recommended order for setting up a high-quality classroom.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    1. Create the classroom
                  </div>
                  <p className="mt-2 leading-6">Start with a concise classroom description so students understand the objective immediately.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <BookOpen className="h-4 w-4 text-primary" />
                    2. Attach polished subjects
                  </div>
                  <p className="mt-2 leading-6">Attach only subjects that already have a solid graph and topic content so the classroom experience feels complete.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <Users className="h-4 w-4 text-primary" />
                    3. Invite and monitor
                  </div>
                  <p className="mt-2 leading-6">Bulk invite students, then use analytics to identify weak topics and stalled learners.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </>
  )
}
