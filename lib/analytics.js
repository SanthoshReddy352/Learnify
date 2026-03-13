'use server'

import { createClient } from '@/lib/supabase/server'

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
    const { data: subjects, error } = await supabase
      .from('subjects')
      .select(`
        id,
        title,
        topics (
          id,
          title,
          next_review_at,
          status,
          difficulty
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

    return dueReviews
  } catch (error) {
    console.error('Error getting all due reviews:', error)
    return []
  }
}
