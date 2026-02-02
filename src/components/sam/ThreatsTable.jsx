// components/sam/ThreatsTable.jsx
const ThreatsTable = ({ threats, onView }) => {
  const hasThreats = Array.isArray(threats) && threats.length > 0;

  return (
    <div className="sam-card">
      <div className="sam-card-header">
        <h3>Detected Threats</h3>
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
              <th>THREAT</th>
              <th>DETECTED TIME</th>
              <th>SEVERITY SCORE</th>
              <th>OCCURRENCES</th>
              <th>ACTION</th>
            </tr>
          </thead>

          {hasThreats && (
            <tbody>
              {threats.map((threat, index) => (
                <tr key={index}>
                  <td>
                    <span className="severity critical">
                      {threat.severity}
                    </span>
                  </td>
                  <td>{threat.name}</td>
                  <td>{threat.detectedTime}</td>
                  <td>{threat.score}</td>
                  <td>{threat.occurrences}</td>
                  <td
                    className="view-action"
                    onClick={() => onView(threat)}
                  >
                    VIEW
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>

        {!hasThreats && (
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

export default ThreatsTable;
