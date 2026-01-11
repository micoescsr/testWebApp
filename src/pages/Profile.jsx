import { useState } from "react";
import "./Profile.css";
import ProfileModal from "../components/ProfileModal";

const Profile = () => {
  const [showResetModal, setShowResetModal] = useState(false);

  const profileData = {
    welcomeName: "Pedro Gil",
    email: "pgil@gmail.com",
    firstName: "Pedro",
    lastName: "Gil",
    username: "Admin001",
    password: "password123",
  };

  return (
    <div className="profile-page">
      <h1 className="page-title">Welcome, {profileData.welcomeName}!</h1>

      <div className="profile-form">
        <div className="form-group">
          <label>Email</label>
          <input type="text" value={profileData.email} readOnly />
        </div>

        <div className="form-group">
          <label>First Name</label>
          <input type="text" value={profileData.firstName} readOnly />
        </div>

        <div className="form-group">
          <label>Last Name</label>
          <input type="text" value={profileData.lastName} readOnly />
        </div>

        <div className="form-group">
          <label>Username</label>
          <input type="text" value={profileData.username} readOnly />
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
          <input type="password" value={profileData.password} readOnly />
        </div>
      </div>

      {showResetModal && (
        <ProfileModal onClose={() => setShowResetModal(false)} />
      )}
    </div>
  );
};

export default Profile;
