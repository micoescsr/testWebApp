// components/sam/ThreatsTable.jsx
import { useSeverityTableControls } from "../../hooks/useSeverityTableControls";

const allSeverities = ["none", "low", "medium", "high", "critical"];

const ThreatsTable = ({ threats = [], onView }) => {
  const {
    rows,
    globalSearch,
    setGlobalSearch,
    severityFilter,
    toggleSeverity,
    clearFilters,
    sortBy,
    toggleSort,
  } = useSeverityTableControls({
    data: threats,
    defaultSortField: "severity",
    searchFields: ["name"],
  });

  const hasThreats = Array.isArray(threats) && threats.length > 0;
  const activeCount = rows.length;
  const totalCount = threats.length;

  return (
    <div className="sam-card">
      <div className="sam-card-header">
        <h3>
          Detected Threats {totalCount > 0 && `(${activeCount} of ${totalCount})`}
        </h3>
        <div className="sam-header-controls">
          <input
            className="search-input"
            placeholder="Search threats..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="filters-row">
        {allSeverities.map((sev) => {
          const key = sev.toLowerCase();
          const active = severityFilter.includes(key);
          return (
            <button
              key={sev}
              type="button"
              className={`filter-chip ${active ? "active" : ""}`}
              onClick={() => toggleSeverity(sev)}
            >
              {sev.toUpperCase()}
            </button>
          );
        })}
        <button type="button" className="filter-chip clear" onClick={clearFilters}>
          Clear
        </button>
      </div>

      <div className="sam-card-inner">
        <table className="sam-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort("severity")} className="sortable">
                SEVERITY {sortBy.field === "severity" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => toggleSort("name")} className="sortable">
                THREAT {sortBy.field === "name" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => toggleSort("detectedTime")} className="sortable">
                DETECTED TIME {sortBy.field === "detectedTime" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => toggleSort("score")} className="sortable">
                SEVERITY SCORE {sortBy.field === "score" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th>OCCURRENCES</th>
              <th>ACTION</th>
            </tr>
          </thead>
          {hasThreats && (
            <tbody>
              {rows.map((threat, index) => (
                <tr key={index}>
                  <td>
                    <span
                      className={`severity ${String(
                        threat.severity || ""
                      ).toLowerCase()}`}
                    >
                      {threat.severity}
                    </span>
                  </td>
                  <td>{threat.name}</td>
                  <td>{threat.detectedTime}</td>
                  <td>{threat.score}</td>
                  <td>{threat.occurrences}</td>
                  <td className="view-action" onClick={() => onView(threat)}>
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
