import { createHash, randomBytes } from 'crypto'
import { normalizeEmail } from '@/lib/classrooms/auth'
import { sendClassroomInvites } from '@/lib/classrooms/email'
import { getStudentCourseSnapshot } from '@/lib/classrooms/progress'
import { createAdminClient } from '@/lib/supabase/admin'

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function buildInvitePayload(email) {
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()

  return {
    email: normalizeEmail(email),
    token,
    tokenHash: hashToken(token),
    expiresAt
  }
}

function summarizeCourseProgress(progressRows) {
  const totalTopics = progressRows.length
  const completedTopics = progressRows.filter((row) => row.status === 'reviewing' || row.status === 'mastered').length
  const masteredTopics = progressRows.filter((row) => row.status === 'mastered').length
  const dueReviews = progressRows.filter((row) => row.next_review_at && new Date(row.next_review_at) <= new Date()).length

  return {
    totalTopics,
    completedTopics,
    masteredTopics,
    dueReviews,
    completionPercentage: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0
  }
}

function buildWeeklyStudyData(logs) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const isSameDay = (d1, d2) => (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )

  return Array.from({ length: 7 }, (_, index) => {
    const currentDay = new Date(startOfWeek)
    currentDay.setDate(startOfWeek.getDate() + index)

    const dayLogs = logs.filter((log) => isSameDay(new Date(log.created_at), currentDay))

    return {
      name: days[currentDay.getDay()],
      learning: Math.round(dayLogs
        .filter((log) => log.session_type === 'learning')
        .reduce((sum, log) => sum + (log.duration_minutes || 0), 0)),
      review: Math.round(dayLogs
        .filter((log) => log.session_type === 'review')
        .reduce((sum, log) => sum + (log.duration_minutes || 0), 0))
    }
  })
}

