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
import { updateUser, activateUserWithTemp } from "../../api/userApi"; // ADDED 3:34 PMFEB 11


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


  const {
  logs: auditLogs,
  loading: auditLoading,
  error: auditError,
} = useAuditLogs();

  // Guard uses hook values, but does not call hooks inside condition
  // While loading profile, show nothing or a small loader
  if (profileLoading) {
    return <p>Loading...</p>;
  }

  // If not logged in or not superadmin, block this page
  if (!profile || profile.role !== "superadmin") {
    navigate("/dashboard"); // or "/profile" if you prefer
    return null;
  }


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


/*   const confirmAction = async () => {
  console.log("Confirmed: add", pendingUser);

   if (modalMode === "edit" && pendingUser) {
    await updateUser(pendingUser.id, {    // ← call your API here
      first_name: pendingUser.firstName,
      last_name: pendingUser.lastName,
      username: pendingUser.username,
      email: pendingUser.email,
      role: pendingUser.role,
      status: pendingUser.status,        
    });
    await fetchUsers(); // refresh list after update
  }

  setShowConfirmModal(false);
  setShowUserModal(false);
  setPendingUser(null);
  setSelectedUser(null);
  }; */

   // ADDED 3:34 PMFEB 11
const confirmAction = async () => {
  console.log("Confirmed:", modalMode, pendingUser);

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

      let tempPassword = null;

      if (pendingUser.status === "active") {
        const res = await activateUserWithTemp(pendingUser.id, payload);
        console.log("activateUserWithTemp response:", res);
        tempPassword = res.data?.tempPassword;
      } else {
        await updateUser(pendingUser.id, payload);
      }

      await fetchUsers();

      if (tempPassword) {
        setTempPasswordInfo({
          email: pendingUser.email,
          tempPassword,
        });
        setShowTempModal(true);
      } else {
        toast.success("User updated");
      }
    }
  } catch (err) {
    console.error("Confirm action error:", err);
    toast.error("Failed to save user changes");
  }

  setShowConfirmModal(false);
  setShowUserModal(false);
  setPendingUser(null);
  setSelectedUser(null);
};

 // ADDED 3:34 PMFEB 11

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

  return (
    <div className="accounts-audit">
      <h1 className="page-title">Accounts and Audit</h1>

      <div className="top-bar">
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        <input type="text" placeholder="Search" className="search-input" />
      </div>

      {activeTab === "accounts" && (
        <>
          {loading && <p>Loading users...</p>}
          {error && <p className="error-text">{error}</p>}

          {!loading && !error && (
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
          {auditLoading && <p>Loading audit logs...</p>}
          {auditError && <p className="error-text">{auditError}</p>}

          {!auditLoading && !auditError && (
            <AuditLogsTable logs={auditLogs} />
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
        />
      </AccountsAuditModal>


      {/* CONFIRM MODAL */}
      <AccountsAuditModal
        isOpen={showConfirmModal}
        title="Confirm Action"
        onClose={cancelConfirm}
        footer={
          <>
            <button
              className="cancel-btn"
              onClick={cancelConfirm}> Cancel </button>
            
            <button className={ modalMode === "delete" ? "tertiary-btn" : "confirm-btn" } 
              onClick={confirmAction}> Confirm </button>
          </>
        }
      >
        <p>
          {modalMode === "add" && "Are you sure you want to save this new user?"}
          {modalMode === "edit" &&
            "Are you sure you want to save these changes?"}
          {modalMode === "delete" &&
            "This action cannot be undone. Do you really want to delete this account?"}
        </p>
      </AccountsAuditModal>

      {/* TEMP PASSWORD MODAL */}
<AccountsAuditModal
  isOpen={showTempModal}
  title="Temporary Password"
  onClose={() => setShowTempModal(false)}
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
