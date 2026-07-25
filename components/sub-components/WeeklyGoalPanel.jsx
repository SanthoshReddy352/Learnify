'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { Flame, Target, CheckCircle2, ArrowRight } from 'lucide-react'
import {
  deriveWeeklyGoal,
  deriveActivityCalendar,
  deriveSubjectCompletion,
  streakInZone
} from '@/lib/gamification/goals'

// Weekly goal, streak and completion visibility (Plan P11.2).
//
// Everything shown here is derived in the browser from raw study logs, in the
// learner's own timezone — the server does not need to know what day it is where
// they are. Framing is personal progress: no leaderboard, no comparison, and a
// missed goal costs nothing (see the copy below).

const PACE_COPY = {
  ahead: 'Ahead of pace for this week',
  on_track: 'On pace for this week',
  behind: 'A little behind pace — plenty of week left'
}

export default function WeeklyGoalPanel({ logs = [], weeklyGoal, subjectStats = [], className = '' }) {
  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])

  const goal = useMemo(
    () => deriveWeeklyGoal({ logs, goal: weeklyGoal, timeZone }),
    [logs, weeklyGoal, timeZone]
  )
  const calendar = useMemo(
    () => deriveActivityCalendar({ logs, timeZone, days: 14 }),
    [logs, timeZone]
  )
  const streak = useMemo(() => streakInZone(logs, { timeZone }), [logs, timeZone])
  const completion = useMemo(() => deriveSubjectCompletion(subjectStats), [subjectStats])

  // On the last day of the week "0 days left" is more confusing than "today".
  const daysLeftCopy = goal.daysLeft === 0
    ? 'last day of the week'
    : `${goal.daysLeft} day${goal.daysLeft === 1 ? '' : 's'} left`

  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      {/* Weekly goal */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">This week</p>
        </div>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Flame className="h-3 w-3" />
            {streak}-day streak
          </span>
        )}
      </div>

      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="text-base font-semibold text-foreground">{goal.done}</span>
          {' '}of {goal.goal} reviews
        </p>
        <p className="text-xs text-muted-foreground">{daysLeftCopy}</p>
      </div>

      <Progress value={Math.round(goal.progress * 100)} className="mb-2 h-2" />

      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        {goal.met ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            Goal reached — anything else this week is a bonus.
          </>
        ) : (
          PACE_COPY[goal.pace]
        )}
      </p>

      {/* Last two weeks of activity */}
      <p className="mb-2 text-xs font-medium text-muted-foreground">Last 14 days</p>
      <div className="mb-4 flex gap-1">
        {calendar.map((day) => (
          <div
            key={day.dateKey}
            title={`${day.dateKey}: ${day.count} session${day.count === 1 ? '' : 's'}`}
            aria-label={`${day.dateKey}: ${day.count} sessions`}
            className={`h-6 flex-1 rounded-sm ${
              day.active ? 'bg-primary/70' : 'bg-muted'
            } ${day.isToday ? 'ring-1 ring-primary ring-offset-1 ring-offset-card' : ''}`}
          />
        ))}
      </div>

      {/* Closest to finished */}
      {completion.nextUp.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Closest to finished
          </p>
          <ul className="space-y-1.5">
            {completion.nextUp.map((subject) => (
              <li key={subject.id}>
                <Link
                  href={`/subjects/${subject.id}`}
                  className="group flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate text-foreground group-hover:underline">
                    {subject.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {subject.remaining} left
                    <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {completion.completedCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {completion.completedCount} subject{completion.completedCount === 1 ? '' : 's'} fully
          mastered.
        </p>
      )}
    </div>
  )
}
