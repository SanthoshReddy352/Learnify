'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ArrowBigUp, ArrowBigDown } from 'lucide-react'
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card'

export default function HelpfulFeedback({ courseId }) {
  const [vote, setVote] = useState(null)
  const [userId, setUserId] = useState(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchUserAndVote = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data, error } = await supabase
          .from('feedback_votes')
          .select('vote_type')
          .eq('course_id', courseId)
          .eq('user_id', user.id)
          .single()
        
        if (data && !error) {
          setVote(data.vote_type)
        }
      }
    }
    fetchUserAndVote()
  }, [courseId, supabase])

  const handleVote = async (newVote) => {
    if (!userId) return

    const finalVote = vote === newVote ? null : newVote

    setVote(finalVote) // Optimistic update

    if (finalVote === null) {
      await supabase
        .from('feedback_votes')
        .delete()
        .match({ course_id: courseId, user_id: userId })
    } else {
      // Use match + update or insert, or upsert.
      // We will try upsert if a unique constraint is defined as requested
      await supabase
        .from('feedback_votes')
        .upsert(
          { course_id: courseId, user_id: userId, vote_type: finalVote },
          { onConflict: 'user_id, course_id' }
        )
    }
  }

  return (
    <Card className="bg-gradient-to-b from-card to-muted border-border shadow-md w-full">
      <CardHeader className="pb-3 text-center">
        <CardTitle className="text-sm md:text-md text-muted-foreground">Do you find this helpful?</CardTitle>
      </CardHeader>
      <CardContent className="flex justify-center gap-4">
        <Button 
          variant={vote === 1 ? "default" : "outline"} 
          onClick={() => handleVote(1)}
          className="flex-1"
        >
          <ArrowBigUp className="mr-2 h-4 w-4" /> Upvote
        </Button>
        <Button 
          variant={vote === -1 ? "destructive" : "outline"} 
          onClick={() => handleVote(-1)}
          className="flex-1"
        >
          <ArrowBigDown className="mr-2 h-4 w-4" /> Downvote
        </Button>
      </CardContent>
    </Card>
  )
}
