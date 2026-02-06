// components/sam/VulnerabilitiesTable.jsx
const VulnerabilitiesTable = ({ vulnerabilities = [], onView }) => {
  console.log("VulnerabilitiesTable props.vulnerabilities", vulnerabilities);
  const hasVulns = Array.isArray(vulnerabilities) && vulnerabilities.length > 0;

  if (hasVulns) {
    console.log("First vuln sample", vulnerabilities[0]);
  }

  const formatDetectedTime = (iso) => {
    if (!iso) return "N/A";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

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
              <th>OBSERVED CONFIGURATION</th>
              <th>DETECTED TIME</th>
              <th>ACTION</th>
            </tr>
          </thead>

          {hasVulns && (
            <tbody>
              {vulnerabilities.map((vuln) => (
                <tr key={vuln.id ?? vuln.name}>
                  <td>
                    <span
                      className={`severity ${String(
                        vuln.severity || ""
                      ).toLowerCase()}`}
                    >
                      {vuln.severity ?? "N/A"}
                    </span>
                  </td>
                  <td>{vuln.name}</td>
                  <td>{vuln.score ?? "N/A"}</td>
                  <td>{vuln.observedConfig || "N/A"}</td>
                  <td>{formatDetectedTime(vuln.detectedTime)}</td>
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