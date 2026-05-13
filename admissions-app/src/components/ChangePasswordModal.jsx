import { useId, useState } from "react";
import { auth } from "../api.js";
import Label from "./Label.jsx";
import ModalShell from "./ModalShell.jsx";
import { C } from "../theme/colors.js";

/**
 * Forced password change modal. Shown when the API marks the user with
 * `mustChangePassword: true` (i.e. right after an admin reset). Not
 * dismissible — there's no close button and the backdrop is inert.
 */
export default function ChangePasswordModal({ forced, onDone, onClose }) {
  const titleId = useId();
  const currentId = useId();
  const next1Id = useId();
  const next2Id = useId();

  const [current, setCurrent] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!current) {
      setError("Enter your current password.");
      return;
    }
    if (next1.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (next1 !== next2) {
      setError("New passwords do not match.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await auth.changePassword(current, next1);
      onDone?.();
    } catch (e) {
      setError(e.message || "Could not change password.");
    } finally {
      setSaving(false);
    }
  }

  const iStyle = {
    width: "100%",
    padding: "11px 14px",
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 14,
    background: C.bg,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 12,
  };

  return (
    <ModalShell
      labelledById={titleId}
      overlayClassName="ct-modal-overlay ct-modal-overlay--dark"
      overlayStyle={{ zIndex: 600 }}
      className="ct-modal"
      onBackdropClick={forced ? () => {} : onClose}
      style={{ maxWidth: 420 }}
    >
      <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div id={titleId} style={{ fontFamily: "Georgia,serif", fontSize: 20 }}>
          {forced ? "Set a new password" : "Change password"}
        </div>
      </div>
      <div className="ct-modal__body" style={{ padding: "16px 20px 20px" }}>
        {forced && (
          <div style={{ background: C.yellowLight, border: `1px solid ${C.yellowBorder}`, color: "#7a4f08", padding: "9px 12px", borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
            Your administrator reset your password. Please choose a new one to continue.
          </div>
        )}
        <Label htmlFor={currentId}>Current password</Label>
        <input
          id={currentId}
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          style={iStyle}
          autoComplete="current-password"
        />
        <Label htmlFor={next1Id}>New password (min. 12 characters)</Label>
        <input
          id={next1Id}
          type="password"
          value={next1}
          onChange={(e) => setNext1(e.target.value)}
          style={iStyle}
          autoComplete="new-password"
        />
        <Label htmlFor={next2Id}>Confirm new password</Label>
        <input
          id={next2Id}
          type="password"
          value={next2}
          onChange={(e) => setNext2(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={iStyle}
          autoComplete="new-password"
        />
        {error && (
          <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }} role="alert">
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {!forced && (
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              style={{ flex: 1, padding: 11, border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.surface, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", color: C.muted }}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            style={{ flex: 2, padding: 11, background: saving ? C.muted : C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
