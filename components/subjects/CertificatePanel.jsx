'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Award, Loader2, Copy, ExternalLink, Check } from 'lucide-react'
import { toast } from 'sonner'

// Claim + share a certificate for a passed exam (Plan P9.5).
//
// The button is only offered once the server would actually issue one — a
// self-paced learner sees it after the viva, a classroom learner straight after
// the pass. Eligibility is still re-checked server-side; this is only about not
// dangling a reward that will be refused.
export default function CertificatePanel({ attemptId, className = '' }) {
  const [certificate, setCertificate] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const verifyUrl = certificate
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/verify/${certificate.serial}`
    : ''

  const claim = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not issue a certificate')
      setCertificate(data.certificate)
      if (!data.alreadyIssued) toast.success('Certificate issued.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select the link and copy it manually.')
    }
  }

  if (!certificate) {
    return (
      <div className={`rounded-xl border border-primary/30 bg-primary/5 p-6 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <Award className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="text-base font-semibold text-foreground m-0">Claim your certificate</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          You have earned a verifiable certificate for this subject. It carries a code
          anyone can check without an account.
        </p>
        <Button onClick={claim} disabled={loading} variant="outline" className="border-primary/30 hover:bg-primary/10 text-primary">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Award className="mr-2 h-4 w-4" aria-hidden="true" />}
          {loading ? 'Issuing…' : 'Get my certificate'}
        </Button>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-primary/40 bg-primary/10 p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <Award className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="text-base font-semibold text-foreground m-0">
          {certificate.snapshot?.subject_title || 'Certificate'}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Issued to {certificate.snapshot?.learner_name} · {Math.round(Number(certificate.score))}%
      </p>

      <div className="rounded-lg border border-border bg-background/60 p-3 mb-4">
        <p className="text-xs text-muted-foreground m-0 mb-1">Certificate code</p>
        <p className="font-mono text-lg text-foreground m-0 break-all">{certificate.serial}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={copyLink} variant="outline" size="sm">
          {copied ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy verification link'}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={`/verify/${certificate.serial}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            View public page
          </a>
        </Button>
      </div>
    </div>
  )
}
