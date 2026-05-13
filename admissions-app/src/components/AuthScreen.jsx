import { useId, useState } from "react";
import { auth, setStoredToken } from "../api.js";
import Label from "./Label.jsx";
import { C } from "../theme/colors.js";

export default function AuthScreen({ onLogin }) {
  const idBase = useId();
  const usernameId = `${idBase}-username`;
  const passwordId = `${idBase}-password`;

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
  };

  return (
    <div className="ct-auth-bg">
      <div className="ct-auth-card">
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, color: C.blue, marginBottom: 4 }}>
          Care<em>Track</em>
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>Nursing Home Admissions Portal</div>
        <div style={{ color: C.light, fontSize: 12, marginBottom: 24, lineHeight: 1.5 }}>
          Accounts are created through an invitation from your organization. Use your assigned username and password to sign in.
        </div>

        <Label htmlFor={usernameId}>Username</Label>
        <input
          id={usernameId}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. dr.smith"
          style={{ ...iStyle, marginBottom: 14 }}
          autoComplete="username"
        />
        <Label htmlFor={passwordId}>Password</Label>
        <input
          id={passwordId}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          placeholder="••••••••"
          style={{ ...iStyle, marginBottom: 6 }}
          autoComplete="current-password"
        />

        {error && (
          <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }} role="alert">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={handleLogin}
          style={{
            width: "100%",
            padding: 13,
            background: loading ? C.muted : C.blue,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
            marginTop: 8,
            marginBottom: 16,
          }}
        >
          {loading ? "Signing in…" : "Sign In Securely"}
        </button>
        <div
          style={{
            background: C.blueLight,
            borderRadius: 8,
            padding: "11px 13px",
            fontSize: 12,
            color: C.blue,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <span aria-hidden="true">🔒</span>
          <span>This system contains Protected Health Information (PHI). Access is governed by HIPAA. Unauthorized use is prohibited.</span>
        </div>
      </div>
    </div>
  );
}
