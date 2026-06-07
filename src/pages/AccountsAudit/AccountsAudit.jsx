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
import { updateUser, activateUserWithTemp, deactivateUser, reactivateUser } from "../../api/userApi"; // ADDED 3:34 PMFEB 11
import { useSessionState } from "../../hooks/useSessionState";
import { useToast } from "../../context/ToastContext";
import { getApiErrorMessage } from "../../utils/apiError";


const AccountsAudit = () => {
  const [activeTab, setActiveTab] = useSessionState("wf:accountsAuditTab", "accounts");
  const [showUserModal, setShowUserModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [returnToUserModal, setReturnToUserModal] = useState(false);

  const [modalMode, setModalMode] = useState("add");
  const [selectedUser, setSelectedUser] = useState(null);
  const [pendingUser, setPendingUser] = useState(null);

  const navigate = useNavigate();
  const { showToast } = useToast();
  const { profile, profileLoading } = useProfile();
  const { users, loading, error, fetchUsers } = useUsers();

  const [showTempModal, setShowTempModal] = useState(false);
const [tempPasswordInfo, setTempPasswordInfo] = useState(null);
const [isProcessing, setIsProcessing] = useState(false);
const [issueTempPassword, setIssueTempPassword] = useState(true);
const [reactivateTargetStatus, setReactivateTargetStatus] = useState("active");
const [detailsSavedForReactivation, setDetailsSavedForReactivation] = useState(false);


  const {
  logs: auditLogs,
  loading: auditLoading,
  error: auditError,
  page: auditPage,
  totalPages: auditTotalPages,
  search: auditSearch,
  statusFilter: auditStatusFilter,
  fromDate: auditFromDate,
  toDate: auditToDate,
  isExporting: auditIsExporting,
  exportError: auditExportError,
  handleSearch: handleAuditSearch,
  handleStatusFilter: handleAuditStatusFilter,
  handleFromDate: handleAuditFromDate,
  handleToDate: handleAuditToDate,
  handleExport: handleAuditExport,
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

  let actionSucceeded = false;

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

      actionSucceeded = true;
    }

    // Handle deactivation
    if (modalMode === "deactivate" && selectedUser?.id) {
      console.log("Deactivating user:", selectedUser.id);
      await deactivateUser(selectedUser.id, { anonymize: true });
      await fetchUsers();
      actionSucceeded = true;
    }

    // Handle reactivation — temp password is always issued for security
    if (modalMode === "reactivate" && selectedUser?.id) {
      const profilePayload = pendingUser ? {
        first_name: pendingUser.firstName,
        last_name: pendingUser.lastName,
        username: pendingUser.username,
        email: pendingUser.email,
        role: pendingUser.role,
      } : {};

      const res = await reactivateUser(selectedUser.id, {
        targetStatus: reactivateTargetStatus,
        issueTempPassword: true, // Always issue temp password on reactivation
        profileUpdates: profilePayload,
      });
      await fetchUsers();

      // Temp password is always issued on reactivation to active
      const tempPassword = res.data?.tempPassword;
      const tempExpiresAt = res.data?.tempExpiresAt;
      if (tempPassword) {
        setTempPasswordInfo({
          email: res.data?.profile?.email || pendingUser?.email || selectedUser.email,
          tempPassword,
          tempExpiresAt,
        });
        setShowTempModal(true);
      }
      actionSucceeded = true;
    }
  } catch (err) {
    console.error("Confirm action error:", err.response?.data || err);
    showToast(getApiErrorMessage(err, "Failed to complete action. Please try again."), "error");
  } finally {
    setIsProcessing(false);
  }

  // Only close modals and clean up state if the action succeeded
  if (!actionSucceeded) return;

  // After saving details for an inactive user (edit mode), reopen the UserForm
  // so the admin can proceed to click "Reactivate Account" as step 2
  const wasInactiveEdit =
    modalMode === "edit" &&
    selectedUser &&
    (selectedUser.status || "").toLowerCase() === "inactive";

  // Capture pendingUser before clearing it
  const savedPending = pendingUser;

  setShowConfirmModal(false);

  if (wasInactiveEdit) {
    // Update the selected user with the saved profile data so UserForm reflects the edits
    setSelectedUser((prev) => ({
      ...prev,
      name: savedPending ? `${savedPending.firstName} ${savedPending.lastName}`.trim() : prev.name,
      firstName: savedPending?.firstName ?? prev.firstName,
      lastName: savedPending?.lastName ?? prev.lastName,
      username: savedPending?.username ?? prev.username,
      email: savedPending?.email ?? prev.email,
      role: savedPending?.role ?? prev.role,
      status: "inactive", // still inactive — not reactivated yet
    }));
    setDetailsSavedForReactivation(true); // signal that step 1 is complete
    setShowUserModal(true); // reopen the UserForm for step 2 (reactivation)
    setPendingUser(null);
    // Don't clear selectedUser — we need it for the reactivation step
  } else {
    setShowUserModal(false);
    setPendingUser(null);
    setSelectedUser(null);
    setDetailsSavedForReactivation(false);
  }

  setIssueTempPassword(true); // reset for next action
  setReactivateTargetStatus("active"); // reset for next action
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
  setDetailsSavedForReactivation(false);
};

