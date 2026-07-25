'use client'

import { Progress } from '@/components/ui/progress'
import { Award, Lock } from 'lucide-react'
import { deriveGamification } from '@/lib/gamification/xp'

// Personal-progress gamification display (Plan P7.5). Takes derived stats and
// renders level + XP progress + earned/locked badges. No competitive ranking.
export default function GamificationPanel({ stats = {}, className = '' }) {
  const g = deriveGamification(stats)

  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary font-bold">
            {g.level}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Level {g.level}</p>
            <p className="text-xs text-muted-foreground">{g.xp} XP</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {g.intoLevel}/{g.nextLevelAt - g.currentLevelFloor} to next
        </p>
      </div>

      <Progress value={Math.round(g.progress * 100)} className="h-2 mb-4" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {g.badges.map((b) => (
          <div
            key={b.id}
            title={b.desc}
            className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${
              b.earned
                ? 'border-primary/30 bg-primary/5 text-foreground'
                : 'border-border bg-muted/40 text-muted-foreground'
            }`}
          >
            {b.earned ? (
              <Award className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Lock className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
