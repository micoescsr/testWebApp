// components/dashboard/DashboardDetailDrawer.jsx
//
// Reusable right-side drawer (full-width on mobile) for dashboard metric
// drill-downs. Presentation only — callers pass title/subtitle/children and
// own the data. Mirrors the existing ScanDetailsDrawer pattern/tokens.
import { useEffect } from "react";
import { X } from "@phosphor-icons/react";
import "./DashboardDetailDrawer.css";

const DashboardDetailDrawer = ({ open, title, subtitle, onClose, children }) => {
  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
      />
      <aside
        className={`dash-detail-drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
      >
        <div className="drawer-header">
          <div className="drawer-header-left">
            <h2>{title}</h2>
            {subtitle && <p className="drawer-meta">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Close detail panel"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="dash-detail-body">{open ? children : null}</div>
      </aside>
    </>
  );
};

export default DashboardDetailDrawer;
