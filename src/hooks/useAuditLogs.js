//hooks/useAuditLogs.js
import { useEffect, useState } from "react";

/**
 * useAuditLogs
 * ------------------
 * MODEL layer for Audit Logs
 * - Responsible for fetching and shaping audit log data
 * - Currently uses mock data (no backend endpoint yet)
 * - API call can be added later without touching the View
 */
const useAuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Mock data (temporary)
  const mockAuditLogs = [
    {
      user: "JCruz",
      event: "LOGIN",
      date: "11/14/2025",
      time: "10:10 AM",
      module: "LOGIN",
      status: "FAILED",
    },
    {
      user: "CDalisay",
      event: "EDIT USER",
      date: "11/14/2025",
      time: "10:15 AM",
      module: "ACCOUNTS",
      status: "SUCCESS",
    },
  ];

  // Placeholder for future API call
  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      /**
       * TODO (future):
       * const res = await api.get("/audit/logs");
       * setLogs(res.data);
       */

      // Temporary: use mock data
      setLogs(mockAuditLogs);
    } catch (err) {
      console.error("Fetch audit logs error:", err);
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount (same pattern as useUsers)
  useEffect(() => {
    fetchAuditLogs();
  }, []);

  return {
    logs,
    loading,
    error,

    // exposed for future manual refresh
    fetchAuditLogs,
  };
};

export default useAuditLogs;
