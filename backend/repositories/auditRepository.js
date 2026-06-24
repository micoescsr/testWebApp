// repositories/auditRepository.js
const { supabaseClient } = require("../config/supabaseClient");

// ─── Shared: whitelist + status map ─────────────────────────────

const ALLOWED_SORT_COLS = ["created_at", "event_name", "event_status", "entity_type"];

const STATUS_FILTER_MAP = {
  SUCCESS: "OK", OK: "OK",
  FAILED: "FAIL", FAIL: "FAIL",
  DENIED: "DENY", DENY: "DENY",
};

// Event-category → event_name prefix patterns (ilike). Prefixes carry no dots
// so they're safe inside a PostgREST `.or()` string. Applied server-side, so the
// category filter spans every page, not just the loaded one. Keep these aligned
// with the frontend module-badge mapping (AuditLogsTable getEventModule).
const CATEGORY_EVENT_PATTERNS = {
  AUTH: ["AUTH%", "LOGIN%", "LOGOUT%", "TOKEN_REFRESH%", "PASSWORD%"],
  ACCOUNTS: ["USER%"],
  SCANS: ["SCAN%"],
  DEVICE: ["DEVICE%", "PORTAL%"],
  DETECTION: ["DETECTION%"],
  SYSTEM: ["EXPORT%", "ARCHIVE%", "RISK%", "NETWORK%"],
};

// Every classified prefix — used to compute the GENERAL ("uncategorized") set.
const ALL_CLASSIFIED_PATTERNS = Object.values(CATEGORY_EVENT_PATTERNS).flat();

/** Build the PostgREST `.or()` clause for an event category, or null if unknown. */
function categoryOrClause(eventCategory) {
  if (!eventCategory) return null;
  const patterns = CATEGORY_EVENT_PATTERNS[String(eventCategory).toUpperCase()];
  if (!patterns) return null;
  return patterns.map((p) => `event_name.ilike.${p}`).join(",");
}

/**
 * Apply the event-category filter to a query.
 * - Known category → OR of its prefix ilike patterns.
 * - GENERAL → NOT ilike for every classified prefix (events in no category).
 * - Unknown/empty → no-op.
 * Returns the (possibly modified) query.
 */
function applyCategoryFilter(query, eventCategory) {
  if (!eventCategory) return query;
  const cat = String(eventCategory).toUpperCase();
  if (cat === "GENERAL") {
    // Exclude anything matching a classified prefix → leaves only uncategorized.
    for (const pattern of ALL_CLASSIFIED_PATTERNS) {
      query = query.not("event_name", "ilike", pattern);
    }
    return query;
  }
  const clause = categoryOrClause(cat);
  return clause ? query.or(clause) : query;
}

// ─── SELECT columns used by both active + archive queries ───────
const AUDIT_COLUMNS = `
  audit_log_id,
  created_at,
  actor_profile_id,
  request_id,
  actor_ip,
  user_agent,
  event_name,
  event_status,
  entity_type,
  entity_id_uuid,
  entity_id_bigint,
  old_values,
  new_values,
  meta
`;

const AUDIT_COLUMNS_WITH_PROFILE = `
  ${AUDIT_COLUMNS},
  profiles!audit_logging_actor_profile_id_fkey (
    id,
    first_name,
    last_name,
    email,
    username
  )
`;

/**
 * Fetch audit logs with pagination, optional filtering, date range, and actor profile join.
 *
 * @param {Object}  opts
 * @param {number}  opts.page      - 1-based page number (default 1)
 * @param {number}  opts.limit     - rows per page, capped at 100 (default 25)
 * @param {string}  opts.search    - free-text search across event_name, entity_type
 * @param {string}  opts.status    - filter by event_status ('SUCCESS' | 'FAILED' | 'DENIED')
 * @param {string}  opts.sortBy    - column to sort ('created_at')
 * @param {string}  opts.sortDir   - 'asc' | 'desc' (default 'desc')
 * @param {string}  opts.startDate - ISO date string, inclusive lower bound
 * @param {string}  opts.endDate   - ISO date string, inclusive upper bound
 * @returns {{ data: Array, total: number, page: number, limit: number }}
 */
async function getAuditLogs({
  page = 1,
  limit = 25,
  search = "",
  status = "",
  sortBy = "created_at",
  sortDir = "desc",
  startDate = "",
  endDate = "",
  eventCategory = "",
} = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 25), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const safeSortBy = ALLOWED_SORT_COLS.includes(sortBy) ? sortBy : "created_at";
  const safeSortDir = sortDir === "asc" ? true : false;

  let query = supabaseClient
    .from("audit_logging")
    .select(AUDIT_COLUMNS_WITH_PROFILE, { count: "exact" })
    .order(safeSortBy, { ascending: safeSortDir })
    .range(offset, offset + safeLimit - 1);

  // Status filter
  if (status) {
    const dbVal = STATUS_FILTER_MAP[status.toUpperCase()];
    if (dbVal) query = query.eq("event_status", dbVal);
  }

  // Event-category filter (server-side prefix match — spans all pages)
  query = applyCategoryFilter(query, eventCategory);

  // Date range filter (parameterized — safe from injection)
  if (startDate) {
    query = query.gte("created_at", startDate);
  }
  if (endDate) {
    // Include the entire end date day
    query = query.lte("created_at", endDate + "T23:59:59.999Z");
  }

  // Free-text search
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`event_name.ilike.${term},entity_type.ilike.${term}`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[auditRepository] getAuditLogs error:", error);
    throw error;
  }

  return {
    data: data || [],
    total: count || 0,
    page: safePage,
    limit: safeLimit,
  };
}

/**
 * Fetch audit logs from the ARCHIVE table with the same filtering options.
 * Archive table has no FK join to profiles (profiles may have been purged).
 */
