'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck } from 'lucide-react'
import { normalizeSerial } from '@/lib/assessment/certificate'

// Entry point for someone holding a certificate code (Plan P9.5). Public — the
// person checking a certificate is not a Learnify user.
export default function VerifyLandingPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const serial = normalizeSerial(code)
    if (!serial) {
      setError('Codes look like LRN-XXXX-XXXX-XXXX. Check the characters and try again.')
      return
    }
    router.push(`/verify/${serial}`)
  }

  return (
    <div className="max-w-lg mx-auto py-10">
      <div className="glass-card rounded-2xl border border-border p-6 md:p-10">
        <div className="flex items-center gap-2 text-primary mb-3">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider">Verify a certificate</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground m-0">Check a Learnify certificate</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          Enter the code printed on the certificate. You will see who it was issued to, what they were
          assessed on, and whether it is still valid.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cert-code">Certificate code</Label>
            <Input
              id="cert-code"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError('') }}
              placeholder="LRN-XXXX-XXXX-XXXX"
              className="font-mono"
              autoComplete="off"
              aria-describedby={error ? 'cert-code-error' : undefined}
              aria-invalid={error ? 'true' : undefined}
            />
            {error && (
              <p id="cert-code-error" className="text-sm text-destructive m-0" role="alert">{error}</p>
            )}
          </div>
          <Button type="submit" className="w-full">Verify</Button>
        </form>
      </div>
    </div>
  )
}
