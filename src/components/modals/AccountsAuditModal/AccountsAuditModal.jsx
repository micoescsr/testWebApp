// components/modals/AccountsAuditModal/AccountsAuditModal.jsx
import BaseModal from "../../common/Modal/BaseModal";
import "./AccountsAuditModal.css";

const AccountsAuditModal = ({
  isOpen,
  title,
  children,
  footer,
  onClose,
  disableOverlayClose = false,
}) => {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      disableOverlayClose={disableOverlayClose}
      header={
        <>
          <h3 className="accounts-modal-title">{title}</h3>
{/*           <button className="accounts-modal-close" onClick={onClose}>
            ✕
          </button> */}
        </>
      }
      footer={footer}
    >
      {children}
    </BaseModal>
  );
};

export default AccountsAuditModal;
