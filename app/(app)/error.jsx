'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { RotateCcw, LayoutDashboard } from 'lucide-react'
import { reportClientError } from '@/lib/observability/client'

// Error boundary for the signed-in app (Plan P13.2).
//
// Scoped to the (app) route group, so the sidebar and header survive and the user
// keeps their bearings — one broken page does not take the whole shell down. The
// error is reported before anything is rendered.
export default function AppError({ error, reset }) {
  useEffect(() => {
    reportClientError(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">This page didn&apos;t load</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Something went wrong while rendering it, and the problem has been logged. Your subjects,
          progress and review schedule are unaffected — nothing was lost.
        </p>
        {/* The digest is the only handle a user can quote in a bug report that
            ties their crash to a specific server-side error. */}
        {error?.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => reset()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => { window.location.href = '/dashboard' }}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
