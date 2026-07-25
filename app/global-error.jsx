'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/observability/client'

// Last-resort error boundary (Plan P13.2).
//
// Catches errors thrown in the root layout itself, where no app chrome is
// available — so this file must render its own <html>/<body>, and cannot import
// anything that depends on the theme provider or the UI kit.
//
// Without this, a root-layout failure is a blank white page and nothing in the
// logs.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    reportClientError(error, { path: 'global-error' })
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          background: '#ffffff',
          color: '#09090b'
        }}
      >
        <main style={{ maxWidth: '30rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '0.75rem', lineHeight: 1.6, color: '#52525b' }}>
            Learnify hit an unexpected error and could not finish loading. The problem has been
            logged. Your subjects, progress and review schedule are unaffected.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
              borderRadius: '0.5rem',
              border: '1px solid #d4d4d8',
              background: '#ffffff',
              cursor: 'pointer'
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
