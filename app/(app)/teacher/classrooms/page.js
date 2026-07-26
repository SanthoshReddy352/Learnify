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
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, PageHeader, PageLoading, SectionHeading, StatCard, StatGrid } from '@/components/shared/page'

/** Compact metric strip inside a classroom card. */
function CardMetric({ icon: Icon, label, value }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

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

  // One controlled Dialog for the whole page — the header and the empty state
  // both open it, so it must not be duplicated per trigger.
  const createButton = (
    <Button onClick={() => setIsOpen(true)}>
      <Plus className="mr-2 h-4 w-4" />
      New classroom
    </Button>
  )

  const createDialog = (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create classroom</DialogTitle>
          <DialogDescription>Set up a new teacher-managed classroom space.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="classroom-name">Name</Label>
            <Input
              id="classroom-name"
              placeholder="e.g. Grade 11 — Physics"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="classroom-description">Description</Label>
            <Textarea
              id="classroom-description"
              placeholder="What this classroom covers, so students know what they're joining."
              className="min-h-[100px]"
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
            <p className="text-xs text-muted-foreground">Used for assessment windows and due dates.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create classroom'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (loading) {
    return <PageLoading />
  }

  return (
    <>
      <PageHeader
        eyebrow="Teacher portal"
        eyebrowIcon={School}
        title="Classrooms"
        description="Build classroom spaces, attach your subjects, invite students, and monitor how the cohort is progressing."
        actions={createButton}
      />

      {createDialog}

      <StatGrid>
        <StatCard label="Classrooms" value={summary.totalClassrooms} icon={School} />
        <StatCard label="Published courses" value={summary.totalCourses} icon={BookOpen} />
        <StatCard label="Students" value={summary.totalStudents} icon={Users} />
        <StatCard label="Pending invites" value={summary.totalInvites} icon={Mail} />
      </StatGrid>

      {classrooms.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No classrooms yet"
          description="Create your first classroom, attach a subject you've already built, then invite students by email or share the class link."
          action={createButton}
        />
      ) : (
        <section className="space-y-4">
          <SectionHeading
            title="Active classrooms"
            description="Each card opens the management workspace — roster, invites, courses, and analytics."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {classrooms.map((classroom) => (
              <Card
                key={classroom.id}
                role="link"
                tabIndex={0}
                className="group flex cursor-pointer flex-col transition-colors hover:border-primary/40"
                onClick={() => router.push(`/teacher/classrooms/${classroom.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    router.push(`/teacher/classrooms/${classroom.id}`)
                  }
                }}
              >
                <CardHeader>
                  <CardTitle className="line-clamp-2 text-lg transition-colors group-hover:text-primary">
                    {classroom.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 leading-6">
                    {classroom.description || 'No description provided.'}
                  </CardDescription>
                </CardHeader>

                <CardContent className="mt-auto space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <CardMetric icon={BookOpen} label="Courses" value={classroom.courseCount || 0} />
                    <CardMetric icon={Users} label="Students" value={classroom.memberCount || 0} />
                    <CardMetric icon={Mail} label="Invites" value={classroom.inviteCount || 0} />
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                    <span>Open management workspace</span>
                    <span className="flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Open
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
