const bcrypt = require("bcrypt");
const { query } = require("../db/pool");

/**
 * GET /api/users
 * List all users — admin only.
 */
async function listUsers(req, res, next) {
  try {
    const result = await query(
      `SELECT id, username, full_name, role, is_active, last_login_at, created_at
       FROM users ORDER BY role, username`
    );
    req.audit("LIST_USERS");
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/:id
 * Update user details — admin only.
 */
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { fullName, role, isActive } = req.body;

    // Prevent admin from deactivating themselves
    if (id === req.user.id && isActive === false) {
      return res.status(400).json({ error: "You cannot deactivate your own account." });
    }

    const result = await query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         role = COALESCE($2, role),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
       WHERE id = $4
       RETURNING id, username, full_name, role, is_active`,
      [fullName || null, role || null, isActive ?? null, id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found." });
    }

    req.audit("UPDATE_USER", { details: { targetUserId: id } });

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/users/:id/reset-password
 * Admin resets another user's password.
 * Body: { newPassword }
 */
async function resetPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 12) {
      return res.status(400).json({ error: "New password must be at least 12 characters." });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || "12");
    const hash = await bcrypt.hash(newPassword, rounds);

    const result = await query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [hash, id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found." });
    }

    req.audit("RESET_PASSWORD", { details: { targetUserId: id } });

    res.json({ message: "Password reset successfully." });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, updateUser, resetPassword };
