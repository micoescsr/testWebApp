// components/sam/VulnerabilitiesTable.jsx
import { useSeverityTableControls } from "../../hooks/useSeverityTableControls";

const allSeverities = ["none", "low", "medium", "high", "critical"];

const VulnerabilitiesTable = ({ vulnerabilities = [], onView }) => {
  const hasVulns =
    Array.isArray(vulnerabilities) && vulnerabilities.length > 0;

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
    data: vulnerabilities,
    defaultSortField: "severity",
    searchFields: ["name", "observedConfig"],
  });

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

  const activeCount = rows.length;
  const totalCount = vulnerabilities.length;

  return (
    <div className="sam-card">
      <div className="sam-card-header">
        <h3>
          Scanned Vulnerabilities{" "}
          {totalCount > 0 && `(${activeCount} of ${totalCount})`}
        </h3>
        <div className="sam-header-controls">
          <input
            className="search-input"
            placeholder="Search vulnerabilities..."
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
                VULNERABILITY NAME {sortBy.field === "name" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => toggleSort("score")} className="sortable">
                SEVERITY SCORE {sortBy.field === "score" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th>OBSERVED CONFIGURATION</th>
              <th
                onClick={() => toggleSort("detectedTime")}
                className="sortable"
              >
                DETECTED TIME{" "}
                {sortBy.field === "detectedTime" &&
                  (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th>ACTION</th>
            </tr>
          </thead>

          {hasVulns && (
            <tbody>
              {vulnerabilities.map((vuln) => (
                //<tr key={vuln.id ?? vuln.name}>
                <tr key={`${vuln.id ?? vuln.name}-${vuln.detectedTime ?? ""}`}>
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
                  <td className="view-action" onClick={() => onView(vuln)}>
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
