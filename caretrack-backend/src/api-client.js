/**
 * CareTrack API Client
 *
 * Drop this file into your React project at src/api.js
 * Set VITE_API_URL in your frontend .env:
 *   VITE_API_URL=http://localhost:3001/api
 */

const BASE = import.meta.env.VITE_API_URL || "/api";

// ── Token storage ─────────────────────────────────────────────
// Stored in memory only (not localStorage) for HIPAA compliance.
// The token is lost on page refresh, requiring re-login — intentional.
let _token = null;

export function setToken(token) { _token = token; }
export function clearToken()    { _token = null; }
export function getToken()      { return _token; }

// ── Base fetch wrapper ────────────────────────────────────────
async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

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

const get    = (path)        => request("GET",    path);
const post   = (path, body)  => request("POST",   path, body);
const patch  = (path, body)  => request("PATCH",  path, body);
const del    = (path)        => request("DELETE", path);

// ── Auth ─────────────────────────────────────────────────────
export const auth = {
  login:          (username, password) => post("/auth/login", { username, password }),
  logout:         ()                   => post("/auth/logout"),
  me:             ()                   => get("/auth/me"),
  inviteInfo:     (token)              => get(`/auth/invite-info?token=${encodeURIComponent(token)}`),
  register:       (body)               => post("/auth/register", body),
  changePassword: (currentPassword, newPassword) =>
    post("/auth/change-password", { currentPassword, newPassword }),
};

// ── Patients ─────────────────────────────────────────────────
export const patients = {
  list:      (filters = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    ).toString();
    return get(`/patients${qs ? `?${qs}` : ""}`);
  },
  get:       (id)    => get(`/patients/${id}`),
  create:    (data)  => post("/patients", data),
  update:    (id, data) => patch(`/patients/${id}`, data),
  admit:     (id)    => post(`/patients/${id}/admit`),
  discharge: (id)    => post(`/patients/${id}/discharge`),
  delete:    (id)    => del(`/patients/${id}`),
};

// ── Tasks ─────────────────────────────────────────────────────
export const tasks = {
  list:       (patientId)            => get(`/patients/${patientId}/tasks`),
  upsert:     (patientId, data)      => post(`/patients/${patientId}/tasks`, data),
  assign:     (patientId, taskId, note)    =>
    patch(`/patients/${patientId}/tasks/${taskId}/assign`, { note }),
  unassign:   (patientId, taskId)    =>
    patch(`/patients/${patientId}/tasks/${taskId}/assign`, { unassign: true }),
  complete:   (patientId, taskId)    =>
    patch(`/patients/${patientId}/tasks/${taskId}/complete`),
  updateNote: (patientId, taskId, note) =>
    patch(`/patients/${patientId}/tasks/${taskId}/note`, { note }),
};

// ── Users (admin only) ────────────────────────────────────────
export const users = {
  list:          ()               => get("/users"),
  update:        (id, data)       => patch(`/users/${id}`, data),
  resetPassword: (id, newPassword) =>
    post(`/users/${id}/reset-password`, { newPassword }),
};

// ── Invitations (admin only) ─────────────────────────────────
export const invitations = {
  create: (data) => post("/invitations", data),
  list:   ()     => get("/invitations"),
  revoke: (id)   => del(`/invitations/${id}`),
};
