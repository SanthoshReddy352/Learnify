'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ExternalLink, Download, Maximize2, Loader2, X } from 'lucide-react'
import { getDriveEmbedLink, getDriveDownloadLink, getDrivePreviewLink } from '@/lib/drive-utils'

export function ResourceViewModal({ open, onOpenChange, resource }) {
  const [loading, setLoading] = useState(true)
  
  if (!resource) return null

  const embedLink = getDriveEmbedLink(resource.drive_link)
  const downloadLink = getDriveDownloadLink(resource.drive_link)
  const previewLink = getDrivePreviewLink(resource.drive_link)
  const isFolder = resource.drive_link.includes('/folders/')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 gap-0 bg-card border-white/10 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-white/5 bg-background/50 backdrop-blur-md flex flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-0.5 max-w-[60%]">
            <DialogTitle className="text-lg font-bold truncate tracking-tight text-foreground">
              {resource.name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground truncate font-medium">
              {resource.subject} • {resource.resource_type === 'notes' ? 'Reference Notes' : 'PYQ'}
            </p>
          </div>
          
          <div className="flex items-center gap-3 mr-10">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 border-white/10 hover:bg-white/5 text-xs gap-2 hidden sm:flex px-4 rounded-lg"
              asChild
            >
              <a href={previewLink} target="_blank" rel="noopener noreferrer">
                <Maximize2 className="h-4 w-4" />
                Pop out
              </a>
            </Button>
            {!isFolder && (
              <Button 
                size="sm" 
                className="h-9 bg-primary hover:bg-primary/90 text-white text-xs gap-2 px-4 rounded-lg shadow-lg shadow-primary/20"
                asChild
              >
                <a href={downloadLink} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="relative flex-1 w-full bg-[#111] overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#111] z-10 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium animate-pulse">Loading preview...</p>
            </div>
          )}
          
          <iframe
            src={embedLink}
            className="w-full h-full border-none"
            onLoad={() => setLoading(false)}
            allow="autoplay"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
