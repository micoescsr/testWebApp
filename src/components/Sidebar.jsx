import { NavLink, useNavigate } from "react-router-dom";
import "./Sidebar.css";

const Sidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    // TODO later: clear auth token here
    navigate("/login"); // go back to login page
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

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Why-PII?</h2>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
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
  );
};

export default Sidebar;
