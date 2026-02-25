//hooks/useAuditLogs.js
import { useEffect, useState, useCallback, useRef } from "react";
import { getAuditLogs } from "../api/auditApi";

/**
 * useAuditLogs
 * ------------------
 * Fetches paginated audit logs from the backend.
 * Supports search, status filtering, and pagination.
 */
const useAuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // '' | 'SUCCESS' | 'FAILED'

  // Debounce timer ref for search
  const debounceRef = useRef(null);

  const fetchAuditLogs = useCallback(
    async (overrides = {}) => {
      try {
        setLoading(true);
        setError(null);

        const params = {
          page: overrides.page ?? page,
          limit,
          search: overrides.search ?? search,
          status: overrides.status ?? statusFilter,
        };

        const res = await getAuditLogs(params);
        const data = res.data;

        setLogs(data.logs || []);
        setTotal(data.total || 0);

        // Sync page in case backend clamped it
        if (data.page) setPage(data.page);
      } catch (err) {
        console.error("Fetch audit logs error:", err);
        const msg =
          err.response?.data?.error || err.message || "Failed to load audit logs";
        setError(msg);
        setLogs([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [page, limit, search, statusFilter]
  );

  // Auto-fetch on mount and when page/statusFilter changes
  useEffect(() => {
    fetchAuditLogs();
  }, [page, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search handler (300ms)
  const handleSearch = useCallback(
    (value) => {
      setSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setPage(1); // reset to page 1 on new search
        fetchAuditLogs({ search: value, page: 1 });
      }, 300);
    },
    [fetchAuditLogs]
  );

  const handleStatusFilter = useCallback((status) => {
    setStatusFilter(status);
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const goToPage = useCallback(
    (p) => {
      const safePage = Math.max(1, Math.min(p, totalPages));
      setPage(safePage);
    },
    [totalPages]
  );

  return {
    logs,
    loading,
    error,
    total,
    page,
    limit,
    totalPages,
    search,
    statusFilter,

    // actions
    fetchAuditLogs,
    handleSearch,
    handleStatusFilter,
    goToPage,
    setPage,
  };
};

export default useAuditLogs;
