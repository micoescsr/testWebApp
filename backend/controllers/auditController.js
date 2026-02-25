// controllers/auditController.js
const auditRepository = require("../repositories/auditRepository");

/**
 * Map DB enum values to display-friendly labels for the frontend.
 */
const STATUS_DISPLAY = { OK: "SUCCESS", FAIL: "FAILED", DENY: "DENIED" };

/**
 * GET /api/audit/logs
 * Returns paginated audit logs. Superadmin only (enforced by route middleware).
 *
 * Query params:
 *   page   - 1-based page number (default 1)
 *   limit  - rows per page, max 100 (default 25)
 *   search - free-text filter
 *   status - 'SUCCESS' | 'FAILED' | 'DENIED'
 *   sort   - column name (default 'created_at')
 *   dir    - 'asc' | 'desc' (default 'desc')
 */
async function getAuditLogs(req, res) {
  try {
    const { page, limit, search, status, sort, dir } = req.query;

    const result = await auditRepository.getAuditLogs({
      page: Number(page) || 1,
      limit: Number(limit) || 25,
      search: typeof search === "string" ? search : "",
      status: typeof status === "string" ? status : "",
      sortBy: typeof sort === "string" ? sort : "created_at",
      sortDir: typeof dir === "string" ? dir : "desc",
    });

    // Shape each row for the frontend
    const logs = result.data.map((row) => {
      const actor = row.profiles || {};
      return {
        id: row.audit_log_id,
        createdAt: row.created_at,
        eventName: row.event_name,
        eventStatus: STATUS_DISPLAY[row.event_status] || row.event_status,
        entityType: row.entity_type,
        entityIdUuid: row.entity_id_uuid,
        entityIdBigint: row.entity_id_bigint,
        oldValues: row.old_values,
        newValues: row.new_values,
        meta: row.meta,
        actorIp: row.actor_ip,
        userAgent: row.user_agent,
        actor: {
          id: actor.id || row.actor_profile_id,
          firstName: actor.first_name || null,
          lastName: actor.last_name || null,
          email: actor.email || null,
          username: actor.username || null,
        },
      };
    });

    return res.json({
      logs,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    console.error("[auditController] getAuditLogs error:", err);
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
}

module.exports = {
  getAuditLogs,
};
