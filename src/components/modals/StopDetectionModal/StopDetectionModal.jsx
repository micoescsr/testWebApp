// components/modals/StopDetectionModal/StopDetectionModal.jsx
//
// Governed stop-detection modal. Shows a reason_code dropdown,
// optional reason_note, and a confirmation input (type "STOP").

import { useEffect, useRef, useState } from "react";
import BaseModal from "../../common/Modal/BaseModal";
import "./StopDetectionModal.css";

const REASON_CODES = [
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "DEVICE_RESTART", label: "Device Restart" },
  { value: "FALSE_POSITIVES", label: "False Positives" },
  { value: "CLIENT_REQUEST", label: "Client Request" },
  { value: "SCOPE_CHANGE", label: "Scope Change" },
  { value: "EVIDENCE_PRESERVATION", label: "Evidence Preservation" },
  { value: "OTHER", label: "Other" },
];

const StopDetectionModal = ({ isOpen, onClose, onConfirm, isProcessing }) => {
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState(null);

  // Synchronous in-flight guard. `isProcessing` arrives a render later, so a
  // fast double-click or Enter+click could fire onConfirm twice before the
  // button disables — sending duplicate /detect/stop requests (BUG-T5a).
  const submittingRef = useRef(false);

  // Release the guard once the parent finishes processing, so a retry is
  // possible if the stop request failed and the modal stayed open.
  useEffect(() => {
    if (!isProcessing) submittingRef.current = false;
  }, [isProcessing]);

  const noteRequired = reasonCode === "OTHER";
  const canConfirm =
    reasonCode &&
    confirmText === "STOP" &&
    (!noteRequired || reasonNote.trim()) &&
    !isProcessing;

  const handleConfirm = () => {
    if (submittingRef.current || isProcessing) return;
    if (!reasonCode) {
      setError("Please select a reason.");
      return;
    }
    if (noteRequired && !reasonNote.trim()) {
      setError('A note is required when reason is "Other".');
      return;
    }
    if (confirmText !== "STOP") {
      setError('Type "STOP" to confirm.');
      return;
    }
    setError(null);
    submittingRef.current = true;
    onConfirm(reasonCode, reasonNote.trim() || undefined);
  };

  const handleClose = () => {
    if (isProcessing) return;
    setReasonCode("");
    setReasonNote("");
    setConfirmText("");
    setError(null);
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      disableOverlayClose={isProcessing}
      header={<h3 className="sdm-title">Stop Threat Detection</h3>}
      footer={
        <>
          <button
            className="sdm-cancel-btn"
            disabled={isProcessing}
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            className="sdm-confirm-btn"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {isProcessing ? "Stopping\u2026" : "Stop Detection"}
          </button>
        </>
      }
    >
      <div className="sdm-body">
        <p className="sdm-warning">
          This will stop the active threat detection session. Detection can
          only be restarted by running a new scan.
        </p>

        {/* Reason code */}
        <label className="sdm-label" htmlFor="sdm-reason-code">
          Reason <span className="sdm-required">*</span>
        </label>
        <select
          id="sdm-reason-code"
          className="sdm-select"
          value={reasonCode}
          onChange={(e) => {
            setReasonCode(e.target.value);
            setError(null);
          }}
          disabled={isProcessing}
        >
          <option value="">Select a reason\u2026</option>
          {REASON_CODES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {/* Reason note */}
        <label className="sdm-label" htmlFor="sdm-reason-note">
          Note {noteRequired && <span className="sdm-required">*</span>}
        </label>
        <textarea
          id="sdm-reason-note"
          className="sdm-textarea"
          rows={3}
          placeholder={
            noteRequired
              ? "Required — describe the reason\u2026"
              : "Optional — add context\u2026"
          }
          value={reasonNote}
          onChange={(e) => {
            setReasonNote(e.target.value);
            setError(null);
          }}
          disabled={isProcessing}
        />

        {/* Confirmation input */}
        <label className="sdm-label" htmlFor="sdm-confirm">
          Type <strong>STOP</strong> to confirm
        </label>
        <input
          id="sdm-confirm"
          className="sdm-input"
          type="text"
          autoComplete="off"
          placeholder="STOP"
          value={confirmText}
          onChange={(e) => {
            setConfirmText(e.target.value.toUpperCase());
            setError(null);
          }}
          disabled={isProcessing}
        />

        {error && <p className="sdm-error">{error}</p>}
      </div>
    </BaseModal>
  );
};

export default StopDetectionModal;
