// components/modals/ScanConfirmModal/ScanConfirmModal.jsx
//
// Confirmation modal shown after a successful scan save.
// Replaces the browser alert() with a styled modal.

import BaseModal from "../../common/Modal/BaseModal";
import { CheckCircle } from "@phosphor-icons/react";
import "./ScanConfirmModal.css";

const ScanConfirmModal = ({ isOpen, onClose, networkId, ssid }) => {
  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      header={<h3 className="scm-title">Scan Saved</h3>}
      footer={
        <button className="scm-ok-btn" onClick={onClose}>
          OK
        </button>
      }
    >
      <div className="scm-body">
        <div className="scm-success-icon"><CheckCircle size={28} /></div>
        <p className="scm-message">
          The scan has been saved successfully. Threat detection is now
          starting.
        </p>
        <div className="scm-detail-box">
          {ssid && (
            <div className="scm-detail-row">
              <span className="scm-detail-label">Network</span>
              <span className="scm-detail-value">{ssid}</span>
            </div>
          )}
          <div className="scm-detail-row">
            <span className="scm-detail-label">Network ID</span>
            <span className="scm-detail-value">{networkId}</span>
          </div>
        </div>
        <p className="scm-note">
          You will be redirected to the Threats tab shortly.
        </p>
      </div>
    </BaseModal>
  );
};

export default ScanConfirmModal;
