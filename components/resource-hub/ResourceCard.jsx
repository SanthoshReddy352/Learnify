'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, Download, User, Calendar, BookOpen, ExternalLink, FileText } from 'lucide-react'
import { extractFileId, getDownloadLink } from '@/lib/utils/drive'
import { motion } from 'framer-motion'
import { ResourceViewModal } from './ResourceViewModal'

export function ResourceCard({ resource }) {
  const [isViewOpen, setIsViewOpen] = useState(false)
  const fileId = extractFileId(resource.drive_link)
  const downloadLink = getDownloadLink(fileId) || resource.drive_link

  const date = new Date(resource.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="glass-card border-white/5 h-full flex flex-col group overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                  {resource.resource_type === 'notes' ? (
                      <BookOpen className="h-5 w-5 text-primary" />
                  ) : (
                      <FileText className="h-5 w-5 text-orange-500" />
                  )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/5 px-2 py-1 rounded-full">
                  <Calendar className="h-3 w-3" />
                  {date}
              </div>
            </div>
            <CardTitle className="text-xl font-bold line-clamp-1 group-hover:text-primary transition-colors">
              {resource.name}
            </CardTitle>
            <CardDescription className="font-semibold text-primary/80">
              {resource.subject}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 space-y-4">
            {resource.details && (
              <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {resource.details}
              </p>
            )}
            
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                  <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Contributed by</p>
                  <p className="text-sm font-medium truncate">
                      {resource.profiles?.full_name || resource.profiles?.display_name || resource.profiles?.username || 'Community Member'}
                  </p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="grid grid-cols-2 gap-3 p-4 bg-white/5">
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full glass border-white/10 hover:bg-white/10"
              onClick={() => setIsViewOpen(true)}
            >
              <Eye className="mr-2 h-4 w-4" />
              View
            </Button>
            <Button 
              asChild 
              size="sm" 
              className="w-full bg-primary/20 text-primary hover:bg-primary hover:text-white"
            >
              <a href={downloadLink} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          </CardFooter>
        </Card>
      </motion.div>

      {fileId && (
        <ResourceViewModal 
          isOpen={isViewOpen} 
          onClose={() => setIsViewOpen(false)} 
          resource={resource}
          fileId={fileId}
        />
      )}
    </>
  )
}
