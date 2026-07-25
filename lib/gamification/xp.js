// Gamification engine (Plan P7.5).
//
// XP, levels and badges are DERIVED from existing progress data (mastered
// topics, completed reviews, streak, finished subjects) — not stored in a
// client-writable counter. That means no new table, no migration, and no way to
// cheat by writing your own XP. Framing is personal-progress, not competitive
// ranking (which demotivates the majority). All functions here are pure.

export const XP_REWARDS = {
  topic_completed: 50,
  review_completed: 20,
  subject_completed: 200,
  streak_day: 10
}

// Total XP derived from cumulative stats.
export function deriveXp(stats = {}) {
  const s = {
    topicsCompleted: 0,
    reviewsCompleted: 0,
    subjectsCompleted: 0,
    streakDays: 0,
    ...stats
  }
  return (
    s.topicsCompleted * XP_REWARDS.topic_completed +
    s.reviewsCompleted * XP_REWARDS.review_completed +
    s.subjectsCompleted * XP_REWARDS.subject_completed +
    s.streakDays * XP_REWARDS.streak_day
  )
}

// Quadratic level curve: reaching level L needs 100*(L-1)² cumulative XP.
export function levelForXp(xp) {
  const total = Math.max(0, Math.floor(xp || 0))
  const level = Math.floor(Math.sqrt(total / 100)) + 1
  const currentLevelFloor = 100 * (level - 1) ** 2
  const nextLevelAt = 100 * level ** 2
  const span = nextLevelAt - currentLevelFloor
  return {
    level,
    xp: total,
    currentLevelFloor,
    nextLevelAt,
    intoLevel: total - currentLevelFloor,
    progress: span > 0 ? (total - currentLevelFloor) / span : 0
  }
}

export const BADGES = [
  { id: 'first-steps', label: 'First Steps', desc: 'Complete your first topic', test: (s) => s.topicsCompleted >= 1 },
  { id: 'getting-going', label: 'Getting Going', desc: 'Complete 10 topics', test: (s) => s.topicsCompleted >= 10 },
  { id: 'scholar', label: 'Scholar', desc: 'Complete 50 topics', test: (s) => s.topicsCompleted >= 50 },
  { id: 'subject-master', label: 'Subject Master', desc: 'Finish an entire subject', test: (s) => s.subjectsCompleted >= 1 },
  { id: 'reviewer', label: 'Reviewer', desc: 'Complete 25 reviews', test: (s) => s.reviewsCompleted >= 25 },
  { id: 'consistent', label: 'Consistent', desc: 'Keep a 7-day streak', test: (s) => s.streakDays >= 7 },
  { id: 'dedicated', label: 'Dedicated', desc: 'Keep a 30-day streak', test: (s) => s.streakDays >= 30 }
]

function normalizeStats(stats = {}) {
  return {
    topicsCompleted: 0,
    reviewsCompleted: 0,
    subjectsCompleted: 0,
    streakDays: 0,
    ...stats
  }
}

// Ids of badges currently earned from the stats.
export function evaluateBadges(stats = {}) {
  const s = normalizeStats(stats)
  return BADGES.filter((b) => b.test(s)).map((b) => b.id)
}

// Derive review count + current streak from raw study logs. Pure/testable.
// A streak is consecutive calendar days (local) with ≥1 log, counting from today
// (or yesterday, if nothing is logged today yet).
export function deriveCountsFromLogs(logs = [], now = new Date()) {
  const reviewsCompleted = logs.filter((l) => l.session_type === 'review').length

  const dayKey = (d) => {
    const x = new Date(d)
    return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  }
  const days = new Set(logs.map((l) => dayKey(l.created_at)))

  let streakDays = 0
  const cursor = new Date(now)
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(dayKey(cursor))) {
    streakDays += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return { reviewsCompleted, streakDays }
}

// Full derived gamification snapshot for display.
export function deriveGamification(stats = {}) {
  const s = normalizeStats(stats)
  const xp = deriveXp(s)
  const earned = new Set(evaluateBadges(s))
  return {
    ...levelForXp(xp),
    badges: BADGES.map((b) => ({ id: b.id, label: b.label, desc: b.desc, earned: earned.has(b.id) })),
    earnedCount: earned.size
  }
}
