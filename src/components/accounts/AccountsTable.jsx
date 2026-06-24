// components/accounts/AccountsTable.jsx
import SortHeader from "../history/SortHeader";

const AccountsTable = ({
  users,
  onEdit,
  onResetMfa,
  sortField,
  sortDir,
  onSort,
  emptyMessage = "No accounts found.",
  footer,
}) => {
  // Helper to style status badges
  const getStatusBadge = (status) => {
    const s = status ? status.toLowerCase() : "active"; // default to active if undefined
    if (s === "active") return <span className="badge badge-success">Active</span>;
    if (s === "on_hold") return <span className="badge badge-warning">On Hold</span>;
    return <span className="badge badge-neutral">Inactive</span>;
  };

  const headerProps = { sortField, sortDir, onSort };

  return (
    <div className="table-container">
      <table className="accounts-table">
        <thead>
          <tr>
            <SortHeader field="name" label="FULL NAME" {...headerProps} />
            <SortHeader field="username" label="USERNAME" {...headerProps} />
            <SortHeader field="email" label="EMAIL" {...headerProps} />
            <SortHeader field="role" label="ROLE" {...headerProps} />
            <SortHeader field="status" label="STATUS" {...headerProps} />
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={6} className="history-empty-cell">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr
                key={user.id}
                className={`history-row ${user.username === "Unknown" ? "empty-slot-row" : ""}`}
              >
                <td>{user.name || "Available Slot"}</td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{getStatusBadge(user.status)}</td>
                <td className="actions-cell">
                  <div className="account-actions">
                    <button
                      type="button"
                      className="account-action account-action--primary"
                      onClick={() => onEdit(user)}
                    >
                      Edit Details
                    </button>
                    {user.username !== "Unknown" && (
                      <button
                        type="button"
                        className="account-action account-action--secondary"
                        onClick={() => onResetMfa(user)}
                      >
                        Reset MFA
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {footer && <div className="history-card-footer">{footer}</div>}
    </div>
  );
};

export default AccountsTable;
