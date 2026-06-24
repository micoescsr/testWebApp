// controllers/auditController.js
const auditRepository = require("../repositories/auditRepository");
const { logAuditEvent } = require("../utils/auditLogger");
const { formatCSV } = require("../utils/exportFormatters");

/**
 * Map DB enum values to display-friendly labels for the frontend.
 */
const STATUS_DISPLAY = { OK: "SUCCESS", FAIL: "FAILED", DENY: "DENIED" };

/**
 * Shape a raw DB row into the frontend audit log object.
 */
function shapeLogRow(row) {
  const actor = row.profiles || {};
  return {
    id: row.audit_log_id,
    createdAt: row.created_at,
    requestId: row.request_id || null,
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
}

/**
 * GET /api/audit/logs
 * Returns paginated audit logs. Superadmin only (enforced by route middleware).
 *
 * Query params:
 *   page      - 1-based page number (default 1)
 *   limit     - rows per page, max 100 (default 25)
 *   search    - free-text filter
 *   status    - 'SUCCESS' | 'FAILED' | 'DENIED'
 *   sort      - column name (default 'created_at')
 *   dir       - 'asc' | 'desc' (default 'desc')
 *   startDate - ISO date (YYYY-MM-DD) inclusive lower bound
 *   endDate   - ISO date (YYYY-MM-DD) inclusive upper bound
 */
async function getAuditLogs(req, res) {
  try {
    const { page, limit, search, status, sort, dir, startDate, endDate, eventCategory } = req.query;

    const result = await auditRepository.getAuditLogs({
      page: Number(page) || 1,
      limit: Number(limit) || 25,
      search: typeof search === "string" ? search : "",
      status: typeof status === "string" ? status : "",
      sortBy: typeof sort === "string" ? sort : "created_at",
      sortDir: typeof dir === "string" ? dir : "desc",
      startDate: typeof startDate === "string" ? startDate : "",
      endDate: typeof endDate === "string" ? endDate : "",
      eventCategory: typeof eventCategory === "string" ? eventCategory : "",
    });

    const logs = result.data.map(shapeLogRow);

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

/**
 * GET /api/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD&status=
 * Exports audit logs as a CSV file download. Superadmin only.
 *
 * Logs an EXPORT.EXECUTED event after successful export.
 */
async function exportAuditLogs(req, res) {
  try {
    const { from: startDate, to: endDate, status } = req.query;

    const rows = await auditRepository.getAuditLogsForExport({
      startDate: typeof startDate === "string" ? startDate : "",
      endDate: typeof endDate === "string" ? endDate : "",
      status: typeof status === "string" ? status : "",
    });

    // Define CSV columns
    const headers = [
      "created_at",
      "event_name",
      "event_status",
      "entity_type",
      "actor_email",
      "actor_username",
      "actor_ip",
      "entity_id_uuid",
      "entity_id_bigint",
      "request_id",
      "user_agent",
      "meta",
    ];

    // Flatten rows for CSV
    const csvRows = rows.map((row) => {
      const actor = row.profiles || {};
      return {
        created_at: row.created_at,
        event_name: row.event_name,
        event_status: STATUS_DISPLAY[row.event_status] || row.event_status,
        entity_type: row.entity_type,
        actor_email: actor.email || "",
        actor_username: actor.username || "",
        actor_ip: row.actor_ip || "",
        entity_id_uuid: row.entity_id_uuid || "",
        entity_id_bigint: row.entity_id_bigint != null ? String(row.entity_id_bigint) : "",
        request_id: row.request_id || "",
        user_agent: row.user_agent || "",
        meta: row.meta ? JSON.stringify(row.meta) : "",
      };
    });

    const csv = formatCSV(headers, csvRows);

    // Audit the export itself
    await logAuditEvent({
      req,
      actorId: req.user?.id,
      eventName: "EXPORT.EXECUTED",
      eventStatus: "SUCCESS",
      entityType: "AUDIT",
      meta: {
        rows_exported: csvRows.length,
        start_date: startDate || null,
        end_date: endDate || null,
        status_filter: status || null,
      },
    }).catch(() => {});

    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error("[auditController] exportAuditLogs error:", err);
    return res.status(500).json({ error: "Failed to export audit logs" });
  }
}

/**
 * POST /api/audit/archive
 * Moves audit logs older than 7 days into the archive table.
 * Superadmin only. Logs an ARCHIVE.EXECUTED event.
 */
async function archiveAuditLogs(req, res) {
  try {
    const retentionDays = 7;
    const result = await auditRepository.archiveOldLogs(retentionDays);

    // Audit the archive operation itself
    await logAuditEvent({
      req,
      actorId: req.user?.id,
      eventName: "ARCHIVE.EXECUTED",
      eventStatus: "SUCCESS",
      entityType: "AUDIT",
      meta: {
        retention_days: retentionDays,
        rows_archived: result.archived,
      },
    }).catch(() => {});

    return res.json({
      message: `Archived ${result.archived} log(s) older than ${retentionDays} days`,
      archived: result.archived,
    });
  } catch (err) {
    console.error("[auditController] archiveAuditLogs error:", err);
    return res.status(500).json({ error: "Failed to archive audit logs" });
  }
}

module.exports = {
  getAuditLogs,
  exportAuditLogs,
  archiveAuditLogs,
};
