const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../middleware/auth");
const { login, logout, me, changePassword } = require("../controllers/authController");
const {
  listPatients, getPatient, createPatient,
  updatePatient, admitPatient, dischargePatient, deletePatient,
} = require("../controllers/patientsController");
const { listTasks, upsertTask, assignTask, completeTask, updateTaskNote } = require("../controllers/tasksController");
const { listUsers, createUser, updateUser, resetPassword } = require("../controllers/usersController");

// ── Auth ──────────────────────────────────────────────
router.post("/auth/login", login);
router.post("/auth/logout", requireAuth, logout);
router.get("/auth/me", requireAuth, me);
router.post("/auth/change-password", requireAuth, changePassword);

// ── Patients ──────────────────────────────────────────
// Both roles can list and read patients (scoped server-side by role)
router.get("/patients", requireAuth, listPatients);
router.get("/patients/:id", requireAuth, getPatient);

// Both roles can create patients
router.post("/patients", requireAuth, createPatient);

// Admin-only mutations
router.patch("/patients/:id", requireAuth, requireRole("admin"), updatePatient);
router.post("/patients/:id/admit", requireAuth, requireRole("admin"), admitPatient);
router.post("/patients/:id/discharge", requireAuth, requireRole("admin"), dischargePatient);
router.delete("/patients/:id", requireAuth, requireRole("admin"), deletePatient);

// ── Tasks ─────────────────────────────────────────────
router.get("/patients/:patientId/tasks", requireAuth, listTasks);
router.post("/patients/:patientId/tasks", requireAuth, requireRole("admin"), upsertTask);
router.patch("/patients/:patientId/tasks/:taskId/assign", requireAuth, requireRole("admin"), assignTask);
router.patch("/patients/:patientId/tasks/:taskId/complete", requireAuth, requireRole("physician"), completeTask);
router.patch("/patients/:patientId/tasks/:taskId/note", requireAuth, requireRole("admin"), updateTaskNote);

// ── Users (admin only) ────────────────────────────────
router.get("/users", requireAuth, requireRole("admin"), listUsers);
router.post("/users", requireAuth, requireRole("admin"), createUser);
router.patch("/users/:id", requireAuth, requireRole("admin"), updateUser);
router.post("/users/:id/reset-password", requireAuth, requireRole("admin"), resetPassword);

// ── Health check ──────────────────────────────────────
router.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

module.exports = router;
