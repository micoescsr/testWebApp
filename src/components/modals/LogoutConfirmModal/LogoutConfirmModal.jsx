// components/modals/LogoutConfirmModal/LogoutConfirmModal.jsx
//
// Confirmation prompt shown before logging out.
// When threat detection is active (DETECTING / SCANNING), the modal
// warns the user that the detection process will continue running on
// the backend even after they log out.

import BaseModal from "../../common/Modal/BaseModal";
import "./LogoutConfirmModal.css";

const LogoutConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  isDetectionRunning = false,
  activeNetwork = null,
}) => {
  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      header={<h3 className="lcm-title">Confirm Logout</h3>}
      footer={
        <>
          <button className="lcm-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="lcm-confirm-btn" onClick={onConfirm}>
            Logout
          </button>
        </>
      }
    >
      <div className="lcm-body">
        {isDetectionRunning ? (
          <>
            <div className="lcm-warning">
              <span className="lcm-warning-icon">⚠️</span>
              <div>
                <strong>Threat detection is currently running
                  {activeNetwork ? ` on "${activeNetwork}"` : ""}.</strong>
                <p className="lcm-warning-detail">
                  Logging out will not stop the ongoing detection process — it
                  will continue running in the background. You can log back in
                  later to view results or stop detection.
                </p>
              </div>
            </div>
            <p className="lcm-question">Are you sure you want to logout?</p>
          </>
        ) : (
          <p className="lcm-question">Are you sure you want to logout?</p>
        )}
      </div>
    </BaseModal>
  );
};

export default LogoutConfirmModal;
