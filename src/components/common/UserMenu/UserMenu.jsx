// src/components/common/UserMenu/UserMenu.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from "../../../hooks/useProfile";
import { useThreatDetectionContext } from "../../../context/ThreatDetectionContext";
import { logout as apiLogout } from "../../../api/authApi";
import { setAccessToken } from "../../../api/axios";
import { clearSessionState } from "../../../hooks/useSessionState";
import LogoutConfirmModal from "../../modals/LogoutConfirmModal/LogoutConfirmModal";
import './UserMenu.css';

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { detectionStatus, activeNetwork } = useThreatDetectionContext();
  const menuRef = useRef(null);

  const isDetectionOngoing =
    detectionStatus === "DETECTING" || detectionStatus === "SCANNING";

  const toggleDropdown = () => setIsOpen(!isOpen);

  const handleProfile = () => {
    navigate('/profile');
    setIsOpen(false);
  };

  const performLogout = async () => {
    try {
      await apiLogout();
    } catch (_) {
      /* best-effort */
    }
    setAccessToken(null);
    clearSessionState();
    navigate('/login');
  };

  const handleLogout = () => {
    setIsOpen(false);
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    performLogout();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!profile) return null;

  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  const displayName = fullName || 'User';
  const userRole = profile.role || 'User';

  return (
    <>
      <div className="user-menu" ref={menuRef}>
        <button 
          className="user-button" 
          onClick={toggleDropdown}
          aria-expanded={isOpen}
        >
          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-role">{userRole}</span>
          </div>
          <span className={`dropdown-icon ${isOpen ? 'open' : ''}`}>▼</span>
        </button>
        
        {isOpen && (
          <ul className="dropdown-menu">
            <li onClick={handleProfile}>
              <span className="menu-icon">👤</span>
              Profile
            </li>
            <li onClick={handleLogout} className="logout-item">
              <span className="menu-icon">🚪</span>
              Logout
            </li>
          </ul>
        )}
      </div>

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

export default UserMenu;
