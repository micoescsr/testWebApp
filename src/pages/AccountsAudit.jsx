import Tabs from "../components/Tabs";
import Modal from "../components/AccAuditModal";
import "./AccountsAudit.css";
import { useState, useEffect } from "react";

const AccountsAudit = () => {
  const [activeTab, setActiveTab] = useState("accounts");

  const [showUserModal, setShowUserModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [modalMode, setModalMode] = useState("add"); // add | edit | delete
  const [selectedUser, setSelectedUser] = useState(null);

  const tabs = [
    { label: "Accounts", value: "accounts" },
    { label: "Audit Logs", value: "logs" },
  ];



  const [users, setUsers] = useState([]);
  //const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:3000/api/users/user_account");

      if (!res.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await res.json();
      //setUsers(data);
      const formattedUsers = data.map(u => ({
        name: `${u.first_name} ${u.last_name}`,
        username: u.username,
        email: u.email,
        role: u.role,
      }));

        setUsers(formattedUsers);

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  fetchUsers();
}, []);


/*   const users = [
    {
      name: "Juan Cruz",
      username: "JCruz",
      email: "jcruz@gmail.com",
      role: "Administrator",
    },
    {
      name: "Cardo Dalisay",
      username: "CDalisay",
      email: "cdalisay@gmail.com",
      role: "Administrator",
    },
  ]; */

  const auditLogs = [
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

  const openConfirmModal = (mode) => {
    setModalMode(mode);
    setShowUserModal(false);
    setShowConfirmModal(true); 
  };

  const confirmAction = () => {
    console.log("Confirmed:", modalMode, selectedUser);

    setShowConfirmModal(false);
    setShowUserModal(false);
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
          <div className="table-container">
            <table className="accounts-table">
              <thead>
                <tr>
                  <th>FULL NAME</th>
                  <th>USERNAME</th>
                  <th>EMAIL</th>
                  <th>ROLE</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr key={index}>
                    <td>{user.name}</td>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td
                      className="edit-action"
                      onClick={() => openEditUser(user)}
                    >
                      Edit Details
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="add-user-btn" onClick={openAddUser}>
            Add a New User
          </button>
        </>
      )}

      {activeTab === "logs" && (
        <div className="table-container">
          <table className="accounts-table">
            <thead>
              <tr>
                <th>USER</th>
                <th>EVENT</th>
                <th>DATE</th>
                <th>TIME</th>
                <th>MODULE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log, index) => (
                <tr key={index}>
                  <td>{log.user}</td>
                  <td>{log.event}</td>
                  <td>{log.date}</td>
                  <td>{log.time}</td>
                  <td>{log.module}</td>
                  <td className={`status ${log.status.toLowerCase()}`}>
                    {log.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showUserModal}
        title={modalMode === "add" ? "Add User" : "Edit User"}
        onClose={() => setShowUserModal(false)}
        footer={
          <>
            {modalMode === "edit" && (
              <button
                className="tertiary-btn"
                onClick={() => openConfirmModal("delete")}
              >
                Delete Account
              </button>
            )}
            <button
              className="cancel-btn"
              onClick={() => setShowUserModal(false)}
            >
              Cancel
            </button>
            <button
              className="confirm-btn"
              onClick={() =>
                openConfirmModal(modalMode === "add" ? "add" : "edit")
              }
            >
              {modalMode === "add" ? "Save User" : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>First Name</label>
          <input type="text" defaultValue={selectedUser?.name.split(" ")[0]} />
        </div>

        <div className="form-group">
          <label>Last Name</label>
          <input type="text" defaultValue={selectedUser?.name.split(" ")[1]} />
        </div>

        <div className="form-group">
          <label>Username</label>
          <input type="text" defaultValue={selectedUser?.username} />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input type="email" defaultValue={selectedUser?.email} />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input type="password" placeholder="********" />
        </div>
      </Modal>

      <Modal
        isOpen={showConfirmModal}
        title="Confirm Action"
        onClose={() => setShowConfirmModal(false)}
        footer={
          <>
            <button
              className="cancel-btn"
              onClick={() => setShowConfirmModal(false)}
            >
              Cancel
            </button>
            <button
              className={
                modalMode === "delete" ? "tertiary-btn" : "confirm-btn"
              }
              onClick={confirmAction}
            >
              Confirm
            </button>
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
      </Modal>
    </div>
  );
};

export default AccountsAudit;
