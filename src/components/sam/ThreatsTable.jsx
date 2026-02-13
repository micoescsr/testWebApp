// components/sam/ThreatsTable.jsx
import React, { useState } from "react";
import { useSeverityTableControls } from "../../hooks/useSeverityTableControls";
import Pagination from "../../components/common/Pagination/Pagination";

const allSeverities = ["none", "low", "medium", "high", "critical"];

const ThreatsTable = ({ threats = [], onView }) => {
  const hasThreats = Array.isArray(threats) && threats.length > 0;
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatTime = (epoch) =>
    epoch ? new Date(epoch * 1000).toLocaleTimeString() : "—";

  const formatDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString() : "—";

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
    data: threats,
    defaultSortField: "severity",
    searchFields: ["name"],
    itemsPerPage: 10,
  });

  const activeCount = rows.length;
  const totalCount = threats.length;

  return (
    <div className="sam-card">
      <div className="sam-card-header">
        <h3>
          Detected Threats {totalCount > 0 && `(${activeCount} of ${totalCount})`}
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
              placeholder="Search threats..."
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
                THREAT {sortBy.field === "name" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => toggleSort("detectedTime")} className="sortable">
                DETECTED TIME {sortBy.field === "detectedTime" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => toggleSort("score")} className="sortable">
                SEVERITY SCORE {sortBy.field === "score" && (sortBy.dir === "desc" ? "↓" : "↑")}
              </th>
              <th>OCCURRENCES</th>
              <th></th>
              <th>ACTION</th>
            </tr>
          </thead>
          {hasThreats && (
            <tbody>
              {currentRows.map((t) => {
                const isExpanded = expandedIds.has(t.id);
                return (
                  <React.Fragment key={t.id}>
                    <tr>
                      <td>
                        <span
                          className={`severity ${
                            typeof t.severity === "string" ? t.severity.toLowerCase() : "unknown"
                          }`}
                        >
                          {t.severity || "UNKNOWN"}
                        </span>
                      </td>
                      <td>{t.name}</td>
                      <td>{formatDateTime(t.detectedTime)}</td>
                      <td>{t.score ?? "N/A"}</td>
                      <td>{t.occurrences ?? 0}</td>
                      <td
                        className="expand-cell"
                        onClick={() => toggleExpand(t.id)}
                        style={{ cursor: "pointer" }}
                      >
                        {isExpanded ? "▾" : "▸"}
                      </td>
                      <td
                        className="view-action"
                        onClick={() => onView(t)}
                      >
                        View
                      </td>
                    </tr>

                    {isExpanded &&
                      Array.isArray(t.sessions) &&
                      t.sessions.map((s, idx) => (
                        <tr key={`${t.id}-session-${idx}`} className="session-row">
                          <td />
                          <td colSpan={3}>
                            {formatTime(s.firstSeen)} –{" "}
                            {s.lastSeen ? formatTime(s.lastSeen) : "—"}
                          </td>
                          <td colSpan={3}>
                            {s.state === "DETECTED" ? "Detected" : "Cleared"}
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          )}
        </table>

        {!hasThreats && (
          <div className="empty-state">
            Nothing to analyze. Connect to a Wi‑Fi network to start detecting threats.
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
        />

      </div>
    </div>
  );
};

export default ThreatsTable;
