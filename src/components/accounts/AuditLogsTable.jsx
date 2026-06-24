// components/accounts/AuditLogsTable.jsx
import { useState, Fragment } from "react";
import SortHeader from "../history/SortHeader";

/** Header row. Event/Date/Status are server-sortable; the rest are plain. */
const AuditHeaderRow = ({ sortBy, sortDir, onSort }) => {
  const sortable = onSort
    ? { sortField: sortBy, sortDir, onSort }
    : null;
  return (
    <tr>
      <th>USER</th>
      {sortable ? (
        <SortHeader field="event_name" label="EVENT" {...sortable} />
      ) : (
        <th>EVENT</th>
      )}
      <th>TARGET</th>
      <th>DETAILS</th>
      {sortable ? (
        <SortHeader field="created_at" label="DATE" {...sortable} />
      ) : (
        <th>DATE</th>
      )}
      <th>TIME</th>
      <th>MODULE</th>
      {sortable ? (
        <SortHeader field="event_status" label="STATUS" {...sortable} />
      ) : (
        <th>STATUS</th>
      )}
    </tr>
  );
};

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
 * Maps event_name to one of the canonical module categories used for the badge:
 *   AUTH | ACCOUNTS | SCANS | DEVICE | DETECTION | SYSTEM, with a GENERAL fallback.
 * Supports both dot-notation (AUTH.LOGIN) and legacy underscore names. Kept aligned
 * with the backend `eventCategory` filter (auditRepository CATEGORY_EVENT_PATTERNS),
 * so the visible pill and the category filter agree.
 */
