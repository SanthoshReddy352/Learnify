import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { generateTopicContentJob } from '@/lib/inngest/functions/generate-topic-content'
import { sendReviewRemindersJob } from '@/lib/inngest/functions/send-review-reminders'

// Inngest serve endpoint (Plan P5). Inngest calls this route to run functions.
//
// maxDuration raises the Vercel function cap for long generation. Vercel Pro
// allows up to 300s; the Hobby/free tier caps at 60s — so on free tier a single
// >60s generation still needs P6.4 (section-by-section steps) to fit. Until
// then this is best-effort on free tier and reliable on Pro.
export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateTopicContentJob, sendReviewRemindersJob]
})
