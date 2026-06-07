// hooks/useFocusTrap.js
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps focus inside a modal while it's open: focuses the dialog on open,
 * cycles Tab/Shift+Tab between its focusable elements, restores focus to the
 * trigger on close, and calls onEscape when Escape is pressed.
 *
 * Returns a ref to attach to the modal container (must have role="dialog").
 */
export const useFocusTrap = (active, onEscape) => {
  const containerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    previouslyFocusedRef.current = document.activeElement;

    const container = containerRef.current;
    const focusFirst = () => {
      const focusable = container?.querySelectorAll(FOCUSABLE_SELECTOR);
      (focusable?.[0] || container)?.focus();
    };
    focusFirst();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
      if (e.key !== "Tab" || !container) return;

      const focusable = Array.from(
        container.querySelectorAll(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [active, onEscape]);

  return containerRef;
};
