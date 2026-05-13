import { useId } from "react";
import ModalShell from "./ModalShell.jsx";
import { C } from "../theme/colors.js";

/**
 * Lightweight modal confirm dialog. Replaces window.confirm so we can style
 * it consistently and avoid the system dialog interrupting input focus.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const titleId = useId();

  function handleBackdrop() {
    if (!busy) onCancel();
  }

  return (
    <ModalShell
      labelledById={titleId}
      overlayClassName="ct-modal-overlay ct-modal-overlay--dark"
      overlayStyle={{ zIndex: 300 }}
      className="ct-modal ct-modal--narrow"
      onBackdropClick={handleBackdrop}
      style={{ maxWidth: 380, padding: "28px 28px 24px", textAlign: "center" }}
    >
      <div id={titleId} style={{ fontFamily: "Georgia,serif", fontSize: 20, marginBottom: 10 }}>
        {title}
      </div>
      {message && (
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 22, lineHeight: 1.55 }}>
          {message}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          style={{
            flex: 1,
            padding: 11,
            border: `1.5px solid ${C.border}`,
            borderRadius: 9,
            background: C.surface,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            color: C.muted,
          }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: 11,
            background: busy ? C.muted : destructive ? C.red : C.blue,
            color: "#fff",
            border: "none",
            borderRadius: 9,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
