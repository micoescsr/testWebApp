// components/common/Modal/BaseModal.jsx
import "./BaseModal.css";

const BaseModal = ({ isOpen, onClose, header, children, footer, disableOverlayClose = false }) => {
  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (!disableOverlayClose) {
      onClose();
    }
  };

  return (
    <div className="base-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="base-modal-container"
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
