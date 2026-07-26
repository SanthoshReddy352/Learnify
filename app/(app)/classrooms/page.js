'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, BookOpen, GraduationCap, Mail, School } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, PageHeader, PageLoading, StatCard, StatGrid } from '@/components/shared/page'
import { formatIstDate } from '@/lib/classrooms/format'

export default function ClassroomsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ classrooms: [], invitations: [] })

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/api/classrooms/my')
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load classrooms')
        }

        setData({
          classrooms: payload.classrooms || [],
          invitations: payload.invitations || []
        })
      } catch (error) {
        toast.error(error.message)
        router.push('/login?next=/classrooms')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const totalCourses = useMemo(
    () => data.classrooms.reduce((sum, classroom) => sum + (classroom.courseCount || 0), 0),
    [data.classrooms]
  )

  if (loading) {
    return <PageLoading stats={3} rows={4} />
  }

  const hasInvites = data.invitations.length > 0

  return (
    <>
      <PageHeader
        eyebrow="Classrooms"
        eyebrowIcon={School}
        title="My Classrooms"
        description="Join classrooms, continue coursework, and track your review progress."
        actions={
          <Button variant="outline" onClick={() => router.push('/classrooms/invitations')}>
            <Mail className="mr-2 h-4 w-4" />
            Invites
            {hasInvites && (
              <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {data.invitations.length}
              </span>
            )}
          </Button>
        }
      />

      <StatGrid className="xl:grid-cols-3">
        <StatCard label="Classrooms joined" value={data.classrooms.length} icon={School} />
        <StatCard label="Courses available" value={totalCourses} icon={BookOpen} />
        <StatCard
          label="Pending invites"
          value={data.invitations.length}
          icon={Mail}
          hint={hasInvites ? 'Waiting for you to accept' : 'Nothing waiting'}
        />
      </StatGrid>

      {hasInvites && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Mail className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <p className="font-medium">
                  {data.invitations.length} classroom {data.invitations.length === 1 ? 'invite' : 'invites'} waiting
                </p>
                <p className="text-sm text-muted-foreground">
                  Accept an invite to unlock its courses and reviews.
                </p>
              </div>
            </div>
            <Button className="shrink-0" onClick={() => router.push('/classrooms/invitations')}>
              Review invites
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {data.classrooms.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No active classrooms"
          description="Classrooms you join will appear here. Accept an invite from your teacher, or open a class link they shared with you."
          action={
            <Button variant="outline" onClick={() => router.push('/classrooms/invitations')}>
              <Mail className="mr-2 h-4 w-4" />
              Check invitations
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.classrooms.map((classroom) => (
            <Card
              key={classroom.id}
              role="link"
              tabIndex={0}
              className="group flex cursor-pointer flex-col transition-colors hover:border-primary/40"
              onClick={() => router.push(`/classrooms/${classroom.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  router.push(`/classrooms/${classroom.id}`)
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span>
                    {classroom.courseCount || 0} {classroom.courseCount === 1 ? 'course' : 'courses'}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span>Joined {formatIstDate(classroom.joinedAt)}</span>
                  <span className="flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
