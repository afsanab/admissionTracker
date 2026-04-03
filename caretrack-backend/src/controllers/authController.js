const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { query, withTransaction } = require("../db/pool");
const { auditLog } = require("../middleware/audit");
const { hashToken } = require("./invitationsController");

/**
 * POST /api/auth/login
 * Body: { username, password, role }
 *
 * Returns a signed JWT on success.
 * HIPAA: All login attempts (success and failure) are audit-logged.
 */
async function login(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress;

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    // Look up the user — always run bcrypt even on miss to prevent timing attacks
    const result = await query(
      "SELECT id, username, password_hash, role, is_active, full_name FROM users WHERE username = $1",
      [username.trim().toLowerCase()]
    );

    const user = result.rows[0];

    // Use a dummy hash if user not found to keep timing consistent
    const dummyHash = "$2b$12$invalidhashfortimingattackprevention.padding000000000000";
    const hashToCheck = user ? user.password_hash : dummyHash;
    const passwordMatch = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatch) {
      auditLog({
        action: "LOGIN_FAILURE",
        userId: "unknown",
        username: username,
        role: "unknown",
        ip,
        outcome: "FAILURE",
        details: { reason: !user ? "user_not_found" : "wrong_password" },
      });
      return res.status(401).json({ error: "Invalid username or password." });
    }

    if (!user.is_active) {
      auditLog({
        action: "LOGIN_FAILURE",
        userId: user.id,
        username: user.username,
        role: user.role,
        ip,
        outcome: "FAILURE",
        details: { reason: "account_disabled" },
      });
      return res.status(403).json({ error: "Account is disabled. Contact your administrator." });
    }

    // Sign JWT
    const payload = { id: user.id, username: user.username, role: user.role, fullName: user.full_name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });

    // Update last login timestamp
    await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    auditLog({
      action: "LOGIN_SUCCESS",
      userId: user.id,
      username: user.username,
      role: user.role,
      ip,
      outcome: "SUCCESS",
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
      },
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Logs the logout event. The client is responsible for discarding the token.
 * (For token invalidation at scale, implement a Redis blocklist.)
 */
async function logout(req, res) {
  auditLog({
    action: "LOGOUT",
    userId: req.user.id,
    username: req.user.username,
    role: req.user.role,
    ip: req.ip,
    outcome: "SUCCESS",
  });
  res.json({ message: "Logged out successfully." });
}

/**
 * GET /api/auth/me
 * Returns the current user's profile from the DB (validates token is still valid).
 */
async function me(req, res, next) {
  try {
    const result = await query(
      "SELECT id, username, full_name, role, last_login_at FROM users WHERE id = $1 AND is_active = true",
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ error: "User not found or disabled." });
    }
    const row = result.rows[0];
    res.json({
      user: {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        role: row.role,
        lastLoginAt: row.last_login_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * Admin-only: POST /api/auth/reset-password handled in admin routes.
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Both current and new passwords are required." });
    }
    if (newPassword.length < 12) {
      return res.status(400).json({ error: "New password must be at least 12 characters." });
    }

    const result = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    const match = await bcrypt.compare(currentPassword, user.password_hash);

    if (!match) {
      auditLog({
        action: "CHANGE_PASSWORD_FAILURE",
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        ip: req.ip,
        outcome: "FAILURE",
      });
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || "12");
    const newHash = await bcrypt.hash(newPassword, rounds);
    await query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [
      newHash,
      req.user.id,
    ]);

    auditLog({
      action: "CHANGE_PASSWORD_SUCCESS",
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      ip: req.ip,
      outcome: "SUCCESS",
    });

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/register
 * Body: { token, password, fullName? }
 * Completes signup from an admin invitation; returns JWT on success.
 */
async function registerWithInvite(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress;

  try {
    const { token, password, fullName } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "token and password are required." });
    }
    if (password.length < 12) {
      return res.status(400).json({ error: "Password must be at least 12 characters." });
    }

    const tokenHash = hashToken(String(token).trim());

    const userRow = await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, username, role, expires_at
         FROM invitations
         WHERE token_hash = $1 AND used_at IS NULL
         FOR UPDATE`,
        [tokenHash]
      );
      const inv = invRes.rows[0];
      if (!inv) {
        return null;
      }
      if (new Date(inv.expires_at) <= new Date()) {
        return { expired: true };
      }

      const exists = await client.query("SELECT 1 FROM users WHERE username = $1", [inv.username]);
      if (exists.rows[0]) {
        return { usernameTaken: true, username: inv.username };
      }

      const rounds = parseInt(process.env.BCRYPT_ROUNDS || "12");
      const passwordHash = await bcrypt.hash(password, rounds);
      const id = uuidv4();

      await client.query(
        `INSERT INTO users (id, username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, inv.username, passwordHash, fullName?.trim() || null, inv.role]
      );
      await client.query("UPDATE invitations SET used_at = NOW() WHERE id = $1", [inv.id]);

      const u = await client.query(
        "SELECT id, username, full_name, role FROM users WHERE id = $1",
        [id]
      );
      return { user: u.rows[0] };
    });

    if (!userRow) {
      auditLog({
        action: "REGISTER_INVITE_FAILURE",
        userId: "unknown",
        username: "unknown",
        role: "unknown",
        ip,
        outcome: "FAILURE",
        details: { reason: "invalid_or_used_token" },
      });
      return res.status(400).json({ error: "Invalid or expired invitation." });
    }
    if (userRow.expired) {
      return res.status(410).json({ error: "This invitation has expired." });
    }
    if (userRow.usernameTaken) {
      return res.status(409).json({
        error: `The username "${userRow.username}" is already registered.`,
      });
    }

    const user = userRow.user;
    const jwtPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
    };
    const signed = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });

    auditLog({
      action: "REGISTER_INVITE_SUCCESS",
      userId: user.id,
      username: user.username,
      role: user.role,
      ip,
      outcome: "SUCCESS",
    });

    res.status(201).json({
      token: signed,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
      },
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me, changePassword, registerWithInvite };
