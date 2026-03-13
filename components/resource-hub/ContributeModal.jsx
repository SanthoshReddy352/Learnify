'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Info, AlertCircle, Link, Loader2, Sparkles, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { submitCommunityResource } from '@/lib/actions'
import { useRouter } from 'next/navigation'

export function ContributeModal({ isOpen, onClose }) {
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

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

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
        onClose()
      } else {
        toast.error(result.error || 'Failed to submit resource')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="glass-card border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto pointer-events-auto shadow-2xl relative">
              {/* Glow accent */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Contribute Materials</h2>
                    <p className="text-sm text-muted-foreground">Share your resources with the community</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6">
                {checkingAuth ? (
                  <div className="h-40 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : !user ? (
                  <div className="p-8 border border-dashed border-white/10 rounded-2xl bg-white/5 text-center space-y-4">
                    <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
                    <div>
                      <h3 className="text-xl font-bold">Sign in to contribute</h3>
                      <p className="text-muted-foreground">Log in to your account to share resources with other students.</p>
                    </div>
                    <Button
                      onClick={() => { onClose(); router.push('/login') }}
                      className="bg-primary hover:bg-primary/90 rounded-full px-8"
                    >
                      Sign In
                    </Button>
                  </div>
                ) : (
                  <form id="contribute-modal-form" onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="modal-name" className="text-sm font-medium">Resource Name</Label>
                        <Input
                          id="modal-name"
                          name="name"
                          placeholder="e.g. Organic Chemistry Units 1-3"
                          required
                          className="bg-white/5 border-white/10 focus:border-primary/50 rounded-xl h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="modal-subject" className="text-sm font-medium">Subject</Label>
                        <Input
                          id="modal-subject"
                          name="subject"
                          placeholder="e.g. Chemistry"
                          required
                          className="bg-white/5 border-white/10 focus:border-primary/50 rounded-xl h-11"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="modal-resource_type" className="text-sm font-medium">Category</Label>
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
                        <Label htmlFor="modal-drive_link" className="text-sm font-medium">Drive Shared Link</Label>
                        <div className="relative">
                          <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="modal-drive_link"
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
                      <Label htmlFor="modal-details" className="text-sm font-medium">Additional Details (Optional)</Label>
                      <Textarea
                        id="modal-details"
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
              </div>

              {/* Footer */}
              {!checkingAuth && user && (
                <div className="p-6 border-t border-white/5 bg-white/[0.02]">
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="flex-1 glass border-white/10 hover:bg-white/10 rounded-full h-11"
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      form="contribute-modal-form"
                      disabled={loading}
                      className="flex-1 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 rounded-full h-11 font-semibold"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Contribute Resource
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
