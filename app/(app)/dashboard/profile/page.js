'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { BookOpen, Briefcase, GraduationCap, User } from 'lucide-react'
import { PageHeader, PageLoading } from '@/components/shared/page'

// The API rejects a profile missing any of these, so the form has to ask for
// exactly the same set — otherwise a blank Goals field only fails server-side
// with a generic "Missing required fields".
const REQUIRED_FIELDS = ['full_name', 'education_level', 'preferred_learning_style', 'learning_goals']

/** Label with a consistent required marker. */
function FieldLabel({ htmlFor, children, required }) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1">
      {children}
      {required && <span className="text-destructive" aria-hidden="true">*</span>}
    </Label>
  )
}

function ProfilePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    education_level: '',
    occupation: '',
    learning_goals: '',
    preferred_learning_style: '',
    learning_schedule: ''
  })

  const nextPath = searchParams.get('next')

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/')
          return
        }

        const response = await fetch('/api/user/profile')
        if (response.ok) {
          const data = await response.json()
          if (data) {
            setFormData({
              full_name: data.full_name || '',
              education_level: data.education_level || '',
              occupation: data.occupation || '',
              learning_goals: data.learning_goals || '',
              preferred_learning_style: data.preferred_learning_style || '',
              learning_schedule: data.learning_schedule || ''
            })
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        toast.error('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [router])

  const missingRequired = useMemo(
    () => REQUIRED_FIELDS.filter((field) => !formData[field]?.trim()),
    [formData]
  )

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (missingRequired.length > 0) {
      toast.error('Fill in every required field before saving')
      document.getElementById(missingRequired[0])?.focus()
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        toast.success('Profile updated successfully!')

        if (nextPath) {
          router.push(nextPath)
        }
      } else {
        const errorData = await response.json()
        toast.error(errorData.error || 'Failed to update profile')
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return <PageLoading showStats={false} rows={2} />
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Account"
        eyebrowIcon={User}
        title="Your profile"
        description="Learnify uses these details to pitch topic depth, examples, and pacing at the right level for you."
        onBack={() => router.push('/dashboard')}
        backLabel="Back to dashboard"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <CardTitle className="text-lg">Personal details</CardTitle>
            </div>
            <CardDescription>Basic information used to personalize your experience.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="full_name" required>Full name</FieldLabel>
              <Input
                id="full_name"
                placeholder="e.g. Alex Doe"
                value={formData.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="occupation">Occupation</FieldLabel>
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="occupation"
                  placeholder="e.g. Software Engineer"
                  className="pl-9"
                  value={formData.occupation}
                  onChange={(e) => handleChange('occupation', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              <CardTitle className="text-lg">Education and learning style</CardTitle>
            </div>
            <CardDescription>Sets the complexity and format of the topics we generate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="education_level" required>Education level</FieldLabel>
                <Select
                  value={formData.education_level}
                  onValueChange={(val) => handleChange('education_level', val)}
                >
                  <SelectTrigger id="education_level">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High School">High School</SelectItem>
                    <SelectItem value="Undergraduate">Undergraduate</SelectItem>
                    <SelectItem value="Graduate">Graduate</SelectItem>
                    <SelectItem value="PhD">PhD</SelectItem>
                    <SelectItem value="Self-Taught">Self-Taught</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="preferred_learning_style" required>Preferred learning style</FieldLabel>
                <Select
                  value={formData.preferred_learning_style}
                  onValueChange={(val) => handleChange('preferred_learning_style', val)}
                >
                  <SelectTrigger id="preferred_learning_style">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Visual">Visual (images, diagrams)</SelectItem>
                    <SelectItem value="Auditory">Auditory (listening, discussing)</SelectItem>
                    <SelectItem value="Reading/Writing">Reading and writing</SelectItem>
                    <SelectItem value="Kinesthetic">Kinesthetic (hands-on)</SelectItem>
                    <SelectItem value="Project-based">Project-based</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="learning_schedule">Typical learning schedule</FieldLabel>
              <Select
                value={formData.learning_schedule}
                onValueChange={(val) => handleChange('learning_schedule', val)}
              >
                <SelectTrigger id="learning_schedule">
                  <SelectValue placeholder="How often do you learn?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Daily (30+ mins)">Daily (30+ mins)</SelectItem>
                  <SelectItem value="Few times a week">Few times a week</SelectItem>
                  <SelectItem value="Weekends only">Weekends only</SelectItem>
                  <SelectItem value="Sporadic">Sporadic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <CardTitle className="text-lg">Learning goals</CardTitle>
            </div>
            <CardDescription>What you want to achieve — the more specific, the better the roadmap.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <FieldLabel htmlFor="learning_goals" required>Goals</FieldLabel>
              <Textarea
                id="learning_goals"
                placeholder="e.g. I want to learn React well enough to ship the frontend for my own startup in three months."
                className="min-h-[120px]"
                value={formData.learning_goals}
                onChange={(e) => handleChange('learning_goals', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {missingRequired.length > 0
              ? `${missingRequired.length} required ${missingRequired.length === 1 ? 'field' : 'fields'} left to fill.`
              : 'All required fields are filled.'}
          </p>
          <Button type="submit" disabled={saving} className="sm:min-w-[160px]">
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageLoading showStats={false} rows={2} />}>
      <ProfilePageContent />
    </Suspense>
  )
}
