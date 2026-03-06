/**
 * Centralized error handler.
 * Prevents stack traces and internal details from leaking to clients in production.
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV !== "production";

  // Log server errors
  if (status >= 500) {
    console.error("[ERROR]", {
      status,
      message: err.message,
      path: req.path,
      user: req.user?.username || "unauthenticated",
      stack: isDev ? err.stack : undefined,
    });
  }

  // Never expose internal details in production
  const message =
    status >= 500 && !isDev
      ? "An internal error occurred. Please contact support."
      : err.message || "Unknown error";

  res.status(status).json({
    error: message,
    ...(isDev && status >= 500 ? { stack: err.stack } : {}),
  });
}

/**
 * 404 handler — catch unmatched routes.
 */
function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFound };
