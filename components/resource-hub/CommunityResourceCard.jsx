'use client'

import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { ArrowBigDown, ArrowBigUp, BookOpen, Calendar, Download, ExternalLink, Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getDriveDownloadLink } from '@/lib/drive-utils'
import { voteOnResource } from '@/lib/actions'
import { ResourceViewModal } from './ResourceViewModal'

export function CommunityResourceCard({ resource }) {
  const [viewOpen, setViewOpen] = useState(false)
  const [voteState, setVoteState] = useState({
    upvotes: resource.upvotes || 0,
    downvotes: resource.downvotes || 0,
    userVote: resource.userVote || null
  })
  const [isVotePending, startVoteTransition] = useTransition()
  const downloadLink = getDriveDownloadLink(resource.drive_link)
  const isFolder = resource.drive_link.includes('/folders/')

  const updateVoteState = (currentState, requestedVote) => {
    const nextVote = currentState.userVote === requestedVote ? null : requestedVote
    let upvotes = currentState.upvotes
    let downvotes = currentState.downvotes

    if (currentState.userVote === 1) upvotes = Math.max(0, upvotes - 1)
    if (currentState.userVote === -1) downvotes = Math.max(0, downvotes - 1)
    if (nextVote === 1) upvotes += 1
    if (nextVote === -1) downvotes += 1

    return {
      upvotes,
      downvotes,
      userVote: nextVote
    }
  }

  const handleVote = (requestedVote) => {
    const previousState = voteState
    const optimisticState = updateVoteState(previousState, requestedVote)
    setVoteState(optimisticState)

    startVoteTransition(async () => {
      const result = await voteOnResource(resource.id, requestedVote)

      if (!result.success) {
        setVoteState(previousState)
        toast.error(result.error || 'Failed to update vote')
        return
      }

      setVoteState({
        upvotes: result.upvotes ?? optimisticState.upvotes,
        downvotes: result.downvotes ?? optimisticState.downvotes,
        userVote: result.vote ?? optimisticState.userVote
      })
    })
  }

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
               <div className="flex items-center gap-4 text-xs text-muted-foreground/70">
                  <span className="flex items-center gap-1.5">
                    <ArrowBigUp className="h-3.5 w-3.5 text-emerald-500" />
                    {voteState.upvotes}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ArrowBigDown className="h-3.5 w-3.5 text-rose-500" />
                    {voteState.downvotes}
                  </span>
               </div>
            </div>
          </CardContent>

          <CardFooter className="pt-4 border-t border-white/5 bg-white/5 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={voteState.userVote === 1 ? 'default' : 'outline'}
                size="sm"
                className="w-full gap-2 text-xs font-semibold uppercase tracking-wider h-10"
                onClick={() => handleVote(1)}
                disabled={isVotePending}
              >
                {isVotePending && voteState.userVote === 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowBigUp className="h-3.5 w-3.5" />}
                Upvote
                <span>{voteState.upvotes}</span>
              </Button>
              <Button 
                variant={voteState.userVote === -1 ? 'destructive' : 'outline'}
                size="sm" 
                className="w-full gap-2 text-xs font-semibold uppercase tracking-wider h-10"
                onClick={() => handleVote(-1)}
                disabled={isVotePending}
              >
                {isVotePending && voteState.userVote === -1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowBigDown className="h-3.5 w-3.5" />}
                Downvote
                <span>{voteState.downvotes}</span>
              </Button>
            </div>

            <div className={`grid gap-3 ${isFolder ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                <div className="text-[10px] text-muted-foreground flex items-center justify-center rounded-md border border-dashed border-white/10 p-2 text-center leading-tight">
                  Folder download not supported
                </div>
              )}
            </div>
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
