// components/sam/ThreatsTable.jsx
import React, { useState } from "react";
import { useSeverityTableControls } from "../../hooks/useSeverityTableControls";
import SeverityBadge from "../../components/common/SeverityBadge/SeverityBadge";
import Pagination from "../../components/common/Pagination/Pagination";
import EmptyState from "../../components/common/EmptyState/EmptyState";
import ExportDropdown from "./ExportDropdown";
import { useNetworkContext } from "../../context/NetworkContext";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

const allSeverities = ["none", "low", "medium", "high", "critical"];

const ThreatsTable = ({ threats = [], onView, detectionStatus }) => {
  const { networkId } = useNetworkContext();
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

  const formatEpoch = (sec) => (sec ? new Date(sec * 1000).toLocaleString() : "—");

  const formatDuration = (secs) => {
    if (secs == null) return "—";
    const s = Number(secs);
    if (!Number.isFinite(s) || s < 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

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
            <MagnifyingGlass className="search-icon" size={16} />
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
                <X size={14} />
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
              <th className="sortable">
                <button type="button" className="cell-action-btn" onClick={() => toggleSort("severity")}>
                  SEVERITY {sortBy.field === "severity" && (sortBy.dir === "desc" ? "↓" : "↑")}
                </button>
              </th>
              <th className="sortable">
                <button type="button" className="cell-action-btn" onClick={() => toggleSort("name")}>
                  THREAT {sortBy.field === "name" && (sortBy.dir === "desc" ? "↓" : "↑")}
                </button>
              </th>
              <th className="sortable">
                <button type="button" className="cell-action-btn" onClick={() => toggleSort("detectedTime")}>
                  DETECTED TIME {sortBy.field === "detectedTime" && (sortBy.dir === "desc" ? "↓" : "↑")}
                </button>
              </th>
              <th className="sortable">
                <button type="button" className="cell-action-btn" onClick={() => toggleSort("score")}>
                  SEVERITY SCORE {sortBy.field === "score" && (sortBy.dir === "desc" ? "↓" : "↑")}
                </button>
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
                        <SeverityBadge level={t.severity} />
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <strong>{t.name}</strong>
                          <small style={{ color: "#666" }}>{t.id}</small>
                        </div>
                      </td>
                      <td>{formatEpoch(t.detectedTime)}</td>
                      <td>{t.score ?? "N/A"}</td>
                      <td>
                        {t.occurrences ?? 0}
                        {t.activeCount ? (
                          <span style={{ marginLeft: 8, color: "#0b6", fontSize: "0.85em" }}>
                            (+{t.activeCount} active)
                          </span>
                        ) : null}
                      </td>
                      <td className="expand-cell">
                        <button
                          type="button"
                          className="cell-action-btn"
                          onClick={() => toggleExpand(t.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Collapse session details" : "Expand session details"}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      </td>
                      <td className="view-action">
                        <button
                          type="button"
                          className="cell-action-btn"
                          onClick={() => onView(t)}
                        >
                          View
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="expanded-row">
                        <td colSpan={7}>
                          <div className="session-panel" style={{ padding: 12, border: "1px solid #eee", borderRadius: 6, background: "#fafafa" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <strong>Sessions</strong>
                              <div style={{ fontSize: "0.9em", color: "#555" }}>
                                {t.activeCount ? "Active now: Yes" : "Active now: No"}
                              </div>
                            </div>

                            <table className="inner-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: "left" }}>#</th>
                                  <th style={{ textAlign: "left" }}>First seen</th>
                                  <th style={{ textAlign: "left" }}>Last seen</th>
                                  <th style={{ textAlign: "left" }}>Duration</th>
                                  <th style={{ textAlign: "left" }}>State</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Array.isArray(t.sessions) && t.sessions.length > 0 ? (
                                  t.sessions.map((s, idx) => (
                                    <tr key={`${t.id}-session-${idx}`}> 
                                      <td style={{ padding: "6px 8px" }}>{t.sessions.length - idx}</td>
                                      <td style={{ padding: "6px 8px" }}>{formatEpoch(s.firstSeen)}</td>
                                      <td style={{ padding: "6px 8px" }}>{s.lastSeen ? formatEpoch(s.lastSeen) : "—"}</td>
                                      <td style={{ padding: "6px 8px" }}>{formatDuration(s.durationSeconds)}</td>
                                          <td style={{ padding: "6px 8px" }}>{s.state}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={7} style={{ padding: 8 }}>No session data available.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          )}
        </table>

        {!hasThreats && (
          <EmptyState
            message={
              detectionStatus === "DETECTING"
                ? "Monitoring in progress. No threats detected yet."
                : detectionStatus === "SCANNING"
                  ? "Starting scan\u2026 Please wait."
                  : detectionStatus === "FAILED"
                    ? "Detection failed. Run a new scan to restart."
                    : "Nothing to analyze. Connect to a Wi\u2011Fi network to start detecting threats."
            }
          />
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
        />

        <div className="sam-actions">
          <ExportDropdown networkId={networkId} />
        </div>

      </div>
    </div>
  );
};

export default ThreatsTable;
