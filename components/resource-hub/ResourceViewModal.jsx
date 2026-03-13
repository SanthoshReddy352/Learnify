'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, Loader2, ExternalLink, Maximize2 } from 'lucide-react'
import { getDownloadLink } from '@/lib/utils/drive'

export function ResourceViewModal({ isOpen, onClose, resource, fileId }) {
  const [isLoading, setIsLoading] = useState(true)
  const previewLink = `https://drive.google.com/file/d/${fileId}/preview`
  const downloadLink = getDownloadLink(fileId)

  if (!resource) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[1200px] h-[90vh] p-0 overflow-hidden glass-card border-white/10 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-white/5 bg-background/50 backdrop-blur-md flex-row items-center justify-between space-y-0">
          <div className="flex flex-col min-w-0 flex-1">
            <DialogTitle className="text-xl font-bold truncate pr-4">
              {resource.name}
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-primary">
              {resource.subject} • {resource.resource_type === 'notes' ? 'Reference Notes' : 'PYQ'}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-3 pr-10">
            <Button 
              asChild 
              size="sm" 
              variant="outline" 
              className="glass border-white/10 hidden md:flex h-9 px-4"
            >
              <a href={previewLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Pop Out
              </a>
            </Button>
            <Button 
              asChild 
              size="sm" 
              className="bg-primary hover:bg-primary/90 text-white rounded-full h-9 px-6 transition-all shadow-lg shadow-primary/20"
            >
              <a href={downloadLink} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 relative bg-[#1a1a1a]">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-background/80 backdrop-blur-sm">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-muted-foreground animate-pulse">Loading preview...</p>
            </div>
          )}
          
          <iframe
            src={previewLink}
            className="w-full h-full border-none"
            allow="autoplay"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
