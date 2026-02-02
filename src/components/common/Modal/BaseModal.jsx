// components/common/Modal/BaseModal.jsx
import "./BaseModal.css";

const BaseModal = ({ isOpen, onClose, header, children, footer }) => {
  if (!isOpen) return null;

  return (
    <div className="base-modal-overlay" onClick={onClose}>
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
