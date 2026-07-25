import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { normalizeSerial } from '@/lib/assessment/certificate'
import { CheckCircle2, XCircle, ShieldAlert, GraduationCap } from 'lucide-react'

// Public certificate verification (Plan P9.5).
//
// Reached by whoever the holder gave a serial to — an employer, an admissions
// office — so it is deliberately outside the login wall (see middleware) and
// deliberately plain. It states what the platform actually observed and what it
// did not, because a verification page that oversells is worse than none: the
// person reading it is making a decision about someone else's future.
//
// The lookup goes through the `verify_certificate` SECURITY DEFINER function,
// which returns at most the single row whose serial you already know. There is
// no way to list certificates from here.

export const dynamic = 'force-dynamic'

function Shell({ children }) {
  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className="glass-card rounded-2xl border border-border p-6 md:p-10">{children}</div>
      <p className="text-center text-xs text-muted-foreground mt-6">
        Verified by <Link href="/" className="underline hover:text-foreground">Learnify</Link>
      </p>
    </div>
  )
}

export default async function VerifyCertificatePage({ params }) {
  const raw = decodeURIComponent(params.serial || '')
  const serial = normalizeSerial(raw)

  if (!serial) {
    return (
      <Shell>
        <div className="flex items-start gap-4">
          <XCircle className="h-8 w-8 text-destructive shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground m-0">That is not a certificate code</h1>
            <p className="text-muted-foreground mt-2">
              Codes look like <code className="text-foreground">LRN-XXXX-XXXX-XXXX</code>. Check for a
              typo and try again.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('verify_certificate', { p_serial: serial })
  const cert = Array.isArray(data) ? data[0] : data

  if (error || !cert) {
    return (
      <Shell>
        <div className="flex items-start gap-4">
          <XCircle className="h-8 w-8 text-destructive shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground m-0">No certificate with this code</h1>
            <p className="text-muted-foreground mt-2">
              <span className="font-mono text-foreground">{serial}</span> does not match any certificate
              issued by Learnify. If it was copied by hand, check the characters again.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  const concepts = Array.isArray(cert.concepts) ? cert.concepts : []
  const issued = new Date(cert.issued_at)

  return (
    <Shell>
      {cert.revoked ? (
        <div className="flex items-center gap-3 mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
          <p className="text-sm text-foreground m-0">
            <strong>This certificate has been revoked.</strong> It is no longer a valid record of
            completion.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-6 rounded-lg border border-primary/40 bg-primary/10 p-4">
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <p className="text-sm text-foreground m-0">
            <strong>Valid certificate.</strong> Issued by Learnify and unchanged since.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 text-primary mb-2">
        <GraduationCap className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider">Certificate of completion</span>
      </div>

      <h1 className="text-3xl font-semibold text-foreground m-0">{cert.learner_name}</h1>
      <p className="text-lg text-muted-foreground mt-1 mb-6">
        completed <span className="text-foreground font-medium">{cert.subject_title}</span>
      </p>

      <dl className="grid grid-cols-2 gap-4 text-sm border-t border-border pt-6">
        <div>
          <dt className="text-muted-foreground">Exam score</dt>
          <dd className="text-foreground font-medium text-lg m-0">{Math.round(Number(cert.score))}%</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Issued</dt>
          <dd className="text-foreground font-medium text-lg m-0">
            <time dateTime={issued.toISOString()}>
              {issued.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Certificate code</dt>
          <dd className="text-foreground font-mono m-0">{cert.serial}</dd>
        </div>
      </dl>

      {concepts.length > 0 && (
        <div className="mt-6 border-t border-border pt-6">
          <h2 className="text-sm text-muted-foreground font-normal m-0 mb-3">Assessed on</h2>
          <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
            {concepts.map((c) => (
              <li key={c} className="text-xs rounded-full border border-border px-3 py-1 text-foreground">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What this does and does not attest to. An employer reading this page is
          making a decision about a person; leaving them to guess what was
          actually verified would be the dishonest option. */}
      <div className="mt-6 border-t border-border pt-6 text-sm text-muted-foreground">
        <h2 className="text-sm text-foreground font-medium m-0 mb-2">What this attests to</h2>
        {cert.mode === 'classroom' ? (
          <p className="m-0">
            The holder passed a server-graded exam sat inside a teacher-run classroom on Learnify.
            The exam was drawn from a question bank generated from the course material, randomized per
            attempt, and graded on the server. Their teacher had the opportunity to review the attempt.
          </p>
        ) : (
          <p className="m-0">
            The holder passed a server-graded exam in a self-paced subject and then completed a spoken
            check, explaining their own answers in their own words, which was assessed separately.
            The written exam was not invigilated; the spoken check is what this certificate rests on.
          </p>
        )}
      </div>
    </Shell>
  )
}
