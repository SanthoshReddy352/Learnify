'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertTriangle, Eye, Table2, LayoutGrid } from 'lucide-react'
import { CELL_STATES, CELL_LABELS } from '@/lib/teacher/insights'

// Class-wide concept heatmap (Plan P12.1).
//
// Answers one question — "which concepts is the whole class failing?" — and rows
// arrive already sorted worst-first, so the answer is the top of the grid rather
// than something to scan for.
//
// Color: a validated SEQUENTIAL single-hue ramp (--heat-1..4 in globals.css)
// encoding CONCERN, so trouble is the DARK end and reads at a glance. Being one
// hue, it carries no colorblindness risk by construction.
//
// Color never carries meaning alone, per the dataviz accessibility pass: the
// legend is always present with labels, every cell has a title + aria-label
// naming its band in words, and a table view is one click away.

const CELL_STYLE = {
  [CELL_STATES.SOLID]: { background: 'var(--heat-1)' },
  [CELL_STATES.STEADY]: { background: 'var(--heat-2)' },
  [CELL_STATES.WATCH]: { background: 'var(--heat-3)' },
  [CELL_STATES.STRUGGLING]: { background: 'var(--heat-4)' },
  [CELL_STATES.IN_PROGRESS]: { background: 'var(--heat-progress)' },
  // Not on the ramp: an empty cell with a hairline ring reads as "nothing here"
  // rather than as a value near zero.
  [CELL_STATES.NOT_STARTED]: { background: 'transparent', boxShadow: 'inset 0 0 0 1px hsl(var(--border))' }
}

const LEGEND = [
  CELL_STATES.SOLID,
  CELL_STATES.STEADY,
  CELL_STATES.WATCH,
  CELL_STATES.STRUGGLING,
  CELL_STATES.IN_PROGRESS,
  CELL_STATES.NOT_STARTED
]

const ROWS_COLLAPSED = 8

function cellTitle(row, cell) {
  const parts = [`${cell.name} — ${row.label}`, CELL_LABELS[cell.state]]
  if (cell.reviewCount > 0) {
    parts.push(`${cell.averageQuality}/5 over ${cell.reviewCount} review${cell.reviewCount === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

export default function ConceptHeatmap({ heatmap, onSelectStudent }) {
  const [showAll, setShowAll] = useState(false)
  const [asTable, setAsTable] = useState(false)

  const rows = heatmap?.rows || []
  const students = heatmap?.students || []
  const noun = heatmap?.source === 'concepts' ? 'Concept' : 'Topic'

  const visibleRows = showAll ? rows : rows.slice(0, ROWS_COLLAPSED)

  if (rows.length === 0 || students.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nothing to map yet — this fills in once students start reviewing topics.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The legend is not optional: it is what keeps the color from being the
            only carrier of meaning. */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {LEGEND.map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-[2px]"
                style={CELL_STYLE[state]}
              />
              {CELL_LABELS[state]}
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="text-xs"
        >
          {asTable ? <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> : <Table2 className="mr-1.5 h-3.5 w-3.5" />}
          {asTable ? 'Grid view' : 'Table view'}
        </Button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{noun}</TableHead>
                <TableHead className="text-right">Struggling</TableHead>
                <TableHead className="text-right">Watching</TableHead>
                <TableHead className="text-right">With results</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.strugglingCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.watchCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.evidenceCount} of {students.length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-fit space-y-1">
            {visibleRows.map((row) => (
              <div key={row.key} className="flex items-center gap-3">
                <div className="w-40 shrink-0 truncate text-sm sm:w-52" title={row.label}>
                  {row.label}
                </div>
                {/* 2px surface gap between cells, per the mark spec. */}
                <div className="flex gap-0.5">
                  {row.cells.map((cell) => (
                    <button
                      key={cell.studentUserId}
                      type="button"
                      onClick={() => onSelectStudent?.(cell.studentUserId)}
                      title={cellTitle(row, cell)}
                      aria-label={cellTitle(row, cell)}
                      className="h-7 w-7 rounded-[3px] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      style={CELL_STYLE[cell.state]}
                    />
                  ))}
                </div>
                <div className="w-28 shrink-0 text-xs text-muted-foreground">
                  {row.strugglingCount > 0 ? (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {row.strugglingCount} struggling
                    </span>
                  ) : row.watchCount > 0 ? (
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {row.watchCount} watching
                    </span>
                  ) : row.evidenceCount === 0 ? (
                    'No results yet'
                  ) : (
                    'Looks fine'
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!asTable && rows.length > ROWS_COLLAPSED && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} className="text-xs">
          {showAll ? 'Show fewer' : `Show all ${rows.length} ${noun.toLowerCase()}s`}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        {heatmap.source === 'concepts'
          ? 'Rows are concepts taught across topics. Darker means more concern; click a square to open that student.'
          : 'Rows are topics. Darker means more concern; click a square to open that student.'}
      </p>
    </div>
  )
}
