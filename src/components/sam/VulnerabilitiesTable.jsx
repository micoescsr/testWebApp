// components/sam/VulnerabilitiesTable.jsx
const VulnerabilitiesTable = ({ vulnerabilities = [], onView }) => {
  const hasVulns = Array.isArray(vulnerabilities) && vulnerabilities.length > 0;

  return (
    <div className="sam-card">
      <div className="sam-card-header">
        <h3>Scanned Vulnerabilities</h3>
        <select className="sort-dropdown">
          <option>High - Low</option>
          <option>Low - High</option>
        </select>
      </div>

      <div className="sam-card-inner">
        <table className="sam-table">
          <thead>
            <tr>
              <th>SEVERITY</th>
              <th>VULNERABILITY NAME</th>
              <th>SEVERITY SCORE</th>
              <th>OBSERVED CONFIGURATION</th> {/* NEW COLUMN */}
              <th>DETECTED TIME</th>
              <th>ACTION</th>
            </tr>
          </thead>

          {hasVulns && (
            <tbody>
              {vulnerabilities.map((vuln, index) => (
                <tr key={index}>
                  <td>
                    <span
                      className={`severity ${vuln.severity.toLowerCase()}`}
                    >
                      {vuln.severity}
                    </span>
                  </td>
                  <td>{vuln.name}</td>
                  <td>{vuln.score}</td>
                  <td>{vuln.observedConfig || "N/A"}</td> {/* NEW COLUMN DATA */}
                  <td>{vuln.detectedTime}</td>
                  <td
                    className="view-action"
                    onClick={() => onView(vuln)}
                  >
                    VIEW
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>

        {!hasVulns && (
          <div className="empty-state">
            Nothing to analyze. Connect to a Wi-Fi network to start
            detecting threats / scanning vulnerabilities.
          </div>
        )}

        <div className="sam-actions">
          <button className="export-btn">📎 Export</button>
          <button className="clear-btn">🗑 Clear List</button>
        </div>
      </div>
    </div>
  );
};

export default VulnerabilitiesTable;
