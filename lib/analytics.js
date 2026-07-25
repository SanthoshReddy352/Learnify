'use server'

import { createClient } from '@/lib/supabase/server'
import { deriveCountsFromLogs } from '@/lib/gamification/xp'
import { DEFAULT_WEEKLY_GOAL } from '@/lib/gamification/goals'
import { fetchPreferences } from '@/lib/reminders/store'
import { fetchConceptStateForUser, orderReviewQueue } from '@/lib/memory/concept-state'

// Review count + current streak for gamification (P7.5), derived from study_logs.
export async function getGamificationCounts(userId) {
  const supabase = await createClient()
  try {
    const { data: logs, error } = await supabase
      .from('study_logs')
      .select('session_type, created_at')
      .eq('user_id', userId)
    if (error) throw error
    return deriveCountsFromLogs(logs || [])
  } catch (e) {
    console.error('getGamificationCounts error:', e)
    return { reviewsCompleted: 0, streakDays: 0 }
  }
}

// How far back the engagement panel reads. Long enough for a 4-week goal
// suggestion and a 14-day activity strip, short enough to stay a small payload.
const ENGAGEMENT_LOOKBACK_DAYS = 45

/**
 * Raw material for the P11.2 engagement panel: recent study logs plus the
 * learner's weekly goal target.
 *
 * Deliberately returns raw timestamps rather than pre-bucketed counts, because
 * the day/week boundaries have to be drawn in the learner's OWN timezone and
 * only the browser knows that for certain. The pure functions in
 * lib/gamification/goals.js do the bucketing client-side.
 */
export async function getEngagementData(userId) {
  const supabase = await createClient()
  const since = new Date(Date.now() - ENGAGEMENT_LOOKBACK_DAYS * 86400000).toISOString()

  const empty = { logs: [], weeklyGoal: DEFAULT_WEEKLY_GOAL }
  try {
    const { data: logs, error } = await supabase
      .from('study_logs')
      .select('session_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
    if (error) throw error

    // The goal target lives in notification_preferences, which does not exist
    // until the P14 migration — fetchPreferences degrades to the default, so the
    // panel works either way.
    const prefs = await fetchPreferences(supabase, userId)

    return { logs: logs || [], weeklyGoal: prefs.weekly_review_goal }
  } catch (error) {
    console.error('Error getting engagement data:', error)
    return empty
  }
}

/**
 * Get study time grouped by day for the current week (or last 7 days)
 * Returns format compatible with Recharts
 */
export async function getStudyTimeByWeek(userId, subjectId = null) {
  const supabase = await createClient()
  
  try {
    let query = supabase
      .from('study_logs')
      .select('duration_minutes, session_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(new Date().setDate(new Date().getDate() - new Date().getDay())).toISOString()) // Start of this week (Sunday)

    if (subjectId) {
      query = query.eq('subject_id', subjectId)
    }

    const { data: logs, error } = await query

    if (error) throw error

    // Process logs into daily buckets
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const today = new Date()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay()) // Go back to Sunday (0)
    startOfWeek.setHours(0, 0, 0, 0)

    const weekData = []

    const isSameDay = (d1, d2) => {
      return d1.getFullYear() === d2.getFullYear() &&
             d1.getMonth() === d2.getMonth() &&
             d1.getDate() === d2.getDate()
    }

    for (let i = 0; i < 7; i++) {
      const currentDay = new Date(startOfWeek)
      currentDay.setDate(startOfWeek.getDate() + i)
      const label = days[currentDay.getDay()]

      // Filter logs for this day
      const dayLogs = logs.filter(log => {
        const logDate = new Date(log.created_at)
        return isSameDay(logDate, currentDay)
      })

      const learningMinutes = dayLogs
        .filter(l => l.session_type === 'learning')
        .reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0)

      const reviewMinutes = dayLogs
        .filter(l => l.session_type === 'review')
        .reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0)

      weekData.push({
        name: label,
        date: currentDay.toISOString(), // For reference if needed
        learning: Math.round(learningMinutes),
        review: Math.round(reviewMinutes)
      })
    }

    const totalMinutes = logs.reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0)

    return { weekData, totalMinutes: Math.round(totalMinutes) }

  } catch (error) {
    console.error('Error fetching study time:', error)
    return { weekData: [], totalMinutes: 0, error: error.message }
  }
}

/**
 * Identify weak topics based on average quality rating
 * Returns topics with rating < 3.0
 */
export async function getWeakTopics(subjectId) {
  const supabase = await createClient()

  try {
    // 1. Get logs with ratings for this subject
    const { data: logs, error } = await supabase
      .from('study_logs')
      .select('topic_id, quality_rating')
      .eq('subject_id', subjectId)
      .not('quality_rating', 'is', null) // Only review sessions have ratings

    if (error) throw error

    // 2. Aggregate ratings by topic
    const topicStats = {} // topicId -> { sum, count }
    
    logs.forEach(log => {
      if (!topicStats[log.topic_id]) {
        topicStats[log.topic_id] = { sum: 0, count: 0 }
      }
      topicStats[log.topic_id].sum += log.quality_rating
      topicStats[log.topic_id].count += 1
    })

    // 3. Find IDs with avg < 3.0
    const weakTopicIds = []
    for (const [id, stats] of Object.entries(topicStats)) {
      const avg = stats.sum / stats.count
      if (avg < 3.0) {
        weakTopicIds.push({ id, averageRating: avg.toFixed(1), count: stats.count })
      }
    }

    if (weakTopicIds.length === 0) return []

    // 4. Fetch topic details
    const { data: topics } = await supabase
      .from('topics')
      .select('id, title, status')
      .in('id', weakTopicIds.map(t => t.id))

    // Merge details
    return topics.map(topic => {
      const stat = weakTopicIds.find(t => t.id === topic.id)
      return {
        ...topic,
        averageRating: stat.averageRating,
        reviewCount: stat.count
      }
    }).sort((a, b) => a.averageRating - b.averageRating) // Lowest rating first

  } catch (error) {
    console.error('Error identifying weak topics:', error)
    return []
  }
}