async function getArchivedAuditLogs({
  page = 1,
  limit = 25,
  search = "",
  status = "",
  sortBy = "created_at",
  sortDir = "desc",
  startDate = "",
  endDate = "",
} = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 25), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const safeSortBy = ALLOWED_SORT_COLS.includes(sortBy) ? sortBy : "created_at";
  const safeSortDir = sortDir === "asc" ? true : false;

  let query = supabaseClient
    .from("audit_logging_archive")
    .select(AUDIT_COLUMNS, { count: "exact" })
    .order(safeSortBy, { ascending: safeSortDir })
    .range(offset, offset + safeLimit - 1);

  if (status) {
    const dbVal = STATUS_FILTER_MAP[status.toUpperCase()];
    if (dbVal) query = query.eq("event_status", dbVal);
  }

  if (startDate) query = query.gte("created_at", startDate);
  if (endDate) query = query.lte("created_at", endDate + "T23:59:59.999Z");

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`event_name.ilike.${term},entity_type.ilike.${term}`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[auditRepository] getArchivedAuditLogs error:", error);
    throw error;
  }

  return {
    data: data || [],
    total: count || 0,
    page: safePage,
    limit: safeLimit,
  };
}

/**
 * Export audit logs (active table) for a date range — no pagination cap.
 * Returns up to 10,000 rows for CSV export.
 *
 * @param {Object} opts
 * @param {string} opts.startDate - ISO date string
 * @param {string} opts.endDate   - ISO date string
 * @param {string} opts.status    - optional status filter
 * @returns {Array} raw rows
 */
async function getAuditLogsForExport({
  startDate = "",
  endDate = "",
  status = "",
} = {}) {
  const MAX_EXPORT_ROWS = 10000;

  let query = supabaseClient
    .from("audit_logging")
    .select(AUDIT_COLUMNS_WITH_PROFILE)
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_ROWS);

  if (status) {
    const dbVal = STATUS_FILTER_MAP[status.toUpperCase()];
    if (dbVal) query = query.eq("event_status", dbVal);
  }

  if (startDate) query = query.gte("created_at", startDate);
  if (endDate) query = query.lte("created_at", endDate + "T23:59:59.999Z");

  const { data, error } = await query;

  if (error) {
    console.error("[auditRepository] getAuditLogsForExport error:", error);
    throw error;
  }

  return data || [];
}

/**
 * Archive audit logs older than the specified number of days.
 * Runs as an atomic two-step:
 *   1. INSERT into audit_logging_archive (rows older than cutoff)
 *   2. DELETE from audit_logging (same rows)
 *
 * Uses Supabase service role which bypasses RLS.
 *
 * @param {number} retentionDays - days to keep in active table (default 7)
 * @returns {{ archived: number }} count of archived rows
 */
async function archiveOldLogs(retentionDays = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffISO = cutoff.toISOString();

  // Step 1: Fetch rows to archive
  const { data: oldRows, error: fetchErr } = await supabaseClient
    .from("audit_logging")
    .select("*")
    .lt("created_at", cutoffISO)
    .order("created_at", { ascending: true })
    .limit(5000); // batch size to avoid timeouts

  if (fetchErr) {
    console.error("[auditRepository] archiveOldLogs fetch error:", fetchErr);
    throw fetchErr;
  }

  if (!oldRows || oldRows.length === 0) {
    return { archived: 0 };
  }

  // Step 2: Insert into archive
  // Strip the FK-joined 'profiles' field if present (archive table has no FK)
  const cleanRows = oldRows.map(({ profiles, ...row }) => row);

  const { error: insertErr } = await supabaseClient
    .from("audit_logging_archive")
    .insert(cleanRows);

  if (insertErr) {
    console.error("[auditRepository] archiveOldLogs insert error:", insertErr);
    throw insertErr;
  }

  // Step 3: Delete archived rows from active table
  const archivedIds = oldRows.map((r) => r.audit_log_id);

  const { error: deleteErr } = await supabaseClient
    .from("audit_logging")
    .delete()
    .in("audit_log_id", archivedIds);

  if (deleteErr) {
    console.error("[auditRepository] archiveOldLogs delete error:", deleteErr);
    throw deleteErr;
  }

  return { archived: archivedIds.length };
}

/**
 * Insert a new audit log entry.
 */
async function insertAuditLog(entry) {
  // Validate required fields
  const required = ["actor_profile_id", "event_name", "event_status", "entity_type"];
  for (const field of required) {
    if (!entry[field]) {
      throw new Error(`auditRepository.insertAuditLog: missing required field '${field}'`);
    }
  }

  // Validate event_status against DB enum: OK | FAIL | DENY
  if (!["OK", "FAIL", "DENY"].includes(entry.event_status)) {
    throw new Error(`auditRepository.insertAuditLog: invalid event_status '${entry.event_status}' (must be OK, FAIL, or DENY)`);
  }

  const row = {
    actor_profile_id: entry.actor_profile_id,
    event_name: entry.event_name,
    event_status: entry.event_status,
    entity_type: entry.entity_type,
    entity_id_uuid: entry.entity_id_uuid || null,
    entity_id_bigint: entry.entity_id_bigint || null,
    old_values: entry.old_values || null,
    new_values: entry.new_values || null,
    meta: entry.meta || null,
    actor_ip: entry.actor_ip || null,
    user_agent: entry.user_agent || null,
    request_id: entry.request_id || null,
  };

  const { data, error } = await supabaseClient
    .from("audit_logging")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[auditRepository] insertAuditLog error:", error);
    throw error;
  }

  return data;
}

module.exports = {
  getAuditLogs,
  getArchivedAuditLogs,
  getAuditLogsForExport,
  archiveOldLogs,
  insertAuditLog,
};
