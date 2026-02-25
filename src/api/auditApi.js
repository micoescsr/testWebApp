// src/api/auditApi.js
import api from "./axios";

/**
 * GET audit logs with pagination + filtering.
 * Only accessible by superadmins (server enforces).
 *
 * @param {Object}  params
 * @param {number}  params.page   - 1-based page (default 1)
 * @param {number}  params.limit  - rows per page (default 25, max 100)
 * @param {string}  params.search - free-text search
 * @param {string}  params.status - 'SUCCESS' | 'FAILED' | '' (all)
 * @returns {{ logs, total, page, limit }}
 */
export const getAuditLogs = ({
  page = 1,
  limit = 25,
  search = "",
  status = "",
} = {}) => {
  return api.get("audit/logs", {
    params: { page, limit, search, status },
  });
};
