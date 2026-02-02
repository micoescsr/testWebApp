// components/layouts/Sidebar.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import "./Sidebar.css";

const Sidebar = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    // TODO later: clear auth token here
    navigate("/login");
  };

  const menuItems = [
    { path: "/dashboard", icon: "☷", label: "Dashboard" },
    {
      path: "/security-assessment",
      icon: "⚡",
      label: "Security Assessment Management",
    },
    { path: "/device-management", icon: "📱", label: "Device Management" },
    { path: "/accounts-audit", icon: "📁", label: "Accounts & Audit" },
    { path: "/history", icon: "📊", label: "History" },
    { path: "/profile", icon: "👤", label: "Profile" },
  ];

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
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMenu}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
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
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeMenu}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <button className="logout-btn mobile-logout" onClick={handleLogout}>
          <span className="nav-icon">🚪</span>
          <span className="nav-label">Logout</span>
        </button>
      </div>

      {/* Optional dark overlay when menu open */}
      {isOpen && <div className="mobile-overlay" onClick={closeMenu} />}
    </>
  );
};

export default Sidebar;
