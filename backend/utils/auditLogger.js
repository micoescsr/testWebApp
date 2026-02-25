// utils/auditLogger.js
//
// Convenience helper to insert audit log entries from anywhere in the backend.
// Wraps auditRepository.insertAuditLog with fail-safe error handling so that
// a failed audit write never breaks the primary operation.

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
 * Log an audit event. Fire-and-forget safe — errors are caught and logged,
 * never thrown back to the caller.
 *
 * @param {Object} params
 * @param {Object} params.req            - Express request (used for IP + user-agent)
 * @param {string} params.actorId        - UUID of user performing the action
 * @param {string} params.eventName      - e.g. 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'LOGIN'
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

    await auditRepository.insertAuditLog({
      actor_profile_id: actorId,
      event_name: eventName,
      event_status: dbStatus,
      entity_type: entityType,
      entity_id_uuid: safeEntityIdUuid,
      entity_id_bigint: entityIdBigint,
      old_values: oldValues,
      new_values: newValues,
      meta,
      actor_ip: actorIp,
      user_agent: userAgent,
    });
  } catch (err) {
    // Never throw — audit failures must not break primary operations
    console.error("[auditLogger] Failed to write audit log:", err.message);
  }
}

module.exports = { logAuditEvent };
