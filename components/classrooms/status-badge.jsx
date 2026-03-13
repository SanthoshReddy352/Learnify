'use client'

import { Badge } from '@/components/ui/badge'
import { getProgressStatusMeta } from '@/lib/classrooms/format'

export function StatusBadge({ status }) {
  const meta = getProgressStatusMeta(status)

  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  )
}
