'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Info, AlertCircle, Link, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { submitCommunityResource } from '@/lib/actions'
import { useRouter } from 'next/navigation'

export function ResourceUploadCard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setCheckingAuth(false)
    }
    checkUser()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user) {
        toast.error('You must be logged in to contribute')
        return
    }

    setLoading(true)
    const formData = new FormData(event.currentTarget)
    
    try {
      const result = await submitCommunityResource(formData)
      if (result.success) {
        toast.success('Thank you for your contribution!')
        event.target.reset()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to submit resource')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
        <Card className="glass-card border-white/5 animate-pulse">
            <div className="h-[400px]" />
        </Card>
    )
  }

  return (
    <Card className="glass-card border-white/5 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />
      
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
                <Upload className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Contribute Materials</CardTitle>
        </div>
        <CardDescription className="text-lg">
          Share your study notes or previous year questions with the community.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!user ? (
          <div className="p-8 border border-dashed border-white/10 rounded-2xl bg-white/5 text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <h3 className="text-xl font-bold">Sign in to contribute</h3>
              <p className="text-muted-foreground">Log in to your account to share resources with other students.</p>
            </div>
            <Button onClick={() => router.push('/login')} className="bg-primary hover:bg-primary/90 rounded-full px-8">
              Sign In
            </Button>
          </div>
        ) : (
          <form id="resource-upload-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Resource Name</Label>
                <Input 
                  id="name" 
                  name="name" 
                  placeholder="e.g. Organic Chemistry Units 1-3" 
                  required 
                  className="bg-white/5 border-white/10 focus:border-primary/50 rounded-xl h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-sm font-medium">Subject</Label>
                <Input 
                  id="subject" 
                  name="subject" 
                  placeholder="e.g. Chemistry" 
                  required 
                  className="bg-white/5 border-white/10 focus:border-primary/50 rounded-xl h-11"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="resource_type" className="text-sm font-medium">Category</Label>
                <Select name="resource_type" required defaultValue="notes">
                  <SelectTrigger className="bg-white/5 border-white/10 focus:border-primary/50 rounded-xl h-11">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-white/10">
                    <SelectItem value="notes">Reference Notes</SelectItem>
                    <SelectItem value="pyq">PYQ (Past Papers)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="drive_link" className="text-sm font-medium">Drive Shared Link</Label>
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="drive_link" 
                    name="drive_link" 
                    placeholder="https://drive.google.com/..." 
                    type="url"
                    required 
                    className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="details" className="text-sm font-medium">Additional Details (Optional)</Label>
                <Textarea 
                  id="details" 
                  name="details" 
                  placeholder="Add any context, year, author info, or key topics covered in this resource..." 
                  className="bg-white/5 border-white/10 focus:border-primary/50 rounded-xl min-h-[100px] resize-none"
                />
            </div>

            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex gap-4">
                <Info className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                    <p className="font-bold text-orange-500">Important: Drive Permissions</p>
                    <p className="text-muted-foreground leading-relaxed">
                        Ensure your Drive link's visibility is set to <span className="text-foreground font-semibold">"Anyone with the link"</span> can view. This allows the community to access your contribution.
                    </p>
                </div>
            </div>
          </form>
        )}
      </CardContent>

      <CardFooter className="bg-white/5 border-t border-white/5 p-6">
        <Button 
          type="submit" 
          form="resource-upload-form"
          disabled={!user || loading} 
          className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 rounded-full h-12 text-lg font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Contribute Resource
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
