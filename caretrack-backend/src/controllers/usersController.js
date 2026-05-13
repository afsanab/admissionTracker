const bcrypt = require("bcrypt");
const env = require("../config");
const { query } = require("../db/pool");

async function listUsers(req, res, next) {
  try {
    const { page, pageSize } = req.query;
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const result = await query(
      `SELECT id, username, full_name, role, is_active, last_login_at, created_at,
              COUNT(*) OVER() AS total_count
       FROM users
       ORDER BY role, username
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const total = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
    const users = result.rows.map(({ total_count: _t, ...rest }) => rest);

    req.audit("LIST_USERS");

    res.json({
      users,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { fullName, role, isActive } = req.body;

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
      [fullName ?? null, role ?? null, isActive ?? null, id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: "User not found." });

    req.audit("UPDATE_USER", { details: { targetUserId: id } });
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin resets a user's password. Forces `must_change_password=true` so the
 * user is required to set a new password the next time they log in.
 */
async function resetPassword(req, res, next) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const hash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

    const result = await query(
      `UPDATE users SET
         password_hash = $1,
         must_change_password = TRUE,
         failed_login_attempts = 0,
         locked_until = NULL,
         updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [hash, id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: "User not found." });

    req.audit("RESET_PASSWORD", { details: { targetUserId: id } });
    res.json({
      message: "Password reset successfully. User will be required to change it on next sign in.",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, updateUser, resetPassword };
