import { inngest, EVENTS } from '@/lib/inngest/client'

// Create a generation_jobs row (written as the user, so RLS applies) and emit
// the Inngest event the background worker consumes (Plan P5). Returns { jobId }.
// Access is expected to be verified by the caller BEFORE enqueuing.
export async function enqueueTopicContentJob(supabase, { userId, input }) {
  const { data: job, error } = await supabase
    .from('generation_jobs')
    .insert({
      user_id: userId,
      kind: 'topic_content',
      status: 'queued',
      input,
      subject_id: input.subjectId || null,
      topic_id: input.topicId || null
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create generation job: ${error.message}`)
  }

  await inngest.send({
    name: EVENTS.TOPIC_CONTENT_REQUESTED,
    data: { jobId: job.id, userId, ...input }
  })

  return { jobId: job.id }
}
