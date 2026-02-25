// components/accounts/AuditLogsTable.jsx
import { useState } from "react";

/**
 * Formats ISO timestamp to readable date + time.
 * Returns { date, time } strings.
 */
function formatTimestamp(isoString) {
  if (!isoString) return { date: "—", time: "" };
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: "—", time: "" };
    const date = d.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return { date, time };
  } catch {
    return { date: "—", time: "" };
  }
}

/**
 * Maps event_name to a human-readable module/category.
 */
function getEventModule(eventName) {
  if (!eventName) return "—";
  const upper = eventName.toUpperCase();
  if (upper.includes("LOGIN") || upper.includes("LOGOUT") || upper.includes("AUTH") || upper.includes("REFRESH")) return "AUTH";
  if (upper.includes("USER") || upper.includes("PROFILE") || upper.includes("ACTIVATE")) return "ACCOUNTS";
  if (upper.includes("SCAN")) return "SCANS";
  if (upper.includes("NETWORK")) return "NETWORK";
  if (upper.includes("DEVICE")) return "DEVICE";
  if (upper.includes("PORTAL")) return "PORTAL";
  return "SYSTEM";
}

/**
 * Renders a safe display name for the actor.
 */
function getActorDisplay(actor) {
  if (!actor) return "System";
  if (actor.username) return actor.username;
  if (actor.firstName && actor.lastName) return `${actor.firstName} ${actor.lastName}`;
  if (actor.email) return actor.email;
  return "Unknown";
}

/**
 * Formats event name for display (e.g. USER_UPDATE → Edit User).
 */
function formatEventName(name) {
  if (!name) return "—";
  const map = {
    USER_CREATE: "Create User",
    USER_UPDATE: "Edit User",
    USER_DELETE: "Delete User",
    USER_ACTIVATE: "Activate User",
    LOGIN_SUCCESS: "Login",
    LOGIN_FAILED: "Login Attempt",
    LOGOUT: "Logout",
    PASSWORD_CHANGE: "Password Change",
    PASSWORD_RESET: "Password Reset",
    TOKEN_REFRESH: "Token Refresh",
  };
  return map[name.toUpperCase()] || name.replace(/_/g, " ");
}

/**
 * Renders the changes between old and new values in a compact diff.
 */
function ChangeDiff({ oldValues, newValues }) {
  if (!oldValues && !newValues) return <span className="diff-empty">No changes recorded</span>;

  const allKeys = new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ]);

  // Filter out internal/sensitive fields
  const HIDDEN_FIELDS = ["id", "must_change_password", "temp_expires_at"];
  const changedKeys = [...allKeys].filter((k) => {
    if (HIDDEN_FIELDS.includes(k)) return false;
    const oldVal = oldValues?.[k];
    const newVal = newValues?.[k];
    return JSON.stringify(oldVal) !== JSON.stringify(newVal);
  });

  if (changedKeys.length === 0) return <span className="diff-empty">No visible changes</span>;

  return (
    <div className="changes-diff">
      {changedKeys.map((key) => (
        <div key={key} className="diff-row">
          <span className="diff-field">{key.replace(/_/g, " ")}:</span>
          {oldValues?.[key] !== undefined && (
            <span className="diff-old">{String(oldValues[key])}</span>
          )}
          <span className="diff-arrow">→</span>
          {newValues?.[key] !== undefined && (
            <span className="diff-new">{String(newValues[key])}</span>
          )}
        </div>
      ))}
    </div>
  );
}

const AuditLogsTable = ({ logs, page, totalPages, onPageChange }) => {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (!logs || logs.length === 0) {
    return (
      <div className="table-container">
        <table className="accounts-table">
          <thead>
            <tr>
              <th>USER</th>
              <th>EVENT</th>
              <th>DATE</th>
              <th>TIME</th>
              <th>MODULE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "#888" }}>
                No audit logs found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="accounts-table audit-table">
        <thead>
          <tr>
            <th>USER</th>
            <th>EVENT</th>
            <th>DATE</th>
            <th>TIME</th>
            <th>MODULE</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const { date, time } = formatTimestamp(log.createdAt);
            const statusClass = (log.eventStatus || "").toLowerCase();
            const isExpanded = expandedId === log.id;
            const hasDetails = log.oldValues || log.newValues;

            return (
              <>
                <tr
                  key={log.id}
                  className={`audit-row ${hasDetails ? "expandable" : ""} ${isExpanded ? "expanded" : ""}`}
                  onClick={() => hasDetails && toggleExpand(log.id)}
                  title={hasDetails ? "Click to view changes" : undefined}
                >
                  <td>{getActorDisplay(log.actor)}</td>
                  <td>{formatEventName(log.eventName)}</td>
                  <td>{date}</td>
                  <td>{time}</td>
                  <td>
                    <span className={`module-badge module-${getEventModule(log.eventName).toLowerCase()}`}>
                      {getEventModule(log.eventName)}
                    </span>
                  </td>
                  <td>
                    <span className={`status ${statusClass}`}>
                      {log.eventStatus || "—"}
                    </span>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${log.id}-details`} className="audit-detail-row">
                    <td colSpan={6}>
                      <div className="audit-detail-content">
                        <div className="audit-detail-meta">
                          {log.actorIp && (
                            <span className="detail-chip">
                              <strong>IP:</strong> {log.actorIp}
                            </span>
                          )}
                          {log.entityType && (
                            <span className="detail-chip">
                              <strong>Entity:</strong> {log.entityType}
                              {log.entityIdUuid ? ` (${log.entityIdUuid.slice(0, 8)}…)` : ""}
                            </span>
                          )}
                        </div>
                        <ChangeDiff oldValues={log.oldValues} newValues={log.newValues} />
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="audit-pagination">
          <button
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            ← Prev
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="pagination-btn"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default AuditLogsTable;
