// components/layouts/Sidebar.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import "./Sidebar.css";
import { useProfile } from "../hooks/useProfile";
import { useNetworkContext } from "../context/NetworkContext";
import {
  useThreatDetectionContext,
  timeAgo,
} from "../context/ThreatDetectionContext";
import { logout as apiLogout } from "../api/authApi";
import { setAccessToken } from "../api/axios";
import { clearSessionState } from "../hooks/useSessionState";
import LogoutConfirmModal from "../components/modals/LogoutConfirmModal/LogoutConfirmModal";

const Sidebar = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { profile } = useProfile();
  const { networkId, scanId } = useNetworkContext();
  const role = profile?.role;

  // Global threat detection state (read-only — no polling here)
  const {
    detectionStatus,
    failureReason,
    displayThreats,
    lastUpdated,
    activeNetwork,
  } = useThreatDetectionContext();

  // Compute SAM nav-item indicator + tooltip
  const threatCount = Array.isArray(displayThreats) ? displayThreats.length : 0;
  let samTooltip = "";
  let samIndicator = null;

  if (detectionStatus === "DETECTING") {
    samTooltip = `Monitoring${activeNetwork ? `: ${activeNetwork}` : ""} \u2022 Updated ${timeAgo(lastUpdated)}`;
    samIndicator = (
      <span className="nav-indicator">
        <span className="nav-dot running" />
        {threatCount > 0 && <span className="nav-badge">{threatCount}</span>}
      </span>
    );
  } else if (detectionStatus === "SCANNING") {
    samTooltip = "Starting threat detection\u2026";
    samIndicator = (
      <span className="nav-indicator">
        <span className="nav-dot pulsing" />
      </span>
    );
  } else if (detectionStatus === "FAILED") {
    samTooltip = `Detection failed${failureReason ? ` \u2022 ${failureReason}` : ""}`;
    samIndicator = (
      <span className="nav-indicator">
        <span className="nav-dot failed" />
      </span>
    );
  }

  const handleLogout = async () => {
    try {
      await apiLogout(); // POST /auth/logout — clears HttpOnly refresh cookie
    } catch (_) {
      /* best-effort: cookie may already be gone */
    }
    setAccessToken(null); // clear in-memory Bearer token
    clearSessionState(); // wipe all wf:* sessionStorage keys
    navigate("/login");
  };

  // Detection is considered "ongoing" when the backend is actively
  // scanning or monitoring — the user should be warned before logout.
  const isDetectionOngoing =
    detectionStatus === "DETECTING" || detectionStatus === "SCANNING";

  const requestLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    handleLogout();
  };

  const menuItems = [
    { path: "/dashboard", icon: "☷", label: "Dashboard" },
    {
      path: "/security-assessment",
      icon: "⚡",
      label: "Security Assessment Management",
    },
    {
      path: networkId
        ? `/device-management?network_id=${networkId}${scanId ? `&scan_id=${scanId}` : ""}`
        : "/device-management",
      icon: "📱",
      label: "Device Management",
    },
    {
      path: "/accounts-audit",
      icon: "📁",
      label: "Accounts & Audit",
      superadminOnly: true,
    },
    { path: "/history", icon: "📊", label: "Scan History" },
    { path: "/profile", icon: "👤", label: "Profile" },
  ];

  /* // While profile is loading, render nothing or a skeleton
  if (profileLoading) {
    return null; // or a placeholder sidebar
  } */

  // Filter based on role: only superadmin sees Accounts & Audit
  const visibleMenuItems = menuItems.filter(
    (item) => !item.superadminOnly || role === "superadmin",
  );

  const toggleMenu = () => setIsOpen((prev) => !prev);
  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* Desktop / tablet sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Why-PII?</h2>
        </div>

        <nav className="sidebar-nav">
          {visibleMenuItems.map((item) => {
            const isSAM = item.path === "/security-assessment";
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeMenu}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
                title={isSAM ? samTooltip || undefined : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {isSAM && samIndicator}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={requestLogout}>
            <span className="nav-icon">🚪</span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile top bar + slide-out menu */}
      <div className="mobile-topbar">
        <div className="mobile-left">
          <button
            className="mobile-menu-btn"
            type="button"
            onClick={toggleMenu}
          >
            {isOpen ? "✕" : "☰"}
          </button>
          <div className="mobile-logo">Why-PII?</div>
        </div>
      </div>

      <div className={`mobile-drawer ${isOpen ? "open" : ""}`}>
        <nav className="mobile-nav">
          {visibleMenuItems.map((item) => {
            const isSAM = item.path === "/security-assessment";
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeMenu}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
                title={isSAM ? samTooltip || undefined : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {isSAM && samIndicator}
              </NavLink>
            );
          })}
        </nav>

        <button className="logout-btn mobile-logout" onClick={requestLogout}>
          <span className="nav-icon">🚪</span>
          <span className="nav-label">Logout</span>
        </button>
      </div>

      {isOpen && <div className="mobile-overlay" onClick={closeMenu} />}

      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
        isDetectionRunning={isDetectionOngoing}
        activeNetwork={activeNetwork}
      />
    </>
  );
};

export default Sidebar;
