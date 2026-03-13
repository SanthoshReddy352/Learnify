'use server'

import { createClient } from '@/lib/supabase/server'
import { calculateSM2, calculateNextReviewDate } from '@/lib/sm2'

/**
 * Update unlocked topics based on dependencies
 * Unlocks topics when all prerequisites are mastered or reviewing
 */
export async function updateUnlockedTopics(subjectId) {
  const supabase = await createClient()
  
  try {
    // 1. Fetch ALL topics and dependencies for the subject
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, status')
      .eq('subject_id', subjectId)

    if (topicsError) throw topicsError
    if (!topics || topics.length === 0) return { success: true }

    const { data: dependencies, error: depsError } = await supabase
      .from('topic_dependencies')
      .select('topic_id, depends_on_topic_id')
      .eq('subject_id', subjectId)

    if (depsError) throw depsError

    // 2. Build map of Topic -> Prerequisite IDs
    const prerequisitesMap = {} // topic_id -> [prereq_ids]
    // Also build a map of current topic statuses for quick lookup
    const topicStatusMap = {} // topic_id -> status
    
    topics.forEach(t => {
      prerequisitesMap[t.id] = []
      topicStatusMap[t.id] = t.status
    })

    dependencies.forEach(d => {
      if (prerequisitesMap[d.topic_id]) {
        prerequisitesMap[d.topic_id].push(d.depends_on_topic_id)
      }
    })

    // 3. Determine correct status for each non-mastered/reviewing topic
    const updates = []

    for (const topic of topics) {
      // We generally don't re-lock topics that are already 'mastered' or 'reviewing' 
      // as the user has already done the work. We mostly care about 'locked', 'available', 'learning'.
      // However, if we want strict enforcement (e.g. they deleted a link to a mastered topic?), 
      // let's stick to managing 'locked' <-> 'available' transitions for now to avoid frustration.
      // If a topic is 'learning', we might treat it as 'available' for logic purposes (active).
      
      if (topic.status === 'mastered' || topic.status === 'reviewing') {
        continue
      }

      const prereqIds = prerequisitesMap[topic.id]
      
      // If no prerequisites, it should be available (unless it's learning/reviewing/mastered)
      if (prereqIds.length === 0) {
        if (topic.status === 'locked') {
          updates.push({ id: topic.id, status: 'available' })
        }
        continue
      }

      // Check prereqs
      const allPrereqsMet = prereqIds.every(prereqId => {
        const status = topicStatusMap[prereqId]
        return status === 'mastered' || status === 'reviewing' // || status === 'learning'? No, must strictly match unlocking rules.
      })

      if (allPrereqsMet) {
        // Should be unlocked
        if (topic.status === 'locked') {
          updates.push({ id: topic.id, status: 'available' })
        }
      } else {
        // Should be locked
        if (topic.status !== 'locked') {
          // If it was 'learning', this force-locks it. User might lose 'learning' status?
          // For now, safeguarding 'learning' might be nice, but strict graph logic says: 
          // If you lose prereqs, you lose access.
          updates.push({ id: topic.id, status: 'locked' })
        }
      }
    }

    // 4. Perform updates
    // We can't do a bulk update with different values easily in one query without RPC or complex SQL construction.
    // Loop updates are acceptable for reasonable topic counts (usually < 100 per subject).
    for (const update of updates) {
      await supabase
        .from('topics')
        .update({ status: update.status })
        .eq('id', update.id)
    }

    return { success: true, updatedCount: updates.length }
  } catch (error) {
    console.error('Error updating unlocked topics:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Start a learning session for a topic
 */
export async function startLearningSession(topicId) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Update topic status to 'learning'
    const { error: updateError } = await supabase
      .from('topics')
      .update({ status: 'learning' })
      .eq('id', topicId)

    if (updateError) throw updateError

    return { success: true }
  } catch (error) {
    console.error('Error starting learning session:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Complete learning and transition to reviewing status
 */
export async function completeLearning(topicId, durationMinutes = 0) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Get the topic to get subject_id
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('subject_id')
      .eq('id', topicId)
      .single()

    if (topicError) throw topicError

    // Update topic to reviewing status with initial SM-2 values
    const nextReviewDate = calculateNextReviewDate(1) // First review in 1 day
    
    const { error: updateError } = await supabase
      .from('topics')
      .update({
        status: 'reviewing',
        interval_days: 1,
        repetition_count: 0,
        next_review_at: nextReviewDate
      })
      .eq('id', topicId)

    if (updateError) throw updateError

    // Log the learning session
    const { error: logError } = await supabase
      .from('study_logs')
      .insert([{
        user_id: user.id,
        topic_id: topicId,
        subject_id: topic.subject_id,
        session_type: 'learning',
        duration_minutes: durationMinutes,
        quality_rating: null
      }])

    if (logError) throw logError

    // Check if this unlocks any new topics
    await updateUnlockedTopics(topic.subject_id)

    return { success: true, nextReviewDate }
  } catch (error) {
    console.error('Error completing learning:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Submit a review with quality rating and update SM-2 values
 */
export async function submitReview(topicId, quality, durationMinutes = 0) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Get current topic data
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single()

    if (topicError) throw topicError

    // Calculate new SM-2 values
    const sm2Result = calculateSM2(
      quality,
      topic.interval_days || 0,
      topic.repetition_count || 0,
      topic.difficulty_factor || 2.5
    )

    const nextReviewDate = calculateNextReviewDate(sm2Result.interval)

    // Determine new status based on repetition count and quality
    let newStatus = 'reviewing'
    if (sm2Result.repetition >= 3 && quality >= 4) {
      newStatus = 'mastered'
    } else if (quality < 3) {
      newStatus = 'reviewing' // Reset but keep in reviewing
    }

    // Update topic with new SM-2 values
    const { error: updateError } = await supabase
      .from('topics')
      .update({
        status: newStatus,
        interval_days: sm2Result.interval,
        repetition_count: sm2Result.repetition,
        difficulty_factor: sm2Result.efactor,
        next_review_at: nextReviewDate
      })
      .eq('id', topicId)

    if (updateError) throw updateError

    // Log the review session
    const { error: logError } = await supabase
      .from('study_logs')
      .insert([{
        user_id: user.id,
        topic_id: topicId,
        subject_id: topic.subject_id,
        session_type: 'review',
        duration_minutes: durationMinutes,
        quality_rating: quality
      }])

    if (logError) throw logError

    // Check if mastering this topic unlocks new topics
    if (newStatus === 'mastered') {
      await updateUnlockedTopics(topic.subject_id)
    }

    return {
      success: true,
      nextReviewDate,
      newStatus,
      interval: sm2Result.interval
    }
  } catch (error) {
    console.error('Error submitting review:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Create a manual dependency between two topics
 */
export async function createDependency(subjectId, topicId, dependsOnTopicId) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Prevent self-dependency
    if (topicId === dependsOnTopicId) {
      throw new Error('A topic cannot depend on itself')
    }

    // Check for cycles (simple check: if dependsOnTopicId already depends on topicId directly or indirectly)
    // For now, we'll just check direct reverse dependency to keep it simple, 
    // full cycle detection would require traversing the graph
    const { data: reverseDep } = await supabase
      .from('topic_dependencies')
      .select('*')
      .eq('topic_id', dependsOnTopicId)
      .eq('depends_on_topic_id', topicId)
      .single()

    if (reverseDep) {
      throw new Error('Circular dependency detected')
    }

    const { error } = await supabase
      .from('topic_dependencies')
      .insert([{
        subject_id: subjectId,
        topic_id: topicId,
        depends_on_topic_id: dependsOnTopicId
      }])

    if (error) {
      if (error.code === '23505') {
        throw new Error('This link already exists')
      }
      throw error
    }

    // Re-run unlock logic
    const updateResult = await updateUnlockedTopics(subjectId)
    if (!updateResult.success) {
      console.error('Failed to update topic states:', updateResult.error)
    }

    return { success: true }
  } catch (error) {
    if (error.message !== 'This link already exists') {
        console.error('Error creating dependency:', error)
    }
    return { success: false, error: error.message }
  }
}

/**
 * Delete a dependency between two topics
 */
export async function deleteDependency(subjectId, dependencyId) {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('topic_dependencies')
      .delete()
      .eq('id', dependencyId)
      .eq('subject_id', subjectId)

    if (error) throw error

    // Re-run unlock logic
    const updateResult = await updateUnlockedTopics(subjectId)
    if (!updateResult.success) {
      console.error('Failed to update topic states:', updateResult.error)
    }

    return { success: true }
    return { success: true }
  } catch (error) {
    console.error('Error deleting dependency:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Delete a topic and validate graph
 */
export async function deleteTopic(topicId) {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Get subject_id before deleting
    const { data: topic, error: fetchError } = await supabase
      .from('topics')
      .select('subject_id')
      .eq('id', topicId)
      .single()

    if (fetchError) throw fetchError

    const { error } = await supabase
      .from('topics')
      .delete()
      .eq('id', topicId)

    if (error) throw error

    // Re-run unlock logic for the subject
    await updateUnlockedTopics(topic.subject_id)

    return { success: true }
  } catch (error) {
    console.error('Error deleting topic:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Log generic study activity (e.g. partial sessions)
 */
export async function logStudyActivity(topicId, durationMinutes) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    // Validation: Don't log trivial sessions (< 0.1 mins / 6 seconds)
    if (durationMinutes < 0.1) return { success: true, ignored: true }

    // Get subject_id
    const { data: topic } = await supabase
        .from('topics')
        .select('subject_id')
        .eq('id', topicId)
        .single()
    
    if (!topic) throw new Error('Topic not found')

    const { error } = await supabase
      .from('study_logs')
      .insert([{
        user_id: user.id,
        topic_id: topicId,
        subject_id: topic.subject_id,
        session_type: 'learning',
        duration_minutes: Math.ceil(durationMinutes),
        quality_rating: null
      }])

    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Toggle the public visibility of a subject
 */
export async function updateSubjectVisibility(subjectId, isPublic) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('subjects')
      .update({ is_public: isPublic })
      .eq('id', subjectId)
      .eq('user_id', user.id) // Security: Ensure ownership

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('Error updating subject visibility:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Clone a subject and all its topics/dependencies to the current user's workspace
 */
export async function cloneSubject(originalSubjectId) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Check for profile completeness (Education Level is mandatory for curriculum generation)
    const { data: profile } = await supabase
      .from('profiles')
      .select('education_level')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.education_level) {
        throw new Error('Please complete your profile (Education Level) before cloning subjects to ensure personalized learning.')
    }

    // 1. Fetch Original Subject
    const { data: originalSubject, error: subjectError } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', originalSubjectId)
      .single()

    if (subjectError || !originalSubject) throw new Error('Subject not found')
    
    // Ensure we can clone it (it's public OR we own it)
    if (!originalSubject.is_public && originalSubject.user_id !== user.id) {
        throw new Error('Cannot clone private subject')
    }

    // 2. Create New Subject
    const { data: newSubject, error: createError } = await supabase
      .from('subjects')
      .insert([{
        user_id: user.id,
        title: `Copy of ${originalSubject.title}`,
        description: originalSubject.description,
        is_public: false // Clones start private
      }])
      .select()
      .single()

    if (createError) throw createError

    // 3. Fetch Original Topics
    const { data: originalTopics, error: topicsError } = await supabase
      .from('topics')
      .select('*')
      .eq('subject_id', originalSubjectId)

    if (topicsError) throw topicsError

    if (!originalTopics || originalTopics.length === 0) {
        return { success: true, newSubjectId: newSubject.id }
    }

    // 4. Map & Insert New Topics
    const topicIdMap = {} // OldID -> NewID
    
    // We need to insert one by one to get IDs back reliably for the map, 
    // or use a bulk insert and assume order preservation? 
    // Safest is to loop or use a more complex query. looping is fine for <100 items.
    
    for (const topic of originalTopics) {
        const { data: newTopic, error: topicInsertError } = await supabase
            .from('topics')
            .insert([{
                subject_id: newSubject.id,
                title: topic.title,
                description: topic.description,
                content: topic.content,
                flashcards: topic.flashcards,
                estimated_minutes: topic.estimated_minutes,
                difficulty: topic.difficulty,
                status: 'locked', // Reset status
                // Reset SM-2
                repetition_count: 0,
                interval_days: 0,
                difficulty_factor: 2.5,
                next_review_at: null
            }])
            .select('id')
            .single()
        
        if (topicInsertError) {
            console.error('Failed to clone topic', topic.title, topicInsertError)
            continue 
        }
        
        topicIdMap[topic.id] = newTopic.id
    }

    // 5. Fetch and Clone Dependencies
    const { data: originalDeps, error: depsError } = await supabase
        .from('topic_dependencies')
        .select('*')
        .eq('subject_id', originalSubjectId)

    if (!depsError && originalDeps && originalDeps.length > 0) {
        const newDeps = originalDeps.map(dep => {
            const newTopicId = topicIdMap[dep.topic_id]
            const newDependsOnId = topicIdMap[dep.depends_on_topic_id]
            
            if (newTopicId && newDependsOnId) {
                return {
                    subject_id: newSubject.id,
                    topic_id: newTopicId,
                    depends_on_topic_id: newDependsOnId
                }
            }
            return null
        }).filter(Boolean)

        if (newDeps.length > 0) {
            const { error: depsInsertError } = await supabase
                .from('topic_dependencies')
                .insert(newDeps)
            
            if (depsInsertError) console.error('Error cloning dependencies', depsInsertError)
        }
    }

    // 6. Run Unlocking Engine to set initial available topics
    await updateUnlockedTopics(newSubject.id)
    return { success: true, newSubjectId: newSubject.id }

  } catch (error) {
    console.error('Error cloning subject:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Fetch all public subjects from the community
 */
export async function getPublicSubjects() {
  const supabase = await createClient()

  try {
    // 1. Fetch Subjects without the join
    const { data: subjects, error } = await supabase
      .from('subjects')
      .select(`
        *,
        topics(count)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    if (!subjects || subjects.length === 0) {
        return { success: true, subjects: [] }
    }

    // 2. Fetch Authors (Profiles) manually
    const userIds = [...new Set(subjects.map(s => s.user_id))]
    
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, education_level')
      .in('id', userIds)
    
    if (profilesError) console.error('Error fetching profiles:', profilesError)
    
    // Map profiles for quick lookup
    const profileMap = {}
    profiles?.forEach(p => {
        profileMap[p.id] = p
    })

    // 3. Combine Data
    const enrichedSubjects = subjects.map(subject => {
      const profile = profileMap[subject.user_id]
      const fallbackName = `User ${subject.user_id.slice(0,4)}` 
      
      const displayName = profile?.full_name && profile.full_name.trim() !== '' 
        ? profile.full_name 
        : fallbackName
      
      return {
        ...subject,
        author: displayName,
        authorName: displayName,
        topicCount: subject.topics?.[0]?.count || 0,
        profiles: profile
      }
    })

    return { success: true, subjects: enrichedSubjects }
  } catch (error) {
    console.error('Error fetching public subjects:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Save custom user notes for a specific topic
 */
export async function saveTopicNotes(topicId, notes) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('topics')
      .update({ user_notes: notes })
      .eq('id', topicId)
      // Note: RLS policies on 'topics' already ensure only the owner can update it
      // but adding a strict check is good practice if we were joining user_id 
      // however 'topics' doesn't have 'user_id' directly, it's on 'subjects'.
      // RLS handles this securely.

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('Error saving topic notes:', error)
    return { success: false, error: error.message }
  }
}

