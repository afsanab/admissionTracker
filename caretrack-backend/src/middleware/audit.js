/**
 * HIPAA Audit Logger
 *
 * Every access to or modification of Protected Health Information (PHI)
 * must be logged with: who, what, when, and from where.
 * In production, logs are shipped to Azure Blob Storage for immutable retention.
 * In development, logs go to the local filesystem.
 */

const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure local log dir exists in development
const logDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const transports = [
  // Always log to local files
  new winston.transports.File({
    filename: path.join(logDir, "audit.log"),
    maxsize: 10 * 1024 * 1024, // 10MB per file
    maxFiles: 90,              // 90 rolling files ≈ ~900MB max local retention
    tailable: true,
  }),
];

// In production, also ship to Azure Blob Storage if configured
if (
  process.env.NODE_ENV === "production" &&
  process.env.AZURE_STORAGE_CONNECTION_STRING
) {
  try {
    const AzureBlobTransport = require("winston-azure-blob-storage");
    transports.push(
      new AzureBlobTransport({
        account: {
          connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
          containerName: process.env.AZURE_AUDIT_CONTAINER || "caretrack-audit-logs",
        },
        blobName: () => `audit-${new Date().toISOString().slice(0, 10)}.log`,
      })
    );
    console.log("[Audit] Azure Blob Storage transport enabled");
  } catch (e) {
    console.warn("[Audit] Azure Blob transport unavailable, falling back to local:", e.message);
  }
}

// Also stream to console in development
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

/**
 * Log a PHI access or modification event.
 *
 * @param {Object} event
 * @param {string} event.action     - e.g. "READ_PATIENT", "UPDATE_TASK", "LOGIN"
 * @param {string} event.userId     - The authenticated user's ID
 * @param {string} event.username   - The authenticated user's username
 * @param {string} event.role       - "physician" | "admin"
 * @param {string} [event.patientId] - Affected patient ID (if applicable)
 * @param {Object} [event.details]  - Additional context (sanitized — no raw PHI)
 * @param {string} event.ip         - Request IP address
 * @param {string} [event.outcome]  - "SUCCESS" | "FAILURE"
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
