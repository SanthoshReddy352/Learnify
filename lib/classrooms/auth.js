function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

async function getCurrentUser(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return user
}

export async function resolveCurrentRole(supabase) {
  const user = await getCurrentUser(supabase)
  const email = normalizeEmail(user.email)

  const { data, error } = await supabase
    .from('teacher_role_allowlist')
    .select('role')
    .eq('email', email)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const role = data?.role || 'student'

  return {
    user,
    role,
    email,
    isTeacher: role === 'teacher'
  }
}

export async function requireTeacher(supabase) {
  const result = await resolveCurrentRole(supabase)

  if (!result.isTeacher) {
    throw new Error('Teacher access required')
  }

  return result
}

export {
  getCurrentUser,
  normalizeEmail
}
