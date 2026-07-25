'use client'

import { Progress } from '@/components/ui/progress'
import { Sparkles } from 'lucide-react'

// Progress UI for background generation jobs (Plan P5.2). Shows the worker's
// live stage + percentage when driven by useGenerationJob; falls back to an
// indeterminate pulse when no real progress is available (e.g. the synchronous
// path, where the server streams nothing back).
export default function GenerationProgress({
  progress = 0,
  stage = '',
  indeterminate = false
}) {
  return (
    <div className="flex flex-col items-center w-full max-w-sm">
      <Sparkles className="h-10 w-10 mb-4 text-primary animate-spin-slow" />
      <p className="mb-3 text-sm text-center">
        {stage || 'Generating comprehensive guide...'}
      </p>
      {indeterminate ? (
        <p className="text-xs text-muted-foreground animate-pulse">
          This can take a little while — you can keep this tab open.
        </p>
      ) : (
        <div className="w-full">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1 text-right">{progress}%</p>
        </div>
      )}
    </div>
  )
}
