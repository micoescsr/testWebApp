import { useState } from "react";
import Tabs from "../../components/common/Tabs/Tabs";
import AccountsAuditModal from "../../components/modals/AccountsAuditModal/AccountsAuditModal";
import "./AccountsAudit.css";
import UserForm from "../../components/accounts/UserForm";
import AccountsTable from "../../components/accounts/AccountsTable";
import AuditLogsTable from "../../components/accounts/AuditLogsTable";
import useUsers from "../../hooks/useUsers";
import useAuditLogs from "../../hooks/useAuditLogs";


const AccountsAudit = () => {
  const [activeTab, setActiveTab] = useState("accounts");

  const [showUserModal, setShowUserModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [returnToUserModal, setReturnToUserModal] = useState(false);


  const [modalMode, setModalMode] = useState("add");
  const [selectedUser, setSelectedUser] = useState(null);

  //const { users, loading, error } = useUsers();
  const [pendingUser, setPendingUser] = useState(null); //new state
   // ← HERE: use the hook
  const { users, loading, error, addUser } = useUsers();

  const {
  logs: auditLogs,
  loading: auditLoading,
  error: auditError,
} = useAuditLogs();

/*   const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); */

  const tabs = [
    { label: "Accounts", value: "accounts" },
    { label: "Audit Logs", value: "logs" },
  ];

  // ============================
  // FETCH USERS (AXIOS → BACKEND)
  // ============================
  // align it with view concept in mvc, modularize the below useEffect => fetchUsers
/*   useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);

        const res = await api.get("/users/user_account");

        const usersArray = res.data.data || res.data.users || res.data;

        if (!Array.isArray(usersArray)) {
          throw new Error("Users data is not an array");
        }

        const formattedUsers = usersArray.map((u) => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          username: u.username,
          email: u.email,
          role: u.role,
        }));

        setUsers(formattedUsers);
      } catch (err) {
        console.error("Fetch users error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);
 */


 /*  const auditLogs = [
    {
      user: "JCruz",
      event: "LOGIN",
      date: "11/14/2025",
      time: "10:10 AM",
      module: "LOGIN",
      status: "FAILED",
    },
    {
      user: "CDalisay",
      event: "EDIT USER",
      date: "11/14/2025",
      time: "10:15 AM",
      module: "ACCOUNTS",
      status: "SUCCESS",
    },
  ]; */

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

  /* const confirmAction = () => {
    console.log("Confirmed:", modalMode, selectedUser);

    if (modalMode === "delete") {
      // Perform delete action
    }

    setShowConfirmModal(false);
    setShowUserModal(false);
  }; */

  const confirmAction = async () => {
  console.log("Confirmed: add", pendingUser);

  if (modalMode === "add" && pendingUser) {
    await addUser({
      first_name: pendingUser.firstName,
      last_name: pendingUser.lastName,
      username: pendingUser.username,
      email: pendingUser.email,
      role: pendingUser.role,
      password: pendingUser.password,
    });
  }

  setShowConfirmModal(false);
  setShowUserModal(false);
  setPendingUser(null);
  setSelectedUser(null);
  };

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
            setPendingUser(data);           // ← store form data
            openConfirmModal(modalMode, data);    // then open confirm, pass data 
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
    </div>
  );
};

export default AccountsAudit;
