const jwt = require("jsonwebtoken");

/**
 * Verify JWT from Authorization header.
 * Attaches decoded payload to req.user on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, username, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Restrict a route to one or more roles.
 * Must be used AFTER requireAuth.
 *
 * Usage: router.delete('/patients/:id', requireAuth, requireRole('admin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
}

/**
 * For physician routes: ensure they can only access their own patients.
 * Admins can access all patients.
 * Attach a helper to req for controllers to use.
 */
function attachPatientFilter(req, _res, next) {
  if (req.user.role === "physician") {
    // Physicians only see patients assigned to them
    req.physicianFilter = req.user.username;
  } else {
    req.physicianFilter = null; // admins see all
  }
  next();
}

module.exports = { requireAuth, requireRole, attachPatientFilter };
