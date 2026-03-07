// components/accounts/AuditLogsTable.jsx
import { useState, useCallback } from "react";

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
 * Supports both dot-notation (AUTH.LOGIN) and legacy underscore names.
 */
function getEventModule(eventName) {
  if (!eventName) return "—";
  const upper = eventName.toUpperCase();

  // Dot-notation: module is the prefix before the first dot
  if (upper.includes(".")) {
    const module = upper.split(".")[0];
    const moduleMap = {
      AUTH: "AUTH",
      USER: "ACCOUNTS",
      SCAN: "SCANS",
      DETECTION: "DETECTION",
      DEVICE: "DEVICE",
      PORTAL: "PORTAL",
      AUTHORIZATION: "AUTH",
      EXPORT: "SYSTEM",
      ARCHIVE: "SYSTEM",
      RISK: "SYSTEM",
    };
    return moduleMap[module] || module;
  }

  // Legacy underscore names (backwards compat)
  if (upper.includes("LOGIN") || upper.includes("LOGOUT") || upper.includes("AUTH") || upper.includes("REFRESH") || upper.includes("TEMP_EXPIRED")) return "AUTH";
  if (upper.includes("USER") || upper.includes("PROFILE") || upper.includes("ACTIVATE") || upper.includes("DEACTIVATE")) return "ACCOUNTS";
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
 * Formats event name for display.
 * Supports both dot-notation (AUTH.LOGIN) and legacy underscore names.
 */
function formatEventName(name) {
  if (!name) return "—";

  // Comprehensive map covering both dot-notation and legacy names
  const map = {
    // Dot-notation (new standard)
    "AUTH.LOGIN": "Login",
    "AUTH.LOGIN_FAILED": "Login Attempt",
    "AUTH.LOGOUT": "Logout",
    "AUTH.REFRESH": "Token Refresh",
    "AUTH.TEMP_EXPIRED": "Temp PW Expired",
    "USER.CREATE": "Create User",
    "USER.UPDATE": "Edit User",
    "USER.DELETE": "Delete User",
    "USER.ACTIVATE": "Activate User",
    "USER.DEACTIVATE": "Deactivate User",
    "USER.RESET_SLOT": "Reset Slot",
    "USER.PASSWORD_CHANGE": "Password Change",
    "USER.PASSWORD_RESET": "Password Reset",
    "SCAN.START": "Scan Started",
    "SCAN.SAVE": "Scan Saved",
    "SCAN.COMPLETE": "Scan Complete",
    "SCAN.FAILED": "Scan Failed",
    "DETECTION.START": "Detection Started",
    "DETECTION.STOP": "Detection Stopped",
    "DETECTION.FAILED": "Detection Failed",
    "DETECTION.SWITCH_TARGET": "Detection Target Switched",
    "DEVICE.AP_ENABLE": "AP Enabled",
    "DEVICE.AP_DISABLE": "AP Disabled",
    "DEVICE.CONFIG_UPDATE": "Device Config",
    "PORTAL.ANNOUNCEMENT_PUBLISH": "Announcement Published",
    "PORTAL.TERMS_PUBLISH": "Terms Published",
    "PORTAL.TIPS_UPDATE": "Tips Updated",
    "PORTAL.SYNC": "Portal Synced",
    "AUTHORIZATION.DENIED": "Access Denied",
    "EXPORT.EXECUTED": "Audit Exported",
    "ARCHIVE.EXECUTED": "Audit Archived",
    "RISK.UPDATE": "Risk Updated",
    // Legacy underscore names (backwards compat)
    USER_CREATE: "Create User",
    USER_UPDATE: "Edit User",
    USER_DELETE: "Delete User",
    USER_ACTIVATE: "Activate User",
    USER_DEACTIVATE: "Deactivate User",
    USER_RESET_SLOT: "Reset Slot",
    LOGIN_SUCCESS: "Login",
    LOGIN_FAILED: "Login Attempt",
    LOGIN_TEMP_EXPIRED: "Temp PW Expired",
    LOGOUT: "Logout",
    PASSWORD_CHANGE: "Password Change",
    PASSWORD_RESET: "Password Reset",
    TOKEN_REFRESH: "Token Refresh",
  };

  return map[name.toUpperCase()] || name.replace(/[_.]/g, " ");
}

/**
 * Generates a one-line summary of what changed for inline display.
 */
function getChangeSummary(log) {
  const { oldValues, newValues, meta, eventName } = log;
  const upper = (eventName || "").toUpperCase();

  // Special events (support both dot-notation and legacy names)
  if (upper === "USER_DEACTIVATE" || upper === "USER.DEACTIVATE") {
    return meta?.anonymized ? "Archived & anonymized" : "Deactivated";
  }
  if (upper === "USER_ACTIVATE" || upper === "USER.ACTIVATE") {
    return "Activated with temp password";
  }
  if (upper.includes("LOGIN") || upper.startsWith("AUTH.")) return null;
  if (upper.includes("SCAN") || upper.startsWith("SCAN.")) return null;
  if (upper.startsWith("DETECTION.")) return null;

  // For edits, show changed fields
  if (oldValues && newValues) {
    const HIDDEN = ["id", "must_change_password", "temp_expires_at", "created_at", "updated_at"];
    const changes = Object.keys(newValues).filter(k => {
      if (HIDDEN.includes(k)) return false;
      return JSON.stringify(oldValues[k]) !== JSON.stringify(newValues[k]);
    });
    if (changes.length === 0) return null;
    if (changes.length <= 2) {
      return changes.map(k => {
        const label = k.replace(/_/g, " ");
        return `${label}: ${oldValues[k] || "—"} → ${newValues[k] || "—"}`;
      }).join(", ");
    }
    return `${changes.length} fields changed`;
  }
  return null;
}

/**
 * Gets the target entity display (who/what was affected).
 */
function getTargetDisplay(log) {
  const { oldValues, newValues, entityType, meta } = log;
  // Try to get target from old or new values
  const vals = oldValues || newValues;
  if (vals) {
    if (vals.username) return vals.username;
    if (vals.email) return vals.email;
    if (vals.first_name && vals.last_name) return `${vals.first_name} ${vals.last_name}`;
  }
  // For deactivated users, check meta
  if (meta?.reason) return null;
  return null;
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

const AuditLogsTable = ({
  logs,
  page,
  totalPages,
  onPageChange,
  currentUser,
  fromDate,
  toDate,
  isExporting,
  exportError,
  onExport,
}) => {
  const [expandedId, setExpandedId] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportValidationError, setExportValidationError] = useState("");

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const isSuperadmin = currentUser?.role === "superadmin";

  const handleExportClick = useCallback(() => {
    setExportFrom("");
    setExportTo("");
    setExportValidationError("");
    setShowExportModal(true);
  }, []);

  const confirmExport = useCallback(async () => {
    if (!exportFrom || !exportTo) {
      setExportValidationError("Please select both a start and end date.");
      return;
    }
    if (new Date(exportFrom) > new Date(exportTo)) {
      setExportValidationError("Start date cannot be after end date.");
      return;
    }
    setExportValidationError("");
    setShowExportModal(false);
    if (onExport) {
      await onExport(exportFrom, exportTo);
    }
  }, [onExport, exportFrom, exportTo]);

  const cancelExport = useCallback(() => {
    setShowExportModal(false);
    setExportValidationError("");
  }, []);

  if (!logs || logs.length === 0) {
    return (
      <div className="table-container">
        {/* Export bar — shown even with no results so superadmin can still export by date range */}
        {isSuperadmin && (
          <div className="export-bar">
            <button
              className="export-csv-btn"
              disabled={isExporting}
              onClick={handleExportClick}
              title={isExporting ? "Export in progress…" : "Export audit logs as CSV"}
            >
              {isExporting ? "Exporting…" : "Export CSV"}
            </button>
            {exportError && <span className="export-error">{exportError}</span>}
          </div>
        )}

        {/* Export date range modal */}
        {showExportModal && (
          <div className="export-confirm-overlay" onClick={cancelExport}>
            <div className="export-confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <p className="export-confirm-title">Export Audit Logs</p>
              <p className="export-confirm-text">
                Select a date range for the audit logs you want to export.
              </p>
              <div className="export-date-fields">
                <label className="export-date-label">
                  From
                  <input
                    type="date"
                    className="date-input"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                  />
                </label>
                <label className="export-date-label">
                  To
                  <input
                    type="date"
                    className="date-input"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                  />
                </label>
              </div>
              {exportValidationError && (
                <p className="export-error" style={{ marginTop: 8 }}>{exportValidationError}</p>
              )}
              <span className="export-confirm-note">This action will be recorded in the audit log.</span>
              <div className="export-confirm-actions">
                <button className="cancel-btn" onClick={cancelExport}>Cancel</button>
                <button className="confirm-btn" onClick={confirmExport} disabled={isExporting}>
                  {isExporting ? "Exporting…" : "Export"}
                </button>
              </div>
            </div>
          </div>
        )}

        <table className="accounts-table">
          <thead>
            <tr>
              <th>USER</th>
              <th>EVENT</th>
              <th>TARGET</th>
              <th>DETAILS</th>
              <th>DATE</th>
              <th>TIME</th>
              <th>MODULE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "#888" }}>
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
      {/* Export bar — superadmin only */}
      {isSuperadmin && (
        <div className="export-bar">
          <button
            className="export-csv-btn"
            disabled={isExporting}
            onClick={handleExportClick}
            title={isExporting ? "Export in progress…" : "Export audit logs as CSV"}
          >
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
          {exportError && <span className="export-error">{exportError}</span>}
        </div>
      )}

      {/* Export date range modal */}
      {showExportModal && (
        <div className="export-confirm-overlay" onClick={cancelExport}>
          <div className="export-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="export-confirm-title">Export Audit Logs</p>
            <p className="export-confirm-text">
              Select a date range for the audit logs you want to export.
            </p>
            <div className="export-date-fields">
              <label className="export-date-label">
                From
                <input
                  type="date"
                  className="date-input"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                />
              </label>
              <label className="export-date-label">
                To
                <input
                  type="date"
                  className="date-input"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                />
              </label>
            </div>
            {exportValidationError && (
              <p className="export-error" style={{ marginTop: 8 }}>{exportValidationError}</p>
            )}
            <span className="export-confirm-note">This action will be recorded in the audit log.</span>
            <div className="export-confirm-actions">
              <button className="cancel-btn" onClick={cancelExport}>Cancel</button>
              <button className="confirm-btn" onClick={confirmExport} disabled={isExporting}>
                {isExporting ? "Exporting…" : "Export"}
              </button>
            </div>
          </div>
        </div>
      )}

      <table className="accounts-table audit-table">
        <thead>
          <tr>
            <th>USER</th>
            <th>EVENT</th>
            <th>TARGET</th>
            <th>DETAILS</th>
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
            const target = getTargetDisplay(log);
            const summary = getChangeSummary(log);

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
                  <td style={{ color: target ? '#333' : '#aaa', fontSize: '0.85em' }}>
                    {target || '—'}
                  </td>
                  <td style={{ fontSize: '0.8em', color: '#666', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={summary || undefined}
                  >
                    {summary || '—'}
                  </td>
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
                    <td colSpan={8}>
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
