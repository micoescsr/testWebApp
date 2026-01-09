import { useState } from "react";
import Tabs from "../components/Tabs";
import "./AccountsAudit.css";

const AccountsAudit = () => {
  const [activeTab, setActiveTab] = useState("accounts");

  const tabs = [
    { label: "Accounts", value: "accounts" },
    { label: "Audit Logs", value: "logs" },
  ];

  const users = [
    {
      name: "Juan Cruz",
      username: "JCruz",
      email: "jcruz@gmail.com",
      role: "Super Administrator",
    },
    {
      name: "Cardo Dalisay",
      username: "CDalisay",
      email: "cdalisay@gmail.com",
      role: "Administrator",
    },
    {
      name: "Jay Rizal",
      username: "JRizal",
      email: "jrizal@gmail.com",
      role: "Administrator",
    },
  ];

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
      event: "LOGIN",
      date: "11/14/2025",
      time: "10:11 AM",
      module: "LOGIN",
      status: "SUCCESS",
    },
    {
      user: "CDalisay",
      event: "EDIT NETWORK DETAILS",
      date: "11/14/2025",
      time: "10:13 AM",
      module: "SAM",
      status: "SUCCESS",
    },
    {
      user: "CDalisay",
      event: "INITIATED NETWORK VULNERABILITY SCAN",
      date: "11/14/2025",
      time: "10:16 AM",
      module: "SAM",
      status: "FAILED",
    },
    {
      user: "JRizal",
      event: "INITIATED NETWORK VULNERABILITY SCAN",
      date: "11/14/2025",
      time: "10:18 AM",
      module: "SAM",
      status: "SUCCESS",
    },
  ];

  return (
    <div className="accounts-audit">
      <h1 className="page-title">Accounts and Audit</h1>

      {/* Tabs + Search */}
      <div className="top-bar">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <input
          type="text"
          placeholder="Search"
          className="search-input"
        />
      </div>

      {/* ACCOUNTS TAB */}
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
                    <td className="edit-action">Edit Details</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="add-user-btn"> Add a new User</button>
        </>
      )}

      {/* AUDIT LOGS TAB */}
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
    </div>
  );
};

export default AccountsAudit;
