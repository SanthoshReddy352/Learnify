'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, BookOpen, Mail, School } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

  if (loading) {
    return <div className="text-muted-foreground">Loading classrooms...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Classrooms</h1>
          <p className="text-muted-foreground">Join classrooms, continue coursework, and track review progress.</p>
        </div>
        <Button variant="outline" onClick={() => router.push('/classrooms/invitations')}>
          <Mail className="mr-2 h-4 w-4" />
          Invites
        </Button>
      </div>

      {data.invitations.length > 0 && (
        <Card className="glass-card border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Pending classroom invites</CardTitle>
            <CardDescription>You have {data.invitations.length} invite(s) waiting to be accepted.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/classrooms/invitations')}>Review Invites</Button>
          </CardContent>
        </Card>
      )}

      {data.classrooms.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <School className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>No active classrooms</CardTitle>
            <CardDescription>Your joined classrooms will appear here after you accept an invite.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {data.classrooms.map((classroom) => (
            <Card
              key={classroom.id}
              className="glass-card cursor-pointer border-white/10 hover:border-primary/30"
              onClick={() => router.push(`/classrooms/${classroom.id}`)}
            >
              <CardHeader>
                <CardTitle>{classroom.name}</CardTitle>
                <CardDescription>{classroom.description || 'No description provided.'}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span>{classroom.courseCount} course(s)</span>
                </div>
                <Button variant="ghost" size="sm">
                  Open
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
