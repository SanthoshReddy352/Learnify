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

  const { data: progressRows } = studentIds.length > 0
    ? await privilegedReader
        .from('student_topic_progress')
        .select('classroom_course_id, student_user_id, topic_id, status, next_review_at')
        .eq('classroom_id', classroomId)
        .in('student_user_id', studentIds)
    : { data: [] }

  const { data: logs } = studentIds.length > 0
    ? await privilegedReader
        .from('study_logs')
        .select('user_id, topic_id, classroom_course_id, session_type, duration_minutes, quality_rating, created_at')
        .eq('classroom_id', classroomId)
        .eq('source_type', 'classroom')
        .in('user_id', studentIds)
    : { data: [] }

  const topicIds = [...new Set((progressRows || []).map((row) => row.topic_id))]
  const { data: topics } = topicIds.length > 0
    ? await privilegedReader
        .from('topics')
        .select('id, title')
        .in('id', topicIds)
    : { data: [] }

  const topicMap = new Map()
  ;(topics || []).forEach((topic) => topicMap.set(topic.id, topic))

  const logsByStudent = new Map()
  ;(logs || []).forEach((log) => {
    const list = logsByStudent.get(log.user_id) || []
    list.push(log)
    logsByStudent.set(log.user_id, list)
  })

  const progressByStudent = new Map()
  ;(progressRows || []).forEach((row) => {
    const list = progressByStudent.get(row.student_user_id) || []
    list.push(row)
    progressByStudent.set(row.student_user_id, list)
  })

  const progressByCourse = new Map()
  ;(progressRows || []).forEach((row) => {
    const key = `${row.student_user_id}:${row.classroom_course_id}`
    const list = progressByCourse.get(key) || []
    list.push(row)
    progressByCourse.set(key, list)
  })

  const students = activeMembers.map((member) => {
    const studentProgress = progressByStudent.get(member.student_user_id) || []
    const studentLogs = logsByStudent.get(member.student_user_id) || []
    const totalMinutes = studentLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0)
    const reviewLogs = studentLogs.filter((log) => log.session_type === 'review')
    const lastActivity = studentLogs.reduce((latest, log) => {
      if (!latest || new Date(log.created_at) > new Date(latest)) {
        return log.created_at
      }
      return latest
    }, null)

    const courses = detail.courses.map((course) => ({
      classroomCourseId: course.id,
      subjectTitle: course.subjects?.title || 'Untitled course',
      ...summarizeCourseProgress(progressByCourse.get(`${member.student_user_id}:${course.id}`) || [])
    }))

    const topicReviews = reviewLogs.reduce((accumulator, log) => {
      const key = log.topic_id

      if (!accumulator[key]) {
        accumulator[key] = {
          topicId: log.topic_id,
          topicTitle: topicMap.get(log.topic_id)?.title || 'Untitled topic',
          reviewCount: 0,
          lastReviewedAt: log.created_at
        }
      }

      accumulator[key].reviewCount += 1
      if (new Date(log.created_at) > new Date(accumulator[key].lastReviewedAt)) {
        accumulator[key].lastReviewedAt = log.created_at
      }

      return accumulator
    }, {})

    return {
      studentUserId: member.student_user_id,
      name: member.profile?.full_name || member.profile?.username || 'Student',
      educationLevel: member.profile?.education_level || null,
      totalMinutes,
      reviewCount: reviewLogs.length,
      lastActivity,
      overall: summarizeCourseProgress(studentProgress),
      courses,
      topics: Object.values(topicReviews).sort((a, b) => b.reviewCount - a.reviewCount)
    }
  })

  const courseSummaries = detail.courses.map((course) => {
    const courseProgressRows = (progressRows || []).filter((row) => row.classroom_course_id === course.id)
    const courseLogs = (logs || []).filter((log) => log.classroom_course_id === course.id)
    const distinctStudents = new Set(courseProgressRows.map((row) => row.student_user_id))
    const totalCompletion = activeMembers.reduce((sum, member) => {
      const rows = progressByCourse.get(`${member.student_user_id}:${course.id}`) || []
      return sum + summarizeCourseProgress(rows).completionPercentage
    }, 0)

    return {
      classroomCourseId: course.id,
      subjectTitle: course.subjects?.title || 'Untitled course',
      activeStudents: distinctStudents.size,
      averageCompletion: activeMembers.length > 0 ? Math.round(totalCompletion / activeMembers.length) : 0,
      dueReviews: courseProgressRows.filter((row) => row.next_review_at && new Date(row.next_review_at) <= new Date()).length,
      totalMinutes: courseLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0),
      reviewCount: courseLogs.filter((log) => log.session_type === 'review').length
    }
  })

  const topicSummaries = (topics || []).map((topic) => {
    const topicProgressRows = (progressRows || []).filter((row) => row.topic_id === topic.id)
    const topicLogs = (logs || []).filter((log) => log.topic_id === topic.id)
    const reviewLogs = topicLogs.filter((log) => log.session_type === 'review')
    const averageQuality = reviewLogs.length > 0
      ? Number((reviewLogs.reduce((sum, log) => sum + (log.quality_rating || 0), 0) / reviewLogs.length).toFixed(1))
      : null

    return {
      topicId: topic.id,
      topicTitle: topic.title,
      completionCount: topicProgressRows.filter((row) => row.status === 'reviewing' || row.status === 'mastered').length,
      masteredCount: topicProgressRows.filter((row) => row.status === 'mastered').length,
      reviewCount: reviewLogs.length,
      averageQuality,
      lastActivity: topicLogs.reduce((latest, log) => {
        if (!latest || new Date(log.created_at) > new Date(latest)) {
          return log.created_at
        }
        return latest
      }, null)
    }
  }).sort((a, b) => {
    if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount
    return a.averageQuality === null ? 1 : b.averageQuality === null ? -1 : a.averageQuality - b.averageQuality
  })

  const averageCompletion = students.length > 0
    ? Math.round(students.reduce((sum, item) => sum + item.overall.completionPercentage, 0) / students.length)
    : 0

  return {
    classroom: detail.classroom,
    summary: {
      rosterSize: activeMembers.length,
      totalCourses: detail.courses.length,
      pendingInvites: detail.invites.filter((invite) => invite.status === 'pending').length,
      averageCompletion,
      dueReviews: (progressRows || []).filter((row) => row.next_review_at && new Date(row.next_review_at) <= new Date()).length,
      totalStudyMinutes: (logs || []).reduce((sum, log) => sum + (log.duration_minutes || 0), 0),
      reviewCount: (logs || []).filter((log) => log.session_type === 'review').length
    },
    students,
    courses: courseSummaries,
    topics: topicSummaries
  }
}