function buildWeakTopicSummaries(logs, topics) {
  const reviewLogs = logs.filter((log) => log.quality_rating !== null && log.quality_rating !== undefined)
  const topicStats = reviewLogs.reduce((accumulator, log) => {
    if (!accumulator[log.topic_id]) {
      accumulator[log.topic_id] = {
        sum: 0,
        count: 0
      }
    }

    accumulator[log.topic_id].sum += log.quality_rating
    accumulator[log.topic_id].count += 1
    return accumulator
  }, {})

  return topics
    .map((topic) => {
      const stats = topicStats[topic.id]

      if (!stats) {
        return null
      }

      const averageRating = stats.sum / stats.count
      if (averageRating >= 3) {
        return null
      }

      return {
        id: topic.id,
        title: topic.title,
        status: topic.progress?.status || 'locked',
        averageRating: averageRating.toFixed(1),
        reviewCount: stats.count
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.averageRating) - Number(b.averageRating))
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

function isDueReview(timestamp, reference = new Date()) {
  return Boolean(timestamp) && new Date(timestamp) <= reference
}

function sumStudyMinutes(logs) {
  return Math.round((logs || []).reduce((sum, log) => sum + (log.duration_minutes || 0), 0))
}

function getAverageQuality(logs) {
  const ratedLogs = (logs || []).filter((log) => log.quality_rating !== null && log.quality_rating !== undefined)

  if (ratedLogs.length === 0) {
    return null
  }

  return Number((ratedLogs.reduce((sum, log) => sum + (log.quality_rating || 0), 0) / ratedLogs.length).toFixed(1))
}

function getLatestTimestamp(items, getTimestamp = (item) => item.created_at) {
  return (items || []).reduce((latest, item) => {
    const timestamp = getTimestamp(item)

    if (!timestamp) {
      return latest
    }

    if (!latest || new Date(timestamp) > new Date(latest)) {
      return timestamp
    }

    return latest
  }, null)
}

function buildStatusBreakdown(progressRows) {
  const counts = {
    available: 0,
    learning: 0,
    reviewing: 0,
    mastered: 0,
    locked: 0
  }

  ;(progressRows || []).forEach((row) => {
    const key = row.status || 'locked'
    counts[key] = (counts[key] || 0) + 1
  })

  return counts
}

function buildWeeklyMomentum(logs, reference = new Date()) {
  const recentCutoff = new Date(reference.getTime() - (7 * DAY_IN_MS))
  const previousCutoff = new Date(reference.getTime() - (14 * DAY_IN_MS))

  const recentLogs = []
  const previousLogs = []

  ;(logs || []).forEach((log) => {
    const createdAt = new Date(log.created_at)

    if (createdAt >= recentCutoff) {
      recentLogs.push(log)
      return
    }

    if (createdAt >= previousCutoff && createdAt < recentCutoff) {
      previousLogs.push(log)
    }
  })

  const recentMinutes = sumStudyMinutes(recentLogs)
  const previousMinutes = sumStudyMinutes(previousLogs)
  const deltaMinutes = recentMinutes - previousMinutes
  let direction = 'steady'
  let label = 'Steady week'
  let changePercentage = 0

  if (recentMinutes > 0 && previousMinutes === 0) {
    direction = 'new'
    label = 'Started this week'
    changePercentage = 100
  } else if (recentMinutes === 0 && previousMinutes > 0) {
    direction = 'inactive'
    label = 'Inactive this week'
    changePercentage = -100
  } else if (Math.abs(deltaMinutes) <= 15) {
    direction = 'steady'
    label = 'Steady week'
    changePercentage = previousMinutes > 0 ? Math.round((deltaMinutes / previousMinutes) * 100) : 0
  } else if (deltaMinutes > 0) {
    direction = 'up'
    label = 'More active this week'
    changePercentage = previousMinutes > 0 ? Math.round((deltaMinutes / previousMinutes) * 100) : 100
  } else if (deltaMinutes < 0) {
    direction = 'down'
    label = 'Less active this week'
    changePercentage = previousMinutes > 0 ? Math.round((deltaMinutes / previousMinutes) * 100) : -100
  }

  return {
    recentMinutes,
    previousMinutes,
    deltaMinutes,
    direction,
    label,
    changePercentage
  }
}

function buildStudentWeakTopics(reviewLogs, topicMap, courseMap) {
  const ratedLogs = (reviewLogs || []).filter((log) => log.quality_rating !== null && log.quality_rating !== undefined)
  const topicStats = ratedLogs.reduce((accumulator, log) => {
    if (!accumulator[log.topic_id]) {
      accumulator[log.topic_id] = {
        topicId: log.topic_id,
        topicTitle: topicMap.get(log.topic_id)?.title || 'Untitled topic',
        classroomCourseId: log.classroom_course_id,
        subjectTitle: courseMap.get(log.classroom_course_id)?.subjects?.title || 'Untitled course',
        reviewCount: 0,
        qualitySum: 0,
        lastReviewedAt: log.created_at
      }
    }

    accumulator[log.topic_id].reviewCount += 1
    accumulator[log.topic_id].qualitySum += log.quality_rating || 0

    if (new Date(log.created_at) > new Date(accumulator[log.topic_id].lastReviewedAt)) {
      accumulator[log.topic_id].lastReviewedAt = log.created_at
    }

    return accumulator
  }, {})

  return Object.values(topicStats)
    .map((topic) => ({
      topicId: topic.topicId,
      topicTitle: topic.topicTitle,
      classroomCourseId: topic.classroomCourseId,
      subjectTitle: topic.subjectTitle,
      reviewCount: topic.reviewCount,
      averageQuality: Number((topic.qualitySum / topic.reviewCount).toFixed(1)),
      lastReviewedAt: topic.lastReviewedAt
    }))
    .filter((topic) => topic.averageQuality < 3.5)
    .sort((a, b) => {
      if (a.averageQuality !== b.averageQuality) {
        return a.averageQuality - b.averageQuality
      }

      return b.reviewCount - a.reviewCount
    })
}

function buildRecentActivity(logs, topicMap, courseMap) {
  return (logs || [])
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6)
    .map((log) => ({
      topicId: log.topic_id,
      topicTitle: topicMap.get(log.topic_id)?.title || 'Untitled topic',
      classroomCourseId: log.classroom_course_id,
      subjectTitle: courseMap.get(log.classroom_course_id)?.subjects?.title || 'Untitled course',
      sessionType: log.session_type,
      durationMinutes: Math.round(log.duration_minutes || 0),
      qualityRating: log.quality_rating,
      createdAt: log.created_at
    }))
}

function buildStudentAttentionMeta({
  overall,
  dueReviews,
  idleDays,
  averageQuality,
  currentWeekMinutes,
  previousWeekMinutes,
  weakTopicCount,
  totalMinutes
}) {
  let priorityScore = 0
  const reasons = []

  if (idleDays === null) {
    priorityScore += 4
    reasons.push('No study activity has been logged yet.')
  } else if (idleDays >= 7) {
    priorityScore += 4
    reasons.push(`Inactive for ${idleDays} days.`)
  } else if (idleDays >= 4) {
    priorityScore += 2
    reasons.push(`No activity for ${idleDays} days.`)
  }

  if (dueReviews >= 6) {
    priorityScore += 3
    reasons.push(`${dueReviews} reviews are overdue.`)
  } else if (dueReviews >= 3) {
    priorityScore += 2
    reasons.push(`${dueReviews} reviews need attention.`)
  } else if (dueReviews > 0) {
    priorityScore += 1
    reasons.push(`${dueReviews} review${dueReviews === 1 ? '' : 's'} due.`)
  }

  if (averageQuality !== null && averageQuality < 2.5) {
    priorityScore += 3
    reasons.push(`Review quality is low at ${averageQuality}/5.`)
  } else if (averageQuality !== null && averageQuality < 3.2) {
    priorityScore += 2
    reasons.push(`Review quality is slipping at ${averageQuality}/5.`)
  }

  if (overall.totalTopics > 0 && overall.completionPercentage <= 25) {
    priorityScore += 2
    reasons.push('Completion is below 25%.')
  } else if (overall.totalTopics > 0 && overall.completionPercentage < 50 && currentWeekMinutes === 0 && totalMinutes > 0) {
    priorityScore += 1
    reasons.push('Progress has stalled below the halfway mark.')
  }

  if (previousWeekMinutes > 0 && currentWeekMinutes < previousWeekMinutes - 30) {
    priorityScore += 2
    reasons.push('Study time dropped sharply this week.')
  }

  if (weakTopicCount >= 3) {
    priorityScore += 1
    reasons.push(`${weakTopicCount} topics show weak review quality.`)
  }

  let level = 'on-track'
  let label = 'On track'
  let action = 'Keep the current pace and continue spaced review.'

  if (priorityScore >= 7) {
    level = 'high'
    label = 'Needs immediate attention'
    action = 'Schedule a 1:1 check-in and assign a focused review plan.'
  } else if (priorityScore >= 4) {
    level = 'medium'
    label = 'Monitor closely'
    action = 'Follow up this week and reinforce overdue or weak topics.'
  } else if (priorityScore >= 2) {
    level = 'low'
    label = 'Minor intervention'
    action = 'Give a quick nudge before progress slips further.'
  }

  return {
    level,
    label,
    priorityScore,
    reasons: reasons.slice(0, 3),
    action
  }
}

export async function claimPendingInvitesForUser(supabase, user) {
  const email = normalizeEmail(user.email)

  if (!email) {
    return []
  }

  const now = new Date().toISOString()
  const { data: invites, error } = await supabase
    .from('classroom_invites')
    .select('id, classroom_id')
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expires_at', now)

  if (error) {
    throw new Error(error.message)
  }

  if (!invites || invites.length === 0) {
    return []
  }

  const classroomIds = invites.map((invite) => invite.classroom_id)
  const { data: existingMemberships, error: membershipLookupError } = await supabase
    .from('classroom_members')
    .select('classroom_id')
    .eq('student_user_id', user.id)
    .in('classroom_id', classroomIds)

  if (membershipLookupError) {
    throw new Error(membershipLookupError.message)
  }

  const existingClassroomIds = new Set((existingMemberships || []).map((membership) => membership.classroom_id))
  const missingMemberships = invites
    .filter((invite) => !existingClassroomIds.has(invite.classroom_id))
    .map((invite) => ({
      classroom_id: invite.classroom_id,
      student_user_id: user.id,
      status: 'invited'
    }))

  if (missingMemberships.length > 0) {
    const { error: memberError } = await supabase
      .from('classroom_members')
      .insert(missingMemberships)

    if (memberError) {
      throw new Error(memberError.message)
    }
  }

  return invites
}

export async function createClassroom(supabase, teacherUserId, payload) {
  const name = String(payload.name || '').trim()
  const description = String(payload.description || '').trim()
  const timezone = String(payload.timezone || 'Asia/Kolkata').trim() || 'Asia/Kolkata'

  if (!name) {
    throw new Error('Classroom name is required')
  }

  const { data, error } = await supabase
    .from('classrooms')
    .insert({
      name,
      description: description || null,
      teacher_user_id: teacherUserId,
      timezone
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function listTeacherClassrooms(supabase, teacherUserId) {
  const { data, error } = await supabase
    .from('classrooms')
    .select(`
      *,
      classroom_courses(count),
      classroom_members(count),
      classroom_invites(count)
    `)
    .eq('teacher_user_id', teacherUserId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []).map((classroom) => ({
    ...classroom,
    courseCount: classroom.classroom_courses?.[0]?.count || 0,
    memberCount: classroom.classroom_members?.[0]?.count || 0,
    inviteCount: classroom.classroom_invites?.[0]?.count || 0
  }))
}

export async function getTeacherClassroomDetail(supabase, classroomId, teacherUserId) {
  const adminClient = createAdminClient()
  const privilegedReader = adminClient || supabase

  const { data: classroom, error: classroomError } = await supabase
    .from('classrooms')
    .select('*')
    .eq('id', classroomId)
    .eq('teacher_user_id', teacherUserId)
    .single()

  if (classroomError || !classroom) {
    throw new Error('Classroom not found')
  }

  const { data: courses, error: courseError } = await supabase
    .from('classroom_courses')
    .select(`
      *,
      subjects (
        id,
        title,
        description,
        cheat_sheet
      )
    `)
    .eq('classroom_id', classroomId)
    .order('order_index', { ascending: true })

  if (courseError) {
    throw new Error(courseError.message)
  }

  const { data: members, error: memberError } = await supabase
    .from('classroom_members')
    .select('*')
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false })

  if (memberError) {
    throw new Error(memberError.message)
  }

  const { data: invites, error: inviteError } = await supabase
    .from('classroom_invites')
    .select('*')
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false })

  if (inviteError) {
    throw new Error(inviteError.message)
  }

  const acceptedInviteEmails = new Set(
    (invites || [])
      .filter((invite) => invite.status === 'accepted')
      .map((invite) => normalizeEmail(invite.email))
  )
  const normalizedInvites = (invites || []).filter((invite) => {
    if (invite.status !== 'pending') {
      return true
    }

    return !acceptedInviteEmails.has(normalizeEmail(invite.email))
  })

  const memberIds = [...new Set((members || []).map((member) => member.student_user_id))]
  const { data: profiles } = memberIds.length > 0
    ? await privilegedReader
        .from('profiles')
        .select('id, full_name, username, education_level')
        .in('id', memberIds)
    : { data: [] }

  const profileMap = new Map()
  ;(profiles || []).forEach((profile) => {
    profileMap.set(profile.id, profile)
  })

  const { data: subjects, error: subjectError } = await supabase
    .from('subjects')
    .select('id, title, description, cheat_sheet')
    .eq('user_id', teacherUserId)
    .order('created_at', { ascending: false })

  if (subjectError) {
    throw new Error(subjectError.message)
  }

  return {
    classroom,
    courses: courses || [],
    members: (members || []).map((member) => ({
      ...member,
      profile: profileMap.get(member.student_user_id) || null
    })),
    invites: normalizedInvites,
    availableSubjects: subjects || []
  }
}

