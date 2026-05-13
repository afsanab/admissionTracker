import { useId } from "react";
import ModalShell from "./ModalShell.jsx";
import { C } from "../theme/colors.js";

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export default function IdleTimeoutDialog({ remainingMs, onStayActive, onSignOut }) {
  const titleId = useId();
  return (
    <ModalShell
      labelledById={titleId}
      overlayClassName="ct-modal-overlay ct-modal-overlay--dark"
      overlayStyle={{ zIndex: 500 }}
      className="ct-modal ct-modal--narrow"
      onBackdropClick={onStayActive}
      style={{ maxWidth: 380, padding: "28px 28px 24px", textAlign: "center" }}
    >
      <div id={titleId} style={{ fontFamily: "Georgia,serif", fontSize: 20, marginBottom: 8 }}>
        Still there?
      </div>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 6, lineHeight: 1.55 }}>
        For HIPAA compliance you will be signed out after a period of inactivity.
      </div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 18,
          fontWeight: 800,
          color: C.red,
          marginBottom: 20,
          letterSpacing: "0.05em",
        }}
        aria-live="polite"
      >
        Signing out in {formatRemaining(remainingMs)}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={onSignOut}
          style={{
            flex: 1,
            padding: 11,
            border: `1.5px solid ${C.border}`,
            borderRadius: 9,
            background: C.surface,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            color: C.muted,
          }}
        >
          Sign out now
        </button>
        <button
          type="button"
          onClick={onStayActive}
          style={{
            flex: 1,
            padding: 11,
            background: C.blue,
            color: "#fff",
            border: "none",
            borderRadius: 9,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Stay signed in
        </button>
      </div>
    </ModalShell>
  );
}
