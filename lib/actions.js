'use server'

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { calculateSM2, calculateNextReviewDate } from '@/lib/sm2'
import { computeUnlockUpdates } from '@/lib/unlock-engine'
import {
  fetchTopicConcepts,
  recordConceptSignal,
  signalFromQuality,
  lessonSignal
} from '@/lib/memory/concept-state'

/**
 * Verify the current user owns the subject a topic belongs to.
 * Belt-and-suspenders on top of RLS: server actions should never rely on
 * RLS alone for authorization decisions.
 * Returns { user, topic } or throws.
 */
async function assertTopicOwnership(supabase, topicId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: topic, error } = await supabase
    .from('topics')
    .select('id, subject_id, subjects!inner(user_id)')
    .eq('id', topicId)
    .single()

  if (error || !topic) throw new Error('Topic not found')
  if (topic.subjects.user_id !== user.id) throw new Error('Not authorized')

  return { user, topic }
}

/** Same guard for subject-scoped actions. */
async function assertSubjectOwnership(supabase, subjectId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: subject, error } = await supabase
    .from('subjects')
    .select('id, user_id')
    .eq('id', subjectId)
    .single()

  if (error || !subject) throw new Error('Subject not found')
  if (subject.user_id !== user.id) throw new Error('Not authorized')

  return { user, subject }
}

/**
 * Fold a learning/review signal into the user's concept memory (Plan P8.2).
 * No-op unless USER_MEMORY=true, and never throws — personalization must not be
 * able to fail a review submission.
 */
async function rememberTopicSignal(supabase, { userId, topicId, subjectId, topicTitle, signal }) {
  try {
    const concepts = await fetchTopicConcepts(supabase, { topicId, fallbackTitle: topicTitle })
    await recordConceptSignal(supabase, { userId, subjectId, concepts, signal })
  } catch (error) {
    console.warn('Concept-memory update skipped:', error.message)
  }
}

/**
 * Update unlocked topics based on dependencies.
 * Pure decision logic lives in lib/unlock-engine.js (unit-tested);
 * all resulting status changes are applied in ONE round trip via the
 * apply_topic_status_updates RPC instead of a per-topic update loop.
 */
