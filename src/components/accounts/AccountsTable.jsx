// components/accounts/AccountsTable.jsx

const AccountsTable = ({ users, onEdit }) => {
  return (
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
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td
                className="edit-action"
                onClick={() => onEdit(user)}
              >
                Edit Details
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AccountsTable;
