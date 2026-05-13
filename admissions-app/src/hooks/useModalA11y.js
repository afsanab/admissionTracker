import { useEffect } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus first focusable in panel, trap Tab, Escape → onClose, restore focus on unmount.
 */
export function useModalA11y(enabled, panelRef, onClose) {
  useEffect(() => {
    if (!enabled) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previousActive = document.activeElement;

    const listFocusables = () => Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || panel === el);

    const moveFocus = () => {
      const nodes = listFocusables();
      if (nodes.length) nodes[0].focus();
      else panel.setAttribute("tabindex", "-1"), panel.focus();
    };

    const id = requestAnimationFrame(moveFocus);

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const nodes = listFocusables();
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (panel.getAttribute("tabindex") === "-1") panel.removeAttribute("tabindex");
      if (previousActive && typeof previousActive.focus === "function") {
        try {
          previousActive.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [enabled, panelRef, onClose]);
}
