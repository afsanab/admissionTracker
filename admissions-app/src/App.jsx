import { useState, useEffect } from "react";

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

// ── TASK LOGIC ──
// H&P: appears on admit (day 0), due immediately
// 30-Day: appears on day 21 (9 days notice), due day 30
// 60-Day: appears on day 51 (9 days notice), due day 60, then repeats every 60 days
// A "cycle" tracks which iteration of 60-day we're on

function getActiveTasks(admitTs) {
  if (!admitTs) return [];
  const days = daysSince(admitTs);
  const tasks = [];

  // H&P — always present from day 0
  tasks.push({
    id: "hp",
    key: "hp",
    label: "H & P",
    dueDate: addDays(admitTs, 0),
    appearsOn: admitTs,
    cycle: 0,
  });

  // 30-Day — appears on day 21, due day 30
  if (days >= 21) {
    tasks.push({
      id: "30day",
      key: "30day",
      label: "30-Day",
      dueDate: addDays(admitTs, 30),
      appearsOn: addDays(admitTs, 21),
      cycle: 0,
    });
  }

  // 60-Day cycles — appears 9 days before each due date
  // Cycle 1: due day 60, appears day 51
  // Cycle 2: due day 120, appears day 111
  // etc.
  let cycle = 1;
  while (true) {
    const dueDay = 60 * cycle;
    const appearsDay = dueDay - 9;
    if (appearsDay > days) break; // not yet visible
    tasks.push({
      id: `60day-c${cycle}`,
      key: "60day",
      label: cycle === 1 ? "60-Day" : `60-Day #${cycle}`,
      dueDate: addDays(admitTs, dueDay),
      appearsOn: addDays(admitTs, appearsDay),
      cycle,
    });
    cycle++;
    if (cycle > 50) break; // safety cap
  }

  return tasks;
}

// Merge active task definitions with saved task state
function mergeTaskState(activeTasks, savedState) {
  return activeTasks.map(def => ({
    ...def,
    status: savedState[def.id]?.status || "pending",
    assignedAt: savedState[def.id]?.assignedAt || null,
    completedAt: savedState[def.id]?.completedAt || null,
    completedBy: savedState[def.id]?.completedBy || null,
    note: savedState[def.id]?.note || "",
  }));
}

// ── DEMO DATA ──
const NOW = Date.now();
// Demo: Rivera admitted 25 days ago so 30-day task is visible
const DEMO_ADMIT_TS = NOW - 25 * 86400000;

const DEMO_ADMISSIONS = [
  { id: "a1", last: "Johnson", first: "Margaret", dob: "1942-03-18", room: "214-A", arrival: "2026-03-04T14:00", insurance: "Medicare", dx: "Hip fracture post-ORIF", notes: "Allergic to penicillin. Family contact: daughter (Sara) 555-2819.", status: "pending", admitTs: null },
  { id: "a2", last: "Rivera", first: "Carlos", dob: "1938-11-05", room: "108-B", arrival: "2026-03-04T10:30", insurance: "Medicaid", dx: "CVA with left hemiplegia", notes: "Speech therapy consult needed. Wife is healthcare proxy.", status: "inhouse", admitTs: DEMO_ADMIT_TS },
  { id: "a3", last: "Williams", first: "Dorothy", dob: "1951-07-22", room: "", arrival: "2026-03-04T16:30", insurance: "Medicare Advantage", dx: "COPD exacerbation", notes: "Home O2 dependent. Current PCP Dr. Patel. Full code.", status: "pending", admitTs: null },
];

