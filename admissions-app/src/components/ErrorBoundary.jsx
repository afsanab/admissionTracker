import { Component } from "react";

/**
 * Top-level error boundary. Prevents the SPA from white-screening on a
 * single component error and gives the user a path to recovery (reload).
 *
 * Production deployments should wire `onError` to a real reporter (Sentry,
 * Application Insights) so we hear about these in alerts.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === "function") {
      try {
        this.props.onError(error, info);
      } catch {
        // never let the reporter itself crash the UI
      }
    } else {
      console.error("Unhandled UI error:", error, info);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          background: "#fdf9f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "'DM Sans',system-ui,sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 440,
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e6dfd5",
            padding: "28px 28px 24px",
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontFamily: "Georgia,serif", fontSize: 22, marginBottom: 10 }}>
            Something went wrong
          </div>
          <div style={{ color: "#7a7570", fontSize: 13, lineHeight: 1.55, marginBottom: 18 }}>
            The page hit an unexpected error and could not continue. Try
            reloading; if it keeps happening, contact your administrator.
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "11px 22px",
              background: "#4d80c5",
              color: "#fff",
              border: "none",
              borderRadius: 9,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload application
          </button>
        </div>
      </div>
    );
  }
}
