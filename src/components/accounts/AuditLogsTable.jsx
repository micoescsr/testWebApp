// components/accounts/AuditLogsTable.jsx

const AuditLogsTable = ({ logs }) => {
  return (
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
          {logs.map((log, index) => (
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
  );
};

export default AuditLogsTable;
