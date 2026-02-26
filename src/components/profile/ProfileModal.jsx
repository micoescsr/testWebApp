// components/profile/ProfileModal.jsx
import { useState } from "react";
import { useProfile } from "../../hooks/useProfile";
import AccountsAuditModal from "../modals/AccountsAuditModal/AccountsAuditModal";
import { validatePassword } from "../../passwordValidation";
import PasswordChecklist from "../../pages/Auth/PasswordChecklist";
import "./ProfileModal.css";

const ProfileModal = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [confirmError, setConfirmError] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const { resetPassword, passwordLoading, passwordError } = useProfile();
  const [showCurrent, setShowCurrent] = useState(false);
const [showNew, setShowNew] = useState(false);
const [showConfirm, setShowConfirm] = useState(false);


  const handleSave = async () => {
    // Reset all errors
    setPasswordErrors([]);
    setConfirmError("");
    setCurrentPasswordError("");

    // Validate current password is not empty
    if (!currentPassword || currentPassword.trim() === "") {
      setCurrentPasswordError("Current password is required.");
      return;
    }

    // Validate new password matches confirmation
    if (newPassword !== confirmPassword) {
      setConfirmError("New password and confirmation do not match.");
      return;
    }

    // Validate new password strength
    const { valid, errors } = validatePassword(newPassword);
    if (!valid) {
      setPasswordErrors(errors);
      return;
    }

    // Attempt to reset password
    const result = await resetPassword({
      currentPassword,
      newPassword,
    });

    if (!result.success) {
      // Check if error is related to current password being incorrect
      // We check both result.error and passwordError from the hook
      const errorMessage = result.error || passwordError || "";
      if (
        errorMessage &&
        (errorMessage.toLowerCase().includes("invalid") ||
          errorMessage.toLowerCase().includes("incorrect") ||
          errorMessage.toLowerCase().includes("wrong") ||
          errorMessage.toLowerCase().includes("authentication") ||
          errorMessage.toLowerCase().includes("credentials"))
      ) {
        setCurrentPasswordError("Current password is incorrect.");
      }
      return;
    }

    // Success - show success message
    setShowSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const closeAll = () => {
    setShowSuccess(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordErrors([]);
    setConfirmError("");
    setCurrentPasswordError("");
    onClose();
  };

  const handleCancel = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordErrors([]);
    setConfirmError("");
    setCurrentPasswordError("");
    onClose();
  };

  const footer = !showSuccess ? (
    <>
      <button className="cancel-btn" onClick={handleCancel}>
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
      onClose={handleCancel}
      title={showSuccess ? "Password Updated" : "Reset Password"}
      footer={footer}
    >
      {!showSuccess ? (
        <div className="profile-modal-body">
          <div className="form-group">
            <label>Current Password</label>
            <div className="password-input-wrapper">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setCurrentPasswordError("");
                }}
                className={currentPasswordError ? "input-error" : ""}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowCurrent((prev) => !prev)}
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
            {currentPasswordError && (
              <p className="error-text">{currentPasswordError}</p>
            )}
          </div>


          <div className="form-group">
            <label>New Password</label>
            <div className="password-input-wrapper">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowNew((prev) => !prev)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            <PasswordChecklist password={newPassword} />
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <div className="password-input-wrapper">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (e.target.value === newPassword) {
                    setConfirmError("");
                  }
                }}
                className={confirmError ? "input-error" : ""}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={
                  showConfirm ? "Hide confirm password" : "Show confirm password"
                }
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
            {confirmError && <p className="error-text">{confirmError}</p>}
          </div>


          {passwordErrors.length > 0 && (
            <ul className="password-errors">
              {passwordErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          {passwordError && !currentPasswordError && (
            <p className="error-text">{passwordError}</p>
          )}
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
