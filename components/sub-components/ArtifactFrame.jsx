'use client'

// Sandboxed renderer for AI-generated interactive artifacts (Plan P7.3).
//
// SECURITY — the `html` is model-generated and therefore UNTRUSTED. It is
// rendered via `srcDoc` in an iframe whose `sandbox` grants ONLY `allow-scripts`.
// Critically it does NOT include `allow-same-origin`: the frame runs in an
// opaque/null origin, so its script cannot read the app's cookies, localStorage,
// Supabase session, or DOM, and cannot make same-origin requests. The CSP
// meta also blocks any network access from inside the frame.
//
// DO NOT add `allow-same-origin` (it would let the widget escape the sandbox and
// reach the user's session). Never render artifact html anywhere but here.

const FRAME_CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; " +
  "style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'\">"

function withCsp(html) {
  const doc = String(html || '')
  // Inject the CSP into <head> if present, else prepend it.
  if (/<head[^>]*>/i.test(doc)) {
    return doc.replace(/<head[^>]*>/i, (m) => `${m}\n${FRAME_CSP}`)
  }
  return `${FRAME_CSP}\n${doc}`
}

export default function ArtifactFrame({ html, title, description, className = '' }) {
  if (!html) return null

  return (
    <figure className={`my-8 ${className}`}>
      <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-card">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs font-medium text-muted-foreground truncate">
            {title || 'Interactive widget'}
          </span>
        </div>
        <iframe
          title={title || 'Interactive learning widget'}
          srcDoc={withCsp(html)}
          // allow-scripts ONLY — never allow-same-origin (see file header).
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-[480px] bg-white dark:bg-neutral-900 border-0"
        />
      </div>
      {description && (
        <figcaption className="mt-3 px-4 text-sm text-muted-foreground italic text-center">
          {description}
        </figcaption>
      )}
    </figure>
  )
}
