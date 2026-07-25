'use client'

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Class effort + recall trend (Plan P12.4).
//
// TWO panels, not one chart with two y-axes. Minutes and a 0-5 recall rating
// share no scale, and a dual-axis chart is the single thing the dataviz skill
// forbids outright — the crossing point of the two lines would be an artifact of
// the scales, and teachers would read meaning into it.
//
// One series per panel, so neither needs a legend: the panel title names it.
// Both use --primary, which the validator clears on this app's light and dark
// card surfaces (contrast >= 3:1, in the lightness band, above the chroma floor).

const AXIS = 'hsl(var(--muted-foreground))'
const GRID = 'hsl(var(--border))'
const SERIES = 'hsl(var(--primary))'

function TooltipBox({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-foreground">Week of {label}</div>
      <div className="mt-0.5 text-muted-foreground">
        {value === null || value === undefined ? 'No data' : `${value}${unit}`}
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children, empty }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="h-[170px] w-full">
        {empty ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Not enough activity yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default function ClassTrend({ trend = [] }) {
  const hasEffort = trend.some((week) => week.minutes > 0)
  const hasQuality = trend.some((week) => week.averageQuality !== null)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel
        title="Class study time"
        subtitle="Total minutes logged per week"
        empty={!hasEffort}
      >
        <BarChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<TooltipBox unit=" min" />} cursor={{ fill: 'hsl(var(--foreground)/0.04)' }} />
          {/* 4px rounded data-end, square where it meets the baseline. */}
          <Bar dataKey="minutes" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={38} />
        </BarChart>
      </Panel>

      <Panel
        title="Average recall rating"
        subtitle="How well the class recalled what they reviewed (0-5)"
        empty={!hasQuality}
      >
        <LineChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<TooltipBox unit=" / 5" />} />
          {/* connectNulls stays off: a week nobody rated a review is a GAP, not a
              value. Bridging it would invent a measurement. */}
          <Line
            type="monotone"
            dataKey="averageQuality"
            stroke={SERIES}
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 4, fill: SERIES, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </Panel>
    </div>
  )
}
