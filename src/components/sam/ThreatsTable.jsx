// components/sam/ThreatsTable.jsx
import React, { useState } from "react";

const ThreatsTable = ({ threats, onView }) => {
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

  return (
    <div className="sam-card">
      <div className="sam-card-header">
        <h3>Detected Threats</h3>
        {/* sort dropdown */}
      </div>

      <div className="sam-card-inner">
        <table className="sam-table">
          <thead>
            <tr>
              <th>SEVERITY</th>
              <th>THREAT</th>
              <th>STATUS</th>
              <th>SEVERITY SCORE</th>
              <th>OCCURRENCES</th>
              <th></th> {/* expand arrow */}
              <th>ACTION</th>
            </tr>
          </thead>

          {hasThreats && (
            <tbody>
              {threats.map((t) => {
                const isExpanded = expandedIds.has(t.id);
                return (
                  <React.Fragment key={t.id}>
                    {/* summary row */}
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
                      <td>{t.status}</td>
                      <td>{t.score}</td>
                      <td>{t.occurrences}</td>
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

                    {/* expanded rows: one per session */}
                    {isExpanded &&
                      Array.isArray(t.sessions) &&
                      t.sessions.map((s, idx) => (
                        <tr key={`${t.id}-session-${idx}`} className="session-row">
                          <td /> {/* empty to align */}
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
      </div>
    </div>
  );
};

export default ThreatsTable;
