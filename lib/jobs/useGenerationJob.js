'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Client hook for background generation jobs (Plan P5.2).
//
// Enqueues a job via the /enqueue route, then tracks it live through Supabase
// Realtime on the `generation_jobs` row (RLS-scoped to the user). Exposes
// progress/stage for a progress UI and resolves when the job terminates.
//
// NOTE: requires the `generation_jobs` table, whose migration is deferred to
// P14 — until then the /enqueue route 500s, so callers keep the sync path
// behind the NEXT_PUBLIC_ASYNC_GENERATION flag.

const TERMINAL = new Set(['succeeded', 'failed', 'canceled'])

export function useGenerationJob() {
  const [supabase] = useState(() => createClient())
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')

  const channelRef = useRef(null)

  const teardown = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [supabase])

  // Remove any live subscription on unmount.
  useEffect(() => teardown, [teardown])

  const applyJob = useCallback((job) => {
    if (!job) return
    if (job.status) setStatus(job.status)
    if (typeof job.progress === 'number') setProgress(job.progress)
    if (job.stage) setStage(job.stage)
  }, [])

  const reset = useCallback(() => {
    teardown()
    setStatus('idle')
    setProgress(0)
    setStage('')
  }, [teardown])

  // Enqueue a topic-content job and resolve with the final job row on success
  // (rejects on failure/cancel). The caller re-reads the topic content, which
  // the worker wrote to `topics`.
  const runTopicContent = useCallback((body) => {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn, arg) => {
        if (settled) return
        settled = true
        teardown()
        fn(arg)
      }

      const start = async () => {
        teardown()
        setStatus('queued')
        setProgress(0)
        setStage('Queued')

        try {
          const res = await fetch('/api/generate-topic-content/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(data.error || 'Failed to start generation')
          }
          const jobId = data.jobId
          if (!jobId) throw new Error('No job id returned')

          const finishIfTerminal = (job) => {
            applyJob(job)
            if (TERMINAL.has(job.status)) {
              if (job.status === 'succeeded') settle(resolve, job)
              else settle(reject, new Error(job.error || `Generation ${job.status}`))
            }
          }

          // Subscribe BEFORE the catch-up fetch so no update is missed.
          const channel = supabase
            .channel(`generation_job:${jobId}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'generation_jobs',
                filter: `id=eq.${jobId}`
              },
              (payload) => finishIfTerminal(payload.new)
            )
            .subscribe()
          channelRef.current = channel

          // Catch-up: the job may already have advanced/finished before the
          // subscription attached.
          const { data: current } = await supabase
            .from('generation_jobs')
            .select('*')
            .eq('id', jobId)
            .maybeSingle()
          if (current) finishIfTerminal(current)
        } catch (err) {
          setStatus('failed')
          settle(reject, err instanceof Error ? err : new Error(String(err)))
        }
      }

      start()
    })
  }, [supabase, applyJob, teardown])

  return { status, progress, stage, runTopicContent, reset }
}
