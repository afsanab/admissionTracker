const crypto = require("crypto");
const env = require("../config");
const { query } = require("../db/pool");
const { sendInvitationEmail } = require("../services/inviteEmail");

function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function defaultExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + env.INVITE_EXPIRES_DAYS);
  return d;
}

async function createInvitation(req, res, next) {
  try {
    const { username, role, email } = req.body;

    const taken = await query("SELECT 1 FROM users WHERE username = $1", [username]);
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
      [username, role, tokenHash, req.user.id, email ?? null, expiresAt]
    );

    const row = result.rows[0];
    const base =
      env.APP_PUBLIC_URL?.replace(/\/$/, "") ||
      `${req.protocol}://${req.get("host")}`;
    const inviteUrl = `${base}${env.INVITE_PATH}${encodeURIComponent(token)}`;

    req.audit("CREATE_INVITATION", {
      details: { invitationId: row.id, username, role },
    });

    let emailResult = { sent: false };
    if (email) {
      emailResult = await sendInvitationEmail({ to: email, inviteUrl, username, role });
      if (emailResult.sent) {
        req.audit("INVITE_EMAIL_SENT", {
          details: { to: email, invitationId: row.id },
        });
      }
    }

    res.status(201).json({
      invitation: row,
      token,
      inviteUrl,
      message:
        email && emailResult.sent
          ? "Invitation created and emailed."
          : email && !emailResult.sent
            ? `Invitation created. Email was not sent: ${emailResult.skippedReason || "unknown"}. Copy the link below.`
            : "Share this link once. It will not be shown again.",
      emailSent: Boolean(email && emailResult.sent),
      emailNote: email && !emailResult.sent ? emailResult.skippedReason : undefined,
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error:
          "There is already a pending invitation for this username. Revoke it first or use a different username.",
      });
    }
    next(err);
  }
}

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

async function inviteInfo(req, res, next) {
  try {
    const tokenHash = hashToken(req.query.token.trim());
    const result = await query(
      `SELECT username, role, email, expires_at
       FROM invitations
       WHERE token_hash = $1 AND used_at IS NULL`,
      [tokenHash]
    );
    const inv = result.rows[0];
    if (!inv) return res.status(404).json({ error: "Invalid or expired invitation." });
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
