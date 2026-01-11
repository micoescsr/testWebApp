import { useState } from "react";
import "./ProfileModal.css";

const ProfileModal = ({ onClose }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = () => {
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    // await supabase.auth.updateUser({ password: newPassword })

    setShowSuccess(true);
  };

  const closeAll = () => {
    setShowSuccess(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {!showSuccess ? (
          <>

            <div className="modal-header">
              <h2>Reset Password</h2>
              <button className="modal-close" onClick={onClose}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) =>
                    setCurrentPassword(e.target.value)
                  }
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) =>
                    setNewPassword(e.target.value)
                  }
                />
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="secondary-btn" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-btn" onClick={handleSave}>
                Save Changes
              </button>
            </div>
          </>
        ) : (

          <>
            <div className="modal-header">
              <h2>Password Updated</h2>
            </div>

            <div className="modal-body success-body">
              <p>Your password has been successfully reset.</p>
            </div>

            <div className="modal-footer">
              <button className="primary-btn" onClick={closeAll}>
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;
