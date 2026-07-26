'use client'

import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Shared page chrome for the authenticated app shell.
 *
 * Everything here is built from theme tokens only. The classroom and teacher
 * pages used to hardcode `bg-black/10`, `bg-white/[0.04]` and `text-white`,
 * which read correctly in dark mode and turned into white-on-white in light
 * mode. Routing those surfaces through `card`/`muted`/`border` keeps both
 * themes honest and gives every page the same radii and spacing.
 *
 * The app layout already supplies max-width, padding and `space-y-8`, so
 * nothing in here adds page-level padding of its own.
 */

/** Small uppercase pill that names the section a page belongs to. */
export function Eyebrow({ icon: Icon, children, className }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1',
        'text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground',
        className
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
      {children}
    </div>
  )
}

/**
 * Page title block. Matches the dashboard's plain-text header rather than the
 * old gradient hero panels, so a learner moving between Subjects, Classrooms
 * and the teacher portal sees one consistent heading treatment.
 */
export function PageHeader({
  eyebrow,
  eyebrowIcon,
  title,
  description,
  onBack,
  backLabel = 'Back',
  actions,
  className
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {onBack && (
        <Button variant="ghost" size="sm" className="-ml-3 h-8 w-fit text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {backLabel}
        </Button>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow && <Eyebrow icon={eyebrowIcon}>{eyebrow}</Eyebrow>}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** Heading for a section inside a page, one level down from PageHeader. */
export function SectionHeading({ title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Responsive row of StatCards. Defaults to four across on wide screens. */
export function StatGrid({ children, className }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>
  )
}

/**
 * A single metric. Deliberately takes a `value` rather than free text — the
 * old hero panels padded their stat rows with prose tiles ("Use the matching
 * account") that looked like data but carried none.
 */
export function StatCard({ label, value, icon: Icon, hint, className }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

/** Dashed placeholder shown when a collection is empty. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-7 w-7 text-primary" />
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/**
 * Inset panel used for list rows and callouts inside a Card. One shared
 * surface so nested content never stacks card-on-card at the same elevation.
 */
export function Panel({ children, className, ...props }) {
  return (
    <div className={cn('rounded-lg border border-border bg-muted/40 p-4', className)} {...props}>
      {children}
    </div>
  )
}

/** Skeleton stand-in used while a page's first fetch is in flight. */
export function PageLoading({ stats = 4, rows = 3, showStats = true }) {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {showStats && (
        <StatGrid>
          {Array.from({ length: stats }).map((_, index) => (
            <Skeleton key={index} className="h-[116px] rounded-xl" />
          ))}
        </StatGrid>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