export async function updateUnlockedTopics(subjectId) {
  const supabase = await createClient()

  try {
    const [{ data: topics, error: topicsError }, { data: dependencies, error: depsError }] =
      await Promise.all([
        supabase.from('topics').select('id, status').eq('subject_id', subjectId),
        supabase
          .from('topic_dependencies')
          .select('topic_id, depends_on_topic_id')
          .eq('subject_id', subjectId),
      ])

    if (topicsError) throw topicsError
    if (depsError) throw depsError
    if (!topics || topics.length === 0) return { success: true, updatedCount: 0 }

    const updates = computeUnlockUpdates(topics, dependencies || [])
    if (updates.length === 0) {
      return { success: true, updatedCount: 0 }
    }

    const { data: updatedCount, error: rpcError } = await supabase.rpc(
      'apply_topic_status_updates',
      { p_updates: updates }
    )

    if (rpcError) throw rpcError

    return { success: true, updatedCount: updatedCount ?? updates.length }
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
    await assertTopicOwnership(supabase, topicId)

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
    const { user, topic } = await assertTopicOwnership(supabase, topicId)

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

    // P8.2: finishing a lesson is exposure, not evidence of recall — it bumps
    // the concept's exposure count without moving mastery.
    await rememberTopicSignal(supabase, {
      userId: user.id,
      topicId,
      subjectId: topic.subject_id,
      signal: lessonSignal()
    })

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
    const { user } = await assertTopicOwnership(supabase, topicId)

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

    // P8.2: a graded review is the strongest mastery signal there is — fold it
    // into this learner's per-concept memory.
    await rememberTopicSignal(supabase, {
      userId: user.id,
      topicId,
      subjectId: topic.subject_id,
      topicTitle: topic.title,
      signal: signalFromQuality(quality)
    })

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
    await assertSubjectOwnership(supabase, subjectId)

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
    await assertSubjectOwnership(supabase, subjectId)

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
    const { topic } = await assertTopicOwnership(supabase, topicId)

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
    // Validation: Don't log trivial sessions (< 0.1 mins / 6 seconds)
    if (durationMinutes < 0.1) return { success: true, ignored: true }

    const { user, topic } = await assertTopicOwnership(supabase, topicId)

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
 * Save learner notes for a topic.
 */
export async function saveTopicNotes(topicId, notes) {
  const supabase = await createClient()

  try {
    await assertTopicOwnership(supabase, topicId)

    const { error } = await supabase
      .from('topics')
      .update({ user_notes: notes })
      .eq('id', topicId)

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('Error saving topic notes:', error)
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

    // 3. Fetch Original Topics.
    // PRIVACY: when cloning someone else's public subject, read through the
    // sanitized shared_topics view (no author progress / user_notes).
    // Owners cloning their own subject read the base table directly.
    const isOwnSubject = originalSubject.user_id === user.id
    const { data: originalTopics, error: topicsError } = await supabase
      .from(isOwnSubject ? 'topics' : 'shared_topics')
      .select('id, title, description, content, flashcards, estimated_minutes, difficulty')
      .eq('subject_id', originalSubjectId)

    if (topicsError) throw topicsError

    if (!originalTopics || originalTopics.length === 0) {
        return { success: true, newSubjectId: newSubject.id }
    }

    // 4. Map & Insert New Topics in ONE bulk insert.
    // IDs are generated server-side here (not by the DB) so the old->new map
    // is known upfront and dependencies can be cloned without readbacks.
    const topicIdMap = {} // OldID -> NewID
    const newTopicRows = originalTopics.map(topic => {
        const newId = randomUUID()
        topicIdMap[topic.id] = newId
        return {
            id: newId,
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
        }
    })

    const { error: topicsInsertError } = await supabase
        .from('topics')
        .insert(newTopicRows)

    if (topicsInsertError) {
        console.error('Failed to clone topics', topicsInsertError)
        throw new Error('Failed to clone topics')
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
    // 1. Fetch Subjects (topic counts come from the sanitized
    //    shared_subject_stats view; the topics table itself is no longer
    //    readable for other users' public subjects)
    let { data: subjects, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    if (!subjects || subjects.length === 0) {
        return { success: true, subjects: [] }
    }

    // 2. Fetch Authors (Profiles) + topic counts (sanitized stats view)
    const userIds = [...new Set(subjects.map(s => s.user_id))]
    const listedSubjectIds = subjects.map(s => s.id)

    const [{ data: profiles, error: profilesError }, { data: stats, error: statsError }] =
      await Promise.all([
        supabase.from('profiles').select('id, full_name, education_level').in('id', userIds),
        supabase
          .from('shared_subject_stats')
          .select('subject_id, topic_count')
          .in('subject_id', listedSubjectIds),
      ])

    if (profilesError) console.error('Error fetching profiles:', profilesError)
    if (statsError) console.error('Error fetching subject stats:', statsError)

    // Map profiles / counts for quick lookup
    const profileMap = {}
    profiles?.forEach(p => {
        profileMap[p.id] = p
    })
    const topicCountMap = {}
    stats?.forEach(s => {
        topicCountMap[s.subject_id] = s.topic_count
    })

    // 3. Combine Data
    let enrichedSubjects = subjects.map(subject => {
      const profile = profileMap[subject.user_id]
      const fallbackName = `User ${subject.user_id.slice(0,4)}`

      const displayName = profile?.full_name && profile.full_name.trim() !== ''
        ? profile.full_name
        : fallbackName

      return {
        ...subject,
        author: displayName,
        authorName: displayName,
        topicCount: topicCountMap[subject.id] || 0,
        profiles: profile,
        score: 0 // Default score, overridden later if votes exist
      }
    })

    // 4. Fetch Vote Analytics and Sort
    const subjectIds = enrichedSubjects.map(s => s.id)
    if (subjectIds.length > 0) {
        const { data: votesData, error: votesError } = await supabase
            .from('feedback_votes')
            .select('course_id, vote_type')
            .in('course_id', subjectIds)

        if (!votesError && votesData) {
            // Calculate stats map: course_id -> {score, upvotes, downvotes}
            const statsMap = {}
            votesData.forEach(vote => {
                if (!statsMap[vote.course_id]) {
                    statsMap[vote.course_id] = { score: 0, upvotes: 0, downvotes: 0 }
                }
                statsMap[vote.course_id].score += vote.vote_type
                if (vote.vote_type === 1) statsMap[vote.course_id].upvotes++
                else if (vote.vote_type === -1) statsMap[vote.course_id].downvotes++
            })

            // Assign stats
            enrichedSubjects = enrichedSubjects.map(subject => {
                const stats = statsMap[subject.id] || { score: 0, upvotes: 0, downvotes: 0 }
                return {
                    ...subject,
                    score: stats.score,
                    upvotes: stats.upvotes,
                    downvotes: stats.downvotes
                }
            })
        }
    }

    // Sort by score DESC, then by created_at DESC
    enrichedSubjects.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return new Date(b.created_at) - new Date(a.created_at)
    })

    return { success: true, subjects: enrichedSubjects }
  } catch (error) {
    console.error('Error fetching public subjects:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Contribute a resource to the community
 */
export async function contributeResource(resourceData) {
  const supabase = await createClient()
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('community_resources')
      .insert([{
        user_id: user.id,
        name: resourceData.name,
        subject: resourceData.subject,
        resource_type: resourceData.resource_type,
        drive_link: resourceData.drive_link,
        details: resourceData.details
      }])

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('Error contributing resource:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Vote on a community resource
 */
export async function voteOnResource(resourceId, requestedVote) {
  const supabase = await createClient()

  try {
    const normalizedVote = requestedVote === 1 || requestedVote === -1 ? requestedVote : null
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Please sign in to vote on resources')
    }

    const { data: existingVote, error: existingVoteError } = await supabase
      .from('community_resource_votes')
      .select('vote_type')
      .eq('resource_id', resourceId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingVoteError) throw existingVoteError

    const finalVote = existingVote?.vote_type === normalizedVote ? null : normalizedVote

    if (finalVote === null) {
      const { error: deleteError } = await supabase
        .from('community_resource_votes')
        .delete()
        .match({ resource_id: resourceId, user_id: user.id })

      if (deleteError) throw deleteError
    } else {
      const { error: upsertError } = await supabase
        .from('community_resource_votes')
        .upsert(
          { resource_id: resourceId, user_id: user.id, vote_type: finalVote },
          { onConflict: 'user_id,resource_id' }
        )

      if (upsertError) throw upsertError
    }

    const { data: voteRows, error: voteRowsError } = await supabase
      .from('community_resource_votes')
      .select('vote_type')
      .eq('resource_id', resourceId)

    if (voteRowsError) throw voteRowsError

    const stats = (voteRows || []).reduce((accumulator, voteRow) => {
      if (voteRow.vote_type === 1) {
        accumulator.upvotes += 1
      } else if (voteRow.vote_type === -1) {
        accumulator.downvotes += 1
      }

      accumulator.score += voteRow.vote_type
      return accumulator
    }, { score: 0, upvotes: 0, downvotes: 0 })

    return {
      success: true,
      vote: finalVote,
      score: stats.score,
      upvotes: stats.upvotes,
      downvotes: stats.downvotes
    }
  } catch (error) {
    console.error('Error voting on resource:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Fetch resources from the community
 */
export async function getResources(type) {
  const supabase = await createClient()
  
  try {
    // 1. Fetch resources
    const { data: resources, error: resourceError } = await supabase
      .from('community_resources')
      .select('*')
      .eq('resource_type', type)
      .order('created_at', { ascending: false })

    if (resourceError) throw resourceError
    if (!resources || resources.length === 0) return { success: true, resources: [] }

    // 2. Collect unique user IDs
    const userIds = [...new Set(resources.map(r => r.user_id))]

    // 3. Fetch matching profiles
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', userIds)

    if (profileError) {
      console.error('Error fetching profiles for join:', profileError)
      // Return resources without profiles if profile fetch fails
      return { success: true, resources }
    }

    // 4. Map profiles to resources
    let enrichedResources = resources.map(resource => ({
      ...resource,
      profiles: profiles.find(p => p.id === resource.user_id) || null,
      score: 0,
      upvotes: 0,
      downvotes: 0,
      userVote: null
    }))

    // 5. Attach vote analytics and sort by score
    const resourceIds = enrichedResources.map(resource => resource.id)
    if (resourceIds.length > 0) {
      const { data: voteRows, error: votesError } = await supabase
        .from('community_resource_votes')
        .select('resource_id, vote_type')
        .in('resource_id', resourceIds)

      if (votesError) {
        console.error('Error fetching resource votes:', votesError)
      } else {
        const statsMap = {}
        voteRows.forEach((voteRow) => {
          if (!statsMap[voteRow.resource_id]) {
            statsMap[voteRow.resource_id] = { score: 0, upvotes: 0, downvotes: 0 }
          }

          statsMap[voteRow.resource_id].score += voteRow.vote_type
          if (voteRow.vote_type === 1) statsMap[voteRow.resource_id].upvotes += 1
          if (voteRow.vote_type === -1) statsMap[voteRow.resource_id].downvotes += 1
        })

        enrichedResources = enrichedResources.map((resource) => {
          const stats = statsMap[resource.id] || { score: 0, upvotes: 0, downvotes: 0 }
          return {
            ...resource,
            score: stats.score,
            upvotes: stats.upvotes,
            downvotes: stats.downvotes
          }
        })
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: userVotes, error: userVotesError } = await supabase
          .from('community_resource_votes')
          .select('resource_id, vote_type')
          .eq('user_id', user.id)
          .in('resource_id', resourceIds)

        if (userVotesError) {
          console.error('Error fetching current user resource votes:', userVotesError)
        } else {
          const userVoteMap = {}
          userVotes.forEach((voteRow) => {
            userVoteMap[voteRow.resource_id] = voteRow.vote_type
          })

          enrichedResources = enrichedResources.map((resource) => ({
            ...resource,
            userVote: userVoteMap[resource.id] ?? null
          }))
        }
      }
    }

    enrichedResources.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return new Date(b.created_at) - new Date(a.created_at)
    })

    return { success: true, resources: enrichedResources }
  } catch (error) {
    console.error(`Root error fetching ${type}:`, error)
    return { success: false, error: error.message }
  }
}


