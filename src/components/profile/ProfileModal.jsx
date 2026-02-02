// components/profile/ProfileModal.jsx
import { useState } from "react";
import { useProfile } from "../../hooks/useProfile";
import AccountsAuditModal from "../modals/AccountsAuditModal/AccountsAuditModal";
import "./ProfileModal.css";

const ProfileModal = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const { resetPassword, passwordLoading, passwordError } = useProfile();

  const handleSave = async () => {
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    const result = await resetPassword({
      currentPassword,
      newPassword,
    });

    if (!result.success) {
      alert(result.error?.message || "Failed to reset password");
      return;
    }

    setShowSuccess(true);
  };

  const closeAll = () => {
    setShowSuccess(false);
    onClose();
  };

  const footer = !showSuccess ? (
    <>
      <button className="cancel-btn" onClick={onClose}>
        Cancel
      </button>
      <button
        className="confirm-btn"
        onClick={handleSave}
        disabled={passwordLoading}
      >
        {passwordLoading ? "Saving..." : "Save Changes"}
      </button>
    </>
  ) : (
    <button className="confirm-btn" onClick={closeAll}>
      OK
    </button>
  );

  return (
    <AccountsAuditModal
      isOpen={isOpen}
      onClose={onClose}
      title={showSuccess ? "Password Updated" : "Reset Password"}
      footer={footer}
    >
      {!showSuccess ? (
        <div className="profile-modal-body">
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {passwordError && <p className="error-text">{passwordError}</p>}
        </div>
      ) : (
        <div className="profile-modal-body success-body">
          <p>Your password has been successfully reset.</p>
        </div>
      )}
    </AccountsAuditModal>
  );
};

export default ProfileModal;