function buildDemoTaskState() {
  // Rivera: H&P assigned, 30-day just appeared
  return {
    a2: {
      "hp": { status: "pending", assignedAt: DEMO_ADMIT_TS + 3600000, completedAt: null, completedBy: null, note: "Please complete H&P within 24hrs of admit." },
      "30day": { status: "pending", assignedAt: null, completedAt: null, completedBy: null, note: "" },
    }
  };
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
  const [role, setRole] = useState("physician");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleLogin() {
    if (!username.trim() || !password.trim()) { setError("Please enter a username and passcode."); return; }
    onLogin({ username: username.trim(), role });
  }

  const iStyle = { width: "100%", padding: "11px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 14, background: C.bg, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1a2540,#243258,#1e3a5f)", padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, color: C.blue, marginBottom: 4 }}>Care<em>Track</em></div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 32 }}>Nursing Home Admissions Portal</div>

        <Label>Select Role</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          {[{ id: "physician", icon: "🩺", label: "Physician" }, { id: "admin", icon: "🗂️", label: "Admissions Staff" }].map(r => (
            <button key={r.id} onClick={() => setRole(r.id)} style={{ padding: 12, border: `1.5px solid ${role === r.id ? C.blue : C.border}`, borderRadius: 8, background: role === r.id ? C.blueLight : C.bg, cursor: "pointer", color: role === r.id ? C.blue : C.muted, fontWeight: 600, fontSize: 13, fontFamily: "inherit" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{r.icon}</div>{r.label}
            </button>
          ))}
        </div>

        <Label>Staff ID / Username</Label>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. dr.smith" style={{ ...iStyle, marginBottom: 14 }} />
        <Label>Passcode</Label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={{ ...iStyle, marginBottom: 6 }} />

        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <button onClick={handleLogin} style={{ width: "100%", padding: 13, background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8, marginBottom: 16 }}>
          Sign In Securely
        </button>
        <div style={{ background: C.blueLight, borderRadius: 8, padding: "11px 13px", fontSize: 12, color: C.blue, display: "flex", gap: 8 }}>
          🔒 <span>This system contains Protected Health Information (PHI). Access is governed by HIPAA. Unauthorized use is prohibited.</span>
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
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>📋 Clinical Tasks</div>
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
                  <span style={{ fontSize: 17, color: dotColor, lineHeight: 1 }}>{dotIcon}</span>
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
                  <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>
                    {task.status === "completed" ? "✅" : isOverdue ? "🚨" : isDueSoon ? "⚠️" : task.assignedAt ? "⏳" : "🔘"}
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
                    📤 Assign to Physician
                  </button>
                )}
                {isAdmin && task.status !== "completed" && task.assignedAt && (
                  <button onClick={() => onAssign(admission.id, task.id, true)} style={{ padding: "13px 16px", background: C.redLight, color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    ✕ Unassign
                  </button>
                )}
                {isPhysician && task.assignedAt && task.status !== "completed" && (
                  <button onClick={() => onComplete(admission.id, task.id, userName)} style={{ flex: 1, padding: "13px 16px", background: C.green, color: "#fff", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    ✅ Mark Complete
                  </button>
                )}
                {isPhysician && !task.assignedAt && task.status !== "completed" && (
                  <div style={{ flex: 1, padding: "13px 16px", background: "#f4f1ec", color: C.light, borderRadius: 10, fontSize: 13, textAlign: "center", border: `1.5px solid ${C.border}` }}>
                    Awaiting assignment from admissions
                  </div>
                )}
                {task.status === "completed" && (
                  <div style={{ flex: 1, padding: "13px 16px", background: C.greenLight, color: C.green, borderRadius: 10, fontSize: 14, fontWeight: 700, textAlign: "center", border: `1.5px solid ${C.greenBorder}` }}>
                    ✅ Completed by {task.completedBy}
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
  const empty = { last: "", first: "", dob: "", room: "", arrival: "", insurance: "", dx: "", notes: "", status: "pending" };
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,15,30,0.55)", backdropFilter: "blur(3px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 500, boxShadow: "0 12px 32px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 20 }}>{admission ? "Edit Admission" : "New Admission"}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 14, color: C.muted }}>✕</button>
        </div>
        <div style={{ padding: "18px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>{field("Last Name *", "last", "text", "Last name")}</div>
            <div>{field("First Name *", "first", "text", "First name")}</div>
            <div>{field("Date of Birth *", "dob", "date")}</div>
            <div>{field("Room", "room", "text", "e.g. 214-A")}</div>
            <div>{field("Est. Arrival", "arrival", "datetime-local")}</div>
            <div style={{ marginBottom: 14 }}>
              <Label>Insurance</Label>
              <select value={form.insurance} onChange={e => set("insurance", e.target.value)} style={{ ...iStyle }}>
                <option value="">— Select —</option>
                {["Medicare", "Medicaid", "Medicare Advantage", "Commercial / Private", "VA Benefits", "Self-Pay", "Other"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          {field("Diagnosis / Condition", "dx", "text", "Primary reason for admission")}
          <div style={{ marginBottom: 14 }}>
            <Label>Clinical Notes</Label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Relevant history, precautions, special needs..." style={{ ...iStyle, minHeight: 72, resize: "vertical" }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>Status</Label>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={{ ...iStyle }}>
              <option value="pending">⏳ Pending</option>
              <option value="inhouse">🟢 In House</option>
            </select>
          </div>
          {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 24px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.surface, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.muted }}>Cancel</button>
          <button onClick={save} style={{ padding: "9px 24px", background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save Admission</button>
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
            iconEl = "✅"; dueLabel = "Complete";
          } else if (isOver) {
            bg = "#fff0ee"; border = C.red; textColor = C.red;
            iconEl = "🚨"; dueLabel = `${Math.abs(due)}d overdue`;
          } else if (isSoon) {
            bg = "#fffbf0"; border = C.yellow; textColor = "#7a4f08";
            iconEl = "⚠️"; dueLabel = due === 0 ? "Due today!" : `${due}d left`;
          } else if (t.assignedAt) {
            bg = C.yellowLight; border = C.yellowBorder; textColor = "#7a4f08";
            iconEl = "⏳"; dueLabel = `Due ${fmtDate(t.dueDate)}`;
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
              🚨 {overdueTasks.length} OVERDUE
            </span>
          )}
          <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{fmtArrival(admission.arrival)}</span>
        </div>
      </div>

      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{admission.last}, {admission.first}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, fontFamily: "monospace" }}>{fmtAge(admission.dob)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {[["Room", admission.room || "—"], ["Insurance", admission.insurance || "—"]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
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
      <div style={{ display: "flex", gap: 7, padding: "10px 16px 14px", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, background: "#f7f4f0" }}>
        {isPending && canEdit && (
          <button onClick={() => onPromote(admission.id)} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: `1.5px solid ${C.greenBorder}`, background: C.greenLight, color: "#14542e", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✅ Mark In House</button>
        )}
        {!isPending && (
          <button onClick={() => onOpenTasks(admission.id)} style={{ flex: 2, padding: "9px 8px", borderRadius: 8, border: `2px solid ${hasUrgent ? C.red : openTasks.length > 0 ? C.yellowBorder : C.greenBorder}`, background: hasUrgent ? "#fff0ee" : openTasks.length > 0 ? C.yellowLight : C.greenLight, color: hasUrgent ? C.red : openTasks.length > 0 ? "#7a4f08" : "#14542e", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {hasUrgent ? "🚨 Manage Tasks" : openTasks.length > 0 ? "⏳ Manage Tasks" : "✅ Manage Tasks"}
          </button>
        )}
        {canEdit && (
          <button onClick={() => onEdit(admission)} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>✏️ Edit</button>
        )}
        {!isPending && canEdit && (
          <button onClick={() => onDischarge(admission.id)} style={{ padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.red}`, background: C.redLight, color: C.red, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }} title="Discharge">🏠 DC</button>
        )}
        {isPending && canEdit && (
          <button onClick={() => onDelete(admission.id)} style={{ padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.muted, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>🗑</button>
        )}
      </div>
    </div>
  );
}

// ── MAIN APP ──
export default function App() {
  const [user, setUser] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [taskState, setTaskState] = useState({}); // { patientId: { taskId: { status, assignedAt, completedAt, completedBy, note } } }
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [tasksId, setTasksId] = useState(null);
  const [dischargeId, setDischargeId] = useState(null);

  function handleLogin({ username, role }) {
    setUser({ username, role });
    setAdmissions(DEMO_ADMISSIONS.map(a => ({ ...a })));
    setTaskState(buildDemoTaskState());
  }

  if (!user) return <AuthScreen onLogin={handleLogin} />;

  const canEdit = user.role === "admin";
  const filtered = admissions.filter(a => filter === "all" || a.status === filter);
  const pendingCount = admissions.filter(a => a.status === "pending").length;
  const inhouseCount = admissions.filter(a => a.status === "inhouse").length;
  const displayName = user.role === "physician"
    ? `Dr. ${capitalize(user.username.split(".").pop())}`
    : capitalize(user.username.replace(".", " "));
  const initials = user.username.split(".").map(s => s[0]?.toUpperCase() || "").join("").slice(0, 2) || "U";

  // Build merged tasks for each patient
  function getPatientTasks(admission) {
    if (!admission.admitTs || admission.status !== "inhouse") return null;
    const defs = getActiveTasks(admission.admitTs);
    const saved = taskState[admission.id] || {};
    return mergeTaskState(defs, saved);
  }

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

  function promoteToInhouse(id) {
    const admitTs = Date.now();
    setAdmissions(prev => prev.map(a => a.id === id ? { ...a, status: "inhouse", admitTs } : a));
  }

  function dischargePatient(id) {
    setAdmissions(prev => prev.filter(a => a.id !== id));
    setTaskState(prev => { const n = { ...prev }; delete n[id]; return n; });
    setDischargeId(null);
    if (tasksId === id) setTasksId(null);
  }

  function saveAdmission(form) {
    if (modal?.type === "edit") {
      const prev = modal.admission;
      setAdmissions(p => p.map(a => a.id === prev.id ? { ...a, ...form } : a));
      if (prev.status !== "inhouse" && form.status === "inhouse") {
        setAdmissions(p => p.map(a => a.id === prev.id ? { ...a, admitTs: Date.now() } : a));
      }
    } else {
      const id = "a" + Date.now();
      const admitTs = form.status === "inhouse" ? Date.now() : null;
      setAdmissions(p => [{ id, ...form, admitTs }, ...p]);
    }
    setModal(null);
  }

  function assignTask(patientId, taskId, unassign = false) {
    setTaskState(prev => ({
      ...prev,
      [patientId]: {
        ...(prev[patientId] || {}),
        [taskId]: { ...(prev[patientId]?.[taskId] || {}), assignedAt: unassign ? null : Date.now() }
      }
    }));
  }

  function completeTask(patientId, taskId, by) {
    setTaskState(prev => ({
      ...prev,
      [patientId]: {
        ...(prev[patientId] || {}),
        [taskId]: { ...(prev[patientId]?.[taskId] || {}), status: "completed", completedAt: Date.now(), completedBy: by }
      }
    }));
  }

  function updateNote(patientId, taskId, note) {
    setTaskState(prev => ({
      ...prev,
      [patientId]: {
        ...(prev[patientId] || {}),
        [taskId]: { ...(prev[patientId]?.[taskId] || {}), note }
      }
    }));
  }

  const tasksAdmission = admissions.find(a => a.id === tasksId);
  const dischargeAdmission = admissions.find(a => a.id === dischargeId);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: 14 }}>
      {/* Topbar */}
      <div style={{ background: C.navy, color: "#fff", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20 }}>Care<em style={{ color: "#7aabf0" }}>Track</em></div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{initials}</div>
            {displayName} <span style={{ fontSize: 11, opacity: 0.6 }}>({user.role === "physician" ? "Physician" : "Admissions"})</span>
          </div>
          <button onClick={() => setUser(null)} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", padding: "5px 12px", borderRadius: 6, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
          {[
            ["⏳", pendingCount, C.yellow, "Pending", "#fff3e0"],
            ["🏥", inhouseCount, C.green, "In House", C.greenLight],
            ["📋", openTaskCount, C.blue, "Open Tasks", C.blueLight],
            ["🚨", overdueCount, C.red, "Overdue Tasks", C.redLight],
          ].map(([icon, num, color, label, bg]) => (
            <div key={label} style={{ background: C.surface, borderRadius: 12, padding: "16px 18px", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, boxShadow: num > 0 && label === "Overdue Tasks" ? `0 0 0 2px rgba(192,57,43,0.2)` : "none" }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{num}</div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginTop: 2 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {[["all", "All"], ["pending", "⏳ Pending"], ["inhouse", "🟢 In House"]].map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${filter === f ? C.blue : C.border}`, background: filter === f ? C.blueLight : C.surface, color: filter === f ? C.blue : C.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
          {canEdit && (
            <button onClick={() => setModal({ type: "add" })} style={{ padding: "9px 18px", background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ New Admission</button>
          )}
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
          {filtered.length === 0
            ? <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 24px", color: C.muted }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>🏥</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: C.text }}>No admissions found</div>
              <div style={{ fontSize: 13 }}>{canEdit ? "Add a new admission using the button above." : "Admissions staff will add entries here."}</div>
            </div>
            : filtered.map(a => (
              <AdmissionCard key={a.id} admission={a} activeTasks={getPatientTasks(a)} canEdit={canEdit}
                onEdit={a => setModal({ type: "edit", admission: a })}
                onDelete={id => { if (window.confirm("Remove this admission?")) setAdmissions(p => p.filter(x => x.id !== id)); }}
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
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
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
    </div>
  );
}

