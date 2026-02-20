// components/history/ThreatHistoryTable.jsx

const SORT_OPTIONS = [
  { key: "datetime-desc", label: "Date & Time (Newest first)" },
  { key: "datetime-asc", label: "Date & Time (Oldest first)" },
  { key: "summary-desc", label: "Summary Counts (Highest)" },
  { key: "summary-asc", label: "Summary Counts (Lowest)" },
];

const ThreatHistoryTable = ({
  data,
  expandedRow,
  onToggleExpand,
  onViewDetail,
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

      <table className="history-table">
        <thead>
          <tr>
            <th>DATE & TIME</th>
            <th>SSID (TARGET NETWORK)</th>
            <th>SUMMARY COUNTS</th>
            <th>ACTION</th>
          </tr>
        </thead>

        <tbody>
          {data.map((item) => (
            <>
              <tr key={item.id}>
                <td>{item.datetime}</td>
                <td>{item.ssid}</td>
                <td>{item.summary}</td>
                <td
                  className="expand-btn"
                  onClick={() => onToggleExpand(item.id)}
                >
                  {expandedRow === item.id ? "Collapse ▲" : "Expand ▼"}
                </td>
              </tr>

              {expandedRow === item.id && (
                <tr className="expanded-row">
                  <td colSpan={4}>
                    <table className="inner-table">
                      <thead>
                        <tr>
                          <th>SEVERITY LEVEL</th>
                          <th>THREAT NAME</th>
                          <th>SEVERITY SCORE</th>
                          <th>OCCURRENCES</th>
                          <th>DETECTION WINDOW</th>
                          <th>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.threats.map((threat, index) => (
                          <tr key={`${item.id}-${index}`}>
                            <td>
                              <span
                                className={`severity ${threat.severity.toLowerCase()}`}
                              >
                                {threat.severity}
                              </span>
                            </td>
                            <td>{threat.name}</td>
                            <td>{threat.score}</td>
                            <td>{threat.occurrences}</td>
                            <td>{threat.window}</td>
                            <td
                              className="view-action"
                              onClick={() => onViewDetail(threat.code || threat.name)}
                            >
                              VIEW
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ThreatHistoryTable;
