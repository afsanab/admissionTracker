require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const routes = require("./routes");
const { auditMiddleware } = require("./middleware/audit");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security headers (HIPAA: protect PHI in transit) ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  hsts: {
    maxAge: 31536000,        // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

// ── CORS ──────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow Postman / curl in dev (no origin header)
    if (!origin && process.env.NODE_ENV !== "production") return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// ── Rate limiting (HIPAA: prevent brute-force on PHI endpoints) ──
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),  // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX || "100"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// Stricter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

app.use("/api/auth/login", authLimiter);
app.use("/api", limiter);

// ── Body parsing ──────────────────────────────────────
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false }));

// ── HTTP request logging ──────────────────────────────
// In production, use a log format that doesn't log request bodies (PHI protection)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── Audit middleware ──────────────────────────────────
app.use(auditMiddleware);

// ── Disable x-powered-by header ──────────────────────
app.disable("x-powered-by");

// ── Routes ────────────────────────────────────────────
app.use("/api", routes);

// ── 404 & error handlers ─────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║          CareTrack API Server                ║
║  Port    : ${PORT}                               ║
║  Env     : ${(process.env.NODE_ENV || "development").padEnd(34)}║
║  DB Host : ${(process.env.DB_HOST || "localhost").slice(0, 33).padEnd(34)}║
╚══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

module.exports = app;
