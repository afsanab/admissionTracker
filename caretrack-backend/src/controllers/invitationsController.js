const crypto = require("crypto");
const { query } = require("../db/pool");
const { sendInvitationEmail } = require("../services/inviteEmail");

function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function defaultExpiresAt() {
  const days = parseInt(process.env.INVITE_EXPIRES_DAYS || "7", 10);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * POST /api/invitations — admin only
 * Body: { username, role, email? }
 * Returns the raw token once (for copying the invite link).
 */
async function createInvitation(req, res, next) {
  try {
    const { username, role, email } = req.body;

    if (!username || !role) {
      return res.status(400).json({ error: "username and role are required." });
    }
    if (!["physician", "admin"].includes(role)) {
      return res.status(400).json({ error: "Role must be 'physician' or 'admin'." });
    }

    const uname = username.trim().toLowerCase();
    if (uname.length < 2) {
      return res.status(400).json({ error: "Username must be at least 2 characters." });
    }

    const taken = await query("SELECT 1 FROM users WHERE username = $1", [uname]);
    if (taken.rows[0]) {
      return res.status(409).json({ error: "That username is already registered." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = defaultExpiresAt();

    const result = await query(
      `INSERT INTO invitations (username, role, token_hash, invited_by, email, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, role, email, expires_at, created_at`,
      [uname, role, tokenHash, req.user.id, email?.trim() || null, expiresAt]
    );

    const row = result.rows[0];
    const base =
      process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ||
      `${req.protocol}://${req.get("host")}`;
    const invitePath = process.env.INVITE_PATH || "/?invite=";
    const inviteUrl = `${base}${invitePath}${encodeURIComponent(token)}`;

    req.audit("CREATE_INVITATION", { details: { invitationId: row.id, username: uname, role } });

    let emailResult = { sent: false };
    const inviteeEmail = email?.trim();
    if (inviteeEmail) {
      emailResult = await sendInvitationEmail({
        to: inviteeEmail,
        inviteUrl,
        username: uname,
        role,
      });
      if (emailResult.sent) {
        req.audit("INVITE_EMAIL_SENT", { details: { to: inviteeEmail, invitationId: row.id } });
      }
    }

    res.status(201).json({
      invitation: row,
      token,
      inviteUrl,
      message: inviteeEmail && emailResult.sent
        ? "Invitation created and emailed."
        : inviteeEmail && !emailResult.sent
          ? `Invitation created. Email was not sent: ${emailResult.skippedReason || "unknown"}. Copy the link below.`
          : "Share this link once. It will not be shown again.",
      emailSent: Boolean(inviteeEmail && emailResult.sent),
      emailNote: inviteeEmail && !emailResult.sent ? emailResult.skippedReason : undefined,
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "There is already a pending invitation for this username. Revoke it first or use a different username.",
      });
    }
    next(err);
  }
}

/**
 * GET /api/invitations — admin only; pending invites
 */
async function listInvitations(req, res, next) {
  try {
    const result = await query(
      `SELECT i.id, i.username, i.role, i.email, i.expires_at, i.used_at, i.created_at,
              u.username AS invited_by_username
       FROM invitations i
       JOIN users u ON u.id = i.invited_by
       WHERE i.used_at IS NULL AND i.expires_at > NOW()
       ORDER BY i.created_at DESC`
    );
    req.audit("LIST_INVITATIONS", { count: result.rowCount });
    res.json({ invitations: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/invitations/:id — admin only
 */
async function revokeInvitation(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      "DELETE FROM invitations WHERE id = $1 AND used_at IS NULL RETURNING id",
      [id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Invitation not found or already used." });
    }
    req.audit("REVOKE_INVITATION", { details: { invitationId: id } });
    res.json({ message: "Invitation revoked." });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/invite-info?token= — public; validate token for signup form
 */
async function inviteInfo(req, res, next) {
  try {
    const token = req.query.token;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token query parameter is required." });
    }

    const tokenHash = hashToken(token.trim());
    const result = await query(
      `SELECT username, role, email, expires_at
       FROM invitations
       WHERE token_hash = $1 AND used_at IS NULL`,
      [tokenHash]
    );
    const inv = result.rows[0];
    if (!inv) {
      return res.status(404).json({ error: "Invalid or expired invitation." });
    }
    if (new Date(inv.expires_at) <= new Date()) {
      return res.status(410).json({ error: "This invitation has expired." });
    }

    res.json({
      username: inv.username,
      role: inv.role,
      email: inv.email,
      expiresAt: inv.expires_at,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createInvitation,
  listInvitations,
  revokeInvitation,
  inviteInfo,
  hashToken,
};
