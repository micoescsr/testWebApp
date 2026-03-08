import { useState, useEffect } from "react";
import { getVulnHistory, getThreatHistory } from "../api/samHistoryApi";

export const useSAMHistory = () => {
  const [vulnHistory, setVulnHistory] = useState([]);
  const [threatHistory, setThreatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);

        const [vulnRes, threatRes] = await Promise.all([
          getVulnHistory(),
          getThreatHistory(),
        ]);

        setVulnHistory(vulnRes.data);
        setThreatHistory(threatRes.data);
      } catch (err) {
        setError(err.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  return { vulnHistory, threatHistory, loading, error };
};
