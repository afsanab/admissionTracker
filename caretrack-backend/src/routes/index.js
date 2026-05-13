const express = require("express");
const router = express.Router();

const { requireAuth, requireRole, csrfProtect } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const S = require("../schemas");

const {
  login, logout, me, changePassword, registerWithInvite,
} = require("../controllers/authController");
const {
  listPatients, getPatient, createPatient,
  updatePatient, admitPatient, dischargePatient, deletePatient,
} = require("../controllers/patientsController");
const {
  listTasks, upsertTask, assignTask, completeTask, updateTaskNote,
} = require("../controllers/tasksController");
const { listUsers, updateUser, resetPassword } = require("../controllers/usersController");
const {
  createInvitation, listInvitations, revokeInvitation, inviteInfo,
} = require("../controllers/invitationsController");

// ── Auth ──────────────────────────────────────────────
router.get("/auth/invite-info", validate({ query: S.InviteInfoQuery }), inviteInfo);
router.post("/auth/register", validate({ body: S.RegisterInvite }), registerWithInvite);
router.post("/auth/login", validate({ body: S.Login }), login);
router.post("/auth/logout", requireAuth, csrfProtect, logout);
router.get("/auth/me", requireAuth, me);
router.post("/auth/change-password", requireAuth, csrfProtect, validate({ body: S.ChangePassword }), changePassword);

// ── Patients ──────────────────────────────────────────
router.get("/patients", requireAuth, validate({ query: S.PatientListQuery }), listPatients);
router.get("/patients/:id", requireAuth, validate({ params: S.IdParam }), getPatient);

router.post("/patients", requireAuth, csrfProtect, validate({ body: S.PatientCreate }), createPatient);
router.patch("/patients/:id", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.IdParam, body: S.PatientUpdate }), updatePatient);
router.post("/patients/:id/admit", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.IdParam }), admitPatient);
router.post("/patients/:id/discharge", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.IdParam }), dischargePatient);
router.delete("/patients/:id", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.IdParam }), deletePatient);

// ── Tasks ─────────────────────────────────────────────
router.get("/patients/:patientId/tasks", requireAuth, validate({ params: S.PatientIdParam }), listTasks);

router.post("/patients/:patientId/tasks", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.PatientIdParam, body: S.TaskUpsert }), upsertTask);
router.patch("/patients/:patientId/tasks/:taskId/assign", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.PatientAndTaskIdParam, body: S.TaskAssign }), assignTask);
router.patch("/patients/:patientId/tasks/:taskId/complete", requireAuth, csrfProtect, requireRole("physician"),
  validate({ params: S.PatientAndTaskIdParam }), completeTask);
router.patch("/patients/:patientId/tasks/:taskId/note", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.PatientAndTaskIdParam, body: S.TaskNote }), updateTaskNote);

// ── Users (admin only) ────────────────────────────────
router.get("/users", requireAuth, requireRole("admin"), validate({ query: S.PaginatedQuery }), listUsers);
router.patch("/users/:id", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.IdParam, body: S.UserUpdate }), updateUser);
router.post("/users/:id/reset-password", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.IdParam, body: S.ResetPassword }), resetPassword);

// ── Invitations ───────────────────────────────────────
router.post("/invitations", requireAuth, csrfProtect, requireRole("admin"),
  validate({ body: S.InviteCreate }), createInvitation);
router.get("/invitations", requireAuth, requireRole("admin"), listInvitations);
router.delete("/invitations/:id", requireAuth, csrfProtect, requireRole("admin"),
  validate({ params: S.IdParam }), revokeInvitation);

// ── Health ────────────────────────────────────────────
const { ping } = require("../db/pool");
router.get("/health", async (req, res) => {
  const deep = req.query.deep === "1";
  const out = { status: "ok", timestamp: new Date().toISOString() };
  if (deep) {
    try {
      await ping();
      out.db = "ok";
    } catch (err) {
      out.status = "degraded";
      out.db = "error";
      return res.status(503).json(out);
    }
  }
  res.json(out);
});

module.exports = router;
