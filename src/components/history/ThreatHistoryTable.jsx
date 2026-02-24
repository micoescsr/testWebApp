// components/history/ThreatHistoryTable.jsx

const SORT_OPTIONS = [
  { key: "datetime-desc", label: "Date & Time (Newest first)" },
  { key: "datetime-asc", label: "Date & Time (Oldest first)" },
  { key: "summary-desc", label: "Summary Counts (Highest)" },
  { key: "summary-asc", label: "Summary Counts (Lowest)" },
];

/**
 * Derive a risk label from a numeric score.
 */
const getRiskLabel = (score) => {
  const n = Number(score) || 0;
  if (n >= 9) return "CRITICAL";
  if (n >= 7) return "HIGH";
  if (n >= 4) return "MEDIUM";
  return "LOW";
};

const ThreatHistoryTable = ({
  data,
  onView,
  activeSorts,
  sortDropdownOpen,
  sortDropdownRef,
  onToggleDropdown,
  onToggleSort,
  sortButtonLabel,
}) => {
  return (
    <div className="history-card">
      <div className="history-card-header">
        <h3>Detected Threats</h3>
        <div className="sort-dropdown-wrapper" ref={sortDropdownRef}>
          <button className="filter-btn" onClick={onToggleDropdown}>
            {sortButtonLabel} ▾
          </button>
          {sortDropdownOpen && (
            <ul className="sort-dropdown-menu">
              {SORT_OPTIONS.map((option) => {
                const isSelected = activeSorts.includes(option.key);
                const order = activeSorts.indexOf(option.key);
                return (
                  <li
                    key={option.key}
                    className={`sort-dropdown-item${isSelected ? " selected" : ""}`}
                    onClick={() => onToggleSort(option.key)}
                  >
                    <span className="sort-dropdown-checkbox">
                      {isSelected ? "☑" : "☐"}
                    </span>
                    <span className="sort-dropdown-label">{option.label}</span>
                    {isSelected && activeSorts.length > 1 && (
                      <span className="sort-order-badge">{order + 1}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <table className="history-table history-table-summary">
        <thead>
          <tr>
            <th>DATE & TIME</th>
            <th>NETWORK</th>
            <th>RISK SCORE</th>
            <th>VULNS</th>
            <th>THREATS</th>
            <th>ACTION</th>
          </tr>
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={6} className="history-empty-cell">
                No threat scan history found.
              </td>
            </tr>
          ) : (
            data.map((item) => {
              const vulns = item.details || item.vulnerabilities || [];
              const threats = item.threats || [];
              const allScores = [
                ...vulns.map((v) => Number(v.score || v.cvss) || 0),
                ...threats.map((t) => Number(t.score || t.cvss) || 0),
              ];
              const riskScore =
                item.riskScore ??
                (allScores.length ? Math.max(...allScores) : 0);
              const riskLabel = item.riskLabel || getRiskLabel(riskScore);
              const vulnCount = item.vulnCount ?? vulns.length;
              const threatCount = item.threatCount ?? threats.length;

              return (
                <tr key={item.id}>
                  <td>{item.datetime}</td>
                  <td>{item.ssid || "—"}</td>
                  <td>
                    <span
                      className={`risk-score-chip ${riskLabel.toLowerCase()}`}
                    >
                      <span className="risk-score-dot" />
                      {riskScore} {riskLabel}
                    </span>
                  </td>
                  <td>{vulnCount}</td>
                  <td>{threatCount}</td>
                  <td>
                    <button className="view-btn" onClick={() => onView(item)}>
                      VIEW <span className="view-btn-arrow">▶</span>
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ThreatHistoryTable;
