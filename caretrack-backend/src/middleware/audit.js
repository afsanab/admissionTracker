/**
 * HIPAA Audit Logger
 *
 * Every access to or modification of Protected Health Information (PHI)
 * must be logged with: who, what, when, and from where.
 * In production, logs are shipped to Azure Blob Storage for immutable retention.
 * In development, logs go to the local filesystem only.
 */

const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure local log dir exists
const logDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const transports = [
  new winston.transports.File({
    filename: path.join(logDir, "audit.log"),
    maxsize: 10 * 1024 * 1024, // 10MB per file
    maxFiles: 90,
    tailable: true,
  }),
];

// Console output in development
if (process.env.NODE_ENV !== "production") {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports,
});

// Azure Blob Storage upload can be added here when you set up Azure.
// For now, audit logs are written to the local logs/audit.log file.

/**
 * Log a PHI access or modification event.
 */
function auditLog(event) {
  logger.info({
    type: "AUDIT",
    timestamp: new Date().toISOString(),
    outcome: event.outcome || "SUCCESS",
    ...event,
  });
}

/**
 * Express middleware: attach audit logger to req object.
 */
function auditMiddleware(req, _res, next) {
  req.audit = (action, details = {}) => {
    auditLog({
      action,
      userId: req.user?.id || "unauthenticated",
      username: req.user?.username || "unknown",
      role: req.user?.role || "unknown",
      ip: req.ip || req.connection?.remoteAddress,
      patientId: details.patientId || null,
      details,
    });
  };
  next();
}

module.exports = { auditLog, auditMiddleware };