// Deactivate account handler — called from UserForm
const handleDeactivate = (userToDeactivate) => {
  // Preserve the user reference with its id for the confirm modal
  const safeUser = userToDeactivate?.id ? userToDeactivate : selectedUser;
  if (!safeUser?.id) {
    console.error("handleDeactivate: No valid user with id found");
    return;
  }
  setSelectedUser(safeUser);
  setModalMode("deactivate");
  setReturnToUserModal(true);
  setShowUserModal(false);
  setShowConfirmModal(true);
};

// Reactivate account handler — called from UserForm with edited form data
const handleReactivate = (formData) => {
  // formData contains { id, firstName, lastName, username, email, role, name }
  setPendingUser(formData);
  setSelectedUser(selectedUser); // keep original user for reference
  setModalMode("reactivate");
  setReactivateTargetStatus("active"); // default to active
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
            <div className="date-range-filters">
              <label className="date-filter-label">
                From
                <input
                  type="date"
                  className="date-input"
                  value={auditFromDate}
                  onChange={(e) => handleAuditFromDate(e.target.value)}
                />
              </label>
              <label className="date-filter-label">
                To
                <input
                  type="date"
                  className="date-input"
                  value={auditToDate}
                  onChange={(e) => handleAuditToDate(e.target.value)}
                />
              </label>
            </div>
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
              currentUser={profile}
              fromDate={auditFromDate}
              toDate={auditToDate}
              isExporting={auditIsExporting}
              exportError={auditExportError}
              onExport={handleAuditExport}
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
          detailsSaved={detailsSavedForReactivation}
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
          onReactivate={handleReactivate}
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
              onClick={confirmAction}> {isProcessing ? "Processing..." : (modalMode === "deactivate" ? "Deactivate" : modalMode === "reactivate" ? "Reactivate" : "Confirm")} </button>
          </>
        }
      >
        <p>
          {modalMode === "add" && "Are you sure you want to save this new user?"}
          {modalMode === "edit" && selectedUser && (selectedUser.status || "").toLowerCase() === "inactive" &&
            "Are you sure you want to save the updated profile details for this deactivated account? The account will remain inactive — use Reactivate Account to restore login access."}
          {modalMode === "edit" && !(selectedUser && (selectedUser.status || "").toLowerCase() === "inactive") &&
            "Are you sure you want to save these changes?"}
          {modalMode === "delete" &&
            "This action cannot be undone. Do you really want to delete this account?"}
          {modalMode === "deactivate" &&
            ""}
          {modalMode === "reactivate" &&
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
              This can be reversed by using the Reactivate Account button on the user's Edit modal.
            </p>
          </div>
        )}

        {/* Reactivation details panel */}
        {modalMode === "reactivate" && selectedUser && (
          <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #6ee7b7' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem', color: '#065f46' }}>
              Reactivate Account
            </p>

            {/* Show the profile data that will be applied */}
            {pendingUser && (
              <div style={{ fontSize: '0.83rem', color: '#333', marginBottom: '12px', background: '#f0fdf4', padding: '8px 10px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                <p style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.8rem', color: '#166534' }}>Profile details to apply:</p>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '2px 8px', fontSize: '0.8rem' }}>
                  <span style={{ color: '#666' }}>Name:</span>
                  <span><strong>{pendingUser.firstName} {pendingUser.lastName}</strong></span>
                  <span style={{ color: '#666' }}>Username:</span>
                  <span><strong>{pendingUser.username}</strong></span>
                  <span style={{ color: '#666' }}>Email:</span>
                  <span><strong>{pendingUser.email}</strong></span>
                  <span style={{ color: '#666' }}>Role:</span>
                  <span><strong>{pendingUser.role}</strong></span>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#333', display: 'block', marginBottom: '4px' }}>
                Set status to:
              </label>
              <select
                value={reactivateTargetStatus}
                onChange={(e) => setReactivateTargetStatus(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem' }}
              >
                <option value="active">Active — Can log in normally</option>
                <option value="on_hold">On Hold — Login suspended, data preserved</option>
              </select>
            </div>

            {reactivateTargetStatus === "active" && (
              <div style={{ padding: '8px 10px', background: '#fffbeb', borderRadius: '6px', border: '1px solid #f59e0b', marginBottom: '8px' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: '4px' }}>
                  🔑 A temporary password will be issued
                </p>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>
                  For security, the old password cannot be recovered after deactivation. A new temporary
                  password will be generated and must be given to the user. They will be required to change
                  it on first login.
                </p>
              </div>
            )}

            <ul style={{ fontSize: '0.8rem', color: '#666', margin: '0', paddingLeft: '18px', lineHeight: '1.6' }}>
              <li>Account status will change from <strong>Inactive</strong> → <strong>{reactivateTargetStatus === 'active' ? 'Active' : 'On Hold'}</strong></li>
              <li>Profile details (name, email, username, role) will be updated</li>
              {reactivateTargetStatus === 'active' && (
                <li>A <strong>new temporary password</strong> will be generated (old password is unrecoverable)</li>
              )}
              <li>Login will be {reactivateTargetStatus === 'active' ? 'immediately enabled' : 'still suspended until set to Active'}</li>
              <li>A <strong>USER_REACTIVATE</strong> audit event will be logged</li>
            </ul>
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
