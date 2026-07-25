import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { generateTopicContentJob } from '@/lib/inngest/functions/generate-topic-content'
import { sendReviewRemindersJob } from '@/lib/inngest/functions/send-review-reminders'

// Inngest serve endpoint (Plan P5). Inngest calls this route to run functions.
//
// 60 = the Vercel HOBBY ceiling. This must NOT be raised speculatively: a
// maxDuration above the plan's limit fails the BUILD outright, it is not clamped
// and it is not a warning. (It was 300 here, which cannot deploy on Hobby.)
// On Pro, raise this to 300.
//
// The number is not what makes long generation work anyway. Inngest invokes THIS
// route once per step, so a function split into steps gets a fresh 60s budget per
// step and can run far longer than 60s in total. That is why
// generate-topic-content is written as steps rather than one long call.
export const maxDuration = 60

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateTopicContentJob, sendReviewRemindersJob]
})
