// utils/auditLogger.js
//
// Convenience helper to insert audit log entries from anywhere in the backend.
// Wraps auditRepository.insertAuditLog with fail-safe error handling so that
// a failed audit write never breaks the primary operation.
//
// EVENT NAMING CONVENTION (structured dot-notation):
//   AUTH.LOGIN, AUTH.LOGOUT, AUTH.REFRESH, AUTH.TEMP_EXPIRED
//   USER.CREATE, USER.UPDATE, USER.DELETE, USER.ACTIVATE, USER.DEACTIVATE
//   SCAN.START, SCAN.SAVE, SCAN.COMPLETE, SCAN.FAILED
//   DETECTION.START, DETECTION.STOP, DETECTION.FAILED
//   PORTAL.ANNOUNCEMENT_PUBLISH, PORTAL.TERMS_PUBLISH, PORTAL.TIPS_UPDATE, PORTAL.SYNC
//   DEVICE.AP_ENABLE, DEVICE.AP_DISABLE, DEVICE.CONFIG_UPDATE
//   AUTHORIZATION.DENIED
//   ARCHIVE.EXECUTED, EXPORT.EXECUTED

const auditRepository = require("../repositories/auditRepository");

/**
 * Map caller-friendly status labels to the DB enum `audit_event_status`.
 *   DB enum values: OK | FAIL | DENY
 */
const STATUS_MAP = {
  SUCCESS: "OK",
  OK: "OK",
  FAILED: "FAIL",
  FAIL: "FAIL",
  DENIED: "DENY",
  DENY: "DENY",
};

/**
 * Backwards-compatible migration map: old underscore names → new dot-notation.
 * Old names still work but are transparently converted before storage.
 * New callers should use dot-notation directly.
 */
const EVENT_NAME_MIGRATION = {
  // Auth
  LOGIN_SUCCESS:        "AUTH.LOGIN",
  LOGIN_FAILED:         "AUTH.LOGIN_FAILED",
  LOGIN_TEMP_EXPIRED:   "AUTH.TEMP_EXPIRED",
  LOGOUT:               "AUTH.LOGOUT",
  TOKEN_REFRESH:        "AUTH.REFRESH",
  // User lifecycle
  USER_CREATE:          "USER.CREATE",
  USER_UPDATE:          "USER.UPDATE",
  USER_DELETE:          "USER.DELETE",
  USER_ACTIVATE:        "USER.ACTIVATE",
  USER_DEACTIVATE:      "USER.DEACTIVATE",
  USER_RESET_SLOT:      "USER.RESET_SLOT",
  PASSWORD_CHANGE:      "USER.PASSWORD_CHANGE",
  PASSWORD_RESET:       "USER.PASSWORD_RESET",
  // Scanning
  SCAN_TRIGGER:         "SCAN.START",
  SCAN_START:           "SCAN.START",
  SCAN_SAVE:            "SCAN.SAVE",
  SCAN_COMPLETE:        "SCAN.COMPLETE",
  SCAN_FAILED:          "SCAN.FAILED",
  // Detection
  DETECTION_START:      "DETECTION.START",
  DETECTION_STOP:       "DETECTION.STOP",
  DETECTION_FAILED:     "DETECTION.FAILED",
  STOP_DETECTION:       "DETECTION.STOP",
  // Device management
  AP_ENABLE_REQUEST:    "DEVICE.AP_ENABLE",
  AP_DISABLE_REQUEST:   "DEVICE.AP_DISABLE",
  // Portal
  PORTAL_PATCH:         "PORTAL.SYNC",
  PORTAL_UPDATE:        "PORTAL.UPDATE",
  // Risk
  RISK_UPDATE:          "RISK.UPDATE",
};

/**
 * Normalize event name: migrate old underscore names to dot-notation.
 * If the name is already in dot-notation or unknown, return as-is (uppercased).
 */
function normalizeEventName(name) {
  if (!name) return "UNKNOWN";
  const upper = name.toUpperCase().trim();
  return EVENT_NAME_MIGRATION[upper] || upper;
}

/**
 * Log an audit event. Fire-and-forget safe — errors are caught and logged,
 * never thrown back to the caller.
 *
 * @param {Object} params
 * @param {Object} params.req            - Express request (used for IP + user-agent + requestId)
 * @param {string} params.actorId        - UUID of user performing the action
 * @param {string} params.eventName      - e.g. 'AUTH.LOGIN', 'USER.CREATE' (dot-notation preferred)
 * @param {string} params.eventStatus    - 'SUCCESS'|'FAILED'|'DENIED' (auto-mapped to DB enum OK|FAIL|DENY)
 * @param {string} params.entityType     - e.g. 'USER', 'PROFILE', 'NETWORK', 'AUTH'
 * @param {string} [params.entityIdUuid] - target entity UUID
 * @param {number} [params.entityIdBigint] - target entity bigint ID
 * @param {Object} [params.oldValues]    - snapshot before change
 * @param {Object} [params.newValues]    - snapshot after change
 * @param {Object} [params.meta]         - extra context
 */
async function logAuditEvent({
  req,
  actorId,
  eventName,
  eventStatus,
  entityType,
  entityIdUuid = null,
  entityIdBigint = null,
  oldValues = null,
  newValues = null,
  meta = null,
}) {
  try {
    // Guard: actorId is required by FK — skip if missing
    if (!actorId) {
      console.warn("[auditLogger] Skipping audit log — no actorId provided");
      return;
    }

    // Map friendly status to DB enum
    const dbStatus = STATUS_MAP[eventStatus?.toUpperCase()] || "FAIL";

    // Normalize event name to dot-notation
    const normalizedName = normalizeEventName(eventName);

    // DB check constraint: at least one entity_id must be set.
    // Fall back to actorId when no explicit entity ID is given.
    const safeEntityIdUuid = entityIdUuid || actorId;

    // Extract IP — strip IPv6-mapped prefix (::ffff:) so Postgres inet accepts it
    const forwarded = req?.headers?.["x-forwarded-for"];
    let actorIp = forwarded
      ? String(forwarded).split(",")[0].trim()
      : req?.socket?.remoteAddress || null;
    if (actorIp) {
      actorIp = actorIp.replace(/^::ffff:/, "");
    }

    const userAgent = req?.headers?.["user-agent"] || null;

    // Pick up request_id from requestIdMiddleware (if available)
    const requestId = req?.requestId || null;

    await auditRepository.insertAuditLog({
      actor_profile_id: actorId,
      event_name: normalizedName,
      event_status: dbStatus,
      entity_type: entityType,
      entity_id_uuid: safeEntityIdUuid,
      entity_id_bigint: entityIdBigint,
      old_values: oldValues,
      new_values: newValues,
      meta,
      actor_ip: actorIp,
      user_agent: userAgent,
      request_id: requestId,
    });
  } catch (err) {
    // Never throw — audit failures must not break primary operations
    console.error("[auditLogger] Failed to write audit log:", err.message);
  }
}

module.exports = { logAuditEvent, normalizeEventName, EVENT_NAME_MIGRATION };
