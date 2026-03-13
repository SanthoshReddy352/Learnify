import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Download, ExternalLink, User, Calendar, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getDrivePreviewLink, getDriveDownloadLink } from '@/lib/drive-utils'
import { ResourceViewModal } from './ResourceViewModal'

export function CommunityResourceCard({ resource }) {
  const [viewOpen, setViewOpen] = useState(false)
  const downloadLink = getDriveDownloadLink(resource.drive_link)
  const isFolder = resource.drive_link.includes('/folders/')

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="glass-card hover:bg-white/5 transition-all border-white/10 hover:border-primary/30 flex flex-col h-full overflow-hidden group">
          <CardHeader className="pb-3 border-b border-white/5 bg-white/5">
            <div className="flex justify-between items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary ring-1 ring-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-white/5 px-2 py-1 rounded">
                {resource.resource_type}
              </div>
            </div>
            <CardTitle className="text-xl font-bold tracking-tight mt-3 line-clamp-1 group-hover:text-primary transition-colors">
              {resource.name}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-xs text-muted-foreground italic font-medium">
               <span className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-primary" />
                  {resource.subject}
               </span>
            </div>
          </CardHeader>
          
          <CardContent className="pt-4 flex-1">
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              {resource.details || 'No additional details provided.'}
            </p>
            
            <div className="mt-6 space-y-3">
               <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                  <User className="h-3 w-3" />
                <span>Contributed by <span className="text-primary/70 font-semibold">
                  {resource.profiles?.full_name || 
                   (Array.isArray(resource.profiles) ? (resource.profiles[0]?.full_name || resource.profiles[0]?.username) : resource.profiles?.username) || 
                   'Community Member'}
                </span></span>
               </div>
               <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(resource.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
               </div>
            </div>
          </CardContent>

          <CardFooter className="pt-4 border-t border-white/5 bg-white/5 grid grid-cols-2 gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full hover:bg-primary/10 hover:text-primary text-xs font-semibold uppercase tracking-wider h-10 border border-transparent hover:border-primary/20 gap-2"
              onClick={() => setViewOpen(true)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </Button>
            {!isFolder && (
              <Button 
                size="sm" 
                className="w-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-xs font-semibold uppercase tracking-wider h-10 shadow-none gap-2 border border-primary/20"
                asChild
              >
                <a href={downloadLink} target="_blank" rel="noopener noreferrer">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </Button>
            )}
            {isFolder && (
              <div className="text-[10px] text-muted-foreground flex items-center justify-center p-2 text-center leading-tight">
                 Folder download not supported
              </div>
            )}
          </CardFooter>
        </Card>
      </motion.div>

      <ResourceViewModal 
        open={viewOpen} 
        onOpenChange={setViewOpen} 
        resource={resource} 
      />
    </>
  )
}
