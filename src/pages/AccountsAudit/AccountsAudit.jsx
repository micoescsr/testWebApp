//AccountsAudit.jsx
import { useState } from "react";
import Tabs from "../../components/common/Tabs/Tabs";
import AccountsAuditModal from "../../components/modals/AccountsAuditModal/AccountsAuditModal";
import "./AccountsAudit.css";
import UserForm from "../../components/accounts/UserForm";
import AccountsTable from "../../components/accounts/AccountsTable";
import AuditLogsTable from "../../components/accounts/AuditLogsTable";
import useUsers from "../../hooks/useUsers";
import useAuditLogs from "../../hooks/useAuditLogs";
//import { updateUser } from "../../api/userApi";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../../hooks/useProfile";
import { updateUser, activateUserWithTemp, deactivateUser } from "../../api/userApi"; // ADDED 3:34 PMFEB 11


const AccountsAudit = () => {
  const [activeTab, setActiveTab] = useState("accounts");
  const [showUserModal, setShowUserModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [returnToUserModal, setReturnToUserModal] = useState(false);

  const [modalMode, setModalMode] = useState("add");
  const [selectedUser, setSelectedUser] = useState(null);
  const [pendingUser, setPendingUser] = useState(null);

  const navigate = useNavigate();
  const { profile, profileLoading } = useProfile();
  const { users, loading, error, fetchUsers } = useUsers();

  const [showTempModal, setShowTempModal] = useState(false);
const [tempPasswordInfo, setTempPasswordInfo] = useState(null);
const [isProcessing, setIsProcessing] = useState(false);
const [issueTempPassword, setIssueTempPassword] = useState(true);


  const {
  logs: auditLogs,
  loading: auditLoading,
  error: auditError,
  page: auditPage,
  totalPages: auditTotalPages,
  search: auditSearch,
  statusFilter: auditStatusFilter,
  handleSearch: handleAuditSearch,
  handleStatusFilter: handleAuditStatusFilter,
  goToPage: goToAuditPage,
} = useAuditLogs();

  // If not loading and not superadmin, redirect
  if (!profileLoading && (!profile || profile.role !== "superadmin")) {
    navigate("/dashboard");
    return null;
  }

  const isPageLoading = profileLoading || loading;

  const tabs = [
    { label: "Accounts", value: "accounts" },
    { label: "Audit Logs", value: "logs" },
  ];

  const openAddUser = () => {
    setModalMode("add");
    setSelectedUser(null);
    setShowUserModal(true);
  };

  const openEditUser = (user) => {
    setModalMode("edit");
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const openConfirmModal = (mode, data = null) => {
    setModalMode(mode);

    setReturnToUserModal(mode === "edit" || mode === "delete");
     if (mode === "add" || mode === "edit") {
    setPendingUser(data);           // store the form data here
    }

    setShowUserModal(false);
    setShowConfirmModal(true);
  };

// EDITED 08:52 PM FEB 13 2026
 const confirmAction = async () => {
  console.log("Confirmed:", modalMode, { pendingUser, selectedUser });
  setIsProcessing(true);

  try {
    if (modalMode === "edit" && pendingUser) {
      const payload = {
        first_name: pendingUser.firstName,
        last_name: pendingUser.lastName,
        username: pendingUser.username,
        email: pendingUser.email,
        role: pendingUser.role,
        status: pendingUser.status,
      };

      // Normalize statuses (in case UI uses labels like "Active (Can Login)")
      const oldStatusRaw = selectedUser?.status || "";
      const newStatusRaw = pendingUser.status || "";

      const normalizeStatus = (s) => s.toLowerCase().trim();
      const oldStatus = normalizeStatus(oldStatusRaw);
      const newStatus = normalizeStatus(newStatusRaw);

      const wasActive = oldStatus === "active";
      const isNowActive = newStatus === "active";

      // Only generate temp password when slot moves from non-active → active AND admin chose to issue temp
      const shouldActivateWithTemp = !wasActive && isNowActive && issueTempPassword;

      console.log("Status change:", { oldStatus, newStatus, shouldActivateWithTemp });

      let tempPassword = null;
      let tempExpiresAt = null;

      if (shouldActivateWithTemp) {
        const res = await activateUserWithTemp(pendingUser.id, payload);
        console.log("activateUserWithTemp response:", res);
        tempPassword = res.data?.tempPassword;
        tempExpiresAt = res.data?.tempExpiresAt;
      } else {
        // Just a normal edit, keep existing password
        await updateUser(pendingUser.id, payload);
      }

      await fetchUsers();

      if (tempPassword) {
        setTempPasswordInfo({
          email: pendingUser.email,
          tempPassword,
          tempExpiresAt,
        });
        setShowTempModal(true);
      }
    }

    // Handle deactivation
    if (modalMode === "deactivate" && selectedUser) {
      await deactivateUser(selectedUser.id, { anonymize: true });
      await fetchUsers();
    }
  } catch (err) {
    console.error("Confirm action error:", err.response?.data || err);
    // toast.error(err.response?.data?.error || "Failed to save user changes");
  } finally {
    setIsProcessing(false);
  }

  setShowConfirmModal(false);
  setShowUserModal(false);
  setPendingUser(null);
  setSelectedUser(null);
  setIssueTempPassword(true); // reset for next action
};
// EDITED 08:52 PM FEB 13 2026

  const cancelConfirm = () => {
  setShowConfirmModal(false);

  if (returnToUserModal) {
    setShowUserModal(true);
  }
  setReturnToUserModal(false);
};

const cancelUserForm = () => {
  setShowUserModal(false);
  setModalMode("add");
  setSelectedUser(null);
};

// Deactivate account handler — called from UserForm
const handleDeactivate = (user) => {
  setSelectedUser(user);
  setModalMode("deactivate");
  setReturnToUserModal(true);
  setShowUserModal(false);
  setShowConfirmModal(true);
};

  return (
    <div className="accounts-audit">
      <h1 className="page-title">Accounts and Audit</h1>

      <div className="top-bar">
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === "logs" && (
          <div className="audit-filters">
            <input
              type="text"
              placeholder="Search events..."
              className="search-input"
              value={auditSearch}
              onChange={(e) => handleAuditSearch(e.target.value)}
            />
            <select
              className="status-filter-select"
              value={auditStatusFilter}
              onChange={(e) => handleAuditStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        )}
      </div>

      {activeTab === "accounts" && (
        <>
          {isPageLoading && (
            <div className="table-container">
              <p style={{ padding: "24px", textAlign: "center" }}>Loading users...</p>
            </div>
          )}
          {!isPageLoading && error && <p className="error-text">{error}</p>}

          {!isPageLoading && !error && (
            <AccountsTable
              users={users}
              onEdit={openEditUser}
            />
          )}


          <button className="add-user-btn" onClick={openAddUser}>
            Add a New User
          </button>
        </>
      )}

      {activeTab === "logs" && (
        <>
          {(profileLoading || auditLoading) && (
            <div className="table-container">
              <p style={{ padding: "24px", textAlign: "center" }}>Loading audit logs...</p>
            </div>
          )}
          {!profileLoading && !auditLoading && auditError && <p className="error-text">{auditError}</p>}

          {!profileLoading && !auditLoading && !auditError && (
            <AuditLogsTable
              logs={auditLogs}
              page={auditPage}
              totalPages={auditTotalPages}
              onPageChange={goToAuditPage}
            />
          )}
        </>
      )}

      {/* USER MODAL */}
      <AccountsAuditModal
        isOpen={showUserModal}
        title={modalMode === "add" ? "Add User" : "Edit User"}
        onClose={cancelUserForm}
      >
        <UserForm
          mode={modalMode}
          user={selectedUser}
            onCancel={cancelUserForm}
          onSubmit={(data) => {
            console.log("SAVE USER:", data);
            const withId = { ...data, id: selectedUser?.id };
            setPendingUser(withId);  
            openConfirmModal(modalMode, withId);    // then open confirm, pass data  // data contains firstName, lastName, role, status
          }}
          onDelete={() => {
            setSelectedUser(selectedUser);
            openConfirmModal("delete");
          }}
          onDeactivate={handleDeactivate}
        />
      </AccountsAuditModal>


      {/* CONFIRM MODAL */}
      <AccountsAuditModal
        isOpen={showConfirmModal}
        title="Confirm Action"
        onClose={cancelConfirm}
        disableOverlayClose={isProcessing}
        footer={
          <>
            <button
              className="cancel-btn"
              disabled={isProcessing}
              onClick={cancelConfirm}> Cancel </button>
            
            <button className={ (modalMode === "delete" || modalMode === "deactivate") ? "tertiary-btn" : "confirm-btn" } 
              disabled={isProcessing}
              onClick={confirmAction}> {isProcessing ? "Processing..." : (modalMode === "deactivate" ? "Deactivate" : "Confirm")} </button>
          </>
        }
      >
        <p>
          {modalMode === "add" && "Are you sure you want to save this new user?"}
          {modalMode === "edit" &&
            "Are you sure you want to save these changes?"}
          {modalMode === "delete" &&
            "This action cannot be undone. Do you really want to delete this account?"}
          {modalMode === "deactivate" &&
            ""}
        </p>

        {/* Deactivation details panel */}
        {modalMode === "deactivate" && selectedUser && (
          <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fca5a5' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem', color: '#991b1b' }}>
              Deactivate Account
            </p>
            <p style={{ fontSize: '0.85rem', color: '#333', marginBottom: '8px' }}>
              This will deactivate <strong>{selectedUser.email || selectedUser.username || 'this user'}</strong> and archive their profile data for security compliance.
            </p>
            <ul style={{ fontSize: '0.8rem', color: '#666', margin: '0', paddingLeft: '18px', lineHeight: '1.6' }}>
              <li>Status set to <strong>Inactive</strong> — login immediately blocked</li>
              <li>Personal info (name, email, username) anonymized</li>
              <li>Original profile data archived in audit logs for compliance</li>
              <li>Audit history preserved and linked to this account</li>
            </ul>
            <p style={{ fontSize: '0.8rem', color: '#92400e', marginTop: '8px', fontStyle: 'italic' }}>
              This can be reversed by editing the account and setting it back to Active or On Hold.
            </p>
          </div>
        )}

        {/* AUTH-008: Show activation choice when status changes to active */}
        {modalMode === "edit" && pendingUser && selectedUser && (() => {
          const oldS = (selectedUser.status || "").toLowerCase().trim();
          const newS = (pendingUser.status || "").toLowerCase().trim();
          const isActivating = oldS !== "active" && newS === "active";
          if (!isActivating) return null;
          return (
            <div style={{ marginTop: "12px", padding: "10px", background: "#fffbeb", borderRadius: "6px", border: "1px solid #f59e0b" }}>
              <p style={{ fontWeight: 600, marginBottom: "8px", fontSize: "0.9rem" }}>
                This user is being activated from "{oldS}".
              </p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={issueTempPassword}
                  onChange={(e) => setIssueTempPassword(e.target.checked)}
                  style={{ marginTop: "3px" }}
                />
                <span style={{ fontSize: "0.85rem" }}>
                  Issue a temporary password (forces password reset on first login).
                  <br />
                  <span style={{ color: "#666" }}>
                    {issueTempPassword
                      ? "A new temporary password will be generated. The user must use it to log in and will be prompted to change it."
                      : "The user's existing password will remain valid. If they have forgotten it, they will not be able to log in."}
                  </span>
                </span>
              </label>
            </div>
          );
        })()}
      </AccountsAuditModal>

      {/* TEMP PASSWORD MODAL */}
<AccountsAuditModal
  isOpen={showTempModal}
  title="Temporary Password"
  onClose={() => setShowTempModal(false)}
  disableOverlayClose={true}
  footer={
    <button
      className="confirm-btn"
      onClick={() => setShowTempModal(false)}
    >
      Close
    </button>
  }
>
  {tempPasswordInfo && (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <p>
        Give this temporary password to{" "}
        <strong>{tempPasswordInfo.email}</strong>. They will be forced to change it on first login.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          wordBreak: "break-all",
        }}
      >
        <code>{tempPasswordInfo.tempPassword}</code>
        <button
          className="confirm-btn"
          onClick={() =>
            navigator.clipboard.writeText(tempPasswordInfo.tempPassword)
          }
        >
          Copy
        </button>
      </div>
      {tempPasswordInfo.tempExpiresAt && (
        <p style={{ fontSize: "0.85rem", color: "#b45309", fontWeight: 500 }}>
          Expires at:{" "}
          {new Date(tempPasswordInfo.tempExpiresAt).toLocaleString()} (
          {(() => {
            const diff = new Date(tempPasswordInfo.tempExpiresAt) - new Date();
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            if (hours > 0) return `${hours}h ${minutes}m remaining`;
            if (minutes > 0) return `${minutes}m remaining`;
            return "expired";
          })()}
          )
        </p>
      )}
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        This dialog will close only when you click Close.
      </p>
    </div>
  )}
</AccountsAuditModal>

    </div>
  );
};

export default AccountsAudit;
