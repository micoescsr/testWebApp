//hooks/useAuditLogs.js
import { useEffect, useState, useCallback, useRef } from "react";
import { getAuditLogs, exportAuditLogs } from "../api/auditApi";
import { getApiErrorMessage } from "../utils/apiError";
import { useApiResource } from "./useApiResource";

/**
 * useAuditLogs
 * ------------------
 * Fetches paginated audit logs from the backend.
 * Supports search, status filtering, date range, pagination, and CSV export.
 */
const useAuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const { loading, error, run } = useApiResource("Failed to load audit logs");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // '' | 'SUCCESS' | 'FAILED'
  const [fromDate, setFromDate] = useState("");          // YYYY-MM-DD
  const [toDate, setToDate] = useState("");              // YYYY-MM-DD

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const lastExportRef = useRef(0); // rate-limiting timestamp

  // Debounce timer ref for search
  const debounceRef = useRef(null);

  const fetchAuditLogs = useCallback(
    (overrides = {}) => {
      const params = {
        page: overrides.page ?? page,
        limit,
        search: overrides.search ?? search,
        status: overrides.status ?? statusFilter,
        startDate: overrides.fromDate ?? fromDate,
        endDate: overrides.toDate ?? toDate,
      };

      return run(
        async () => {
          const res = await getAuditLogs(params);
          const data = res.data;

          setLogs(data.logs || []);
          setTotal(data.total || 0);

          // Sync page in case backend clamped it
          if (data.page) setPage(data.page);
        },
        {
          onError: (err) => {
            console.error("Fetch audit logs error:", err);
            setLogs([]);
            setTotal(0);
          },
        }
      );
    },
    [page, limit, search, statusFilter, fromDate, toDate, run]
  );

  // Auto-fetch on mount and when page/statusFilter/dates change
  useEffect(() => {
    fetchAuditLogs();
  }, [page, statusFilter, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleFromDate = useCallback((value) => {
    setFromDate(value);
    setPage(1);
  }, []);

  const handleToDate = useCallback((value) => {
    setToDate(value);
    setPage(1);
  }, []);

  /**
   * Export audit logs as CSV.
   * Rate-limited to one export every 5 seconds.
   * Accepts optional date overrides from the export modal.
   * Returns true on success, false on failure.
   */
  const handleExport = useCallback(async (exportFromDate, exportToDate) => {
    const effectiveFrom = exportFromDate || fromDate;
    const effectiveTo = exportToDate || toDate;

    // Rate limiting: 5-second cooldown
    const now = Date.now();
    if (now - lastExportRef.current < 5000) {
      setExportError("Please wait a few seconds before exporting again.");
      return false;
    }

    // Require at least a date range
    if (!effectiveFrom || !effectiveTo) {
      setExportError("Please select both a start and end date before exporting.");
      return false;
    }

    // Validate date order
    if (new Date(effectiveFrom) > new Date(effectiveTo)) {
      setExportError("Start date cannot be after end date.");
      return false;
    }

    try {
      setIsExporting(true);
      setExportError(null);
      lastExportRef.current = now;

      const res = await exportAuditLogs({
        from: effectiveFrom,
        to: effectiveTo,
        status: statusFilter,
      });

      // Create blob download
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `audit_logs_${effectiveFrom}_${effectiveTo}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return true;
    } catch (err) {
      console.error("Export audit logs error:", err);
      setExportError(getApiErrorMessage(err, "Failed to export audit logs"));
      return false;
    } finally {
      setIsExporting(false);
    }
  }, [fromDate, toDate, statusFilter]);

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
    fromDate,
    toDate,

    // export state
    isExporting,
    exportError,

    // actions
    fetchAuditLogs,
    handleSearch,
    handleStatusFilter,
    handleFromDate,
    handleToDate,
    handleExport,
    goToPage,
    setPage,
  };
};

export default useAuditLogs;
