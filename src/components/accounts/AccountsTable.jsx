// components/accounts/AccountsTable.jsx

const AccountsTable = ({ users, onEdit, onResetMfa }) => {
  // Helper to style status badges
  const getStatusBadge = (status) => {
    const s = status ? status.toLowerCase() : "active"; // default to active if undefined
    if (s === "active") return <span className="badge badge-success">Active</span>;
    if (s === "on_hold") return <span className="badge badge-warning">On Hold</span>;
    return <span className="badge badge-neutral">Inactive</span>;
  };

  return (
    <div className="table-container">
      <table className="accounts-table">
        <thead>
          <tr>
            <th>FULL NAME</th>
            <th>USERNAME</th>
            <th>EMAIL</th>
            <th>ROLE</th>
            <th>STATUS</th> {/* New Column */}
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className={user.username === 'Unknown' ? 'empty-slot-row' : ''}>
              <td>{user.name || "Available Slot"}</td>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>{getStatusBadge(user.status)}</td>
              <td className="actions-cell">
                <span className="edit-action" onClick={() => onEdit(user)}>
                  Edit Details
                </span>
                {user.username !== "Unknown" && (
                  <span className="edit-action" onClick={() => onResetMfa(user)}>
                    Reset MFA
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AccountsTable;
