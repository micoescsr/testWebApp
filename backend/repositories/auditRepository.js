// repositories/auditRepository.js
const { supabaseClient } = require("../config/supabaseClient");

/**
 * Fetch audit logs with pagination, optional filtering, and actor profile join.
 *
 * Uses the `audit_logging` table (UUID-based, richer schema).
 * Joins `profiles` via `actor_profile_id` to get actor name/email.
 *
 * @param {Object}  opts
 * @param {number}  opts.page     - 1-based page number (default 1)
 * @param {number}  opts.limit    - rows per page, capped at 100 (default 25)
 * @param {string}  opts.search   - free-text search across event_name, entity_type, actor email
 * @param {string}  opts.status   - filter by event_status ('SUCCESS' | 'FAILED')
 * @param {string}  opts.sortBy   - column to sort ('created_at')
 * @param {string}  opts.sortDir  - 'asc' | 'desc' (default 'desc')
 * @returns {{ data: Array, total: number, page: number, limit: number }}
 */
async function getAuditLogs({
  page = 1,
  limit = 25,
  search = "",
  status = "",
  sortBy = "created_at",
  sortDir = "desc",
} = {}) {
  // Clamp limit to prevent abuse
  const safeLimit = Math.min(Math.max(1, Number(limit) || 25), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  // Whitelist sortable columns to prevent injection
  const ALLOWED_SORT_COLS = ["created_at", "event_name", "event_status", "entity_type"];
  const safeSortBy = ALLOWED_SORT_COLS.includes(sortBy) ? sortBy : "created_at";
  const safeSortDir = sortDir === "asc" ? true : false; // ascending = true

  // Build query — join profiles for actor info
  let query = supabaseClient
    .from("audit_logging")
    .select(
      `
      audit_log_id,
      created_at,
      actor_profile_id,
      actor_ip,
      user_agent,
      event_name,
      event_status,
      entity_type,
      entity_id_uuid,
      entity_id_bigint,
      old_values,
      new_values,
      meta,
      profiles!audit_logging_actor_profile_id_fkey (
        id,
        first_name,
        last_name,
        email,
        username
      )
    `,
      { count: "exact" }
    )
    .order(safeSortBy, { ascending: safeSortDir })
    .range(offset, offset + safeLimit - 1);

  // Apply status filter — map frontend labels to DB enum values
  const STATUS_FILTER_MAP = { SUCCESS: "OK", OK: "OK", FAILED: "FAIL", FAIL: "FAIL", DENIED: "DENY", DENY: "DENY" };
  if (status) {
    const dbVal = STATUS_FILTER_MAP[status.toUpperCase()];
    if (dbVal) {
      query = query.eq("event_status", dbVal);
    }
  }

  // Apply free-text search via ilike on multiple columns
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `event_name.ilike.${term},entity_type.ilike.${term}`
    );
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
 * Insert a new audit log entry.
 *
 * @param {Object} entry
 * @param {string} entry.actor_profile_id  - UUID of user performing the action
 * @param {string} entry.event_name        - e.g. 'USER_CREATE', 'USER_UPDATE', 'LOGIN'
 * @param {string} entry.event_status      - 'SUCCESS' | 'FAILED'
 * @param {string} entry.entity_type       - e.g. 'USER', 'NETWORK', 'SCAN'
 * @param {string} [entry.entity_id_uuid]  - UUID entity ref
 * @param {number} [entry.entity_id_bigint] - bigint entity ref
 * @param {Object} [entry.old_values]      - snapshot before change
 * @param {Object} [entry.new_values]      - snapshot after change
 * @param {Object} [entry.meta]            - extra context (user_agent, ip, etc.)
 * @param {string} [entry.actor_ip]        - IP address of actor
 * @param {string} [entry.user_agent]      - browser user agent
 * @param {string} [entry.request_id]      - correlation UUID for request tracing
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
  insertAuditLog,
};