/**
 * Get overall subject progress
 */
export async function getSubjectProgress(subjectId) {
  const supabase = await createClient()

  try {
    const { data: topics, error } = await supabase
      .from('topics')
      .select('status')
      .eq('subject_id', subjectId)

    if (error) throw error

    const total = topics.length
    if (total === 0) return { progress: 0, mastered: 0, total: 0 }

    const mastered = topics.filter(t => t.status === 'mastered').length
    const progress = (mastered / total) * 100

    return {
      progress: Math.round(progress),
      mastered,
      total
    }
  } catch (error) {
    console.error('Error fetching subject progress:', error)
    return { progress: 0, mastered: 0, total: 0 }
  }
}

/**
 * Get upcoming reviews for dashboard
 */
export async function getUpcomingReviews(subjectId, limit = 5) {
  const supabase = await createClient()
  
  try {
     const { data: topics, error } = await supabase
      .from('topics')
      .select('id, title, next_review_at, status')
      .eq('subject_id', subjectId)
      .in('status', ['reviewing', 'mastered'])
      .not('next_review_at', 'is', null)
      .order('next_review_at', { ascending: true })
      .limit(limit)

    if (error) throw error
    
    return topics
  } catch (error) {
    console.error('Error fetching upcoming reviews:', error)
    return []
  }
}

/**
 * Get global study stats for user dashboard
 */
export async function getGlobalAnalytics(userId) {
  const supabase = await createClient()
  
  try {
     // 1. Total study time (all time)
     const { data: allLogs, error: logError } = await supabase
        .from('study_logs')
        .select('duration_minutes')
        .eq('user_id', userId)
    
     if (logError) throw logError
     
     const totalMinutes = allLogs.reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0)

     // 2. Total subjects and mastery
     const { data: subjects, error: subjError } = await supabase
        .from('subjects')
        .select(`
            id, 
            title,
            topics (status)
        `)
        .eq('user_id', userId)

     if (subjError) throw subjError

     const subjectStats = subjects.map(sub => {
        const total = sub.topics.length
        const mastered = sub.topics.filter(t => t.status === 'mastered').length
        const progress = total > 0 ? Math.round((mastered / total) * 100) : 0
        return {
            id: sub.id,
            title: sub.title,
            progress,
            totalTopics: total,
            masteredTopics: mastered
        }
     })

     return {
        totalMinutes,
        subjectStats
     }

  } catch (error) {
    console.error('Error getting global analytics:', error)
    return { totalMinutes: 0, subjectStats: [] }
  }
}

/**
 * Get all due reviews across all subjects for the user
 * Returns topics with subject title
 */
export async function getAllDueReviews(userId) {
  const supabase = await createClient()

  try {
    // `difficulty_factor` feeds the P8.2 weakness score; `concept_ledger` only
    // exists after the P6.5 migration (P14), so ask for it behind its flag.
    const topicColumns = [
      'id',
      'title',
      'next_review_at',
      'status',
      'difficulty',
      'difficulty_factor',
      process.env.CONTENT_LEDGER === 'true' ? 'concept_ledger' : null
    ].filter(Boolean).join(',\n          ')

    const { data: subjects, error } = await supabase
      .from('subjects')
      .select(`
        id,
        title,
        topics (
          ${topicColumns}
        )
      `)
      .eq('user_id', userId)

    if (error) throw error

    // Flatten and filter due topics
    let dueReviews = []
    const now = new Date()

    subjects.forEach(subject => {
      subject.topics.forEach(topic => {
        if ((topic.status === 'reviewing' || topic.status === 'mastered') && topic.next_review_at) {
          if (new Date(topic.next_review_at) <= now) {
            dueReviews.push({
              ...topic,
              subjectTitle: subject.title,
              subjectId: subject.id,
              isDue: true
            })
          }
        }
      })
    })

    // Sort by due date (oldest due first, i.e., most overdue)
    dueReviews.sort((a, b) => new Date(a.next_review_at) - new Date(b.next_review_at))

    // P8.2: re-order weak concepts first and interleave subjects, using this
    // learner's concept memory. Returns the plain overdue order when memory is
    // off or empty (fetchConceptStateForUser yields [] and the weakness score
    // falls back to each topic's SM-2 ease factor).
    const conceptRows = await fetchConceptStateForUser(supabase, { userId })
    return orderReviewQueue(dueReviews, conceptRows)
  } catch (error) {
    console.error('Error getting all due reviews:', error)
    return []
  }
}
