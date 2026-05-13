import { useEffect, useRef, useState } from "react";

/**
 * Idle-session watcher.
 *
 * - After `idleMs` of no user input, opens a warning state.
 * - After an additional `graceMs` with no response, fires `onTimeout` so
 *   the caller can sign the user out.
 *
 * Activity is tracked across mouse, keyboard, touch, and document-visibility
 * events so a tab that has been hidden is treated as idle.
 */
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

export default function useIdleTimeout({
  idleMs = 25 * 60 * 1000, // 25 min idle → warning
  graceMs = 5 * 60 * 1000, // 5 min grace → logout
  enabled = true,
  onTimeout,
}) {
  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(graceMs);
  const lastActivityRef = useRef(Date.now());
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    function bumpActivity() {
      lastActivityRef.current = Date.now();
      if (warning) {
        // Activity during the grace window cancels the timeout.
        setWarning(false);
        setRemainingMs(graceMs);
      }
    }

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, bumpActivity, { passive: true }));

    intervalRef.current = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (!warning && idleFor >= idleMs) {
        setWarning(true);
        setRemainingMs(graceMs);
      } else if (warning) {
        const left = idleMs + graceMs - idleFor;
        if (left <= 0) {
          setWarning(false);
          if (typeof onTimeout === "function") onTimeout();
        } else {
          setRemainingMs(left);
        }
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bumpActivity));
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [enabled, idleMs, graceMs, warning, onTimeout]);

  function stayActive() {
    lastActivityRef.current = Date.now();
    setWarning(false);
    setRemainingMs(graceMs);
  }

  return { warning, remainingMs, stayActive };
}
