'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { contributeResource } from '@/lib/actions'
import { Info, Sparkles, ExternalLink } from 'lucide-react'

import { extractDriveId } from '@/lib/drive-utils'

export function ContributeResourceModal({ open, onOpenChange, userId }) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    resource_type: 'notes',
    drive_link: '',
    details: ''
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.subject || !formData.drive_link) {
      toast.error('Please fill in all required fields')
      return
    }

    const driveId = extractDriveId(formData.drive_link)
    if (!driveId) {
      toast.error('Invalid Google Drive link. Please provide a valid file or folder link.')
      return
    }

    // Normalize the link before saving
    const normalizedLink = formData.drive_link.includes('/folders/') 
      ? `https://drive.google.com/drive/folders/${driveId}`
      : `https://drive.google.com/file/d/${driveId}/view?usp=sharing`

    setLoading(true)
    try {
      const result = await contributeResource({
        ...formData,
        drive_link: normalizedLink,
        user_id: userId
      })

      if (result.success) {
        toast.success('Thank you for your contribution!')
        onOpenChange(false)
        setFormData({
          name: '',
          subject: '',
          resource_type: 'notes',
          drive_link: '',
          details: ''
        })
      } else {
        toast.error(result.error || 'Failed to submit contribution')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 sm:max-w-[500px] overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
        
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Contribute Resource
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Share your knowledge with the community. Please ensure your links are accessible.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-semibold">Resource Name*</Label>
              <Input
                id="name"
                placeholder="e.g. OS Full Notes"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-background/50 border-white/10 focus:border-primary/50"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject" className="text-sm font-semibold">Subject*</Label>
              <Input
                id="subject"
                placeholder="e.g. Operating Systems"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="bg-background/50 border-white/10 focus:border-primary/50"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type" className="text-sm font-semibold">Resource Type</Label>
            <Select 
              value={formData.resource_type} 
              onValueChange={(value) => setFormData({ ...formData, resource_type: value })}
            >
              <SelectTrigger className="bg-background/50 border-white/10">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="bg-card border-white/10">
                <SelectItem value="notes">Reference Notes</SelectItem>
                <SelectItem value="pyq">PYQ (Previous Year Questions)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="drive_link" className="text-sm font-semibold flex items-center gap-2">
              Google Drive Link*
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Input
              id="drive_link"
              placeholder="https://drive.google.com/..."
              value={formData.drive_link}
              onChange={(e) => setFormData({ ...formData, drive_link: e.target.value })}
              className="bg-background/50 border-white/10 focus:border-primary/50"
              required
            />
            <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="text-primary font-bold">Important:</span> Set link sharing to <span className="text-foreground font-semibold">&quot;Anyone with the link can view&quot;</span> in Google Drive before sharing.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details" className="text-sm font-semibold">Additional Details</Label>
            <Textarea
              id="details"
              placeholder="e.g. Contains topic-wise previous 5 year GATE questions"
              value={formData.details}
              onChange={(e) => setFormData({ ...formData, details: e.target.value })}
              className="bg-background/50 border-white/10 focus:border-primary/50 min-h-[80px] resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-primary hover:bg-primary/90 text-white min-w-[120px]"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </div>
              ) : 'Share Resource'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
