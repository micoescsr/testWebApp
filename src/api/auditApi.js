// src/api/auditApi.js
import api from "./axios";

/**
 * GET audit logs with pagination + filtering.
 * Only accessible by superadmins (server enforces).
 *
 * @param {Object}  params
 * @param {number}  params.page      - 1-based page (default 1)
 * @param {number}  params.limit     - rows per page (default 25, max 100)
 * @param {string}  params.search    - free-text search
 * @param {string}  params.status    - 'SUCCESS' | 'FAILED' | '' (all)
 * @param {string}  params.startDate - ISO date range start (optional)
 * @param {string}  params.endDate   - ISO date range end (optional)
 * @returns {{ logs, total, page, limit }}
 */
export const getAuditLogs = ({
  page = 1,
  limit = 25,
  search = "",
  status = "",
  startDate = "",
  endDate = "",
  sort = "created_at",
  dir = "desc",
  eventCategory = "",
} = {}) => {
  return api.get("audit/logs", {
    params: { page, limit, search, status, startDate, endDate, sort, dir, eventCategory },
  });
};

/**
 * GET /api/audit/export — downloads audit logs as a CSV blob.
 * Only accessible by superadmins (server enforces).
 *
 * @param {Object}  params
 * @param {string}  params.from   - start date YYYY-MM-DD
 * @param {string}  params.to     - end date YYYY-MM-DD
 * @param {string}  params.status - 'SUCCESS' | 'FAILED' | '' (all)
 * @returns {Promise<Blob>} CSV file as a Blob response
 */
export const exportAuditLogs = ({ from = "", to = "", status = "" } = {}) => {
  return api.get("audit/export", {
    params: { from, to, status },
    responseType: "blob",
  });
};
