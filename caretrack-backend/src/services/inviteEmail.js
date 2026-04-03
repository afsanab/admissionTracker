/**
 * Optional invite emails via Resend (https://resend.com).
 * No SMTP server to run — set RESEND_API_KEY and EMAIL_FROM in .env.
 * For development, Resend allows sending to your own verified address.
 */

const ROLE_LABEL = { physician: "Physician", admin: "Admissions staff" };

async function sendInvitationEmail({ to, inviteUrl, username, role }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      sent: false,
      skippedReason: "Email not configured (set RESEND_API_KEY and EMAIL_FROM).",
    };
  }

  const roleLabel = ROLE_LABEL[role] || role;
  const subject = "You're invited to CareTrack";
  const html = `
    <p>You've been invited to create your CareTrack account.</p>
    <p><strong>Username:</strong> ${escapeHtml(username)}<br/>
    <strong>Role:</strong> ${escapeHtml(roleLabel)}</p>
    <p><a href="${escapeHtml(inviteUrl)}">Accept invitation and set your password</a></p>
    <p style="color:#666;font-size:12px;">This link expires on the date shown in the app. If you did not expect this email, you can ignore it.</p>
  `.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      sent: false,
      skippedReason: data.message || `Resend error (${res.status})`,
    };
  }

  return { sent: true, id: data.id };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { sendInvitationEmail };
