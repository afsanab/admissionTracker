import { useState, useEffect } from "react";
import {
  getStoredToken,
  setStoredToken,
  loadPatientsAndTasks,
  patientRowToAdmission,
  admissionToApiBody,
  apiTasksToSavedMap,
  syncTaskRowsForPatient,
  auth,
  invitations,
  patients as patientsApi,
  tasks as tasksApi,
} from "./api.js";
import { getActiveTasks, mergeTaskState } from "./taskLogic.js";

// ── HELPERS ──
function fmtAge(dob) {
  if (!dob) return "";
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000));
  return `DOB: ${dob}  ·  Age ${age}`;
}
function fmtArrival(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function addDays(ts, days) { return ts + days * 86400000; }
function daysSince(ts) { return Math.floor((Date.now() - ts) / 86400000); }

function formatPhysicianDisplay(raw) {
  if (!raw) return "";
  if (raw.includes(" ") && !raw.includes(".")) return raw;
  return raw
    .split(/[.\s]+/)
    .filter(Boolean)
    .map((seg) => (seg.toLowerCase() === "dr" ? "Dr." : seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase()))
    .join(" ");
}

// ── COLORS ──
const C = {
  bg: "#f0ede8", surface: "#faf8f5", border: "#d8d3cb",
  text: "#1a1814", muted: "#7a7570", light: "#a8a39d",
  blue: "#2d5fa0", blueLight: "#eef3fb",
  green: "#2a8a50", greenLight: "#edf7f1", greenBorder: "#7dcb9a",
  yellow: "#e8a020", yellowLight: "#fef9ec", yellowBorder: "#f5d27a",
  red: "#c0392b", redLight: "#fdf0ee",
  navy: "#1a2540",
};

// ── AUTH ──
function AuthScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError("Please enter a username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { token, user: u } = await auth.login(username.trim(), password);
      setStoredToken(token);
      await onLogin({ username: u.username, role: u.role, fullName: u.fullName });
    } catch (e) {
      setError(e.message || "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  const iStyle = { width: "100%", padding: "11px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 14, background: C.bg, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1a2540,#243258,#1e3a5f)", padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, color: C.blue, marginBottom: 4 }}>Care<em>Track</em></div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>Nursing Home Admissions Portal</div>
        <div style={{ color: C.light, fontSize: 12, marginBottom: 24, lineHeight: 1.5 }}>
          Accounts are created through an invitation from your organization. Use your assigned username and password to sign in.
        </div>

        <Label>Username</Label>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. dr.smith" style={{ ...iStyle, marginBottom: 14 }} autoComplete="username" />
        <Label>Password</Label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={{ ...iStyle, marginBottom: 6 }} autoComplete="current-password" />

        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <button disabled={loading} onClick={handleLogin} style={{ width: "100%", padding: 13, background: loading ? C.muted : C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", marginTop: 8, marginBottom: 16 }}>
          {loading ? "Signing in…" : "Sign In Securely"}
        </button>
        <div style={{ background: C.blueLight, borderRadius: 8, padding: "11px 13px", fontSize: 12, color: C.blue, display: "flex", gap: 8 }}>
          🔒 <span>This system contains Protected Health Information (PHI). Access is governed by HIPAA. Unauthorized use is prohibited.</span>
        </div>
      </div>
    </div>
  );
}

function AcceptInviteScreen({ token, onRegistered }) {
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (inviteToken) {
        setBooting(false);
        return;
      }

      // ✅ NEW: prevent duplicate session loads
      if (user) {
        setBooting(false);
        return;
      }

      const token = getStoredToken();
      if (!token) {
        setBooting(false);
        return;
      }

      try {
        const { user: u } = await auth.me();
        if (cancelled) return;

        await loadSession({
          username: u.username,
          role: u.role,
          fullName: u.fullName,
        });
      } catch {
        setStoredToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [inviteToken, user]);

  async function submit() {
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { token: jwt, user: u } = await auth.register({ token, password, fullName: fullName.trim() || undefined });
      setStoredToken(jwt);
      await onRegistered({ username: u.username, role: u.role, fullName: u.fullName });
    } catch (e) {
      setError(e.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  const iStyle = { width: "100%", padding: "11px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 14, background: C.bg, outline: "none", boxSizing: "border-box" };

  if (loading && !info && !error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1a2540,#243258,#1e3a5f)" }}>
        <div style={{ color: "#fff", fontSize: 14 }}>Checking invitation…</div>
      </div>
    );
  }

  if (!info && error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1a2540,#243258,#1e3a5f)", padding: 24 }}>
        <div style={{ background: C.surface, borderRadius: 20, padding: "32px 28px", maxWidth: 400, textAlign: "center" }}>
          <div style={{ color: C.red, fontWeight: 700, marginBottom: 8 }}>Invitation unavailable</div>
          <div style={{ color: C.muted, fontSize: 14 }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1a2540,#243258,#1e3a5f)", padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 24, color: C.blue, marginBottom: 4 }}>Create your account</div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
          Username <strong style={{ color: C.text }}>{info?.username}</strong>
          {" · "}
          {info?.role === "admin" ? "Admissions staff" : "Physician"}
        </div>

        <Label>Full name (optional)</Label>
        <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Dr. Jane Smith" style={{ ...iStyle, marginBottom: 14 }} />
        <Label>Password (min. 12 characters)</Label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} style={{ ...iStyle, marginBottom: 6 }} autoComplete="new-password" />

        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <button disabled={loading} onClick={submit} style={{ width: "100%", padding: 13, background: loading ? C.muted : C.green, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", marginTop: 8 }}>
          {loading ? "Creating account…" : "Activate account"}
        </button>
      </div>
    </div>
  );
}

function InviteStaffModal({ onClose, onCreated }) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("physician");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function submit() {
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await invitations.create({
        username: username.trim(),
        role,
        email: email.trim() || undefined,
      });
      setResult(data);
      onCreated?.();
    } catch (e) {
      setError(e.message || "Could not create invitation.");
    } finally {
      setLoading(false);
    }
  }

  const iStyle = { width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13, background: C.bg, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,15,30,0.55)", backdropFilter: "blur(3px)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 12px 32px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 20 }}>Invite staff</div>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 16, color: C.muted }}>✕</button>
        </div>
        <div style={{ padding: "16px 20px 20px" }}>
          {result ? (
            <>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>{result.message}</p>
              {result.emailSent && (
                <p style={{ fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 10 }}>A message with the invite link was sent to the email address you entered.</p>
              )}
              {result.emailNote && (
                <p style={{ fontSize: 12, color: C.yellow, marginBottom: 10 }}>{result.emailNote}</p>
              )}
              <Label>Invite link (copy if needed)</Label>
              <input readOnly value={result.inviteUrl} style={{ ...iStyle, fontSize: 12, marginBottom: 12 }} onFocus={e => e.target.select()} />
              <p style={{ fontSize: 11, color: C.light }}>Share this link only over secure channels. It expires on {new Date(result.invitation.expires_at).toLocaleString()}.</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>The invited person will choose their password when they open the link. If the server is configured with Resend, filling in email below sends the link automatically.</p>
              <div style={{ marginBottom: 12 }}>
                <Label>Username (login ID)</Label>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. dr.lee" style={iStyle} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <Label>Role</Label>
                <select value={role} onChange={e => setRole(e.target.value)} style={iStyle}>
                  <option value="physician">Physician</option>
                  <option value="admin">Admissions staff</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Label>Email (optional)</Label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="colleague@clinic.com — invite link sent here when email is enabled" style={iStyle} />
              </div>
              {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
              <button type="button" disabled={loading} onClick={submit} style={{ width: "100%", padding: 12, background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer" }}>
                {loading ? "Creating…" : "Create invitation"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.muted, marginBottom: 6 }}>{children}</div>;
}

// ── TASK PANEL ──
function TaskPanel({ admission, activeTasks, onClose, onAssign, onComplete, onUpdateNote, role, userName }) {
  const [activeId, setActiveId] = useState(activeTasks[0]?.id || null);
  const task = activeTasks.find(t => t.id === activeId);
  const isAdmin = role === "admin";
  const isPhysician = role === "physician";
  const daysUntilDue = task ? Math.ceil((task.dueDate - Date.now()) / 86400000) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,15,30,0.65)", backdropFilter: "blur(5px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: 20, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background: C.navy, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Clinical Tasks</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>{admission.last}, {admission.first}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 16, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Task list tabs */}
        <div style={{ background: "#f0ede8", borderBottom: `2px solid ${C.border}`, overflowX: "auto", flexShrink: 0 }}>
          <div style={{ display: "flex", minWidth: "max-content" }}>
            {activeTasks.map(t => {
              const isActive = t.id === activeId;
              const due = Math.ceil((t.dueDate - Date.now()) / 86400000);
              const over = due < 0;
              const soon = due >= 0 && due <= 3;
              const dotColor = t.status === "completed" ? C.green : over ? C.red : soon ? C.yellow : t.assignedAt ? C.yellow : C.light;
              const dotIcon = t.status === "completed" ? "✓" : over ? "!" : t.assignedAt ? "●" : "○";
              return (
                <button key={t.id} onClick={() => setActiveId(t.id)} style={{ padding: "12px 18px", border: "none", borderBottom: `3px solid ${isActive ? C.blue : "transparent"}`, background: isActive ? C.surface : "transparent", color: isActive ? C.blue : C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginBottom: -2, minWidth: 80, flexShrink: 0 }}>
                  <span>{t.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: over ? C.red : soon ? C.yellow : C.light }}>
                    {t.status === "completed" ? "Done" : over ? `${Math.abs(due)}d overdue` : due === 0 ? "Due today" : `${due}d left`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Task body */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {task ? (
            <div style={{ padding: 24 }}>
              {/* Big status block */}
              <div style={{
                borderRadius: 14,
                padding: "18px 20px",
                marginBottom: 20,
                background: task.status === "completed" ? C.greenLight : isOverdue ? "#fff0ee" : isDueSoon ? "#fffbf0" : C.yellowLight,
                border: `2px solid ${task.status === "completed" ? C.greenBorder : isOverdue ? C.red : isDueSoon ? C.yellow : C.yellowBorder}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18,
                    background: task.status === "completed" ? C.green : isOverdue ? C.red : isDueSoon ? C.yellow : C.yellowBorder,
                    color: "#fff"
                  }}>
                    {task.status === "completed" ? "✓" : isOverdue ? "!" : isDueSoon ? "!" : "●"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: task.status === "completed" ? C.green : isOverdue ? C.red : isDueSoon ? "#a06000" : "#7a4f08", marginBottom: 4 }}>
                      {task.status === "completed" ? "Completed" :
                        isOverdue ? `OVERDUE — ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? "s" : ""} past due` :
                          daysUntilDue === 0 ? "Due Today!" :
                            isDueSoon ? `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}` :
                              task.assignedAt ? "Assigned — Awaiting Physician" : "Not Yet Assigned"}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                      Due: <strong>{fmtDate(task.dueDate)}</strong>
                      {task.assignedAt && !task.completedAt && <span> · Assigned {fmtDate(task.assignedAt)}</span>}
                      {task.completedAt && <span> · Completed {fmtDate(task.completedAt)} by {task.completedBy}</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Note */}
              <div style={{ marginBottom: 20 }}>
                <Label>{isAdmin ? "Instructions for Physician" : `${task.label} Notes`}</Label>
                <textarea value={task.note} onChange={e => onUpdateNote(admission.id, task.id, e.target.value)}
                  disabled={task.status === "completed" && isPhysician}
                  placeholder={isAdmin ? `Add instructions for the ${task.label}...` : task.note ? "" : "No instructions yet."}
                  style={{ width: "100%", padding: "11px 13px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontFamily: "inherit", fontSize: 13, background: task.status === "completed" ? "#f4f1ec" : C.bg, outline: "none", minHeight: 90, resize: "vertical", boxSizing: "border-box", color: C.text, lineHeight: 1.6 }} />
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                {isAdmin && task.status !== "completed" && !task.assignedAt && (
                  <button onClick={() => onAssign(admission.id, task.id, false)} style={{ flex: 1, padding: "13px 16px", background: C.yellow, color: "#fff", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "0.01em" }}>
                    Assign to Physician
                  </button>
                )}
                {isAdmin && task.status !== "completed" && task.assignedAt && (
                  <button onClick={() => onAssign(admission.id, task.id, true)} style={{ padding: "13px 16px", background: C.redLight, color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    ✕ Unassign
                  </button>
                )}
                {isPhysician && task.assignedAt && task.status !== "completed" && (
                  <button onClick={() => onComplete(admission.id, task.id, userName)} style={{ flex: 1, padding: "13px 16px", background: C.green, color: "#fff", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Mark Complete
                  </button>
                )}
                {isPhysician && !task.assignedAt && task.status !== "completed" && (
                  <div style={{ flex: 1, padding: "13px 16px", background: "#f4f1ec", color: C.light, borderRadius: 10, fontSize: 13, textAlign: "center", border: `1.5px solid ${C.border}` }}>
                    Awaiting assignment from admissions
                  </div>
                )}
                {task.status === "completed" && (
                  <div style={{ flex: 1, padding: "13px 16px", background: C.greenLight, color: C.green, borderRadius: 10, fontSize: 14, fontWeight: 700, textAlign: "center", border: `1.5px solid ${C.greenBorder}` }}>
                    Completed by {task.completedBy}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: C.light, fontSize: 13 }}>No tasks yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ADD/EDIT MODAL ──
function AdmissionModal({ admission, onSave, onClose }) {
  const empty = { last: "", first: "", dob: "", room: "", arrival: "", dx: "", notes: "", status: "pending", physician: "", location: "" };
  const [form, setForm] = useState(admission ? { ...admission } : empty);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const iStyle = { width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13, background: C.bg, outline: "none", boxSizing: "border-box" };

  function field(label, key, type = "text", placeholder = "") {
    return (
      <div style={{ marginBottom: 14 }}>
        <Label>{label}</Label>
        <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} style={iStyle} />
      </div>
    );
  }

  function save() {
    if (!form.last.trim() || !form.first.trim() || !form.dob) { setErr("Last name, first name, and DOB are required."); return; }
    onSave(form);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,15,30,0.55)", backdropFilter: "blur(3px)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px 12px", overflowY: "auto" }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 500, boxShadow: "0 12px 32px rgba(0,0,0,0.2)", marginTop: "auto", marginBottom: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 20 }}>{admission ? "Edit Admission" : "New Admission"}</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 16, color: C.muted }}>✕</button>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {/* Single-column layout for mobile friendliness */}
          {field("Last Name *", "last", "text", "Last name")}
          {field("First Name *", "first", "text", "First name")}
          {field("Date of Birth *", "dob", "date")}
          {field("Room", "room", "text", "e.g. 214-A")}
          {field("Est. Arrival", "arrival", "datetime-local")}
          {field("Diagnosis / Condition", "dx", "text", "Primary reason for admission")}
          {field("Attending Physician", "physician", "text", "e.g. Dr. Smith")}
          {field("Facility / Location", "location", "text", "e.g. Sunrise Care Center")}
          <div style={{ marginBottom: 14 }}>
            <Label>Clinical Notes</Label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Relevant history, precautions, special needs..." style={{ ...iStyle, minHeight: 72, resize: "vertical" }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>Status</Label>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={{ ...iStyle }}>
              <option value="pending">Pending</option>
              <option value="inhouse">In House</option>
            </select>
          </div>
          {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.surface, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", color: C.muted }}>Cancel</button>
          <button onClick={save} style={{ flex: 2, padding: "11px", background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Save Admission</button>
        </div>
      </div>
    </div>
  );
}

// ── TASK PILLS on card ──
function TaskPills({ activeTasks }) {
  if (!activeTasks || activeTasks.length === 0) return null;

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 8 }}>Clinical Tasks</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {activeTasks.map(t => {
          const due = Math.ceil((t.dueDate - Date.now()) / 86400000);
          const isOver = due < 0;
          const isSoon = due >= 0 && due <= 3;
          const isDone = t.status === "completed";

          let bg, border, textColor, iconEl, dueLabel;

          if (isDone) {
            bg = C.greenLight; border = C.greenBorder; textColor = C.green;
            iconEl = "✓"; dueLabel = "Complete";
          } else if (isOver) {
            bg = "#fff0ee"; border = C.red; textColor = C.red;
            iconEl = "!"; dueLabel = `${Math.abs(due)}d overdue`;
          } else if (isSoon) {
            bg = "#fffbf0"; border = C.yellow; textColor = "#7a4f08";
            iconEl = "!"; dueLabel = due === 0 ? "Due today" : `${due}d left`;
          } else if (t.assignedAt) {
            bg = C.yellowLight; border = C.yellowBorder; textColor = "#7a4f08";
            iconEl = "●"; dueLabel = `Due ${fmtDate(t.dueDate)}`;
          } else {
            bg = "#f4f1ec"; border = C.border; textColor = C.muted;
            iconEl = "○"; dueLabel = `Due ${fmtDate(t.dueDate)}`;
          }

          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", borderRadius: 8, background: bg, border: `1.5px solid ${border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{iconEl}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: textColor }}>{t.label}</span>
                {!isDone && !t.assignedAt && (
                  <span style={{ fontSize: 10, background: C.border, color: C.muted, borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>Unassigned</span>
                )}
                {!isDone && t.assignedAt && (
                  <span style={{ fontSize: 10, background: isOver ? C.red : isSoon ? C.yellow : C.yellowBorder, color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>Assigned</span>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: textColor, whiteSpace: "nowrap" }}>{dueLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ADMISSION CARD ──
function AdmissionCard({ admission, activeTasks, canEdit, onEdit, onDelete, onPromote, onDischarge, onOpenTasks }) {
  const isPending = admission.status === "pending";
  const openTasks = activeTasks ? activeTasks.filter(t => t.assignedAt && t.status !== "completed") : [];
  const overdueTasks = activeTasks ? activeTasks.filter(t => t.status !== "completed" && Math.ceil((t.dueDate - Date.now()) / 86400000) < 0) : [];
  const hasUrgent = overdueTasks.length > 0 || activeTasks?.some(t => { const d = Math.ceil((t.dueDate - Date.now()) / 86400000); return t.status !== "completed" && d >= 0 && d <= 3; });

  const borderColor = isPending ? C.yellowBorder : hasUrgent ? C.red : C.greenBorder;
  const headerBg = isPending ? C.yellowLight : hasUrgent ? "#fff0ee" : C.greenLight;
  const badgeBg = isPending ? C.yellow : C.green;

  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `2px solid ${borderColor}`, boxShadow: hasUrgent ? `0 0 0 3px rgba(192,57,43,0.15), 0 2px 8px rgba(0,0,0,0.08)` : "0 1px 4px rgba(0,0,0,0.07)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", background: headerBg, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: badgeBg, color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.7)", display: "inline-block" }} />
          {isPending ? "Pending" : "In House"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isPending && overdueTasks.length > 0 && (
            <span style={{ background: C.red, color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10, letterSpacing: "0.05em" }}>
              {overdueTasks.length} OVERDUE
            </span>
          )}
          <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{fmtArrival(admission.arrival)}</span>
        </div>
      </div>

      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{admission.last}, {admission.first}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, fontFamily: "monospace" }}>{fmtAge(admission.dob)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {[["Room", admission.room || "—"]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
          {admission.location && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>Facility</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{admission.location}</div>
            </div>
          )}
          {admission.physician && (
            <div style={{ gridColumn: "1/-1" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>Physician</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{formatPhysicianDisplay(admission.physician)}</div>
            </div>
          )}
          <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>Diagnosis</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{admission.dx || "—"}</div>
          </div>
        </div>
        {admission.notes && (
          <div style={{ background: C.bg, borderRadius: 7, padding: "8px 11px", fontSize: 12, color: C.muted, lineHeight: 1.5, border: `1px solid ${C.border}`, fontStyle: "italic" }}>{admission.notes}</div>
        )}

        {/* Task pills — prominent inline display */}
        {!isPending && activeTasks && <TaskPills activeTasks={activeTasks} />}
      </div>

      {/* Footer buttons */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px 12px", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, background: "#f7f4f0" }}>
        {isPending && canEdit && (
          <button onClick={() => onPromote(admission.id)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: `1.5px solid ${C.greenBorder}`, background: C.greenLight, color: "#14542e", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", minWidth: 110 }}>Mark In House</button>
        )}
        {!isPending && (
          <button onClick={() => onOpenTasks(admission.id)} style={{ flex: 2, padding: "8px 6px", borderRadius: 8, border: `2px solid ${hasUrgent ? C.red : openTasks.length > 0 ? C.yellowBorder : C.greenBorder}`, background: hasUrgent ? "#fff0ee" : openTasks.length > 0 ? C.yellowLight : C.greenLight, color: hasUrgent ? C.red : openTasks.length > 0 ? "#7a4f08" : "#14542e", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Manage Tasks
          </button>
        )}
        {canEdit && (
          <button onClick={() => onEdit(admission)} style={{ padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.muted, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Edit</button>
        )}
        {!isPending && canEdit && (
          <button onClick={() => onDischarge(admission.id)} style={{ padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.red}`, background: C.redLight, color: C.red, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Discharge</button>
        )}
        {isPending && canEdit && (
          <button onClick={() => onDelete(admission.id)} style={{ padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.muted, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>Remove</button>
        )}
      </div>
    </div>
  );
}

// ── MAIN APP ──
export default function App() {
  const [user, setUser] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [taskState, setTaskState] = useState({});
  const [filter, setFilter] = useState("all");
  const [physicianFilter, setPhysicianFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [tasksId, setTasksId] = useState(null);
  const [dischargeId, setDischargeId] = useState(null);
  const [booting, setBooting] = useState(true);
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  const [inviteModal, setInviteModal] = useState(false);

  const loadSession = async (u) => {
    const { admissions: adm, taskState: ts } = await loadPatientsAndTasks();
    setUser(u);
    setAdmissions(adm);
    setTaskState(ts);
  };
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (inviteToken) {
        setBooting(false);
        return;
      }

      // ✅ CRITICAL: prevent re-loading if we already have a user
      if (user) {
        setBooting(false);
        return;
      }

      const token = getStoredToken();
      if (!token) {
        setBooting(false);
        return;
      }

      try {
        const { user: u } = await auth.me();
        if (cancelled) return;

        await loadSession({
          username: u.username,
          role: u.role,
          fullName: u.fullName,
        });
      } catch {
        setStoredToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [inviteToken, user]);

  async function handleLogin(u) {
    await loadSession(u);
  }

  async function handleInviteRegistered(u) {
    window.history.replaceState({}, "", window.location.pathname);
    setInviteToken(null);
    setUser(u); // set user immediately for UI
  }

  async function handleSignOut() {
    try {
      await auth.logout();
    } catch {
      /* ignore */
    }
    setStoredToken(null);
    setUser(null);
    setAdmissions([]);
    setTaskState({});
  }

  if (booting) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'DM Sans',system-ui,sans-serif" }}>
        <div style={{ color: C.muted, fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (inviteToken && !user) {
    return <AcceptInviteScreen token={inviteToken} onRegistered={handleInviteRegistered} />;
  }

  if (!user) return <AuthScreen onLogin={handleLogin} />;

  const canEdit = user.role === "admin";
  const canAdd = true; // both roles can add patients
  const physicianList = [...new Set(admissions.map(a => a.physician).filter(Boolean))].sort();
  const locationList = [...new Set(admissions.map(a => a.location).filter(Boolean))].sort();

  // Build merged tasks for each patient
  function getPatientTasks(admission) {
    if (!admission.admitTs || admission.status !== "inhouse") return null;
    const defs = getActiveTasks(admission.admitTs);
    const saved = taskState[admission.id] || {};
    return mergeTaskState(defs, saved);
  }

  const filtered = admissions.filter(a => {
    if (filter !== "all" && a.status !== filter) return false;
    if (physicianFilter !== "all" && a.physician !== physicianFilter) return false;
    if (locationFilter !== "all" && a.location !== locationFilter) return false;
    if (taskFilter !== "all") {
      const t = getPatientTasks(a);
      if (!t) return false;
      if (taskFilter === "open") return t.some(x => x.assignedAt && x.status !== "completed");
      if (taskFilter === "overdue") return t.some(x => x.status !== "completed" && Math.ceil((x.dueDate - Date.now()) / 86400000) < 0);
    }
    return true;
  });
  const pendingCount = admissions.filter(a => a.status === "pending").length;
  const inhouseCount = admissions.filter(a => a.status === "inhouse").length;
  const displayName = user.fullName?.trim()
    ? user.fullName
    : user.role === "physician"
      ? `Dr. ${capitalize(user.username.split(".").pop())}`
      : capitalize(user.username.replace(".", " "));
  const initials = (user.fullName?.trim() || user.username)
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2) || "U";

  const openTaskCount = admissions.reduce((acc, a) => {
    const t = getPatientTasks(a);
    if (!t) return acc;
    return acc + t.filter(x => x.assignedAt && x.status !== "completed").length;
  }, 0);

  const overdueCount = admissions.reduce((acc, a) => {
    const t = getPatientTasks(a);
    if (!t) return acc;
    return acc + t.filter(x => x.status !== "completed" && Math.ceil((x.dueDate - Date.now()) / 86400000) < 0).length;
  }, 0);

  async function ensureTaskApiId(patientId, taskId) {
    const admission = admissions.find((a) => a.id === patientId);
    const saved = taskState[patientId]?.[taskId];
    if (saved?.apiTaskId) return saved.apiTaskId;
    if (!admission?.admitTs) return null;
    await syncTaskRowsForPatient(patientId, admission.admitTs);
    const { tasks: trows } = await tasksApi.list(patientId);
    const m = apiTasksToSavedMap(trows);
    setTaskState((prev) => ({ ...prev, [patientId]: { ...prev[patientId], ...m } }));
    return m[taskId]?.apiTaskId;
  }

  async function promoteToInhouse(id) {
    try {
      await patientsApi.admit(id);
      const { patient } = await patientsApi.get(id);
      const adm = patientRowToAdmission(patient);
      const admitTs = new Date(patient.admit_ts).getTime();
      setAdmissions((prev) => prev.map((a) => (a.id === id ? adm : a)));
      await syncTaskRowsForPatient(id, admitTs);
      const { tasks: trows } = await tasksApi.list(id);
      setTaskState((prev) => ({ ...prev, [id]: apiTasksToSavedMap(trows) }));
    } catch (e) {
      alert(e.message);
    }
  }

  async function dischargePatient(id) {
    try {
      await patientsApi.discharge(id);
      setAdmissions((prev) => prev.filter((a) => a.id !== id));
      setTaskState((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      setDischargeId(null);
      if (tasksId === id) setTasksId(null);
    } catch (e) {
      alert(e.message);
    }
  }

  async function saveAdmission(form) {
    try {
      const body = admissionToApiBody(form);
      if (modal?.type === "edit") {
        const prev = modal.admission;
        const { patient } = await patientsApi.update(prev.id, body);
        setAdmissions((p) => p.map((a) => (a.id === prev.id ? patientRowToAdmission(patient) : a)));
        if (patient.status === "inhouse" && patient.admit_ts) {
          const ts = new Date(patient.admit_ts).getTime();
          await syncTaskRowsForPatient(patient.id, ts);
          const { tasks: trows } = await tasksApi.list(patient.id);
          setTaskState((s) => ({ ...s, [patient.id]: apiTasksToSavedMap(trows) }));
        }
      } else {
        const { patient } = await patientsApi.create(body);
        setAdmissions((p) => [patientRowToAdmission(patient), ...p]);
        if (patient.status === "inhouse" && patient.admit_ts) {
          const ts = new Date(patient.admit_ts).getTime();
          await syncTaskRowsForPatient(patient.id, ts);
          const { tasks: trows } = await tasksApi.list(patient.id);
          setTaskState((s) => ({ ...s, [patient.id]: apiTasksToSavedMap(trows) }));
        }
      }
      setModal(null);
    } catch (e) {
      alert(e.message);
    }
  }

  async function assignTask(patientId, taskId, unassign = false) {
    try {
      const tid = await ensureTaskApiId(patientId, taskId);
      if (!tid) return;
      await tasksApi.assign(patientId, tid, unassign ? { unassign: true } : {});
      const { tasks: trows } = await tasksApi.list(patientId);
      setTaskState((prev) => ({ ...prev, [patientId]: apiTasksToSavedMap(trows) }));
    } catch (e) {
      alert(e.message);
    }
  }

  async function completeTask(patientId, taskId, _by) {
    try {
      const tid = await ensureTaskApiId(patientId, taskId);
      if (!tid) return;
      await tasksApi.complete(patientId, tid);
      const { tasks: trows } = await tasksApi.list(patientId);
      setTaskState((prev) => ({ ...prev, [patientId]: apiTasksToSavedMap(trows) }));
    } catch (e) {
      alert(e.message);
    }
  }

  async function updateNote(patientId, taskId, note) {
    setTaskState((prev) => ({
      ...prev,
      [patientId]: {
        ...(prev[patientId] || {}),
        [taskId]: { ...(prev[patientId]?.[taskId] || {}), note },
      },
    }));
    try {
      const tid = await ensureTaskApiId(patientId, taskId);
      if (!tid) return;
      await tasksApi.updateNote(patientId, tid, note);
    } catch (e) {
      alert(e.message);
    }
  }

  async function deletePending(id) {
    if (!window.confirm("Remove this admission?")) return;
    try {
      await patientsApi.delete(id);
      setAdmissions((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      alert(e.message);
    }
  }

  const tasksAdmission = admissions.find(a => a.id === tasksId);
  const dischargeAdmission = admissions.find(a => a.id === dischargeId);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: 14 }}>
      {/* Topbar */}
      <div style={{ background: C.navy, color: "#fff", padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20 }}>Care<em style={{ color: "#7aabf0" }}>Track</em></div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {canEdit && (
            <button type="button" onClick={() => setInviteModal(true)} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", padding: "6px 14px", borderRadius: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Invite staff
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{initials}</div>
            {displayName} <span style={{ fontSize: 11, opacity: 0.6 }}>({user.role === "physician" ? "Physician" : "Admissions"})</span>
          </div>
          <button type="button" onClick={handleSignOut} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", padding: "5px 12px", borderRadius: 6, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            ["P", pendingCount, C.yellow, "Pending", "#fff3e0", "#7a4f08", () => { setFilter(filter === "pending" ? "all" : "pending"); setTaskFilter("all"); }],
            ["H", inhouseCount, C.green, "In House", C.greenLight, "#14542e", () => { setFilter(filter === "inhouse" ? "all" : "inhouse"); setTaskFilter("all"); }],
            ["T", openTaskCount, C.blue, "Open Tasks", C.blueLight, C.blue, () => { setTaskFilter(taskFilter === "open" ? "all" : "open"); setFilter("all"); }],
            ["!", overdueCount, C.red, "Overdue Tasks", C.redLight, C.red, () => { setTaskFilter(taskFilter === "overdue" ? "all" : "overdue"); setFilter("all"); }],
          ].map(([icon, num, color, label, bg, iconColor, onClick]) => {
            const isActive =
              (label === "Pending" && filter === "pending") ||
              (label === "In House" && filter === "inhouse") ||
              (label === "Open Tasks" && taskFilter === "open") ||
              (label === "Overdue Tasks" && taskFilter === "overdue");
            return (
              <button key={label} onClick={onClick} style={{ background: C.surface, borderRadius: 12, padding: "16px 18px", border: `2px solid ${isActive ? color : C.border}`, display: "flex", alignItems: "center", gap: 12, boxShadow: isActive ? `0 0 0 3px ${color}30` : num > 0 && label === "Overdue Tasks" ? `0 0 0 2px rgba(192,57,43,0.2)` : "none", cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit", transition: "border-color 0.15s" }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: isActive ? color : bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: isActive ? "#fff" : iconColor, flexShrink: 0 }}>{icon}</div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{num}</div>
                  <div style={{ fontSize: 11, color: isActive ? color : C.muted, fontWeight: isActive ? 700 : 600, marginTop: 2 }}>{label}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[
              ["all", "All", filter === "all" ? C.blue : C.border, filter === "all" ? C.blueLight : C.surface, filter === "all" ? C.blue : C.muted],
              ["pending", "Pending", filter === "pending" ? C.yellow : C.border, filter === "pending" ? C.yellowLight : C.surface, filter === "pending" ? "#7a4f08" : C.muted],
              ["inhouse", "In House", filter === "inhouse" ? C.green : C.border, filter === "inhouse" ? C.greenLight : C.surface, filter === "inhouse" ? "#14542e" : C.muted],
            ].map(([f, label, borderCol, bgCol, textCol]) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 18px", borderRadius: 20, border: `1.5px solid ${borderCol}`, background: bgCol, color: textCol, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 40 }}>{label}</button>
            ))}
            {canEdit && physicianList.length > 0 && (
              <select value={physicianFilter} onChange={e => setPhysicianFilter(e.target.value)}
                style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${physicianFilter !== "all" ? C.blue : C.border}`, background: physicianFilter !== "all" ? C.blueLight : C.surface, color: physicianFilter !== "all" ? C.blue : C.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", outline: "none", minHeight: 40, appearance: "none", paddingRight: 32, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a7570' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
                <option value="all">All Physicians</option>
                {physicianList.map(p => <option key={p} value={p}>{formatPhysicianDisplay(p)}</option>)}
              </select>
            )}
            {canEdit && locationList.length > 0 && (
              <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${locationFilter !== "all" ? C.blue : C.border}`, background: locationFilter !== "all" ? C.blueLight : C.surface, color: locationFilter !== "all" ? C.blue : C.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", outline: "none", minHeight: 40, appearance: "none", paddingRight: 32, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a7570' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
                <option value="all">All Locations</option>
                {locationList.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
          </div>
          {/* Physician view: location dropdown */}
          {!canEdit && locationList.length > 0 && (
            <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
              style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${locationFilter !== "all" ? C.blue : C.border}`, background: locationFilter !== "all" ? C.blueLight : C.surface, color: locationFilter !== "all" ? C.blue : C.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", outline: "none", minHeight: 40, appearance: "none", paddingRight: 32, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a7570' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", alignSelf: "flex-start" }}>
              <option value="all">All Facilities</option>
              {locationList.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {canAdd && (
            <button onClick={() => setModal({ type: "add" })} style={{ width: "100%", padding: "12px", background: C.blue, color: "#fff", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>+ New Admission</button>
          )}
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 16 }}>
          {filtered.length === 0
            ? <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 24px", color: C.muted }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3, color: C.muted }}>+</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: C.text }}>No admissions found</div>
              <div style={{ fontSize: 13 }}>Add a new admission using the button above.</div>
            </div>
            : filtered.map(a => (
              <AdmissionCard key={a.id} admission={a} activeTasks={getPatientTasks(a)} canEdit={canEdit}
                onEdit={a => setModal({ type: "edit", admission: a })}
                onDelete={deletePending}
                onPromote={promoteToInhouse}
                onDischarge={id => setDischargeId(id)}
                onOpenTasks={id => setTasksId(id)}
              />
            ))
          }
        </div>
      </div>

      {/* Task panel */}
      {tasksId && tasksAdmission && (() => {
        const at = getPatientTasks(tasksAdmission);
        return at && (
          <TaskPanel admission={tasksAdmission} activeTasks={at} role={user.role} userName={displayName}
            onClose={() => setTasksId(null)} onAssign={assignTask} onComplete={completeTask} onUpdateNote={updateNote} />
        );
      })()}

      {/* Add/edit modal */}
      {modal && <AdmissionModal admission={modal.type === "edit" ? modal.admission : null} onSave={saveAdmission} onClose={() => setModal(null)} />}

      {/* Discharge confirm */}
      {dischargeId && dischargeAdmission && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,15,30,0.6)", backdropFilter: "blur(4px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: "32px 28px", maxWidth: 380, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12, color: C.red, fontWeight: 900, lineHeight: 1 }}>DC</div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 20, marginBottom: 8 }}>Discharge Patient?</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{dischargeAdmission.last}, {dischargeAdmission.first}</div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              This will remove the patient from the active census.<br />All pending tasks will be cancelled.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDischargeId(null)} style={{ flex: 1, padding: 11, border: `1.5px solid ${C.border}`, borderRadius: 9, background: C.surface, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.muted }}>Cancel</button>
              <button onClick={() => dischargePatient(dischargeId)} style={{ flex: 1, padding: 11, background: C.red, color: "#fff", border: "none", borderRadius: 9, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Confirm Discharge</button>
            </div>
          </div>
        </div>
      )}

      {inviteModal && (
        <InviteStaffModal
          onClose={() => setInviteModal(false)}
          onCreated={() => { }}
        />
      )}
    </div>
  );
}

