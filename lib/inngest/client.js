import { Inngest } from 'inngest'

// Single Inngest app for Learnify background jobs (Plan P5).
// In local dev the Inngest Dev Server picks this up with no keys; in production
// set INNGEST_EVENT_KEY (send) + INNGEST_SIGNING_KEY (serve endpoint auth).
export const inngest = new Inngest({ id: 'learnify' })

// Event names the worker listens for. Keep these stable — they are the contract
// between the enqueue path and the worker.
export const EVENTS = {
  TOPIC_CONTENT_REQUESTED: 'topic-content/requested'
}
