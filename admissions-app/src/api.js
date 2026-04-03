/**
 * CareTrack API — uses same-origin /api in dev (Vite proxy) or VITE_API_BASE in production.
 */
import { getActiveTasks } from "./taskLogic.js";

const STORAGE_KEY = "caretrack_token";

const BASE = import.meta.env.VITE_API_BASE || "";

export function getStoredToken() {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setStoredToken(token) {
  if (token) sessionStorage.setItem(STORAGE_KEY, token);
  else sessionStorage.removeItem(STORAGE_KEY);
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const get = (path) => request("GET", path);
const post = (path, body) => request("POST", path, body);
const patch = (path, body) => request("PATCH", path, body);
const del = (path) => request("DELETE", path);

export const auth = {
  login: (username, password) => post("/api/auth/login", { username, password }),
  logout: () => post("/api/auth/logout"),
  me: () => get("/api/auth/me"),
  inviteInfo: (token) => get(`/api/auth/invite-info?token=${encodeURIComponent(token)}`),
  register: (body) => post("/api/auth/register", body),
  changePassword: (currentPassword, newPassword) =>
    post("/api/auth/change-password", { currentPassword, newPassword }),
};

export const invitations = {
  create: (body) => post("/api/invitations", body),
  list: () => get("/api/invitations"),
  revoke: (id) => del(`/api/invitations/${id}`),
};

export const patients = {
  list: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return get(`/api/patients${qs ? `?${qs}` : ""}`);
  },
  get: (id) => get(`/api/patients/${id}`),
  create: (data) => post("/api/patients", data),
  update: (id, data) => patch(`/api/patients/${id}`, data),
  admit: (id) => post(`/api/patients/${id}/admit`),
  discharge: (id) => post(`/api/patients/${id}/discharge`),
  delete: (id) => del(`/api/patients/${id}`),
};

export const tasks = {
  list: (patientId) => get(`/api/patients/${patientId}/tasks`),
  upsert: (patientId, data) => post(`/api/patients/${patientId}/tasks`, data),
  assign: (patientId, taskId, body = {}) =>
    patch(`/api/patients/${patientId}/tasks/${taskId}/assign`, body),
  complete: (patientId, taskId) =>
    patch(`/api/patients/${patientId}/tasks/${taskId}/complete`),
  updateNote: (patientId, taskId, note) =>
    patch(`/api/patients/${patientId}/tasks/${taskId}/note`, { note }),
};

export const users = {
  list: () => get("/api/users"),
  update: (id, data) => patch(`/api/users/${id}`, data),
  resetPassword: (id, newPassword) =>
    post(`/api/users/${id}/reset-password`, { newPassword }),
};

// ── Mappers ─────────────────────────────────────────────

export function formatDob(dob) {
  if (!dob) return "";
  const s = typeof dob === "string" ? dob : new Date(dob).toISOString();
  return s.slice(0, 10);
}

export function patientRowToAdmission(p) {
  let arrival = "";
  if (p.arrival_at) {
    const d = new Date(p.arrival_at);
    const pad = (n) => String(n).padStart(2, "0");
    arrival = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return {
    id: p.id,
    last: p.last_name,
    first: p.first_name,
    dob: formatDob(p.dob),
    room: p.room || "",
    arrival,
    dx: p.diagnosis || "",
    notes: p.notes || "",
    status: p.status,
    admitTs: p.admit_ts ? new Date(p.admit_ts).getTime() : null,
    physician: p.physician_username || "",
    location: p.location || "",
  };
}

export function admissionToApiBody(form) {
  return {
    firstName: form.first.trim(),
    lastName: form.last.trim(),
    dob: form.dob,
    room: form.room || null,
    arrivalAt: form.arrival ? new Date(form.arrival).toISOString() : null,
    diagnosis: form.dx || null,
    notes: form.notes || null,
    status: form.status,
    physicianUsername: form.physician?.trim() || null,
    location: form.location || null,
  };
}

export function apiTasksToSavedMap(rows) {
  const saved = {};
  for (const t of rows) {
    const id =
      t.task_key === "hp" ? "hp" : t.task_key === "30day" ? "30day" : `60day-c${t.cycle}`;
    saved[id] = {
      status: t.status === "completed" ? "completed" : "pending",
      assignedAt: t.assigned_at ? new Date(t.assigned_at).getTime() : null,
      completedAt: t.completed_at ? new Date(t.completed_at).getTime() : null,
      completedBy: t.completed_by || null,
      note: t.note || "",
      apiTaskId: t.id,
    };
  }
  return saved;
}

export async function syncTaskRowsForPatient(patientId, admitTs) {
  const defs = getActiveTasks(admitTs);
  for (const def of defs) {
    await tasks.upsert(patientId, {
      taskKey: def.key,
      taskLabel: def.label,
      cycle: def.cycle,
      dueAt: new Date(def.dueDate).toISOString(),
      appearsAt: def.appearsOn ? new Date(def.appearsOn).toISOString() : null,
    });
  }
}

export async function loadPatientsAndTasks() {
  const { patients: rows } = await patients.list();
  const adm = rows.map(patientRowToAdmission);
  const inhouse = rows.filter((p) => p.status === "inhouse" && p.admit_ts);
  const taskState = {};
  await Promise.all(
    inhouse.map(async (p) => {
      const { tasks: trows } = await tasks.list(p.id);
      taskState[p.id] = apiTasksToSavedMap(trows);
    })
  );
  return { admissions: adm, taskState };
}