function getEventModule(eventName) {
  if (!eventName) return "GENERAL";
  const upper = eventName.toUpperCase();
  const prefix = upper.includes(".") ? upper.split(".")[0] : upper;

  // Exact dot-notation prefix match (fast path)
  const PREFIX_MAP = {
    AUTH: "AUTH",
    AUTHORIZATION: "AUTH",
    USER: "ACCOUNTS",
    SCAN: "SCANS",
    DETECTION: "DETECTION",
    DEVICE: "DEVICE",
    PORTAL: "DEVICE",
    EXPORT: "SYSTEM",
    ARCHIVE: "SYSTEM",
    RISK: "SYSTEM",
    NETWORK: "SYSTEM",
  };
  if (PREFIX_MAP[prefix]) return PREFIX_MAP[prefix];

  // Legacy underscore names (backwards compat)
  if (upper.includes("LOGIN") || upper.includes("LOGOUT") || upper.includes("AUTH") || upper.includes("REFRESH") || upper.includes("PASSWORD") || upper.includes("TEMP_EXPIRED")) return "AUTH";
  if (upper.includes("USER") || upper.includes("PROFILE") || upper.includes("ACTIVATE") || upper.includes("DEACTIVATE")) return "ACCOUNTS";
  if (upper.includes("SCAN")) return "SCANS";
  if (upper.includes("DETECTION")) return "DETECTION";
  if (upper.includes("DEVICE") || upper.includes("PORTAL")) return "DEVICE";
  if (upper.includes("EXPORT") || upper.includes("ARCHIVE") || upper.includes("RISK") || upper.includes("NETWORK")) return "SYSTEM";
  return "GENERAL";
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

// Sensitive keys that must never be surfaced in Target/Details/metadata.
const SENSITIVE_KEYS = [
  "password", "temp_password", "token", "access_token", "refresh_token",
  "secret", "credential", "otp", "totp", "mfa_secret", "session", "session_id",
  "cookie", "authorization", "auth_key", "hash", "salt", "private_key", "api_key",
];

const isSensitiveKey = (k) =>
  SENSITIVE_KEYS.some((s) => String(k).toLowerCase().includes(s));

// Internal/noise keys not useful for audit reading.
const NOISE_KEYS = [
  "id", "must_change_password", "temp_expires_at", "created_at", "updated_at",
];

// Concrete entity object types whose id is a legitimate "target" reference.
// Excludes module-ish entity types (AUTH, AUTHORIZATION) so we never render a
// module/category + id as a fake target (e.g. the old "AUTH 7edc6428…" bug).
const OBJECT_ENTITY_TYPES = ["USER", "PROFILE", "ACCOUNT", "NETWORK", "SCAN", "DEVICE", "AP", "PORTAL"];

const titleCase = (s) =>
  String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase();

/**
 * getAuditTarget(log) — the actual affected entity/object, strictly from stored
 * fields. Never derived from module/category. Returns null when no reliable
 * source-backed target exists (caller shows a muted dash / "No target").
 */
function getAuditTarget(log) {
  const { oldValues, newValues, meta, entityType, entityIdUuid, entityIdBigint } = log;
  const vals = newValues || oldValues || {};
  const m = meta || {};

  // Explicit, source-provided target/identity fields.
  if (m.target) return String(m.target);
  if (vals.username) return vals.username;
  if (vals.email) return vals.email;
  if (vals.first_name || vals.last_name) {
    return `${vals.first_name || ""} ${vals.last_name || ""}`.trim();
  }
  if (m.ssid) return String(m.ssid);
  if (m.bssid) return String(m.bssid);
  if (m.network_id != null) return `Network #${m.network_id}`;
  if (m.scan_id != null) return `Scan #${m.scan_id}`;
  if (m.device_id != null) return `Device ${m.device_id}`;

  // Concrete entity object + id (NOT a module/category). e.g. "User a1b2c3d4…".
  const et = (entityType || "").toUpperCase();
  if (OBJECT_ENTITY_TYPES.includes(et)) {
    if (entityIdBigint != null) return `${titleCase(et)} #${entityIdBigint}`;
    if (entityIdUuid) return `${titleCase(et)} ${String(entityIdUuid).slice(0, 8)}…`;
  }
  return null;
}

/**
 * getAuditDetails(log) — a one-line summary built only from stored source fields
 * (meta description/message/reason/error and old/new value changes). Never
 * generated from the event name. Returns null when no source detail exists
 * (caller shows "No details").
 */
function getAuditDetails(log) {
  const { oldValues, newValues, meta } = log;
  const m = meta || {};

  // Explicit free-text source fields.
  const text = m.description || m.details || m.message || m.reason || m.error;
  if (text) return String(text);

  // Source-stored counters.
  if (m.rows_exported != null) return `${m.rows_exported} rows exported`;
  if (m.rows_archived != null) return `${m.rows_archived} rows archived`;
  if (m.anonymized === true) return "Profile anonymized";

  // Actual field changes captured in old/new value snapshots.
  const changes = diffChangedKeys(oldValues, newValues);
  if (changes.length === 0) return null;
  if (changes.length <= 2) {
    return changes
      .map((k) => `${k.replace(/_/g, " ")}: ${oldValues[k] ?? "—"} → ${newValues[k] ?? "—"}`)
      .join(", ");
  }
  return `${changes.length} fields changed`;
}

/** Keys whose value changed between old/new, excluding noise + sensitive keys. */
function diffChangedKeys(oldValues, newValues) {
  if (!oldValues || !newValues) return [];
  return Object.keys(newValues).filter((k) => {
    if (NOISE_KEYS.includes(k) || isSensitiveKey(k)) return false;
    return JSON.stringify(oldValues[k]) !== JSON.stringify(newValues[k]);
  });
}

/** Flatten safe metadata into displayable key/value pairs. */
function formatAuditMetadata(log) {
  const meta = log?.meta;
  if (!meta || typeof meta !== "object") return [];
  return Object.entries(meta)
    .filter(([k, v]) => !isSensitiveKey(k) && v != null && typeof v !== "object")
    .map(([k, v]) => [k.replace(/_/g, " "), String(v)]);
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
  const changedKeys = [...allKeys].filter((k) => {
    if (NOISE_KEYS.includes(k) || isSensitiveKey(k)) return false;
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

/**
 * Expanded detail panel for a single audit row — a labelled summary grid plus
 * a field-change diff, safe metadata key/values, and an optional collapsible
 * raw-metadata section. Sensitive keys are stripped upstream.
 */
function AuditDetailPanel({ log, module, target, summary, date, time }) {
  const metaPairs = formatAuditMetadata(log);
  const hasDiff = log.oldValues || log.newValues;

  const rows = [
    ["Event", formatEventName(log.eventName)],
    ["Actor", getActorDisplay(log.actor)],
    ["Status", log.eventStatus || "—"],
    ["Module", module],
    ["Date & Time", `${date} ${time}`.trim()],
    ["Target", target || "No target"],
    ["Details", summary || "No details"],
  ];

  if (log.actorIp) rows.push(["Actor IP", log.actorIp]);
  if (log.entityType) {
    const ref = log.entityIdUuid
      ? ` (${String(log.entityIdUuid).slice(0, 8)}…)`
      : log.entityIdBigint != null
        ? ` (#${log.entityIdBigint})`
        : "";
    rows.push(["Entity", `${log.entityType}${ref}`]);
  }
  if (log.requestId) rows.push(["Request ID", log.requestId]);

  return (
    <div className="audit-detail-content">
      <dl className="audit-detail-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="audit-detail-item">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {hasDiff && (
        <div className="audit-detail-section">
          <p className="audit-detail-section-title">Changes</p>
          <ChangeDiff oldValues={log.oldValues} newValues={log.newValues} />
        </div>
      )}

      {metaPairs.length > 0 && (
        <div className="audit-detail-section">
          <p className="audit-detail-section-title">Metadata</p>
          <dl className="audit-detail-grid">
            {metaPairs.map(([k, v]) => (
              <div key={k} className="audit-detail-item">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {log.meta && typeof log.meta === "object" && (
        <details className="audit-raw-meta">
          <summary>Raw metadata</summary>
          <pre>{JSON.stringify(redactObject(log.meta), null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

/** Deep-ish redaction of sensitive keys for the raw-metadata view. */
function redactObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = isSensitiveKey(k) ? "[redacted]" : (typeof v === "object" ? redactObject(v) : v);
  }
  return out;
}

const AuditLogsTable = ({
  logs,
  page,
  totalPages,
  onPageChange,
  isFetching = false,
  sortBy,
  sortDir,
  onSort,
  filtersActive = false,
}) => {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const emptyMessage = filtersActive
    ? "No audit log records match the selected filters."
    : "No audit log records found.";

  if (!logs || logs.length === 0) {
    return (
      <div className="table-container">
        <table className="accounts-table">
          <thead>
            <AuditHeaderRow sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} className="history-empty-cell">
                {emptyMessage}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={`table-container ${isFetching ? "is-fetching" : ""}`}>
      {/* Subtle overlay during page/filter refetch — rows stay visible underneath */}
      {isFetching && (
        <div className="table-loading-overlay" aria-hidden="true">
          <span className="table-loading-pill">Updating…</span>
        </div>
      )}

      <table className="accounts-table audit-table">
        <thead>
          <AuditHeaderRow sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        </thead>
        <tbody>
          {logs.map((log) => {
            const { date, time } = formatTimestamp(log.createdAt);
            const statusClass = (log.eventStatus || "").toLowerCase();
            const isExpanded = expandedId === log.id;
            const module = getEventModule(log.eventName);
            const target = getAuditTarget(log);
            const summary = getAuditDetails(log);

            return (
              <Fragment key={log.id}>
                <tr
                  className={`audit-row expandable ${isExpanded ? "expanded" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpand(log.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(log.id);
                    }
                  }}
                >
                  <td>{getActorDisplay(log.actor)}</td>
                  <td>
                    <span className="audit-event-cell">
                      <span className={`audit-caret ${isExpanded ? "open" : ""}`} aria-hidden="true">▸</span>
                      {formatEventName(log.eventName)}
                    </span>
                  </td>
                  <td className={target ? "audit-target" : "audit-muted"}>
                    {target || "—"}
                  </td>
                  <td className={summary ? "audit-details-cell" : "audit-muted"} title={summary || undefined}>
                    {summary || "No details"}
                  </td>
                  <td>{date}</td>
                  <td>{time}</td>
                  <td>
                    <span className={`module-badge module-${module.toLowerCase()}`}>
                      {module}
                    </span>
                  </td>
                  <td>
                    <span className={`status ${statusClass}`}>
                      {log.eventStatus || "—"}
                    </span>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="audit-detail-row">
                    <td colSpan={8}>
                      <AuditDetailPanel
                        log={log}
                        module={module}
                        target={target}
                        summary={summary}
                        date={date}
                        time={time}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Pagination — buttons stay disabled while a page is in flight so rapid
          clicks can't queue overlapping requests. */}
      {totalPages > 1 && (
        <div className="audit-pagination">
          <button
            className="pagination-btn"
            disabled={page <= 1 || isFetching}
            onClick={() => onPageChange(page - 1)}
          >
            ← Prev
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="pagination-btn"
            disabled={page >= totalPages || isFetching}
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