export async function attachCourseToClassroom(supabase, classroomId, teacherUserId, payload) {
  const subjectId = payload.subjectId

  if (!subjectId) {
    throw new Error('subjectId is required')
  }

  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .eq('user_id', teacherUserId)
    .single()

  if (subjectError || !subject) {
    throw new Error('Subject not found or not owned by teacher')
  }

  const { data: existingCourses } = await supabase
    .from('classroom_courses')
    .select('id, order_index')
    .eq('classroom_id', classroomId)
    .order('order_index', { ascending: false })
    .limit(1)

  const nextOrder = typeof payload.orderIndex === 'number'
    ? payload.orderIndex
    : ((existingCourses?.[0]?.order_index || 0) + 1)

  const { data, error } = await supabase
    .from('classroom_courses')
    .insert({
      classroom_id: classroomId,
      subject_id: subjectId,
      order_index: nextOrder,
      published_at: new Date().toISOString()
    })
    .select(`
      *,
      subjects (
        id,
        title,
        description,
        cheat_sheet
      )
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function createBulkClassroomInvites(supabase, { classroomId, teacherUserId, teacherEmail, classroomName, emails, origin }) {
  const normalized = [...new Set(
    (emails || [])
      .map(normalizeEmail)
      .filter((email) => email.includes('@'))
  )]

  if (normalized.length === 0) {
    throw new Error('Provide at least one valid email')
  }

  const inviteRows = normalized.map((email) => {
    const payload = buildInvitePayload(email)

    return {
      email: payload.email,
      token: payload.token,
      record: {
        classroom_id: classroomId,
        email: payload.email,
        token_hash: payload.tokenHash,
        invited_by: teacherUserId,
        expires_at: payload.expiresAt
      },
      expiresAt: payload.expiresAt
    }
  })

  const { error } = await supabase
    .from('classroom_invites')
    .insert(inviteRows.map((invite) => invite.record))

  if (error) {
    throw new Error(error.message)
  }

  const inviteResults = inviteRows.map((invite) => ({
    email: invite.email,
    token: invite.token,
    expiresAt: invite.expiresAt
  }))

  const emailResult = await sendClassroomInvites({
    invites: inviteResults,
    classroomName,
    teacherEmail,
    origin
  })

  return {
    invites: inviteResults.map((invite) => ({
      ...invite,
      inviteUrl: `${origin}/classrooms/invitations?token=${encodeURIComponent(invite.token)}`
    })),
    emailResult
  }
}

export async function listPendingInvitations(supabase, email) {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('classroom_invites')
    .select(`
      id,
      classroom_id,
      email,
      status,
      expires_at,
      created_at,
      classrooms (
        id,
        name,
        description,
        timezone,
        teacher_user_id
      )
    `)
    .eq('email', normalizeEmail(email))
    .eq('status', 'pending')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function acceptInviteByToken(supabase, token, user) {
  const tokenHash = hashToken(token)
  let { data: invite, error: inviteError } = await supabase
    .from('classroom_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (inviteError) {
    throw new Error(inviteError.message)
  }

  if (!invite) {
    const fallback = await supabase
      .from('classroom_invites')
      .select('*')
      .eq('id', token)
      .maybeSingle()

    if (fallback.error) {
      throw new Error(fallback.error.message)
    }

    invite = fallback.data
  }

  if (!invite) {
    throw new Error('Invite not found')
  }

  if (invite.status !== 'pending') {
    throw new Error('Invite is no longer active')
  }

  if (new Date(invite.expires_at) <= new Date()) {
    throw new Error('Invite has expired')
  }

  if (normalizeEmail(user.email) !== normalizeEmail(invite.email)) {
    throw new Error('Invite email does not match the current account')
  }

  const now = new Date().toISOString()
  const { error: memberError } = await supabase
    .from('classroom_members')
    .upsert({
      classroom_id: invite.classroom_id,
      student_user_id: user.id,
      status: 'active',
      joined_at: now
    }, {
      onConflict: 'classroom_id,student_user_id'
    })

  if (memberError) {
    throw new Error(memberError.message)
  }

  const { error: inviteUpdateError } = await supabase
    .from('classroom_invites')
    .update({
      status: 'accepted',
      accepted_by_user_id: user.id
    })
    .eq('classroom_id', invite.classroom_id)
    .eq('email', normalizeEmail(invite.email))
    .eq('status', 'pending')

  if (inviteUpdateError) {
    throw new Error(inviteUpdateError.message)
  }

  return {
    classroomId: invite.classroom_id
  }
}

export async function listStudentClassrooms(supabase, userId) {
  const { data: memberships, error } = await supabase
    .from('classroom_members')
    .select(`
      *,
      classrooms (
        id,
        name,
        description,
        timezone,
        teacher_user_id,
        created_at
      )
    `)
    .eq('student_user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const classroomIds = (memberships || []).map((membership) => membership.classroom_id)
  const { data: classroomCourses } = classroomIds.length > 0
    ? await supabase
        .from('classroom_courses')
        .select('id, classroom_id')
        .in('classroom_id', classroomIds)
    : { data: [] }

  const courseCountMap = new Map()
  ;(classroomCourses || []).forEach((course) => {
    courseCountMap.set(course.classroom_id, (courseCountMap.get(course.classroom_id) || 0) + 1)
  })

  return (memberships || []).map((membership) => ({
    ...membership.classrooms,
    membershipId: membership.id,
    joinedAt: membership.joined_at,
    courseCount: courseCountMap.get(membership.classroom_id) || 0
  }))
}

export async function getStudentClassroomDetail(supabase, classroomId, userId) {
  const { data: membership, error: membershipError } = await supabase
    .from('classroom_members')
    .select(`
      *,
      classrooms (
        id,
        name,
        description,
        timezone,
        teacher_user_id
      )
    `)
    .eq('classroom_id', classroomId)
    .eq('student_user_id', userId)
    .eq('status', 'active')
    .single()

  if (membershipError || !membership) {
    throw new Error('Classroom not found')
  }

  const { data: courses, error: courseError } = await supabase
    .from('classroom_courses')
    .select(`
      *,
      subjects (
        id,
        title,
        description,
        cheat_sheet
      )
    `)
    .eq('classroom_id', classroomId)
    .order('order_index', { ascending: true })

  if (courseError) {
    throw new Error(courseError.message)
  }

  const courseIds = (courses || []).map((course) => course.id)
  const { data: progressRows } = courseIds.length > 0
    ? await supabase
        .from('student_topic_progress')
        .select('classroom_course_id, status, next_review_at')
        .eq('student_user_id', userId)
        .eq('classroom_id', classroomId)
    : { data: [] }

  const progressMap = new Map()
  ;(progressRows || []).forEach((row) => {
    const list = progressMap.get(row.classroom_course_id) || []
    list.push(row)
    progressMap.set(row.classroom_course_id, list)
  })

  return {
    classroom: membership.classrooms,
    courses: (courses || []).map((course) => ({
      ...course,
      summary: summarizeCourseProgress(progressMap.get(course.id) || [])
    }))
  }
}

export async function getStudentClassroomCourse(supabase, classroomId, classroomCourseId, userId) {
  const { data: membership, error: membershipError } = await supabase
    .from('classroom_members')
    .select('id')
    .eq('classroom_id', classroomId)
    .eq('student_user_id', userId)
    .eq('status', 'active')
    .single()

  if (membershipError || !membership) {
    throw new Error('Classroom access denied')
  }

  const snapshot = await getStudentCourseSnapshot(supabase, {
    classroomId,
    classroomCourseId,
    studentUserId: userId
  })

  const { data: logs, error: logsError } = await supabase
    .from('study_logs')
    .select('topic_id, duration_minutes, session_type, quality_rating, created_at')
    .eq('user_id', userId)
    .eq('classroom_id', classroomId)
    .eq('classroom_course_id', classroomCourseId)
    .eq('source_type', 'classroom')
    .order('created_at', { ascending: false })

  if (logsError) {
    throw new Error(logsError.message)
  }

  const logsList = logs || []

  return {
    ...snapshot,
    analytics: {
      weekData: buildWeeklyStudyData(logsList),
      totalMinutes: Math.round(logsList.reduce((sum, log) => sum + (log.duration_minutes || 0), 0)),
      weakTopics: buildWeakTopicSummaries(logsList, snapshot.topics),
      reviewCount: logsList.filter((log) => log.session_type === 'review').length
    }
  }
}

export async function getTeacherClassroomAnalytics(supabase, classroomId, teacherUserId) {
  const detail = await getTeacherClassroomDetail(supabase, classroomId, teacherUserId)
  const adminClient = createAdminClient()
  const privilegedReader = adminClient || supabase
  const activeMembers = detail.members.filter((member) => member.status === 'active')
  const studentIds = activeMembers.map((member) => member.student_user_id)

  const progressResult = studentIds.length > 0
    ? await privilegedReader
        .from('student_topic_progress')
        .select('classroom_course_id, student_user_id, topic_id, status, next_review_at')
        .eq('classroom_id', classroomId)
        .in('student_user_id', studentIds)
    : { data: [], error: null }

  if (progressResult.error) {
    throw new Error(progressResult.error.message)
  }

  const logsResult = studentIds.length > 0
    ? await privilegedReader
        .from('study_logs')
        .select('user_id, topic_id, classroom_course_id, session_type, duration_minutes, quality_rating, created_at')
        .eq('classroom_id', classroomId)
        .eq('source_type', 'classroom')
        .in('user_id', studentIds)
    : { data: [], error: null }

  if (logsResult.error) {
    throw new Error(logsResult.error.message)
  }

  const progressRows = progressResult.data || []
  const logs = logsResult.data || []
  const topicIds = [...new Set([
    ...progressRows.map((row) => row.topic_id),
    ...logs.map((log) => log.topic_id)
  ].filter(Boolean))]

  const topicsResult = topicIds.length > 0
    ? await privilegedReader
        .from('topics')
        .select('id, title')
        .in('id', topicIds)
    : { data: [], error: null }

  if (topicsResult.error) {
    throw new Error(topicsResult.error.message)
  }

  const topics = topicsResult.data || []
  const now = new Date()
  const courseMap = new Map(detail.courses.map((course) => [course.id, course]))
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]))

  const logsByStudent = new Map()
  const logsByStudentCourse = new Map()
  const logsByCourse = new Map()
  const logsByTopic = new Map()

  logs.forEach((log) => {
    const studentLogs = logsByStudent.get(log.user_id) || []
    studentLogs.push(log)
    logsByStudent.set(log.user_id, studentLogs)

    const studentCourseKey = `${log.user_id}:${log.classroom_course_id}`
    const studentCourseLogs = logsByStudentCourse.get(studentCourseKey) || []
    studentCourseLogs.push(log)
    logsByStudentCourse.set(studentCourseKey, studentCourseLogs)

    const courseLogs = logsByCourse.get(log.classroom_course_id) || []
    courseLogs.push(log)
    logsByCourse.set(log.classroom_course_id, courseLogs)

    const topicLogs = logsByTopic.get(log.topic_id) || []
    topicLogs.push(log)
    logsByTopic.set(log.topic_id, topicLogs)
  })

  const progressByStudent = new Map()
  const progressByCourse = new Map()
  const progressByTopic = new Map()

  progressRows.forEach((row) => {
    const studentProgress = progressByStudent.get(row.student_user_id) || []
    studentProgress.push(row)
    progressByStudent.set(row.student_user_id, studentProgress)

    const courseKey = `${row.student_user_id}:${row.classroom_course_id}`
    const courseProgress = progressByCourse.get(courseKey) || []
    courseProgress.push(row)
    progressByCourse.set(courseKey, courseProgress)

    const topicProgress = progressByTopic.get(row.topic_id) || []
    topicProgress.push(row)
    progressByTopic.set(row.topic_id, topicProgress)
  })

  const students = activeMembers
    .map((member) => {
      const studentUserId = member.student_user_id
      const studentProgress = progressByStudent.get(studentUserId) || []
      const studentLogs = logsByStudent.get(studentUserId) || []
      const reviewLogs = studentLogs.filter((log) => log.session_type === 'review')
      const learningLogs = studentLogs.filter((log) => log.session_type === 'learning')
      const totalMinutes = sumStudyMinutes(studentLogs)
      const lastActivity = getLatestTimestamp(studentLogs)
      const idleDays = lastActivity ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / DAY_IN_MS) : null
      const dueReviews = studentProgress.filter((row) => isDueReview(row.next_review_at, now)).length
      const overall = summarizeCourseProgress(studentProgress)
      const statusBreakdown = buildStatusBreakdown(studentProgress)
      const weeklyMomentum = buildWeeklyMomentum(studentLogs, now)
      const averageQuality = getAverageQuality(reviewLogs)
      const weakTopics = buildStudentWeakTopics(reviewLogs, topicMap, courseMap)

      const courses = detail.courses
        .map((course) => {
          const courseProgress = progressByCourse.get(`${studentUserId}:${course.id}`) || []
          const courseLogs = logsByStudentCourse.get(`${studentUserId}:${course.id}`) || []
          const courseReviewLogs = courseLogs.filter((log) => log.session_type === 'review')
          const summary = summarizeCourseProgress(courseProgress)
          const courseAverageQuality = getAverageQuality(courseReviewLogs)
          const courseDueReviews = courseProgress.filter((row) => isDueReview(row.next_review_at, now)).length

          return {
            classroomCourseId: course.id,
            subjectTitle: course.subjects?.title || 'Untitled course',
            ...summary,
            dueReviews: courseDueReviews,
            studyMinutes: sumStudyMinutes(courseLogs),
            totalSessions: courseLogs.length,
            learningSessions: courseLogs.filter((log) => log.session_type === 'learning').length,
            reviewSessions: courseReviewLogs.length,
            averageQuality: courseAverageQuality,
            lastActivity: getLatestTimestamp(courseLogs),
            needsAttention: courseDueReviews >= 2 || (courseAverageQuality !== null && courseAverageQuality < 3) || (summary.completionPercentage < 40 && courseLogs.length > 0)
          }
        })
        .sort((a, b) => {
          if (Number(b.needsAttention) !== Number(a.needsAttention)) {
            return Number(b.needsAttention) - Number(a.needsAttention)
          }

          if (b.dueReviews !== a.dueReviews) {
            return b.dueReviews - a.dueReviews
          }

          return a.completionPercentage - b.completionPercentage
        })

      const topicReviews = reviewLogs.reduce((accumulator, log) => {
        if (!accumulator[log.topic_id]) {
          accumulator[log.topic_id] = {
            topicId: log.topic_id,
            topicTitle: topicMap.get(log.topic_id)?.title || 'Untitled topic',
            reviewCount: 0,
            lastReviewedAt: log.created_at
          }
        }

        accumulator[log.topic_id].reviewCount += 1

        if (new Date(log.created_at) > new Date(accumulator[log.topic_id].lastReviewedAt)) {
          accumulator[log.topic_id].lastReviewedAt = log.created_at
        }

        return accumulator
      }, {})

      const attention = buildStudentAttentionMeta({
        overall,
        dueReviews,
        idleDays,
        averageQuality,
        currentWeekMinutes: weeklyMomentum.recentMinutes,
        previousWeekMinutes: weeklyMomentum.previousMinutes,
        weakTopicCount: weakTopics.length,
        totalMinutes
      })

      return {
        studentUserId,
        name: member.profile?.full_name || member.profile?.username || 'Student',
        educationLevel: member.profile?.education_level || null,
        totalMinutes,
        totalSessions: studentLogs.length,
        learningSessions: learningLogs.length,
        reviewCount: reviewLogs.length,
        reviewSessions: reviewLogs.length,
        averageSessionMinutes: studentLogs.length > 0 ? Math.round(totalMinutes / studentLogs.length) : 0,
        averageQuality,
        dueReviews,
        currentWeekMinutes: weeklyMomentum.recentMinutes,
        previousWeekMinutes: weeklyMomentum.previousMinutes,
        trend: weeklyMomentum,
        lastActivity,
        idleDays,
        statusBreakdown,
        overall,
        attention,
        courses,
        weakTopics,
        recentActivity: buildRecentActivity(studentLogs, topicMap, courseMap),
        topics: Object.values(topicReviews).sort((a, b) => b.reviewCount - a.reviewCount)
      }
    })
    .sort((a, b) => {
      if (b.attention.priorityScore !== a.attention.priorityScore) {
        return b.attention.priorityScore - a.attention.priorityScore
      }

      if (b.dueReviews !== a.dueReviews) {
        return b.dueReviews - a.dueReviews
      }

      if (a.overall.completionPercentage !== b.overall.completionPercentage) {
        return a.overall.completionPercentage - b.overall.completionPercentage
      }

      return b.currentWeekMinutes - a.currentWeekMinutes
    })

  const courseSummaries = detail.courses
    .map((course) => {
      const courseProgressRows = progressRows.filter((row) => row.classroom_course_id === course.id)
      const courseLogs = logsByCourse.get(course.id) || []
      const distinctStudents = new Set(courseProgressRows.map((row) => row.student_user_id))
      const reviewLogs = courseLogs.filter((log) => log.session_type === 'review')
      const totalCompletion = activeMembers.reduce((sum, member) => {
        const rows = progressByCourse.get(`${member.student_user_id}:${course.id}`) || []
        return sum + summarizeCourseProgress(rows).completionPercentage
      }, 0)
      const studentsNeedingAttention = students.filter((student) => {
        const courseSummary = student.courses.find((studentCourse) => studentCourse.classroomCourseId === course.id)

        return Boolean(courseSummary?.needsAttention)
      }).length

      return {
        classroomCourseId: course.id,
        subjectTitle: course.subjects?.title || 'Untitled course',
        activeStudents: distinctStudents.size,
        averageCompletion: activeMembers.length > 0 ? Math.round(totalCompletion / activeMembers.length) : 0,
        dueReviews: courseProgressRows.filter((row) => isDueReview(row.next_review_at, now)).length,
        totalMinutes: sumStudyMinutes(courseLogs),
        reviewCount: reviewLogs.length,
        averageQuality: getAverageQuality(reviewLogs),
        lastActivity: getLatestTimestamp(courseLogs),
        studentsNeedingAttention
      }
    })
    .sort((a, b) => {
      if (b.studentsNeedingAttention !== a.studentsNeedingAttention) {
        return b.studentsNeedingAttention - a.studentsNeedingAttention
      }

      return b.dueReviews - a.dueReviews
    })

  const topicSummaries = topics
    .map((topic) => {
      const topicProgressRows = progressByTopic.get(topic.id) || []
      const topicLogs = logsByTopic.get(topic.id) || []
      const reviewLogs = topicLogs.filter((log) => log.session_type === 'review')
      const studentsAtRisk = new Set([
        ...topicProgressRows.filter((row) => isDueReview(row.next_review_at, now)).map((row) => row.student_user_id),
        ...reviewLogs.filter((log) => (log.quality_rating ?? 5) < 3).map((log) => log.user_id)
      ])

      return {
        topicId: topic.id,
        topicTitle: topic.title,
        completionCount: topicProgressRows.filter((row) => row.status === 'reviewing' || row.status === 'mastered').length,
        masteredCount: topicProgressRows.filter((row) => row.status === 'mastered').length,
        dueReviews: topicProgressRows.filter((row) => isDueReview(row.next_review_at, now)).length,
        reviewCount: reviewLogs.length,
        averageQuality: getAverageQuality(reviewLogs),
        studentsAtRisk: studentsAtRisk.size,
        lastActivity: getLatestTimestamp(topicLogs)
      }
    })
    .sort((a, b) => {
      if (b.studentsAtRisk !== a.studentsAtRisk) {
        return b.studentsAtRisk - a.studentsAtRisk
      }

      if (b.reviewCount !== a.reviewCount) {
        return b.reviewCount - a.reviewCount
      }

      return a.averageQuality === null ? 1 : b.averageQuality === null ? -1 : a.averageQuality - b.averageQuality
    })

  const averageCompletion = students.length > 0
    ? Math.round(students.reduce((sum, item) => sum + item.overall.completionPercentage, 0) / students.length)
    : 0
  const attentionStudents = students.filter((student) => student.attention.level === 'high' || student.attention.level === 'medium')
  const activeStudentsThisWeek = students.filter((student) => student.currentWeekMinutes > 0).length
  const inactiveStudents = students.filter((student) => student.idleDays === null || student.idleDays >= 7).length
  const momentumLeader = students
    .slice()
    .sort((a, b) => {
      if (b.currentWeekMinutes !== a.currentWeekMinutes) {
        return b.currentWeekMinutes - a.currentWeekMinutes
      }

      return b.overall.completionPercentage - a.overall.completionPercentage
    })[0] || null
  const topPerformer = students
    .slice()
    .sort((a, b) => {
      if (b.overall.completionPercentage !== a.overall.completionPercentage) {
        return b.overall.completionPercentage - a.overall.completionPercentage
      }

      return b.currentWeekMinutes - a.currentWeekMinutes
    })[0] || null

  return {
    classroom: detail.classroom,
    summary: {
      rosterSize: activeMembers.length,
      totalCourses: detail.courses.length,
      pendingInvites: detail.invites.filter((invite) => invite.status === 'pending').length,
      averageCompletion,
      dueReviews: progressRows.filter((row) => isDueReview(row.next_review_at, now)).length,
      totalStudyMinutes: sumStudyMinutes(logs),
      averageStudyMinutesPerStudent: activeMembers.length > 0 ? Math.round(sumStudyMinutes(logs) / activeMembers.length) : 0,
      reviewCount: logs.filter((log) => log.session_type === 'review').length,
      averageReviewQuality: getAverageQuality(logs.filter((log) => log.session_type === 'review')),
      activeStudentsThisWeek,
      studentsNeedingAttention: attentionStudents.length,
      inactiveStudents
    },
    insights: {
      attentionStudents: attentionStudents.slice(0, 5),
      momentumLeader,
      topPerformer
    },
    students,
    courses: courseSummaries,
    topics: topicSummaries
  }
}
