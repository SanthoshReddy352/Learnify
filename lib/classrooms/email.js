export async function sendClassroomInvites({ invites, classroomName, teacherEmail, origin }) {
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.CLASSROOM_INVITE_FROM_EMAIL || process.env.RESEND_FROM_EMAIL

  if (!resendApiKey || !fromEmail || !Array.isArray(invites) || invites.length === 0) {
    return {
      sent: false,
      count: 0
    }
  }

  let sentCount = 0

  for (const invite of invites) {
    const inviteUrl = `${origin}/classrooms/invitations?token=${encodeURIComponent(invite.token)}`
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: invite.email,
        subject: `You're invited to join ${classroomName} on Learnify`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
            <h2 style="margin-bottom: 12px;">Classroom invitation</h2>
            <p>${teacherEmail || 'A teacher'} invited you to join <strong>${classroomName}</strong> on Learnify.</p>
            <p>
              <a href="${inviteUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;">
                Join classroom
              </a>
            </p>
            <p style="font-size:12px;color:#6b7280;">This invite expires on ${new Date(invite.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.</p>
          </div>
        `
      })
    })

    if (response.ok) {
      sentCount += 1
    }
  }

  return {
    sent: sentCount > 0,
    count: sentCount
  }
}
