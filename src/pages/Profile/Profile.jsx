// pages/Profile/Profile.jsx
import { useState } from "react";
import "./Profile.css";
import ProfileModal from "../../components/profile/ProfileModal";
import { useProfile } from "../../hooks/useProfile";

const Profile = () => {
  const [showResetModal, setShowResetModal] = useState(false);

  const {
    profile,
    profileLoading,
    profileError,
  } = useProfile();

  if (profileLoading) {
    return <p>Loading profile...</p>;
  }

  if (profileError) {
    return <p className="error-text">{profileError}</p>;
  }

  if (!profile) {
    return null;
  }

  const fullName = `${profile.firstName} ${profile.lastName}`;
  const initials = `${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar">{initials}</div>
        <div className="profile-header-text">
          <h1 className="page-title">Welcome, {fullName}!</h1>
          <p className="profile-subtitle">Manage your account details</p>
        </div>
      </div>

      <div className="profile-card">
        <div className="profile-form">
          <div className="form-group">
            <label>Email</label>
            <input type="text" value={profile.email} readOnly />
          </div>

          <div className="form-group">
            <label>First Name</label>
            <input type="text" value={profile.firstName} readOnly />
          </div>

          <div className="form-group">
            <label>Last Name</label>
            <input type="text" value={profile.lastName} readOnly />
          </div>

          <div className="form-group">
            <label>Username</label>
            <input type="text" value={profile.username} readOnly />
          </div>

          <div className="form-group">
            <div className="password-label-row">
              <label>Password</label>
              <span
                className="reset-link"
                onClick={() => setShowResetModal(true)}
              >
                Reset Password
              </span>
            </div>
            <input type="password" value="••••••••" readOnly />
          </div>
        </div>
      </div>

      {showResetModal && (
        <ProfileModal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
        />
      )}

    </div>
  );
};

export default Profile;
