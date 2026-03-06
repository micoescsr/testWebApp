// components/sam/VulnerabilitiesTable.jsx
import { useState, useMemo, Fragment } from "react";
import { useSeverityTableControls } from "../../hooks/useSeverityTableControls";
import Pagination from "../../components/common/Pagination/Pagination";
import ExportDropdown from "./ExportDropdown";

const allSeverities = ["none", "low", "medium", "high", "critical"];

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

/** Return a grouping key rounded to the minute so rows from the same scan batch stay together */
const getGroupKey = (iso) => {
  if (!iso) return "N/A";
  const d = new Date(iso);
  // round to the nearest minute
  d.setSeconds(0, 0);
  return d.toISOString();
};

/**
 * Groups an array of rows by scan_id (unique per scan session).
 * Falls back to detected time if scan_id is missing.
 * Returns an ordered array of { key, label, rows }.
 */
const groupByScan = (rows) => {
  const map = new Map();
  for (const row of rows) {
    // Use scan_id if available, otherwise fall back to timestamp
    const key = row.scan_id != null ? String(row.scan_id) : getGroupKey(row.detectedTime);
    if (!map.has(key)) {
      map.set(key, { key, label: formatDetectedTime(row.detectedTime), rows: [] });
    }
    map.get(key).rows.push(row);
  }
  return Array.from(map.values());
};

const ChevronIcon = ({ expanded }) => (
  <svg
    className={`group-chevron ${expanded ? "expanded" : ""}`}
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const VulnerabilitiesTable = ({ vulnerabilities = [], onView, onClear }) => {
  const hasVulns =
    Array.isArray(vulnerabilities) && vulnerabilities.length > 0;

  const {
    rows,
    currentRows,
    globalSearch,
    setGlobalSearch,
    severityFilter,
    toggleSeverity,
    clearFilters,
    sortBy,
    toggleSort,
    page,
    totalPages,
    goNext,
    goPrev,
  } = useSeverityTableControls({
    data: vulnerabilities,
    defaultSortField: "detectedTime",
    searchFields: ["name", "observedConfig"],
    itemsPerPage: 10,
  });

  // --- Grouping & expand/collapse state ---
  const groups = useMemo(() => groupByScan(currentRows), [currentRows]);

  // Track which groups are expanded (by group key). Default: all expanded.
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const activeCount = rows.length;
  const totalCount = vulnerabilities.length;

  // Column count for the group header colspan
  const COL_COUNT = 5;

  return (
    <div className="sam-card">
      <div className="sam-card-header">
        <h3>
          Scanned Vulnerabilities{" "}
          {totalCount > 0 && `(${activeCount} of ${totalCount})`}
        </h3>
        <div className="sam-header-controls">
          <div className="vuln-search-wrapper">
            <svg
              className="search-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="search-input"
              placeholder="Search vulnerabilities..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
            {globalSearch && (
              <button
                className="clear-search-btn"
                onClick={() => setGlobalSearch("")}
                type="button"
                aria-label="Clear search"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>
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
              <th>ACTION</th>
            </tr>
          </thead>

          {hasVulns && (
            <tbody>
              {groups.map((group) => {
                const isExpanded = !collapsedGroups.has(group.key);
                return (
                  <Fragment key={group.key}>
                    {/* ── Group header row ── */}
                    <tr
                      className="group-header-row"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <td colSpan={COL_COUNT}>
                        <div className="group-header-content">
                          <ChevronIcon expanded={isExpanded} />
                          <span className="group-label">
                            {group.label}
                          </span>
                          <span className="group-count">
                            ({group.rows.length}{" "}
                            {group.rows.length === 1
                              ? "vulnerability"
                              : "vulnerabilities"})
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* ── Child vulnerability rows ── */}
                    {isExpanded &&
                      group.rows.map((vuln) => (
                        <tr
                          key={`${vuln.id ?? vuln.name}-${vuln.detectedTime ?? ""}`}
                          className="group-child-row"
                        >
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
                          <td
                            className="view-action"
                            onClick={() => onView(vuln)}
                          >
                            View Details
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          )}
        </table>

        {!hasVulns && (
          <div className="empty-state">
            Nothing to analyze. Connect to a Wi-Fi network to start
            detecting threats / scanning vulnerabilities.
          </div>
        )}

          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={goPrev}
            onNext={goNext}
          />

        <div className="sam-actions">
          <ExportDropdown />
          <button
            className="clear-btn"
            onClick={() => {
              if (
                window.confirm(
                  "Are you sure you want to clear the list?\n\nDon't worry — all scanned results are still saved and can be viewed on the History page."
                )
              ) {
                onClear?.();
              }
            }}
          >
            🗑 Clear List
          </button>
        </div>
      </div>
    </div>
  );
};

export default VulnerabilitiesTable;
