// components/common/Modal/BaseModal.jsx
import { useCallback } from "react";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import "./BaseModal.css";

const BaseModal = ({ isOpen, onClose, header, children, footer, disableOverlayClose = false, className = "", ariaLabel }) => {
  // Stable identity so useFocusTrap's effect doesn't re-run (and steal focus
  // back to the first focusable element) on every parent re-render — e.g. the
  // global 3s detection poll re-rendering the SAM page (BUG-T6).
  const handleEscape = useCallback(() => {
    if (!disableOverlayClose) onClose();
  }, [disableOverlayClose, onClose]);
  const containerRef = useFocusTrap(isOpen, handleEscape);

  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (!disableOverlayClose) {
      onClose();
    }
  };

  return (
    <div className="base-modal-overlay" onClick={handleOverlayClick}>
      <div
        className={`base-modal-container${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
      >
        {header && <div className="base-modal-header">{header}</div>}

        <div className="base-modal-body">{children}</div>

        {footer && <div className="base-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default BaseModal;
